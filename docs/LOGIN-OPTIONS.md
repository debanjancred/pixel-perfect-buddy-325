# Production login: decision

**Decided 2026-10-28 (owner):** no messaging integrations — no SMS provider, no WhatsApp,
no email codes. Production login uses **Supabase test numbers**: each member's phone
number is added in the dashboard with its own fixed code, given to them privately.

## Why this works with the app

Everything on the server identifies a person by phone number (`auth_phone()`, matched to
`club_members.phone`). Test numbers are ordinary phone logins to Supabase, so nothing in the
app or the database changes.

## What it means in practice

- **Adding a member** takes one extra step: the admin adds them in the app as usual, and the
  owner adds their number and a code in the production dashboard (Authentication → Sign In /
  Providers → Phone → test phone numbers), then tells the member the code privately.
- **Choose codes well:** 6 digits, different for every member, never a pattern (not
  `123456`, not the last digits of the phone). Keep the list somewhere private.
- **Keep the group small and trusted.** Anyone who learns a number's code can log in as
  that member; the server still limits them to that member's club and role, and every
  entry is tied to that member.
- **A lost or shared code:** change that number's code in the dashboard, and remove the old
  device from Settings → Devices (or `ops_remove_device` from the SQL editor).
- **A member who leaves:** remove them from the club in the app and delete their test
  number in the dashboard.

## Go-live

Step 0 of [GO-LIVE.md](GO-LIVE.md) is answered by this decision; step 2 (login settings)
means adding the pilot members' test numbers.
