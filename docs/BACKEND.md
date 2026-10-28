# Backend: Supabase setup

The app runs fully on the device until cloud mode is configured. With a Supabase project
connected, signed-in committees share one ledger across phones, voucher photos are stored
online, and the accounts page gets a public link anyone can open. The sample club always
stays on the device. Why Supabase: [ADR 0001](adr/0001-backend-supabase.md); monitoring
and the owner console: [ADR 0002](adr/0002-operations-console.md).

## 1. Create the project
1. On supabase.com create a project in the **Mumbai (ap-south-1)** region.
2. Note **Project URL** and the **anon public** key (Settings → API).

## 2. Apply the database
Use the Supabase CLI (no Docker needed for these commands). Put `SUPABASE_ACCESS_TOKEN`
(Account → Access Tokens) and `SUPABASE_DB_PASSWORD` in `.env`, then:
```bash
set -a; . ./.env; set +a
npx supabase@2.119.0 link --project-ref <ref> -p "$SUPABASE_DB_PASSWORD"
npx supabase@2.119.0 db push --dry-run -p "$SUPABASE_DB_PASSWORD"   # shows what would run
npx supabase@2.119.0 db push -p "$SUPABASE_DB_PASSWORD"
npx supabase@2.119.0 migration list -p "$SUPABASE_DB_PASSWORD"      # local = remote
```
This creates the tables, row-level security, guard triggers, server functions and the
private `vouchers` storage bucket. The link state lives in `supabase/.temp/` (not committed).

**Two projects.** *Staging* (Seoul, test data) is the linked project and what `.env`'s
`VITE_SUPABASE_*` point at. *Production* (Mumbai, `ap-south-1`, real committees) is never
linked; push to it explicitly, after staging, with its own `PROD_SUPABASE_*` values:
```bash
ENC=$(python3 -c "import urllib.parse,os;print(urllib.parse.quote(os.environ['PROD_SUPABASE_DB_PASSWORD'],safe=''))")
PROD_DB="postgresql://postgres.$PROD_SUPABASE_REF:$ENC@aws-0-ap-south-1.pooler.supabase.com:5432/postgres"
npx supabase@2.119.0 db push --dry-run --db-url "$PROD_DB"   # then without --dry-run
```

Every schema change is a new file in `supabase/migrations/` (`YYYYMMDDHHMMSS_name.sql`), tested
with `supabase/tests/run.sh`, then applied with `db push`. Don't paste SQL into the editor: the
CLI records each applied migration, and a pasted one is invisible to it. If that happens,
`migration repair --status applied <version>` records it (done once on 2026-10-19 for the
first six migrations).

## 3. Turn on phone login
Authentication → Providers → **Phone**: enable it and connect an SMS provider.
- For Indian numbers a DLT-registered sender is required; MSG91 is a common choice (use
  Supabase's *Send SMS hook* if your provider isn't listed). Twilio and Vonage are built in.
  Step-by-step: [SMS-SETUP.md](SMS-SETUP.md).
- While testing, add **test phone numbers** with fixed codes (Auth → Phone → Test OTP),
  e.g. `919000000001 = 123456`, so no SMS is sent.
- OTPs are 6 digits in cloud mode.

## 4. Point the app at it
Set the two variables (see `.env.example`) where the app is built — locally in `.env`, and
in your hosting/Lovable project environment for the published site:
```
VITE_SUPABASE_URL=https://<ref>.supabase.co
VITE_SUPABASE_ANON_KEY=<anon key>
```
Rebuild/redeploy. The login screen then sends real OTPs (the "auto-fill 1234" helper
disappears) and Settings → sync works across devices.

## How it behaves
- **Offline first:** saves go to the phone; when online, pending records and queued
  changes (clubs, members, households, events, tallies) are sent in dependency order,
  each insert idempotent by its client UUID. Then other devices' changes are pulled and
  merged — unsent local changes always win until they are sent.
- **Permissions** are enforced by the database (row-level security + triggers), matching
  `src/lib/permissions.ts`. A refused change shows as "didn't sync" with Retry.
