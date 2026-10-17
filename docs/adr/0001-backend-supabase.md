# ADR 0001 — Supabase (PostgreSQL) instead of a Laravel API

- **Status:** accepted (2026-10-17)
- **Supersedes:** "Laravel REST API later" in SPEC.md, CLAUDE.md and the roadmap.

## Context
The app is offline-first: entries are saved on the phone and sent later, possibly twice.
A backend needs phone-OTP login for Indian numbers, role permissions enforced on the
server, voucher photo storage, shared ledgers across devices, low running cost for
volunteer committees, and to fit Lovable (which syncs `main`). The owner chose PostgreSQL.

## Decision
Use **Supabase**: managed PostgreSQL + Auth (phone OTP) + Storage, with the rules written
as SQL migrations in `supabase/migrations/`:
- Tables mirror `src/types/domain.ts`; checks repeat the zod rules.
- Row-Level Security implements `src/lib/permissions.ts` (a unit test fails if they drift).
- Guard triggers: entries are only ever voided (once), the last admin stays, handovers never
  exceed outstanding cash. Errors use the app's i18n keys.
- `create_club`, `register_event` and `public_accounts` are server functions.

The app keeps its offline-first core: `api.ts` stays the single data layer, the device
store remains the UI's source of truth, and cloud mode plugs in through the existing
`SyncAdapter` (push) plus a pull/merge step. Without the two env vars — and always for the
sample club — the app runs fully on the device as before.

## Alternatives
- **Laravel + PostgreSQL** — a second codebase in another language; every rule written
  twice; we run the servers. Most effort for this stack.
- **TanStack Start server functions + PostgreSQL** — maximum code reuse, no vendor, but
  auth, storage and multi-device updates must be built by hand.
- **Firebase** — strong offline sync and phone auth, but not PostgreSQL.

## Consequences
- Lowest operational effort; plain PostgreSQL underneath, so the data stays portable.
- Supabase Auth sends 6-digit OTPs (its minimum), so cloud mode uses 6 digits; the
  device-only mock keeps 4.
- Receipt numbers are generated per collector on the device; the server's unique
  `(club_id, receipt_no)` turns a clash (one collector on two phones) into a sync failure
  to resolve, rather than a silent duplicate.
- Personal data (member and household phones) is processed under India's DPDP Act 2023;
  host the project in the Mumbai region.
