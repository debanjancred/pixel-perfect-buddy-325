import { useI18n } from "@/lib/i18n";
import { CATEGORIES } from "@/lib/categories";
import type { CategoryFilter, ExpenseTotals } from "./model";

/** Story 3.2 filter: All + one chip per category (chips are ≥ 48px via `.chip`). */
export function CategoryChips({
  value,
  totals,
  onChange,
}: {
  value: CategoryFilter;
  totals: ExpenseTotals;
  onChange: (next: CategoryFilter) => void;
}) {
  const { t, n } = useI18n();
  const count = (k: CategoryFilter) =>
    k === "all" ? totals.count : totals.byCategory.find((c) => c.category === k)!.count;
  const chips: { key: CategoryFilter; label: string }[] = [
    { key: "all", label: t("all") },
    ...CATEGORIES.map((c) => ({ key: c.key, label: `${c.emoji} ${t(c.t)}` })),
  ];
  return (
    <div
      className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4"
      role="group"
      aria-label={t("category")}
    >
      {chips.map((c) => (
        <button
          key={c.key}
          type="button"
          className="chip"
          data-active={value === c.key}
          aria-pressed={value === c.key}
          onClick={() => onChange(c.key)}
        >
          {c.label} <span className="num">{n(String(count(c.key)))}</span>
        </button>
      ))}
    </div>
  );
}
