// Expense ledger view logic (SPEC Stories 3.1, 3.2). Pure functions over domain records so
// the screen, tests and (later) the accounts page share one set of rules.
import type { I18n } from "@/lib/i18n";
import { CATEGORIES } from "@/lib/categories";
import { isVoid } from "@/lib/accounts";
import type { ClubMember, ExpenseCategory, ExpenseRecord, UserRole } from "@/types/domain";

export type CategoryFilter = ExpenseCategory | "all";

export const EXPENSE_CATEGORIES = CATEGORIES.map((c) => c.key) as [
  ExpenseCategory,
  ...ExpenseCategory[],
];

export const categoryMeta = (key: ExpenseCategory) => CATEGORIES.find((c) => c.key === key)!;

/** Newest expense date first; same-day entries by when they were recorded. */
export const sortExpenses = (list: ExpenseRecord[]) =>
  [...list].sort(
    (a, b) => b.date.localeCompare(a.date) || b.created_at.localeCompare(a.created_at),
  );

export const filterExpenses = (list: ExpenseRecord[], filter: CategoryFilter) =>
  filter === "all" ? list : list.filter((e) => e.category === filter);

export interface CategoryTotal {
  category: ExpenseCategory;
  total: number;
  count: number;
}

export interface ExpenseTotals {
  total: number;
  count: number;
  /** Every category in display order, including empty ones. */
  byCategory: CategoryTotal[];
}

/** Totals exclude voided expenses (SPEC Section 6); voided rows stay listed for audit. */
export function expenseTotals(list: ExpenseRecord[]): ExpenseTotals {
  const live = list.filter((e) => !isVoid(e));
  const byCategory = EXPENSE_CATEGORIES.map((category) => {
    const rows = live.filter((e) => e.category === category);
    return { category, total: rows.reduce((s, e) => s + e.amount, 0), count: rows.length };
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

// --- Detail view --------------------------------------------------------------------------

export type ExpenseFieldKey = "category" | "paidTo" | "date" | "approvedBy" | "recorded";

export interface ExpenseField {
  key: ExpenseFieldKey;
  label: string;
  value: string;
}

type Format = Pick<I18n, "t" | "date">;

export function expenseFields(e: ExpenseRecord, members: ClubMember[], f: Format): ExpenseField[] {
  const meta = categoryMeta(e.category);
  return [
    { key: "category", label: f.t("category"), value: `${meta.emoji} ${f.t(meta.t)}` },
    { key: "paidTo", label: f.t("paidTo"), value: e.paid_to },
    // A bare "YYYY-MM-DD" parses as UTC midnight; pin it to local midnight instead.
    { key: "date", label: f.t("date"), value: f.date(`${e.date}T00:00:00`) },
    {
      key: "approvedBy",
      label: f.t("approvedBy"),
      value: members.find((m) => m.id === e.authorized_by_id)?.name ?? "—",
    },
    { key: "recorded", label: f.t("recorded"), value: f.date(e.created_at) },
  ];
}
