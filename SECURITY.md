# Security policy

## Reporting a vulnerability

Please **do not** open a public issue for a security problem. Report it privately through
GitHub instead: open the repository's **Security** tab and choose **Report a vulnerability**.

Include what you found, how to reproduce it, and what an attacker could do with it. You will
get a reply within a week. Please give us a reasonable time to fix it before you disclose it.

## Scope

Pujo Khata keeps a puja committee's money records. Most interesting are problems that let
someone:

- read or change another club's data (the database's row-level security rules in
  `supabase/migrations/` are the boundary, not the app's screens);
- act beyond their role, e.g. a collector approving entries or voiding a receipt;
- see personal data (names, phone numbers) through the public accounts page or error reports.

The Supabase anon key and the Sentry DSN are public by design and are not vulnerabilities.

## Supported versions

Only the latest release on `main` receives security fixes.
