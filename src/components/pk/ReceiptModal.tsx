import { Share2, MessageCircle } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { amountInWords } from "@/lib/format";
import type { ChandaTransaction, Club, ClubMember, Household } from "@/types/domain";
import { AlponaStrip, Modal } from "./ui";
import { shareOrWhatsApp, waLink } from "@/lib/share";

export function ReceiptModal({
  transaction: chanda,
  club,
  household,
  collector,
  onClose,
}: {
  transaction: ChandaTransaction | null;
  club: Club | undefined;
  household: Household | undefined;
  collector: ClubMember | undefined;
  onClose: () => void;
}) {
  const { t, pick, money, lang, n, date: fmtDate } = useI18n();
  if (!chanda || !club) return null;
  const phone = household?.phone_number;
  const link = `${window.location.origin}/audit?r=${chanda.receipt_no}`;
  // Bilingual receipt text belongs to M3b (Story 2.2); amounts already go through i18n here.
  const msg = `ধন্যবাদ! ${club.name_bn}-এর জন্য আপনার ${money(chanda.amount)} চাঁদা জমা হয়েছে। রসিদ নং ${chanda.receipt_no}। রসিদ দেখুন:`;
  const date = fmtDate(chanda.created_at);

  return (
    <Modal open onClose={onClose} title={t("receipt")}>
      <div className="overflow-hidden rounded-2xl border-2 border-gold/60 bg-card">
        <div className="bg-hero px-4 pb-4 pt-1 text-center text-primary-foreground">
          <AlponaStrip />
          <div className="mt-2 text-lg font-bold leading-snug">
            {pick(club.name_bn, club.name_en)}
          </div>
          <div className="text-xs opacity-90">{club.area_label}</div>
        </div>
        <dl className="space-y-3 p-4 text-[15px]">
          <Row
            k={t("receiptNo")}
            v={<span className="font-mono font-bold text-primary">{chanda.receipt_no}</span>}
          />
          <Row k={t("date")} v={date} />
          <Row k={t("receivedFrom")} v={<b>{household?.resident_name ?? "—"}</b>} />
          {household && (
            <Row k={t("household")} v={`${n(household.house_flat_no)} · ${household.lane_block}`} />
          )}
          <Row k={t("mode")} v={chanda.payment_method === "cash" ? t("cash") : t("upi")} />
          {collector && <Row k={t("collector")} v={collector.name} />}
          <div className="rounded-xl bg-gold-soft p-3 text-center">
            <div className="num text-3xl font-extrabold text-primary">{money(chanda.amount)}</div>
            <div className="mt-1 text-sm font-semibold text-gold-ink">
              {t("inWords")}: {amountInWords(chanda.amount, lang)}
            </div>
          </div>
          <div className="text-center text-xs text-muted-foreground">
            PK · {n(String(club.puja_year))}
          </div>
        </dl>
      </div>
      <div className="mt-4 grid grid-cols-2 gap-3">
        <button className="btn btn-outline" onClick={() => shareOrWhatsApp(msg, link, phone)}>
          <Share2 className="h-5 w-5" /> {t("share")}
        </button>
        <a
          className="btn btn-whatsapp"
          href={waLink(phone, `${msg} ${link}`)}
          target="_blank"
          rel="noreferrer"
        >
          <MessageCircle className="h-5 w-5" /> {t("whatsapp")}
        </a>
      </div>
      <button className="btn btn-primary mt-3 w-full" onClick={onClose}>
        {t("done")}
      </button>
    </Modal>
  );
}

function Row({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3 border-b border-dashed pb-2">
      <dt className="text-muted-foreground">{k}</dt>
      <dd className="text-right">{v}</dd>
    </div>
  );
}
