// Events roster logic (SPEC Story 6.1). Pure: grouping by day, countdown labels,
// registration rules and share text, so the screen and tests share one source.
import type { I18n } from "@/lib/i18n";
import type { Club, ClubEvent, IsoDate } from "@/types/domain";

export type EventPhase = "today" | "upcoming" | "past";

const DAY_MS = 86_400_000;
const utcDay = (d: IsoDate) => {
  const [y, m, day] = d.split("-").map(Number);
  return Date.UTC(y!, m! - 1, day!);
};

/** Whole calendar days from `today` to the event (negative once it's over). */
export const daysUntil = (e: Pick<ClubEvent, "date">, today: IsoDate) =>
  Math.round((utcDay(e.date) - utcDay(today)) / DAY_MS);

export const eventPhase = (e: Pick<ClubEvent, "date">, today: IsoDate): EventPhase => {
  const d = daysUntil(e, today);
  return d === 0 ? "today" : d > 0 ? "upcoming" : "past";
};

/** Registration stays open through the event day and closes once it has passed. */
export const canRegister = (e: Pick<ClubEvent, "date">, today: IsoDate) =>
  eventPhase(e, today) !== "past";

export interface EventSection {
  phase: EventPhase;
  events: ClubEvent[];
}

/** Today first, then upcoming (soonest first), then finished (most recent first). */
export function groupEvents(list: ClubEvent[], today: IsoDate): EventSection[] {
  const by = (phase: EventPhase) => list.filter((e) => eventPhase(e, today) === phase);
  const asc = (a: ClubEvent, b: ClubEvent) => a.date.localeCompare(b.date);
  const sections: EventSection[] = [
    { phase: "today", events: by("today") },
    { phase: "upcoming", events: by("upcoming").sort(asc) },
    { phase: "past", events: by("past").sort((a, b) => asc(b, a)) },
  ];
  return sections.filter((s) => s.events.length > 0);
}

type Format = Pick<I18n, "t" | "n" | "date" | "pick">;

/** "আজ" / "আগামীকাল" / "৩ দিন বাকি"; null once the event is over. */
export function countdownLabel(e: ClubEvent, today: IsoDate, f: Format): string | null {
  const d = daysUntil(e, today);
  if (d < 0) return null;
  if (d === 0) return f.t("eventsToday");
  if (d === 1) return f.t("tomorrow");
  return f.t("inDays", { days: f.n(String(d)) });
}

/** A bare "YYYY-MM-DD" parses as UTC midnight; pin it to local midnight for display. */
export const eventDate = (e: ClubEvent, f: Format) => f.date(`${e.date}T00:00:00`);

/** Self-contained invite text (no link: event data only lives on this device for now). */
export const eventShareText = (e: ClubEvent, club: Club | null | undefined, f: Format) =>
  f.t("eventShare", {
    club: club ? f.pick(club.name_bn, club.name_en) : f.t("app"),
    title: f.pick(e.title_bn, e.title_en),
    date: eventDate(e, f),
    count: f.n(String(e.registrations_count)),
  });
