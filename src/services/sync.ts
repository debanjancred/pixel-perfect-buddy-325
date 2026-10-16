// Sync seam (SPEC Story 5.1). api.sync() collects pending/failed records and hands them to
// the active adapter. MVP: there is no backend, so everything is accepted. The Laravel
// adapter will POST each record (idempotent by its client UUID) and report failures,
// which the UI then offers to retry.
import type { CashHandover, ChandaTransaction, ExpenseRecord } from "@/types/domain";

export type SyncRecord =
  | { kind: "chanda"; record: ChandaTransaction }
  | { kind: "expense"; record: ExpenseRecord }
  | { kind: "handover"; record: CashHandover };

export interface SyncResult {
  id: string;
  ok: boolean;
}

export interface SyncAdapter {
  push(records: SyncRecord[]): Promise<SyncResult[]>;
}

/** MVP adapter: nothing to send to, so every record counts as synced. */
export const localAdapter: SyncAdapter = {
  push: async (records) => records.map((r) => ({ id: r.record.id, ok: true })),
};

let adapter: SyncAdapter = localAdapter;
export const getSyncAdapter = () => adapter;
/** Swap the adapter (the Laravel client later; failing fakes in tests). */
export const setSyncAdapter = (next: SyncAdapter) => {
  adapter = next;
};
