import { HandCoins } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import type { ClubMember } from "@/types/domain";
import type { CollectorCash } from "@/lib/accounts";

type Row = CollectorCash & { member: ClubMember };

/** Per collector: cash collected, handed over and outstanding (SPEC 6.3). */
export function CollectorCashList({
  rows,
  meId,
  canReceive,
  onReceive,
}: {
  rows: Row[];
  meId: string | undefined;
  canReceive: boolean;
  onReceive: (memberId: string) => void;
}) {
  const { t, money } = useI18n();
  return (
    <ul className="space-y-3">
      {rows.map((r) => (
        <li key={r.member_id} className="rounded-2xl border bg-card p-4 shadow-card">
          <div className="flex items-baseline justify-between gap-3">
            <span className="font-bold">{r.member.name}</span>
            <span className="text-xs text-muted-foreground">{t(`role_${r.member.role}`)}</span>
          </div>
          <dl className="mt-2 grid grid-cols-3 gap-2 text-center">
            <div>
              <dt className="text-[11px] text-muted-foreground">{t("cashCollected")}</dt>
              <dd className="num font-semibold">{money(r.collected)}</dd>
            </div>
            <div>
              <dt className="text-[11px] text-muted-foreground">{t("handedOver")}</dt>
              <dd className="num font-semibold">{money(r.handed_over)}</dd>
            </div>
            <div className="rounded-xl bg-gold-soft py-1">
              <dt className="text-[11px] font-semibold text-gold-ink">{t("outstanding")}</dt>
              <dd className="num font-extrabold">{money(r.outstanding)}</dd>
            </div>
          </dl>
          {canReceive && r.member_id !== meId && r.outstanding > 0 && (
            <button
              type="button"
              className="btn btn-gold mt-3 w-full"
              onClick={() => onReceive(r.member_id)}
            >
              <HandCoins className="h-5 w-5" aria-hidden /> {t("receiveCash")}
            </button>
          )}
        </li>
      ))}
    </ul>
  );
}
