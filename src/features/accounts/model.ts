// Accounts overview logic (SPEC Story 4.1, Section 6). Pure: category shares and the
// share-summary text, on top of the Section 6 summary computed in lib/accounts.
import type { I18n } from "@/lib/i18n";
import type { AccountsSummary, Club, ExpenseRecord } from "@/types/domain";
import { categoryColor, type CategoryKey } from "@/lib/categories";
import { expenseTotals } from "@/features/expenses";

export interface CategoryShare {
  key: CategoryKey;
  total: number;
  /** Whole percent; all shares add up to exactly 100. */
  pct: number;
  color: string;
}

/**
 * Non-void spending per category, largest first, with percentages rounded by the
 * largest-remainder method so the legend never sums to 99% or 101%.
 */
export function categoryShares(expenses: ExpenseRecord[]): CategoryShare[] {
  return sharesFromTotals(expenseTotals(expenses).byCategory);
}

/** Same as categoryShares, from per-category totals (e.g. the server's public summary). */
export function sharesFromTotals(totals: { key: CategoryKey; total: number }[]): CategoryShare[] {
  const used = totals.filter((c) => c.total > 0);
  const total = used.reduce((s, c) => s + c.total, 0);
  if (!total) return [];
  const exact = used.map((c) => (c.total / total) * 100);
  const pct = exact.map(Math.floor);
  let left = 100 - pct.reduce((s, p) => s + p, 0);
  exact
    .map((x, i) => ({ i, rem: x - Math.floor(x) }))
    .sort((a, b) => b.rem - a.rem)
    .forEach(({ i }) => {
      if (left-- > 0) pct[i]! += 1;
    });
  return used
    .map((c, i) => ({
      key: c.key,
      total: c.total,
      pct: pct[i]!,
      color: categoryColor(c.key),
    }))
    .sort((a, b) => b.total - a.total);
}

/** Cash share of collections as a whole percent (0 when nothing is collected). */
export const cashPct = (s: AccountsSummary) =>
  s.total_collected ? Math.round((s.collected_cash / s.total_collected) * 100) : 0;

type Format = Pick<I18n, "t" | "n" | "money" | "pick">;

/** Self-contained WhatsApp summary (Story 4.1); no link until the Phase 2 backend. */
export function accountsShareText(club: Club, s: AccountsSummary, f: Format) {
  return [
    `📢 *${f.pick(club.name_bn, club.name_en)}*`,
    f.t("publicAudit"),
    "",
    `${f.t("collected")}: *${f.money(s.total_collected)}*`,
    `  ${f.t("cash")} ${f.money(s.collected_cash)} · ${f.t("upi")} ${f.money(s.collected_upi)}`,
    `${f.t("spent")}: *${f.money(s.total_expenses)}*`,
    `${f.t("balance")}: *${f.money(s.net_balance)}*`,
    ...(s.total_promised ? [`${f.t("promised")}: ${f.money(s.total_promised)}`] : []),
    `${f.t("target")}: ${f.money(s.collection_target)} (${f.n(String(s.progress_pct))}%)`,
    "",
    `— ${f.t("app")}`,
  ].join("\n");
}
