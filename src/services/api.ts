// Service repository. Every method is async with a 200ms delay so it can be swapped
// for a Laravel REST client later without touching UI code.
import { seedDB } from "./seed";
import type { Chanda, Club, DB, Expense, ExpenseCategory, Household, Member, PaymentMode, Role, Summary, SyncStatus } from "./types";

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
const mine = <T extends { club_id: string }>(db: DB, list: T[]) => list.filter((x) => x.club_id === db.active_club_id);
const activeClub = (db: DB): Club => (db.clubs.find((c) => c.id === db.active_club_id) ?? db.clubs[0])!;

export const api = {
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
  async createClub(input: { name: string; para: string; zone: string; puja_year: number; target_amount: number }) {
    await delay();
    const db = read();
    const club: Club = { ...input, name_en: input.name, id: uuid(), receipt_seq: 0, created_at: now() };
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
    const pending_sync = [...mine(db, db.chandas), ...mine(db, db.expenses), ...mine(db, db.households)].filter((x) => x.sync_status === "pending").length;
    return { club, collected, spent, balance: collected - spent, target: club.target_amount, pending_sync };
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
  async createHousehold(input: Pick<Household, "resident_name" | "house_no" | "lane_bn" | "lane_en" | "phone" | "pledged_amount">) {
    await delay();
    const db = read();
    const h: Household = { ...input, resident_name_en: input.resident_name, id: uuid(), club_id: db.active_club_id, status: "pending", created_at: now(), sync_status: syncState() };
    db.households.push(h);
    write(db);
    return h;
  },
  async createChanda(input: { household_id: string | null; payer_name: string; amount: number; payment_mode: PaymentMode; collector_id: string }) {
    await delay();
    const db = read();
    const club = activeClub(db);
    club.receipt_seq += 1;
    const hh = db.households.find((h) => h.id === input.household_id);
    const c: Chanda = {
      ...input, payer_name_en: hh?.resident_name_en ?? input.payer_name, id: uuid(), club_id: club.id,
      receipt_no: `PK-${club.puja_year}-${String(club.receipt_seq).padStart(4, "0")}`, created_at: now(), sync_status: syncState(),
    };
    if (hh) hh.status = "paid";
    db.chandas.push(c);
    write(db);
    return c;
  },
  async createExpense(input: { category: ExpenseCategory; item_name: string; amount: number; approved_by_id: string; receipt_image: string | null }) {
    await delay();
    const db = read();
    const e: Expense = { ...input, item_name_en: input.item_name, id: uuid(), club_id: db.active_club_id, created_at: now(), sync_status: syncState() };
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
    for (const list of [db.chandas, db.expenses, db.households] as { sync_status: SyncStatus }[][]) {
      for (const x of list) if (x.sync_status === "pending") { x.sync_status = "synced"; n++; }
    }
    write(db);
    return n;
  },
  async resetDemo() {
    await delay();
    write(seedDB());
  },
};
