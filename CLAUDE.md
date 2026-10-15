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
- Every user-visible string goes through `src/lib/i18n.tsx` (`t`, `n`, `money`, `pick`)
  so Bengali/English and Bengali numerals switch globally.
- Mobile-first at 360px, touch targets at least 48px.
- Palette: vermilion `#B71C1C`/`#C8102E`, antique gold `#B8860B`, canvas `#FDFBF7`.
  Fonts: Hind Siliguri for Bengali, Inter for English. The alpona motif belongs only
  on the top header — never behind numbers or inputs.
- Bengali is the default language; the demo club is
  বিবেকানন্দ পার্ক সার্বজনীন দুর্গোৎসব ২০২৬.

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
