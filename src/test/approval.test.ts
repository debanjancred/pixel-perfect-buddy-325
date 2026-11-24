import type { SupabaseClient } from "@supabase/supabase-js";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { cashByCollector, computeSummary } from "@/lib/accounts";
import { expenseLocked } from "@/lib/expense-lock";
import { ValidationError } from "@/lib/validation";
import { api } from "@/services/api";
import { createCloudAdapter } from "@/services/cloud/adapter";
import { session } from "@/services/session";
import { localAdapter, setSyncAdapter, type SyncRecord } from "@/services/sync";
import type { UserRole } from "@/types/domain";

beforeEach(() => localStorage.clear());
afterEach(() => setSyncAdapter(localAdapter));

const keyOf = (p: Promise<unknown>) =>
  p.then(
    () => null,
    (e: ValidationError) => e.key,
  );

async function actAs(role: UserRole) {
  const m = (await api.listMembers()).find((x) => x.role === role)!;
  session.set({ mode: "demo", member_id: m.id });
  return m;
}

async function setup() {
  await api.seedDemo();
  return { summary: await api.getSummary() };
}

async function addChanda(amount = 700) {
  const me = await actAs("collector");
  const household = (await api.listHouseholds())[0]!;
  return api.createChanda({
    id: crypto.randomUUID(),
    household_id: household.id,
    amount,
    payment_method: "cash",
    status: "collected",
    collector_id: me.id,
  });
}

async function addExpense(role: UserRole = "treasurer") {
  const me = await actAs(role);
  return api.createExpense({
    id: crypto.randomUUID(),
    category: "bhog",
    title: "Rice",
    amount: 400,
    paid_to: "Shop 01",
    authorized_by_id: me.id,
    date: "2026-10-12",
  });
}

const editOf = (authorized_by_id: string) => ({
  category: "bhog" as const,
  category_name: null,
  title: "Rice and dal",
  amount: 450,
  paid_to: "Shop 01",
  authorized_by_id,
  date: "2026-10-12",
});

describe("new entries", () => {
  it("wait for the admin, unless the admin wrote them", async () => {
    await setup();
    expect((await addChanda()).approval_status).toBe("pending");
    expect((await addExpense("treasurer")).approval_status).toBe("pending");
    const admin = (await api.listMembers()).find((m) => m.role === "admin")!;
    expect(await addExpense("admin")).toMatchObject({
      approval_status: "approved",
      reviewed_by_id: admin.id,
    });
  });

  it("still get a receipt number straight away", async () => {
    await setup();
    expect((await addChanda()).receipt_no).toBeTruthy();
  });

  it("stay out of the totals until approved, shown as waiting", async () => {
    const { summary } = await setup();
    const c = await addChanda(700);
    let s = await api.getSummary();
    expect(s.total_collected).toBe(summary.total_collected);
    expect(s.waiting_collected).toBe(700);
    await actAs("admin");
    await api.reviewEntries([{ kind: "chanda", id: c.id }], "approved");
    s = await api.getSummary();
    expect(s.total_collected).toBe(summary.total_collected + 700);
    expect(s.waiting_collected).toBe(0);
  });

  it("count as cash in hand while waiting, but not once rejected", async () => {
    await setup();
    const c = await addChanda(700);
    const held = async () =>
      cashByCollector(
        await api.listMembers(),
        await api.listChanda(),
        await api.listHandovers(),
      ).find((r) => r.member_id === c.collector_id)!.outstanding;
    const withEntry = await held();
    await actAs("admin");
    await api.reviewEntries([{ kind: "chanda", id: c.id }], "rejected", "Wrong house");
    expect(await held()).toBe(withEntry - 700);
  });
});

