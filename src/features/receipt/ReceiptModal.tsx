import { useI18n } from "@/lib/i18n";
import { Modal } from "@/components/pk/ui";
import { useReceipt } from "./use-receipt";
import { ReceiptActions } from "./ReceiptActions";
import { ReceiptCard } from "./ReceiptCard";

/** Receipt shown straight after a chanda is saved. Closed while `transactionId` is null. */
export function ReceiptModal({
  transactionId,
  onClose,
}: {
  transactionId: string | null;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const { receipt } = useReceipt(transactionId);
  if (!receipt) return null;
  return (
    <Modal open onClose={onClose} title={t("receipt")}>
      <ReceiptCard receipt={receipt} />
      <div className="mt-4">
        <ReceiptActions receipt={receipt} />
      </div>
      <button type="button" className="btn btn-primary mt-3 w-full" onClick={onClose}>
        {t("done")}
      </button>
    </Modal>
  );
}
