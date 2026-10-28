-- Help requests (ADR 0002 §7): Settings → Help lets a member report a problem with optional
-- device details. The phone saves it first and sends it on the next sync, like any entry.
-- Members see only their own requests and can't change them; staff list and close them
-- through the ops functions (each call logged). Device details are cleared after 90 days.

create table public.support_tickets (
  id uuid primary key, -- made on the phone: a resent request is stored once
  club_id uuid not null references public.clubs (id) on delete cascade,
  member_id uuid references public.club_members (id) on delete set null,
  phone text not null check (phone ~ '^[6-9][0-9]{9}$'), -- to call the member back
  category text not null check (category in ('login', 'sync', 'device', 'entry', 'other')),
  message text not null check (char_length(btrim(message)) between 10 and 1000),
  diagnostics jsonb check (jsonb_typeof(diagnostics) = 'object'
                           and pg_column_size(diagnostics) <= 2000),
  status text not null default 'open' check (status in ('open', 'closed')),
  staff_note text check (char_length(staff_note) <= 300),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  closed_at timestamptz,
  check ((status = 'closed') = (closed_at is not null))
);
create index support_tickets_phone on public.support_tickets (phone, created_at);
create index support_tickets_open on public.support_tickets (created_at) where status = 'open';

create trigger support_tickets_updated_at before update on public.support_tickets
  for each row execute function public.set_updated_at();

alter table public.support_tickets enable row level security;
-- Read-only to the app, and only your own: requests are created by submit_support_ticket.
revoke all on public.support_tickets from anon, authenticated;
grant select on public.support_tickets to authenticated;
create policy support_tickets_own on public.support_tickets for select to authenticated
  using (phone = public.auth_phone());

/**
 * Stores a help request from a member of p_club. Sending the same id again returns quietly
 * (a retry after a lost connection). At most 10 a day per person (err_ticketLimit).
 */
create function public.submit_support_ticket(p_id uuid, p_club uuid, p_category text,
  p_message text, p_diagnostics jsonb)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_phone text := public.require_phone();
  v_member uuid := public.my_member_id(p_club);
begin
  if v_member is null then
    raise exception 'err_forbidden' using errcode = 'P0001';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('ticket:' || v_phone, 0));
  if exists (select 1 from public.support_tickets where id = p_id and phone = v_phone) then
    return;
  end if;
  if coalesce(p_category, '') not in ('login', 'sync', 'device', 'entry', 'other') then
    raise exception 'err_ticketCategory' using errcode = 'P0001';
  end if;
  if char_length(btrim(coalesce(p_message, ''))) not between 10 and 1000 then
    raise exception 'err_ticketMessage' using errcode = 'P0001';
  end if;
  if (select count(*) from public.support_tickets
      where phone = v_phone and created_at > now() - interval '1 day') >= 10 then
    raise exception 'err_ticketLimit' using errcode = 'P0001';
  end if;
  insert into public.support_tickets (id, club_id, member_id, phone, category, message,
    diagnostics)
  values (p_id, p_club, v_member, v_phone, p_category, btrim(p_message),
    case when jsonb_typeof(p_diagnostics) = 'object' then p_diagnostics end);
end $$;

revoke execute on function public.submit_support_ticket(uuid, uuid, text, text, jsonb)
  from public, anon;
grant execute on function public.submit_support_ticket(uuid, uuid, text, text, jsonb)
  to authenticated;

/** Staff: help requests with status p_status ('open', 'closed' or 'all'), newest first. */
create function public.ops_tickets(p_status text default 'open', p_limit integer default 50)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_status text := coalesce(p_status, 'open');
begin
  perform ops.require_staff('ticket.list', v_status);
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', t.id, 'created_at', t.created_at, 'status', t.status, 'category', t.category,
      'message', t.message, 'diagnostics', t.diagnostics, 'phone', t.phone,
      'member', m.name, 'role', m.role, 'club_id', c.id, 'club', c.name_bn, 'slug', c.slug,
      'staff_note', t.staff_note, 'closed_at', t.closed_at) order by t.created_at desc)
    from (select * from public.support_tickets
          where v_status = 'all' or status = v_status
          order by created_at desc
          limit least(greatest(coalesce(p_limit, 50), 1), 200)) t
    join public.clubs c on c.id = t.club_id
    left join public.club_members m on m.id = t.member_id), '[]'::jsonb);
end $$;

/** Staff: closes a request with a short note (5+ characters) the member sees. */
create function public.ops_close_ticket(p_id uuid, p_note text) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform ops.require_staff('ticket.close', p_id::text, p_note, 'support', true);
  update public.support_tickets
     set status = 'closed', closed_at = now(), staff_note = left(btrim(p_note), 300)
   where id = p_id and status = 'open';
  if not found then
    raise exception 'err_notFound' using errcode = 'P0001';
  end if;
end $$;

revoke execute on function public.ops_tickets(text, integer), public.ops_close_ticket(uuid, text)
  from public, anon;
grant execute on function public.ops_tickets(text, integer), public.ops_close_ticket(uuid, text)
  to authenticated;

/** Clears device details from requests older than 90 days; returns how many. Daily. */
create function public.purge_ticket_diagnostics() returns integer
language plpgsql security definer set search_path = public as $$
declare
  v_count integer;
begin
  update public.support_tickets set diagnostics = null
   where diagnostics is not null and created_at < now() - interval '90 days';
  get diagnostics v_count = row_count;
  return v_count;
end $$;

revoke execute on function public.purge_ticket_diagnostics() from public, anon, authenticated;

do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    -- 21:40 UTC = 03:10 in India, after the client_events purge.
    perform cron.schedule('purge-ticket-diagnostics', '40 21 * * *',
      'select public.purge_ticket_diagnostics()');
  else
    raise notice 'pg_cron is not installed: purge_ticket_diagnostics() is not scheduled';
  end if;
end $$;

-- A help request that fails to send is reported like any other record (client_events).
alter table public.client_events drop constraint client_events_entity_type_check;
alter table public.client_events add constraint client_events_entity_type_check
  check (entity_type in ('club', 'member', 'household', 'event', 'event_update', 'chanda',
    'expense', 'handover', 'event_delta', 'ticket'));

create or replace function public.log_client_events(p_device uuid, p_app_version text,
  p_events jsonb)
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
      'expense', 'handover', 'event_delta', 'ticket')
    and public.my_member_id(e.club_id) is not null
  order by e.n
  limit v_room
  on conflict (id) do nothing;
  get diagnostics v_stored = row_count;
  return v_stored;
end $$;