describe("reviewing", () => {
  it("is admin only, and a rejection needs a reason", async () => {
    await setup();
    const c = await addChanda();
    const ref = [{ kind: "chanda" as const, id: c.id }];
    await actAs("treasurer");
    expect(await keyOf(api.reviewEntries(ref, "approved"))).toBe("err_forbidden");
    await actAs("admin");
    expect(await keyOf(api.reviewEntries(ref, "rejected", " "))).toBe("err_rejectReason");
  });

  it("is final, and repeating the same decision is harmless", async () => {
    await setup();
    const c = await addChanda();
    const ref = [{ kind: "chanda" as const, id: c.id }];
    await actAs("admin");
    await api.reviewEntries(ref, "approved");
    await api.reviewEntries(ref, "approved");
    expect(await keyOf(api.reviewEntries(ref, "rejected", "Too late"))).toBe("err_alreadyReviewed");
  });

  it("approves several together, or none", async () => {
    await setup();
    const a = await addChanda(100);
    const b = await addChanda(200);
    await actAs("admin");
    const refs = [
      { kind: "chanda" as const, id: a.id },
      { kind: "chanda" as const, id: "missing" },
    ];
    expect(await keyOf(api.reviewEntries(refs, "approved"))).toBe("err_notFound");
    expect((await api.listApprovals()).map((i) => i.record.id)).toContain(a.id);
    await api.reviewEntries(
      [
        { kind: "chanda", id: a.id },
        { kind: "chanda", id: b.id },
      ],
      "approved",
    );
    expect(await api.listApprovals()).toEqual([]);
  });

  it("keeps a rejected receipt number out of reuse", async () => {
    await setup();
    const c = await addChanda();
    await actAs("admin");
    await api.reviewEntries([{ kind: "chanda", id: c.id }], "rejected", "Wrong house");
    const next = await addChanda();
    expect(next.receipt_no).not.toBe(c.receipt_no);
  });
});

describe("voids", () => {
  it("by a treasurer are a request; the entry counts until the admin decides", async () => {
    const e = await (async () => {
      await setup();
      return addExpense("admin");
    })();
    const before = (await api.getSummary()).total_expenses;
    await actAs("treasurer");
    const req = await api.voidExpense(e.id, "Duplicate bill");
    expect(req.voided_at).toBeFalsy();
    expect(req.void_request_reason).toBe("Duplicate bill");
    expect((await api.getSummary()).total_expenses).toBe(before);
    expect(await keyOf(api.voidExpense(e.id, "Again please"))).toBe("err_voidRequested");

    await actAs("admin");
    expect((await api.listApprovals()).find((i) => i.record.id === e.id)?.action).toBe("void");
    await api.approveVoid({ kind: "expense", id: e.id });
    const after = (await api.listExpenses()).find((x) => x.id === e.id)!;
    expect(after).toMatchObject({ void_reason: "Duplicate bill" });
    expect(after.voided_at).toBeTruthy();
    expect((await api.getSummary()).total_expenses).toBe(before - 400);
  });

  it("can be declined with a reason, then asked for again", async () => {
    await setup();
    const e = await addExpense("admin");
    await actAs("treasurer");
    await api.voidExpense(e.id, "Duplicate bill");
    await actAs("admin");
    const ref = { kind: "expense" as const, id: e.id };
    expect(await keyOf(api.declineVoid(ref, ""))).toBe("err_rejectReason");
    await api.declineVoid(ref, "Bill is right");
    const row = (await api.listExpenses()).find((x) => x.id === e.id)!;
    expect(row.voided_at).toBeFalsy();
    expect(row.void_requested_at).toBeNull();
    expect(row.void_declined_reason).toBe("Bill is right");
    await actAs("treasurer");
    expect((await api.voidExpense(e.id, "Looked again")).void_requested_at).toBeTruthy();
  });

  it("by an admin take effect at once; rejected entries can't be voided", async () => {
    await setup();
    const c = await addChanda();
    const d = await addChanda();
    await actAs("admin");
    expect((await api.voidChanda(c.id, "Wrong entry")).status).toBe("void");
    await api.reviewEntries([{ kind: "chanda", id: d.id }], "rejected", "Wrong house");
    expect(await keyOf(api.voidChanda(d.id, "Wrong entry"))).toBe("err_entryRejected");
  });
});

describe("expense edits", () => {
  it("by a treasurer wait again; by an admin count as approved", async () => {
    await setup();
    const e = await addExpense("admin");
    const treasurer = await actAs("treasurer");
    const edited = await api.updateExpense(e.id, editOf(treasurer.id));
    expect(edited).toMatchObject({ approval_status: "pending", reviewed_by_id: null });
    const admin = await actAs("admin");
    expect(await api.updateExpense(e.id, editOf(admin.id))).toMatchObject({
      approval_status: "approved",
      reviewed_by_id: admin.id,
    });
  });

  it("are refused once rejected", async () => {
    await setup();
    const e = await addExpense("treasurer");
    const admin = await actAs("admin");
    await api.reviewEntries([{ kind: "expense", id: e.id }], "rejected", "No bill");
    expect(await keyOf(api.updateExpense(e.id, editOf(admin.id)))).toBe("err_entryRejected");
  });

  it("aren't locked by a rejected handover", async () => {
    await setup();
    const e = await addExpense("treasurer");
    const h = {
      id: "h1",
      club_id: e.club_id,
      collector_id: "m9",
      received_by_id: e.recorded_by_id!,
      amount: 1,
      created_at: "2999-01-01T00:00:00Z",
      sync_status: "synced" as const,
    };
    expect(expenseLocked(e, [h])).toBe(true);
    expect(
      expenseLocked(e, [{ ...h, approval_status: "rejected", rejection_reason: "No cash" }]),
    ).toBe(false);
  });
});

