import { beforeEach, describe, expect, it } from "vitest";

import { dueAmount, householdMatches, paidByHousehold } from "@/lib/households";
import { ValidationError } from "@/lib/validation";
import { api } from "@/services/api";
import type { DB } from "@/services/types";

async function rejectsWith(p: Promise<unknown>, key: string) {
  const err = await p.catch((e: unknown) => e);
  expect(err).toBeInstanceOf(ValidationError);
  expect((err as ValidationError).key).toBe(key);
}

const readDB = () => JSON.parse(localStorage.getItem("pk_db_v1")!) as DB;

async function setup() {
  const members = await api.listMembers();
  const lanes = await api.listLanes();
  const h = await api.createHousehold({
    resident_name: "টেস্ট দাস",
    house_no: "99",
    lane_bn: lanes[0]!.bn,
    lane_en: lanes[0]!.en,
    phone: "",
    pledged_amount: 1001,
  });
  const pay = (amount: number) =>
    api.createChanda({
      household_id: h.id,
      payer_name: h.resident_name,
      amount,
      payment_mode: "cash",
      collector_id: members[0]!.id,
    });
  return { h, pay, members, lanes };
}

beforeEach(() => localStorage.clear());

describe("chanda collection", () => {
  it("keeps a household due after a partial payment and marks it paid once covered", async () => {
    const { h, pay } = await setup();
    await pay(501);
    let saved = (await api.listHouseholds()).find((x) => x.id === h.id)!;
    expect(saved.status).toBe("pending");
    expect(dueAmount(saved, paidByHousehold(await api.listChandas()).get(h.id)!)).toBe(500);

    await pay(500);
    saved = (await api.listHouseholds()).find((x) => x.id === h.id)!;
    expect(saved.status).toBe("paid");
    expect(dueAmount(saved, 1001)).toBe(0);
  });

  it("issues the next receipt number even if the stored counter fell behind", async () => {
    const { pay } = await setup();
    const db = readDB();
    db.clubs[0]!.receipt_seq = 1;
    localStorage.setItem("pk_db_v1", JSON.stringify(db));
    const a = await pay(100);
    const b = await pay(100);
    const nos = (await api.listChandas()).map((c) => c.receipt_no);
    expect(new Set(nos).size).toBe(nos.length);
    expect(a.receipt_no).not.toBe(b.receipt_no);
    expect(Number(b.receipt_no.split("-").pop())).toBe(Number(a.receipt_no.split("-").pop()) + 1);
  });

  it("updates the summary totals", async () => {
    const before = await api.getSummary();
    const { pay } = await setup();
    await pay(1001);
    const after = await api.getSummary();
    expect(after.collected - before.collected).toBe(1001);
    expect(after.balance).toBe(after.collected - after.spent);
  });

  it("rejects bad amounts, unknown collectors and unknown households", async () => {
    const { h, pay, members } = await setup();
    await rejectsWith(pay(0), "err_amount");
    await rejectsWith(pay(10.5), "err_amount");
    await rejectsWith(pay(1_000_001), "err_amount");
    await rejectsWith(
      api.createChanda({
        household_id: h.id,
        payer_name: "x",
        amount: 10,
        payment_mode: "cash",
        collector_id: "nobody",
      }),
      "err_collector",
    );
    await rejectsWith(
      api.createChanda({
        household_id: "missing",
        payer_name: "x",
        amount: 10,
        payment_mode: "cash",
        collector_id: members[0]!.id,
      }),
      "err_household",
    );
  });
});

describe("households", () => {
  it("validates new households and blocks duplicates at the same house", async () => {
    const { lanes } = await setup();
    const base = {
      resident_name: "টেস্ট দাস",
      house_no: "99",
      lane_bn: lanes[0]!.bn,
      lane_en: lanes[0]!.en,
      phone: "",
      pledged_amount: 501,
    };
    await rejectsWith(api.createHousehold(base), "err_householdExists");
    await rejectsWith(api.createHousehold({ ...base, resident_name: " " }), "err_required");
    await rejectsWith(api.createHousehold({ ...base, house_no: "" }), "err_required");
    await rejectsWith(api.createHousehold({ ...base, phone: "12345" }), "err_phone");
    await expect(api.createHousehold({ ...base, house_no: "100" })).resolves.toBeTruthy();
  });

  it("search matches Bengali digits, English names and phone numbers", async () => {
    const h = (await api.listHouseholds()).find((x) => x.house_no === "12A")!;
    expect(householdMatches(h, "১২")).toBe(true);
    expect(householdMatches(h, "dilip")).toBe(true);
    expect(householdMatches(h, h.phone.slice(-4))).toBe(true);
    expect(householdMatches(h, "zzz")).toBe(false);
  });
});
