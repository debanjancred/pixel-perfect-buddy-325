// Public surface of the approvals module (M14 / ADR 0003). Import from
// "@/features/approvals" rather than reaching into its files.
export { ApprovalQueue } from "./ApprovalQueue";
export { ApprovalsLink } from "./ApprovalsLink";
export {
  APPROVAL_KINDS,
  approvalCounts,
  approvalRows,
  filterApprovals,
  splitApprovals,
  visibleSelection,
  type ApprovalRow,
  type KindFilter,
} from "./model";
