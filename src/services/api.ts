// Service repository. Every method is async with a 200ms delay so it can be swapped
// for a Laravel REST client later without touching UI code.
import { seedDB } from "./seed";
import {
  ValidationError,
  check,
  clubSchema,
  otpSchema,
  phoneSchema,
  sameName,
  chandaSchema,
  householdSchema,
  parseOrThrow,
  type ChandaInput,
  type ClubInput,
  type HouseholdInput,
} from "@/lib/validation";
import type {
  Chanda,
  Club,
  DB,
  Expense,
  ExpenseCategory,
  Household,
  Member,
  Role,
  Summary,
  SyncStatus,
} from "./types";

const KEY = "pk_db_v1";
const delay = (ms = 200) => new Promise<void>((r) => setTimeout(r, ms));
const uuid = () => crypto.randomUUID();
const now = () => new Date().toISOString();
const isOnline = () => typeof navigator === "undefined" || navigator.onLine;
const syncState = (): SyncStatus => (isOnline() ? "synced" : "pending");

function write(db: DB) {
  localStorage.setItem(KEY, JSON.stringify(db));
}
function read(): DB {
  const raw = localStorage.getItem(KEY);
  if (raw) {
    try {
      return JSON.parse(raw) as DB;
    } catch {
      /* fall through to reseed */
    }
  }
  const db = seedDB();
  write(db);
  return db;
}
const mine = <T extends { club_id: string }>(db: DB, list: T[]) =>
  list.filter((x) => x.club_id === db.active_club_id);
// Mock OTP until the Laravel auth endpoint exists: every number gets the demo code.
export const DEMO_OTP = "1234";
const OTP_MAX_ATTEMPTS = 5;
const OTP_RESEND_SECONDS = 30;
const otpAttempts = new Map<string, number>();

const activeClub = (db: DB): Club =>
  (db.clubs.find((c) => c.id === db.active_club_id) ?? db.clubs[0])!;

