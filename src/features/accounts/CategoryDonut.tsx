import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { useI18n } from "@/lib/i18n";
import { categoryMeta } from "@/features/expenses";
import type { CategoryShare } from "./model";

/**
 * Spending by category (SPEC SHOULD: donut). The legend below doubles as the table view
 * and carries every label, since some slice colours are under 3:1 on the card.
 */
export function CategoryDonut({ shares, total }: { shares: CategoryShare[]; total: number }) {
  const { t, n, money } = useI18n();
  const data = shares.map((s) => ({ ...s, name: t(categoryMeta(s.category).t) }));
  return (
    <section className="rounded-3xl border bg-card p-4 shadow-card" aria-labelledby="acc-cat">
      <h2 id="acc-cat" className="font-bold">
        {t("byCategory")}
      </h2>
      {data.length === 0 ? (
        <p className="mt-2 text-sm text-muted-foreground">{t("noExpenses")}</p>
      ) : (
        <>
          <div className="relative mx-auto mt-2 h-56 max-w-64" aria-hidden>
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={data}
                  dataKey="total"
                  nameKey="name"
                  innerRadius="62%"
                  outerRadius="92%"
                  startAngle={90}
                  endAngle={-270}
                  stroke="var(--card)"
                  strokeWidth={2}
                  isAnimationActive={false}
                  // Decorative for keyboard/screen-reader users: the table below carries the data.
                  rootTabIndex={-1}
                >
                  {data.map((d) => (
                    <Cell key={d.category} fill={d.color} />
                  ))}
                </Pie>
                <Tooltip
                  formatter={(v: number, name: string) => [money(v), name]}
                  contentStyle={{
                    background: "var(--popover)",
                    border: "1px solid var(--border)",
                    borderRadius: 12,
                    color: "var(--popover-foreground)",
                  }}
                  itemStyle={{ color: "var(--popover-foreground)" }}
                />
              </PieChart>
            </ResponsiveContainer>
            <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-xs text-muted-foreground">{t("spent")}</span>
              <span className="num text-lg font-extrabold">{money(total)}</span>
            </div>
          </div>
          <table className="mt-3 w-full text-sm">
            <caption className="sr-only">{t("byCategory")}</caption>
            <tbody>
              {data.map((d) => (
                <tr key={d.category} className="border-b border-dashed last:border-0">
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
