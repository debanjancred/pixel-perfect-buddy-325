import { Expand } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { Modal, SyncBadge } from "@/components/pk/ui";
import { isVoid } from "@/lib/accounts";
import type { ClubMember, ExpenseRecord } from "@/types/domain";
import { expenseFields } from "./model";
import { VoucherThumb } from "./Voucher";

/** Details sheet for one expense (Story 3.2), with a way into the full-screen photo. */
export function ExpenseDetail({
  expense: e,
  members,
  onClose,
  onViewPhoto,
}: {
  expense: ExpenseRecord;
  members: ClubMember[];
  onClose: () => void;
  onViewPhoto: () => void;
}) {
  const i18n = useI18n();
  const { t, money, words } = i18n;
  const voided = isVoid(e);

  return (
    <Modal open onClose={onClose} title={t("expenseDetails")}>
      {voided && (
        <p
          role="status"
          className="mb-4 rounded-xl bg-primary-soft p-3 text-sm font-bold text-primary"
        >
          {t("voidedExpense")}
          {e.void_reason && (
            <span className="block font-medium">
              {t("voidReason")}: {e.void_reason}
            </span>
          )}
        </p>
      )}

      <div className="text-center">
        <div className={`text-lg font-bold ${voided ? "line-through" : ""}`}>{e.title}</div>
        <div className={`num text-4xl font-extrabold text-primary ${voided ? "line-through" : ""}`}>
          {money(e.amount)}
        </div>
        <div className="mt-1 text-sm font-semibold text-gold-ink">
          {t("amountInWords", { words: words(e.amount) })}
        </div>
      </div>

      <dl className="mt-4 space-y-2 text-[15px]">
        {expenseFields(e, members, i18n).map((f) => (
          <div
            key={f.key}
            className="flex items-start justify-between gap-3 border-b border-dashed pb-2"
          >
            <dt className="shrink-0 text-muted-foreground">{f.label}</dt>
            <dd className="text-right font-medium">{f.value}</dd>
          </div>
        ))}
        <div className="flex items-center justify-between gap-3 pb-2">
          <dt className="text-muted-foreground">{t("syncStatus")}</dt>
          <dd>
            {e.sync_status === "pending" ? (
              <SyncBadge status="pending" />
            ) : (
              <span className={e.sync_status === "failed" ? "font-bold text-destructive" : ""}>
                {e.sync_status === "failed" ? t("syncFailed") : t("syncedOne")}
              </span>
            )}
          </dd>
        </div>
      </dl>

      <div className="mt-4">
        {e.voucher_image_id ? (
          <button
            type="button"
            onClick={onViewPhoto}
            className="flex w-full items-center gap-3 rounded-2xl border bg-card p-2 pr-4 text-left font-semibold"
          >
            <VoucherThumb id={e.voucher_image_id} className="h-20 w-20" />
            <span className="flex-1">{t("viewPhoto")}</span>
            <Expand className="h-5 w-5 text-muted-foreground" aria-hidden />
          </button>
        ) : (
          <p className="rounded-2xl border border-dashed p-3 text-center text-sm text-muted-foreground">
            {t("noPhoto")}
          </p>
        )}
      </div>

      <button type="button" className="btn btn-primary mt-4 w-full" onClick={onClose}>
        {t("done")}
      </button>
    </Modal>
  );
}
