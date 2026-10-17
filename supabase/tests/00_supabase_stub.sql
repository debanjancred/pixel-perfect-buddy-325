-- Test-only stand-in for what a Supabase project provides: the anon/authenticated roles and
-- auth.jwt(), which reads the claims a request sets (set_config('request.jwt.claims', …)).
-- Never applied to a real Supabase project. run.sh creates (and later drops) the roles.
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
end $$;
create schema if not exists auth;
create or replace function auth.jwt() returns jsonb language sql stable as $$
  select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb
$$;
grant usage on schema auth, public to anon, authenticated;
grant execute on function auth.jwt() to anon, authenticated;
