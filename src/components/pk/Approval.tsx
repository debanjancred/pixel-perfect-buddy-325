import { Ban, CircleX, Hourglass } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { isRejected, isVoid, isWaiting } from "@/lib/accounts";
import type { EntryReview } from "@/types/domain";

type Entry = EntryReview & { status?: string; voided_at?: string };

/** Where an entry stands with the admin (ADR 0003), as a small pill next to the sync badge. */
export function ApprovalBadge({ entry }: { entry: Entry }) {
  const { t } = useI18n();
  if (isVoid(entry)) return null;
  if (isRejected(entry))
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-primary-soft px-2 py-0.5 text-[11px] font-bold text-primary-ink">
        <CircleX className="h-3 w-3" aria-hidden /> {t("approvalRejected")}
      </span>
    );
  if (entry.void_requested_at)
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-primary-soft px-2 py-0.5 text-[11px] font-bold text-primary-ink">
        <Ban className="h-3 w-3" aria-hidden /> {t("voidRequested")}
      </span>
    );
  if (isWaiting(entry))
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-info-soft px-2 py-0.5 text-[11px] font-bold text-info">
        <Hourglass className="h-3 w-3" aria-hidden /> {t("approvalWaiting")}
      </span>
    );
  return null;
}

/** The admin's decision, spelled out, for detail views (expense sheet, receipt page). */
export function ApprovalNote({ entry }: { entry: Entry }) {
  const { t } = useI18n();
  if (isVoid(entry)) return null;
  const note = (tone: string, title: string, reason?: string | null) => (
    <p role="status" className={`rounded-xl p-3 text-sm font-bold ${tone}`}>
      {title}
      {reason && (
        <span className="block font-medium">
          {t("voidReason")}: {reason}
        </span>
      )}
    </p>
  );
  if (isRejected(entry))
    return note("bg-primary-soft text-primary-ink", t("rejectedNote"), entry.rejection_reason);
  if (entry.void_requested_at)
    return note(
      "bg-primary-soft text-primary-ink",
      t("voidRequestedNote"),
      entry.void_request_reason,
    );
  if (entry.void_declined_at)
    return note("bg-muted", t("voidDeclinedNote"), entry.void_declined_reason);
  if (isWaiting(entry)) return note("bg-info-soft text-info", t("pendingNote"));
  return null;
}
