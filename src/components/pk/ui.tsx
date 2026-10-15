import { useEffect, type ReactNode } from "react";
import { X, CloudOff } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import type { PledgeStatus, SyncStatus } from "@/services/types";

/** Thin alpona motif strip — used only along the top header. */
export function AlponaStrip() {
  return (
    <svg aria-hidden className="block h-3 w-full text-gold" preserveAspectRatio="none">
      <defs>
        <pattern id="alpona" width="28" height="12" patternUnits="userSpaceOnUse">
          <path d="M0 6 Q7 0 14 6 T28 6" fill="none" stroke="currentColor" strokeWidth="1" />
          <circle cx="14" cy="6" r="1.6" fill="currentColor" />
          <path
            d="M7 2.5 l1.2 1.5 -1.2 1.5 -1.2 -1.5z M21 7 l1.2 1.5 -1.2 1.5 -1.2 -1.5z"
            fill="currentColor"
            opacity=".7"
          />
        </pattern>
      </defs>
      <rect width="100%" height="12" fill="url(#alpona)" />
    </svg>
  );
}

export function LangToggle() {
  const { lang, setLang } = useI18n();
  return (
    <div
      className="flex rounded-full border border-input bg-card p-0.5 text-sm font-semibold"
      role="group"
      aria-label="Language"
    >
      {(["bn", "en"] as const).map((l) => (
        <button
          key={l}
          onClick={() => setLang(l)}
          data-active={lang === l}
          className="min-h-10 rounded-full px-3 transition data-[active=true]:bg-primary data-[active=true]:text-primary-foreground"
        >
          {l === "bn" ? "বাংলা" : "EN"}
        </button>
      ))}
    </div>
  );
}

export function StatusBadge({ status }: { status: PledgeStatus }) {
  const { t } = useI18n();
  const cls = {
    paid: "bg-success-soft text-success",
    pending: "bg-warning-soft text-warning",
    promised: "bg-info-soft text-info",
  }[status];
  return (
    <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-bold ${cls}`}>
      {t(status)}
    </span>
  );
}

export function SyncBadge({ status }: { status: SyncStatus }) {
  const { t } = useI18n();
  if (status !== "pending") return null;
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-gold-soft px-2 py-0.5 text-[11px] font-bold text-gold-ink">
      <CloudOff className="h-3 w-3" /> {t("offlineSaved")}
    </span>
  );
}

export function Modal({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
}) {
  useEffect(() => {
    if (!open) return;
    const k = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", k);
    return () => {
      document.body.style.overflow = "";
      window.removeEventListener("keydown", k);
    };
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-foreground/50 animate-in fade-in sm:items-center"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-label={title}
        className="max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-t-3xl bg-background p-5 pb-8 animate-in slide-in-from-bottom-8 sm:rounded-3xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 className="text-xl font-bold">{title}</h2>
          <button
            onClick={onClose}
            className="tap flex items-center justify-center rounded-full bg-muted"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function Label({ children }: { children: ReactNode }) {
  return <div className="mb-2 text-sm font-semibold text-muted-foreground">{children}</div>;
}

export function waLink(phone: string | undefined, text: string) {
  const p = phone ? `91${phone.replace(/\D/g, "").slice(-10)}` : "";
  return `https://wa.me/${p}?text=${encodeURIComponent(text)}`;
}

export async function shareOrWhatsApp(text: string, url?: string, phone?: string) {
  if (typeof navigator !== "undefined" && navigator.share) {
    try {
      await navigator.share(url ? { text, url } : { text });
      return;
    } catch {
      /* cancelled → fall back */
    }
  }
  window.open(waLink(phone, url ? `${text} ${url}` : text), "_blank");
}
