import { useState } from "react";
import { Download, Share2 } from "lucide-react";
import { toast } from "sonner";
import { useI18n } from "@/lib/i18n";
import { shareFileOrDownload, shareOrWhatsApp } from "@/lib/share";
import type { AccountsSummary, Club } from "@/types/domain";
import { accountsShareText } from "./model";

/** Share summary (WhatsApp text, Story 4.1) and the story-card image. */
export function AccountsActions({ club, summary }: { club: Club; summary: AccountsSummary }) {
  const i18n = useI18n();
  const { t, lang } = i18n;
  const [busy, setBusy] = useState(false);

  const storyCard = async () => {
    setBusy(true);
    try {
      const { renderStoryCard } = await import("./story-card");
      const png = await renderStoryCard(club, summary, i18n, lang);
      await shareFileOrDownload(png, `${club.slug}-hisab.png`);
    } catch {
      toast.error(t("imageFailed"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="grid grid-cols-2 gap-3">
      <button
        type="button"
        className="btn btn-whatsapp px-3"
        onClick={() => shareOrWhatsApp(accountsShareText(club, summary, i18n))}
      >
        <Share2 className="h-5 w-5" aria-hidden /> {t("share")}
      </button>
      <button type="button" className="btn btn-gold px-3" onClick={storyCard} disabled={busy}>
        <Download className="h-5 w-5" aria-hidden /> {t("storyCard")}
      </button>
    </div>
  );
}
