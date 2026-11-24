# Pujo Khata (পুজো খাতা)

The accounts book for a neighbourhood puja committee, on the phone. Collectors record
chanda (donations) door to door and hand out receipts on the spot; the treasurer records
expenses with bill photos; every resident can see where the money went.

Bengali first, with English one tap away. Built for 360px phones, patchy networks and
members of every age.

## What it does

- **Chanda collection:** a household register by lane, quick amounts, cash or UPI,
  promises and part payments, numbered receipts to print, save as an image or share on
  WhatsApp.
- **Expenses:** a ledger by category with bill photos, who authorised each payment, search
  and edits until the next cash handover.
- **Cash handovers:** collectors hand cash to the treasurer, both confirm, cash in hand
  stays reconciled.
- **Admin approval:** entries and cancellations from non-admins wait for an admin, who
  approves them in bulk ([ADR 0003](docs/adr/0003-admin-approval.md)).
- **Public accounts page:** a read-only page anyone with the link can open, with totals,
  cash/UPI split and spending by category.
- **Roles:** admin, treasurer and collector, enforced in the app and by the
  database's row-level security.
- **Events, Excel export, offline saving** and an installable app (PWA).

## Try it

```sh
npm install
npm run dev
```

Open the app and choose **নমুনা ক্লাব দেখুন** (View sample club). With no backend
configured, everything is stored on the device, so no account or server is needed.

## Cloud mode (optional)

To share one club across phones, point the app at a Supabase project: copy `.env.example`
to `.env` and fill in `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`, then apply the
migrations in `supabase/migrations/`. Setup, sync and security model:
[docs/BACKEND.md](docs/BACKEND.md) and [ADR 0001](docs/adr/0001-backend-supabase.md).

## Development

Requires Node.js 22. CI installs with Bun 1.3.14 (`bun install --frozen-lockfile`).

| Command | What it does |
|---|---|
| `npm run dev` | Start the dev server |
| `npm run test` | Unit and component tests (Vitest) |
| `npm run lint` / `npm run typecheck` | ESLint / TypeScript |
| `npm run build` | Production build |
| `npm run qa` | Browser suites and accessibility audit (needs `npm run dev -- --port 5199`) |
| `supabase/tests/run.sh` | Database tests on a local PostgreSQL |

Stack: TanStack Start v1, React 19, Vite, Tailwind CSS v4, react-query, Supabase.

## Documentation

- [SPEC.md](SPEC.md): product backlog and user stories
- [AGENTS.md](AGENTS.md): architecture rules
- [CONTRIBUTING.md](CONTRIBUTING.md): branches, commits and releases
- [docs/ROADMAP.md](docs/ROADMAP.md): plan and status
- [CHANGELOG.md](CHANGELOG.md): release notes
- [docs/adr/](docs/adr/): architecture decisions

## Contributing

Issues and pull requests are welcome; please read [CONTRIBUTING.md](CONTRIBUTING.md) first.
All sample data must stay generic: no real clubs, people or phone numbers.

## Security

Please report security problems privately, see [SECURITY.md](SECURITY.md).

## License

[MIT](LICENSE)
