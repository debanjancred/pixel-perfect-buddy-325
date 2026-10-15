import { asciiDigits } from "./format";
import type { Chanda, Household } from "@/services/types";

/** Search by name (bn/en), house no. or phone; Bengali digits match ASCII ones. */
export function householdMatches(h: Household, query: string) {
  const q = asciiDigits(query).trim().toLowerCase();
  if (!q) return true;
  return [h.resident_name, h.resident_name_en, h.house_no, h.phone].some((x) =>
    asciiDigits(x).toLowerCase().includes(q),
  );
}

/** Total collected per household id. */
export function paidByHousehold(chandas: Chanda[]) {
  const paid = new Map<string, number>();
  for (const c of chandas)
    if (c.household_id) paid.set(c.household_id, (paid.get(c.household_id) ?? 0) + c.amount);
  return paid;
}

/** What is still owed against the pledge (partial payments leave a balance). */
export const dueAmount = (h: Household, paid: number) =>
  h.status === "paid" ? 0 : Math.max(0, h.pledged_amount - paid);
