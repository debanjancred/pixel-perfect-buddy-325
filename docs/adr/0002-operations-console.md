# ADR 0002 — Operations: monitoring, owner console and support

- **Status:** accepted (2026-10-19)
- **Builds on:** [ADR 0001](0001-backend-supabase.md) (Supabase).

## Context
ADR 0001 covers the committees' side: a shared, server-enforced khata. Running Pujo Khata
as a product also needs the owner's side, which nothing serves today:
- **Health** — errors and sync failures stay on the phone (`Store.sync_errors`); we can't
  see that a release broke collection until someone calls.
- **Growth** — registrations, active clubs and devices are only visible as raw tables.
- **Control** — no way to pause the app for maintenance, require an update, switch a
  feature off, or suspend an abusive club.
- **Communication** — no announcements or notifications to users.
- **Support** — helping a member (lost phone, stuck sync, wrong role) means hand-written
  SQL with full database power and no record of what was done.

The data is committees' money and people's phone numbers (DPDP Act 2023), so owner access
must be narrow, strong and recorded. Committee phones are often offline and low-end.

## Decision

**1. Error monitoring — Sentry (free Developer plan for the pilot).**
- `@sentry/react` in the app, initialised only when `VITE_SENTRY_DSN` is set (like cloud
  mode); without it nothing is sent.
- No personal data: the SDK's `dataCollection` collects no user info, cookies, bodies or
  query strings, and `beforeSend` masks phone numbers, Bengali text and amounts; tags carry only `club_id`, role, app version, locale,
  cloud/device mode. Session replay off.
- Offline transport queues errors until the phone is back online. Weak-signal failures are
  not errors to us: network errors are ignored, and failed syncs are handled by the app
  (and logged to `client_events`, below), never sent to Sentry.
