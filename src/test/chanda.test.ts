import { beforeEach, describe, expect, it } from "vitest";

import { householdLedgers, householdMatches, ledgerOf } from "@/lib/households";
import { ValidationError } from "@/lib/validation";
import { api } from "@/services/api";
import { session } from "@/services/session";
import { seedAsAdmin } from "./helpers";

async function rejectsWith(p: Promise<unknown>, key: string) {
  const err = await p.catch((e: unknown) => e);
  expect(err).toBeInstanceOf(ValidationError);
  expect((err as ValidationError).key).toBe(key);
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

async function demo() {
  await seedAsAdmin();
  const members = await api.listMembers();
  const collector = members.find((m) => m.role === "collector")!;
  const treasurer = members.find((m) => m.role === "treasurer")!;
  const households = await api.listHouseholds();
  const pay = (amount: number, extra: Partial<Parameters<typeof api.createChanda>[0]> = {}) =>
    api.addTransaction({
      id: crypto.randomUUID(),
      household_id: households[14]!.id,
      amount,
      payment_method: "cash",
      status: "collected",
      collector_id: collector.id,
      ...extra,
    });
  return { members, collector, treasurer, households, pay };
}

beforeEach(() => localStorage.clear());

describe("demo fixtures (SPEC Section 5)", () => {
  it("seeds generic data with the minimum counts, ASCII digits and UUIDs", async () => {
    const { members, households } = await demo();
    const chanda = await api.listChanda();
    expect(households.length).toBeGreaterThanOrEqual(15);
    expect(chanda.length).toBeGreaterThanOrEqual(10);
    expect(await api.listExpenses()).toHaveLength(4);
    expect(members).toHaveLength(3);
    expect(await api.listEvents()).toHaveLength(2);
    expect(chanda.some((c) => c.status === "promised")).toBe(true);
    expect(chanda.some((c) => c.status === "void" && c.void_reason)).toBe(true);
    expect(households.every((h) => /^[0-9A-Za-z]+$/.test(h.house_flat_no))).toBe(true);
    expect(households.every((h) => UUID.test(h.id))).toBe(true);
    expect((await api.getClub())?.name_bn).toBe("নমুনা পূজা কমিটি ২০২৬");
  });

  it("is idempotent", async () => {
    await seedAsAdmin();
    await seedAsAdmin();
    expect((await api.listClubs()).clubs).toHaveLength(1);
    expect(await api.listHouseholds()).toHaveLength(15);
  });

  it("summarises the sample club", async () => {
    await seedAsAdmin();
    expect(await api.getSummary()).toMatchObject({
      total_collected: 107010,
      total_promised: 5001,
      total_expenses: 98500,
      net_balance: 8510,
      collection_target: 500000,
      progress_pct: 21,
      pending_sync_count: 0,
    });
  });
});

describe("chanda", () => {
  it("numbers receipts per writer and starts local-first as pending", async () => {
    const { pay, collector } = await demo();
    // The admin writes the receipt for the collector's cash: the admin's own sequence.
    const a = await pay(501);
    const b = await pay(251);
    expect(a.receipt_no).toMatch(/^PK-2026-A01-\d{4}$/);
    expect(Number(b.receipt_no!.slice(-4))).toBe(Number(a.receipt_no!.slice(-4)) + 1);
    expect(a.collector_id).toBe(collector.id);
    expect(a.sync_status).toBe("pending");
    expect((await api.getSummary()).pending_sync_count).toBe(2);
    // The collector writing their own receipt continues the collector's sequence.
    session.set({ mode: "demo", member_id: collector.id });
    expect((await pay(101)).receipt_no).toBe("PK-2026-C01-0011");
  });

  it("treats the id as an idempotency key", async () => {
    const { pay } = await demo();
    const id = crypto.randomUUID();
    const first = await pay(1001, { id });
    const again = await pay(1001, { id });
    expect(again).toEqual(first);
    expect((await api.listChanda()).filter((c) => c.id === id)).toHaveLength(1);
  });

  it("rejects bad amounts, unknown collectors and unknown households", async () => {
    const { pay } = await demo();
    await rejectsWith(pay(0), "err_amount");
    await rejectsWith(pay(10.5), "err_amount");
    await rejectsWith(pay(1_000_001), "err_amount");
    await rejectsWith(pay(10, { collector_id: "nobody" }), "err_collector");
    await rejectsWith(pay(10, { household_id: "missing" }), "err_household");
  });

  it("voids with a reason, excludes the entry from totals and refuses a second void", async () => {
    const { pay } = await demo();
    const before = (await api.getSummary()).total_collected;
    const c = await pay(2001);
    await rejectsWith(api.voidChanda(c.id, " "), "err_voidReason");
    const v = await api.voidChanda(c.id, "ভুল এন্ট্রি");
    expect(v).toMatchObject({ status: "void", void_reason: "ভুল এন্ট্রি" });
    expect(v.voided_at).toBeTruthy();
    expect((await api.getSummary()).total_collected).toBe(before);
    expect((await api.listChanda()).some((x) => x.id === c.id)).toBe(true); // never deleted
    await rejectsWith(api.voidChanda(c.id, "আবার"), "err_alreadyVoid");
  });

  it("sync marks pending records synced", async () => {
    const { pay } = await demo();
    await pay(101);
    expect(await api.sync()).toEqual({ synced: 1, failed: 0 });
    expect((await api.getSummary()).pending_sync_count).toBe(0);
  });
});

describe("household ledger", () => {
  it("keeps a promise due until it is fully collected", async () => {
    const { pay, households } = await demo();
    const id = households[14]!.id;
    await pay(1001, { status: "promised" });
    expect(ledgerOf(householdLedgers(await api.listChanda()), id)).toMatchObject({
      status: "promised",
      due: 1001,
    });
    await pay(501);
    expect(ledgerOf(householdLedgers(await api.listChanda()), id)).toMatchObject({
      status: "partial",
      due: 500,
      collected: 501,
    });
    await pay(500);
    expect(ledgerOf(householdLedgers(await api.listChanda()), id).status).toBe("paid");
  });

  it("records a promise without a receipt number, and receipts stay gap-free", async () => {
    const { pay } = await demo();
    const a = await pay(501);
    const promise = await pay(2001, { status: "promised" });
    const b = await pay(251);
    expect(promise.receipt_no).toBeNull();
    expect(Number(b.receipt_no!.slice(-4))).toBe(Number(a.receipt_no!.slice(-4)) + 1);
  });

  it("counts what households promised and haven't paid yet in the accounts", async () => {
    const { pay } = await demo();
    const before = (await api.getSummary()).total_due ?? 0;
    const collectedBefore = (await api.getSummary()).total_collected;
    await pay(1001, { status: "promised" });
    await pay(400);
    const s = await api.getSummary();
    expect(s.total_due).toBe(before + 601);
    expect(s.total_collected).toBe(collectedBefore + 400); // a promise is never money received
  });

  it("only a treasurer or admin cancels a promise; it then stops counting", async () => {
    const { pay, households, collector } = await demo();
    const id = households[14]!.id;
    const promise = await pay(1001, { status: "promised" });
    const admin = session.get();
    session.set({ mode: "demo", member_id: collector.id });
    await rejectsWith(api.voidChanda(promise.id, "ভুল এন্ট্রি"), "err_forbidden");
    session.set(admin!);
    await api.voidChanda(promise.id, "পরিবার মত বদলেছে");
    const ledger = ledgerOf(householdLedgers(await api.listChanda()), id);
    expect(ledger.due).toBe(0);
    expect(ledger.openPromise).toBeUndefined();
  });

  it("validates new households and blocks duplicates", async () => {
    await demo();
    const base = { resident_name: "নতুন বাসিন্দা", house_flat_no: "401", lane_block: "লেন ২" };
    await api.createHousehold(base);
    await rejectsWith(api.createHousehold(base), "err_householdExists");
    await rejectsWith(api.createHousehold({ ...base, resident_name: " " }), "err_residentName");
    await rejectsWith(api.createHousehold({ ...base, lane_block: " " }), "err_lane");
    await rejectsWith(
      api.createHousehold({ ...base, house_flat_no: "402", phone_number: "12345" }),
      "err_phone",
    );
  });

  it("accepts a household without a house number; the lane tells namesakes apart", async () => {
    await demo();
    const base = { resident_name: "নতুন বাসিন্দা", lane_block: "লেন ৯" };
    const h = await api.createHousehold(base);
    expect(h.house_flat_no).toBe("");
    await rejectsWith(api.createHousehold({ ...base, house_flat_no: " " }), "err_householdExists");
    expect((await api.createHousehold({ ...base, lane_block: "লেন ১০" })).house_flat_no).toBe("");
  });

  it("accepts a household without a mobile number (many residents have none)", async () => {
    await demo();
    const h = await api.createHousehold({
      resident_name: "মোবাইল ছাড়া",
      lane_block: "লেন ৯",
      phone_number: "",
    });
    expect(h.phone_number ?? "").toBe("");
    expect((await api.listHouseholds()).some((x) => x.id === h.id)).toBe(true);
  });

  it("search matches Bengali digits, names, lanes and phone numbers", async () => {
    const { households } = await demo();
    const h = households.find((x) => x.house_flat_no === "102")!;
    expect(householdMatches(h, "১০২")).toBe(true);
    expect(householdMatches(h, "আবাসিক ০২")).toBe(true);
    expect(householdMatches(h, h.phone_number!.slice(-4))).toBe(true);
    expect(householdMatches(h, "zzz")).toBe(false);
  });
});

describe("expenses", () => {
  const input = (authorized_by_id: string) => ({
    id: crypto.randomUUID(),
    category: "lighting" as const,
    title: "আলো",
    amount: 4000,
    paid_to: "ভেন্ডর ০৫",
    authorized_by_id,
    date: "2026-10-01",
  });

  it("saves pending, idempotently, and only for treasurer/admin approvers", async () => {
    const { treasurer, collector } = await demo();
    const e = input(treasurer.id);
    const saved = await api.addExpense(e);
    expect(saved.sync_status).toBe("pending");
    expect(await api.addExpense(e)).toEqual(saved);
    expect(await api.listExpenses()).toHaveLength(5);
    await rejectsWith(api.addExpense(input(collector.id)), "err_authorizer");
    await rejectsWith(api.addExpense({ ...input(treasurer.id), date: "01-10-2026" }), "err_date");
    await rejectsWith(api.addExpense({ ...input(treasurer.id), paid_to: "" }), "err_required");
  });
});
