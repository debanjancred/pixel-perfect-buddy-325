-- Access control (SPEC 6.2) — the server side of src/lib/permissions.ts.
-- A signed-in user is a club member when the phone on their Supabase Auth account matches
-- a club_members row. Row-Level Security decides what they may read and write; guard
-- triggers enforce the rules policies can't express (void-only updates, last admin,
-- handover limits). Errors use the app's i18n keys as the message.

-- ---------------------------------------------------------------------------------------
-- Identity helpers
-- ---------------------------------------------------------------------------------------

/** 10-digit phone of the signed-in user (Supabase stores E.164 without "+", e.g. 9198…). */
create function public.auth_phone() returns text
language sql stable as $$
  select case when length(d) >= 10 then right(d, 10) end
  from (select regexp_replace(coalesce(auth.jwt() ->> 'phone', ''), '\D', '', 'g') as d) x
$$;

/** The signed-in user's member row in a club, if any. */
create function public.my_member_id(p_club uuid) returns uuid
language sql stable security definer set search_path = public as $$
  select id from public.club_members where club_id = p_club and phone = public.auth_phone()
$$;

create function public.is_member(p_club uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select public.my_member_id(p_club) is not null
$$;

/**
 * Mirror of ROLE_PERMISSIONS in src/lib/permissions.ts: collectors add chanda; treasurers
 * also add expenses, void and receive handovers; admins do everything.
 */
create function public.can(p_club uuid, p_permission text) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((
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

-- ---------------------------------------------------------------------------------------
-- Row-Level Security
-- ---------------------------------------------------------------------------------------

alter table public.clubs enable row level security;
alter table public.club_members enable row level security;
alter table public.households enable row level security;
alter table public.chanda_transactions enable row level security;
alter table public.expense_records enable row level security;
alter table public.cash_handovers enable row level security;
alter table public.club_events enable row level security;

revoke all on all tables in schema public from anon;
grant select on all tables in schema public to authenticated;
grant insert on public.club_members, public.households, public.chanda_transactions,
  public.expense_records, public.cash_handovers, public.club_events to authenticated;
grant update on public.club_members, public.chanda_transactions, public.expense_records,
  public.cash_handovers to authenticated;

-- Members see their club's data. Clubs are created only through create_club().
create policy clubs_read on public.clubs for select to authenticated using (public.is_member(id));

create policy members_read on public.club_members for select to authenticated
  using (public.is_member(club_id));
create policy members_add on public.club_members for insert to authenticated
  with check (public.can(club_id, 'member.manage'));
create policy members_edit on public.club_members for update to authenticated
  using (public.can(club_id, 'member.manage')) with check (public.can(club_id, 'member.manage'));

create policy households_read on public.households for select to authenticated
  using (public.is_member(club_id));
create policy households_add on public.households for insert to authenticated
  with check (public.can(club_id, 'chanda.add'));

create policy chanda_read on public.chanda_transactions for select to authenticated
  using (public.is_member(club_id));
create policy chanda_add on public.chanda_transactions for insert to authenticated
  with check (public.can(club_id, 'chanda.add'));
create policy chanda_void on public.chanda_transactions for update to authenticated
  using (public.can(club_id, 'entry.void')) with check (public.can(club_id, 'entry.void'));

create policy expenses_read on public.expense_records for select to authenticated
  using (public.is_member(club_id));
create policy expenses_add on public.expense_records for insert to authenticated
  with check (public.can(club_id, 'expense.add'));
create policy expenses_void on public.expense_records for update to authenticated
  using (public.can(club_id, 'entry.void')) with check (public.can(club_id, 'entry.void'));

create policy handovers_read on public.cash_handovers for select to authenticated
  using (public.is_member(club_id));
-- The receiver is always the signed-in treasurer/admin recording it.
create policy handovers_add on public.cash_handovers for insert to authenticated
  with check (public.can(club_id, 'handover.record')
              and received_by_id = public.my_member_id(club_id));
create policy handovers_void on public.cash_handovers for update to authenticated
  using (public.can(club_id, 'entry.void')) with check (public.can(club_id, 'entry.void'));

create policy events_read on public.club_events for select to authenticated
  using (public.is_member(club_id));
create policy events_add on public.club_events for insert to authenticated
  with check (public.can(club_id, 'event.manage'));

-- ---------------------------------------------------------------------------------------
-- Guard triggers
-- ---------------------------------------------------------------------------------------

/**
 * Ledger rows are never edited, only voided once (SPEC 2.3). An update that only repeats
 * the stored values is a no-op, so an offline client re-pushing a synced row is harmless.
 */
create function public.guard_void_only() returns trigger
language plpgsql as $$
declare
  fixed constant text[] := array['voided_at', 'void_reason', 'status', 'updated_at'];
begin
  if (to_jsonb(new) - 'updated_at') = (to_jsonb(old) - 'updated_at') then
    return old;
  end if;
  if (to_jsonb(new) - fixed) <> (to_jsonb(old) - fixed) then
    raise exception 'err_immutable' using errcode = 'P0001';
  end if;
  if old.voided_at is not null then
    raise exception 'err_alreadyVoid' using errcode = 'P0001';
  end if;
  if new.voided_at is null then
    raise exception 'err_immutable' using errcode = 'P0001';
  end if;
  return new;
end $$;

create trigger chanda_void_only before update on public.chanda_transactions
  for each row execute function public.guard_void_only();
create trigger expenses_void_only before update on public.expense_records
  for each row execute function public.guard_void_only();
create trigger handovers_void_only before update on public.cash_handovers
  for each row execute function public.guard_void_only();

/** Only name and role change on a member; the club always keeps an admin. */
create function public.guard_member_update() returns trigger
language plpgsql as $$
begin
  if new.club_id <> old.club_id or new.phone <> old.phone
     or new.collector_code <> old.collector_code then
    raise exception 'err_immutable' using errcode = 'P0001';
  end if;
  if old.role = 'admin' and new.role <> 'admin' and (
    select count(*) from public.club_members where club_id = old.club_id and role = 'admin'
  ) = 1 then
    raise exception 'err_lastAdmin' using errcode = 'P0001';
  end if;
  return new;
end $$;

create trigger members_guard before update on public.club_members
  for each row execute function public.guard_member_update();

/** Expenses are authorised by a treasurer/admin and dated today or earlier (India time). */
create function public.guard_expense_insert() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if not exists (
    select 1 from public.club_members
    where id = new.authorized_by_id and club_id = new.club_id and role in ('admin', 'treasurer')
  ) then
    raise exception 'err_authorizer' using errcode = 'P0001';
  end if;
  if new.date > (now() at time zone 'Asia/Kolkata')::date then
    raise exception 'err_dateFuture' using errcode = 'P0001';
  end if;
  return new;
end $$;

create trigger expenses_guard before insert on public.expense_records
  for each row execute function public.guard_expense_insert();

/** A handover never exceeds the cash the collector still holds (SPEC 6.3). */
create function public.guard_handover_insert() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  outstanding integer;
begin
  -- Same message as the app; the handover_not_self constraint stays as a backstop.
  if new.collector_id = new.received_by_id then
    raise exception 'err_handoverSelf' using errcode = 'P0001';
  end if;
  -- Serialise handovers per collector so two treasurers can't both take the same cash.
  perform 1 from public.club_members where id = new.collector_id for update;
  select
    coalesce((select sum(amount) from public.chanda_transactions
              where collector_id = new.collector_id and status = 'collected'
                and payment_method = 'cash' and voided_at is null), 0)
    - coalesce((select sum(amount) from public.cash_handovers
                where collector_id = new.collector_id and voided_at is null), 0)
  into outstanding;
  if new.amount > outstanding then
    raise exception 'err_handoverTooMuch' using errcode = 'P0001';
  end if;
  return new;
end $$;

create trigger handovers_guard before insert on public.cash_handovers
  for each row execute function public.guard_handover_insert();

-- ---------------------------------------------------------------------------------------
-- Server functions
-- ---------------------------------------------------------------------------------------

/**
 * Creates a club with the signed-in user as its admin, atomically (the client-side
 * createClub() mirror). Idempotent by id, so an offline-created club can be re-sent.
 * The slug is made unique here; the returned row carries the final slug.
 */
create function public.create_club(
  p_id uuid, p_slug text, p_name text, p_area text, p_target integer, p_year integer,
  p_creator_member_id uuid, p_creator_name text
) returns public.clubs
language plpgsql security definer set search_path = public as $$
declare
  v_phone text := public.auth_phone();
  v_slug text := p_slug;
  v_n integer := 2;
  result public.clubs;
begin
  if v_phone is null then
    raise exception 'err_forbidden' using errcode = 'P0001';
  end if;
  select * into result from public.clubs where id = p_id;
  if found then
    return result;
  end if;
  if exists (
    select 1 from public.clubs
    where puja_year = p_year
      and lower(regexp_replace(btrim(name_bn), '\s+', ' ', 'g'))
        = lower(regexp_replace(btrim(p_name), '\s+', ' ', 'g'))
  ) then
    raise exception 'err_clubExists' using errcode = 'P0001';
  end if;
  while exists (select 1 from public.clubs c where c.slug = v_slug) loop
    v_slug := p_slug || '-' || v_n;
    v_n := v_n + 1;
  end loop;
  insert into public.clubs (id, slug, name_bn, name_en, area_label, target_amount, puja_year)
  values (p_id, v_slug, btrim(p_name), btrim(p_name), coalesce(p_area, ''), p_target, p_year)
  returning * into result;
  insert into public.club_members (id, club_id, name, role, phone, collector_code)
  values (p_creator_member_id, p_id, btrim(p_creator_name), 'admin', v_phone, 'A01');
  return result;
end $$;

/** Adds `p_delta` (+1 register / −1 undo) to an event's tally; safe under concurrency. */
create function public.register_event(p_event uuid, p_delta integer) returns integer
language plpgsql security definer set search_path = public as $$
declare
  result integer;
begin
  if p_delta not in (-1, 1) then
    raise exception 'err_immutable' using errcode = 'P0001';
  end if;
  update public.club_events
     set registrations_count = greatest(0, registrations_count + p_delta)
   where id = p_event and public.is_member(club_id)
  returning registrations_count into result;
  if result is null then
    raise exception 'err_notFound' using errcode = 'P0001';
  end if;
  return result;
end $$;

/**
 * Public, read-only accounts of a club by slug (SPEC 4.1 / Phase 2 shareable link).
 * Totals only — no names, phones or households — computed exactly like computeSummary().
 */
create function public.public_accounts(p_slug text) returns jsonb
language sql stable security definer set search_path = public as $$
  with club as (select * from public.clubs where slug = p_slug),
  live as (
    select c.* from public.chanda_transactions c join club on c.club_id = club.id
    where c.voided_at is null and c.status <> 'void'
  ),
  spent as (
    select e.category, sum(e.amount)::integer as total
    from public.expense_records e join club on e.club_id = club.id
    where e.voided_at is null group by e.category
  ),
  totals as (
    select
      coalesce(sum(amount) filter (where status = 'collected'), 0)::integer as collected,
      coalesce(sum(amount) filter (where status = 'collected' and payment_method = 'cash'), 0)::integer as cash,
      coalesce(sum(amount) filter (where status = 'collected' and payment_method = 'upi'), 0)::integer as upi,
      coalesce(sum(amount) filter (where status = 'promised'), 0)::integer as promised
    from live
  )
  select jsonb_build_object(
    'club', jsonb_build_object('slug', club.slug, 'name_bn', club.name_bn, 'name_en', club.name_en,
      'area_label', club.area_label, 'puja_year', club.puja_year, 'target_amount', club.target_amount),
    'summary', jsonb_build_object(
      'total_collected', t.collected,
      'collected_cash', t.cash,
      'collected_upi', t.upi,
      'total_promised', t.promised,
      'total_expenses', coalesce((select sum(total) from spent), 0),
      'net_balance', t.collected - coalesce((select sum(total) from spent), 0),
      'collection_target', club.target_amount,
      'progress_pct', case when club.target_amount > 0
        then least(100, round(t.collected * 100.0 / club.target_amount))::integer else 0 end,
      'pending_sync_count', 0),
    'expenses_by_category', coalesce(
      (select jsonb_agg(jsonb_build_object('category', category, 'total', total)) from spent),
      '[]'::jsonb))
  from club, totals t
$$;

revoke execute on all functions in schema public from public, anon;
grant execute on function public.create_club(uuid, text, text, text, integer, integer, uuid, text),
  public.register_event(uuid, integer), public.is_member(uuid), public.can(uuid, text),
  public.my_member_id(uuid), public.auth_phone() to authenticated;
grant execute on function public.public_accounts(text) to anon, authenticated;
