import { useI18n } from "@/lib/i18n";
import type { AccountsSummary } from "@/types/domain";
import { cashPct } from "./model";

/**
 * Section 6 summary: net balance (vermilion when negative), collected vs spent, pledges
 * shown apart from collections, and progress towards the target.
 */
export function AccountsOverview({ summary: s }: { summary: AccountsSummary }) {
  const { t, n, money } = useI18n();
  const negative = s.net_balance < 0;
  return (
    <section className="rounded-3xl border bg-card p-5 shadow-card" aria-labelledby="acc-balance">
      <div id="acc-balance" className="text-sm font-semibold text-muted-foreground">
        {t("balance")}
      </div>
      <div className={`num text-4xl font-extrabold ${negative ? "text-primary" : ""}`}>
        {money(s.net_balance)}
      </div>

      <dl className="mt-4 grid grid-cols-2 gap-3">
        <div className="rounded-2xl bg-success-soft p-3">
          <dt className="text-xs font-semibold text-success">{t("collected")}</dt>
          <dd className="num text-xl font-bold">{money(s.total_collected)}</dd>
        </div>
        <div className="rounded-2xl bg-primary-soft p-3">
          <dt className="text-xs font-semibold text-primary">{t("spent")}</dt>
          <dd className="num text-xl font-bold">{money(s.total_expenses)}</dd>
        </div>
      </dl>
      {s.total_promised > 0 && (
        <p className="mt-3 text-sm text-muted-foreground">
          {t("promised")}: <span className="num font-semibold">{money(s.total_promised)}</span>
        </p>
      )}

      <div className="mt-4">
        <div className="mb-1.5 flex items-center justify-between text-sm">
          <span>
            {t("target")} <span className="num font-semibold">{money(s.collection_target)}</span>
          </span>
          <span className="num font-bold">{n(String(s.progress_pct))}%</span>
        </div>
        <div
          className="h-3 overflow-hidden rounded-full bg-muted"
          role="progressbar"
          aria-label={t("target")}
          aria-valuenow={s.progress_pct}
          aria-valuemin={0}
          aria-valuemax={100}
        >
          <div className="h-full rounded-full bg-gold" style={{ width: `${s.progress_pct}%` }} />
        </div>
      </div>
    </section>
  );
}

/** Collected split by payment method: one stacked bar plus a labelled legend. */
export function CollectionSplit({ summary: s }: { summary: AccountsSummary }) {
  const { t, n, money } = useI18n();
  const cash = cashPct(s);
  const parts = [
    { key: "cash", label: t("cash"), value: s.collected_cash, pct: cash, color: "var(--chart-1)" },
    {
      key: "upi",
      label: t("upi"),
      value: s.collected_upi,
      pct: 100 - cash,
      color: "var(--chart-2)",
    },
  ];
  return (
    <section className="rounded-3xl border bg-card p-4 shadow-card" aria-labelledby="acc-split">
      <h2 id="acc-split" className="font-bold">
        {t("collected")}: {t("cash")} / {t("upi")}
      </h2>
      {s.total_collected > 0 ? (
        <>
          {/* 2px surface gap between segments; rounded outer ends. */}
          <div className="mt-3 flex h-4 gap-0.5 overflow-hidden rounded-full" aria-hidden>
            {parts
              .filter((p) => p.value > 0)
              .map((p) => (
                <div key={p.key} style={{ width: `${p.pct}%`, background: p.color }} />
              ))}
          </div>
          <ul className="mt-3 space-y-1.5 text-sm">
            {parts.map((p) => (
              <li key={p.key} className="flex items-center gap-2">
                <span className="h-3 w-3 shrink-0 rounded-full" style={{ background: p.color }} />
                <span className="flex-1">{p.label}</span>
                <span className="num font-semibold">{money(p.value)}</span>
                <span className="num w-12 text-right text-muted-foreground">
                  {n(String(p.pct))}%
                </span>
              </li>
            ))}
          </ul>
        </>
      ) : (
        <p className="mt-2 text-sm text-muted-foreground">{t("noActivity")}</p>
      )}
    </section>
  );
}
