// Accounts aggregation (SPEC.md Section 6). Pure so it can be unit-tested and reused
// unchanged once the Laravel API serves the same records.
import type {
  AccountsSummary,
  CashHandover,
  ChandaTransaction,
  Club,
  ClubMember,
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

export interface CollectorCash {
  member_id: string;
  /** Non-void chanda collected in cash by this member. */
  collected: number;
  /** Non-void handovers from this member. */
  handed_over: number;
  /** Cash still with the member: collected − handed over (SPEC 6.3). */
  outstanding: number;
}

/** Cash position per member who has collected or handed over cash, most outstanding first. */
export function cashByCollector(
  members: ClubMember[],
  chanda: ChandaTransaction[],
  handovers: CashHandover[],
): CollectorCash[] {
  return members
    .map((m) => {
      const collected = sum(
        chanda.filter(
          (c) =>
            c.collector_id === m.id &&
            c.status === "collected" &&
            c.payment_method === "cash" &&
            !isVoid(c),
        ),
      );
      const handed_over = sum(handovers.filter((h) => h.collector_id === m.id && !isVoid(h)));
      return { member_id: m.id, collected, handed_over, outstanding: collected - handed_over };
    })
    .filter((r) => r.collected > 0 || r.handed_over > 0)
    .sort((a, b) => b.outstanding - a.outstanding);
}