describe("totals", () => {
  it("treat entries without a status as approved", () => {
    const s = computeSummary(
      null,
      [],
      [
        {
          id: "e1",
          club_id: "c1",
          category: "bhog",
          title: "x",
          amount: 50,
          paid_to: "y",
          authorized_by_id: "m1",
          date: "2026-10-12",
          created_at: "",
          updated_at: "",
          sync_status: "synced",
        },
      ],
    );
    expect(s.total_expenses).toBe(50);
  });
});

describe("syncing", () => {
  function fake() {
    const calls: { op: string; patch?: Record<string, unknown> }[] = [];
    const client = {
      from: () => ({
        insert: (patch: Record<string, unknown>) => {
          calls.push({ op: "insert", patch });
          return Promise.resolve({ error: { code: "23505", message: "x_pkey" } });
        },
        update: (patch: Record<string, unknown>) => ({
          eq: (_c: string, id: string) => ({
            select: () => {
              calls.push({ op: "update", patch });
              return Promise.resolve({ data: [{ id }], error: null });
            },
          }),
        }),
      }),
    };
    const adapter = createCloudAdapter(client as unknown as SupabaseClient, {
      loadVoucher: () => Promise.resolve(null),
    });
    return { adapter, calls };
  }
  const expense = {
    id: "e1",
    club_id: "c1",
    category: "bhog" as const,
    title: "x",
    amount: 50,
    paid_to: "y",
    authorized_by_id: "m1",
    date: "2026-10-12",
    created_at: "",
    updated_at: "",
    edited_at: "2026-10-13T00:00:00+00:00",
    sync_status: "pending" as const,
  };
  const push = async (record: SyncRecord["record"], kind: "expense" = "expense") => {
    const { adapter, calls } = fake();
    const [r] = await adapter.push([{ kind, record } as SyncRecord]);
    expect(r!.ok).toBe(true);
    return calls.filter((c) => c.op === "update").map((c) => c.patch!);
  };

  it("never sends the device-only list of unsent changes", async () => {
    const { adapter, calls } = fake();
    await adapter.push([
      { kind: "expense", record: { ...expense, pending_ops: ["edit"] } } as SyncRecord,
    ]);
    expect(calls[0]!.patch).not.toHaveProperty("pending_ops");
    expect(calls[0]!.patch).not.toHaveProperty("sync_status");
  });

  it("sends a review with the version the admin saw, and not an older edit", async () => {
    const patches = await push({
      ...expense,
      approval_status: "approved",
      pending_ops: ["review"],
    });
    expect(patches).toEqual([
      { edited_at: expense.edited_at, approval_status: "approved", rejection_reason: null },
    ]);
  });

  it("sends a void request without re-sending an edit already on the server", async () => {
    const patches = await push({
      ...expense,
      void_requested_at: "2026-10-14T00:00:00Z",
      void_request_reason: "Duplicate",
      pending_ops: ["void_request"],
    });
    expect(patches).toEqual([
      { void_requested_at: "2026-10-14T00:00:00Z", void_request_reason: "Duplicate" },
    ]);
  });

  it("sends a decline as clearing the request, with the reason", async () => {
    const patches = await push({
      ...expense,
      void_requested_at: null,
      void_declined_reason: "Bill is right",
      pending_ops: ["void_decline"],
    });
    expect(patches).toEqual([{ void_requested_at: null, void_declined_reason: "Bill is right" }]);
  });

  it("still sends an edit queued before the app tracked unsent changes", async () => {
    const patches = await push(expense);
    expect(patches[0]).toMatchObject({ amount: 50, edited_at: expense.edited_at });
  });

  it("clears the unsent changes once pushed", async () => {
    await setup();
    const e = await addExpense("admin");
    await actAs("treasurer");
    await api.voidExpense(e.id, "Duplicate bill");
    await api.sync();
    const row = (await api.listExpenses()).find((x) => x.id === e.id)!;
    expect(row.pending_ops).toBeUndefined();
    expect(row.sync_status).toBe("synced");
  });
});
