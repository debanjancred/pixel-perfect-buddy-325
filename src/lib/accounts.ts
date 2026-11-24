// Accounts aggregation (SPEC.md Section 6). Pure so it can be unit-tested and reused
// unchanged once the Laravel API serves the same records.
import type {
  AccountsSummary,
  CashHandover,
  ChandaTransaction,
  Club,
  ClubMember,
  EntryReview,
  ExpenseRecord,
} from "@/types/domain";

/** Voided records stay in the ledger for audit but never count towards totals. */
export const isVoid = (r: { status?: string; voided_at?: string | undefined }) =>
  r.status === "void" || !!r.voided_at;

export const approvalOf = (r: EntryReview) => r.approval_status ?? "approved";
export const isRejected = (r: EntryReview) => approvalOf(r) === "rejected";
export const isWaiting = (r: EntryReview) => approvalOf(r) === "pending";
/** Neither voided nor rejected: the money really moved, approved or not (ADR 0003). */
export const isLive = (r: EntryReview & { status?: string; voided_at?: string | undefined }) =>
  !isVoid(r) && !isRejected(r);
/** Counts in official totals: live and approved by an admin. */
export const isCounted = (r: EntryReview & { status?: string; voided_at?: string | undefined }) =>
  isLive(r) && approvalOf(r) === "approved";

const sum = (rows: { amount: number }[]) => rows.reduce((s, r) => s + r.amount, 0);

/** What households promised and haven't paid yet: per household promised − collected, ≥ 0. */
function dueByHousehold(live: ChandaTransaction[]) {
  const by = new Map<string, number>();
  for (const c of live) {
    const delta = c.status === "promised" ? c.amount : c.status === "collected" ? -c.amount : 0;
    by.set(c.household_id, (by.get(c.household_id) ?? 0) + delta);
  }
  return [...by.values()].reduce((s, v) => s + Math.max(0, v), 0);
}

export function computeSummary(
  club: Club | null,
  chanda: ChandaTransaction[],
  expenses: ExpenseRecord[],
  handovers: CashHandover[] = [],
): AccountsSummary {
  const live = chanda.filter(isCounted);
  const collected = live.filter((c) => c.status === "collected");
  const total_collected = sum(collected);
  const total_expenses = sum(expenses.filter(isCounted));
  const collection_target = club?.target_amount ?? 0;
  return {
    total_collected,
    collected_cash: sum(collected.filter((c) => c.payment_method === "cash")),
    collected_upi: sum(collected.filter((c) => c.payment_method === "upi")),
    total_promised: sum(live.filter((c) => c.status === "promised")),
    total_due: dueByHousehold(live),
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
    waiting_collected: sum(
      chanda.filter((c) => isLive(c) && isWaiting(c) && c.status === "collected"),
    ),
    waiting_expenses: sum(expenses.filter((e) => isLive(e) && isWaiting(e))),
  };
}

export interface CollectorCash {
  member_id: string;
  /** Live chanda collected in cash by this member, approved or waiting. */
  collected: number;
  /** Live handovers from this member, approved or waiting. */
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
            isLive(c),
        ),
      );
      const handed_over = sum(handovers.filter((h) => h.collector_id === m.id && isLive(h)));
      return { member_id: m.id, collected, handed_over, outstanding: collected - handed_over };
    })
    .filter((r) => r.collected > 0 || r.handed_over > 0)
    .sort((a, b) => b.outstanding - a.outstanding);
}
