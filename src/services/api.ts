// Service repository — the only module that touches localStorage or IndexedDB.
// Every method is async with a short delay so it can be swapped for the Laravel REST
// client later without touching UI code. Inputs are validated here as well as in forms.
import { approvalOf, cashByCollector, computeSummary, isVoid } from "@/lib/accounts";
import { newId } from "@/lib/id";
import { can, type Permission } from "@/lib/permissions";
import { cachedAppConfig, currentAppStatus, refreshAppConfig } from "./app-config";
import { flushClientEvents, recordSyncOutcome, type SyncFailureReport } from "./client-events";
import { session } from "./session";
import { device } from "./device";
import { getSyncAdapter, SYNC_ORDER, type SyncRecord, type SyncResult } from "./sync";
import { isCloud } from "./cloud/config";
import { getCloudClient } from "./cloud/client";
import { cloudRequestOtp, cloudSignOut, cloudVerifyOtp } from "./cloud/auth";
import { mergeSnapshot, snapshotCursor, type OutboxOp, type Snapshot } from "./cloud/merge";
import { isVoucherPath } from "./cloud/adapter";
import {
  listDevices,
  removeDevice,
  resetCollectDevice,
  setCollectDevice,
  touchDevice,
  type DeviceCheck,
} from "./cloud/devices";
import { deviceLabel } from "@/lib/device";
import {
  downloadVoucher,
  fetchClubSnapshot,
  fetchMyClubs,
  fetchPublicAccounts,
} from "./cloud/pull";
import { buildDemoData, DEMO_SLUG } from "@/mocks/mockData";
import { expenseLocked } from "@/lib/expense-lock";
import { categoryKeyOf, type CategoryKey } from "@/lib/categories";
import {
  VOUCHER_MAX_BYTES,
  ValidationError,
  chandaSchema,
  check,
  clubSchema,
  eventEditSchema,
  eventSchema,
  expenseEditSchema,
  expenseSchema,
  handoverSchema,
  helpSchema,
  householdSchema,
  memberSchema,
  otpSchema,
  otpSchemaFor,
  rejectReasonSchema,
  parseOrThrow,
  phoneSchema,
  sameName,
  voidReasonSchema,
  type ChandaInput,
  type ErrKey,
  type ClubInput,
  type EventInput,
  type ExpenseEditInput,
  type ExpenseInput,
  type HandoverInput,
  type HelpInput,
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
  EntryReview,
  ExpenseRecord,
  Household,
  PendingOp,
  SupportDiagnostics,
  SupportTicket,
  UserDevice,
  UserRole,
} from "@/types/domain";
import { APP_VERSION } from "@/lib/version";
import { fetchMyTickets } from "./cloud/help";

/** A record that didn't sync, for the "why" list under the sync banner. */
export interface SyncFailure {
  id: string;
  kind: SyncRecord["kind"];
  title: string;
  amount?: number;
  error: ErrKey;
}

export interface Store {
  version: 2;
  active_club_id: string | null;
  clubs: Club[];
  members: ClubMember[];
  households: Household[];
  chanda: ChandaTransaction[];
  expenses: ExpenseRecord[];
  handovers: CashHandover[];
  events: ClubEvent[];
  /** Changes to send for entities without sync_status (cloud mode; cleared locally). */
  outbox?: OutboxOp[];
  /** Per club: latest server updated_at already merged (cloud mode). */
  pull_cursors?: Record<string, string>;
  /** Why each failed record was refused, by record id (shown from the sync banner). */
  sync_errors?: Record<string, ErrKey>;
  /** Settings → Help requests (cloud mode), sent like ledger rows. */
  help_requests?: SupportTicket[];
}

const KEY = "pk_db_v2";
const delay = (ms = 150) => new Promise<void>((r) => setTimeout(r, ms));
const uuid = newId;
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
/**
 * The member acting in the active club: the signed-in phone, or in a demo the chosen
 * member — by default the sample collector কর্মী ০১ (SPEC 2.1). Null when the user isn't
 * a member of this club.
 */
function currentMember(db: Store): ClubMember | null {
  const s = session.get();
  const members = mine(db, db.members);
  if (!s) return null;
  if (s.mode === "user") return members.find((m) => m.phone === s.phone) ?? null;
  return (
    members.find((m) => m.id === s.member_id) ??
    members.find((m) => m.role === "collector") ??
    members[0] ??
    null
  );
}

/**
 * Cloud mode, signed in, in a real club: a person collects chanda on their one collect device
 * (supabase/migrations/…_devices.sql). The sample club and device-only mode have no devices.
 */
function deviceRuleApplies(db: Store) {
  return isCloud() && session.get()?.mode === "user" && activeClub(db)?.slug !== DEMO_SLUG;
}
/** Help requests need a phone login in cloud mode, outside the sample club. */
const helpApplies = deviceRuleApplies;

/** What "include device details" attaches to a help request: counts, never entry contents. */
function helpDiagnostics(db: Store): SupportDiagnostics {
  return {
    app_version: APP_VERSION,
    online: isOnline(),
    ...syncCounts(db),
    device_id: device.id(),
  };
}

const thisDeviceLabel = () =>
  deviceLabel(typeof navigator === "undefined" ? "" : navigator.userAgent);

