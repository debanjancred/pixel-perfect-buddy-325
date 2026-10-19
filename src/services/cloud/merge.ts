// Merging other devices' changes into the local store (cloud mode). Pure, so the rules are
// unit-tested:
//  - A record this device hasn't sent yet (pending/failed, or queued in the outbox) wins:
//    it is the newer truth and will reach the server on the next push.
//  - Everything else takes the server's version and counts as synced.
//  - A voucher photo already on this device keeps its local id (works offline); otherwise
//    the server's storage path is used and downloaded on demand.
//  - Event tallies are the server count plus this device's not-yet-sent +1/−1 changes.
import type {
  CashHandover,
  ChandaTransaction,
  Club,
  ClubEvent,
  ClubMember,
  ExpenseRecord,
  Household,
} from "@/types/domain";

export interface Snapshot {
  clubs: Club[];
  members: ClubMember[];
  households: Household[];
  chanda: Omit<ChandaTransaction, "sync_status">[];
  expenses: Omit<ExpenseRecord, "sync_status">[];
  handovers: Omit<CashHandover, "sync_status">[];
  events: ClubEvent[];
}

export interface OutboxOp {
  kind: "club" | "member" | "household" | "event" | "event_update" | "event_delta";
  id: string;
  event_id?: string;
  delta?: 1 | -1;
  failed?: boolean;
}

export interface MergeTarget {
  clubs: Club[];
  members: ClubMember[];
  households: Household[];
  chanda: ChandaTransaction[];
  expenses: ExpenseRecord[];
  handovers: CashHandover[];
  events: ClubEvent[];
  outbox?: OutboxOp[];
}

type Keyed = { id: string };

function upsertAll<T extends Keyed>(list: T[], incoming: T[], keepLocal: (local: T) => boolean) {
  const index = new Map(list.map((x, i) => [x.id, i]));
  for (const item of incoming) {
    const i = index.get(item.id);
    if (i === undefined) {
      index.set(item.id, list.length);
      list.push(item);
    } else if (!keepLocal(list[i]!)) {
      list[i] = item;
    }
  }
}

export function mergeSnapshot<T extends MergeTarget>(db: T, snap: Snapshot): T {
  const queued = new Set(
    (db.outbox ?? []).filter((o) => o.kind !== "event_delta").map((o) => o.id),
  );
  const unsent = (r: { id: string; sync_status?: string }) =>
    queued.has(r.id) || (r.sync_status !== undefined && r.sync_status !== "synced");
  const synced = <R extends object>(r: R) => ({ ...r, sync_status: "synced" as const });

  upsertAll(db.clubs, snap.clubs, unsent);
  upsertAll(db.members, snap.members, unsent);
  upsertAll(db.households, snap.households, unsent);
  upsertAll(db.chanda, snap.chanda.map(synced) as ChandaTransaction[], unsent);
  upsertAll(db.handovers, snap.handovers.map(synced) as CashHandover[], unsent);

  const localVoucher = new Map(db.expenses.map((e) => [e.id, e.voucher_image_id]));
  upsertAll(
    db.expenses,
    snap.expenses.map((e) => {
      const local = localVoucher.get(e.id);
      const keep = local && !local.includes("/") ? { voucher_image_id: local } : {};
      return synced({ ...e, ...keep });
    }) as ExpenseRecord[],
    unsent,
  );

  const pendingDelta = new Map<string, number>();
  for (const op of db.outbox ?? [])
    if (op.kind === "event_delta" && op.event_id)
      pendingDelta.set(op.event_id, (pendingDelta.get(op.event_id) ?? 0) + (op.delta ?? 0));
  upsertAll(
    db.events,
    snap.events.map((e) => ({
      ...e,
      registrations_count: Math.max(0, e.registrations_count + (pendingDelta.get(e.id) ?? 0)),
    })),
    unsent,
  );
  return db;
}

/** Latest updated_at in a snapshot, used as the next pull's cursor. */
export function snapshotCursor(snap: Snapshot, previous?: string): string | undefined {
  let max = previous;
  for (const list of Object.values(snap) as { updated_at?: string }[][])
    for (const r of list) if (r.updated_at && (!max || r.updated_at > max)) max = r.updated_at;
  return max;
}
