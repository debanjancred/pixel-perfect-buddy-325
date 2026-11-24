# Go-live runbook

Turning on the production backend for real committees, in one planned session. Until this
runs, the published site works in phone-only mode (data stays on each phone) and the
production Supabase project (Mumbai) is unused. Going live is the **v1.0.0** release
(CONTRIBUTING.md: 1.0.0 is the first production release).

**Who:** *You* = the owner (dashboard, Lovable, phones, decisions). *Claude* = commands,
checks and code. Claude touches production only after your explicit yes for that step —
either you run the command with `!` in Claude Code, or you allow production access in
Claude Code's permissions first.

**Projects:** *staging* (Seoul, linked CLI, `.env` `VITE_*`) and
*production* `PROD_SUPABASE_*` in `.env` (Mumbai, never linked; pushed with `--db-url`).
Details: [BACKEND.md](BACKEND.md).

**Allow about 3 hours.** Pick a quiet day — not during Puja, and not while committees are
collecting.

---

## 0. Before the day

| ✓ | Step | Who |
|---|---|---|
| ☐ | **UAT passed** ([UAT-v0.11.0.md](UAT-v0.11.0.md)); fixes released and merged into `main`. | You, Claude |
| ☐ | List the pilot members' phone numbers and choose a private code for each ([LOGIN-OPTIONS.md](LOGIN-OPTIONS.md)). | You |
| ☐ | Supabase **Pro plan** on the production project (daily backups; no pausing after a week idle). | You |
| ☐ | Sentry project `pujo-khata` ready; note its DSN. | You |
| ☐ | Lovable access to the project's environment settings. | You |
| ☐ | Two test phones: one Android (Chrome), one iPhone (Safari). | You |
| ☐ | A date and a time window agreed with the first committee(s). | You |

### Login: Supabase test numbers (decided)

The owner decided on 2026-10-28: no messaging integrations (no SMS, WhatsApp or email).
Members log in with their phone number and a fixed code added for them in the production
dashboard. How to run it: [LOGIN-OPTIONS.md](LOGIN-OPTIONS.md).

---

## 1. Production database (about 20 minutes)

| ✓ | Step | Who |
|---|---|---|
| ☐ | **Dry run** — read-only, lists the missing migrations: | Claude (with your yes) or you via `!` |

```bash
set -a; . ./.env; set +a
ENC=$(python3 -c "import urllib.parse,os;print(urllib.parse.quote(os.environ['PROD_SUPABASE_DB_PASSWORD'],safe=''))")
PROD_DB="postgresql://postgres.$PROD_SUPABASE_REF:$ENC@aws-0-ap-south-1.pooler.supabase.com:5432/postgres"
npx supabase@2.119.0 db push --dry-run --db-url "$PROD_DB"
```

| ✓ | Step | Who |
|---|---|---|
| ☐ | Check the list matches `supabase/migrations` after what production already has (it had up to `20261019000005` in October). | Claude |
| ☐ | **Apply:** the same command without `--dry-run`. | Claude (with your yes) |
| ☐ | `npx supabase@2.119.0 migration list --db-url "$PROD_DB"` → local = remote for every row. | Claude |
| ☐ | In the production SQL editor: `select jobname, schedule, active from cron.job;` → `purge-client-events` and `purge-ticket-diagnostics`, both active. If `pg_cron` is missing, enable it (Database → Extensions) and re-run the two `cron.schedule(…)` lines from the retention and help migrations. | You / Claude |
| ☐ | `select * from app_config;` → one row, `maintenance = false`, `min_version = '0.0.0'`, no announcement. | You |

## 2. Production login settings (about 20 minutes, in the production dashboard)

| ✓ | Step | Who |
|---|---|---|
| ☐ | Authentication → Providers → **Phone**: enabled, OTP length **6**, expiry 10 minutes. | You |
| ☐ | Add each pilot member's number and code as a **test phone number**. | You |
| ☐ | Authentication → **Rate limits**: sign-in attempts at the defaults (they slow down guessing codes). | You |
| ☐ | Project Settings → API: copy the **Project URL** and **anon key** (never the service-role key). | You |

