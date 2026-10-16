# Changelog

All notable changes to Pujo Khata. Format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/); versions follow
[Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added
- SPEC.md v1.3.0 domain model in `src/types/domain.ts`; service layer implements the spec
  surface (clubs, members, households, chanda, expenses, events, summary, sync) with
  validation, idempotent creates (client id) and void-instead-of-delete.
- Generic demo fixtures (Sample Puja Committee 2026): 15 households, 12 chanda entries
  including one promised and one void, 4 expenses, 3 members, 2 events.
- `getSummary()` per SPEC Section 6 with unit tests (void/promised exclusion, zero target,
  negative balance, >100%).
- Receipt numbers per collector: `PK-{year}-{collector_code}-{seq}`.
- Expense form: paid to and date fields; voucher photos stored in IndexedDB.
- React Query hooks and mutations that invalidate the affected queries.
- Receipt module (M3b, SPEC Story 2.2) in `src/features/receipt`: one view-model drives the
  on-screen card, the WhatsApp/share text and a PNG, so they always match.
  - Amount in words in Bengali and English via the new `words()` i18n helper
    (`1001` → এক হাজার এক / One Thousand One).
  - Share on WhatsApp to the donor's number, native share sheet where available, receipt
    as an image (shared as a file on phones, downloaded elsewhere) and print.
  - `/receipt/$id` page to re-open and re-share a receipt; reached from the home activity
    feed and a Receipt button in the chanda register.
  - Voided receipts stay viewable and printable with a VOID mark, but can't be sent.
- `t()` fills `{name}` placeholders; shared `PrintPortal`, canvas and file-share helpers.
- Expense ledger module (M4, SPEC Stories 3.1, 3.2) in `src/features/expenses`:
  - Per-category subtotals above the list (total, colour bar, tap a category to filter)
    and category chips with counts.
  - Tapping a row opens the expense details (amount in words, approver, dates, sync
    state, void reason) with a full-screen voucher photo.
  - Voucher photos are compressed on the phone (long side ≤ 1600px, ≈ 400 KB JPEG,
    location metadata dropped); clear errors for non-images and unreadable photos;
    photos can be changed or removed before saving.
  - Filter, add form, details and photo live in the URL: refresh keeps them, they can be
    linked to, and the phone's back button closes them (`useSearchModal`).
- `api.deleteVoucherImage()`; photos left unreferenced by a failed or repeated save are
  cleaned up.

### Changed
- All screens read and write through the new hooks; records save locally as pending and
  sync immediately when online.
- Roles are admin / treasurer / collector; only admins and treasurers approve expenses.
- Share texts and the story card format money through i18n; no local-only links shared.
- Receipt share text is fully bilingual and self-contained (no local-only link).
- Expense dates can't be in the future; the store refuses non-image or oversized vouchers.
- Expense rows show the expense date instead of "time ago".

### Fixed
- A newly created club had no members, so chanda couldn't be collected (no collector)
  and expenses couldn't be approved (no treasurer/admin). The create-club form now asks
  for the creator's name (phone comes from the OTP login, or is entered in demo), and the
  creator is saved as the club's admin in the same write; creating a club signs them in.

### Removed
- Household pledge fields (pledges are now `promised` chanda entries) and event slots.

## [0.2.0] - 2026-10-15

### Added
- Onboarding with validated phone and OTP (mock code 1234 until the Laravel
  API), 5-attempt lockout, resend cooldown and change-number.
- Club creation with validation: unique name per year, target ₹1,000–₹10 cr.
- Login required for all app pages; demo login always opens the demo club.
- Dashboard loading, empty and retry states.
- Chanda register: filter counts, Bengali-digit and phone search, balance due
  and paid-so-far for partial payments, reminders in the app language.
- Collect form: labelled fields with inline errors, amount ₹1–₹10 lakh,
  duplicate-household guard, balance due pre-filled from the register.
- CI on every pull request and push to `main`: lint, typecheck, tests, build.

### Changed
- Not-found and error pages are translated.
- Language toggle and filter chips are 48px tall; the toggle is readable on
  the red header.
- Negative amounts show as −₹5,000.

### Fixed
- A partial payment no longer marks a household fully paid.
- Receipt numbers can no longer repeat.
- The collect button no longer stays disabled after a failed save.

## [0.1.0] - 2026-10-15

### Added
- Lovable prototype: onboarding, dashboard, chanda register and collection,
  receipts, expenses, events, public audit and club admin, backed by
  localStorage with Bengali/English UI.

[Unreleased]: https://github.com/debanjancred/pixel-perfect-buddy-325/compare/v0.2.0...HEAD
[0.2.0]: https://github.com/debanjancred/pixel-perfect-buddy-325/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/debanjancred/pixel-perfect-buddy-325/releases/tag/v0.1.0
