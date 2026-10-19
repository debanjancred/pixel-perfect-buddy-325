import { CalendarDays, Pencil, Share2, Trash2, UserPlus } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import type { ClubEvent, IsoDate } from "@/types/domain";
import { canRegister, countdownLabel, eventDate } from "./model";

/**
 * One event (Story 6.1): title, date, countdown, tally, register and share. Admins also get
 * edit and delete (pass onEdit/onDelete only when the person may manage events).
 */
export function EventCard({
  event: e,
  today,
  onRegister,
  onShare,
  onEdit,
  onDelete,
}: {
  event: ClubEvent;
  today: IsoDate;
  onRegister: () => void;
  onShare: () => void;
  onEdit?: (() => void) | undefined;
  onDelete?: (() => void) | undefined;
}) {
  const i18n = useI18n();
  const { t, n, pick } = i18n;
  const open = canRegister(e, today);
  const countdown = countdownLabel(e, today, i18n);

  return (
    <article
      className={`rounded-3xl border bg-card p-4 shadow-card ${open ? "" : "border-dashed bg-muted/40"}`}
      aria-label={pick(e.title_bn, e.title_en)}
    >
      <div className="flex items-start gap-3">
        <div
          className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-gold-soft text-3xl"
          aria-hidden
        >
          🎉
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="text-lg font-bold leading-snug">{pick(e.title_bn, e.title_en)}</h3>
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted-foreground">
            <span className="inline-flex items-center gap-1">
              <CalendarDays className="h-4 w-4" aria-hidden /> {eventDate(e, i18n)}
            </span>
            {countdown && (
              <span className="rounded-full bg-primary-soft px-2 py-0.5 text-xs font-bold text-primary">
                {countdown}
              </span>
            )}
          </div>
        </div>
        {(onEdit || onDelete) && (
          <div className="-mr-2 -mt-2 flex shrink-0">
            {onEdit && (
              <button
                type="button"
                className="tap flex h-12 w-12 items-center justify-center rounded-full text-muted-foreground hover:bg-muted"
                aria-label={t("editEventLabel", { title: pick(e.title_bn, e.title_en) })}
                onClick={onEdit}
              >
                <Pencil className="h-5 w-5" aria-hidden />
              </button>
            )}
            {onDelete && (
              <button
                type="button"
                className="tap flex h-12 w-12 items-center justify-center rounded-full text-primary-ink hover:bg-primary-soft"
                aria-label={t("deleteEventLabel", { title: pick(e.title_bn, e.title_en) })}
                onClick={onDelete}
              >
                <Trash2 className="h-5 w-5" aria-hidden />
              </button>
            )}
          </div>
        )}
      </div>

      <div className="mt-4 flex items-baseline justify-between">
        <span className="num text-3xl font-extrabold text-primary" aria-live="polite">
          {n(String(e.registrations_count))}
        </span>
        <span className="text-sm text-muted-foreground">{t("registered")}</span>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2">
        {open ? (
          <button
            type="button"
            className="btn btn-primary whitespace-nowrap px-3"
            onClick={onRegister}
          >
            <UserPlus className="h-5 w-5" aria-hidden /> {t("register")}
          </button>
        ) : (
          <span className="btn bg-muted px-3 text-sm text-muted-foreground" role="status">
            {t("registrationClosed")}
          </span>
        )}
        <button type="button" className="btn btn-outline whitespace-nowrap px-3" onClick={onShare}>
          <Share2 className="h-5 w-5" aria-hidden /> {t("share")}
        </button>
      </div>
    </article>
  );
}
