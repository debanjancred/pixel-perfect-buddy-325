import type { ReactNode } from "react";
import { useI18n } from "@/lib/i18n";
import { Modal } from "./ui";

/** Asks before a destructive or hard-to-undo action. */
export function ConfirmDialog({
  title,
  children,
  confirmLabel,
  busy,
  onConfirm,
  onCancel,
}: {
  title: string;
  children?: ReactNode;
  confirmLabel?: string;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const { t } = useI18n();
  return (
    <Modal open onClose={onCancel} title={title}>
      {children}
      <div className="mt-5 grid grid-cols-2 gap-3">
        <button type="button" className="btn btn-outline" onClick={onCancel}>
          {t("cancel")}
        </button>
        <button type="button" className="btn btn-primary" onClick={onConfirm} disabled={busy}>
          {confirmLabel ?? t("confirm")}
        </button>
      </div>
    </Modal>
  );
}
