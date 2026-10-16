import { useState } from "react";
import { Ban } from "lucide-react";
import { toast } from "sonner";
import { useI18n } from "@/lib/i18n";
import { isVoid } from "@/lib/accounts";
import { usePermission, useVoidHandover } from "@/hooks/use-data";
import { SyncBadge } from "@/components/pk/ui";
import { VoidDialog } from "@/components/pk/VoidDialog";
import type { CashHandover, ClubMember } from "@/types/domain";

/** Handovers newest first; voided ones stay listed struck through (SPEC 2.3 / 6.3). */
export function HandoverHistory({
  handovers,
  members,
}: {
  handovers: CashHandover[];
  members: ClubMember[];
}) {
  const { t, money, date } = useI18n();
  const canVoid = usePermission("entry.void");
  const voidHandover = useVoidHandover();
  const [voiding, setVoiding] = useState<CashHandover | null>(null);
  const name = (id: string) => members.find((m) => m.id === id)?.name ?? "—";

  if (!handovers.length) return <p className="text-sm text-muted-foreground">{t("noHandovers")}</p>;
  return (
    <>
      <ul className="divide-y rounded-2xl border bg-card shadow-card">
        {handovers.map((h) => {
          const voided = isVoid(h);
          return (
            <li key={h.id} className="flex items-center gap-3 p-3">
              <div className="min-w-0 flex-1">
                <div className={`font-semibold ${voided ? "line-through opacity-60" : ""}`}>
                  {name(h.collector_id)} → {name(h.received_by_id)}
                </div>
                <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                  <span>{date(h.created_at)}</span>
                  {voided && (
                    <span className="rounded-full bg-primary-soft px-2 py-0.5 font-bold text-primary">
                      {t("receiptVoid")}
                    </span>
                  )}
                  <SyncBadge status={h.sync_status} />
                </div>
              </div>
              <span className={`num font-bold ${voided ? "line-through opacity-60" : ""}`}>
                {money(h.amount)}
              </span>
              {canVoid && !voided && (
                <button
                  type="button"
                  onClick={() => setVoiding(h)}
                  className="tap flex items-center justify-center rounded-full text-destructive"
                  aria-label={`${t("void")}: ${name(h.collector_id)} ${money(h.amount)}`}
                >
                  <Ban className="h-5 w-5" />
                </button>
              )}
            </li>
          );
        })}
      </ul>
      {voiding && (
        <VoidDialog
          summary={`${name(voiding.collector_id)} → ${name(voiding.received_by_id)} · ${money(voiding.amount)}`}
          onClose={() => setVoiding(null)}
          onVoid={async (reason) => {
            await voidHandover.mutateAsync({ id: voiding.id, reason });
            toast.success(t("voided"));
          }}
        />
      )}
    </>
  );
}
