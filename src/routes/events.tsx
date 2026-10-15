import { createFileRoute } from "@tanstack/react-router";
import { Share2, CalendarDays } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { useClub, useEvents, useRegisterEvent } from "@/hooks/use-data";
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

function EventsPage() {
  const { t, n, pick, date } = useI18n();
  const { data: events = [] } = useEvents();
  const { data: club } = useClub();
  const register = useRegisterEvent();

  return (
    <AppShell>
      <h1 className="text-2xl font-extrabold">{t("eventsTitle")}</h1>
      <div className="mt-4 space-y-4">
        {events.map((e) => {
          const title = pick(e.title_bn, e.title_en);
          const share = () =>
            shareOrWhatsApp(
              `${club ? pick(club.name_bn, club.name_en) : t("app")} — ${title} (${date(e.date)})`,
            );
          return (
            <article key={e.id} className="rounded-3xl border bg-card p-4 shadow-card">
              <div className="flex items-start gap-3">
                <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gold-soft text-3xl">
                  🎉
                </div>
                <div className="flex-1">
                  <h2 className="text-lg font-bold leading-snug">{title}</h2>
                  <div className="flex items-center gap-1 text-sm text-muted-foreground">
                    <CalendarDays className="h-4 w-4" /> {date(e.date)}
                  </div>
                </div>
              </div>

              <div className="mt-4">
                <div className="flex items-baseline justify-between">
                  <span className="num text-3xl font-extrabold text-primary">
                    {n(String(e.registrations_count))}
                  </span>
                  <span className="text-sm text-muted-foreground">{t("registered")}</span>
                </div>
                <div className="mt-3 grid grid-cols-2 gap-2">
                  <button
                    className="btn btn-primary"
                    disabled={register.isPending}
                    onClick={() => register.mutate(e.id)}
                  >
                    {t("register")}
                  </button>
                  <button className="btn btn-outline" onClick={share}>
                    <Share2 className="h-5 w-5" /> {t("shareLink")}
                  </button>
                </div>
              </div>
            </article>
          );
        })}
      </div>
    </AppShell>
  );
}
