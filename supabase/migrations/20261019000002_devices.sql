-- Devices: each person (by phone, like club_members) may be signed in on up to 3 devices, and
-- collects chanda on exactly one of them — so a person's receipt numbers come from one
-- sequence on one phone and can't clash. Every other action works on all their devices.
--
-- A device is a random id the app keeps in the browser. Logging in registers it (a 4th
-- device must remove one first: err_deviceLimit); each app open checks in, and a device
-- removed from another one signs itself out after sending what it still has. Chanda
-- recorded on a device that is not (or no longer) the writer's collect device is still
-- accepted — the cash was really taken — but flagged `off_device` for the committee to see.

create table public.user_devices (
  phone text not null,
  id uuid not null,
  label text not null check (char_length(btrim(label)) between 1 and 80),
  is_collect boolean not null default false,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  removed_at timestamptz,
  primary key (phone, id),
  check (not (is_collect and removed_at is not null))
);
create unique index user_devices_one_collect on public.user_devices (phone) where is_collect;

alter table public.user_devices enable row level security;
-- Read-only to the app: every change goes through the functions below.
revoke all on public.user_devices from anon, authenticated;
grant select on public.user_devices to authenticated;
create policy devices_read on public.user_devices for select to authenticated
  using (phone = public.auth_phone() and removed_at is null);

alter table public.chanda_transactions
  add column device_id uuid,
  add column off_device boolean not null default false;

/** The caller's phone, or err_forbidden when signed out. */
create function public.require_phone() returns text
language plpgsql stable as $$
declare
  v_phone text := public.auth_phone();
begin
  if v_phone is null then
    raise exception 'err_forbidden' using errcode = 'P0001';
  end if;
  return v_phone;
end $$;

/** What a device needs to know about itself. */
create function public.device_state(p_phone text, p_device uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'status', 'active',
    'is_collect', d.is_collect,
    'collect_label', (select c.label from public.user_devices c
                      where c.phone = p_phone and c.is_collect)
  )
  from public.user_devices d
  where d.phone = p_phone and d.id = p_device
$$;

/**
 * Registers (p_login) or checks in a device. Returns {status: 'active', is_collect,
 * collect_label}, or on a check-in {status: 'removed'} for a device removed elsewhere and
 * {status: 'limit'} for an unknown device when 3 are already in use. A login over the limit
 * raises err_deviceLimit; a login on a removed device brings it back. A person's only device
 * becomes their collect device; with several, they choose (set_collect_device).
 */
create function public.touch_device(p_device uuid, p_label text, p_login boolean)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_phone text := public.require_phone();
  v_row public.user_devices;
begin
  perform pg_advisory_xact_lock(hashtextextended('device:' || v_phone, 0));
  select * into v_row from public.user_devices where phone = v_phone and id = p_device;
  if found and v_row.removed_at is null then
    update public.user_devices set last_seen_at = now(), label = btrim(p_label)
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
    insert into public.user_devices (phone, id, label) values (v_phone, p_device, btrim(p_label))
    on conflict (phone, id) do update
      set removed_at = null, label = excluded.label, created_at = now(), last_seen_at = now();
  end if;
  if (select count(*) from public.user_devices where phone = v_phone and removed_at is null) = 1
  then
    update public.user_devices set is_collect = true where phone = v_phone and id = p_device;
  end if;
  return public.device_state(v_phone, p_device);
end $$;

/** Makes one of the caller's own devices their collect device (online only). */
create function public.set_collect_device(p_device uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_phone text := public.require_phone();
begin
  perform pg_advisory_xact_lock(hashtextextended('device:' || v_phone, 0));
  if not exists (select 1 from public.user_devices
                 where phone = v_phone and id = p_device and removed_at is null) then
    raise exception 'err_notFound' using errcode = 'P0001';
  end if;
  -- Two statements: the one-collect index is checked row by row.
  update public.user_devices set is_collect = false where phone = v_phone and is_collect;
  update public.user_devices set is_collect = true where phone = v_phone and id = p_device;
  return public.device_state(v_phone, p_device);
end $$;

/** Signs one of the caller's devices out (it notices on its next check-in). */
create function public.remove_device(p_device uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_phone text := public.require_phone();
begin
  update public.user_devices set removed_at = now(), is_collect = false
   where phone = v_phone and id = p_device and removed_at is null;
end $$;

/**
 * Admin: clears a member's collect device (a lost phone, or a member who needs help). The
 * member then picks one on the device they collect with.
 */
create function public.reset_collect_device(p_member uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_member public.club_members;
begin
  select * into v_member from public.club_members where id = p_member;
  if not found or not public.can(v_member.club_id, 'member.manage') then
    raise exception 'err_forbidden' using errcode = 'P0001';
  end if;
  update public.user_devices set is_collect = false where phone = v_member.phone and is_collect;
end $$;

revoke execute on function public.touch_device(uuid, text, boolean), public.set_collect_device(uuid),
  public.remove_device(uuid), public.reset_collect_device(uuid),
  public.device_state(text, uuid) from public, anon;
grant execute on function public.touch_device(uuid, text, boolean), public.set_collect_device(uuid),
  public.remove_device(uuid), public.reset_collect_device(uuid) to authenticated;

/** The server decides off_device: the writer's current collect device, or flagged. */
create function public.flag_off_device_chanda() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  new.off_device := not exists (
    select 1 from public.user_devices
     where phone = public.auth_phone() and id = new.device_id and is_collect
  );
  return new;
end $$;

create trigger chanda_flag_off_device before insert on public.chanda_transactions
  for each row execute function public.flag_off_device_chanda();
