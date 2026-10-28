// Sync seam (SPEC Story 5.1). api.sync() collects pending/failed records and hands them to
// the active adapter. MVP: there is no backend, so everything is accepted. The Laravel
// adapter will POST each record (idempotent by its client UUID) and report failures,
// which the UI then offers to retry.
import type {
  CashHandover,
  ChandaTransaction,
  Club,
  ClubEvent,
  ClubMember,
  ExpenseRecord,
  Household,
} from "@/types/domain";
import type { ErrKey } from "@/lib/validation";

/** A queued change to an event's registration tally (+1 register / −1 undo). */
export interface EventDelta {
  id: string; // the change's own id
  event_id: string;
  delta: 1 | -1;
}

/**
 * Everything the device may need to send. Ledger rows carry sync_status; the others come
 * from the outbox (SPEC types have no sync_status for them). Listed in dependency order.
 */
export type SyncRecord =
  | { kind: "club"; record: Club; admin: ClubMember }
  | { kind: "member"; record: ClubMember }
  | { kind: "household"; record: Household }
  | { kind: "event"; record: ClubEvent }
  | { kind: "event_update"; record: ClubEvent }
  | { kind: "chanda"; record: ChandaTransaction }
  | { kind: "expense"; record: ExpenseRecord }
  | { kind: "handover"; record: CashHandover }
  | { kind: "event_delta"; record: EventDelta };

export const SYNC_ORDER: SyncRecord["kind"][] = [
  "club",
  "member",
  "household",
  "event",
  "event_update",
  "chanda",
  "expense",
  "handover",
  "event_delta",
];

export interface SyncResult {
  id: string;
  ok: boolean;
  /** Why the server refused it (an i18n key), so the app can say so. */
  error?: ErrKey;
  /** It never reached the server (no signal): not a refusal, so not reported. */
  network?: boolean;
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
