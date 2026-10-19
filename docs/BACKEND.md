# Backend: Supabase setup

The app runs fully on the device until cloud mode is configured. With a Supabase project
connected, signed-in committees share one ledger across phones, voucher photos are stored
online, and the accounts page gets a public link anyone can open. The sample club always
stays on the device. Why Supabase: [ADR 0001](adr/0001-backend-supabase.md).

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

Every schema change is a new file in `supabase/migrations/` (`YYYYMMDDHHMMSS_name.sql`), tested
with `supabase/tests/run.sh`, then applied with `db push`. Don't paste SQL into the editor: the
CLI records each applied migration, and a pasted one is invisible to it. If that happens,
`migration repair --status applied <version>` records it (done once on 2026-10-19 for the
first six migrations).

## 3. Turn on phone login
Authentication → Providers → **Phone**: enable it and connect an SMS provider.
- For Indian numbers a DLT-registered sender is required; MSG91 is a common choice (use
  Supabase's *Send SMS hook* if your provider isn't listed). Twilio and Vonage are built in.
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
  browser, so clearing site data or a private tab counts as a new device. Removal is
  enforced by the app, not by revoking the Supabase session.
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