## 3. Point the published site at production (about 20 minutes)

| ✓ | Step | Who |
|---|---|---|
| ☐ | In Lovable's environment settings set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` to the **production** values, and `VITE_SENTRY_DSN`. | You |
| ☐ | If Lovable's build can hold a secret, also set `SENTRY_ORG` and `SENTRY_AUTH_TOKEN` (readable stack traces); otherwise skip it. | You |
| ☐ | **Release v1.0.0:** release branch → version 1.0.0, changelog dated, PR → merge → tag `v1.0.0`. | Claude (merge and tag with your yes) |
| ☐ | **Publish** the site from Lovable. | You |

## 4. Owner access on production (about 10 minutes)

| ✓ | Step | Who |
|---|---|---|
| ☐ | Log in to the live site once with your own phone number (creates your production login). | You |
| ☐ | Find your user id: production dashboard → Authentication → Users. | You |
| ☐ | Add yourself as owner (production SQL editor): `insert into ops.staff (user_id, role, label) values ('<your user id>', 'owner', 'Owner');` | You / Claude (with your yes) |
| ☐ | `select ops_whoami();` → `owner`. | You |

## 5. Smoke test on the live site (about 45 minutes, real phones)

| ✓ | Step | Who |
|---|---|---|
| ☐ | Phone A: log in, **create a test club** (e.g. "Go-live test 2026"), add phone B as a member. | You |
| ☐ | Phone A: add a household, collect a chanda → receipt opens with a receipt number. | You |
| ☐ | Phone B: log in → the club, household and chanda appear after a sync. | You |
| ☐ | Phone B: offline → collect → online → it syncs; phone A sees it. | You |
| ☐ | The public accounts link (`/club/<slug>/accounts`) opens on a third device without login and shows the totals. | You |
| ☐ | Settings → Help → send a request; `select ops_tickets();` shows it; close it with a note. | You |
| ☐ | `select ops_usage(1);` and `select * from client_events order by created_at desc limit 5;` look sane. | You / Claude |
| ☐ | Sentry shows no new errors from the live site. | You |
| ☐ | Run the real-device checklist: [QA-CHECKLIST.md](QA-CHECKLIST.md). | You |
| ☐ | Delete the test club's data or keep it clearly named as a test (ask Claude for a cleanup query if needed). | You / Claude |

## 6. First committee and the first week

| ✓ | Step | Who |
|---|---|---|
| ☐ | Share the site and the member guide ([MEMBER-GUIDE.bn.md](MEMBER-GUIDE.bn.md)) with the first committee. | You |
| ☐ | **Daily for the first 7 days** (5 minutes, production SQL editor): `select ops_tickets();` · `select ops_usage(7);` · the client_events "what failed most" query in BACKEND.md · Sentry issues. | You |
| ☐ | Anything broken: note it, ask Claude for a fix release (v1.0.1 …). | You, Claude |

---

## If something goes wrong

- **Stop syncing without taking the app down:** `update app_config set maintenance = true, maintenance_message_en = '…', maintenance_message_bn = '…';`
  Members keep recording on their phones; nothing is sent until you set it back to `false`.
- **Force an update after a fix:** publish the fixed version first, then
  `update app_config set min_version = '<fixed version>';` — older apps stop syncing and
  ask to update; their entries wait safely on the phone.
- **Take the site back to phone-only mode:** remove the two `VITE_SUPABASE_*` variables in
  Lovable and publish again. Data already on phones stays there; data on the server stays.
- **Database:** migrations only move forward. A problem is fixed with a new migration,
  tested on staging first. Never delete production data or edit tables by hand; the Pro
  plan's daily backup is the last resort (restore only with Claude's help).

## After go-live

- Status board: move the go-live items to **Done**; the next work is ADR 0002 phase 2
  (owner console, ticket inbox, feature flags, club suspension, data erasure, Web Push).
- Update this runbook with anything that differed on the day.
