// @vitest-environment node
// End-to-end: the app's cloud adapter, pull and merge against the real schema and RLS via
// PostgREST + supabase-js. Runs only through supabase/tests/integration.sh (which sets
// PK_PGRST_URL / PK_JWT_SECRET); skipped in the normal test run.
import { createHmac, randomUUID } from "node:crypto";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createCloudAdapter } from "@/services/cloud/adapter";
import { mergeSnapshot } from "@/services/cloud/merge";
import {
  listDevices,
  removeDevice,
  resetCollectDevice,
  setCollectDevice,
  touchDevice,
} from "@/services/cloud/devices";
import { fetchClubSnapshot, fetchMyClubs, fetchPublicAccounts } from "@/services/cloud/pull";
import type { SyncRecord } from "@/services/sync";
import type { ChandaTransaction, ClubMember } from "@/types/domain";

const PGRST = process.env["PK_PGRST_URL"];
const SECRET = process.env["PK_JWT_SECRET"] ?? "";

const b64 = (v: object | string) =>
  Buffer.from(typeof v === "string" ? v : JSON.stringify(v)).toString("base64url");
function jwt(claims: object) {
  const head = b64({ alg: "HS256", typ: "JWT" });
  const body = b64({ exp: Math.floor(Date.now() / 1000) + 3600, ...claims });
  const sig = createHmac("sha256", SECRET).update(`${head}.${body}`).digest("base64url");
  return `${head}.${body}.${sig}`;
}

