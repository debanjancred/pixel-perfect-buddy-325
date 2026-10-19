import { useState } from "react";
import { MoreVertical, Pencil, Share2, Trash2 } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { Modal } from "@/components/pk/ui";
import type { ClubEvent, IsoDate } from "@/types/domain";
import { countdownLabel, eventDateParts, eventPhase } from "./model";

/**
 * One event (Story 6.1): a calendar tile, the name, weekday and countdown, and share. Admins
 * get a ⋮ menu with edit and delete (pass onEdit/onDelete only when the person may manage
 * events). Finished events are muted. Registration is switched off for now — it will come
 * back as its own feature (api.registerEvent and the server's register_event stay in place).
 */
export function EventCard({
  event: e,
  today,
  onShare,
  onEdit,
  onDelete,
}: {
  event: ClubEvent;
  today: IsoDate;
  onShare: () => void;
  onEdit?: (() => void) | undefined;
  onDelete?: (() => void) | undefined;
}) {
  const i18n = useI18n();
  const { t, n, pick, lang } = i18n;
  const [menuOpen, setMenuOpen] = useState(false);
  const title = pick(e.title_bn, e.title_en);
  const phase = eventPhase(e, today);
  const countdown = countdownLabel(e, today, i18n) ?? t("eventsPast");
  const { day, month, weekday } = eventDateParts(e, lang);
  const manage = !!(onEdit || onDelete);

  const chip =
    phase === "today"
      ? "bg-primary text-primary-foreground"
      : phase === "upcoming"
        ? "bg-primary-soft text-primary-ink"
        : "bg-muted text-muted-foreground";

  return (
    <article
      className={`rounded-3xl border bg-card p-4 shadow-card ${
        phase === "today" ? "border-primary/40 ring-1 ring-primary/20" : ""
      } ${phase === "past" ? "bg-muted/30" : ""}`}
      aria-label={title}
    >
      <div className="flex items-start gap-3">
        {/* Calendar tile: month band over a large day number. */}
        <div
          className="flex w-16 shrink-0 flex-col overflow-hidden rounded-2xl border text-center"
          aria-hidden
        >
          <span
            className={`py-0.5 text-xs font-bold ${
              phase === "past"
                ? "bg-muted text-muted-foreground"
                : "bg-primary text-primary-foreground"
            }`}
          >
            {month}
          </span>
          <span
            className={`num py-1.5 text-2xl font-extrabold leading-none ${
              phase === "past" ? "bg-card text-muted-foreground" : "bg-gold-soft text-foreground"
            }`}
          >
            {n(String(day))}
          </span>
        </div>

        <div className="min-w-0 flex-1 pt-0.5">
          <h3 className="line-clamp-2 text-lg font-bold leading-snug">{title}</h3>
          <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="text-sm text-muted-foreground">{weekday}</span>
            <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${chip}`}>
              {countdown}
            </span>
          </div>
        </div>

        {manage && (
          <button
            type="button"
            className="tap -mr-2 -mt-1 flex h-12 w-12 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-muted"
            aria-label={t("eventMore", { title })}
            aria-haspopup="dialog"
            onClick={() => setMenuOpen(true)}
          >
            <MoreVertical className="h-5 w-5" aria-hidden />
          </button>
        )}
      </div>

      {phase !== "past" && (
        <button
          type="button"
          className="btn btn-outline mt-4 w-full"
          aria-label={t("shareEventLabel", { title })}
          onClick={onShare}
        >
          <Share2 className="h-5 w-5" aria-hidden /> {t("share")}
        </button>
      )}

      {manage && (
        <Modal open={menuOpen} onClose={() => setMenuOpen(false)} title={title}>
          <div className="space-y-2">
            {onEdit && (
              <button
                type="button"
                className="btn btn-outline w-full justify-start"
                onClick={() => {
                  setMenuOpen(false);
                  onEdit();
                }}
              >
                <Pencil className="h-5 w-5" aria-hidden /> {t("editEvent")}
              </button>
            )}
            {onDelete && (
              <button
                type="button"
                className="btn btn-outline w-full justify-start border-primary/40 text-primary-ink"
                onClick={() => {
                  setMenuOpen(false);
                  onDelete();
                }}
              >
                <Trash2 className="h-5 w-5" aria-hidden /> {t("deleteEvent")}
              </button>
            )}
          </div>
        </Modal>
      )}
    </article>
  );
}
