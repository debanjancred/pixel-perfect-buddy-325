-- Client events (ADR 0002 §2): why records failed to sync, reported by the phone when it next
-- reaches the server, so the owner sees a broken release or a wrong server rule before anyone
-- calls. Network failures are never reported (weak signal is normal, not a fault).
--
-- Keys and ids only: no phone numbers, names, amounts or record contents. Nobody reads this
-- table through the API — not even the reporter; staff will, through the ops functions
-- (ADR 0002 §4). Until then, read it in the Supabase SQL editor.

create table public.client_events (
  id uuid primary key, -- made on the phone: a retried report is stored once
  created_at timestamptz not null default now(),
  kind text not null check (kind in ('sync_failed')),
  error_key text not null check (error_key ~ '^err_[A-Za-z]{1,60}$'),
  entity_type text not null check (entity_type in ('club', 'member', 'household', 'event',
    'event_update', 'chanda', 'expense', 'handover', 'event_delta')),
  record_id uuid not null,
  app_version text not null check (app_version ~ '^[0-9]+\.[0-9]+\.[0-9]+$'),
  device_id uuid not null,
  club_id uuid not null references public.clubs (id) on delete cascade,
  member_id uuid references public.club_members (id) on delete set null
);
create index client_events_device_time on public.client_events (device_id, created_at);
create index client_events_created on public.client_events (created_at);
create index client_events_record on public.client_events (record_id);

alter table public.client_events enable row level security;
-- No policies and no grants: written only by log_client_events, read by nobody via the API.
revoke all on public.client_events from anon, authenticated;

/**
 * Stores the caller's failure reports for one of their own devices (removed ones too: a lost
 * phone still sends what it has before signing out). p_events is an array of
 * {id, kind, error_key, entity_type, record_id, club_id}. Reports for clubs the caller isn't
 * a member of, or with unknown kinds or keys, are skipped rather than refused, so one bad
 * report never blocks the rest. Each device stores at most 50 a day. Returns how many were
 * stored.
 */
create function public.log_client_events(p_device uuid, p_app_version text, p_events jsonb)
returns integer
language plpgsql security definer set search_path = public as $$
declare
  v_phone text := public.auth_phone();
  v_room integer;
  v_stored integer;
begin
  if v_phone is null then
    raise exception 'err_forbidden' using errcode = 'P0001';
  end if;
  if not exists (select 1 from public.user_devices where phone = v_phone and id = p_device)
     or coalesce(p_app_version, '') !~ '^[0-9]+\.[0-9]+\.[0-9]+$'
     or jsonb_typeof(p_events) is distinct from 'array' then
    return 0;
  end if;
  perform pg_advisory_xact_lock(hashtextextended('client_events:' || p_device, 0));
  v_room := 50 - (select count(*) from public.client_events
                  where device_id = p_device and created_at > now() - interval '1 day');
  if v_room <= 0 then
    return 0;
  end if;
  insert into public.client_events
    (id, kind, error_key, entity_type, record_id, app_version, device_id, club_id, member_id)
  select e.id, e.kind, e.error_key, e.entity_type, e.record_id, p_app_version, p_device,
         e.club_id, public.my_member_id(e.club_id)
  from rows from (jsonb_to_recordset(p_events) as (id uuid, kind text, error_key text,
         entity_type text, record_id uuid, club_id uuid)) with ordinality
    as e(id, kind, error_key, entity_type, record_id, club_id, n)
  where e.id is not null and e.record_id is not null
    and e.kind = 'sync_failed'
    and e.error_key ~ '^err_[A-Za-z]{1,60}$'
    and e.entity_type in ('club', 'member', 'household', 'event', 'event_update', 'chanda',
      'expense', 'handover', 'event_delta')
    and public.my_member_id(e.club_id) is not null
  order by e.n
  limit v_room
  on conflict (id) do nothing;
  get diagnostics v_stored = row_count;
  return v_stored;
end $$;

revoke execute on function public.log_client_events(uuid, text, jsonb) from public, anon;
grant execute on function public.log_client_events(uuid, text, jsonb) to authenticated;