describe.skipIf(!PGRST)("cloud sync against PostgreSQL + PostgREST", () => {
  let proxy: Server;
  let url = "";
  const anonKey = () => jwt({ role: "anon" });
  const as = (phone: string | null): SupabaseClient =>
    createClient(url, anonKey(), {
      auth: { persistSession: false, autoRefreshToken: false },
      global: {
        headers: phone
          ? { Authorization: `Bearer ${jwt({ role: "authenticated", phone: `91${phone}` })}` }
          : {},
      },
    });

  beforeAll(async () => {
    // supabase-js talks to <url>/rest/v1; PostgREST serves at its root.
    proxy = createServer((req, res) => {
      const target = new URL(req.url!.replace(/^\/rest\/v1/, ""), PGRST);
      const chunks: Buffer[] = [];
      req.on("data", (c) => chunks.push(c));
      req.on("end", async () => {
        const headers = Object.fromEntries(
          Object.entries(req.headers).filter(([k]) => !["host", "content-length"].includes(k)),
        ) as Record<string, string>;
        const r = await fetch(target, {
          method: req.method ?? "GET",
          headers,
          body: ["GET", "HEAD"].includes(req.method!) ? null : Buffer.concat(chunks),
        });
        res.writeHead(r.status, Object.fromEntries(r.headers));
        res.end(Buffer.from(await r.arrayBuffer()));
      });
    });
    await new Promise<void>((ok) => proxy.listen(0, ok));
    url = `http://localhost:${(proxy.address() as AddressInfo).port}`;
  });
  afterAll(() => new Promise<void>((ok) => proxy.close(() => ok())));

  const noVoucher = { loadVoucher: async () => null };
  const ids = { club: randomUUID(), admin: randomUUID(), treas: randomUUID(), coll: randomUUID() };
  const PHONE = { admin: "9000000201", treas: "9000000202", coll: "9000000203" };
  const member = (
    id: string,
    role: ClubMember["role"],
    phone: string,
    code: string,
  ): ClubMember => ({
    id,
    club_id: ids.club,
    name: `${role} ০১`,
    role,
    phone,
    collector_code: code,
    created_at: new Date().toISOString(),
  });
  const household = {
    id: randomUUID(),
    club_id: ids.club,
    lane_block: "ব্লক এ",
    house_flat_no: "101",
    resident_name: "আবাসিক ০১",
    created_at: new Date().toISOString(),
  };
  const chanda = (over: Partial<ChandaTransaction>): ChandaTransaction => ({
    id: randomUUID(),
    receipt_no: "PK-2026-C01-0001",
    club_id: ids.club,
    household_id: household.id,
    amount: 1001,
    payment_method: "cash",
    status: "collected",
    collector_id: ids.coll,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    sync_status: "pending",
    ...over,
  });
  const push = (client: SupabaseClient, items: SyncRecord[]) =>
    createCloudAdapter(client, noVoucher).push(items);

  it("an offline-created club, its members and a household reach the server in order", async () => {
    const admin = member(ids.admin, "admin", PHONE.admin, "A01");
    const results = await push(as(PHONE.admin), [
      {
        kind: "club",
        admin,
        record: {
          id: ids.club,
          slug: "integration-club-2026",
          name_bn: "ইন্টিগ্রেশন ক্লাব",
          name_en: "ইন্টিগ্রেশন ক্লাব",
          area_label: "ব্লক এ",
          target_amount: 100000,
          puja_year: 2026,
          created_at: new Date().toISOString(),
        },
      },
      { kind: "member", record: member(ids.treas, "treasurer", PHONE.treas, "T01") },
      { kind: "member", record: member(ids.coll, "collector", PHONE.coll, "C01") },
      { kind: "household", record: household },
    ]);
    expect(results.every((r) => r.ok)).toBe(true);
  });

  it("a collector's chanda syncs; a retry doesn't duplicate; spending is refused", async () => {
    const c = chanda({});
    const coll = as(PHONE.coll);
    expect(await push(coll, [{ kind: "chanda", record: c }])).toEqual([{ id: c.id, ok: true }]);
    expect(await push(coll, [{ kind: "chanda", record: c }])).toEqual([{ id: c.id, ok: true }]);
    const { data } = await coll.from("chanda_transactions").select("id").eq("id", c.id);
    expect(data).toHaveLength(1);
    const [expense] = await push(coll, [
      {
        kind: "expense",
        record: {
          id: randomUUID(),
          club_id: ids.club,
          category: "misc",
          title: "চা",
          amount: 50,
          paid_to: "দোকান",
          authorized_by_id: ids.treas,
          date: new Date().toISOString().slice(0, 10),
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          sync_status: "pending",
        },
      },
    ]);
    expect(expense!.ok).toBe(false);
  });

  it("only a treasurer's void goes through, and only once", async () => {
    const c = chanda({ receipt_no: "PK-2026-C01-0002", amount: 501 });
    await push(as(PHONE.coll), [{ kind: "chanda", record: c }]);
    const voided = {
      ...c,
      status: "void" as const,
      voided_at: new Date().toISOString(),
      void_reason: "ভুল এন্ট্রি",
    };
    expect((await push(as(PHONE.coll), [{ kind: "chanda", record: voided }]))[0]!.ok).toBe(false);
    expect((await push(as(PHONE.treas), [{ kind: "chanda", record: voided }]))[0]!.ok).toBe(true);
    const { data } = await as(PHONE.treas)
      .from("chanda_transactions")
      .select("status")
      .eq("id", c.id)
      .single();
    expect(data).toEqual({ status: "void" });
  });

  it("handovers respect the outstanding cash; event tallies are atomic", async () => {
    const treas = as(PHONE.treas);
    const handover = (amount: number) => ({
      id: randomUUID(),
      club_id: ids.club,
      collector_id: ids.coll,
      received_by_id: ids.treas,
      amount,
      created_at: new Date().toISOString(),
      sync_status: "pending" as const,
    });
    expect((await push(treas, [{ kind: "handover", record: handover(1002) }]))[0]!.ok).toBe(false);
    expect((await push(treas, [{ kind: "handover", record: handover(1001) }]))[0]!.ok).toBe(true);

    const event = {
      id: randomUUID(),
      club_id: ids.club,
      title_bn: "বসে আঁকো",
      title_en: "Sit & Draw",
      date: "2026-10-20",
      registrations_count: 0,
      created_at: new Date().toISOString(),
    };
    expect((await push(as(PHONE.admin), [{ kind: "event", record: event }]))[0]!.ok).toBe(true);
    const deltas: SyncRecord[] = [1, 1, -1, 1].map((d) => ({
      kind: "event_delta",
      record: { id: randomUUID(), event_id: event.id, delta: d as 1 | -1 },
    }));
    expect((await push(as(PHONE.coll), deltas)).every((r) => r.ok)).toBe(true);
    const { data } = await as(PHONE.coll)
      .from("club_events")
      .select("registrations_count")
      .eq("id", event.id)
      .single();
    expect(data).toEqual({ registrations_count: 2 });
  });

  it("only an admin edits or deletes an event; a delete reaches other devices", async () => {
    const event = {
      id: randomUUID(),
      club_id: ids.club,
      title_bn: "শঙ্খ বাজানো",
      title_en: "শঙ্খ বাজানো",
      date: "2026-10-21",
      registrations_count: 0,
      created_at: new Date().toISOString(),
    };
    expect((await push(as(PHONE.admin), [{ kind: "event", record: event }]))[0]!.ok).toBe(true);
    const renamed = { ...event, title_bn: "শঙ্খধ্বনি", title_en: "শঙ্খধ্বনি" };
    const [refused] = await push(as(PHONE.coll), [{ kind: "event_update", record: renamed }]);
    expect(refused).toMatchObject({ ok: false, error: "err_forbidden" });
    expect((await push(as(PHONE.admin), [{ kind: "event_update", record: renamed }]))[0]!.ok).toBe(
      true,
    );
    const deleted = { ...renamed, deleted_at: new Date().toISOString() };
    expect((await push(as(PHONE.admin), [{ kind: "event_update", record: deleted }]))[0]!.ok).toBe(
      true,
    );
    // Another member's pull sees the change (soft delete), so their app hides it.
    const snap = await fetchClubSnapshot(as(PHONE.treas), ids.club);
    const pulled = snap.events.find((e) => e.id === event.id);
    expect(pulled?.title_bn).toBe("শঙ্খধ্বনি");
    expect(pulled?.deleted_at).toBeTruthy();
  });

  it("another device pulls the club and merges it into an empty store", async () => {
    const coll = as(PHONE.coll);
    const db = {
      clubs: [],
      members: [],
      households: [],
      chanda: [],
      expenses: [],
      handovers: [],
      events: [],
    };
    mergeSnapshot(db, await fetchMyClubs(coll));
    mergeSnapshot(db, await fetchClubSnapshot(coll, ids.club));
    expect(db.clubs).toHaveLength(1);
    expect(db.members).toHaveLength(3);
    expect(db.chanda.map((c: ChandaTransaction) => c.sync_status)).toEqual(["synced", "synced"]);
    expect(db.handovers).toHaveLength(1);
    // Incremental: nothing new since the latest updated_at.
    const latest = [...db.chanda, ...db.handovers, ...db.events, ...db.members]
      .map((r: { updated_at?: string; created_at: string }) => r.updated_at ?? r.created_at)
      .sort()
      .at(-1);
    const again = await fetchClubSnapshot(coll, ids.club, latest);
    expect(again.chanda).toHaveLength(0);
    // A stranger sees nothing.
    expect((await fetchMyClubs(as("9000000999"))).clubs).toHaveLength(0);
  });

  it("anyone can open the public accounts by slug — totals only", async () => {
    const pub = await fetchPublicAccounts(as(null), "integration-club-2026");
    expect(pub?.summary).toMatchObject({
      total_collected: 1001,
      total_expenses: 0,
      net_balance: 1001,
    });
    expect(JSON.stringify(pub)).not.toMatch(/9000000|আবাসিক/);
  });

  // Last: its chanda would change the totals checked above.
  it("devices: 3 per person, one collects; chanda from another device is flagged", async () => {
    const coll = as(PHONE.coll);
    const [phone, laptop, tablet, fourth] = [
      randomUUID(),
      randomUUID(),
      randomUUID(),
      randomUUID(),
    ];
    expect(await touchDevice(coll, phone, "Android · Chrome", true)).toMatchObject({
      status: "active",
      is_collect: true,
    });
    await touchDevice(coll, laptop, "Mac · Chrome", true);
    await touchDevice(coll, tablet, "iPad · Safari", true);
    await expect(touchDevice(coll, fourth, "Windows · Edge", true)).rejects.toMatchObject({
      key: "err_deviceLimit",
    });
    expect((await listDevices(coll)).map((d) => d.label)).toEqual([
      "Android · Chrome",
      "Mac · Chrome",
      "iPad · Safari",
    ]);

    const [fromPhone, fromLaptop] = [
      chanda({ receipt_no: "PK-2026-C01-0101", amount: 5, device_id: phone }),
      chanda({ receipt_no: "PK-2026-C01-0102", amount: 5, device_id: laptop }),
    ];
    await push(coll, [
      { kind: "chanda", record: fromPhone },
      { kind: "chanda", record: fromLaptop },
    ]);
    const { data } = await coll
      .from("chanda_transactions")
      .select("id, off_device")
      .in("id", [fromPhone.id, fromLaptop.id]);
    expect(Object.fromEntries(data!.map((r) => [r.id, r.off_device]))).toEqual({
      [fromPhone.id]: false,
      [fromLaptop.id]: true,
    });

    expect(await setCollectDevice(coll, laptop)).toMatchObject({ is_collect: true });
    await removeDevice(coll, tablet);
    expect(await touchDevice(coll, tablet, "iPad · Safari", false)).toEqual({ status: "removed" });
    await resetCollectDevice(as(PHONE.admin), ids.coll);
    expect((await listDevices(coll)).some((d) => d.is_collect)).toBe(false);
    await expect(resetCollectDevice(coll, ids.coll)).rejects.toMatchObject({
      key: "err_forbidden",
    });
  });
});
