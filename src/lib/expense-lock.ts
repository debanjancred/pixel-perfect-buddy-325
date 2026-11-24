import { isLive, isRejected, isVoid } from "./accounts";
import type { CashHandover, ExpenseRecord } from "@/types/domain";

/**
 * An expense can be corrected until the next cash handover involving the member who
 * recorded it (older expenses: whoever authorised it). Voided and rejected expenses are locked too. The
 * server applies the same rule (supabase/migrations/…_expense_edit_categories.sql).
 */
export function expenseLocked(e: ExpenseRecord, handovers: CashHandover[]) {
  if (isVoid(e) || isRejected(e)) return true;
  const recorder = e.recorded_by_id ?? e.authorized_by_id;
  return handovers.some(
    (h) =>
      h.club_id === e.club_id &&
      isLive(h) &&
      h.created_at > e.created_at &&
      (h.collector_id === recorder || h.received_by_id === recorder),
  );
}
