# Roadmap

We work one module at a time. Each phase ships as a minor release.
"Day" means one working session, not a calendar date.

| Release | Phase | Modules | Status |
|---|---|---|---|
| v0.1.0 | Lovable prototype | All screens on localStorage | Released |
| v0.2.0 | Stabilise + core collection | M0, M1, M2, M3 | Released |
| v0.3.0 | Money modules | M3b Receipt, M4 Expenses | Ready to release |
| v0.4.0 | Community & admin | M5 Events, M6 Public audit, M7 Admin | Planned |
| v0.5.0 | Cross-cutting | M8 Roles & permissions, M9 Offline & PWA | Planned |
| v0.9.0 | Release candidate | M10 QA pass | Planned |
| v1.0.0 | Production | M11 Laravel API, real OTP, sync | Needs the API |

## Modules

| Day | Module | Scope | Status |
|---|---|---|---|
| 1 | M0 Foundation | Lint clean, i18n leaks, lockfile, test helpers | Done |
| 2 | M1 Auth & onboarding | Phone/OTP validation, sessions, route guard, create club | Done |
| 3 | M2 Home dashboard | Summary, activity, loading/empty/error states | Done |
| 4 | M3 Chanda register & collect | Search, filters, partial payments, receipt numbers, validation | Done |
| 5 | M3b Receipt | Amount in words, bilingual share text, print/image | Done |
| 6 | M4 Expenses | Ledger, receipt photo compression, approver, validation | Done |
| 7 | M5 Events | Slot capacity, full state, share link | Todo |
| 8 | M6 Public audit | Read-only without login, charts, story card | Todo |
| 9 | M7 Admin | Members & roles, CSV export, preferences, app version shown | Todo |
| 10 | M8 Roles & permissions | Secretary / treasurer / collector gating in UI and api | Todo |
| 11 | M9 Offline & PWA | Manifest, service worker, sync queue | Todo |
| 12 | M10 QA | Tests per module, 360px & 48px audit, a11y, Bengali copy review | Todo |
| 13–15 | M11 API swap | REST client in `api.ts`, real OTP, offline conflict handling | Blocked on API |
