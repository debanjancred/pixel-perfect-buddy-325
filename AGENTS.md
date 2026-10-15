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
- All data access goes through `src/services/api.ts` (async, snake_case, UUIDs) backed by localStorage — why: it will be swapped for a Laravel REST API without touching UI.
- Data queries run client-side via react-query hooks in `src/hooks/use-data.ts`, not route loaders — why: data lives in the browser (offline-first) and is unavailable during SSR.
- All UI copy goes through `src/lib/i18n.tsx` (`t`, `n`, `money`, `pick`) — why: Bengali/English and Bengali numerals switch globally.
