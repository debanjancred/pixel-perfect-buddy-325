// Shapes mirror the future Laravel REST API: UUIDs, ISO timestamps, snake_case keys.
export type SyncStatus = "synced" | "pending";
export type PledgeStatus = "paid" | "pending" | "promised";
export type PaymentMode = "cash" | "upi";
export type Role = "secretary" | "treasurer" | "collector";
export type ExpenseCategory = "pandal" | "pratima" | "lighting" | "bhog" | "cultural" | "misc";

export interface Club {
  id: string;
  name: string;
  name_en: string;
  para: string;
  zone: string;
  puja_year: number;
  target_amount: number;
  receipt_seq: number;
  created_at: string;
}

export interface Lane {
  bn: string;
  en: string;
}

export interface Household {
  id: string;
  club_id: string;
  lane_bn: string;
  lane_en: string;
  house_no: string;
  resident_name: string;
  resident_name_en: string;
  phone: string;
  pledged_amount: number;
  status: PledgeStatus;
  created_at: string;
  sync_status: SyncStatus;
}

export interface Chanda {
  id: string;
  club_id: string;
  household_id: string | null;
  payer_name: string;
  payer_name_en: string;
  amount: number;
  payment_mode: PaymentMode;
  collector_id: string;
  receipt_no: string;
  created_at: string;
  sync_status: SyncStatus;
}

export interface Expense {
  id: string;
  club_id: string;
  category: ExpenseCategory;
  item_name: string;
  item_name_en: string;
  amount: number;
  approved_by_id: string;
  receipt_image: string | null;
  created_at: string;
  sync_status: SyncStatus;
}

export interface EventSlot {
  label_bn: string;
  label_en: string;
  filled: number;
  capacity: number;
}

export interface PujoEvent {
  id: string;
  club_id: string;
  key: "draw" | "dhunuchi" | "shankha" | "pushpanjali";
  name_bn: string;
  name_en: string;
  date_bn: string;
  date_en: string;
  registrations: number;
  capacity: number;
  slots: EventSlot[];
}

export interface Member {
  id: string;
  club_id: string;
  name: string;
  name_en: string;
  phone: string;
  role: Role;
}

export interface DB {
  version: 1;
  active_club_id: string;
  clubs: Club[];
  lanes: Record<string, Lane[]>;
  households: Household[];
  chandas: Chanda[];
  expenses: Expense[];
  events: PujoEvent[];
  members: Member[];
}

export interface Summary {
  club: Club;
  collected: number;
  spent: number;
  balance: number;
  target: number;
  pending_sync: number;
}
