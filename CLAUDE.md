# Pujo Khata (পুজো খাতা) — Claude Code guide

Start by reading `AGENTS.md` — the architecture rules live there and must not be broken.

## Commands

```bash
npm run dev        # start the dev server
npm run test       # vitest run
npm run lint       # eslint .
npm run format     # prettier --write .
npm run build      # production build
npm run typecheck  # tsc --noEmit
```

## Stack

TanStack Start v1 (React 19 + Vite + Tailwind CSS v4). File-based routes live in
`src/routes`; `src/routeTree.gen.ts` is generated — never edit it by hand.
Styling tokens and component classes (`btn`, `field`, `bg-hero`, `ring-gold`) are
defined in `src/styles.css`.

## Conventions (do not bypass)

- All data access goes through `src/services/api.ts` — async, snake_case, UUIDs,
  backed by localStorage today, a Laravel REST API later.
- Data reads happen in client-side react-query hooks in `src/hooks/use-data.ts`,
  not in route loaders.
- Every user-visible string goes through `src/lib/i18n.tsx` (`t` with `{name}` placeholders,
  `n`, `money`, `words` for amounts in words, `date`, `pick`)
  so Bengali/English and Bengali numerals switch globally.
- Module code lives in `src/features/<module>/`: a pure model (domain → view data,
  unit-tested), hooks, and components, exposed only through its `index.ts`. Routes stay
  thin and compose features; `src/components/pk` holds shared UI primitives and
  `src/lib` shared pure helpers. Examples: `src/features/receipt`, `src/features/expenses`.
- Permissions: check with `usePermission` / `useAccess` in the UI **and** `authorize()` in
  `api.ts`; the table is `src/lib/permissions.ts`.
- Sheets, filters and other view state that should survive refresh or close on the phone's
  back button go in the route's search params (zod `validateSearch` with `.catch`), opened
  and closed through `useSearchModal` in `src/hooks/use-search-modal.ts`.
- Mobile-first at 360px, touch targets at least 48px.
- Palette: vermilion `#B71C1C`/`#C8102E`, antique gold `#B8860B`, canvas `#FDFBF7`.
  Chart series use `--chart-1…6` in fixed category order (validated for colour-blind
  separation in both modes; keep visible labels).
  Fonts: Hind Siliguri for Bengali, Inter for English. The alpona motif belongs only
  on the top header — never behind numbers or inputs.
- Bengali is the default language; the demo club is the generic
  নমুনা পূজা কমিটি ২০২৬ / Sample Puja Committee 2026 (fixtures in `src/mocks/mockData.ts`,
  SPEC.md Section 5). Domain types live in `src/types/domain.ts`.

## Git & releases

Full process in `CONTRIBUTING.md`; plan and status in `docs/ROADMAP.md`.

- `main` two-way syncs with Lovable and must stay releasable. Work on
  short-lived `feat/…`, `fix/…`, `chore/…` branches; merge into `main` with
  `--no-ff` once CI is green.
- Pick up Lovable edits by merging `main` into the branch. Never rewrite
  already-published history (no force push, rebase or amend of pushed commits).
- Conventional Commits; SemVer in `package.json` (0.x until the Laravel API);
  tag releases `vX.Y.Z` and keep `CHANGELOG.md` current.
- Pushing `main` updates the Lovable editor but does not publish the live site.
