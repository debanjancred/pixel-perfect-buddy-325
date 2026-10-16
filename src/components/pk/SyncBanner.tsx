import { useI18n } from "@/lib/i18n";

/**
 * Story 5.1 status strip under the header: the offline notice, or failed records with a
 * retry. It sits in the sticky header's flow, never as an overlay, so it can't cover
 * inputs or the Save button.
 */
export function SyncBanner({
  online,
  failed,
  retrying,
  onRetry,
}: {
  online: boolean;
  failed: number;
  retrying: boolean;
  onRetry: () => void;
}) {
  const { t, n } = useI18n();
  if (!online)
    return (
      <div
        role="status"
        className="bg-warning-soft px-4 py-1.5 text-center text-xs font-semibold text-warning"
      >
        {t("offlineBanner")}
      </div>
    );
  if (!failed) return null;
  return (
    <div
      role="alert"
      className="flex items-center justify-between gap-3 bg-primary-soft px-4 py-1 text-xs font-semibold text-primary"
    >
      <span>{t("syncFailedCount", { count: n(String(failed)) })}</span>
      <button
        type="button"
        className="tap rounded-full px-3 font-bold underline"
        disabled={retrying}
        onClick={onRetry}
      >
        {t("retry")}
      </button>
    </div>
  );
}
