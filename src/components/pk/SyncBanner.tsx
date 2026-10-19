import { useState } from "react";
import { useI18n } from "@/lib/i18n";
import { useSyncFailures } from "@/hooks/use-data";
import { Modal, Spinner } from "./ui";

/**
 * Story 5.1 status strip under the header: the offline notice, or failed records with a
 * retry and the server's reason for each. It sits in the sticky header's flow, never as an
 * overlay, so it can't cover inputs or the Save button.
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
  const [why, setWhy] = useState(false);
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
      className="flex items-center justify-between gap-2 bg-primary-soft px-4 py-1 text-xs font-semibold text-primary"
    >
      <span className="min-w-0">{t("syncFailedCount", { count: n(String(failed)) })}</span>
      <div className="flex shrink-0 items-center">
        <button
          type="button"
          className="tap rounded-full px-2 font-bold underline"
          onClick={() => setWhy(true)}
        >
          {t("syncWhy")}
        </button>
        <button
          type="button"
          className="tap inline-flex items-center gap-1.5 rounded-full px-2 font-bold underline"
          disabled={retrying}
          aria-busy={retrying}
          onClick={onRetry}
        >
          {retrying && <Spinner className="h-4 w-4" />}
          {t("retry")}
        </button>
      </div>
      {why && <SyncFailures onClose={() => setWhy(false)} />}
    </div>
  );
}

function SyncFailures({ onClose }: { onClose: () => void }) {
  const { t, money } = useI18n();
  const { data: failures, isPending } = useSyncFailures(true);
  return (
    <Modal open onClose={onClose} title={t("syncFailuresTitle")}>
      <p className="text-sm text-muted-foreground">{t("syncFailuresHint")}</p>
      {isPending ? (
        <div className="mt-3 h-24 animate-pulse rounded-2xl bg-muted" aria-busy="true" />
      ) : (
        <ul className="mt-3 divide-y rounded-2xl border">
          {failures?.map((f) => (
            <li key={f.id} className="p-3">
              <div className="flex items-baseline justify-between gap-3">
                <span className="min-w-0 truncate font-semibold text-foreground">
                  {t(`sync_kind_${f.kind}`)} · {f.title}
                </span>
                {f.amount !== undefined && (
                  <span className="num shrink-0 font-bold text-foreground">{money(f.amount)}</span>
                )}
              </div>
              <p className="mt-1 text-sm font-medium text-destructive">{t(f.error)}</p>
            </li>
          ))}
        </ul>
      )}
    </Modal>
  );
}