export const api = {
  async requestOtp(phone: string) {
    await delay();
    const err = check(phoneSchema, phone);
    if (err) throw new ValidationError("phone", err);
    otpAttempts.set(phone, 0);
    return { resend_after: OTP_RESEND_SECONDS };
  },
  async verifyOtp(phone: string, otp: string) {
    await delay();
    const used = otpAttempts.get(phone);
    if (used === undefined || used >= OTP_MAX_ATTEMPTS)
      throw new ValidationError("otp", "err_otpExpired");
    const err = check(otpSchema, otp);
    if (err) throw new ValidationError("otp", err);
    if (otp !== DEMO_OTP) {
      otpAttempts.set(phone, used + 1);
      throw new ValidationError(
        "otp",
        used + 1 >= OTP_MAX_ATTEMPTS ? "err_otpExpired" : "err_otpWrong",
      );
    }
    otpAttempts.delete(phone);
    return { phone };
  },
  /** Switch to the seeded demo club (always the first club). */
  async enterDemo() {
    await delay();
    const db = read();
    db.active_club_id = db.clubs[0]!.id;
    write(db);
  },
  async getClubs() {
    await delay();
    const db = read();
    return { clubs: db.clubs, active_club_id: db.active_club_id };
  },
  async setActiveClub(id: string) {
    await delay();
    const db = read();
    db.active_club_id = id;
    write(db);
  },
  async createClub(raw: ClubInput) {
    await delay();
    const input = parseOrThrow(clubSchema, raw);
    const db = read();
    const taken = db.clubs.some(
      (c) =>
        c.puja_year === input.puja_year &&
        (sameName(c.name, input.name) || sameName(c.name_en, input.name)),
    );
    if (taken) throw new ValidationError("name", "err_clubExists");
    const club: Club = {
      ...input,
      name_en: input.name,
      id: uuid(),
      receipt_seq: 0,
      created_at: now(),
    };
    db.clubs.push(club);
    db.lanes[club.id] = [{ bn: input.para || "মেন রোড", en: input.para || "Main Road" }];
    db.active_club_id = club.id;
    write(db);
    return club;
  },
  async getSummary(): Promise<Summary> {
    await delay();
    const db = read();
    const club = activeClub(db);
    const collected = mine(db, db.chandas).reduce((s, c) => s + c.amount, 0);
    const spent = mine(db, db.expenses).reduce((s, e) => s + e.amount, 0);
    const pending_sync = [
      ...mine(db, db.chandas),
      ...mine(db, db.expenses),
      ...mine(db, db.households),
    ].filter((x) => x.sync_status === "pending").length;
    return {
      club,
      collected,
      spent,
      balance: collected - spent,
      target: club.target_amount,
      pending_sync,
    };
  },
  async listLanes() {
    await delay(50);
    const db = read();
    return db.lanes[db.active_club_id] ?? [];
  },
  async listHouseholds() {
    await delay();
    const db = read();
    return mine(db, db.households);
  },
  async listChandas() {
    await delay();
    const db = read();
    return mine(db, db.chandas).sort((a, b) => b.created_at.localeCompare(a.created_at));
  },
  async listExpenses() {
    await delay();
    const db = read();
    return mine(db, db.expenses).sort((a, b) => b.created_at.localeCompare(a.created_at));
  },
  async listEvents() {
    await delay();
    const db = read();
    return mine(db, db.events);
  },
  async listMembers() {
    await delay();
    const db = read();
    return mine(db, db.members);
  },
  async createHousehold(raw: HouseholdInput) {
    await delay();
    const input = parseOrThrow(householdSchema, raw);
    const db = read();
    const taken = mine(db, db.households).some(
      (h) =>
        h.lane_bn === input.lane_bn &&
        sameName(h.house_no, input.house_no) &&
        (sameName(h.resident_name, input.resident_name) ||
          sameName(h.resident_name_en, input.resident_name)),
    );
    if (taken) throw new ValidationError("resident_name", "err_householdExists");
    const h: Household = {
      ...input,
      resident_name_en: input.resident_name,
      id: uuid(),
      club_id: db.active_club_id,
      status: "pending",
      created_at: now(),
      sync_status: syncState(),
    };
    db.households.push(h);
    write(db);
    return h;
  },
  async createChanda(raw: ChandaInput) {
    await delay();
    const input = parseOrThrow(chandaSchema, raw);
    const db = read();
    const club = activeClub(db);
    const hh = input.household_id
      ? db.households.find((h) => h.id === input.household_id && h.club_id === club.id)
      : undefined;
    if (input.household_id && !hh) throw new ValidationError("household_id", "err_household");
    if (!db.members.some((m) => m.id === input.collector_id && m.club_id === club.id))
      throw new ValidationError("collector_id", "err_collector");
    // Never reuse a receipt number, even if the stored counter fell behind the ledger.
    const used = mine(db, db.chandas).map((c) => Number(c.receipt_no.split("-").pop()) || 0);
    club.receipt_seq = Math.max(club.receipt_seq, ...used) + 1;
    const c: Chanda = {
      ...input,
      payer_name_en: hh?.resident_name_en ?? input.payer_name,
      id: uuid(),
      club_id: club.id,
      receipt_no: `PK-${club.puja_year}-${String(club.receipt_seq).padStart(4, "0")}`,
      created_at: now(),
      sync_status: syncState(),
    };
    db.chandas.push(c);
    // A household is paid only once the pledge is fully covered; partial payments keep it due.
    if (hh) {
      const paid = db.chandas
        .filter((x) => x.household_id === hh.id)
        .reduce((sum, x) => sum + x.amount, 0);
      if (paid >= hh.pledged_amount) hh.status = "paid";
    }
    write(db);
    return c;
  },
  async createExpense(input: {
    category: ExpenseCategory;
    item_name: string;
    amount: number;
    approved_by_id: string;
    receipt_image: string | null;
  }) {
    await delay();
    const db = read();
    const e: Expense = {
      ...input,
      item_name_en: input.item_name,
      id: uuid(),
      club_id: db.active_club_id,
      created_at: now(),
      sync_status: syncState(),
    };
    db.expenses.push(e);
    write(db);
    return e;
  },
  async registerEvent(id: string, slotIndex?: number) {
    await delay();
    const db = read();
    const ev = db.events.find((e) => e.id === id);
    if (ev) {
      if (slotIndex !== undefined) {
        const s = ev.slots[slotIndex];
        if (s && s.filled < s.capacity) s.filled += 1;
      } else if (ev.registrations < ev.capacity) ev.registrations += 1;
    }
    write(db);
  },
  async createMember(input: { name: string; phone: string; role: Role }) {
    await delay();
    const db = read();
    const m: Member = { ...input, name_en: input.name, id: uuid(), club_id: db.active_club_id };
    db.members.push(m);
    write(db);
    return m;
  },
  async updateMemberRole(id: string, role: Role) {
    await delay();
    const db = read();
    const m = db.members.find((x) => x.id === id);
    if (m) m.role = role;
    write(db);
  },
  /** Flush offline queue — later this will POST queued rows to the server. */
  async syncPending() {
    await delay();
    const db = read();
    let n = 0;
    for (const list of [db.chandas, db.expenses, db.households] as {
      sync_status: SyncStatus;
    }[][]) {
      for (const x of list)
        if (x.sync_status === "pending") {
          x.sync_status = "synced";
          n++;
        }
    }
    write(db);
    return n;
  },
  async resetDemo() {
    await delay();
    write(seedDB());
  },
};
