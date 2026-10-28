import { useState } from "react";
import { Ban, Expand, Lock, Pencil } from "lucide-react";
import { toast } from "sonner";
import { useHandovers, usePermission, useVoidExpense } from "@/hooks/use-data";
import { VoidDialog } from "@/components/pk/VoidDialog";
import { useI18n } from "@/lib/i18n";
import { Modal, SyncBadge } from "@/components/pk/ui";
import { isVoid } from "@/lib/accounts";
import type { ClubMember, ExpenseRecord } from "@/types/domain";
import { expenseFields, expenseLocked } from "./model";
import { VoucherThumb } from "./Voucher";

/**
 * Details sheet for one expense (Story 3.2), with a way into the full-screen photo. A
 * treasurer/admin can correct it until the next cash handover involving whoever recorded it.
 */
export function ExpenseDetail({
  expense: e,
  members,
  onClose,
  onViewPhoto,
  onEdit,
}: {
  expense: ExpenseRecord;
  members: ClubMember[];
  onClose: () => void;
  onViewPhoto: () => void;
  onEdit: () => void;
}) {
  const i18n = useI18n();
  const { t, money, words } = i18n;
  const voided = isVoid(e);
  const canVoid = usePermission("entry.void") && !voided;
  const { data: handovers = [] } = useHandovers();
  const canChange = usePermission("expense.add") && !voided;
  const locked = expenseLocked(e, handovers);
  const voidExpense = useVoidExpense();
  const [voiding, setVoiding] = useState(false);

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

      {canChange &&
        (locked ? (
          <p className="mt-4 flex items-start gap-2 rounded-xl bg-muted p-3 text-sm">
            <Lock className="mt-0.5 h-4 w-4 shrink-0" aria-hidden /> {t("expenseLockedNote")}
          </p>
        ) : (
          <button type="button" className="btn btn-outline mt-4 w-full" onClick={onEdit}>
            <Pencil className="h-5 w-5" aria-hidden /> {t("edit")}
          </button>
        ))}
      {canVoid && (
        <button
          type="button"
          className="btn btn-outline mt-4 w-full text-destructive"
          onClick={() => setVoiding(true)}
        >
          <Ban className="h-5 w-5" aria-hidden /> {t("void")}
        </button>
      )}
      <button type="button" className="btn btn-primary mt-3 w-full" onClick={onClose}>
        {t("done")}
      </button>
      {voiding && (
        <VoidDialog
          summary={`${e.title} · ${money(e.amount)}`}
          onClose={() => setVoiding(false)}
          onVoid={async (reason) => {
            await voidExpense.mutateAsync({ id: e.id, reason });
            toast.success(t("voided"));
          }}
        />
      )}
    </Modal>
  );
}
