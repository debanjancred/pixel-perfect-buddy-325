import { readdirSync, readFileSync } from "node:fs";
import type { SupabaseClient } from "@supabase/supabase-js";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { ROLE_PERMISSIONS, type Permission } from "@/lib/permissions";
import { api } from "@/services/api";
import { createCloudAdapter, voucherPath } from "@/services/cloud/adapter";
import { cloudErrorKey, errorKey } from "@/services/cloud/errors";
import { ValidationError } from "@/lib/validation";
import { mergeSnapshot, snapshotCursor, type Snapshot } from "@/services/cloud/merge";
import { localAdapter, setSyncAdapter, type SyncAdapter, type SyncRecord } from "@/services/sync";
import type { ChandaTransaction, ClubMember, ExpenseRecord, UserRole } from "@/types/domain";
import { seedAsAdmin } from "./helpers";

beforeEach(() => localStorage.clear());
afterEach(() => setSyncAdapter(localAdapter));

// --- A fake Supabase client that records calls --------------------------------------------

type Call = { op: string; table?: string; args?: unknown };

function fakeClient(fail: (call: Call) => boolean = () => false) {
  const calls: Call[] = [];
  const result = (call: Call) => {
    calls.push(call);
    return Promise.resolve({ data: null, error: fail(call) ? { message: "err_forbidden" } : null });
  };
  const client = {
    from: (table: string) => ({
      insert: (args: unknown) => result({ op: "insert", table, args: { args } }),
      update: (args: unknown) => ({
        eq: (_col: string, id: string) => ({
          select: () =>
            result({ op: "update", table, args: { args, id } }).then((r) => ({
              ...r,
              data: r.error ? null : [{ id }],
            })),
        }),
      }),
    }),
    rpc: (fn: string, args: unknown) => result({ op: `rpc:${fn}`, args }),
    storage: {
      from: (bucket: string) => ({
        upload: (path: string, _blob: Blob) => result({ op: "upload", table: bucket, args: path }),
      }),
    },
  };
  return { client: client as unknown as SupabaseClient, calls };
}

const tx = (over: Partial<ChandaTransaction> = {}): ChandaTransaction => ({
  id: "t1",
  receipt_no: "PK-2026-C01-0001",
  club_id: "c1",
  household_id: "h1",
  amount: 501,
  payment_method: "cash",
  status: "collected",
  collector_id: "m1",
  created_at: "2026-10-17T00:00:00Z",
  updated_at: "2026-10-17T00:00:00Z",
  sync_status: "pending",
  ...over,
});

describe("cloud adapter", () => {
  it("inserts ledger rows idempotently and voids with a separate update", async () => {
    const { client, calls } = fakeClient();
    const adapter = createCloudAdapter(client, { loadVoucher: async () => null });
    const voided = tx({ id: "t2", status: "void", voided_at: "x", void_reason: "ভুল" });
    const results = await adapter.push([
      { kind: "chanda", record: tx() },
      { kind: "chanda", record: voided },
    ]);
    expect(results).toEqual([
      { id: "t1", ok: true },
      { id: "t2", ok: true },
    ]);
    const insert = calls[0]!.args as { args: Record<string, unknown> };
    expect(insert.args).not.toHaveProperty("sync_status"); // device-only field
    expect(calls.map((c) => c.op)).toEqual(["insert", "insert", "update"]);
    expect(calls[2]!.args).toEqual({
      args: { voided_at: "x", void_reason: "ভুল", status: "void" },
      id: "t2",
    });
  });

  it("counts an already-sent row (duplicate id) as synced, but not other duplicates", async () => {
    const dup = (constraint: string) => ({
      code: "23505",
      message: `duplicate key value violates unique constraint "${constraint}"`,
    });
    const client = {
      from: () => ({
        insert: (args: { id: string }) =>
          Promise.resolve({
            data: null,
            error: args.id === "t1" ? dup("chanda_transactions_pkey") : dup("households_phone_key"),
          }),
      }),
    } as unknown as SupabaseClient;
    const results = await createCloudAdapter(client, { loadVoucher: async () => null }).push([
      { kind: "chanda", record: tx() },
      { kind: "chanda", record: tx({ id: "t2" }) },
    ]);
    expect(results.map((r) => r.ok)).toEqual([true, false]);
  });

  it("creates clubs through create_club with the creator as admin", async () => {
    const { client, calls } = fakeClient();
    const admin = { id: "a1", name: "সম্পাদক" } as ClubMember;
    await createCloudAdapter(client, { loadVoucher: async () => null }).push([
      {
        kind: "club",
        admin,
        record: {
          id: "c1",
          slug: "s",
          name_bn: "ক্লাব",
          name_en: "ক্লাব",
          area_label: "",
          target_amount: 1000,
          puja_year: 2026,
          created_at: "",
        },
      },
    ]);
    expect(calls[0]).toMatchObject({
      op: "rpc:create_club",
      args: { p_id: "c1", p_creator_member_id: "a1", p_creator_name: "সম্পাদক" },
    });
  });

  it("uploads a device voucher photo to <club>/<expense>.jpg and stores that path", async () => {
    const { client, calls } = fakeClient();
    const expense = {
      id: "e1",
      club_id: "c1",
      voucher_image_id: "local-idb-key",
      sync_status: "pending",
    } as ExpenseRecord;
    await createCloudAdapter(client, {
      loadVoucher: async (id) =>
        id === "local-idb-key" ? new Blob(["x"], { type: "image/jpeg" }) : null,
    }).push([{ kind: "expense", record: expense }]);
    expect(calls[0]).toMatchObject({
      op: "upload",
      table: "vouchers",
      args: voucherPath("c1", "e1"),
    });
    expect((calls[1]!.args as { args: { voucher_image_id: string } }).args.voucher_image_id).toBe(
      "c1/e1.jpg",
    );
  });

  it("sends tally changes through register_event", async () => {
    const { client, calls } = fakeClient();
    await createCloudAdapter(client, { loadVoucher: async () => null }).push([
      { kind: "event_delta", record: { id: "d1", event_id: "ev1", delta: -1 } },
    ]);
    expect(calls[0]).toEqual({ op: "rpc:register_event", args: { p_event: "ev1", p_delta: -1 } });
  });

  it("isolates failures: a rejected record doesn't stop the rest", async () => {
    const { client } = fakeClient(
      (c) => c.op === "insert" && (c.args as { args: { id: string } }).args.id === "t1",
    );
    const results = await createCloudAdapter(client, { loadVoucher: async () => null }).push([
      { kind: "chanda", record: tx() },
      { kind: "chanda", record: tx({ id: "t2", receipt_no: "PK-2026-C01-0002" }) },
    ]);
    expect(results).toEqual([
      { id: "t1", ok: false, error: "err_forbidden" },
      { id: "t2", ok: true },
    ]);
  });
});