/** Refuses the call unless the acting member has `p` (SPEC 6.2: enforced in api.ts too). */
function authorize(db: Store, p: Permission): ClubMember {
  const me = currentMember(db);
  if (!can(me, p)) throw new ValidationError("permission", "err_forbidden");
  return me!;
}

const mine = <T extends { club_id: string }>(db: Store, list: T[]) =>
  list.filter((x) => x.club_id === db.active_club_id);
/** The active club's events, without the ones an admin deleted. */
const liveEvents = (db: Store) => mine(db, db.events).filter((e) => !e.deleted_at);
/** Queues a change for the next sync. The sample club never leaves the device. */
function enqueue(db: Store, clubId: string, op: OutboxOp) {
  if (db.clubs.find((c) => c.id === clubId)?.slug === DEMO_SLUG) return;
  db.outbox ??= [];
  if (op.kind !== "event_delta" && db.outbox.some((o) => o.kind === op.kind && o.id === op.id)) {
    db.outbox = db.outbox.map((o) =>
      o.kind === op.kind && o.id === op.id ? { ...o, failed: false } : o,
    );
    return;
  }
  db.outbox.push(op);
}

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

// --- Receipt numbers: "PK-{puja_year}-{code}-{seq:4}", where code is the collector_code of
// whoever *writes* the receipt (not the collector the cash is for). Each person writes on one
// collect device, so their sequence lives on one phone and two phones can't issue the same
// number. The server still renumbers a clash (supabase/migrations/…_receipt_renumber.sql). ---
function nextReceiptNo(db: Store, club: Club, code: string) {
  const prefix = `PK-${club.puja_year}-${code}-`;
  const used = mine(db, db.chanda)
    .map((c) => c.receipt_no)
    .filter((no): no is string => !!no?.startsWith(prefix))
    .map((no) => Number(no.slice(prefix.length)) || 0);
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

// --- Admin approval (ADR 0003). The server applies the same rules and stamps its own values. ---

/** What a new entry starts with: an admin's is approved at once, anyone else's waits. */
function approvalStamp(writer: ClubMember, at: string): EntryReview {
  return can(writer, "entry.approve")
    ? { approval_status: "approved", reviewed_by_id: writer.id, reviewed_at: at }
    : { approval_status: "pending" };
}

/** Marks a change this device must send for an entry the server may already have. */
function touch(rec: EntryReview & { updated_at?: string }, op: PendingOp, at: string) {
  rec.pending_ops = [...new Set([...(rec.pending_ops ?? []), op])];
  Object.assign(rec, { updated_at: at, sync_status: "pending" });
}

/** An admin's void takes effect; a treasurer's becomes a request the entry waits on. */
function voidOrRequest<
  T extends EntryReview & { id: string; voided_at?: string; status?: string; updated_at?: string },
>(db: Store, list: T[], id: string, reason: string, field: string): T {
  const me = authorize(db, "entry.void");
  const found = list.find((x) => x.id === id);
  if (found && approvalOf(found) === "rejected")
    throw new ValidationError(field, "err_entryRejected");
  if (can(me, "entry.approve")) return voidRecord(list, id, reason, field);
  const void_request_reason = parseOrThrow(voidReasonSchema, reason);
  if (!found) throw new ValidationError(field, "err_notFound");
  if (found.voided_at) throw new ValidationError(field, "err_alreadyVoid");
  if (found.void_requested_at) throw new ValidationError(field, "err_voidRequested");
  const at = now();
  Object.assign(found, {
    void_requested_at: at,
    void_requested_by_id: me.id,
    void_request_reason,
    void_declined_at: null,
    void_declined_reason: null,
  });
  touch(found, "void_request", at);
  return found;
}

export type ApprovalKind = "chanda" | "expense" | "handover";
export type EntryRef = { kind: ApprovalKind; id: string };

/** One thing waiting for the admin: an entry to review, or a request to void one. */
export type ApprovalItem = { action: "entry" | "void" } & (
  | { kind: "chanda"; record: ChandaTransaction }
  | { kind: "expense"; record: ExpenseRecord }
  | { kind: "handover"; record: CashHandover }
);

function approvalEntry(db: Store, { kind, id }: EntryRef) {
  const list: (EntryReview & { id: string; voided_at?: string; status?: string })[] =
    kind === "chanda"
      ? mine(db, db.chanda)
      : kind === "expense"
        ? mine(db, db.expenses)
        : mine(db, db.handovers);
  const rec = list.find((x) => x.id === id);
  if (!rec) throw new ValidationError(`${kind}_id`, "err_notFound");
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
  const writer = authorize(db, "chanda.add");
  // Offline too, from what the server last said; before the first check-in the server decides
  // (it flags chanda from a device that doesn't collect).
  const devices = deviceRuleApplies(db);
  if (devices && device.state()?.is_collect === false)
    throw new ValidationError("device", "err_notCollectDevice");
  if (!mine(db, db.households).some((h) => h.id === input.household_id))
    throw new ValidationError("household_id", "err_household");
  const collector = mine(db, db.members).find((m) => m.id === input.collector_id);
  if (!collector) throw new ValidationError("collector_id", "err_collector");
  const at = now();
  const tx: ChandaTransaction = {
    ...input,
    ...approvalStamp(writer, at),
    // A promise is not money received: no receipt, no number.
    receipt_no: input.status === "promised" ? null : nextReceiptNo(db, club, writer.collector_code),
    ...(devices && { device_id: device.id() }),
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
  const writer = authorize(db, "expense.add");
  const by = mine(db, db.members).find((m) => m.id === input.authorized_by_id);
  if (!by || by.role === "collector")
    throw new ValidationError("authorized_by_id", "err_authorizer");
  const at = now();
  const { voucher_image_id, ...rest } = input;
  const exp: ExpenseRecord = {
    ...rest,
    ...ownCategory(input.category, input.category_name),
    ...(voucher_image_id ? { voucher_image_id } : {}),
    ...approvalStamp(writer, at),
    recorded_by_id: writer.id,
    club_id: club.id,
    created_at: at,
    updated_at: at,
    sync_status: "pending",
  };
  db.expenses.push(exp);
  write(db);
  return exp;
}

/** An own category name forces "misc"; a blank one means the built-in category. */
function ownCategory(category: ExpenseRecord["category"], name: string | null | undefined) {
  return name
    ? { category: "misc" as const, category_name: name }
    : { category, category_name: null };
}

/**
 * Corrects an expense (treasurer/admin) until the next cash handover involving whoever
 * recorded it; then it can only be voided. Marked pending so the change syncs.
 */
async function updateExpense(id: string, raw: ExpenseEditInput): Promise<ExpenseRecord> {
  await delay();
  const input = parseOrThrow(expenseEditSchema, raw);
  const db = read();
  const editor = authorize(db, "expense.add");
  const rec = mine(db, db.expenses).find((e) => e.id === id);
  if (!rec) throw new ValidationError("expense_id", "err_notFound");
  if (approvalOf(rec) === "rejected") throw new ValidationError("expense_id", "err_entryRejected");
  if (expenseLocked(rec, mine(db, db.handovers)))
    throw new ValidationError("expense_id", "err_expenseLocked");
  const by = mine(db, db.members).find((m) => m.id === input.authorized_by_id);
  if (!by || by.role === "collector")
    throw new ValidationError("authorized_by_id", "err_authorizer");
  const at = now();
  Object.assign(rec, {
    ...input,
    ...ownCategory(input.category, input.category_name),
    edited_at: at,
    edited_by_id: editor.id,
    // A treasurer's correction waits for the admin again; an admin's counts as approved.
    reviewed_by_id: null,
    reviewed_at: null,
    ...approvalStamp(editor, at),
  });
  touch(rec, "edit", at);
  write(db);
  return rec;
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
  // Opening the sample club signs a visitor into the demo; a signed-in user stays themselves.
  if (!session.get()) session.set({ mode: "demo" });
}

// --- Sync queue helpers ---------------------------------------------------------------

function outboxRecord(db: Store, op: OutboxOp): SyncRecord | null {
  switch (op.kind) {
    case "club": {
      const record = db.clubs.find((c) => c.id === op.id);
      const admin = db.members.find((m) => m.club_id === op.id && m.role === "admin");
      return record && admin ? { kind: "club", record, admin } : null;
    }
    case "member": {
      const record = db.members.find((m) => m.id === op.id);
      return record ? { kind: "member", record } : null;
    }
    case "household": {
      const record = db.households.find((h) => h.id === op.id);
      return record ? { kind: "household", record } : null;
    }
    case "event":
    case "event_update": {
      const record = db.events.find((e) => e.id === op.id);
      return record ? { kind: op.kind, record } : null;
    }
    case "event_delta":
      return op.event_id && op.delta
        ? { kind: "event_delta", record: { id: op.id, event_id: op.event_id, delta: op.delta } }
        : null;
  }
}

/** Records waiting to sync, and records whose last push failed, in the active club. */
function syncCounts(db: Store): { pending: number; failed: number } {
  const rows = [
    ...mine(db, db.chanda),
    ...mine(db, db.expenses),
    ...mine(db, db.handovers),
    ...mine(db, db.help_requests ?? []),
  ];
  const ops = (db.outbox ?? []).filter((o) => outboxClub(db, o) === db.active_club_id);
  return {
    pending:
      rows.filter((r) => r.sync_status === "pending").length + ops.filter((o) => !o.failed).length,
    failed:
      rows.filter((r) => r.sync_status === "failed").length + ops.filter((o) => o.failed).length,
  };
}

/** Outbox items plus unsent ledger rows, in dependency order (clubs before members …). */
function syncQueue(db: Store): SyncRecord[] {
  const unsent = <T extends { sync_status: string }>(list: T[]) =>
    list.filter((r) => r.sync_status !== "synced");
  const items: SyncRecord[] = [
    ...(db.outbox ?? []).map((op) => outboxRecord(db, op)).filter((x): x is SyncRecord => !!x),
    ...unsent(db.chanda).map((record) => ({ kind: "chanda" as const, record })),
    ...unsent(db.expenses).map((record) => ({ kind: "expense" as const, record })),
    ...unsent(db.handovers).map((record) => ({ kind: "handover" as const, record })),
    ...unsent(db.help_requests ?? []).map((record) => ({ kind: "ticket" as const, record })),
  ];
  return items.sort((a, b) => SYNC_ORDER.indexOf(a.kind) - SYNC_ORDER.indexOf(b.kind));
}

function clubOf(db: Store, item: SyncRecord): string | undefined {
  if (item.kind === "club") return item.record.id;
  if (item.kind === "event_delta")
    return db.events.find((e) => e.id === item.record.event_id)?.club_id;
  return item.record.club_id;
}

function outboxClub(db: Store, op: OutboxOp) {
  const item = outboxRecord(db, op);
  return item ? clubOf(db, item) : undefined;
}

/** A club's public accounts from the server — for shared links opened on other devices. */
async function publicAccounts(slug: string): Promise<ClubAccounts | null> {
  const data = await fetchPublicAccounts(getCloudClient(), slug).catch(() => null);
  if (!data) return null;
  const club: Club = { id: "", created_at: "", ...data.club };
  return {
    club,
    summary: data.summary,
    expenses: [],
    category_totals: data.expenses_by_category.map((c) => ({
      key: categoryKeyOf({ category: c.category, category_name: c.name }),
      total: c.total,
    })),
  };
}

/** Everything the public accounts page shows for one club. */
export interface ClubAccounts {
  club: Club;
  summary: AccountsSummary;
  /** All of the club's expenses, voided ones included (the page shows per-category totals). */
  expenses: ExpenseRecord[];
  /** Per-category totals when only aggregates are available (public link from the server). */
  category_totals?: { key: CategoryKey; total: number }[];
}

/** The sync run in progress (or the last one), so api.sync() calls queue behind it. */
let syncRun: Promise<unknown> = Promise.resolve();

async function pushQueue(): Promise<{ synced: number; failed: number }> {
  await delay();
  if (!isOnline()) return { synced: 0, failed: 0 };
  const db = read();
  const demo = db.clubs.find((c) => c.slug === DEMO_SLUG)?.id;
  const isLocal = (item: SyncRecord) => clubOf(db, item) === demo;
  // Maintenance, or an app older than the owner allows (app_config): nothing goes to the
  // server; entries stay pending on the phone until it clears.
  const paused = currentAppStatus().syncPaused;
  const queue = syncQueue(db).filter((i) => !paused || isLocal(i));
  if (!queue.length) return { synced: 0, failed: 0 };
  const local = queue.filter(isLocal);
  const remote = queue.filter((i) => !isLocal(i));
  let results: SyncResult[] = local.map((i) => ({ id: i.record.id, ok: true }));
  if (remote.length) {
    try {
      results = results.concat(await getSyncAdapter().push(remote));
    } catch {
      results = results.concat(remote.map((i) => ({ id: i.record.id, ok: false })));
    }
  }
  const ok = new Map(results.map((r) => [r.id, r.ok]));
  let synced = 0;
  let failed = 0;
  // The store may have changed during the push: record outcomes on a fresh copy, and leave
  // alone any row whose status moved on meanwhile (e.g. voided again, so pending once more).
  const fresh = read();
  const rows = new Map<string, { sync_status: string; pending_ops?: PendingOp[] }>(
    [...fresh.chanda, ...fresh.expenses, ...fresh.handovers, ...(fresh.help_requests ?? [])].map(
      (r) => [r.id, r],
    ),
  );
  const byId = new Map(results.map((r) => [r.id, r]));
  const errors = { ...fresh.sync_errors };
  // Refusals the server gave a reason for, to report to the owner (client-events.ts).
  const refused: SyncFailureReport[] = [];
  const sent: string[] = [];
  for (const item of queue) {
    const success = ok.get(item.record.id) === true;
    const result = byId.get(item.record.id);
    const club = clubOf(db, item);
    if (success) delete errors[item.record.id];
    else errors[item.record.id] = result?.error ?? "err_syncFailed";
    if (!isLocal(item) && club) {
      if (success) sent.push(item.record.id);
      else if (result?.error && !result.network)
        refused.push({
          error_key: result.error,
          entity_type: item.kind,
          record_id: item.record.id,
          club_id: club,
        });
    }
    if (success) synced++;
    else failed++;
    if (!("sync_status" in item.record)) continue;
    const row = rows.get(item.record.id);
    // A change made while this push ran has its own op: leave the row for the next push.
    const sentOps = (item.record as EntryReview).pending_ops ?? [];
    if (
      row &&
      row.sync_status === item.record.sync_status &&
      (row.pending_ops ?? []).every((op) => sentOps.includes(op))
    ) {
      row.sync_status = success ? "synced" : "failed";
      if (success) delete row.pending_ops;
    }
  }
  fresh.outbox = (fresh.outbox ?? [])
    .filter((o) => ok.get(o.id) !== true)
    .map((o) => (ok.has(o.id) ? { ...o, failed: true } : o));
  fresh.sync_errors = errors;
  write(fresh);
  recordSyncOutcome(refused, sent);
  void flushClientEvents();
  return { synced, failed };
}

export const api = {
  // --- App control (ADR 0002 §3): the owner's app_config row ---
  /** The last known config, instantly (null before the first successful read). */
  cachedAppConfig,
  /** A fresh copy when online (≤ 5 s), else the cached one; never throws. */
  getAppConfig: refreshAppConfig,

  // --- Auth (mock) ---
  async requestOtp(phone: string) {
    await delay();
    const err = check(phoneSchema, phone);
    if (err) throw new ValidationError("phone", err);
    if (isCloud()) {
      await cloudRequestOtp(phone);
      return { resend_after: OTP_RESEND_SECONDS };
    }
    otpAttempts.set(phone, 0);
    return { resend_after: OTP_RESEND_SECONDS };
  },
  async verifyOtp(phone: string, otp: string) {
    await delay();
    if (isCloud()) {
      const err = check(otpSchemaFor(6), otp);
      if (err) throw new ValidationError("otp", err);
      await cloudVerifyOtp(phone, otp);
      return api.completeLogin(phone);
    }
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
    const at = now();
    const club: Club = {
      id: uuid(),
      slug,
      name_bn: input.name,
      name_en: input.name,
      area_label: [input.para, input.zone].filter(Boolean).join(" · "),
      target_amount: input.target_amount,
      puja_year: input.puja_year,
      created_at: at,
    };
    db.clubs.push(club);
    db.active_club_id = club.id;
    // Same write as the club: a club can never exist without someone able to run it.
    db.members.push({
      id: uuid(),
      club_id: club.id,
      name: input.creator_name,
      role: "admin",
      phone: input.creator_phone,
      collector_code: nextCollectorCode(db, "admin"),
      created_at: at,
    });
    enqueue(db, club.id, { kind: "club", id: club.id });
    write(db);
    // The creator is signed in as the new club's admin.
    session.set({ mode: "user", phone: input.creator_phone });
    return club;
  },

  // --- Members ---
  /** The member the app acts as in the active club, or null (not a member: read-only). */
  async getCurrentMember(): Promise<ClubMember | null> {
    await delay();
    return currentMember(read());
  },
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
    authorize(db, "member.manage");
    // The phone identifies the signed-in member, so it must be unique within a club.
    if (mine(db, db.members).some((x) => x.phone === input.phone))
      throw new ValidationError("phone", "err_memberExists");
    const m: ClubMember = {
      ...input,
      id: uuid(),
      club_id: club.id,
      collector_code: nextCollectorCode(db, input.role),
      created_at: now(),
    };
    db.members.push(m);
    enqueue(db, club.id, { kind: "member", id: m.id });
    write(db);
    return m;
  },
  /** The collector code is kept so existing receipt numbers stay attributable. */
  async updateMemberRole(id: string, role: UserRole) {
    await delay();
    const db = read();
    authorize(db, "member.manage");
    const members = mine(db, db.members);
    const m = members.find((x) => x.id === id);
    if (!m) throw new ValidationError("member_id", "err_notFound");
    // A club must always keep someone who can manage members.
    const admins = members.filter((x) => x.role === "admin");
    if (m.role === "admin" && role !== "admin" && admins.length === 1)
      throw new ValidationError("role", "err_lastAdmin");
    m.role = role;
    enqueue(db, m.club_id, { kind: "member", id: m.id });
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
    authorize(db, "chanda.add");
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
    enqueue(db, h.club_id, { kind: "household", id: h.id });
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
    const rec = voidOrRequest(db, mine(db, db.chanda), id, reason, "chanda_id");
    if (rec.voided_at) rec.status = "void";
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
  updateExpense,
  async voidExpense(id: string, reason: string): Promise<ExpenseRecord> {
    await delay();
    const db = read();
    const rec = voidOrRequest(db, mine(db, db.expenses), id, reason, "expense_id");
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
      const local = (await voucherTx("readonly", (s) => s.get(id))) as Blob | undefined;
      if (local) return local;
    } catch {
      /* no IndexedDB: try the server below */
    }
    // Recorded on another device: fetch from cloud storage once and keep a copy here.
    if (!isCloud() || !isVoucherPath(id) || !isOnline()) return null;
    const blob = await downloadVoucher(getCloudClient(), id);
    if (blob) await voucherTx("readwrite", (s) => s.put(blob, id)).catch(() => {});
    return blob;
  },
  /** Removes an image no record points at (e.g. the expense save failed). Not in SPEC §4. */
  async deleteVoucherImage(id: string): Promise<void> {
    await voucherTx("readwrite", (s) => s.delete(id));
  },

  // --- Events ---
  async listEvents(): Promise<ClubEvent[]> {
    await delay();
    const db = read();
    return liveEvents(db).sort((a, b) => a.date.localeCompare(b.date));
  },
  async registerEvent(id: string): Promise<ClubEvent> {
    await delay();
    const db = read();
    const ev = liveEvents(db).find((e) => e.id === id);
    if (!ev) throw new ValidationError("event_id", "err_notFound");
    ev.registrations_count += 1;
    enqueue(db, ev.club_id, { kind: "event_delta", id: uuid(), event_id: ev.id, delta: 1 });
    write(db);
    return ev;
  },
  /** Undoes a mistaken registration tap; the tally never goes below zero. Not in SPEC §4. */
  async unregisterEvent(id: string): Promise<ClubEvent> {
    await delay();
    const db = read();
    const ev = liveEvents(db).find((e) => e.id === id);
    if (!ev) throw new ValidationError("event_id", "err_notFound");
    if (ev.registrations_count > 0)
      enqueue(db, ev.club_id, { kind: "event_delta", id: uuid(), event_id: ev.id, delta: -1 });
    ev.registrations_count = Math.max(0, ev.registrations_count - 1);
    write(db);
    return ev;
  },
  async createEvent(raw: EventInput): Promise<ClubEvent> {
    await delay();
    const input = parseOrThrow(eventSchema, raw);
    const db = read();
    const club = requireClub(db);
    authorize(db, "event.manage");
    const ev: ClubEvent = {
      id: uuid(),
      club_id: club.id,
      title_bn: input.title,
      title_en: input.title,
      date: input.date,
      registrations_count: 0,
      created_at: now(),
    };
    db.events.push(ev);
    enqueue(db, ev.club_id, { kind: "event", id: ev.id });
    write(db);
    return ev;
  },
  /** Admin only: renames or re-dates an event; its registrations stay. */
  async updateEvent(id: string, raw: EventInput): Promise<ClubEvent> {
    await delay();
    const db = read();
    authorize(db, "event.manage");
    const ev = liveEvents(db).find((e) => e.id === id);
    if (!ev) throw new ValidationError("event_id", "err_notFound");
    const input = parseOrThrow(eventEditSchema(ev.date), raw);
    ev.title_bn = input.title;
    ev.title_en = input.title;
    ev.date = input.date;
    enqueue(db, ev.club_id, { kind: "event_update", id: ev.id });
    write(db);
    return ev;
  },
  /** Admin only: removes an event for everyone (kept as deleted, so other phones learn). */
  async deleteEvent(id: string): Promise<void> {
    await delay();
    const db = read();
    authorize(db, "event.manage");
    const ev = liveEvents(db).find((e) => e.id === id);
    if (!ev) throw new ValidationError("event_id", "err_notFound");
    ev.deleted_at = now();
    enqueue(db, ev.club_id, { kind: "event_update", id: ev.id });
    write(db);
  },

  // --- Cash handovers (SPEC 6.3): never edited, only voided ---
  async listHandovers(): Promise<CashHandover[]> {
    await delay();
    const db = read();
    return newestFirst(mine(db, db.handovers));
  },
  /** The acting treasurer/admin receives `amount` in cash from a collector. */
  async createHandover(raw: HandoverInput): Promise<CashHandover> {
    await delay();
    const input = parseOrThrow(handoverSchema, raw);
    const db = read();
    const existing = db.handovers.find((h) => h.id === input.id);
    if (existing) return existing;
    const club = requireClub(db);
    const receiver = authorize(db, "handover.record");
    const members = mine(db, db.members);
    if (!members.some((m) => m.id === input.collector_id))
      throw new ValidationError("collector_id", "err_collector");
    if (input.collector_id === receiver.id)
      throw new ValidationError("collector_id", "err_handoverSelf");
    const position = cashByCollector(members, mine(db, db.chanda), mine(db, db.handovers)).find(
      (r) => r.member_id === input.collector_id,
    );
    if (input.amount > (position?.outstanding ?? 0))
      throw new ValidationError("amount", "err_handoverTooMuch");
    const at = now();
    const h: CashHandover = {
      ...input,
      ...approvalStamp(receiver, at),
      club_id: club.id,
      received_by_id: receiver.id,
      created_at: at,
      sync_status: "pending",
    };
    db.handovers.push(h);
    write(db);
    return h;
  },
  async voidHandover(id: string, reason: string): Promise<CashHandover> {
    await delay();
    const db = read();
    const rec = voidOrRequest(db, mine(db, db.handovers), id, reason, "handover_id");
    write(db);
    return rec;
  },

  // --- Admin approval (ADR 0003) ---
  /** What waits for the admin, oldest first. A void request comes before reviewing its entry. */
  async listApprovals(): Promise<ApprovalItem[]> {
    await delay();
    const db = read();
    const action = (r: EntryReview & { status?: string; voided_at?: string }) =>
      isVoid(r) || approvalOf(r) === "rejected"
        ? null
        : r.void_requested_at
          ? ("void" as const)
          : approvalOf(r) === "pending"
            ? ("entry" as const)
            : null;
    const items: ApprovalItem[] = [];
    for (const record of mine(db, db.chanda)) {
      const a = action(record);
      if (a) items.push({ action: a, kind: "chanda", record });
    }
    for (const record of mine(db, db.expenses)) {
      const a = action(record);
      if (a) items.push({ action: a, kind: "expense", record });
    }
    for (const record of mine(db, db.handovers)) {
      const a = action(record);
      if (a) items.push({ action: a, kind: "handover", record });
    }
    return items.sort((a, b) => a.record.created_at.localeCompare(b.record.created_at));
  },
  /**
   * Approves or rejects entries together (bulk approve). All or nothing: one that can't be
   * decided refuses the whole call. Repeating the same decision is harmless.
   */
  async reviewEntries(
    refs: EntryRef[],
    decision: "approved" | "rejected",
    reason?: string,
  ): Promise<void> {
    await delay();
    const db = read();
    const admin = authorize(db, "entry.approve");
    const rejection_reason =
      decision === "rejected" ? parseOrThrow(rejectReasonSchema, reason ?? "") : null;
    const at = now();
    const todo = refs
      .map((ref) => ({ ref, rec: approvalEntry(db, ref) }))
      .filter(({ rec }) => approvalOf(rec) !== decision);
    for (const { ref, rec } of todo) {
      if (approvalOf(rec) !== "pending")
        throw new ValidationError(`${ref.kind}_id`, "err_alreadyReviewed");
      if (isVoid(rec)) throw new ValidationError(`${ref.kind}_id`, "err_alreadyVoid");
    }
    for (const { rec } of todo) {
      Object.assign(rec, {
        approval_status: decision,
        rejection_reason,
        reviewed_by_id: admin.id,
        reviewed_at: at,
      });
      touch(rec, "review", at);
    }
    write(db);
  },
  /** Grants a void request: the entry is voided with the reason that was given. */
  async approveVoid(ref: EntryRef): Promise<void> {
    await delay();
    const db = read();
    authorize(db, "entry.approve");
    const rec = approvalEntry(db, ref);
    if (!rec.void_requested_at || !rec.void_request_reason)
      throw new ValidationError(`${ref.kind}_id`, "err_notFound");
    voidRecord([rec], rec.id, rec.void_request_reason, `${ref.kind}_id`);
    if (ref.kind === "chanda") rec.status = "void";
    write(db);
  },
  /** Refuses a void request, with a reason; the entry stays as it was. */
  async declineVoid(ref: EntryRef, reason: string): Promise<void> {
    await delay();
    const db = read();
    authorize(db, "entry.approve");
    const void_declined_reason = parseOrThrow(rejectReasonSchema, reason);
    const rec = approvalEntry(db, ref);
    if (!rec.void_requested_at) throw new ValidationError(`${ref.kind}_id`, "err_notFound");
    const at = now();
    Object.assign(rec, {
      void_requested_at: null,
      void_requested_by_id: null,
      void_request_reason: null,
      void_declined_at: at,
      void_declined_reason,
    });
    touch(rec, "void_decline", at);
    write(db);
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
  /**
   * Read-only accounts of any club on this device, by slug (SPEC 4.1). Doesn't change the
   * active club, so the page works without signing in. Null when the slug is unknown.
   */
  async getClubAccounts(slug: string): Promise<ClubAccounts | null> {
    await delay();
    const db = read();
    const club = db.clubs.find((c) => c.slug === slug);
    if (!club) return isCloud() && isOnline() ? publicAccounts(slug) : null;
    const of = <T extends { club_id: string }>(list: T[]) =>
      list.filter((x) => x.club_id === club.id);
    const expenses = of(db.expenses);
    return {
      club,
      summary: computeSummary(club, of(db.chanda), expenses, of(db.handovers)),
      expenses,
    };
  },

  /**
   * Story 5.1: when online, send everything not yet on the server through the sync adapter
   * (ledger rows that are pending/failed, plus the outbox) in dependency order, and record
   * each outcome. The sample club is settled locally and never sent. Offline: no-op.
   */
  sync(): Promise<{ synced: number; failed: number }> {
    // One push at a time: overlapping runs would send the same records twice (a second
    // create_club then fails on the duplicate id and the entry shows as not synced).
    const run = syncRun.then(pushQueue, pushQueue);
    syncRun = run.catch(() => undefined);
    return run;
  },
  /** Counts for the sync banner: records waiting, and records whose last push failed. */
  async getSyncStatus(): Promise<{ pending: number; failed: number }> {
    await delay();
    return syncCounts(read());
  },
  /** The active club's records that failed to sync: what each is, and the server's reason. */
  async listSyncFailures(): Promise<SyncFailure[]> {
    await delay();
    const db = read();
    const name = (id: string) => db.members.find((m) => m.id === id)?.name ?? "—";
    const resident = (id: string) => db.households.find((h) => h.id === id)?.resident_name ?? "—";
    const failedOps = new Set((db.outbox ?? []).filter((o) => o.failed).map((o) => o.id));
    return syncQueue(db)
      .filter((i) => clubOf(db, i) === db.active_club_id)
      .filter((i) =>
        "sync_status" in i.record ? i.record.sync_status === "failed" : failedOps.has(i.record.id),
      )
      .map((i): SyncFailure => {
        const base = {
          id: i.record.id,
          kind: i.kind,
          error: db.sync_errors?.[i.record.id] ?? "err_syncFailed",
        };
        switch (i.kind) {
          case "chanda":
            return { ...base, title: resident(i.record.household_id), amount: i.record.amount };
          case "handover":
            return { ...base, title: name(i.record.collector_id), amount: i.record.amount };
          case "expense":
            return { ...base, title: i.record.title, amount: i.record.amount };
          case "member":
            return { ...base, title: i.record.name };
          case "household":
            return { ...base, title: i.record.resident_name };
          case "club":
            return { ...base, title: i.record.name_bn };
          case "event":
          case "event_update":
            return { ...base, title: i.record.title_bn };
          case "event_delta":
            return {
              ...base,
              title: db.events.find((e) => e.id === i.record.event_id)?.title_bn ?? "—",
            };
          case "ticket":
            return { ...base, title: i.record.message.slice(0, 40) };
        }
      });
  },
  /**
   * Cloud mode: bring down other devices' changes — the user's clubs, then everything in
   * the active club since the last pull — and merge them (see cloud/merge.ts).
   */
  async pull(): Promise<{ pulled: number }> {
    if (!isCloud() || !isOnline() || session.get()?.mode !== "user") return { pulled: 0 };
    if (currentAppStatus().syncPaused) return { pulled: 0 };
    const client = getCloudClient();
    const db = read();
    const mineSnap = await fetchMyClubs(client);
    const active = db.active_club_id;
    const isDemo = db.clubs.find((c) => c.id === active)?.slug === DEMO_SLUG;
    const clubSnap: Snapshot | null =
      active && !isDemo ? await fetchClubSnapshot(client, active, db.pull_cursors?.[active]) : null;
    const fresh = read(); // the store may have changed while we were fetching
    mergeSnapshot(fresh, mineSnap);
    if (clubSnap && active) {
      mergeSnapshot(fresh, clubSnap);
      const cursor = snapshotCursor(clubSnap, fresh.pull_cursors?.[active]);
      if (cursor) fresh.pull_cursors = { ...fresh.pull_cursors, [active]: cursor };
    }
    write(fresh);
    const count = (snap: Snapshot | null) =>
      snap ? Object.values(snap).reduce((n, list) => n + list.length, 0) : 0;
    return { pulled: count(mineSnap) + count(clubSnap) };
  },
  /** Logs out on this device (and of Supabase Auth in cloud mode). Data stays on the phone. */
  async signOut() {
    const signedIn = session.get()?.mode === "user";
    session.clear();
    if (!isCloud()) return;
    // Logging out frees this device's slot (best effort: offline, it stays listed).
    if (signedIn) await removeDevice(getCloudClient(), device.id()).catch(() => {});
    device.clearState();
    await cloudSignOut().catch(() => {});
  },

  // --- Devices (cloud mode) ---
  /**
   * Cloud login, after the OTP: registers this device (err_deviceLimit when 3 are in use —
   * the login screen then offers to remove one and calls this again) and brings down the
   * user's clubs for the club picker.
   */
  async completeLogin(phone: string) {
    device.setState(await api.registerDevice());
    session.set({ mode: "user", phone });
    await api.pull().catch(() => {});
    session.clear(); // the session starts once a club is chosen (index.tsx)
    return { phone };
  },
  async registerDevice() {
    const r = await touchDevice(getCloudClient(), device.id(), thisDeviceLabel(), true);
    if (r.status !== "active") throw new ValidationError("device", "err_deviceLimit");
    return { is_collect: r.is_collect, collect_label: r.collect_label };
  },
  /**
   * On app open: tells the server this device is still in use and learns whether it collects.
   * "removed" (from another device) and "limit" mean this device must log out; "skipped" when
   * offline or not applicable.
   */
  async checkDevice(): Promise<DeviceCheck["status"] | "skipped"> {
    if (!isCloud() || !isOnline() || session.get()?.mode !== "user") return "skipped";
    const r = await touchDevice(getCloudClient(), device.id(), thisDeviceLabel(), false);
    if (r.status === "active") device.setState(r);
    return r.status;
  },
  /** Whether chanda can be collected here; `applies` is false outside cloud mode or in the demo. */
  async getCollectStanding() {
    const s = device.state();
    return {
      applies: deviceRuleApplies(read()),
      is_collect: s?.is_collect ?? true,
      collect_label: s?.collect_label ?? null,
    };
  },
  // --- Settings → Help (ADR 0002 §7): saved on the phone, sent with the next sync ---
  /** Whether this session can send help requests. */
  helpAvailable: () => helpApplies(read()),
  async submitHelpRequest(raw: HelpInput): Promise<SupportTicket> {
    const input = parseOrThrow(helpSchema, raw);
    const db = read();
    if (!helpApplies(db) || !currentMember(db)) throw new ValidationError("help", "err_forbidden");
    // The client id is the idempotency key: a double tap returns the first request.
    const existing = db.help_requests?.find((t) => t.id === input.id);
    if (existing) return existing;
    const ticket: SupportTicket = {
      id: input.id,
      club_id: requireClub(db).id,
      category: input.category,
      message: input.message,
      diagnostics: input.include_diagnostics ? helpDiagnostics(db) : null,
      status: "open",
      created_at: now(),
      sync_status: "pending",
    };
    db.help_requests = [...(db.help_requests ?? []), ticket];
    write(db);
    return ticket;
  },
  /** This person's requests in the active club, with the server's status when online. */
  async listHelpRequests(): Promise<SupportTicket[]> {
    let db = read();
    const clubId = db.active_club_id;
    if (!helpApplies(db) || !clubId) return [];
    const server = isOnline()
      ? await fetchMyTickets(getCloudClient(), clubId).catch(() => null)
      : null;
    if (server) {
      db = read();
      const local = new Map((db.help_requests ?? []).map((t) => [t.id, t]));
      for (const s of server) local.set(s.id, { ...local.get(s.id), ...s, sync_status: "synced" });
      db.help_requests = [...local.values()];
      write(db);
    }
    return newestFirst(mine(db, db.help_requests ?? []));
  },
  async listDevices(): Promise<(UserDevice & { this_device: boolean })[]> {
    const mineId = device.id();
    return (await listDevices(getCloudClient())).map((d) => ({
      ...d,
      this_device: d.id === mineId,
    }));
  },
  /** Makes `id` (default: this device) the collecting device. */
  async setCollectDevice(id: string = device.id()) {
    const r = await setCollectDevice(getCloudClient(), id);
    if (id === device.id() && r.status === "active") device.setState(r);
    else await api.checkDevice();
  },
  async removeDevice(id: string) {
    await removeDevice(getCloudClient(), id);
  },
  /** Admin: clears a member's collect device (lost phone); they choose one again. */
  async resetCollectDevice(memberId: string) {
    authorize(read(), "member.manage");
    await resetCollectDevice(getCloudClient(), memberId);
  },
};
