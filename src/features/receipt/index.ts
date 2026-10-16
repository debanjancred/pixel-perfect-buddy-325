// Public surface of the receipt module (M3b / SPEC Story 2.2). Import from
// "@/features/receipt" rather than reaching into its files.
export { ReceiptCard } from "./ReceiptCard";
export { ReceiptActions } from "./ReceiptActions";
export { ReceiptModal } from "./ReceiptModal";
export { ReceiptVoid } from "./ReceiptVoid";
export { useReceipt } from "./use-receipt";
export {
  amountInWords,
  receiptFields,
  receiptFileName,
  receiptText,
  toReceipt,
  type Receipt,
  type ReceiptField,
  type ReceiptFormat,
  type ReceiptSources,
} from "./model";
