import { useI18n } from "@/lib/i18n";
import { categoryInfo } from "@/lib/categories";
import type { CategoryFilter, ExpenseTotals } from "./model";

/**
 * Story 3.2 subtotals above the list. "All" shows the total with a per-category breakdown
 * (each row filters to that category); a category shows its own subtotal.
 */
export function ExpenseSummary({
  totals,
  filter,
  onPick,
}: {
  totals: ExpenseTotals;
  filter: CategoryFilter;
  onPick: (c: CategoryFilter) => void;
}) {
  const { t, n, money } = useI18n();
  const current =
    filter === "all"
      ? { total: totals.total, count: totals.count }
      : (totals.byCategory.find((c) => c.key === filter) ?? { total: 0, count: 0 });
  const used = totals.byCategory.filter((c) => c.total > 0);
  const label = filter === "all" ? t("spent") : categoryInfo(filter, t).label;

  return (
    <section className="rounded-2xl bg-primary-soft p-4" aria-label={label}>
      <div className="flex items-baseline justify-between gap-3">
        <span className="font-semibold text-primary">{label}</span>
        <span className="num text-2xl font-extrabold text-primary">{money(current.total)}</span>
      </div>
      <div className="text-xs text-muted-foreground">
        {n(String(current.count))} {t("entries")}
      </div>

      {filter === "all" && used.length > 0 && (
        <>
          <div className="mt-3 flex h-2.5 overflow-hidden rounded-full bg-card" aria-hidden>
            {used.map((c) => (
              <div
                key={c.key}
                style={{
                  width: `${(c.total / totals.total) * 100}%`,
                  background: categoryInfo(c.key, t).color,
                }}
              />
            ))}
          </div>
          <ul className="mt-3 grid grid-cols-2 gap-2">
            {used.map((c) => {
              const info = categoryInfo(c.key, t);
              return (
                <li key={c.key}>
                  <button
                    type="button"
                    onClick={() => onPick(c.key)}
                    className="flex min-h-12 w-full flex-col justify-center rounded-xl bg-card px-3 py-1.5 text-left"
                  >
                    <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <span
                        className="h-2.5 w-2.5 shrink-0 rounded-full"
                        style={{ background: info.color }}
                        aria-hidden
                      />
                      <span className="truncate">{info.label}</span>
                    </span>
                    <span className="num font-bold">{money(c.total)}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </section>
  );
}