- **Devices:** each person can be logged in on up to 3 devices (a 4th login asks them to
  remove one) and collects chanda on exactly one — their *collecting device* — so their
  receipt numbers come from one sequence on one phone. Everything else works on every
  device. Settings → Devices lists them, switches the collecting device and removes a device
  (it sends what it still has and logs out the next time it opens). An admin can reset a
  member's collecting device from Settings → Members (lost phone). Chanda that reaches the
  server from any other device is still accepted, but flagged ("collected on another
  device") on the home feed for the committee to check. A device is an id kept in the
  browser, so clearing site data or a private tab counts as a new device.
- **Removed devices on the server:** each device records the login session it checks in
  with. Once removed, that session reads no club data and can't void, manage members or
  events, create clubs or change devices; chanda, expenses and handovers it still sends are
  accepted (the cash was really taken) and flagged `off_device`. A session is covered from
  the device's first check-in after `…_removed_device_sessions.sql`.
- **Grants:** every table and function is granted explicitly in its migration; Supabase's
  automatic grants on new objects are switched off (`…_security_hardening.sql`), so a new
  migration must `grant` what the app needs.
- **Receipt numbers** use the code of whoever writes the receipt (`PK-2026-A01-0007` when the
  admin records a collector's cash). If two devices still issue the same number, the server
  gives the later entry the next free one; the phone shows it after the next pull.
- **Public accounts:** `/club/<slug>/accounts` works on any device via `public_accounts`,
  which returns totals only — no names or phone numbers.

## Testing the database locally (no Supabase account needed)
Both use your local PostgreSQL (Postgres.app) and a throwaway database:
```bash
supabase/tests/run.sh                                  # SQL: RLS, triggers, functions
POSTGREST_BIN=/path/to/postgrest supabase/tests/integration.sh
# ↑ the app's real sync code via supabase-js against PostgREST (Supabase's data API)
```
PostgREST binaries: https://github.com/PostgREST/postgrest/releases.

## Error monitoring (Sentry)
Production builds report crashes and unhandled errors to Sentry when `VITE_SENTRY_DSN` is
set (`.env` locally, the hosting/Lovable environment for the published site); without it
nothing is sent. Development builds never send. Decision and limits: ADR 0002.
- **What is sent:** the error and stack trace, the page path (no query string), browser
  name, app release (`pujo-khata@<version>`), and tags `club_id`, `role`, `mode`, `locale`,
  `cloud`. The user is this browser's random device id, so Sentry can count affected devices.
- **What is not:** phone numbers, rupee amounts, long numbers and Bengali text are masked in
  messages; query strings, cookies, request bodies, console output and IP-derived data are
  dropped (`src/services/monitoring.ts`, tested in `src/test/monitoring.test.ts`).
- **Quota:** at most 25 events per page load; offline fetch errors, browser quirks and
  extension errors are ignored. Errors recorded offline are sent when the phone reconnects.
- **Environment:** `local` for localhost and LAN addresses, `production` everywhere else.
- **Readable stack traces:** with an organization token as `SENTRY_AUTH_TOKEN` in the build
  environment (Sentry → Settings → Organization Tokens; never `VITE_`-prefixed), `vite build`
  uploads source maps to the `pujo-khata` project and deletes them from `.output/public`; the
  build fails if any map would be published. Maps must come from the build that is deployed,
  so set the token where the published site is built. Without it, builds are unchanged and
  traces show minified code.
- **In Sentry** (Project → Settings → Security & Privacy) also turn on *Data Scrubber*,
  *Use Default Scrubbers* and *Prevent Storing of IP Addresses*, as a second line of defence.

## App control (`app_config`)
One row the app reads on every open, in the background (ADR 0002 §3). It never waits for it:
the last copy is kept on the phone, and with no copy and no signal the app works normally.
Edit it in the Supabase dashboard (**Table Editor → app_config**, the single row) until the
owner console exists; the API lets nobody change it.

| Column | Effect on every phone |
|---|---|
| `maintenance` | `true` pauses syncing (pushing and pulling); members keep recording on the phone. Shows `maintenance_message_bn` / `_en`, or a default text. |
| `min_version` | Apps older than this (e.g. `0.11.0`) show "Update required" with an **Update now** button and stop syncing until updated. Entries stay on the phone. |
| `announcement_bn` / `_en` / `_url` | A notice everyone sees until they close it; editing the row shows it again. `_url` must be `https://`. Clear both texts to remove it. |
| `flags` | Feature switches for later (JSON object). |

**Releasing a version that old phones must not keep using:** publish it first, then raise
`min_version` to it. Phones pick it up the next time they open the app.

## Sync failure reports (`client_events`)
When the server refuses a record, the phone notes why and sends the note on its next sync
(ADR 0002 §2), so a broken release or a wrong server rule shows up before anyone calls.
- **What is stored:** the error key (`err_forbidden`, `err_syncDependency`, …), the kind of
  record (`chanda`, `expense`, `handover`, …) and its id, the club, the reporter's member id,
  the device id and the app version. No phone numbers, names, amounts or record contents.
- **What is not reported:** network failures (no signal is normal), the sample club, and the
  same record failing the same way again. Each device stores at most 50 a day.
- **Who can read it:** nobody through the API, not even the reporter. Until the owner console
  exists, query it in the SQL editor, e.g. what failed most this week:
  ```sql
  select error_key, entity_type, app_version, count(*) as n, count(distinct club_id) as clubs
  from client_events where created_at > now() - interval '7 days'
  group by 1, 2, 3 order by n desc;
  ```
  To follow one record, filter by `record_id` (the entry's id on the phone).
- **Kept 90 days:** a daily pg_cron job (`purge-client-events`, 03:00 India time) deletes
  older reports. Check it with `select * from cron.job;` and its runs with
  `select * from cron.job_run_details order by start_time desc limit 5;`. If the migration
  couldn't turn pg_cron on, enable it under **Database → Extensions** and run the
  `cron.schedule(…)` line from `…_client_events_retention.sql` once.

## Staff access (`ops` schema)
Support and owner tools are `ops_*` functions (ADR 0002 §4). Each first calls
`ops.require_staff`, which refuses anyone not listed in `ops.staff` (or below the role the
action needs, or without a reason where one is required) and writes `ops.audit_log`.
- **Until the owner console exists**, run them in the SQL editor: those calls count as the
  owner and are logged as `dashboard`. Try `select ops_whoami();`.
- **Adding staff** (they need a Supabase Auth login first; find their id under
  Authentication → Users):
  ```sql
  insert into ops.staff (user_id, role, label) values ('<auth user id>', 'support', 'Name');
  update ops.staff set removed_at = now() where user_id = '<auth user id>';  -- remove
  ```
  Both are audited automatically.
- **Reading the log:** `select * from ops.audit_log order by at desc limit 50;` It can only be
  added to; edits, deletes and truncation are refused.
- App users have no access to the `ops` schema; it is not exposed through the API.
