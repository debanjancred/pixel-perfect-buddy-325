// Service repository — the only module that touches localStorage or IndexedDB.
// Every method is async with a short delay so it can be swapped for the Laravel REST
// client later without touching UI code. Inputs are validated here as well as in forms.
import { computeSummary } from "@/lib/accounts";
import { buildDemoData, DEMO_SLUG } from "@/mocks/mockData";
import {
  VOUCHER_MAX_BYTES,
  ValidationError,
  chandaSchema,
  check,
  clubSchema,
  expenseSchema,
  householdSchema,
  memberSchema,
  otpSchema,
  parseOrThrow,
  phoneSchema,
  sameName,
  voidReasonSchema,
  type ChandaInput,
  type ClubInput,
  type ExpenseInput,
  type HouseholdInput,
  type MemberInput,
} from "@/lib/validation";
import type {
  AccountsSummary,
  CashHandover,
  ChandaTransaction,
  Club,
  ClubEvent,
  ClubMember,
  ExpenseRecord,
  Household,
  UserRole,
} from "@/types/domain";

interface Store {
  version: 2;
  active_club_id: string | null;
  clubs: Club[];
  members: ClubMember[];
  households: Household[];
  chanda: ChandaTransaction[];
  expenses: ExpenseRecord[];
  handovers: CashHandover[];
  events: ClubEvent[];
}

const KEY = "pk_db_v2";
const delay = (ms = 150) => new Promise<void>((r) => setTimeout(r, ms));
const uuid = () => crypto.randomUUID();
const now = () => new Date().toISOString();
const isOnline = () => typeof navigator === "undefined" || navigator.onLine;

const empty = (): Store => ({
  version: 2,
  active_club_id: null,
  clubs: [],
  members: [],
  households: [],
  chanda: [],
  expenses: [],
  handovers: [],
  events: [],
});

function read(): Store {
  try {
    const raw = localStorage.getItem(KEY);
    const db = raw ? (JSON.parse(raw) as Store) : null;
    if (db?.version === 2) return db;
  } catch {
    /* fall through to an empty store */
  }
  return empty();
}
function write(db: Store) {
  localStorage.setItem(KEY, JSON.stringify(db));
}

const activeClub = (db: Store) => db.clubs.find((c) => c.id === db.active_club_id) ?? null;
function requireClub(db: Store): Club {
  const club = activeClub(db);
  if (!club) throw new ValidationError("club_id", "err_noClub");
  return club;
}
const mine = <T extends { club_id: string }>(db: Store, list: T[]) =>
  list.filter((x) => x.club_id === db.active_club_id);
const newestFirst = <T extends { created_at: string }>(list: T[]) =>
  [...list].sort((a, b) => b.created_at.localeCompare(a.created_at));

// --- OTP (mock until the Laravel auth endpoint exists: every number gets the demo code) ---
export const DEMO_OTP = "1234";
const OTP_MAX_ATTEMPTS = 5;
const OTP_RESEND_SECONDS = 30;
const otpAttempts = new Map<string, number>();

// --- Voucher images live in IndexedDB; localStorage's ~5 MB quota can't hold photos ---
const IDB_NAME = "pujo_khata";
const IDB_STORE = "vouchers";

function openVoucherDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new ValidationError("voucher", "err_voucher"));
      return;
    }
    const req = indexedDB.open(IDB_NAME, 1);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(IDB_STORE)) req.result.createObjectStore(IDB_STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function voucherTx<T>(
  mode: IDBTransactionMode,
  run: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  const db = await openVoucherDB();
  return new Promise((resolve, reject) => {
    const req = run(db.transaction(IDB_STORE, mode).objectStore(IDB_STORE));
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

// --- Receipt numbers: "PK-{puja_year}-{collector_code}-{seq:4}", per collector and year ---
function nextReceiptNo(db: Store, club: Club, code: string) {
  const prefix = `PK-${club.puja_year}-${code}-`;
  const used = mine(db, db.chanda)
    .filter((c) => c.receipt_no.startsWith(prefix))
    .map((c) => Number(c.receipt_no.slice(prefix.length)) || 0);
  return prefix + String(Math.max(0, ...used) + 1).padStart(4, "0");
}

const ROLE_PREFIX: Record<UserRole, string> = { admin: "A", treasurer: "T", collector: "C" };
function nextCollectorCode(db: Store, role: UserRole) {
  const p = ROLE_PREFIX[role];
  const used = mine(db, db.members)
    .filter((m) => m.collector_code.startsWith(p))
    .map((m) => Number(m.collector_code.slice(1)) || 0);
  return p + String(Math.max(0, ...used) + 1).padStart(2, "0");
}

const slugify = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

function voidRecord<T extends { id: string; voided_at?: string; status?: string }>(
  list: T[],
  id: string,
  reason: string,
  field: string,
) {
  const void_reason = parseOrThrow(voidReasonSchema, reason);
  const rec = list.find((x) => x.id === id);
  if (!rec) throw new ValidationError(field, "err_notFound");
  if (rec.voided_at) throw new ValidationError(field, "err_alreadyVoid");
  const at = now();
  Object.assign(rec, { voided_at: at, void_reason, updated_at: at, sync_status: "pending" });
  return rec;
}

// Plain functions (no `this`) so methods can be passed around unbound.
async function getClub(): Promise<Club | null> {
  await delay();
  return activeClub(read());
}

async function createChanda(raw: ChandaInput): Promise<ChandaTransaction> {
  await delay();
  const input = parseOrThrow(chandaSchema, raw);
  const db = read();
  // The client-generated id is the idempotency key: a double tap returns the first entry.
  const existing = db.chanda.find((c) => c.id === input.id);
  if (existing) return existing;
  const club = requireClub(db);
  if (!mine(db, db.households).some((h) => h.id === input.household_id))
    throw new ValidationError("household_id", "err_household");
  const collector = mine(db, db.members).find((m) => m.id === input.collector_id);
  if (!collector) throw new ValidationError("collector_id", "err_collector");
  const at = now();
  const tx: ChandaTransaction = {
    ...input,
    receipt_no: nextReceiptNo(db, club, collector.collector_code),
    club_id: club.id,
    created_at: at,
    updated_at: at,
    // Local-first: everything starts pending; sync() marks it synced (Story 5.1).
    sync_status: "pending",
  };
  db.chanda.push(tx);
  write(db);
  return tx;
}

async function createExpense(raw: ExpenseInput): Promise<ExpenseRecord> {
  await delay();
  const input = parseOrThrow(expenseSchema, raw);
  const db = read();
  const existing = db.expenses.find((e) => e.id === input.id);
  if (existing) return existing;
  const club = requireClub(db);
  const by = mine(db, db.members).find((m) => m.id === input.authorized_by_id);
  if (!by || by.role === "collector")
    throw new ValidationError("authorized_by_id", "err_authorizer");
  const at = now();
  const { voucher_image_id, ...rest } = input;
  const exp: ExpenseRecord = {
    ...rest,
    ...(voucher_image_id ? { voucher_image_id } : {}),
    club_id: club.id,
    created_at: at,
    updated_at: at,
    sync_status: "pending",
  };
  db.expenses.push(exp);
  write(db);
  return exp;
}

async function seedDemo(): Promise<void> {
  await delay();
  const db = read();
  // Idempotent: a second tap just reopens the existing sample club.
  const demo = db.clubs.find((c) => c.slug === DEMO_SLUG);
  if (demo) {
    db.active_club_id = demo.id;
  } else {
    const d = buildDemoData();
    db.clubs.push(d.club);
    db.members.push(...d.members);
    db.households.push(...d.households);
    db.chanda.push(...d.chanda);
    db.expenses.push(...d.expenses);
    db.events.push(...d.events);
    db.active_club_id = d.club.id;
  }
  write(db);
}

export const api = {
  // --- Auth (mock) ---
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

  // --- Clubs ---
  getClub,
  seedDemo,
  /** Drop the sample club's records and reseed it from fixtures. Other clubs are untouched. */
  async resetDemo() {
    const db = read();
    const demo = db.clubs.find((c) => c.slug === DEMO_SLUG);
    if (demo) {
      const keep = <T extends { club_id: string }>(l: T[]) =>
        l.filter((x) => x.club_id !== demo.id);
      write({
        ...db,
        clubs: db.clubs.filter((c) => c.id !== demo.id),
        members: keep(db.members),
        households: keep(db.households),
        chanda: keep(db.chanda),
        expenses: keep(db.expenses),
        handovers: keep(db.handovers),
        events: keep(db.events),
      });
    }
    await seedDemo();
  },
  async listClubs() {
    await delay();
    const db = read();
    return { clubs: db.clubs, active_club_id: db.active_club_id };
  },
  async setActiveClub(id: string) {
    await delay();
    const db = read();
    if (!db.clubs.some((c) => c.id === id)) throw new ValidationError("club_id", "err_noClub");
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
        (sameName(c.name_bn, input.name) || sameName(c.name_en, input.name)),
    );
    if (taken) throw new ValidationError("name", "err_clubExists");
    const base = slugify(`${input.name} ${input.puja_year}`) || `club-${input.puja_year}`;
    let slug = base;
    for (let i = 2; db.clubs.some((c) => c.slug === slug); i++) slug = `${base}-${i}`;
    // A user-entered name is stored once, as typed, in both language slots.
    const club: Club = {
      id: uuid(),
      slug,
      name_bn: input.name,
      name_en: input.name,
      area_label: [input.para, input.zone].filter(Boolean).join(" · "),
      target_amount: input.target_amount,
      puja_year: input.puja_year,
      created_at: now(),
    };
    db.clubs.push(club);
    db.active_club_id = club.id;
    write(db);
    return club;
  },

  // --- Members ---
  async listMembers(): Promise<ClubMember[]> {
    await delay();
    const db = read();
    return mine(db, db.members);
  },
  async createMember(raw: MemberInput): Promise<ClubMember> {
    await delay();
    const input = parseOrThrow(memberSchema, raw);
    const db = read();
    const club = requireClub(db);
    const m: ClubMember = {
      ...input,
      id: uuid(),
      club_id: club.id,
      collector_code: nextCollectorCode(db, input.role),
      created_at: now(),
    };
    db.members.push(m);
    write(db);
    return m;
  },
  /** The collector code is kept so existing receipt numbers stay attributable. */
  async updateMemberRole(id: string, role: UserRole) {
    await delay();
    const db = read();
    const m = mine(db, db.members).find((x) => x.id === id);
    if (!m) throw new ValidationError("member_id", "err_notFound");
    m.role = role;
    write(db);
    return m;
  },

  // --- Households ---
  async listHouseholds(): Promise<Household[]> {
    await delay();
    const db = read();
    return mine(db, db.households);
  },
  async createHousehold(raw: HouseholdInput): Promise<Household> {
    await delay();
    const input = parseOrThrow(householdSchema, raw);
    const db = read();
    const club = requireClub(db);
    const taken = mine(db, db.households).some(
      (h) =>
        sameName(h.lane_block, input.lane_block) &&
        sameName(h.house_flat_no, input.house_flat_no) &&
        sameName(h.resident_name, input.resident_name),
    );
    if (taken) throw new ValidationError("resident_name", "err_householdExists");
    const { phone_number, ...rest } = input;
    const h: Household = {
      ...rest,
      ...(phone_number ? { phone_number } : {}),
      id: uuid(),
      club_id: club.id,
      created_at: now(),
    };
    db.households.push(h);
    write(db);
    return h;
  },

  // --- Chanda ---
  async listChanda(): Promise<ChandaTransaction[]> {
    await delay();
    const db = read();
    return newestFirst(mine(db, db.chanda));
  },
  createChanda,
  /** Name used by the UI integration brief; same as createChanda. */
  addTransaction: createChanda,
  async voidChanda(id: string, reason: string): Promise<ChandaTransaction> {
    await delay();
    const db = read();
    const rec = voidRecord(mine(db, db.chanda), id, reason, "chanda_id");
    rec.status = "void";
    write(db);
    return rec;
  },

  // --- Expenses ---
  async listExpenses(): Promise<ExpenseRecord[]> {
    await delay();
    const db = read();
    return [...mine(db, db.expenses)].sort(
      (a, b) => b.date.localeCompare(a.date) || b.created_at.localeCompare(a.created_at),
    );
  },
  createExpense,
  /** Name used by the UI integration brief; same as createExpense. */
  addExpense: createExpense,
  async voidExpense(id: string, reason: string): Promise<ExpenseRecord> {
    await delay();
    const db = read();
    const rec = voidRecord(mine(db, db.expenses), id, reason, "expense_id");
    write(db);
    return rec;
  },
  /** Stores an (already compressed) image and returns its id for `voucher_image_id`. */
  async saveVoucherImage(blob: Blob): Promise<string> {
    if (!blob.type.startsWith("image/")) throw new ValidationError("voucher", "err_photoType");
    if (blob.size > VOUCHER_MAX_BYTES) throw new ValidationError("voucher", "err_photoTooLarge");
    const id = uuid();
    await voucherTx("readwrite", (s) => s.put(blob, id));
    return id;
  },
  async getVoucherImage(id: string): Promise<Blob | null> {
    try {
      return ((await voucherTx("readonly", (s) => s.get(id))) as Blob | undefined) ?? null;
    } catch {
      return null;
    }
  },
  /** Removes an image no record points at (e.g. the expense save failed). Not in SPEC §4. */
  async deleteVoucherImage(id: string): Promise<void> {
    await voucherTx("readwrite", (s) => s.delete(id));
  },

  // --- Events ---
  async listEvents(): Promise<ClubEvent[]> {
    await delay();
    const db = read();
    return [...mine(db, db.events)].sort((a, b) => a.date.localeCompare(b.date));
  },
  async registerEvent(id: string): Promise<ClubEvent> {
    await delay();
    const db = read();
    const ev = mine(db, db.events).find((e) => e.id === id);
    if (!ev) throw new ValidationError("event_id", "err_notFound");
    ev.registrations_count += 1;
    write(db);
    return ev;
  },

  // --- Accounts ---
  async getSummary(): Promise<AccountsSummary> {
    await delay();
    const db = read();
    return computeSummary(
      activeClub(db),
      mine(db, db.chanda),
      mine(db, db.expenses),
      mine(db, db.handovers),
    );
  },

  /** MVP sync adapter (Story 5.1): with no backend, mark pending records synced when online. */
  async sync(): Promise<{ synced: number; failed: number }> {
    await delay();
    if (!isOnline()) return { synced: 0, failed: 0 };
    const db = read();
    let synced = 0;
    for (const list of [db.chanda, db.expenses, db.handovers] as { sync_status: string }[][])
      for (const r of list)
        if (r.sync_status !== "synced") {
          r.sync_status = "synced";
          synced++;
        }
    if (synced) write(db);
    return { synced, failed: 0 };
  },
};