- Quota (5,000 errors a month, with Puja's five peak days the risk): duplicates are
  dropped, and each device sends at most **5 errors a day**, counted on the device, not per
  page load (shipped first as 25 per page load). No random sampling: a crash that hits
  only a few phones must still be seen, and the per-device cap already bounds the total.
- Releases are tagged with the `package.json` version so a regression maps to a release.

**2. Product telemetry stays in our Postgres (Mumbai).**
- Sync failures are also written to a server table `client_events` (kind, error key,
  entity type, app version, device id, club id) when the device next reaches the server —
  the "see why" reasons, visible to us.
- Retention: a daily pg_cron job deletes `client_events` (and later `support_tickets`
  diagnostics) older than **90 days**; Sentry keeps events for its plan's 30 days.
- Registration and usage figures are SQL views over existing tables (users, clubs, members,
  devices, entries per day, active clubs); totals only, no household names or phones.
- No third-party product analytics for now.

**3. App control — `app_config` checked on every app open, never waited for.**
- One public, read-only row: `maintenance` (message, on/off), `min_version` (older apps
  must update), `flags` (feature switches), `announcement` (bilingual text, optional link).
- Fetched in the background with a short timeout; the UI never waits for it. The last
  copy is kept in `localStorage` and used until a fresh one arrives.
- No copy yet and offline (first open in a dead zone): fail open — everything on the phone
  works as normal, and syncing simply waits until a config has been read.
- A maintenance flag pauses sending to the cloud, never reading or recording on the phone;
  a too-old version is asked to update, and its entries stay queued on the phone.
- `clubs.suspended_at`: row-level security refuses new writes for a suspended club; members
  see why.

**4. Owner and support access — server-checked, MFA, audited.**
- `ops.staff (user_id, role: owner | support)`; staff sign in with Supabase Auth and must
  pass TOTP MFA (`aal2`), checked in every staff function.
- Staff act only through `ops_*` security-definer functions, never the service-role key in
  a browser and never Supabase Studio for routine work. Support can: look up a person by
  phone; see their clubs, roles, devices and last sync; see a club's totals and sync
  health; reset a collect device; remove a lost device; answer tickets. Reading a club's
  individual entries is a separate action that requires a reason (normally a ticket).
- No impersonation ("log in as the user").
- Every staff call is written to `ops.audit_log` (who, what, target, reason, when),
  append-only: no update or delete grants, not even for owners.

**5. Owner console — a separate web app.**
- A small TanStack Start app in its own private repo, on the same Supabase project, so
  staff code never ships in the committee app's bundle and stays out of the Lovable-synced
  `main`. This repo keeps the database contract: all `ops` tables, views and functions are
  migrations in `supabase/migrations/` with SQL tests, like everything else.
- Until the console exists, owners use the same `ops_*` functions from the SQL editor.

**6. Data protection (DPDP Act 2023).**
- Retention as above; the audit log is kept for the life of the service (it holds ids and
  actions, not personal details).
- Erasure on request: a committee admin can ask to close the club. Its members' and
  donors' phone numbers and names are then removed or masked, while the money records
  (amounts, dates, receipt numbers) stay for the accounts. A person can ask to be removed
  from a club the same way. Carried out with an audited `ops_*` function.
- After a season: the app reminds admins after Lakshmi Puja that they can export the
  accounts and close or archive the club; a club inactive for 12 months is asked to
  confirm before its personal data is masked.

**7. In-app help and notifications.**
- Settings → Help: a short form (category, message, optional device diagnostics: app
  version, mode, pending/failed sync counts) saved to `support_tickets`, plus the support
  WhatsApp number.
- Announcements come from `app_config` (phase 1). Web Push via an Edge Function and
  `push_subscriptions` is phase 2; iPhones need the app installed to the home screen
  (iOS 16.4+), so push is never the only channel for anything important.

**Phasing.**
- **Phase 1, before the pilot (M13):**
  - Sentry.
  - `client_events`.
  - `app_config` with maintenance, minimum version and announcement (non-blocking,
    cached).
  - 90-day `client_events` retention job.
  - `ops.staff`, MFA and `ops.audit_log`.
  - Support functions.
  - Usage views.
  - Settings → Help with `support_tickets`.
- **Phase 2:**
  - The console UI.
  - Ticket inbox.
  - Feature flags in the app.
  - Club suspension.
  - Club closure and personal-data erasure on request; the post-season reminder.
  - Web Push.
- **Phase 3, with paid plans:**
  - Subscriptions and billing.
  - Cross-club analytics.
  - SMS and WhatsApp campaigns.

## Alternatives
- **Supabase Studio only** — free and immediate, but every login has full database power,
  nothing is audited and support staff could change money records. Kept for emergencies
  by the owner only.
- **A hidden `/ops` route inside the committee app** — one codebase, but staff code ships
  to every phone and lands in Lovable's `main`.
- **Retool / Appsmith** — fast to build, but another vendor holding a privileged
  database connection, priced per user.
- **Self-hosted GlitchTip instead of Sentry** — data stays with us, but a server to run;
  revisit if the Sentry quota or data location becomes a problem.
- **PostHog or Firebase Analytics for usage** — richer funnels, but personal data leaves
  India and the figures we need are already in Postgres.

## Consequences
- We see crashes and sync failures within minutes, with the release that caused them.
- Owner access is narrow and every action leaves a trail, which supports DPDP obligations
  and committee trust; the cost is MFA setup and writing a function for each support action.
- The free Sentry plan has one seat and 5,000 errors a month; move to the Team plan
  (about $26/month) when a second person needs access or usage approaches the quota.
- Sentry stores data in the US or EU, so nothing personal may be sent — the scrubbing in
  `beforeSend` is tested like any other rule.
- A second repo and deploy (the console) arrive in phase 2; until then, operations run
  through audited SQL functions.
- The app must report its version and read `app_config`; very old installed copies that
  predate this can't be forced to update, so ship the `min_version` check before the pilot.
