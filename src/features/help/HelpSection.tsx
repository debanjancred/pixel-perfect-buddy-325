import { LifeBuoy, MessageSquarePlus } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { useHelpAvailable, useHelpRequests } from "@/hooks/use-data";
import { useSearchModal } from "@/hooks/use-search-modal";
import { Modal } from "@/components/pk/ui";
import { HelpForm } from "./HelpForm";
import { HELP_STATUS_TONE, helpStatus } from "./model";

/**
 * Settings → Help (ADR 0002 §7): report a problem and follow your requests. The form opens
 * in a sheet from the URL (`?help=true`) so the phone's back button closes it. Needs a phone
 * login in cloud mode; elsewhere (the sample club, local mode) it says so.
 */
export function HelpSection({ open }: { open?: boolean | undefined }) {
  const { t, date } = useI18n();
  const { data: available = false } = useHelpAvailable();
  const { data: requests = [] } = useHelpRequests(available);
  const sheet = useSearchModal("help");

  return (
    <section className="rounded-3xl border bg-card p-4 shadow-card" aria-labelledby="set-help">
      <h2 id="set-help" className="flex items-center gap-2 font-bold">
        <LifeBuoy className="h-5 w-5 text-primary-ink" aria-hidden /> {t("help")}
      </h2>
      {!available ? (
        <p className="mt-2 rounded-2xl bg-muted p-3 text-sm">{t("helpLoginFirst")}</p>
      ) : (
        <>
          <p className="mt-1 text-sm text-muted-foreground">{t("helpHint")}</p>
          <button
            type="button"
            className="btn btn-outline mt-3 w-full"
            onClick={() => sheet.open()}
          >
            <MessageSquarePlus className="h-5 w-5" aria-hidden /> {t("helpReport")}
          </button>
          {requests.length > 0 && (
            <div className="mt-4">
              <h3 className="mb-1 text-xs font-bold uppercase tracking-wide text-gold-ink">
                {t("helpYourRequests")}
              </h3>
              <ul className="divide-y overflow-hidden rounded-2xl border">
                {requests.map((r) => {
                  const status = helpStatus(r);
                  return (
                    <li key={r.id} className="p-3">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-sm font-semibold">{t(`help_cat_${r.category}`)}</span>
                        <span
                          className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-bold ${HELP_STATUS_TONE[status]}`}
                        >
                          {t(`helpStatus_${status}`)}
                        </span>
                      </div>
                      <p className="mt-1 line-clamp-2 text-sm">{r.message}</p>
                      <p className="mt-1 text-xs text-muted-foreground">{date(r.created_at)}</p>
                      {r.staff_note && (
                        <p className="mt-2 rounded-xl bg-success-soft p-2 text-sm">
                          <span className="font-semibold">{t("helpReply")}:</span> {r.staff_note}
                        </p>
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
        </>
      )}
      <Modal open={available && !!open} onClose={sheet.close} title={t("helpReport")}>
        <HelpForm onSent={sheet.close} />
      </Modal>
    </section>
  );
}
