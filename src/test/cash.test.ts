import { beforeEach, describe, expect, it } from "vitest";

import { cashByCollector } from "@/lib/accounts";
import { ValidationError } from "@/lib/validation";
import { api } from "@/services/api";
import { session } from "@/services/session";
import type { CashHandover, ChandaTransaction, ClubMember } from "@/types/domain";

beforeEach(() => localStorage.clear());

const keyOf = (p: Promise<unknown>) =>
  p.then(
    () => null,
    (e: ValidationError) => e.key,
  );

describe("cashByCollector (SPEC 6.3)", () => {
  const m = (id: string) => ({ id, name: id, role: "collector" }) as ClubMember;
  const c = (collector_id: string, amount: number, over: Partial<ChandaTransaction> = {}) =>
    ({
      collector_id,
      amount,
      status: "collected",
      payment_method: "cash",
      ...over,
    }) as ChandaTransaction;
  const h = (collector_id: string, amount: number, over: Partial<CashHandover> = {}) =>
    ({ collector_id, amount, ...over }) as CashHandover;

  it("counts only non-void cash collections and non-void handovers", () => {
    const rows = cashByCollector(
      [m("a"), m("b"), m("idle")],
      [
        c("a", 1000),
        c("a", 500, { payment_method: "upi" }),
        c("a", 300, { status: "void", voided_at: "x" }),
        c("a", 200, { status: "promised" }),
        c("b", 300),
      ],
      [h("a", 600), h("a", 100, { voided_at: "x" })],
    );
    // Most outstanding first; members with no cash activity are left out.
    expect(rows).toEqual([
      { member_id: "a", collected: 1000, handed_over: 600, outstanding: 400 },
      { member_id: "b", collected: 300, handed_over: 0, outstanding: 300 },
    ]);
  });
});

describe("handover api", () => {
  async function setup() {
    await api.seedDemo();
    const members = await api.listMembers();
    const collector = members.find((x) => x.role === "collector")!;
    const treasurer = members.find((x) => x.role === "treasurer")!;
    session.set({ mode: "demo", member_id: treasurer.id });
    const chanda = await api.listChanda();
    const position = cashByCollector(members, chanda, []).find(
      (r) => r.member_id === collector.id,
    )!;
    return { collector, treasurer, position };
  }

  it("records the acting treasurer as receiver and reduces the outstanding cash", async () => {
    const { collector, treasurer, position } = await setup();
    expect(position.outstanding).toBeGreaterThan(0);
    const id = crypto.randomUUID();
    const handover = await api.createHandover({ id, collector_id: collector.id, amount: 1000 });
    expect(handover).toMatchObject({
      received_by_id: treasurer.id,
      amount: 1000,
      sync_status: "pending",
    });
    // Idempotent: the same id returns the same record.
    expect(await api.createHandover({ id, collector_id: collector.id, amount: 1000 })).toEqual(
      handover,
    );
    const after = cashByCollector(
      await api.listMembers(),
      await api.listChanda(),
      await api.listHandovers(),
    ).find((r) => r.member_id === collector.id)!;
    expect(after.outstanding).toBe(position.outstanding - 1000);
    expect((await api.getSummary()).pending_sync_count).toBeGreaterThan(0);
  });

  it("refuses more than outstanding, self-handover, and collectors receiving", async () => {
    const { collector, treasurer, position } = await setup();
    const make = (collector_id: string, amount: number) =>
      api.createHandover({ id: crypto.randomUUID(), collector_id, amount });
    expect(await keyOf(make(collector.id, position.outstanding + 1))).toBe("err_handoverTooMuch");
    expect(await keyOf(make(treasurer.id, 1))).toBe("err_handoverSelf");
    session.set({ mode: "demo", member_id: collector.id });
    expect(await keyOf(make(collector.id, 1))).toBe("err_forbidden");
  });

  it("is voided, never edited; a voided handover no longer counts", async () => {
    const { collector, position } = await setup();
    const hv = await api.createHandover({
      id: crypto.randomUUID(),
      collector_id: collector.id,
      amount: 500,
    });
    const admin = (await api.listMembers()).find((m) => m.role === "admin")!;
    session.set({ mode: "demo", member_id: admin.id });
    const v = await api.voidHandover(hv.id, "counted twice");
    expect(v).toMatchObject({ void_reason: "counted twice" });
    expect(await keyOf(api.voidHandover(hv.id, "again"))).toBe("err_alreadyVoid");
    const row = cashByCollector(
      await api.listMembers(),
      await api.listChanda(),
      await api.listHandovers(),
    ).find((r) => r.member_id === collector.id)!;
    expect(row.outstanding).toBe(position.outstanding);
  });

  it("handovers don't change the club's totals (cash only moves between members)", async () => {
    const { collector } = await setup();
    const before = await api.getSummary();
    await api.createHandover({ id: crypto.randomUUID(), collector_id: collector.id, amount: 100 });
    const after = await api.getSummary();
    expect({ ...after, pending_sync_count: 0 }).toEqual({ ...before, pending_sync_count: 0 });
  });
});