describe("cloud error keys", () => {
  it("names a missing dependency and passes the app's own validation errors through", () => {
    expect(cloudErrorKey({ code: "23503", message: "violates foreign key constraint" })).toBe(
      "err_syncDependency",
    );
    expect(errorKey(new ValidationError("device", "err_deviceLimit"))).toBe("err_deviceLimit");
    expect(errorKey(new TypeError("Failed to fetch"))).toBe("err_syncFailed");
  });

  it("passes the server's own i18n keys through and maps RLS refusals", () => {
    expect(cloudErrorKey({ message: "err_handoverTooMuch" })).toBe("err_handoverTooMuch");
    expect(cloudErrorKey({ code: "42501", message: "permission denied" })).toBe("err_forbidden");
    expect(
      cloudErrorKey({ message: 'new row violates row-level security policy for table "x"' }),
    ).toBe("err_forbidden");
    expect(cloudErrorKey({ message: "timeout" })).toBe("err_syncFailed");
    expect(cloudErrorKey(null)).toBeNull();
  });
});

describe("merging other devices' changes", () => {
  const empty = (): Snapshot => ({
    clubs: [],
    members: [],
    households: [],
    chanda: [],
    expenses: [],
    handovers: [],
    events: [],
  });
  const store = () => ({
    clubs: [],
    members: [],
    households: [],
    chanda: [] as ChandaTransaction[],
    expenses: [] as ExpenseRecord[],
    handovers: [],
    events: [{ id: "ev1", registrations_count: 5 }] as never[],
    outbox: [{ kind: "event_delta" as const, id: "d1", event_id: "ev1", delta: 1 as const }],
  });

  it("keeps unsent local records, takes the server's otherwise, marked synced", () => {
    const db = store();
    db.chanda.push(tx({ id: "mine", amount: 999, sync_status: "pending" }));
    db.chanda.push(tx({ id: "old", amount: 1, sync_status: "synced" }));
    const snap = empty();
    const { sync_status: _s, ...server } = tx({ amount: 100 });
    snap.chanda = [
      { ...server, id: "mine" },
      { ...server, id: "old", status: "void", voided_at: "x", void_reason: "ভুল" },
      { ...server, id: "new" },
    ];
    mergeSnapshot(db, snap);
    const byId = Object.fromEntries(db.chanda.map((c) => [c.id, c]));
    expect(byId["mine"]).toMatchObject({ amount: 999, sync_status: "pending" });
    expect(byId["old"]).toMatchObject({ status: "void", sync_status: "synced" });
    expect(byId["new"]).toMatchObject({ amount: 100, sync_status: "synced" });
  });

  it("keeps a voucher photo already on the device; tallies add unsent +1/−1", () => {
    const db = store();
    db.expenses.push({
      id: "e1",
      voucher_image_id: "local-key",
      sync_status: "synced",
    } as ExpenseRecord);
    const snap = empty();
    snap.expenses = [
      { id: "e1", voucher_image_id: "c1/e1.jpg", updated_at: "2026-10-17T10:00:00Z" } as never,
    ];
    snap.events = [
      { id: "ev1", registrations_count: 7, updated_at: "2026-10-17T11:00:00Z" } as never,
    ];
    mergeSnapshot(db, snap);
    expect(db.expenses[0]!.voucher_image_id).toBe("local-key");
    expect((db.events as { registrations_count: number }[])[0]!.registrations_count).toBe(8);
    expect(snapshotCursor(snap, "2026-10-17T09:00:00Z")).toBe("2026-10-17T11:00:00Z");
  });
});

