// Accounts aggregation (SPEC.md Section 6). Pure so it can be unit-tested and reused
// unchanged once the Laravel API serves the same records.
import type {
  AccountsSummary,
  CashHandover,
  ChandaTransaction,
  Club,
  ExpenseRecord,
} from "@/types/domain";

/** Voided records stay in the ledger for audit but never count towards totals. */
export const isVoid = (r: { status?: string; voided_at?: string | undefined }) =>
  r.status === "void" || !!r.voided_at;

const sum = (rows: { amount: number }[]) => rows.reduce((s, r) => s + r.amount, 0);

export function computeSummary(
  club: Club | null,
  chanda: ChandaTransaction[],
  expenses: ExpenseRecord[],
  handovers: CashHandover[] = [],
): AccountsSummary {
  const live = chanda.filter((c) => !isVoid(c));
  const collected = live.filter((c) => c.status === "collected");
  const total_collected = sum(collected);
  const total_expenses = sum(expenses.filter((e) => !isVoid(e)));
  const collection_target = club?.target_amount ?? 0;
  return {
    total_collected,
    collected_cash: sum(collected.filter((c) => c.payment_method === "cash")),
    collected_upi: sum(collected.filter((c) => c.payment_method === "upi")),
    total_promised: sum(live.filter((c) => c.status === "promised")),
    total_expenses,
    net_balance: total_collected - total_expenses,
    collection_target,
    progress_pct:
      collection_target > 0
        ? Math.min(100, Math.round((total_collected / collection_target) * 100))
        : 0,
    pending_sync_count: [...chanda, ...expenses, ...handovers].filter(
      (r) => r.sync_status !== "synced",
    ).length,
  };
}
