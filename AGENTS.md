<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

## Architecture rules
- All data access goes through `src/services/api.ts` (async, snake_case, UUIDs) backed by the device — why: the UI never knows whether data is local or synced; optional Supabase cloud mode plugs in behind it (`src/services/cloud/`, `docs/BACKEND.md`).
- Data queries run client-side via react-query hooks in `src/hooks/use-data.ts`, not route loaders — why: data lives in the browser (offline-first) and is unavailable during SSR.
- All UI copy goes through `src/lib/i18n.tsx` (`t`, `n`, `money`, `pick`) — why: Bengali/English and Bengali numerals switch globally.

## Offline & PWA (SPEC Story 5.2)
- **Approach: a hand-written service worker, `public/sw.js`, not `vite-plugin-pwa`.** Why: pages are server-rendered by TanStack Start, so there is no static `index.html` in the build for a precache manifest to point at, and `@lovable.dev/vite-tanstack-config` owns the Vite plugin list (adding PWA plugins there risks breaking Lovable's build).
- **Caching:**
  - Hashed build assets (`/assets/*`) are cache-first; they're immutable.
  - Fonts (Google Fonts CSS and files) are cache-first.
  - Page navigations are network-first. When offline, the cached copy of that URL is served, falling back to the cached `/home` shell. Data never needs the network: it lives on the device (`api.ts`).
- **First visit:** the page registers the worker, then sends it the URLs it has already loaded (the page itself, its JS/CSS chunks, fonts) so they're cached at once. The app then opens with no network from the second visit on.
- **Versioning:** registered as `/sw.js?v=<package.json version>`; caches are named after that version, and old caches are deleted on activate.
- **Disabled in development and in the Lovable preview** (dev server, `id-preview--*` / `*.lovableproject.com` hosts, or running inside an iframe). In those places any previously installed worker is unregistered. Registration lives in `src/lib/pwa.ts`.
