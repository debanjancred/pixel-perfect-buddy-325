import { useState } from "react";
import { ExternalLink, Megaphone, RefreshCw, Wrench, X } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { appStatus, visibleAnnouncement, type AppConfig } from "@/lib/app-status";
import { APP_VERSION } from "@/lib/version";
import { announcementClosed, closeAnnouncement } from "@/services/app-config";

/** Reloads into the newest version: ask the service worker to fetch it first. */
async function updateNow() {
  try {
    const reg = await navigator.serviceWorker?.getRegistration();
    await reg?.update();
  } catch {
    /* a plain reload still fetches the new pages */
  }
  location.reload();
}

/**
 * The owner's notices under the header (ADR 0002 §3), above the sync strip: "update required"
 * when this app is too old, maintenance, and a closable announcement. Like the sync strip it
 * sits in the header's flow, never over the page.
 */
export function AppNotice({ config }: { config: AppConfig | null }) {
  const { t, pick } = useI18n();
  const [closed, setClosed] = useState(announcementClosed);
  const status = appStatus(config, APP_VERSION);
  const announcement = visibleAnnouncement(config, closed);

  if (status.updateRequired)
    return (
      <div
        role="alert"
        className="flex min-h-12 items-center justify-between gap-2 bg-primary-soft px-4 py-1.5 text-xs font-semibold text-primary-ink"
      >
        <span className="min-w-0">{t("updateRequired")}</span>
        <button
          type="button"
          className="tap inline-flex shrink-0 items-center gap-1.5 rounded-full px-2 font-bold underline"
          onClick={() => void updateNow()}
        >
          <RefreshCw className="h-4 w-4" aria-hidden /> {t("updateNow")}
        </button>
      </div>
    );

  return (
    <>
      {status.maintenance && config && (
        <div
          role="status"
          className="flex items-start gap-2 bg-info-soft px-4 py-2 text-xs font-semibold text-info"
        >
          <Wrench className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          <span>
            {pick(
              config.maintenance_message_bn ||
                config.maintenance_message_en ||
                t("maintenanceText"),
              config.maintenance_message_en ||
                config.maintenance_message_bn ||
                t("maintenanceText"),
            )}{" "}
            {t("maintenanceSafe")}
          </span>
        </div>
      )}
      {announcement && (
        <div
          role="status"
          className="flex items-center gap-2 bg-gold-soft py-1 pl-4 pr-1 text-xs font-semibold text-gold-ink"
        >
          <Megaphone className="h-4 w-4 shrink-0" aria-hidden />
          <span className="min-w-0 flex-1">
            {pick(announcement.bn, announcement.en)}
            {announcement.url && (
              <a
                href={announcement.url}
                target="_blank"
                rel="noreferrer"
                className="ml-1 inline-flex items-center gap-0.5 font-bold underline"
              >
                {t("announcementMore")} <ExternalLink className="h-3 w-3" aria-hidden />
              </a>
            )}
          </span>
          <button
            type="button"
            className="tap flex shrink-0 items-center justify-center rounded-full"
            aria-label={t("announcementClose")}
            onClick={() => {
              closeAnnouncement(announcement.id);
              setClosed(announcement.id);
            }}
          >
            <X className="h-4 w-4" aria-hidden />
          </button>
        </div>
      )}
    </>
  );
}
