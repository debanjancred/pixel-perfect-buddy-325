#!/usr/bin/env bash
# End-to-end check of the app's cloud code (src/services/cloud) against the real schema:
# a throwaway database on your local PostgreSQL + PostgREST (Supabase's data API), driven
# by supabase-js with signed JWTs for an admin, a treasurer and a collector.
#   POSTGREST_BIN=/path/to/postgrest supabase/tests/integration.sh
# Needs PostgreSQL running (Postgres.app) and a PostgREST binary
# (https://github.com/PostgREST/postgrest/releases). Leaves nothing behind.
set -euo pipefail
cd "$(dirname "$0")/../.."
PG_BIN=${PG_BIN:-/Applications/Postgres.app/Contents/Versions/latest/bin}
export PATH="$PG_BIN:$PATH"
POSTGREST_BIN=${POSTGREST_BIN:-postgrest}
DB="pujo_khata_it_$$"
PORT=${PGRST_PORT:-3399}
SECRET="pujo-khata-integration-test-secret-$(date +%s)-padding"
PW="it_$$"

pg_isready -q || { echo "PostgreSQL is not running (start Postgres.app)"; exit 1; }
command -v "$POSTGREST_BIN" >/dev/null || { echo "PostgREST not found (set POSTGREST_BIN)"; exit 1; }

created_roles=$(psql -d postgres -Atq <<'SQL'
select string_agg(r, ' ') from unnest(array['anon', 'authenticated', 'pk_authenticator']) r
where not exists (select 1 from pg_roles where rolname = r);
SQL
)
for r in $created_roles; do
  if [ "$r" = pk_authenticator ]; then
    psql -d postgres -q -c "create role pk_authenticator login noinherit password '$PW'"
  else
    psql -d postgres -q -c "create role $r nologin"
  fi
done
psql -d postgres -q -c "alter role pk_authenticator password '$PW'"
psql -d postgres -q -c "grant anon, authenticated to pk_authenticator"

pgrst_pid=""
cleanup() {
  [ -n "$pgrst_pid" ] && kill "$pgrst_pid" 2>/dev/null || true
  dropdb --if-exists "$DB" >/dev/null 2>&1 || true
  for r in $created_roles; do psql -d postgres -q -c "drop role if exists $r" >/dev/null 2>&1 || true; done
}
trap cleanup EXIT

createdb "$DB"
psql -d "$DB" -v ON_ERROR_STOP=1 -q < supabase/tests/00_supabase_stub.sql
for f in supabase/migrations/*.sql; do psql -d "$DB" -v ON_ERROR_STOP=1 -q < "$f"; done
psql -d "$DB" -q -c "grant connect on database $DB to pk_authenticator"

PGRST_DB_URI="postgres://pk_authenticator:$PW@localhost:5432/$DB" \
PGRST_DB_SCHEMAS=public PGRST_DB_ANON_ROLE=anon PGRST_JWT_SECRET="$SECRET" \
PGRST_SERVER_PORT="$PORT" PGRST_LOG_LEVEL=error "$POSTGREST_BIN" &
pgrst_pid=$!
for _ in $(seq 1 30); do curl -sf "http://localhost:$PORT/" >/dev/null 2>&1 && break; sleep 0.5; done

PK_PGRST_URL="http://localhost:$PORT" PK_JWT_SECRET="$SECRET" \
  npx vitest run src/test/cloud.integration.test.ts
