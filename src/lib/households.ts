import { asciiDigits } from "./format";
import { isLive } from "./accounts";
import type { ChandaTransaction, Household } from "@/types/domain";

/**
 * pending: nothing collected and nothing promised · promised: a promise, nothing paid yet ·
 * partial: paid part of a promise · paid: collected, nothing promised left to pay.
 */
export type HouseholdStatus = "paid" | "partial" | "pending" | "promised";

export interface HouseholdLedger {
  collected: number;
  promised: number;
  /** Promised but not yet collected (partial payments leave a balance). */
  due: number;
  status: HouseholdStatus;
  /** Newest non-void entry, if any. */
  last?: ChandaTransaction;
  /** Newest non-void collected entry — the receipt to re-share. */
  lastCollected?: ChandaTransaction;
  /** Newest open (non-void) promise — what a treasurer/admin cancels if it was a mistake. */
  openPromise?: ChandaTransaction;
}

/** Search by name, flat no., lane/block or phone; Bengali digits match ASCII ones. */
export function householdMatches(h: Household, query: string) {
  const q = asciiDigits(query).trim().toLowerCase();
  if (!q) return true;
  return [h.resident_name, h.house_flat_no, h.lane_block, h.phone_number ?? ""].some((x) =>
    asciiDigits(x).toLowerCase().includes(q),
  );
}

/**
 * Per-household totals from the chanda ledger, ignoring voided entries. Payments count
 * against promises: due = promised − collected. Status: paid once something was collected
 * and nothing is due; partial when part of a promise is paid; promised while a promise is
 * open and nothing is paid; otherwise pending.
 */
export function householdLedgers(chanda: ChandaTransaction[]) {
  const map = new Map<string, HouseholdLedger>();
  const newest = [...chanda]
    .filter(isLive)
    .sort((a, b) => b.created_at.localeCompare(a.created_at));
  for (const c of newest) {
    const l = map.get(c.household_id) ?? { collected: 0, promised: 0, due: 0, status: "pending" };
    l.last ??= c;
    if (c.status === "collected") {
      l.collected += c.amount;
      l.lastCollected ??= c;
    }
    if (c.status === "promised") {
      l.promised += c.amount;
      l.openPromise ??= c;
    }
    map.set(c.household_id, l);
  }
  for (const l of map.values()) {
    l.due = Math.max(0, l.promised - l.collected);
    l.status =
      l.due > 0 ? (l.collected > 0 ? "partial" : "promised") : l.collected > 0 ? "paid" : "pending";
  }
  return map;
}

const NONE: HouseholdLedger = { collected: 0, promised: 0, due: 0, status: "pending" };
export const ledgerOf = (ledgers: Map<string, HouseholdLedger>, id: string) =>
  ledgers.get(id) ?? NONE;

/**
 * SPEC 2.1 "recent households on top": newest activity first — the later of when the
 * household was added and its newest chanda entry (any status).
 */
export function byRecentActivity(households: Household[], chanda: ChandaTransaction[]) {
  const last = new Map<string, string>();
  for (const c of chanda)
    if ((last.get(c.household_id) ?? "") < c.created_at) last.set(c.household_id, c.created_at);
  const at = (h: Household) => {
    const entry = last.get(h.id) ?? "";
    return entry > h.created_at ? entry : h.created_at;
  };
  return [...households].sort((a, b) => at(b).localeCompare(at(a)));
}

export interface LaneOption {
  lane: string;
  count: number;
}

/** Lanes/blocks in use, in natural order (লেন ২ before লেন ১০), with household counts. */
export function laneOptions(households: Household[]): LaneOption[] {
  const counts = new Map<string, number>();
  for (const h of households) counts.set(h.lane_block, (counts.get(h.lane_block) ?? 0) + 1);
  const collator = new Intl.Collator(["bn", "en"], { numeric: true });
  return [...counts]
    .map(([lane, count]) => ({ lane, count }))
    .sort((a, b) => collator.compare(asciiDigits(a.lane), asciiDigits(b.lane)));
}
