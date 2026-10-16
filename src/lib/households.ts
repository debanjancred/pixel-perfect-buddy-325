import { asciiDigits } from "./format";
import { isVoid } from "./accounts";
import type { ChandaTransaction, Household } from "@/types/domain";

export type HouseholdStatus = "paid" | "pending" | "promised";

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
 * Per-household totals from the chanda ledger, ignoring voided entries.
 * Status: paid once something was collected and nothing promised is outstanding;
 * promised while a pledge is open and nothing was collected; otherwise pending.
 */
export function householdLedgers(chanda: ChandaTransaction[]) {
  const map = new Map<string, HouseholdLedger>();
  const newest = [...chanda]
    .filter((c) => !isVoid(c))
    .sort((a, b) => b.created_at.localeCompare(a.created_at));
  for (const c of newest) {
    const l = map.get(c.household_id) ?? { collected: 0, promised: 0, due: 0, status: "pending" };
    l.last ??= c;
    if (c.status === "collected") {
      l.collected += c.amount;
      l.lastCollected ??= c;
    }
    if (c.status === "promised") l.promised += c.amount;
    map.set(c.household_id, l);
  }
  for (const l of map.values()) {
    l.due = Math.max(0, l.promised - l.collected);
    l.status =
      l.collected > 0 && l.due === 0
        ? "paid"
        : l.collected === 0 && l.due > 0
          ? "promised"
          : "pending";
  }
  return map;
}

const NONE: HouseholdLedger = { collected: 0, promised: 0, due: 0, status: "pending" };
export const ledgerOf = (ledgers: Map<string, HouseholdLedger>, id: string) =>
  ledgers.get(id) ?? NONE;
