import { createFileRoute } from "@tanstack/react-router";
import { toast } from "sonner";
import { z } from "zod";
import { useI18n } from "@/lib/i18n";
import { AppShell } from "@/components/pk/AppShell";
import { useCurrentMember, usePermission } from "@/hooks/use-data";
import { useSearchModal } from "@/hooks/use-search-modal";
import { CollectorCashList, HandoverForm, HandoverHistory, useCash } from "@/features/cash";

// SPEC Story 6.3: reconcile cash collected by each collector against cash received.
export const Route = createFileRoute("/cash")({
  validateSearch: z.object({ collector: z.string().uuid().optional().catch(undefined) }),
  head: () => ({
    meta: [
      { title: "Cash Handover — Pujo Khata" },
      { name: "description", content: "Cash collected per collector and handed to the treasurer." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: CashPage,
});

function CashPage() {
  const { t, money } = useI18n();
  const { collector } = Route.useSearch();
  const cash = useCash();
  const me = useCurrentMember();
  const canReceive = usePermission("handover.record");
  const sheet = useSearchModal("collector");
  const selected = collector ? cash.rows.find((r) => r.member_id === collector) : undefined;

  return (
    <AppShell>
      <h1 className="text-2xl font-extrabold">{t("cashTitle")}</h1>
      <p className="mt-1 text-sm text-muted-foreground">{t("cashHint")}</p>

      {cash.isPending ? (
        <div className="mt-4 space-y-3" aria-busy="true">
          {[0, 1].map((i) => (
            <div key={i} className="h-36 animate-pulse rounded-2xl bg-muted" />
          ))}
        </div>
      ) : cash.rows.length === 0 ? (
        <div className="mt-8 rounded-2xl border border-dashed bg-card p-6 text-center">
          <p className="font-bold">{t("noCashYet")}</p>
        </div>
      ) : (
        <>
          <div className="mt-4 flex items-baseline justify-between rounded-2xl bg-gold-soft p-4">
            <span className="font-semibold text-gold-ink">{t("totalOutstanding")}</span>
            <span className="num text-2xl font-extrabold">{money(cash.totalOutstanding)}</span>
          </div>
          <div className="mt-4">
            <CollectorCashList
              rows={cash.rows}
              meId={me?.id}
              canReceive={canReceive}
              onReceive={(id) => sheet.open(id)}
            />
          </div>
          <h2 className="mb-2 mt-6 text-lg font-bold">{t("handoverHistory")}</h2>
          <HandoverHistory handovers={cash.handovers} members={cash.members} />
        </>
      )}
      <div className="h-6" />

      {selected && canReceive && (
        <HandoverForm
          collector={selected.member}
          outstanding={selected.outstanding}
          onClose={sheet.close}
          onSaved={(h) => {
            toast.success(t("handoverSaved", { amount: money(h.amount) }));
            void sheet.close();
          }}
        />
      )}
    </AppShell>
  );
}
