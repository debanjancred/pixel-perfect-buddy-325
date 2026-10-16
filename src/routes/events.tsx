import { createFileRoute } from "@tanstack/react-router";
import { Plus } from "lucide-react";
import { toast } from "sonner";
import { z } from "zod";
import { useI18n, type TKey } from "@/lib/i18n";
import { isoDate } from "@/lib/format";
import { useEvents, usePermission } from "@/hooks/use-data";
import { useSearchModal } from "@/hooks/use-search-modal";
import { AppShell } from "@/components/pk/AppShell";
import {
  EventCard,
  EventForm,
  groupEvents,
  useEventActions,
  type EventPhase,
} from "@/features/events";

export const Route = createFileRoute("/events")({
  validateSearch: z.object({ add: z.boolean().optional().catch(undefined) }),
  head: () => ({
    meta: [
      { title: "Pujo Competitions — Pujo Khata" },
      {
        name: "description",
        content: "Pujo competitions and cultural events with live registration tallies.",
      },
      { property: "og:title", content: "Pujo Competitions — Pujo Khata" },
      { property: "og:description", content: "Register for your para's puja events." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: EventsPage,
});

const SECTION_TITLE: Record<EventPhase, TKey> = {
  today: "eventsToday",
  upcoming: "eventsUpcoming",
  past: "eventsPast",
};

function EventsPage() {
  const { t } = useI18n();
  const { add } = Route.useSearch();
  const { data: events = [], isPending, isError, refetch } = useEvents();
  const actions = useEventActions();
  const addSheet = useSearchModal("add");
  const canManage = usePermission("event.manage");
  // Events only render after the client-side query resolves, so this never runs on the server.
  const today = isoDate();
  const sections = groupEvents(events, today);

  return (
    <AppShell
      fab={
        canManage && (
          <button
            type="button"
            onClick={() => addSheet.open()}
            className="btn btn-primary shadow-fab fixed bottom-24 right-4 z-40 h-16 rounded-full px-6"
          >
            <Plus className="h-6 w-6" /> {t("addEvent")}
          </button>
        )
      }
    >
      <h1 className="text-2xl font-extrabold">{t("eventsTitle")}</h1>

      {isError && (
        <div
          role="alert"
          className="mt-4 flex items-center justify-between gap-3 rounded-2xl bg-warning-soft p-3 text-sm font-semibold text-warning"
        >
          {t("loadFailedHint")}
          <button className="btn btn-outline shrink-0 text-sm" onClick={() => refetch()}>
            {t("tryAgain")}
          </button>
        </div>
      )}

      {isPending ? (
        <div className="mt-4 space-y-4" aria-busy="true">
          {[0, 1].map((i) => (
            <div key={i} className="h-52 animate-pulse rounded-3xl bg-muted" />
          ))}
        </div>
      ) : sections.length === 0 ? (
        <div className="mt-8 rounded-2xl border border-dashed bg-card p-6 text-center">
          <p className="font-bold">{t("noEvents")}</p>
          <p className="mt-1 text-sm text-muted-foreground">{t("noEventsHint")}</p>
        </div>
      ) : (
        sections.map((s) => (
          <section key={s.phase} className="mt-5" aria-labelledby={`events-${s.phase}`}>
            <h2
              id={`events-${s.phase}`}
              className="mb-2 text-sm font-bold uppercase tracking-wide text-gold-ink"
            >
              {t(SECTION_TITLE[s.phase])}
            </h2>
            <div className="space-y-4">
              {s.events.map((e) => (
                <EventCard
                  key={e.id}
                  event={e}
                  today={today}
                  onRegister={() => actions.register(e)}
                  onShare={() => actions.share(e)}
                />
              ))}
            </div>
          </section>
        ))
      )}
      <div className="h-20" />

      {add && canManage && (
        <EventForm
          onClose={addSheet.close}
          onSaved={() => {
            toast.success(t("eventAdded"));
            void addSheet.close();
          }}
        />
      )}
    </AppShell>
  );
}
