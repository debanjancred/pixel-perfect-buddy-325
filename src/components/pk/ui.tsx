import { useEffect, useId, useRef, type InputHTMLAttributes, type ReactNode } from "react";
import { useFocusTrap } from "@/hooks/use-focus-trap";
import { useVisibleArea } from "@/hooks/use-visual-viewport";
import { createPortal } from "react-dom";
import { X, CloudOff, CircleAlert } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import type { ErrKey } from "@/lib/validation";
import type { HouseholdStatus } from "@/lib/households";
import type { SyncStatus } from "@/types/domain";

/**
 * Busy indicator for buttons: a gold ring with a turning arc in the button's own text colour,
 * tipped with a sindoor dot. Pair it with aria-busy on the button.
 */
export function Spinner({ className }: { className?: string }) {
  return (
    <svg aria-hidden viewBox="0 0 24 24" className={cn("pk-spinner h-5 w-5 shrink-0", className)}>
      <circle cx="12" cy="12" r="9" fill="none" stroke="var(--gold)" strokeWidth="3" opacity=".5" />
      <g className="pk-spinner-arc">
        <path
          d="M12 3a9 9 0 0 1 0 18"
          fill="none"
          stroke="currentColor"
          strokeWidth="3"
          strokeLinecap="round"
        />
        <circle
          cx="12"
          cy="21"
          r="2.2"
          fill="var(--primary)"
          stroke="var(--gold)"
          strokeWidth="1"
        />
      </g>
    </svg>
  );
}

/** Branded strip along the very top while any save, upload or delete is running. */
export function LoadingBar({ active }: { active: boolean }) {
  if (!active) return null;
  return <div aria-hidden className="pk-loading-bar" />;
}

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
  const { lang, setLang, t } = useI18n();
  return (
    <div
      className="flex rounded-full border border-input bg-card p-0.5 text-sm font-semibold text-foreground"
      role="group"
      aria-label={t("language")}
    >
      {(["bn", "en"] as const).map((l) => (
        <button
          key={l}
          onClick={() => setLang(l)}
          data-active={lang === l}
          className="min-h-12 min-w-12 rounded-full px-3 transition data-[active=true]:bg-primary data-[active=true]:text-primary-foreground"
        >
          {l === "bn" ? "বাংলা" : "EN"}
        </button>
      ))}
    </div>
  );
}

export function StatusBadge({ status }: { status: HouseholdStatus }) {
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
  if (status === "failed")
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-primary-soft px-2 py-0.5 text-[11px] font-bold text-primary">
        <CircleAlert className="h-3 w-3" /> {t("syncFailed")}
      </span>
    );
  if (status !== "pending") return null;
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-gold-soft px-2 py-0.5 text-[11px] font-bold text-gold-ink">
      <CloudOff className="h-3 w-3" /> {t("syncPending")}
    </span>
  );
}

/** Ids of open modals, oldest first; the last one is on top. */
const openModals: string[] = [];

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
  const { t } = useI18n();
  const id = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  useFocusTrap(dialogRef, open);
  // Sized to the area above the on-screen keyboard, so a sheet with inputs stays visible.
  const area = useVisibleArea(open);
  useEffect(() => {
    if (!open) return;
    openModals.push(id);
    document.body.style.overflow = "hidden";
    // Only the topmost sheet reacts to Escape, so closing a dialog over a sheet keeps the sheet.
    const k = (e: KeyboardEvent) => e.key === "Escape" && openModals.at(-1) === id && onClose();
    window.addEventListener("keydown", k);
    return () => {
      openModals.splice(openModals.indexOf(id), 1);
      if (!openModals.length) document.body.style.overflow = "";
      window.removeEventListener("keydown", k);
    };
  }, [open, onClose, id]);
  if (!open || typeof document === "undefined") return null;
  // Portalled to <body>: a dialog opened from inside a sheet isn't clipped by its scroll box.
  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-foreground/50 animate-in fade-in sm:items-center"
      style={area ? { top: area.top, height: area.height, bottom: "auto" } : undefined}
      onClick={onClose}
    >
      <div
        ref={dialogRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="max-h-[92%] w-full max-w-lg overflow-y-auto rounded-t-3xl bg-background p-5 pb-8 outline-none animate-in slide-in-from-bottom-8 sm:rounded-3xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 className="text-xl font-bold">{title}</h2>
          <button
            onClick={onClose}
            className="tap flex items-center justify-center rounded-full bg-muted"
            aria-label={t("close")}
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        {children}
      </div>
    </div>,
    document.body,
  );
}

export function Label({
  children,
  htmlFor,
}: {
  children: ReactNode;
  htmlFor?: string | undefined;
}) {
  return (
    <label htmlFor={htmlFor} className="mb-2 block text-sm font-semibold text-muted-foreground">
      {children}
    </label>
  );
}

export function FieldError({ id, error }: { id: string; error?: ErrKey | null | undefined }) {
  const { t } = useI18n();
  if (!error) return null;
  return (
    <p id={id} role="alert" className="mt-1.5 text-sm font-semibold text-destructive">
      {t(error)}
    </p>
  );
}

/** Labelled input with an inline, screen-reader-linked error message. */
export function TextField({
  id,
  label,
  error,
  className,
  ...props
}: {
  id: string;
  label: ReactNode;
  error?: ErrKey | null | undefined;
} & InputHTMLAttributes<HTMLInputElement>) {
  return (
    <div>
      <Label htmlFor={id}>{label}</Label>
      <input
        id={id}
        className={cn("field", className)}
        aria-invalid={!!error}
        aria-describedby={error ? `${id}-error` : undefined}
        {...props}
      />
      <FieldError id={`${id}-error`} error={error} />
    </div>
  );
}
