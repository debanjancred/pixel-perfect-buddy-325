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
create or replace function auth.uid() returns uuid language sql stable as $$
  select nullif(auth.jwt() ->> 'sub', '')::uuid
$$;
create table if not exists auth.users (id uuid primary key, phone text,
  last_sign_in_at timestamptz, created_at timestamptz not null default now());
grant usage on schema auth, public to anon, authenticated;
grant execute on function auth.jwt(), auth.uid() to anon, authenticated;
-- Supabase's default privileges for objects the migrations create in public (as on a real
-- project): extra table rights for anon/authenticated and EXECUTE on every new function.
-- Migrations must take away what they don't mean to give (…_security_hardening.sql).
alter default privileges in schema public
  grant references, trigger, truncate, maintain on tables to anon, authenticated;
alter default privileges in schema public grant execute on functions to anon, authenticated;
