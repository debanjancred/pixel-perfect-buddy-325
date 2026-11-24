// Approvals view-model (ADR 0003). Pure: turns what waits for the admin into rows the
// screen lists, filters and selects for bulk approve.
import type { I18n } from "@/lib/i18n";
import { categoryInfo, categoryKeyOf } from "@/lib/categories";
import type { ApprovalItem, ApprovalKind, EntryRef } from "@/services/api";
import type { ClubMember, Household } from "@/types/domain";

export const APPROVAL_KINDS: readonly ApprovalKind[] = ["chanda", "expense", "handover"];

export type KindFilter = "all" | ApprovalKind;

export interface ApprovalRow {
  /** Unique across kinds and actions: "chanda:<id>". */
  key: string;
  ref: EntryRef;
  /** "entry": approve or reject what was recorded; "void": decide a request to cancel it. */
  action: ApprovalItem["action"];
  title: string;
  detail: string;
  amount: number;
  /** Who recorded the entry, or who asked for the void. */
  by: string;
  /** When it was recorded, or when the void was asked for. */
  at: string;
  /** The void request's reason. */
  reason?: string;
  /** A treasurer's correction sent the expense back for review. */
  edited: boolean;
  /** Chanda only: opens the receipt. */
  receipt_id?: string;
  voucher_image_id?: string;
}

export interface ApprovalSources {
  members: ClubMember[];
  households: Household[];
}

type Format = Pick<I18n, "t">;

const nameOf = (members: ClubMember[], id: string | null | undefined) =>
  members.find((m) => m.id === id)?.name ?? "—";

/** One row per waiting item, in the order the api gives (oldest first). */
export function approvalRows(
  items: ApprovalItem[],
  { members, households }: ApprovalSources,
  f: Format,
): ApprovalRow[] {
  return items.map((item) => {
    const { kind, record: r, action } = item;
    const base = {
      key: `${kind}:${r.id}`,
      ref: { kind, id: r.id },
      action,
      amount: r.amount,
      at: (action === "void" ? r.void_requested_at : r.created_at) ?? r.created_at,
      edited: false,
      ...(action === "void" && r.void_request_reason ? { reason: r.void_request_reason } : {}),
    };
    const requester = action === "void" ? nameOf(members, r.void_requested_by_id) : null;
    switch (item.kind) {
      case "chanda": {
        const c = item.record;
        const h = households.find((x) => x.id === c.household_id);
        const method = c.payment_method === "upi" ? f.t("upi") : f.t("cash");
        return {
          ...base,
          title: h?.resident_name ?? "—",
          detail:
            c.status === "promised"
              ? f.t("promised")
              : [c.receipt_no, method].filter(Boolean).join(" · "),
          by: requester ?? nameOf(members, c.collector_id),
          ...(c.receipt_no ? { receipt_id: c.id } : {}),
        };
      }
      case "expense": {
        const e = item.record;
        return {
          ...base,
          title: e.title,
          detail: `${categoryInfo(categoryKeyOf(e), f.t).label} · ${e.paid_to}`,
          by: requester ?? nameOf(members, e.recorded_by_id ?? e.authorized_by_id),
          edited: action === "entry" && !!e.edited_at,
          ...(e.voucher_image_id ? { voucher_image_id: e.voucher_image_id } : {}),
        };
      }
      case "handover": {
        const h = item.record;
        return {
          ...base,
          title: `${nameOf(members, h.collector_id)} → ${nameOf(members, h.received_by_id)}`,
          detail: f.t("approvalKind_handover"),
          by: requester ?? nameOf(members, h.received_by_id),
        };
      }
    }
  });
}

/** How many rows of each kind wait, for the filter chips. */
export function approvalCounts(rows: ApprovalRow[]): Record<KindFilter, number> {
  const counts = { all: rows.length, chanda: 0, expense: 0, handover: 0 };
  for (const r of rows) counts[r.ref.kind]++;
  return counts;
}

export const filterApprovals = (rows: ApprovalRow[], kind: KindFilter) =>
  kind === "all" ? rows : rows.filter((r) => r.ref.kind === kind);

/** Void requests first (they change totals already counted), then entries to review. */
export function splitApprovals(rows: ApprovalRow[]) {
  return {
    voids: rows.filter((r) => r.action === "void"),
    entries: rows.filter((r) => r.action === "entry"),
  };
}

/**
 * The selection after the list changed: keys no longer listed (decided elsewhere, or
 * filtered away) drop out, so bulk approve only ever sends what the admin can see.
 */
export const visibleSelection = (selected: ReadonlySet<string>, rows: ApprovalRow[]) =>
  rows.filter((r) => r.action === "entry" && selected.has(r.key));
