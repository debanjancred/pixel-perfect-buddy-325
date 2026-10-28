#!/usr/bin/env bash
# Applies the migrations to a throwaway database on your local PostgreSQL and runs the SQL
# tests. Uses Postgres.app's tools by default; override with PG_BIN / PGHOST / PGPORT / PGUSER.
#   supabase/tests/run.sh
set -euo pipefail
cd "$(dirname "$0")/.."
PG_BIN=${PG_BIN:-/Applications/Postgres.app/Contents/Versions/latest/bin}
export PATH="$PG_BIN:$PATH"
DB="pujo_khata_test_$$"

pg_isready -q || { echo "PostgreSQL is not running (start Postgres.app)"; exit 1; }

# anon/authenticated are cluster-wide roles: create them if missing and remember to drop them.
created_roles=$(psql -d postgres -Atq -v ON_ERROR_STOP=1 <<'SQL'
select string_agg(r, ' ') from unnest(array['anon', 'authenticated']) r
where not exists (select 1 from pg_roles where rolname = r);
SQL
)
for r in $created_roles; do psql -d postgres -q -c "create role $r nologin"; done

cleanup() {
  dropdb --if-exists "$DB" >/dev/null 2>&1 || true
  for r in $created_roles; do psql -d postgres -q -c "drop role if exists $r" >/dev/null 2>&1 || true; done
}
trap cleanup EXIT

createdb "$DB"
run() { psql -d "$DB" -v ON_ERROR_STOP=1 -q "$@"; }
run < tests/00_supabase_stub.sql
for f in migrations/*.sql; do echo "→ $f"; run < "$f"; done
# Show passes and anything that went wrong; ON_ERROR_STOP makes psql exit non-zero on failure.
# The test files share one session, in order (later files use 01's test.* helpers).
cat tests/[0-9]*.test.sql | run 2>&1 | grep -E "NOTICE|ERROR|FAILED|DETAIL|CONTEXT" | sed 's/^psql:[^ ]* *//; s/NOTICE:  //'
exit "${PIPESTATUS[1]}"
