# ADR 0003 — Admin approval of entries

- **Status:** accepted (2026-10-30)
- **Builds on:** [ADR 0001](0001-backend-supabase.md) (Supabase); changes SPEC Story 2.3 (voiding).

## Context
Until v0.12.0 a collector's chanda, a treasurer's expense or handover and a treasurer's void
take effect as soon as they are saved. The owner's goal: whatever a non-admin does to the
money should be approved by the admin, so the admin is the single point of control.

Three facts limit how this can work:
- Collection happens at the door, often offline. The resident pays and expects a receipt
  there and then, so saving can't wait for anyone.
- A collector really holds the cash from the moment they take it, approved or not.
- Device-only mode has one phone, so an admin can only review other people's entries in
  cloud mode.

## Decision

**1. Every entry has an approval status.** Chanda, expenses and handovers are `pending`,
`approved` or `rejected`. The server stamps it: an admin's own entry is approved at once,
anyone else's starts pending. Whatever the phone claims is ignored. Existing entries count as
approved.

**2. Saving still works offline, and receipts are immediate.** A non-admin's chanda gets its
receipt at save time. If the admin rejects it, the receipt is cancelled, its number is never
reused, and the collector tells the resident.

**3. Totals.** Official totals and the public accounts page count approved entries only;
members also see the amount waiting, separately.

**4. Cash in hand counts pending entries.** Pending chanda and pending handovers count towards
a collector's cash, because that money really moved. Rejected ones don't count.

**5. Voids.** Only an admin sets `voided_at`. A treasurer's void is a request with a reason, and
the entry keeps counting until the admin voids it or declines with a reason. A declined void
can be asked for again. Collectors still can't void or ask to.

**6. Reviewing.** Only an admin approves or rejects (permission `entry.approve`), with a reason
for rejecting. A decision is final: a rejected entry can't be edited or voided, and the fix is
a new entry. The approvals screen has bulk approve, because collection days produce hundreds of
entries.

**7. Expense edits.** A treasurer's edit sends the expense back to pending, and the handover lock
stays as it is. An admin's edit counts as approved. A review must be of the version the admin
saw (`err_changedSinceReview`), so an edit made while they were looking can't slip through.

**8. Scope.** Chanda, expenses and handovers where the receiver isn't an admin. Households and
events aren't covered: they don't change the money, and would only lengthen the admin's queue.

**9. "Approved by" on expenses** is renamed "Authorised by" and stays: it records who agreed the
spending, which is different from the admin's review of the entry.

## Consequences
- Totals lag behind reality until the admin catches up, and one admin is a bottleneck in the
  festival week. Bulk approve and the separate "waiting" figure are the mitigation.
- A resident can hold a receipt for an entry that is later rejected.
- Older apps' treasurer voids are refused once the migration is live, so the release must raise
  the minimum version (`app_config`). The migration and the app ship together.
- Device-only mode has no approvals screen use beyond the phone's own entries.

## Delivery
1. **Database:** migration `20261030000001_admin_approval.sql`, SQL tests. Done on the branch.
2. **App data:** domain types, `api.ts`, sync adapter, totals, cash and lock rules, error messages.
   Done on the branch.
3. **Screens:** approvals screen for admins, status labels, void request flow, waiting figure.
4. **Docs and release:** SPEC 2.3, member guide, UAT list, minimum version.
