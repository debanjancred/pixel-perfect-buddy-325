# Contributing to Pujo Khata

How code moves from an idea to a release. The architecture rules live in
[AGENTS.md](AGENTS.md); the plan lives in [docs/ROADMAP.md](docs/ROADMAP.md).

## Branches

`main` is the branch Lovable syncs with. It must always build and pass CI.

| Branch | Use | Example |
|---|---|---|
| `main` | Releasable trunk, synced with Lovable | — |
| `feat/<module>-<slug>` | A roadmap module or feature | `feat/m4-expenses` |
| `fix/<slug>` | Bug fix | `fix/receipt-number-gap` |
| `chore/<slug>`, `docs/<slug>` | Tooling, CI, docs | `chore/ci-cache` |

- Keep branches short-lived: one module per branch.
- To pick up Lovable edits, **merge** `main` into your branch. Never rebase,
  amend or force-push commits that are already pushed — Lovable would lose
  its history.
- Merge into `main` with a merge commit (`git merge --no-ff`) once CI is
  green. Pushing `main` updates the Lovable editor; it does not publish the
  live site (publish from Lovable).

## Commits

[Conventional Commits](https://www.conventionalcommits.org/):
`feat:`, `fix:`, `refactor:`, `style:`, `test:`, `docs:`, `chore:`, `ci:`.
Keep formatting-only changes in their own `style:` commit.

## Definition of done

1. `bun run lint`, `bun run typecheck`, `bun run test`, `bun run build` pass.
2. Checked in a real browser at 360px wide; touch targets are at least 48px.
3. New copy is in `src/lib/i18n.tsx` in Bengali and English.
4. Data goes through `src/services/api.ts`, and inputs are validated there
   with the shared schemas in `src/lib/validation.ts`.
5. `CHANGELOG.md` has an entry under **Unreleased**.

## Versioning and releases

[Semantic Versioning](https://semver.org/). The product stays below 1.0
until the Supabase backend is live in production; 1.0.0 is the first production
release. Each roadmap phase is a minor release (see the roadmap).

To release:

1. On the feature branch, move **Unreleased** in `CHANGELOG.md` under the new
   version with today's date, and bump `version` in `package.json`.
   Commit as `chore(release): vX.Y.Z`.
2. Merge into `main` with `--no-ff` and push.
3. Tag the merge commit and push the tag:
   `git tag -a vX.Y.Z -m "vX.Y.Z" && git push origin vX.Y.Z`.
