import { useEffect } from "react";
import { createPortal } from "react-dom";
import { ImageIcon, X } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { useVoucherImage } from "@/hooks/use-data";

/** Square thumbnail of a stored voucher photo, or a placeholder icon. */
export function VoucherThumb({ id, className }: { id: string | undefined; className?: string }) {
  const url = useVoucherImage(id);
  return (
    <span
      className={`flex shrink-0 items-center justify-center overflow-hidden rounded-xl bg-muted ${className ?? "h-16 w-16"}`}
    >
      {url ? (
        <img src={url} alt="" className="h-full w-full object-cover" />
      ) : (
        <ImageIcon className="h-6 w-6 text-muted-foreground" aria-hidden />
      )}
    </span>
  );
}

/**
 * Full-screen voucher photo (Story 3.2). Portalled to <body> so no sheet or transform can
 * clip it; native pinch-zoom stays available for reading small print on a bill.
 */
export function VoucherViewer({ id, onClose }: { id: string; onClose: () => void }) {
  const { t } = useI18n();
  const url = useVoucherImage(id);
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [onClose]);

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label={t("receiptPhoto")}
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black animate-in fade-in"
      onClick={onClose}
    >
      {url && (
        <img
          src={url}
          alt={t("receiptPhoto")}
          className="max-h-full max-w-full object-contain"
          style={{ touchAction: "pinch-zoom" }}
          onClick={(e) => e.stopPropagation()}
        />
      )}
      <button
        type="button"
        onClick={onClose}
        aria-label={t("close")}
        // Bottom centre: within thumb reach, and never under a toast at the top.
        className="tap absolute bottom-6 left-1/2 flex -translate-x-1/2 items-center justify-center rounded-full bg-white/15 text-white"
        style={{ marginBottom: "env(safe-area-inset-bottom)" }}
      >
        <X className="h-6 w-6" />
      </button>
    </div>,
    document.body,
  );
}