describe("outbox", () => {
  async function realClub() {
    await api.createClub({
      name: "আসল ক্লাব",
      para: "লেন ১",
      zone: "",
      puja_year: 2026,
      target_amount: 100000,
      creator_name: "সম্পাদক ০১",
      creator_phone: "9000000101",
    });
  }
  const recorder = () => {
    const sent: SyncRecord[] = [];
    const adapter: SyncAdapter = {
      push: async (recs) => {
        sent.push(...recs);
        return recs.map((r) => ({ id: r.record.id, ok: true }));
      },
    };
    return { sent, adapter };
  };

  it("queues club, member, household and event changes in dependency order", async () => {
    await realClub();
    await api.createMember({ name: "কর্মী ০২", phone: "9000000102", role: "collector" });
    await api.createHousehold({
      resident_name: "আবাসিক ০১",
      house_flat_no: "1",
      lane_block: "লেন ১",
    });
    expect((await api.getSyncStatus()).pending).toBe(3);
    const { sent, adapter } = recorder();
    setSyncAdapter(adapter);
    await api.sync();
    expect(sent.map((s) => s.kind)).toEqual(["club", "member", "household"]);
    expect(await api.getSyncStatus()).toEqual({ pending: 0, failed: 0 });
  });

  it("never sends the sample club", async () => {
    await seedAsAdmin();
    await api.createHousehold({ resident_name: "নতুন", house_flat_no: "9", lane_block: "ব্লক এ" });
    const { sent, adapter } = recorder();
    setSyncAdapter(adapter);
    await api.sync();
    expect(sent).toEqual([]);
  });

  it("keeps a failed change queued and marks it failed", async () => {
    await realClub();
    setSyncAdapter({ push: async (recs) => recs.map((r) => ({ id: r.record.id, ok: false })) });
    expect(await api.sync()).toEqual({ synced: 0, failed: 1 });
    expect(await api.getSyncStatus()).toEqual({ pending: 0, failed: 1 });
    setSyncAdapter(localAdapter);
    expect(await api.sync()).toEqual({ synced: 1, failed: 0 });
  });
});

describe("server permissions match src/lib/permissions.ts", () => {
  it("the SQL can() function grants exactly ROLE_PERMISSIONS", () => {
    // The newest definition wins: later migrations replace can().
    const dir = "supabase/migrations";
    const sql = readdirSync(dir)
      .sort()
      .map((f) => readFileSync(`${dir}/${f}`, "utf8"))
      .filter((s) => /function public\.can\(/.test(s))
      .at(-1)!;
    const start = sql.search(/function public\.can\(/);
    const body = sql.slice(start, sql.indexOf("$$;", start));
    const rules = [...body.matchAll(/when '([\w.]+)' then (.+)/g)].map(([, perm, expr]) => ({
      perm: perm as Permission,
      roles: (["admin", "treasurer", "collector"] as UserRole[]).filter((role) =>
        expr!.trim() === "true" ? true : new RegExp(`'${role}'`).test(expr!),
      ),
    }));
    const fromSql = Object.fromEntries(
      (["admin", "treasurer", "collector"] as UserRole[]).map((role) => [
        role,
        rules
          .filter((r) => r.roles.includes(role))
          .map((r) => r.perm)
          .sort(),
      ]),
    );
    const fromTs = Object.fromEntries(
      Object.entries(ROLE_PERMISSIONS).map(([role, perms]) => [role, [...perms].sort()]),
    );
    expect(fromSql).toEqual(fromTs);
  });
});

describe("cloud adapter: refused updates", () => {
  it("treats an update that changed no row (hidden by RLS) as a failure", async () => {
    const calls: string[] = [];
    const client = {
      from: () => ({
        insert: () => Promise.resolve({ data: null, error: null }),
        update: () => ({
          eq: () => ({
            select: () => {
              calls.push("update");
              return Promise.resolve({ data: [], error: null }); // RLS: zero rows, no error
            },
          }),
        }),
      }),
    } as unknown as SupabaseClient;
    const voided = tx({ status: "void", voided_at: "x", void_reason: "ভুল" });
    const results = await createCloudAdapter(client, { loadVoucher: async () => null }).push([
      { kind: "chanda", record: voided },
    ]);
    expect(calls).toEqual(["update"]);
    expect(results).toEqual([{ id: "t1", ok: false, error: "err_forbidden" }]);
  });
});
