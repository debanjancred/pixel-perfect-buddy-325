// Expense ledger view logic (SPEC Stories 3.1, 3.2). Pure functions over domain records so
// the screen, tests and the accounts page share one set of rules.
import type { I18n } from "@/lib/i18n";
import {
  CATEGORIES,
  categoryInfo,
  categoryKeyOf,
  customCategoryKeys,
  type CategoryKey,
} from "@/lib/categories";
import { isVoid } from "@/lib/accounts";
import { asciiDigits } from "@/lib/format";
import type { ClubMember, ExpenseCategory, ExpenseRecord, UserRole } from "@/types/domain";

export type CategoryFilter = CategoryKey | "all";

export const EXPENSE_CATEGORIES = CATEGORIES.map((c) => c.key) as [
  ExpenseCategory,
  ...ExpenseCategory[],
];

/** Newest expense date first; same-day entries by when they were recorded. */
export const sortExpenses = (list: ExpenseRecord[]) =>
  [...list].sort(
    (a, b) => b.date.localeCompare(a.date) || b.created_at.localeCompare(a.created_at),
  );

export const filterExpenses = (list: ExpenseRecord[], filter: CategoryFilter) =>
  filter === "all" ? list : list.filter((e) => categoryKeyOf(e) === filter);

/**
 * Search by item name, payee or date — as stored (2026-10-12) or as shown (12 October 2026,
 * Bengali digits included). An empty query keeps everything.
 */
export function searchExpenses(
  list: ExpenseRecord[],
  query: string,
  shownDate: (iso: string) => string,
) {
  const q = asciiDigits(query).trim().toLowerCase();
  if (!q) return list;
  return list.filter((e) =>
    [e.title, e.paid_to, e.date, shownDate(e.date)].some((x) =>
      asciiDigits(x).toLowerCase().includes(q),
    ),
  );
}

export interface CategoryTotal {
  key: CategoryKey;
  total: number;
  count: number;
}

export interface ExpenseTotals {
  total: number;
  count: number;
  /** Built-in categories in display order (empty ones included), then the club's own A→Z. */
  byCategory: CategoryTotal[];
}

/** Totals exclude voided expenses (SPEC Section 6); voided rows stay listed for audit. */
export function expenseTotals(list: ExpenseRecord[]): ExpenseTotals {
  const live = list.filter((e) => !isVoid(e));
  const keys: CategoryKey[] = [...EXPENSE_CATEGORIES, ...customCategoryKeys(list)];
  const byCategory = keys.map((key) => {
    const rows = live.filter((e) => categoryKeyOf(e).toLowerCase() === key.toLowerCase());
    return { key, total: rows.reduce((s, e) => s + e.amount, 0), count: rows.length };
  });
  return {
    total: byCategory.reduce((s, c) => s + c.total, 0),
    count: live.length,
    byCategory,
  };
}

// --- Authorisation (Story 3.1) ------------------------------------------------------------

const APPROVER_ROLES: readonly UserRole[] = ["admin", "treasurer"];

export const canAuthorize = (m: Pick<ClubMember, "role"> | undefined) =>
  !!m && APPROVER_ROLES.includes(m.role);

export const approversOf = (members: ClubMember[]) => members.filter(canAuthorize);

/** The current member when they may authorise; otherwise the first treasurer/admin. */
export function defaultApprover(members: ClubMember[], me: ClubMember | undefined) {
  const approvers = approversOf(members);
  return (
    (canAuthorize(me) ? me : undefined) ??
    approvers.find((m) => m.role === "treasurer") ??
    approvers[0]
  );
}

// Editing (UAT 2026-10-28): the lock rule is shared with api.ts.
export { expenseLocked } from "@/lib/expense-lock";

// --- Detail view --------------------------------------------------------------------------

export type ExpenseFieldKey = "category" | "paidTo" | "date" | "approvedBy" | "recorded" | "edited";

export interface ExpenseField {
  key: ExpenseFieldKey;
  label: string;
  value: string;
}

type Format = Pick<I18n, "t" | "date">;

export function expenseFields(e: ExpenseRecord, members: ClubMember[], f: Format): ExpenseField[] {
  const info = categoryInfo(categoryKeyOf(e), f.t);
  const name = (id: string | null | undefined) => members.find((m) => m.id === id)?.name ?? "—";
  return [
    { key: "category", label: f.t("category"), value: `${info.emoji} ${info.label}` },
    { key: "paidTo", label: f.t("paidTo"), value: e.paid_to },
    // A bare "YYYY-MM-DD" parses as UTC midnight; pin it to local midnight instead.
    { key: "date", label: f.t("date"), value: f.date(`${e.date}T00:00:00`) },
    { key: "approvedBy", label: f.t("approvedBy"), value: name(e.authorized_by_id) },
    { key: "recorded", label: f.t("recorded"), value: f.date(e.created_at) },
    ...(e.edited_at
      ? [
          {
            key: "edited" as const,
            label: f.t("editedOn"),
            value: `${f.date(e.edited_at)}${e.edited_by_id ? ` · ${name(e.edited_by_id)}` : ""}`,
          },
        ]
      : []),
  ];
}
