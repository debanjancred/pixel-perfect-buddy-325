# Changelog

All notable changes to Pujo Khata. Format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/); versions follow
[Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added
- "See why" on the sync banner lists each entry that didn't sync with the server's reason
  (e.g. a cash handover refused as more than the collector holds because the chanda behind
  it hasn't synced), instead of only a count. Refused updates now say "no permission";
  a missing dependency says so.
- Devices (cloud mode): up to 3 logged-in devices per person, one of them the collecting
  device. Settings → Devices lists them (collecting device and this device marked), switches
  the collecting device and removes a device, which sends anything it still has and logs out
  when it next opens. A 4th login asks to remove one first. The collect screen on any other
  device explains which device collects and offers to collect here instead (online). Admins
  can reset a member's collecting device (Settings → Members). Chanda from a non-collecting
  device is accepted but flagged on the home feed. Server: `user_devices`, `touch_device`,
  `set_collect_device`, `remove_device`, `reset_collect_device`, and the `device_id` /
  `off_device` chanda columns (`supabase/migrations/20261019000002_devices.sql`).
- Branded loading states: a gold-ring spinner with a sindoor tip inside the button that is
  saving, uploading or sharing (`aria-busy`, stays full strength), and a gold strip along
  the top while any save runs (background sync excluded; slower with reduced motion).

### Changed
- Settings → Members redesigned for 360px: rows show a role-toned avatar (vermilion admin,
  gold treasurer), the full name with "You", the phone as 98300 12345 and the member code —
  no more cut-off names or overflowing numbers. Admins tap a member to open a sheet with role
  cards (each with what the role can do, saved explicitly), call and reset-collecting-device;
  adding a member moved into its own sheet. Both sheets live in the URL, so back closes them.
- Receipt numbers use the code of whoever writes the receipt, not the collector the cash is
  for (`PK-2026-A01-0007` when the admin records a collector's cash), so two people never
  share a sequence.

### Fixed
- Sheets (add member, expense, handover, void…) no longer hide behind the phone's keyboard:
  they sit in the visible area above it, and the field being typed in stays in view.
- A cash handover could stay "didn't sync — can't receive more than the cash outstanding"
  forever although the server had it: re-sending it (a retry, or the overlapping syncs fixed
  below) ran the cash check before the duplicate was noticed and counted the handover against
  itself. Re-sends now pass through, and a voided handover is not checked against the cash
  held, so a genuinely refused one can be voided and synced
  (`supabase/migrations/20261019000003_handover_resend.sql`).
- Cash handovers (and the chanda behind them) never synced when two phones issued the same
  receipt number for a collector, e.g. an admin recording cash for a collector who was also
  collecting. The later entry failed the server's unique receipt number on every retry, so
  the server never saw that cash and refused handovers as more than the collector held. The
  server now gives a clashing entry the collector's next free number
  (`supabase/migrations/20261019000001_receipt_renumber.sql`); the phone shows it after the
  next pull.
- A new club showed "1 entry not synced" in cloud mode: two overlapping syncs sent it twice
  and the second copy failed as a duplicate. Syncs now run one at a time, and results are
  recorded on a fresh read of the store, so entries saved during a push are no longer lost.
- Nothing could be saved (e.g. creating a club did nothing) when the app was opened over
  plain http on a LAN address such as `http://192.168.x.x`: `crypto.randomUUID` only exists
  in secure contexts. IDs now come from `newId()` (`src/lib/id.ts`), which falls back to
  `crypto.getRandomValues`.

## [0.9.0] - 2026-10-17

Release candidate. Covers the planned v0.3–v0.5 phases in one release: receipts, expenses,
events, public accounts, settings, roles & permissions with void and cash handover, offline
& PWA, a full QA pass, and the optional Supabase backend (off until configured).

### Added
- Real-device checklist for what automated tests can't cover (`docs/QA-CHECKLIST.md`).
- SPEC.md v1.3.0 domain model in `src/types/domain.ts`; service layer implements the spec
  surface (clubs, members, households, chanda, expenses, events, summary, sync) with
  validation, idempotent creates (client id) and void-instead-of-delete.
- Generic demo fixtures (Sample Puja Committee 2026): 15 households, 12 chanda entries
  including one promised and one void, 4 expenses, 3 members, 2 events.
- `getSummary()` per SPEC Section 6 with unit tests (void/promised exclusion, zero target,
  negative balance, >100%).
- Receipt numbers per collector: `PK-{year}-{collector_code}-{seq}`.
- Expense form: paid to and date fields; voucher photos stored in IndexedDB.
- React Query hooks and mutations that invalidate the affected queries.
- Receipt module (M3b, SPEC Story 2.2) in `src/features/receipt`: one view-model drives the
  on-screen card, the WhatsApp/share text and a PNG, so they always match.
  - Amount in words in Bengali and English via the new `words()` i18n helper
    (`1001` → এক হাজার এক / One Thousand One).
  - Share on WhatsApp to the donor's number, native share sheet where available, receipt
    as an image (shared as a file on phones, downloaded elsewhere) and print.
  - `/receipt/$id` page to re-open and re-share a receipt; reached from the home activity
    feed and a Receipt button in the chanda register.
  - Voided receipts stay viewable and printable with a VOID mark, but can't be sent.
- `t()` fills `{name}` placeholders; shared `PrintPortal`, canvas and file-share helpers.
- Expense ledger module (M4, SPEC Stories 3.1, 3.2) in `src/features/expenses`:
  - Per-category subtotals above the list (total, colour bar, tap a category to filter)
    and category chips with counts.
  - Tapping a row opens the expense details (amount in words, approver, dates, sync
    state, void reason) with a full-screen voucher photo.
  - Voucher photos are compressed on the phone (long side ≤ 1600px, ≈ 400 KB JPEG,
    location metadata dropped); clear errors for non-images and unreadable photos;
    photos can be changed or removed before saving.
  - Filter, add form, details and photo live in the URL: refresh keeps them, they can be
    linked to, and the phone's back button closes them (`useSearchModal`).
- `api.deleteVoucherImage()`; photos left unreferenced by a failed or repeated save are
  cleaned up.
- Events module (M5, SPEC Story 6.1) in `src/features/events`:
  - Add events (name as typed, date from today on); a new club is no longer stuck with
    an empty, read-only screen.
  - Events grouped into Today / Upcoming / Finished with a countdown (আগামীকাল,
    ৩ দিন বাকি); registration closes once an event has passed.
  - Register updates the tally instantly and offers Undo for stray taps
    (`api.unregisterEvent`, never below zero); failed saves roll back.
  - Share sends a self-contained invite text (club, event, date, tally) — no link.
  - Loading, empty and error states.
- Accounts module (M6, SPEC Story 4.1) in `src/features/accounts`, at
  `/club/$slug/accounts` (`/audit` forwards to the active club's page):
  - Read-only and viewable without signing in on the device; any club on the device by
    slug (`api.getClubAccounts`), without switching the active club.
  - Net balance (vermilion when negative), collected vs spent, pledges shown apart,
    target progress, cash vs UPI split.
  - Category donut with a labelled table (percentages always add up to 100%) and hover
    tooltips; WhatsApp summary text and a story-card image.
- Settings module (M7, SPEC Story 6.2) in `src/features/settings`, at `/settings`
  (`/admin` forwards):
  - Members grouped by role with name, phone and collector code; role changes confirm
    with a toast. The last admin can't be demoted; a phone can't be added twice.
  - Add-member form with labelled fields and inline errors.
  - CSV export (UTF-8 with BOM, headers and labels in the current language, amounts as
    plain numbers, voided rows marked; cells that look like formulas are neutralised).
  - Preferences with labelled switches; Reset demo only in the sample club; reset and
    log out ask first; app version shown.
- Shared `ConfirmDialog` and `lib/csv.ts`.
- Roles & permissions (M8, SPEC 6.2): one permission table (`lib/permissions.ts`)
  enforced in `api.ts` (`err_forbidden`) and used by the UI to hide actions — collectors
  collect; treasurers also add expenses, void and receive cash; admins do everything.
  Every role may collect chanda. The demo starts as admin with an "acting as" switch in
  Settings; someone who isn't a member of the open club can't change anything.
- Void flow (SPEC 2.3): void chanda (receipt) and expenses (details) with a required
  reason; voided entries stay visible struck through, including in the home feed.
- Cash handover (SPEC 6.3) at `/cash`: per collector cash collected, handed over and
  outstanding; treasurers/admins receive cash (never more than outstanding, never from
  themselves), handovers are voided rather than edited; home shows cash still held by
  collectors to those who can receive it.
- Offline & PWA (M9, SPEC 5.1 / 5.2):
  - Service worker (`public/sw.js`, approach documented in `AGENTS.md`): the app opens
    with no network after the first visit, with pages, JS/CSS, fonts and icons cached
    per version. Disabled in development and in the Lovable preview.
  - Offline banner with the SPEC wording; it sits in the header, never over inputs.
  - Sync goes through a `SyncAdapter` (`src/services/sync.ts`) — the Laravel client
    plugs in there. Records the adapter rejects are marked failed, shown with a badge
    and a Retry bar, and retried automatically when the app loads online.
  - Manifest: SPEC name and colours, and a proper maskable icon
    (`icon-maskable-512.png`, art inside the safe zone).

- Register lane / block filter (SPEC SHOULD): pick a lane to see only its households;
  status counts follow the lane, and both filters stay in the URL.

- Browser QA suites in `scripts/qa/` (`npm run qa`): end-to-end checks per module in
  real Chrome at 360px plus an axe accessibility audit of every screen in both
  languages and themes; `playwright-core` and `axe-core` added as dev dependencies.

- Supabase backend (M11, [ADR 0001](docs/adr/0001-backend-supabase.md),
  [setup](docs/BACKEND.md)) — optional cloud mode, off until two env vars are set:
  - `supabase/migrations/`: schema mirroring the domain types, row-level security matching
    `src/lib/permissions.ts`, guard triggers (void-only edits, last admin, handover limit,
    authoriser, no future expenses), `create_club`, `register_event`, and
    `public_accounts` (totals-only public link), plus a private voucher bucket.
  - `src/services/cloud/`: Supabase client, phone OTP (6 digits), a sync adapter that
    sends records idempotently in dependency order (and detects updates RLS refused),
    incremental pull + merge where unsent local changes win, voucher upload/download.
  - An outbox queues club, member, household and event changes; the sample club never
    leaves the device.
  - Tests: SQL suite and an end-to-end suite (supabase-js → PostgREST → PostgreSQL) on
    local PostgreSQL, plus unit tests for the adapter, merge and permission parity.

### Changed
- All screens read and write through the new hooks; records save locally as pending and
  sync immediately when online.
- Roles are admin / treasurer / collector; only admins and treasurers approve expenses.
- Share texts and the story card format money through i18n; no local-only links shared.
- Receipt share text is fully bilingual and self-contained (no local-only link).
- Expense dates can't be in the future; the store refuses non-image or oversized vouchers.
- Expense rows show the expense date instead of "time ago".
- Demo event dates are relative to today, so the sample club always has upcoming events.
- Event buttons read "নাম লেখান" / "শেয়ার করুন" (no "+১", and no "link" since none is sent).
- Chart colours replaced with a validated categorical palette (separate light and dark
  steps); the old set had near-identical orange/gold and a grey slot.
- Bengali balance label is "নিট ব্যালান্স" (was "হাতে জমা", i.e. cash in hand), per SPEC §6.
- Session storage moved to `src/services/session.ts` (still re-exported from use-data).
- Modals render in a portal with a stack: a dialog over a sheet isn't clipped, Escape
  closes only the top one, and the page stays scroll-locked until the last one closes.
- QA pass (M10): every screen audited in Bengali/English × light/dark at 360px with axe
  (WCAG 2.1 AA), touch-target and overflow checks — 0 issues remaining. Fixes:
  - Dark mode splits red into a deeper fill (white text on buttons passes AA) and a
    lighter `--primary-ink` for red text; dark `--destructive` lightened.
  - WhatsApp green, warning text and chip counters meet 4.5:1; text on gold uses a
    dark `--on-gold` in both modes; language toggle halves are at least 48px wide.
  - The accounts donut no longer puts hidden chart parts in the tab order.
- Copy review: "বাতিল" now only means Void (Cancel is "না, থাক"); the collector role is
  "সংগ্রাহক" everywhere; pending records say "সিঙ্কের অপেক্ষায়" instead of "offline";
  the accounts page no longer claims "verified"; unused strings removed.
- The language choice is stored under `app_locale` (SPEC 1.2), migrated from the old
  preferences key.

### Fixed
- Typecheck failed in CI (dependencies from `bun.lock`) on every branch since the SPEC
  migration: zero-argument club mutations now infer `void` variables.
- Public accounts page loads about 90 KB (gzipped) less JavaScript: the category donut is
  plain SVG instead of Recharts (same gaps, hover shows the slice in the centre, table
  kept as the accessible version). Total app JS 286 → 194 KB gzipped.
- QA sweep:
  - Dark mode is applied by an inline head script before first paint (no light flash on
    every load for dark-mode users).
  - The demo acts as কর্মী ০১ again, so Collect defaults to that collector (SPEC 2.1);
    the header shows "ডেমো: কর্মী ০১ (সংগ্রাহক) · বদলান" linking to the role switch.
  - Collect's household picker lists recent households first (SPEC 2.1).
  - Signed-in users who aren't members of the open club see a "view only" notice, and
    collect/expense actions are hidden instead of leading to a no-access screen.
  - Modals and the photo viewer take keyboard focus, keep Tab inside, and return focus
    to the button that opened them.
- A newly created club had no members, so chanda couldn't be collected (no collector)
  and expenses couldn't be approved (no treasurer/admin). The create-club form now asks
  for the creator's name (phone comes from the OTP login, or is entered in demo), and the
  creator is saved as the club's admin in the same write; creating a club signs them in.

### Removed
- Household pledge fields (pledges are now `promised` chanda entries) and event slots.

## [0.2.0] - 2026-10-15

### Added
- Onboarding with validated phone and OTP (mock code 1234 until the Laravel
  API), 5-attempt lockout, resend cooldown and change-number.
- Club creation with validation: unique name per year, target ₹1,000–₹10 cr.
- Login required for all app pages; demo login always opens the demo club.
- Dashboard loading, empty and retry states.
- Chanda register: filter counts, Bengali-digit and phone search, balance due
  and paid-so-far for partial payments, reminders in the app language.
- Collect form: labelled fields with inline errors, amount ₹1–₹10 lakh,
  duplicate-household guard, balance due pre-filled from the register.
- CI on every pull request and push to `main`: lint, typecheck, tests, build.

### Changed
- Not-found and error pages are translated.
- Language toggle and filter chips are 48px tall; the toggle is readable on
  the red header.
- Negative amounts show as −₹5,000.

### Fixed
- A partial payment no longer marks a household fully paid.
- Receipt numbers can no longer repeat.
- The collect button no longer stays disabled after a failed save.

## [0.1.0] - 2026-10-15

### Added
- Lovable prototype: onboarding, dashboard, chanda register and collection,
  receipts, expenses, events, public audit and club admin, backed by
  localStorage with Bengali/English UI.

[Unreleased]: https://github.com/debanjancred/pixel-perfect-buddy-325/compare/v0.9.0...HEAD
[0.9.0]: https://github.com/debanjancred/pixel-perfect-buddy-325/compare/v0.2.0...v0.9.0
[0.2.0]: https://github.com/debanjancred/pixel-perfect-buddy-325/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/debanjancred/pixel-perfect-buddy-325/releases/tag/v0.1.0
