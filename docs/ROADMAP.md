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
| v0.9.0 | Release candidate | M3b–M10, QA sweep, M11 backend (cloud mode off by default) | Release commit ready; merge + tag pending |
| v1.0.0 | Production | M11 Supabase backend, real OTP, sync | Built; needs a Supabase project (docs/BACKEND.md) |

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
| 13–15 | M11 Backend (Supabase) | Schema + RLS + triggers in `supabase/migrations`, cloud sync adapter + pull/merge, phone OTP, voucher storage, public accounts link; SQL and PostgREST integration tests | Done (needs project setup) |
