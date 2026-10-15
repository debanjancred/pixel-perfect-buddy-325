import { createFileRoute } from "@tanstack/react-router";
import { Share2, CalendarDays } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { useEvents, useInvalidateAll, useSummary } from "@/hooks/use-data";
import { api } from "@/services/api";
import { AppShell } from "@/components/pk/AppShell";
import { shareOrWhatsApp } from "@/lib/share";

export const Route = createFileRoute("/events")({
  head: () => ({
    meta: [
      { title: "Pujo Competitions — Pujo Khata" },
      {
        name: "description",
        content: "Sit & Draw, Dhunuchi Naach, Shankha and Pushpanjali batch registrations.",
      },
      { property: "og:title", content: "Pujo Competitions — Pujo Khata" },
      { property: "og:description", content: "Register for your para's puja events." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: EventsPage,
});

const EMOJI = { draw: "🎨", dhunuchi: "🔥", shankha: "🐚", pushpanjali: "🌺" };

function EventsPage() {
  const { t, n, pick } = useI18n();
  const { data: events = [] } = useEvents();
  const { data: s } = useSummary();
  const invalidate = useInvalidateAll();
  const reg = async (id: string, slot?: number) => {
    await api.registerEvent(id, slot);
    invalidate();
  };

  return (
    <AppShell>
      <h1 className="text-2xl font-extrabold">{t("eventsTitle")}</h1>
      <div className="mt-4 space-y-4">
        {events.map((e) => {
          const share = () =>
            shareOrWhatsApp(
              `${s?.club.name ?? ""} — ${e.name_bn} (${e.date_bn})-এ নাম লেখান:`,
              `${window.location.origin}/events`,
            );
          return (
            <article key={e.id} className="rounded-3xl border bg-card p-4 shadow-card">
              <div className="flex items-start gap-3">
                <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gold-soft text-3xl">
                  {EMOJI[e.key]}
                </div>
                <div className="flex-1">
                  <h2 className="text-lg font-bold leading-snug">{pick(e.name_bn, e.name_en)}</h2>
                  <div className="flex items-center gap-1 text-sm text-muted-foreground">
                    <CalendarDays className="h-4 w-4" /> {pick(e.date_bn, e.date_en)}
                  </div>
                </div>
              </div>

              {e.slots.length === 0 ? (
                <div className="mt-4">
                  <div className="flex items-baseline justify-between">
                    <span className="num text-3xl font-extrabold text-primary">
                      {n(String(e.registrations))}
                      <span className="text-base font-semibold text-muted-foreground">
                        {" "}
                        / {n(String(e.capacity))}
                      </span>
                    </span>
                    <span className="text-sm text-muted-foreground">{t("registered")}</span>
                  </div>
                  <div className="mt-2 h-3 overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full rounded-full bg-gold"
                      style={{ width: `${(e.registrations / e.capacity) * 100}%` }}
                    />
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-2">
                    <button
                      className="btn btn-primary"
                      disabled={e.registrations >= e.capacity}
                      onClick={() => reg(e.id)}
                    >
                      {e.registrations >= e.capacity ? t("full") : t("register")}
                    </button>
                    <button className="btn btn-outline" onClick={share}>
                      <Share2 className="h-5 w-5" /> {t("shareLink")}
                    </button>
                  </div>
                </div>
              ) : (
                <div className="mt-4 space-y-2">
                  {e.slots.map((sl, i) => {
                    const full = sl.filled >= sl.capacity;
                    return (
                      <div
                        key={i}
                        className="flex items-center gap-3 rounded-2xl bg-muted p-2 pl-3"
                      >
                        <div className="flex-1">
                          <div className="font-semibold">{pick(sl.label_bn, sl.label_en)}</div>
                          <div className="mt-1 h-2 overflow-hidden rounded-full bg-card">
                            <div
                              className={`h-full rounded-full ${full ? "bg-primary" : "bg-success"}`}
                              style={{ width: `${(sl.filled / sl.capacity) * 100}%` }}
                            />
                          </div>
                        </div>
                        <span className="num w-16 text-right text-sm font-bold">
                          {n(String(sl.filled))}/{n(String(sl.capacity))}
                        </span>
                        <button
                          className="btn btn-outline min-h-12 px-3 text-sm"
                          disabled={full}
                          onClick={() => reg(e.id, i)}
                        >
                          {full ? t("full") : "+১"}
                        </button>
                      </div>
                    );
                  })}
                  <button className="btn btn-outline w-full" onClick={share}>
                    <Share2 className="h-5 w-5" /> {t("shareLink")}
                  </button>
                </div>
              )}
            </article>
          );
        })}
      </div>
    </AppShell>
  );
}
