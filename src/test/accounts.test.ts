import { describe, expect, it } from "vitest";

import { computeSummary } from "@/lib/accounts";
import type { ChandaTransaction, Club, ExpenseRecord } from "@/types/domain";

// SPEC.md Section 6: void exclusion, promised exclusion, zero target, negative balance, >100%.
const club = (target_amount: number): Club => ({
  id: "c",
  slug: "s",
  name_bn: "নমুনা",
  name_en: "Sample",
  area_label: "ব্লক এ",
  target_amount,
  puja_year: 2026,
  created_at: "2026-01-01T00:00:00.000Z",
});

let seq = 0;
const tx = (amount: number, extra: Partial<ChandaTransaction> = {}): ChandaTransaction => ({
  id: `t${++seq}`,
  receipt_no: `PK-2026-C01-${seq}`,
  club_id: "c",
  household_id: "h",
  amount,
  payment_method: "cash",
  status: "collected",
  collector_id: "m",
  created_at: "2026-10-01T00:00:00.000Z",
  updated_at: "2026-10-01T00:00:00.000Z",
  sync_status: "synced",
  ...extra,
});
const exp = (amount: number, extra: Partial<ExpenseRecord> = {}): ExpenseRecord => ({
  id: `e${++seq}`,
  club_id: "c",
  category: "misc",
  title: "x",
  amount,
  paid_to: "ভেন্ডর ০১",
  authorized_by_id: "m",
  date: "2026-10-01",
  created_at: "2026-10-01T00:00:00.000Z",
  updated_at: "2026-10-01T00:00:00.000Z",
  sync_status: "synced",
  ...extra,
});

describe("computeSummary", () => {
  it("adds collected chanda, split by cash and UPI", () => {
    const s = computeSummary(
      club(10000),
      [tx(1000), tx(2000, { payment_method: "upi" })],
      [exp(500)],
    );
    expect(s).toMatchObject({
      total_collected: 3000,
      collected_cash: 1000,
      collected_upi: 2000,
      total_expenses: 500,
      net_balance: 2500,
      collection_target: 10000,
      progress_pct: 30,
    });
  });

  it("excludes void entries by status or voided_at", () => {
    const s = computeSummary(
      club(10000),
      [tx(1000), tx(5000, { status: "void" }), tx(7000, { voided_at: "2026-10-02T00:00:00Z" })],
      [exp(400), exp(900, { voided_at: "2026-10-02T00:00:00Z" })],
    );
    expect(s.total_collected).toBe(1000);
    expect(s.total_expenses).toBe(400);
  });

  it("reports promised separately and never adds it to collected", () => {
    const s = computeSummary(club(10000), [tx(1000), tx(5000, { status: "promised" })], []);
    expect(s.total_collected).toBe(1000);
    expect(s.total_promised).toBe(5000);
    expect(s.net_balance).toBe(1000);
  });

  it("handles a zero target and a missing club", () => {
    expect(computeSummary(club(0), [tx(1000)], []).progress_pct).toBe(0);
    expect(computeSummary(null, [tx(1000)], []).progress_pct).toBe(0);
  });

  it("allows a negative balance", () => {
    expect(computeSummary(club(10000), [tx(1000)], [exp(3000)]).net_balance).toBe(-2000);
  });

  it("caps progress at 100% when collection passes the target", () => {
    expect(computeSummary(club(1000), [tx(2500)], []).progress_pct).toBe(100);
  });

  it("counts every record not yet synced", () => {
    const s = computeSummary(
      club(1000),
      [tx(1, { sync_status: "pending" }), tx(1, { sync_status: "failed" }), tx(1)],
      [exp(1, { sync_status: "pending" })],
    );
    expect(s.pending_sync_count).toBe(3);
  });
});
