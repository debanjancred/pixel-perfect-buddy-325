// Settings logic (SPEC Story 6.2 + Sprint 3 CSV export). Pure and unit-tested.
import type { I18n } from "@/lib/i18n";
import type { Cell } from "@/lib/csv";
import { categoryMeta } from "@/features/expenses";
import type {
  ChandaTransaction,
  ClubMember,
  ExpenseRecord,
  Household,
  UserRole,
} from "@/types/domain";

export const ROLES: readonly UserRole[] = ["admin", "treasurer", "collector"];

/** Members grouped by role in ROLES order, each group sorted by name (Story 6.2). */
export const membersByRole = (members: ClubMember[]) =>
  ROLES.map((role) => ({
    role,
    members: members.filter((m) => m.role === role).sort((a, b) => a.name.localeCompare(b.name)),
  }));

/** Brand tone per role: vermilion for admins, gold for treasurers, neutral for collectors. */
export const ROLE_TONE: Record<UserRole, string> = {
  admin: "bg-primary-soft text-primary",
  treasurer: "bg-gold-soft text-gold-ink",
  collector: "bg-muted text-foreground",
};

/** "9830012345" → "98300 12345", the way people read mobile numbers aloud. */
export const phoneDisplay = (phone: string) =>
  phone.length === 10 ? `${phone.slice(0, 5)} ${phone.slice(5)}` : phone;

/**
 * First letter for the avatar, keeping a Bengali conjunct or vowel sign together but dropping
 * a dangling hasanta ("অ্যাডমিন" → "অ", not "অ্").
 */
export const initialOf = (name: string) =>
  (
    [...new Intl.Segmenter("bn", { granularity: "grapheme" }).segment(name.trim())][0]?.segment ??
    "?"
  ).replace(/\u09CD$/, "");

type Format = Pick<I18n, "t">;

const nameOf = (members: ClubMember[], id: string) => members.find((m) => m.id === id)?.name ?? "";

/** Chanda ledger rows, oldest first, voided entries included and marked. */
export function chandaCsv(
  chanda: ChandaTransaction[],
  households: Household[],
  members: ClubMember[],
  f: Format,
): Cell[][] {
  const header = [
    "csv_receipt_no",
    "csv_date",
    "csv_resident",
    "csv_house",
    "csv_lane",
    "csv_amount",
    "csv_method",
    "csv_status",
    "csv_collector",
    "csv_void_reason",
  ] as const;
  const rows = [...chanda]
    .sort((a, b) => a.created_at.localeCompare(b.created_at))
    .map((c) => {
      const h = households.find((x) => x.id === c.household_id);
      return [
        c.receipt_no,
        c.created_at.slice(0, 10),
        h?.resident_name,
        h?.house_flat_no,
        h?.lane_block,
        c.amount,
        c.payment_method === "cash" ? f.t("cash") : f.t("upi"),
        f.t(c.voided_at ? "status_void" : `status_${c.status}`),
        nameOf(members, c.collector_id),
        c.void_reason,
      ];
    });
  return [header.map((k) => f.t(k)), ...rows];
}

/** Expense ledger rows by expense date, voided entries included and marked. */
export function expensesCsv(expenses: ExpenseRecord[], members: ClubMember[], f: Format): Cell[][] {
  const header = [
    "csv_date",
    "csv_category",
    "csv_title",
    "csv_amount",
    "csv_paid_to",
    "csv_authorized_by",
    "csv_status",
    "csv_void_reason",
  ] as const;
  const rows = [...expenses]
    .sort((a, b) => a.date.localeCompare(b.date) || a.created_at.localeCompare(b.created_at))
    .map((e) => [
      e.date,
      f.t(categoryMeta(e.category).t),
      e.title,
      e.amount,
      e.paid_to,
      nameOf(members, e.authorized_by_id),
      e.voided_at ? f.t("status_void") : "",
      e.void_reason,
    ]);
  return [header.map((k) => f.t(k)), ...rows];
}

/** "pujo-khata-chanda-sample-puja-committee-2026-2026-10-17.csv" */
export const exportFileName = (kind: "chanda" | "expenses", slug: string, today: string) =>
  `pujo-khata-${kind}-${slug}-${today}.csv`;
