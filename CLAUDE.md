# Pujo Khata (পুজো খাতা) — Claude Code guide

Start by reading `AGENTS.md` — the architecture rules live there and must not be broken.

## Commands

```bash
npm run dev        # start the dev server
npm run test       # vitest run
npm run lint       # eslint .
npm run format     # prettier --write .
npm run build      # production build
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

## Git

This repository two-way syncs with Lovable on a single branch. Do not rewrite
already-published history (no force push, rebase or amend of pushed commits).
Pushing updates the Lovable editor but does not publish the live site.
