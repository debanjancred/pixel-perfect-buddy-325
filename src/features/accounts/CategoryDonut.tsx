import { useState } from "react";
import { useI18n } from "@/lib/i18n";
import { categoryInfo } from "@/lib/categories";
import type { CategoryShare } from "./model";
import { donutArcs } from "./donut";

const SIZE = 224;
const THICKNESS = 40;

/**
 * Spending by category (SPEC SHOULD: donut), drawn as plain SVG. The table below is the
 * accessible version and carries every label (some slice colours are under 3:1).
 */
export function CategoryDonut({ shares, total }: { shares: CategoryShare[]; total: number }) {
  const { t, n, money } = useI18n();
  const data = shares.map((s) => ({ ...s, name: categoryInfo(s.key, t).label }));
  const arcs = donutArcs(
    data.map((d) => d.total),
    SIZE,
    THICKNESS,
  );
  // Hover (mouse) or tap (touch) a slice: the centre shows its name and amount.
  const [active, setActive] = useState<number | null>(null);
  const focus = active !== null ? data[active] : undefined;
  return (
    <section className="rounded-3xl border bg-card p-4 shadow-card" aria-labelledby="acc-cat">
      <h2 id="acc-cat" className="font-bold">
        {t("byCategory")}
      </h2>
      {data.length === 0 ? (
        <p className="mt-2 text-sm text-muted-foreground">{t("noExpenses")}</p>
      ) : (
        <>
          <div className="relative mx-auto mt-2 aspect-square w-56" aria-hidden>
            <svg
              viewBox={`0 0 ${SIZE} ${SIZE}`}
              className="h-full w-full"
              onMouseLeave={() => setActive(null)}
            >
              {arcs.map((a, i) =>
                a.d ? (
                  <path
                    key={data[i]!.key}
                    d={a.d}
                    fill={data[i]!.color}
                    fillRule="evenodd"
                    opacity={active === null || active === i ? 1 : 0.35}
                    className="cursor-pointer transition-opacity"
                    onMouseEnter={() => setActive(i)}
                    onClick={() => setActive(active === i ? null : i)}
                  />
                ) : null,
              )}
            </svg>
            <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center px-12 text-center">
              <span className="text-xs text-muted-foreground">
                {focus ? focus.name : t("spent")}
              </span>
              <span className="num text-lg font-extrabold">
                {money(focus ? focus.total : total)}
              </span>
              {focus && (
                <span className="num text-xs text-muted-foreground">{n(String(focus.pct))}%</span>
              )}
            </div>
          </div>
          <table className="mt-3 w-full text-sm">
            <caption className="sr-only">{t("byCategory")}</caption>
            <tbody>
              {data.map((d) => (
                <tr key={d.key} className="border-b border-dashed last:border-0">
                  <th scope="row" className="py-2 text-left font-normal">
                    <span className="inline-flex items-center gap-2">
                      <span
                        className="h-3 w-3 shrink-0 rounded-full"
                        style={{ background: d.color }}
                        aria-hidden
                      />
                      {d.name}
                    </span>
                  </th>
                  <td className="num py-2 text-right font-semibold">{money(d.total)}</td>
                  <td className="num w-14 py-2 text-right text-muted-foreground">
                    {n(String(d.pct))}%
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </section>
  );
}
