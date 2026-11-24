// Receipt view-model (SPEC Story 2.2). Pure: turns domain records into one `Receipt`,
// then into labelled fields and share text. The card, the WhatsApp text and the PNG all
// read from here, so they can never disagree about what a receipt says.
import type { I18n } from "@/lib/i18n";
import type { ChandaTransaction, Club, ClubMember, Household, PaymentMethod } from "@/types/domain";
import { isLive, isRejected, isWaiting } from "@/lib/accounts";

export interface Receipt {
  id: string;
  receipt_no: string;
  amount: number;
  payment_method: PaymentMethod;
  created_at: string;
  /** Voided, or rejected by the admin: either way the receipt is cancelled (ADR 0003). */
  voided: boolean;
  void_reason?: string | undefined;
  rejected: boolean;
  /** Still waiting for the admin; shown on screen only, never on the receipt itself. */
  waiting: boolean;
  void_requested: boolean;
  club: Pick<Club, "name_bn" | "name_en" | "area_label" | "puja_year">;
  donor: {
    name: string;
    house_flat_no?: string | undefined;
    lane_block?: string | undefined;
    phone?: string | undefined;
  };
  collector_name?: string | undefined;
}

export interface ReceiptSources {
  club: Club | null | undefined;
  households: Household[];
  members: ClubMember[];
}

/** The i18n functions a receipt needs; satisfied by `useI18n()`. */
export type ReceiptFormat = Pick<I18n, "t" | "n" | "money" | "words" | "date" | "pick">;

/**
 * Builds the receipt for a chanda entry. Pledges ("promised") are not proof of payment,
 * so they have no receipt; voided entries keep theirs, marked void.
 */
export function toReceipt(
  tx: ChandaTransaction | undefined,
  { club, households, members }: ReceiptSources,
): Receipt | null {
  // A promise (or a cancelled one) has no receipt number: it was never money received.
  if (!tx || !club || tx.status === "promised" || !tx.receipt_no) return null;
  const household = households.find((h) => h.id === tx.household_id);
  return {
    id: tx.id,
    receipt_no: tx.receipt_no,
    amount: tx.amount,
    payment_method: tx.payment_method,
    created_at: tx.created_at,
    // A rejected entry's receipt is cancelled, like a voided one (ADR 0003).
    voided: !isLive(tx),
    void_reason: tx.void_reason ?? tx.rejection_reason ?? undefined,
    rejected: !tx.voided_at && isRejected(tx),
    waiting: isLive(tx) && isWaiting(tx),
    void_requested: isLive(tx) && !!tx.void_requested_at,
    club: {
      name_bn: club.name_bn,
      name_en: club.name_en,
      area_label: club.area_label,
      puja_year: club.puja_year,
    },
    donor: {
      name: household?.resident_name ?? "—",
      house_flat_no: household?.house_flat_no,
      lane_block: household?.lane_block,
      phone: household?.phone_number,
    },
    collector_name: members.find((m) => m.id === tx.collector_id)?.name,
  };
}

export type ReceiptFieldKey = "donor" | "address" | "paidVia" | "collector" | "date";

export interface ReceiptField {
  key: ReceiptFieldKey;
  label: string;
  value: string;
}

/** Labelled rows in display order; rows with no data are left out. */
export function receiptFields(r: Receipt, f: ReceiptFormat): ReceiptField[] {
  const address = [r.donor.house_flat_no && f.n(r.donor.house_flat_no), r.donor.lane_block]
    .filter(Boolean)
    .join(", ");
  const rows: (ReceiptField | false)[] = [
    { key: "donor", label: f.t("donor"), value: r.donor.name },
    !!address && { key: "address", label: f.t("address"), value: address },
    {
      key: "paidVia",
      label: f.t("paidVia"),
      value: r.payment_method === "cash" ? f.t("cash") : f.t("upi"),
    },
    !!r.collector_name && { key: "collector", label: f.t("collector"), value: r.collector_name },
    { key: "date", label: f.t("date"), value: f.date(r.created_at) },
  ];
  return rows.filter((x): x is ReceiptField => !!x);
}

export const clubName = (r: Receipt, f: ReceiptFormat) => f.pick(r.club.name_bn, r.club.name_en);

/** "এক হাজার এক টাকা মাত্র" / "Rupees One Thousand One Only". */
export const amountInWords = (r: Receipt, f: ReceiptFormat) =>
  f.t("amountInWords", { words: f.words(r.amount) });

/**
 * Self-contained plain text for WhatsApp / the share sheet. No link on purpose: until the
 * Phase 2 backend exists, a URL would point at data that only lives on this phone.
 */
export function receiptText(r: Receipt, f: ReceiptFormat): string {
  const lines = [
    `*${clubName(r, f)}*`,
    `${f.t("receiptNo")}: ${r.receipt_no}`,
    ...(r.voided ? [`*${f.t("receiptVoid")}* — ${f.t("receiptVoidNote")}`] : []),
    "",
    ...receiptFields(r, f).map((x) => `${x.label}: ${x.value}`),
    `${f.t("amount")}: *${f.money(r.amount)}* (${amountInWords(r, f)})`,
    "",
    f.t("receiptThanks"),
    `— ${f.t("receiptFooter")}`,
  ];
  return lines.join("\n");
}

/** Safe, readable file name, e.g. "PK-2026-C01-0001.png". */
export const receiptFileName = (r: Receipt, ext: string) =>
  `${r.receipt_no.replace(/[^\w-]+/g, "_")}.${ext}`;
