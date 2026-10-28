-- Owner and support access (ADR 0002 §4). Staff act only through public.ops_* functions,
-- each of which first calls ops.require_staff(): the caller must be listed in ops.staff with
-- a high enough role, give a reason where the action needs one, and every call is written
-- to ops.audit_log, which can only be added to. No two-step verification (owner's decision,
-- 2026-10-28; see the ADR).
--
-- Until the owner console exists, the owner runs the ops_* functions in the Supabase SQL
-- editor. Those calls come from the database owner with no app login; they are allowed and
-- logged as 'dashboard' — access to the Supabase account is what guards them.
--
-- The ops schema is private: the app's API doesn't expose it and app users have no rights
-- in it. Adding staff (SQL editor, once a person has a Supabase Auth login):
--   insert into ops.staff (user_id, role, label) values ('<auth user id>', 'support', 'Name');

create schema ops;
revoke all on schema ops from public, anon, authenticated;

create table ops.staff (
  user_id uuid primary key references auth.users (id) on delete cascade,
  role text not null check (role in ('owner', 'support')),
  label text not null check (char_length(btrim(label)) between 1 and 80),
  added_at timestamptz not null default now(),
  removed_at timestamptz
);

create table ops.audit_log (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  actor_kind text not null check (actor_kind in ('staff', 'dashboard')),
  actor_user uuid, -- the staff member's auth user id; null for the dashboard
  actor_role text not null check (actor_role in ('owner', 'support')),
  action text not null check (action ~ '^[a-z][a-z_.]{1,60}$'),
  target text check (char_length(target) <= 200),
  reason text check (char_length(reason) <= 500)
);
create index audit_log_at on ops.audit_log (at);
create index audit_log_actor on ops.audit_log (actor_user, at);

revoke all on ops.staff, ops.audit_log from public, anon, authenticated;

/** The audit log can only be added to: no edits or deletes, not even by the owner. */
create function ops.refuse_audit_change() returns trigger
language plpgsql set search_path = ops as $$
begin
  raise exception 'ops.audit_log is append-only' using errcode = 'P0001';
end $$;
create trigger audit_log_append_only before update or delete on ops.audit_log
  for each row execute function ops.refuse_audit_change();
create trigger audit_log_no_truncate before truncate on ops.audit_log
  for each statement execute function ops.refuse_audit_change();

/** True when the call comes from the SQL editor (the database owner, no app role set). */
create function ops.from_dashboard() returns boolean
language sql stable set search_path = ops as $$
  select current_setting('role') in ('none', 'postgres', 'supabase_admin')
$$;

/**
 * The gate every ops_* function calls first. Refuses (err_forbidden) a caller who isn't
 * active staff, whose role is below p_min_role, or who gives no reason when p_need_reason;
 * otherwise writes the audit row and returns the caller's role. If the action then fails,
 * its audit row is rolled back with it: the log records what was done.
 */
create function ops.require_staff(
  p_action text,
  p_target text default null,
  p_reason text default null,
  p_min_role text default 'support',
  p_need_reason boolean default false
) returns text
language plpgsql security definer set search_path = ops, public as $$
declare
  v_user uuid;
  v_role text;
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
begin
  if ops.from_dashboard() then
    v_role := 'owner';
  else
    v_user := auth.uid();
    select role into v_role from ops.staff where user_id = v_user and removed_at is null;
  end if;
  if v_role is null or (p_min_role = 'owner' and v_role <> 'owner') then
    raise exception 'err_forbidden' using errcode = 'P0001';
  end if;
  if p_need_reason and char_length(coalesce(v_reason, '')) < 5 then
    raise exception 'err_reasonRequired' using errcode = 'P0001';
  end if;
  insert into ops.audit_log (actor_kind, actor_user, actor_role, action, target, reason)
  values (case when v_user is null then 'dashboard' else 'staff' end, v_user, v_role,
          p_action, p_target, v_reason);
  return v_role;
end $$;

/** Changes to the staff list are audited too (normally made in the SQL editor). */
create function ops.audit_staff_change() returns trigger
language plpgsql security definer set search_path = ops, public as $$
begin
  perform ops.require_staff(
    'staff.' || lower(tg_op),
    coalesce(new.user_id, old.user_id)::text || ':' || coalesce(new.role, old.role),
    null, 'owner');
  return coalesce(new, old);
end $$;
create trigger staff_audited after insert or update or delete on ops.staff
  for each row execute function ops.audit_staff_change();

revoke execute on all functions in schema ops from public, anon, authenticated;

/** Who am I to the ops functions: {role, actor}. Refuses anyone who isn't staff. */
create function public.ops_whoami() returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_role text := ops.require_staff('whoami');
begin
  return jsonb_build_object('role', v_role,
                            'actor', case when ops.from_dashboard() then 'dashboard' else 'staff' end);
end $$;

revoke execute on function public.ops_whoami() from public, anon;
grant execute on function public.ops_whoami() to authenticated;
