import { useEffect, useState } from "react";
import { ImageDown, MessageCircle, Printer, Share2 } from "lucide-react";
import { Spinner } from "@/components/pk/ui";
import { toast } from "sonner";
import { useI18n } from "@/lib/i18n";
import { canShareNatively, shareFileOrDownload, shareNatively, waLink } from "@/lib/share";
import { PrintPortal } from "@/components/pk/PrintPortal";
import { receiptFileName, receiptText, type Receipt } from "./model";
import { ReceiptCard } from "./ReceiptCard";

/**
 * Share / print actions for a receipt (SPEC Story 2.2): WhatsApp to the donor's number,
 * the native share sheet where it exists, a PNG of the receipt, and print.
 * A voided receipt can still be viewed and printed for audit, but not sent.
 */
export function ReceiptActions({ receipt }: { receipt: Receipt }) {
  const i18n = useI18n();
  const { t, lang } = i18n;
  const [native, setNative] = useState(false);
  const [busy, setBusy] = useState(false);
  // navigator only exists in the browser; checking after mount keeps SSR markup stable.
  useEffect(() => setNative(canShareNatively()), []);

  const text = receiptText(receipt, i18n);
  const sendable = !receipt.voided;

  const shareImage = async () => {
    setBusy(true);
    try {
      // Loaded on demand: canvas drawing code isn't needed until someone asks for a picture.
      const { renderReceiptImage } = await import("./image");
      const png = await renderReceiptImage(receipt, i18n, lang);
      await shareFileOrDownload(png, receiptFileName(receipt, "png"), text);
    } catch {
      toast.error(t("imageFailed"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <div className="grid grid-cols-2 gap-3">
        {sendable && (
          <a
            className="btn btn-whatsapp col-span-2"
            href={waLink(receipt.donor.phone, text)}
            target="_blank"
            rel="noreferrer"
          >
            <MessageCircle className="h-5 w-5" /> {t("whatsapp")}
          </a>
        )}
        {sendable && native && (
          <button type="button" className="btn btn-outline" onClick={() => shareNatively({ text })}>
            <Share2 className="h-5 w-5" /> {t("share")}
          </button>
        )}
        {sendable && (
          <button
            type="button"
            className="btn btn-outline"
            onClick={shareImage}
            disabled={busy}
            aria-busy={busy}
          >
            {busy ? <Spinner /> : <ImageDown className="h-5 w-5" />} {t("receiptImage")}
          </button>
        )}
        <button
          type="button"
          className={sendable && !native ? "btn btn-outline" : "btn btn-outline col-span-2"}
          onClick={() => window.print()}
        >
          <Printer className="h-5 w-5" /> {t("print")}
        </button>
      </div>
      <PrintPortal>
        <ReceiptCard receipt={receipt} />
      </PrintPortal>
    </>
  );
}
