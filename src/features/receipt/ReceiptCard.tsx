import { useI18n } from "@/lib/i18n";
import { AlponaStrip } from "@/components/pk/ui";
import { amountInWords, clubName, receiptFields, type Receipt } from "./model";

/** The receipt itself, as shown on screen and printed. Purely presentational. */
export function ReceiptCard({ receipt: r }: { receipt: Receipt }) {
  const f = useI18n();
  return (
    <article
      aria-label={`${f.t("receipt")} ${r.receipt_no}`}
      className="relative overflow-hidden rounded-2xl border-2 border-gold/60 bg-card"
    >
      <header className="bg-hero px-4 pb-4 pt-1 text-center text-primary-foreground">
        <AlponaStrip />
        <div className="mt-2 text-xs font-semibold uppercase tracking-wide opacity-90">
          {f.t("receipt")}
        </div>
        <div className="text-lg font-bold leading-snug">{clubName(r, f)}</div>
        <div className="text-xs opacity-90">{r.club.area_label}</div>
      </header>

      <div className="p-4 text-[15px]">
        <div className="text-center">
          <div className="text-xs text-muted-foreground">{f.t("receiptNo")}</div>
          <div className="font-mono text-lg font-bold text-primary">{r.receipt_no}</div>
        </div>

        {r.voided && (
          <p
            role="status"
            className="mt-3 rounded-xl bg-primary-soft p-2 text-center text-sm font-bold text-primary"
          >
            {f.t(r.rejected ? "receiptRejectedNote" : "receiptVoidNote")}
            {r.void_reason && <span className="block font-medium">{r.void_reason}</span>}
          </p>
        )}

        <dl className="mt-3 space-y-2">
          {receiptFields(r, f).map((x) => (
            <div
              key={x.key}
              className="flex items-start justify-between gap-3 border-b border-dashed pb-2"
            >
              <dt className="shrink-0 text-muted-foreground">{x.label}</dt>
              <dd className={x.key === "donor" ? "text-right font-bold" : "text-right"}>
                {x.value}
              </dd>
            </div>
          ))}
        </dl>

        <div className="mt-4 rounded-xl bg-gold-soft p-3 text-center">
          <div className="num text-3xl font-extrabold text-primary">{f.money(r.amount)}</div>
          <div className="mt-1 text-sm font-semibold text-gold-ink">{amountInWords(r, f)}</div>
        </div>

        <p className="mt-4 text-center text-sm font-semibold">{f.t("receiptThanks")}</p>
        <p className="mt-1 text-center text-xs text-muted-foreground">{f.t("receiptFooter")}</p>
      </div>

      {r.voided && (
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 flex items-center justify-center"
        >
          <span className="-rotate-[20deg] text-7xl font-extrabold text-primary/15">
            {f.t("receiptVoid")}
          </span>
        </div>
      )}
    </article>
  );
}
