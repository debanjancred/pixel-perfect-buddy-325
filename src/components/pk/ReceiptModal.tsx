import { Share2, MessageCircle } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { amountInWords, indian, toBnDigits } from "@/lib/format";
import type { Chanda, Club } from "@/services/types";
import { AlponaStrip, Modal, shareOrWhatsApp, waLink } from "./ui";

export function ReceiptModal({
  chanda,
  club,
  phone,
  onClose,
}: {
  chanda: Chanda | null;
  club: Club | undefined;
  phone?: string | undefined;
  onClose: () => void;
}) {
  const { t, pick, money, lang, n } = useI18n();
  if (!chanda || !club) return null;
  const link = `${window.location.origin}/audit?r=${chanda.receipt_no}`;
  const msg = `ধন্যবাদ! ${club.name.replace(/\s*২০২৬$/, "")} দুর্গাপূজা ${toBnDigits(String(club.puja_year))}-এর জন্য আপনার ₹${toBnDigits(indian(chanda.amount))} চাঁদা জমা হয়েছে। রসিদ নং ${chanda.receipt_no}। রসিদ দেখুন:`;
  const date = new Date(chanda.created_at).toLocaleDateString(lang === "bn" ? "bn-IN" : "en-IN", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  return (
    <Modal open onClose={onClose} title={t("receipt")}>
      <div className="overflow-hidden rounded-2xl border-2 border-gold/60 bg-card">
        <div className="bg-hero px-4 pb-4 pt-1 text-center text-primary-foreground">
          <AlponaStrip />
          <div className="mt-2 text-lg font-bold leading-snug">{pick(club.name, club.name_en)}</div>
          <div className="text-xs opacity-90">
            {[club.para, club.zone].filter(Boolean).join(" · ")}
          </div>
        </div>
        <dl className="space-y-3 p-4 text-[15px]">
          <Row
            k={t("receiptNo")}
            v={<span className="font-mono font-bold text-primary">{chanda.receipt_no}</span>}
          />
          <Row k={t("date")} v={date} />
          <Row k={t("receivedFrom")} v={<b>{pick(chanda.payer_name, chanda.payer_name_en)}</b>} />
          <Row k={t("mode")} v={chanda.payment_mode === "cash" ? t("cash") : t("upi")} />
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
