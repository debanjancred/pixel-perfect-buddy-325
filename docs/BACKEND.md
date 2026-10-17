# Backend: Supabase setup

The app runs fully on the device until cloud mode is configured. With a Supabase project
connected, signed-in committees share one ledger across phones, voucher photos are stored
online, and the accounts page gets a public link anyone can open. The sample club always
stays on the device. Why Supabase: [ADR 0001](adr/0001-backend-supabase.md).

## 1. Create the project
1. On supabase.com create a project in the **Mumbai (ap-south-1)** region.
2. Note **Project URL** and the **anon public** key (Settings → API).

## 2. Apply the database
Either paste each file of `supabase/migrations/` (in name order) into the SQL editor, or with
the Supabase CLI: `supabase link --project-ref <ref>` then `supabase db push`.
This creates the tables, row-level security, guard triggers, server functions and the
private `vouchers` storage bucket.

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
