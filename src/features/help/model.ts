import type { SupportCategory, SupportTicket } from "@/types/domain";

/** The "What is the problem about?" choices, in display order. */
export const HELP_CATEGORIES: SupportCategory[] = ["login", "sync", "device", "entry", "other"];

export type HelpStatus = "pending" | "failed" | "open" | "closed";

/**
 * What the member sees for a request: until the server has it, whether it is waiting to send
 * or was refused; after that, the server's status.
 */
export function helpStatus(t: Pick<SupportTicket, "sync_status" | "status">): HelpStatus {
  if (t.sync_status === "pending") return "pending";
  if (t.sync_status === "failed") return "failed";
  return t.status;
}

/** Chip tone per status, from the palette's semantic classes. */
export const HELP_STATUS_TONE: Record<HelpStatus, string> = {
  pending: "bg-muted text-muted-foreground",
  failed: "bg-primary-soft text-primary",
  open: "bg-gold-soft text-gold-ink",
  closed: "bg-success-soft text-success",
};
