import { useState } from "react";
import { Ban } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { usePermission, useVoidTransaction, useVoidLabel } from "@/hooks/use-data";
import { VoidDialog } from "@/components/pk/VoidDialog";
import type { Receipt } from "./model";

/** Void this chanda entry (Story 2.3) — treasurers and admins only, live entries only. */
export function ReceiptVoid({ receipt }: { receipt: Receipt }) {
  const { t, money } = useI18n();
  const allowed = usePermission("entry.void");
  const voidTx = useVoidTransaction();
  const label = useVoidLabel();
  const [open, setOpen] = useState(false);
  const note = receipt.void_requested
    ? "voidRequestedNote"
    : receipt.waiting
      ? "pendingNote"
      : null;
  const showButton = allowed && !receipt.voided && !receipt.void_requested;
  if (!note && !showButton) return null;

  return (
    <>
      {note && (
        <p role="status" className="mb-3 rounded-xl bg-info-soft p-3 text-sm font-bold text-info">
          {t(note)}
        </p>
      )}
      {showButton && (
        <button
          type="button"
          className="btn btn-outline w-full text-destructive"
          onClick={() => setOpen(true)}
        >
          <Ban className="h-5 w-5" aria-hidden /> {t(label)}
        </button>
      )}
      {open && (
        <VoidDialog
          summary={`${receipt.receipt_no} · ${money(receipt.amount)}`}
          onClose={() => setOpen(false)}
          onVoid={(reason) => voidTx.mutateAsync({ id: receipt.id, reason })}
        />
      )}
    </>
  );
}
