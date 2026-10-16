import { useState } from "react";
import { Ban } from "lucide-react";
import { toast } from "sonner";
import { useI18n } from "@/lib/i18n";
import { usePermission, useVoidTransaction } from "@/hooks/use-data";
import { VoidDialog } from "@/components/pk/VoidDialog";
import type { Receipt } from "./model";

/** Void this chanda entry (Story 2.3) — treasurers and admins only, live entries only. */
export function ReceiptVoid({ receipt }: { receipt: Receipt }) {
  const { t, money } = useI18n();
  const allowed = usePermission("entry.void");
  const voidTx = useVoidTransaction();
  const [open, setOpen] = useState(false);
  if (!allowed || receipt.voided) return null;

  return (
    <>
      <button
        type="button"
        className="btn btn-outline w-full text-destructive"
        onClick={() => setOpen(true)}
      >
        <Ban className="h-5 w-5" aria-hidden /> {t("void")}
      </button>
      {open && (
        <VoidDialog
          summary={`${receipt.receipt_no} · ${money(receipt.amount)}`}
          onClose={() => setOpen(false)}
          onVoid={async (reason) => {
            await voidTx.mutateAsync({ id: receipt.id, reason });
            toast.success(t("voided"));
          }}
        />
      )}
    </>
  );
}
