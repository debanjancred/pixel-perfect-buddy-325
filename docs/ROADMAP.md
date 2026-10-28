# Roadmap

We work one module at a time. Each phase ships as a minor release.
"Day" means one working session, not a calendar date.

| Release | Phase | Modules | Status |
|---|---|---|---|
| v0.1.0 | Lovable prototype | All screens on localStorage | Released |
| v0.2.0 | Stabilise + core collection | M0, M1, M2, M3 | Released |
| v0.3.0 | Money modules | M3b Receipt, M4 Expenses | Folded into v0.9.0 |
| v0.4.0 | Community & admin | M5 Events, M6 Public audit, M7 Admin | Folded into v0.9.0 |
| v0.5.0 | Cross-cutting | M8 Roles & permissions, M9 Offline & PWA | Folded into v0.9.0 |
| v0.9.0 | Release candidate | M3b–M10, QA sweep, M11 backend (cloud mode off by default) | Released |
| v0.10.0 | Cloud hardening | M12 sync fixes, devices, writer receipt numbers, members UI, keyboard-safe sheets, toasts | Released |
| v0.11.0 | Operations | M13 phase 1 (ADR 0002), promises, event edit/delete, install button | Released |
| v1.0.0 | Production | M11 Supabase backend, sync, operations on production | Runbook ready (`docs/GO-LIVE.md`); needs the login decision, then the go-live session |

## Status board

Updated 2026-10-28 (v0.11.0). **UAT** = released and live on staging, waiting for the owner's
check; it moves to **Done** when accepted.

### To do
- Owner: run the UAT checklist (`docs/UAT-v0.11.0.md`) on staging
- Decide how members log in on production (no SMS provider for now; options in
  `docs/GO-LIVE.md` step 0) — blocks go-live
- Go-live = v1.0.0, one planned session on the owner's word: follow `docs/GO-LIVE.md`
  (Pro plan, production migrations, login settings, Lovable env + publish, owner access,
  smoke test, real-device checklist)

### In progress
- UAT checklist for v0.11.0 written (`docs/UAT-v0.11.0.md`); waiting for the owner's run

### UAT
- Promises: record now, pay later, part payments
- App control (`app_config`): maintenance, minimum version, announcements
- Events: admins edit and delete; redesigned event cards
- Install app button (login and Settings)
- Offline saving fix; sync status strip under the header
- Sentry error reporting with on-device scrubbing
- Database security hardening; removed devices cut off on the server
- Sync failure reports (`client_events`) and 90-day cleanup (pg_cron)
- Staff access: `ops.staff`, append-only `ops.audit_log`, `ops_whoami` (no two-step
  verification, by decision)
- Support functions: `ops_find_club`, `ops_find_person`, `ops_club_health`,
  `ops_reset_collect_device`, `ops_remove_device`, `ops_club_entries`
- Usage figures: `ops.usage_totals`, `ops.usage_daily`, `ops_usage`
- Settings → Help with `support_tickets`; staff `ops_tickets`, `ops_close_ticket`

### Done
- v0.10.0 and earlier: M0–M12 (see the table below)

### Later (ADR 0002 phase 2)
- Owner console, ticket inbox, feature flags, club suspension, data erasure, Web Push

## Modules

| Day | Module | Scope | Status |
|---|---|---|---|
| 1 | M0 Foundation | Lint clean, i18n leaks, lockfile, test helpers | Done |
| 2 | M1 Auth & onboarding | Phone/OTP validation, sessions, route guard, create club | Done |
| 3 | M2 Home dashboard | Summary, activity, loading/empty/error states | Done |
| 4 | M3 Chanda register & collect | Search, filters, partial payments, receipt numbers, validation | Done |
| 5 | M3b Receipt | Amount in words, bilingual share text, print/image | Done |
| 6 | M4 Expenses | Ledger, receipt photo compression, approver, validation | Done |
| 7 | M5 Events | Roster per SPEC 6.1: add events, today / upcoming / finished, undoable registration, share text (no slot capacity: not in SPEC §4) | Done |
| 8 | M6 Public audit | SPEC 4.1 accounts at `/club/$slug/accounts` (`/audit` forwards), read-only without login, cash/UPI split, validated category donut, share text, story card | Done |
| 9 | M7 Admin | `/settings` (SPEC 6.2; `/admin` forwards): members grouped by role, last-admin and duplicate-phone guards, localised CSV export with formula protection, preferences, confirmed reset/logout, app version | Done |
| 10 | M8 Roles & permissions | Permission table enforced in `api.ts` and the UI, demo "acting as" switch, void flow (SPEC 2.3), cash handover at `/cash` (SPEC 6.3) | Done |
| 11 | M9 Offline & PWA | SPEC offline banner, sync adapter seam with failed + retry, hand-written service worker (approach in AGENTS.md), maskable icon; verified offline on a production build | Done |
| 12 | M10 QA | axe WCAG 2.1 AA + 48px + 360px audit of every screen in bn/en × light/dark (0 issues), contrast token fixes, Bengali copy review, `app_locale` | Done |
| 13–15 | M11 Backend (Supabase) | Schema + RLS + triggers in `supabase/migrations`, cloud sync adapter + pull/merge, phone OTP, voucher storage, public accounts link; SQL and PostgREST integration tests | Done (project set up) |
| 16 | M12 Cloud hardening | One sync at a time, IDs on plain http, server receipt renumbering, writer receipt numbers, devices (3 per person, one collects, `off_device` flag), "see why" sync reasons, re-sent handovers, members list + sheet, keyboard-safe sheets, branded loaders and toasts | Done |
| 17 | M13 Operations (phase 1) | Per [ADR 0002](adr/0002-operations-console.md): Sentry with PII scrubbing, server-side sync failure log, `app_config` (maintenance, minimum version, announcement), staff roles + audit log, support functions, usage views, Settings → Help tickets | Done (v0.11.0) |
