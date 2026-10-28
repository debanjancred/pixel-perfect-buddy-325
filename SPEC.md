# Pujo Khata (পুজো খাতা) — Product Backlog & Technical Specification

**Document Version:** Spec v1.3.0 (independent of the app's `package.json` SemVer)
**Target Delivery Window:** 3 Sprints (6 Weeks to MVP)
**Methodology:** Agile / Scrum
**Core Architectural Focus:** Mobile-First PWA, Offline-Tolerant, Dual-Language (BN/EN), Generic Mock Data, TanStack Start v1 + React 19

> **Precedence.** `AGENTS.md` (architecture rules) and `CLAUDE.md` (conventions) win over this
> document. If anything here conflicts with them, stop and flag it — do not work around it.

---

## 0. Ground Rules for Implementation

These restate the `CLAUDE.md` conventions as they apply to this spec.

| Rule | What it means for this spec |
| :--- | :--- |
| **Data access** | Every read and write — ledger rows, settings, voucher images — goes through `src/services/api.ts`. Components never touch `localStorage` or IndexedDB directly. |
| **Data reads** | Via react-query hooks in `src/hooks/use-data.ts` (e.g. `useSummary`, `useChandaList`). No route loaders or server functions for ledger data. Mutations invalidate the affected queries. |
| **Strings** | Every user-visible string uses `src/lib/i18n.tsx` (`t`, `n`, `money`, `pick`), including receipts, WhatsApp text, CSV headers and banners. |
| **Stored vs displayed numbers** | Data stores ASCII digits and integer rupees (`1001`, `"101"`). Bengali numerals are applied only at render time via `n()` / `money()`. Never store `"১০১"`. |
| **Bilingual fields** | System-owned bilingual content uses `_bn` / `_en` field pairs rendered with `pick()`. User-entered data (names, addresses) is stored once, as typed — never as `"বাংলা (English)"` combined strings. |
| **Routes** | File-based under `src/routes`; dynamic segments use TanStack syntax (`$slug`). Never edit `src/routeTree.gen.ts`. |
| **UI** | Mobile-first at 360px; every tappable element ≥ 48 × 48px. Palette and fonts per `CLAUDE.md`. Alpona motif only in the top header. Gold `#B8860B` is for accents, borders and icons — not body text on canvas (fails WCAG AA contrast). |
| **IDs & casing** | UUID `id`s, snake_case fields, ISO 8601 timestamps. |
| **Generic data only** | No real clubs, paras, people, vendors, phone numbers or domains anywhere — fixtures, tests, screenshots, receipts. Use the `নমুনা` / `Sample` naming in Section 5. |
| **Sprint gate** | A sprint is done only when `npm run typecheck`, `npm run lint` and `npm run test` pass. Sprint 3 adds `npm run build`. |

---

## 1. Project Charter & Personas

| Persona | Archetype & Role | Tech Comfort | Primary Goal | Core Frustration |
| :--- | :--- | :--- | :--- | :--- |
| **P1: Senior Treasurer** | *Club Treasurer* (Senior Citizen / Retired) | Low–Medium (WhatsApp, basic UPI) | Keep ledger balanced; verify cash collections against digital logs. | Illegible paper notebooks; tracking unrecorded cash handed to field collectors. |
| **P2: Field Collector** | *Youth Volunteer* (College Member) | High (Smartphone native) | Log door-to-door contributions in seconds with zero touch friction. | Clunky keyboards; losing app state in narrow lanes with poor network connectivity. |
| **P3: General Secretary** | *Pujo Secretary* (Committee Lead) | Medium | Real-time budget progress; build financial trust across the neighborhood. | Printing physical budget leaflets; fielding repeated balance queries from neighbors. |
| **P4: Contributing Resident** | *Local Resident / Flat Owner* | Medium–High | Immediate digital receipt on WhatsApp and transparent fund tracking. | Misplaced paper slips; unclear fund utilization by organizers. |

**MVP scope note:** the MVP has **no backend** (see Section 3, WON'T HAVE). Data lives on the
device through `api.ts`. One club per device. Anything that needs a second device to see the
same data — a shareable public ledger link, cross-device sync, real OTP — is Phase 2
(Laravel REST API).

---

## 2. Epic & User Story Breakdown

| Epic | Title | Sprint |
| :--- | :--- | :--- |
| EPIC-01 | Identity & Zero-Friction Onboarding | 1 |
| EPIC-02 | Chanda Lifecycle & Instant Verification | 1 (2.1), 2 (2.2) |
| EPIC-03 | Expense Ledger & Voucher Digitization | 2 |
| EPIC-04 | Accounts Transparency | 2 |
| EPIC-05 | PWA Resilience & Offline Capability | 3 (5.1 data fields from Sprint 1) |
| EPIC-06 | Events & Member Roles | 3 |

---

### EPIC 01: Identity & Zero-Friction Onboarding

#### Story 1.1: Demo Bypass & Mock Auth
* **As a** club treasurer evaluating the tool,
* **I want to** explore the platform with one tap using generic sample data,
* **So that I can** test the workflow before registering my phone number.

**Acceptance Criteria (Gherkin):**
* **Scenario 1: Demo sandbox access**
  * **Given** I am on the login screen,
  * **When** I tap `t('auth.explore_demo')` (BN: `নমুনা ক্লাব দেখুন` / EN: `Explore Sample Club`),
  * **Then** `api.seedDemo()` writes the Section 5 fixtures (≥ 15 households, ≥ 10 chanda entries, 4 expenses, 3 members, 2 events) and I land on the Dashboard with no SMS triggered.
* **Scenario 2: Demo is idempotent**
  * **Given** demo data already exists,
  * **When** I tap the demo button again,
  * **Then** no duplicate records are created.
* **Scenario 3: Mock OTP**
  * **Given** I enter a 10-digit mobile number,
  * **When** I tap `t('auth.get_otp')`,
  * **Then** an OTP drawer opens; in mock mode only, it shows an `Auto-fill 1234` helper. The helper must not render once a real auth adapter is configured.

#### Story 1.2: Bengali/English Localisation
* **As a** user who prefers Bengali script,
* **I want to** switch between Bengali and English from a sticky header toggle,
* **So that** all labels, currency and numbers switch without a page reload.

**Acceptance Criteria:**
* Sticky header toggle `[বাংলা | EN]`; each half is a ≥ 48px target.
* Bengali is the default, including the server render.
* In Bengali, numerals use Bengali digits with Indian grouping: `₹1,001` → `₹১,০০১`; `125000` → `₹১,২৫,০০০`.
* The choice persists under the `app_locale` key, read and written **only inside `src/lib/i18n.tsx`**. It is applied after hydration to avoid an SSR mismatch.
* No hard-coded user-visible strings: all copy uses `t`, `n`, `money` or `pick`.

---

### EPIC 02: Chanda Lifecycle & Instant Verification

#### Story 2.1: Rapid Door-to-Door Collection Form
* **As a** field volunteer at a flat entrance,
* **I want to** register a payment using preset denomination buttons,
* **So that I can** finish the entry in under 15 seconds.

**Acceptance Criteria:**
* Household picker with search by flat number or resident name; recent households on top.
  *Amended after UAT (2026-10-28):* suggestions appear only after 2 typed characters; the
  flat/house number is optional; a new lane/block can be added from the new-household form.
* Preset chips: `₹251`, `₹501`, `₹1,001`, `₹2,001`, `₹5,001`, `Custom`. Custom opens a numeric keypad (`inputmode="numeric"`), accepts integers 1–10,00,000 only.
* Payment method defaults to `cash`; one tap toggles to `upi`.
* Collector defaults to the current session member (demo: `কর্মী ০১`).
* Saving writes locally first and succeeds with or without network. The record gets `status: 'collected'`, `sync_status: 'pending'` and a client-generated `id` that also serves as the idempotency key, so a double tap never creates two entries.
* A receipt number is assigned at save time (format in Section 4).
* After save, the form resets to ready-for-next-household; the Dashboard total updates through query invalidation.
* All tappable elements ≥ 48 × 48px.

#### Story 2.2: Digital Receipt & WhatsApp Share
* **As a** contributing resident,
* **I want to** receive immediate digital confirmation,
* **So that I have** proof of payment.

**Acceptance Criteria:**
* After save, a receipt modal shows the layout below, rendered through i18n helpers (labels in the current locale; amount in words in Bengali).
* **Share on WhatsApp** opens `https://wa.me/91{phone}?text={encodeURIComponent(receiptText)}` when the household has a phone number, otherwise `https://wa.me/?text=…`. Where `navigator.share` exists, offer it as a second option.
* The receipt is **self-contained text** for MVP. Do not include a public ledger URL until the Phase 2 backend exists (a localStorage-only link would not open on the resident's phone).
* Amount in words is produced by a new `words()` helper in `src/lib/i18n.tsx` (e.g. `1001` → `এক হাজার এক`). `CLAUDE.md`'s helper list must be updated when it is added.
* A receipt can be re-shared later from the transaction's detail view.

**Receipt layout (illustrative — all values are fixtures):**

```text
+---------------------------------------------------------+
|                  নমুনা পূজা কমিটি ২০২৬                  |
|                 রসিদ নং: PK-2026-C01-0001                |
+---------------------------------------------------------+
| দাতা: আবাসিক ০১                                         |
| ঠিকানা: ফ্ল্যাট ১০১, ব্লক এ                              |
| পরিমাণ: ₹১,০০১ (এক হাজার এক টাকা মাত্র)                  |
| মাধ্যম: নগদ | সংগ্রাহক: কর্মী ০১                          |
| তারিখ: ১২/১০/২০২৬                                       |
+---------------------------------------------------------+
```

#### Story 2.3: Voiding a Mistaken Entry
* **As a** treasurer,
* **I want to** void an incorrect entry with a reason instead of deleting it,
* **So that** the ledger stays auditable.

**Acceptance Criteria:**
* Only `admin` and `treasurer` can void. Voiding sets `status: 'void'`, `voided_at`, `void_reason` (required).
* Voided entries remain visible (struck through) and are excluded from all totals.
* There is no hard delete for chanda or expense records.
* *Amended after UAT (2026-10-28):* an expense may be **edited** by an admin/treasurer until
  the next cash handover involving the member who recorded it; after that only voiding
  applies. Chanda entries are still never edited.

---

### EPIC 03: Expense Ledger & Voucher Digitization

#### Story 3.1: Log an Expense with Voucher Photo
* **As a** treasurer,
* **I want to** record an expense with category and a photo of the bill,
* **So that** every rupee spent has evidence.

**Acceptance Criteria:**
* Fields: category (Section 4 enum, labels via `t('expense.category.*')`), title, amount (integer), paid to, date (defaults to today).
* `Add bill photo` uses `<input type="file" accept="image/*" capture="environment">`.
* The image is stored in IndexedDB **through `api.ts`** (`api.saveVoucherImage(blob) → id`); only the id is kept on the record. Images never go to localStorage (≈ 5 MB quota).
* `authorized_by_id` defaults to the current member; only `admin` / `treasurer` can add expenses.
* Saving works offline (`sync_status: 'pending'`).

#### Story 3.2: Expense List with Category Filter
* **Acceptance Criteria:**
  * Filter chips per category plus `All`; each chip ≥ 48px tall.
  * Per-category subtotal shown above the list.
  * Tapping a row opens details with a full-screen voucher image (if any).

---

### EPIC 04: Accounts Transparency

#### Story 4.1: Accounts Overview Page
* **As a** general secretary,
* **I want** one screen showing collections, expenses by category and balance,
* **So that** I can show residents where the money went.

**Acceptance Criteria:**
* Route: `src/routes/club/$slug/accounts.tsx`. Read-only; reachable without login on the device.
* Shows `AccountsSummary` (Section 6), collected split by cash vs UPI, and expense totals per category.
* MVP: data comes from this device's store. A shareable public URL is Phase 2.
* A **Share summary** button sends a text summary via WhatsApp (same mechanism as Story 2.2).

---

### EPIC 05: PWA Resilience & Offline Capability

#### Story 5.1: Offline Alley Collections
* **As a** volunteer in a basement or shielded lane,
* **I want to** keep entering collections offline without error popups,
* **So that** collection never stops.

**Acceptance Criteria:**
* When offline, a non-blocking banner shows `t('offline.banner')` (BN: `অফলাইন মোড — ডেটা আপনার ফোনে সংরক্ষিত হচ্ছে`). It must not cover inputs or the save button.
* Offline detection uses `navigator.onLine` plus `online`/`offline` events; it never gates saving — saving is always local-first.
* New records are created with `sync_status: 'pending'` **from Sprint 1**, even though the sync queue arrives in Sprint 3.
* **MVP sync adapter:** with no backend, `api.sync()` marks pending records `synced` when online. The Laravel adapter later replaces this and may set `failed`; failed records show a retry action.
* Dashboard shows a count of pending records.

#### Story 5.2: Installable App Shell
* **Acceptance Criteria:**
  * Web app manifest (name `পুজো খাতা`, theme `#B71C1C`, background `#FDFBF7`, maskable icons).
  * A service worker precaches the app shell, fonts (Hind Siliguri, Inter) and static assets so the app opens with no network after first visit.
  * The service worker is disabled in development and in the Lovable preview.
  * Integration approach with TanStack Start (e.g. `vite-plugin-pwa`) is documented in `AGENTS.md` before implementation.

---

### EPIC 06: Events & Member Roles

#### Story 6.1: Community Events Roster
* **As a** club secretary,
* **I want to** list competitions and cultural events with registration tallies,
* **So that** volunteers can track participants during pujo week.

**Acceptance Criteria:**
* Event cards show `pick(title_bn, title_en)`, date, registration tally and a register button.
* MVP registration increments `registrations_count` locally (no external links).
* Seeded with generic events (`বসে আঁকো / Sit & Draw`, `ধুনুচি নাচ / Dhunuchi Dance`).

#### Story 6.2: Committee Roles
* **As an** admin,
* **I want to** see members grouped by role,
* **So that** collections and expense approvals are attributed to authorized people.

**Acceptance Criteria:**
* Roles: `admin` (অ্যাডমিন), `treasurer` (কোষাধ্যক্ষ), `collector` (সংগ্রাহক). Labels via `t('role.*')`.
* Lives at `/settings`.
* Permissions (MVP, enforced in UI and in `api.ts`): collectors add chanda; treasurers add expenses and void; admins do everything and manage members.

#### Story 6.3: Collector Cash Handover
* **As a** senior treasurer,
* **I want to** record cash handed to me by each collector,
* **So that** I can reconcile cash collected against cash received.

**Acceptance Criteria:**
* Per collector: cash collected (non-void, `cash` only), cash handed over, outstanding = collected − handed over.
* Recording a handover creates a `CashHandover` record; it is never edited, only voided.

---

## 3. Prioritized Product Backlog (MoSCoW)

```text
+--------------------------------------+-----------------------------------+
| MUST HAVE (Sprints 1–2, MVP)         | SHOULD HAVE (Sprint 3)            |
+--------------------------------------+-----------------------------------+
| - Demo club bypass + mock OTP        | - Offline banner + sync adapter   |
| - Bengali/English dual UI            | - PWA install + app shell cache   |
| - Quick-pick chanda form             | - Community events screen         |
| - Local-first saves (sync_status)    | - Roles, settings, cash handover  |
| - WhatsApp text receipt              | - Lane/Block collection filters   |
| - Void (no delete) for entries       | - Export to CSV (UTF-8 with BOM)  |
| - Categorized expense ledger         | - Client-side image compression   |
| - IndexedDB voucher storage (api.ts) | - Donut chart on accounts page    |
| - Accounts overview page             |                                   |
+--------------------------------------+-----------------------------------+
| COULD HAVE (Post-MVP / Phase 2)      | WON'T HAVE (MVP)                  |
+--------------------------------------+-----------------------------------+
| - Bengali voice-to-text input        | - Live backend (Laravel) sync     |
| - Shareable public ledger URL        | - Real OTP / SMS gateway          |
| - Multi-club per account             | - Payment gateway checkout        |
| - Generic sponsor banner             | - ESC/POS thermal printing        |
| - Push reminders, haptics            |                                   |
+--------------------------------------+-----------------------------------+
```

---

## 4. Domain Model & API Schema

All amounts are **integer rupees**. All IDs are UUID v4 strings generated client-side.

```typescript
// src/types/domain.ts

export type PaymentMethod = 'cash' | 'upi';

/** 'void' replaces deletion. 'promised' = pledged, not yet received. */
export type ChandaStatus = 'collected' | 'promised' | 'void';

export type SyncStatus = 'pending' | 'synced' | 'failed';

/** One value per category. Display labels come from t('expense.category.<value>'). */
export type ExpenseCategory =
  | 'pandal'
  | 'idol'
  | 'lighting'
  | 'bhog'
  | 'cultural'
  | 'misc';

export type UserRole = 'admin' | 'treasurer' | 'collector';

/** ISO 8601 timestamp, e.g. "2026-10-12T10:30:00.000Z" */
export type IsoDateTime = string;
/** Calendar date, "YYYY-MM-DD" */
export type IsoDate = string;

export interface ClubMember {
  id: string;
  club_id: string;
  name: string;              // as entered, e.g. "কর্মী ০১"
  role: UserRole;
  phone: string;             // 10 ASCII digits
  collector_code: string;    // e.g. "C01"; unique within the club; used in receipt_no
  created_at: IsoDateTime;
}

export interface Club {
  id: string;
  slug: string;              // e.g. "sample-puja-committee-2026"
  name_bn: string;           // "নমুনা পূজা কমিটি ২০২৬"
  name_en: string;           // "Sample Puja Committee 2026"
  area_label: string;        // as entered, e.g. "ব্লক এ"
  target_amount: number;     // integer rupees, > 0
  puja_year: number;         // e.g. 2026
  created_at: IsoDateTime;
}

export interface Household {
  id: string;
  club_id: string;
  lane_block: string;        // as entered, e.g. "ব্লক এ"
  house_flat_no: string;     // ASCII digits/letters, e.g. "101" — rendered with n()
  resident_name: string;     // as entered, e.g. "আবাসিক ০১"
  phone_number?: string;     // 10 ASCII digits
  created_at: IsoDateTime;
}

export interface ChandaTransaction {
  id: string;                // doubles as idempotency key
  receipt_no: string;        // "PK-{puja_year}-{collector_code}-{seq:4}", e.g. "PK-2026-C01-0001"
  club_id: string;
  household_id: string;
  amount: number;            // integer rupees, >= 1
  payment_method: PaymentMethod;
  status: ChandaStatus;
  collector_id: string;      // ClubMember.id
  created_at: IsoDateTime;
  updated_at: IsoDateTime;
  voided_at?: IsoDateTime;
  void_reason?: string;
  sync_status: SyncStatus;
}

export interface ExpenseRecord {
  id: string;
  club_id: string;
  category: ExpenseCategory;
  title: string;             // as entered, e.g. "মণ্ডপ অগ্রিম"
  amount: number;            // integer rupees, >= 1
  paid_to: string;           // as entered, e.g. "ভেন্ডর ০১"
  authorized_by_id: string;  // ClubMember.id
  voucher_image_id?: string; // IndexedDB key, via api.saveVoucherImage()
  date: IsoDate;
  created_at: IsoDateTime;
  updated_at: IsoDateTime;
  voided_at?: IsoDateTime;
  void_reason?: string;
  sync_status: SyncStatus;
}

export interface CashHandover {
  id: string;
  club_id: string;
  collector_id: string;      // ClubMember.id handing over
  received_by_id: string;    // ClubMember.id (treasurer/admin)
  amount: number;            // integer rupees
  created_at: IsoDateTime;
  voided_at?: IsoDateTime;
  void_reason?: string;
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
}

export interface AccountsSummary {
  total_collected: number;
  collected_cash: number;
  collected_upi: number;
  total_promised: number;
  total_expenses: number;
  net_balance: number;
  collection_target: number;
  progress_pct: number;      // 0–100 integer
  pending_sync_count: number;
}
```

**Service layer (`src/services/api.ts`) — minimum surface:**

```typescript
getClub(): Promise<Club | null>;
seedDemo(): Promise<void>;                 // idempotent
listMembers(): Promise<ClubMember[]>;
listHouseholds(): Promise<Household[]>;
listChanda(): Promise<ChandaTransaction[]>;
createChanda(input: Omit<ChandaTransaction,
  'receipt_no' | 'created_at' | 'updated_at' | 'sync_status' | 'voided_at' | 'void_reason'>
): Promise<ChandaTransaction>;             // caller supplies id
voidChanda(id: string, reason: string): Promise<ChandaTransaction>;
listExpenses(): Promise<ExpenseRecord[]>;
createExpense(input: /* same pattern */ unknown): Promise<ExpenseRecord>;
voidExpense(id: string, reason: string): Promise<ExpenseRecord>;
saveVoucherImage(blob: Blob): Promise<string>;
getVoucherImage(id: string): Promise<Blob | null>;
listEvents(): Promise<ClubEvent[]>;
getSummary(): Promise<AccountsSummary>;
sync(): Promise<{ synced: number; failed: number }>;
```

`createChanda` with an `id` that already exists returns the existing record instead of creating
a new one. Matching react-query hooks live in `src/hooks/use-data.ts`.

---

## 5. Demo Fixtures (Generic Only)

All fixture names follow these patterns — no real places, clubs, people, vendors, numbers or domains.

| Entity | Pattern |
| :--- | :--- |
| Club | `নমুনা পূজা কমিটি ২০২৬` / `Sample Puja Committee 2026`, slug `sample-puja-committee-2026`, target `500000` |
| Area / lanes | `ব্লক এ`, `ব্লক বি`, `লেন ১`, `লেন ২` |
| Households | `আবাসিক ০১` … `আবাসিক ১৫`, flats `"101"` … `"305"` |
| Members | `অ্যাডমিন ০১` (admin), `কোষাধ্যক্ষ ০১` (treasurer), `কর্মী ০১` (collector, `C01`) |
| Vendors | `ভেন্ডর ০১` … |
| Phones | `9000000001` … (clearly fake) |
| Events | `বসে আঁকো / Sit & Draw`, `ধুনুচি নাচ / Dhunuchi Dance` |

Fixtures include at least one `promised` and one `void` chanda entry so the Section 6 rules are
exercised. `CLAUDE.md`'s demo club line must match this table.

---

## 6. Accounts Aggregation Logic

`getSummary()` computes, ignoring every record with `status === 'void'` or `voided_at` set:

1. **`total_collected`** — sum of `amount` where `status === 'collected'`.
2. **`collected_cash` / `collected_upi`** — the same, split by `payment_method`.
3. **`total_promised`** — sum where `status === 'promised'` (shown separately; never added to collected).
4. **`total_expenses`** — sum of non-void `ExpenseRecord.amount`.
5. **`net_balance`** — `total_collected - total_expenses`. Label: “Net Balance” (not “cash in hand” — it includes UPI). May be negative; render negative values in vermilion.
6. **`collection_target`** — `Club.target_amount`.
7. **`progress_pct`** —
   `collection_target > 0 ? Math.min(100, Math.round((total_collected / collection_target) * 100)) : 0`.
8. **`pending_sync_count`** — count of records across chanda, expenses and handovers with `sync_status !== 'synced'`.

Unit tests (`npm run test`) must cover: void exclusion, promised exclusion, zero target, negative balance, and > 100% collection.

---

## 7. Sprint Roadmap

Do not start a sprint until the previous one passes its gate (Section 0).

### Sprint 1: Core Shell, Locale & Chanda Collection
- Verify and extend the existing tokens and component classes in `src/styles.css` (do not redefine them).
- Wire the Bengali/English toggle through `src/lib/i18n.tsx` (Story 1.2), including Indian digit grouping.
- Implement `src/types/domain.ts` and `src/services/api.ts` with the Section 5 fixtures, `seedDemo()` and `getSummary()` + its unit tests.
- Add react-query hooks in `src/hooks/use-data.ts`.
- Story 1.1 (demo bypass, mock OTP).
- **Dashboard:** balance card, target progress bar, recent activity, pending-sync count.
- **Collect Chanda** (Story 2.1), local-first with `sync_status: 'pending'` and receipt numbering.

### Sprint 2: Receipts, Expenses & Accounts
- Receipt modal, `words()` helper and WhatsApp share (Story 2.2).
- Void flow (Story 2.3).
- Expense ledger with voucher photos (Stories 3.1, 3.2).
- Accounts overview page (Story 4.1).

### Sprint 3: Offline, Events, Roles & Hardening
- Offline banner and MVP sync adapter (Story 5.1); PWA manifest and service worker (Story 5.2).
- Events (6.1), roles and settings (6.2), cash handover (6.3).
- CSV export (UTF-8 with BOM so Bengali opens correctly in Excel; amounts as plain ASCII numbers).
- Accessibility audit (contrast, 48px targets, labels), then `npm run build`.