-- Security pass (2026-10-19). Supabase grants every new table and function in public to anon
-- and authenticated by default, so the earlier migrations left more than they meant to:
-- TRUNCATE/TRIGGER/REFERENCES/MAINTAIN on every table for signed-in users, and EXECUTE on
-- the 10-19 functions for everyone. This takes those away, stops it happening again (every
-- new table or function must now be granted explicitly in its migration), and fixes the
-- search_path of the functions that didn't set one.

-- Tables: only the select/insert/update the policies were written for.
revoke truncate, references, trigger, maintain on all tables in schema public
  from anon, authenticated;

-- Functions: the API needs only these. Policies call is_member/can/my_member_id/auth_phone
-- as the signed-in user; trigger functions need no grant to fire.
revoke execute on all functions in schema public from public, anon, authenticated;
grant execute on function public.public_accounts(text) to anon, authenticated;
grant execute on function
  public.auth_phone(), public.my_member_id(uuid), public.is_member(uuid), public.can(uuid, text),
  public.create_club(uuid, text, text, text, integer, integer, uuid, text),
  public.register_event(uuid, integer),
  public.touch_device(uuid, text, boolean), public.set_collect_device(uuid),
  public.remove_device(uuid), public.reset_collect_device(uuid)
  to authenticated;

-- Future objects created by this role (the one migrations run as) get no automatic grants.
alter default privileges in schema public revoke all on tables from anon, authenticated;
alter default privileges in schema public revoke all on functions from anon, authenticated;
alter default privileges revoke execute on functions from public;

-- A fixed search_path, so a function can't be steered to another schema's objects.
alter function public.auth_phone() set search_path = public;
alter function public.require_phone() set search_path = public;
alter function public.guard_member_update() set search_path = public;
alter function public.guard_void_only() set search_path = public;
alter function public.set_updated_at() set search_path = public;
