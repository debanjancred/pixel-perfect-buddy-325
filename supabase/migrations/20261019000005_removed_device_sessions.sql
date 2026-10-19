-- Removed devices lose access on the server, not only in the app (security pass, 2026-10-19).
-- Each device remembers the login session it last checked in with. Once the device is removed
-- (a lost phone, or to make room for a new one), requests from that session:
--   - read nothing: is_member() is false, so every select policy and voucher read refuses;
--   - change nothing: no voids, members, events, clubs or device settings;
--   - may still add chanda, expenses and cash handovers, because that cash was really
--     taken or paid offline. They are accepted, flagged `off_device` for the committee.
-- Devices that haven't checked in since this migration have no session recorded yet; they are
-- covered from their next app open.

alter table public.user_devices add column session_id uuid;
create index user_devices_session on public.user_devices (session_id) where session_id is not null;
alter table public.expense_records add column off_device boolean not null default false;
alter table public.cash_handovers add column off_device boolean not null default false;

/** The Supabase Auth session of this request (the JWT's session_id claim), if any. */
create function public.jwt_session() returns uuid
language sql stable set search_path = public as $$
  select case when s ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
              then s::uuid end
  from (select auth.jwt() ->> 'session_id' as s) x
$$;

/** True when this request comes from the session of a device its owner removed. */
create function public.removed_session() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.user_devices
    where session_id = public.jwt_session() and removed_at is not null
  )
$$;

create or replace function public.is_member(p_club uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select public.my_member_id(p_club) is not null and not public.removed_session()
$$;

/**
 * Mirror of ROLE_PERMISSIONS in src/lib/permissions.ts: collectors add chanda; treasurers
 * also add expenses, void and receive handovers; admins do everything. A removed device's
 * session keeps only the three that record money already taken or paid.
 */
create or replace function public.can(p_club uuid, p_permission text) returns boolean
language sql stable security definer set search_path = public as $$
  select (not public.removed_session()
          or p_permission in ('chanda.add', 'expense.add', 'handover.record'))
    and coalesce((
      select case p_permission
        when 'chanda.add' then true
        when 'expense.add' then m.role in ('admin', 'treasurer')
        when 'entry.void' then m.role in ('admin', 'treasurer')
        when 'handover.record' then m.role in ('admin', 'treasurer')
        when 'member.manage' then m.role = 'admin'
        when 'event.manage' then m.role = 'admin'
        else false
      end
      from public.club_members m
      where m.club_id = p_club and m.phone = public.auth_phone()
    ), false)
$$;

/** The caller's phone, or err_forbidden when signed out or on a removed device. */
create or replace function public.require_phone() returns text
language plpgsql stable set search_path = public as $$
declare
  v_phone text := public.auth_phone();
begin
  if v_phone is null or public.removed_session() then
    raise exception 'err_forbidden' using errcode = 'P0001';
  end if;
  return v_phone;
end $$;

/**
 * As before (…_devices.sql), and also records the session the device uses, so removing the
 * device cuts that session off. A removed device checking in still gets {status: 'removed'}
 * (it must not be refused) and signs itself out after sending what it has.
 */
create or replace function public.touch_device(p_device uuid, p_label text, p_login boolean)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_phone text := public.auth_phone();
  v_row public.user_devices;
begin
  if v_phone is null then
    raise exception 'err_forbidden' using errcode = 'P0001';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('device:' || v_phone, 0));
  select * into v_row from public.user_devices where phone = v_phone and id = p_device;
  if found and v_row.removed_at is null then
    update public.user_devices
       set last_seen_at = now(), label = btrim(p_label),
           session_id = coalesce(public.jwt_session(), session_id)
     where phone = v_phone and id = p_device;
  elsif found and not p_login then
    return jsonb_build_object('status', 'removed');
  else
    if (select count(*) from public.user_devices
        where phone = v_phone and removed_at is null) >= 3 then
      if p_login then
        raise exception 'err_deviceLimit' using errcode = 'P0001';
      end if;
      return jsonb_build_object('status', 'limit');
    end if;
    insert into public.user_devices (phone, id, label, session_id)
    values (v_phone, p_device, btrim(p_label), public.jwt_session())
    on conflict (phone, id) do update
      set removed_at = null, label = excluded.label, session_id = excluded.session_id,
          created_at = now(), last_seen_at = now();
  end if;
  if (select count(*) from public.user_devices where phone = v_phone and removed_at is null) = 1
  then
    update public.user_devices set is_collect = true where phone = v_phone and id = p_device;
  end if;
  return public.device_state(v_phone, p_device);
end $$;

/** Entries from a removed device's session are accepted but flagged for review. */
create function public.flag_removed_session_entry() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_table_name = 'chanda_transactions' then
    -- Runs after chanda_flag_off_device (triggers fire in name order); keeps its verdict.
    new.off_device := new.off_device or public.removed_session();
  else
    new.off_device := public.removed_session();
  end if;
  return new;
end $$;

create trigger chanda_flag_removed_session before insert on public.chanda_transactions
  for each row execute function public.flag_removed_session_entry();
create trigger expenses_flag_removed_session before insert on public.expense_records
  for each row execute function public.flag_removed_session_entry();
create trigger handovers_flag_removed_session before insert on public.cash_handovers
  for each row execute function public.flag_removed_session_entry();

/** No new clubs from a removed device (create_club checks only that someone is signed in). */
create function public.refuse_removed_session() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if public.removed_session() then
    raise exception 'err_forbidden' using errcode = 'P0001';
  end if;
  return new;
end $$;

create trigger clubs_refuse_removed_session before insert on public.clubs
  for each row execute function public.refuse_removed_session();

-- New functions get no automatic grants (…_security_hardening.sql); these are internal.
revoke execute on function public.jwt_session(), public.removed_session(),
  public.flag_removed_session_entry(), public.refuse_removed_session() from public;
