// Domain model — mirrors SPEC.md Section 4 and the future Laravel REST API:
// UUID ids, snake_case fields, ISO 8601 timestamps, integer rupees.

export type PaymentMethod = "cash" | "upi";

/** 'void' replaces deletion. 'promised' = pledged, not yet received. */
export type ChandaStatus = "collected" | "promised" | "void";

export type SyncStatus = "pending" | "synced" | "failed";

/** One value per category. Display labels come from i18n. */
export type ExpenseCategory = "pandal" | "idol" | "lighting" | "bhog" | "cultural" | "misc";

export type UserRole = "admin" | "treasurer" | "collector";

/** ISO 8601 timestamp, e.g. "2026-10-12T10:30:00.000Z" */
export type IsoDateTime = string;
/** Calendar date, "YYYY-MM-DD" */
export type IsoDate = string;

export interface ClubMember {
  id: string;
  club_id: string;
  name: string; // as entered, e.g. "কর্মী ০১"
  role: UserRole;
  phone: string; // 10 ASCII digits
  collector_code: string; // e.g. "C01"; unique within the club; used in receipt_no
  created_at: IsoDateTime;
}

export interface Club {
  id: string;
  slug: string; // e.g. "sample-puja-committee-2026"
  name_bn: string;
  name_en: string;
  area_label: string; // as entered, e.g. "ব্লক এ"
  target_amount: number; // integer rupees, > 0
  puja_year: number;
  created_at: IsoDateTime;
}

export interface Household {
  id: string;
  club_id: string;
  lane_block: string; // as entered, e.g. "ব্লক এ"
  house_flat_no: string; // ASCII digits/letters, e.g. "101" — rendered with n()
  resident_name: string; // as entered
  phone_number?: string; // 10 ASCII digits
  created_at: IsoDateTime;
}

export interface ChandaTransaction {
  id: string; // doubles as idempotency key
  receipt_no: string; // "PK-{puja_year}-{writer's collector_code}-{seq:4}", e.g. "PK-2026-C01-0001"
  club_id: string;
  household_id: string;
  amount: number; // integer rupees, >= 1
  payment_method: PaymentMethod;
  status: ChandaStatus;
  collector_id: string; // ClubMember.id
  created_at: IsoDateTime;
  updated_at: IsoDateTime;
  voided_at?: IsoDateTime;
  void_reason?: string;
  sync_status: SyncStatus;
  // Cloud mode only. The device it was written on (UserDevice.id), and the server's flag that
  // it was not the writer's collect device when it synced (accepted, shown for review).
  device_id?: string;
  off_device?: boolean;
}

export interface ExpenseRecord {
  id: string;
  club_id: string;
  category: ExpenseCategory;
  title: string; // as entered
  amount: number; // integer rupees, >= 1
  paid_to: string; // as entered
  authorized_by_id: string; // ClubMember.id
  voucher_image_id?: string; // IndexedDB key, via api.saveVoucherImage()
  date: IsoDate;
  created_at: IsoDateTime;
  updated_at: IsoDateTime;
  voided_at?: IsoDateTime;
  void_reason?: string;
  // Cloud mode only: the server's flag that it came from a removed device (accepted, for review).
  off_device?: boolean;
  sync_status: SyncStatus;
}

export interface CashHandover {
  id: string;
  club_id: string;
  collector_id: string; // ClubMember.id handing over
  received_by_id: string; // ClubMember.id (treasurer/admin)
  amount: number; // integer rupees
  created_at: IsoDateTime;
  voided_at?: IsoDateTime;
  void_reason?: string;
  // Cloud mode only: the server's flag that it came from a removed device (accepted, for review).
  off_device?: boolean;
  sync_status: SyncStatus;
}

export interface ClubEvent {
  id: string;
  club_id: string;
  title_bn: string;
  title_en: string;
  date: IsoDate;
  registrations_count: number;
  created_at: IsoDateTime;
  updated_at?: IsoDateTime;
  // Admins delete events softly so other phones learn of it on their next pull; deleted
  // events are hidden everywhere and take no registrations.
  deleted_at?: IsoDateTime | null;
}

export interface AccountsSummary {
  total_collected: number;
  collected_cash: number;
  collected_upi: number;
  total_promised: number;
  total_expenses: number;
  net_balance: number;
  collection_target: number;
  progress_pct: number; // 0–100 integer
  pending_sync_count: number;
}

/** A device a person is signed in on (cloud mode); at most 3, one of them collects chanda. */
export interface UserDevice {
  id: string;
  label: string; // e.g. "Android · Chrome"
  is_collect: boolean;
  created_at: IsoDateTime;
  last_seen_at: IsoDateTime;
}
