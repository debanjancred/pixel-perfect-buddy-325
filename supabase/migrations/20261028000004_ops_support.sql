-- Support functions (ADR 0002 §4). Every one goes through ops.require_staff, so each call is
-- checked and written to ops.audit_log. None of them edits, voids or deletes money entries,
-- changes roles or acts as a user; device actions and reading a club's entries need a reason
-- (normally a ticket). The audit log keeps ids, not personal details: phone lookups are
-- logged with a masked number. Until the owner console exists, run them in the SQL editor
-- (docs/BACKEND.md has a cookbook).

/** 10 digits from however the phone was typed (+91, spaces …), or err_phone. */
create function ops.clean_phone(p_phone text) returns text
language plpgsql immutable set search_path = ops as $$
declare
  v text := right(regexp_replace(coalesce(p_phone, ''), '\D', '', 'g'), 10);
begin
  if v !~ '^[6-9][0-9]{9}$' then
    raise exception 'err_phone' using errcode = 'P0001';
  end if;
  return v;
end $$;

/** How a phone appears in the audit log. */
create function ops.masked(p_phone text) returns text
language sql immutable set search_path = ops as $$
  select 'xxxxxx' || right(p_phone, 4)
$$;

/** Clubs whose slug or name contains p_query (up to 20), to find a club's id. */
create function public.ops_find_club(p_query text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_q text := btrim(coalesce(p_query, ''));
begin
  perform ops.require_staff('club.find', left(v_q, 100));
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', c.id, 'slug', c.slug, 'name_bn', c.name_bn, 'name_en', c.name_en,
      'puja_year', c.puja_year, 'created_at', c.created_at,
      'members', (select count(*) from public.club_members m where m.club_id = c.id))
      order by c.created_at desc)
    from (select * from public.clubs
          where v_q <> '' and (slug ilike '%' || v_q || '%' or name_bn ilike '%' || v_q || '%'
                               or name_en ilike '%' || v_q || '%')
          order by created_at desc limit 20) c), '[]'::jsonb);
end $$;

/** A person by phone: their clubs and roles, devices, and last login. */
create function public.ops_find_person(p_phone text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_phone text := ops.clean_phone(p_phone);
begin
  perform ops.require_staff('person.find', ops.masked(v_phone));
  return jsonb_build_object(
    'phone', v_phone,
    'last_sign_in_at', (select max(u.last_sign_in_at) from auth.users u
                        where right(u.phone, 10) = v_phone),
    'clubs', coalesce((
      select jsonb_agg(jsonb_build_object(
        'club_id', c.id, 'slug', c.slug, 'club', c.name_bn, 'member_id', m.id, 'name', m.name,
        'role', m.role, 'collector_code', m.collector_code) order by c.created_at)
      from public.club_members m join public.clubs c on c.id = m.club_id
      where m.phone = v_phone), '[]'::jsonb),
    'devices', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', d.id, 'label', d.label, 'is_collect', d.is_collect, 'created_at', d.created_at,
        'last_seen_at', d.last_seen_at, 'removed_at', d.removed_at)
        order by d.removed_at nulls first, d.last_seen_at desc)
      from public.user_devices d where d.phone = v_phone), '[]'::jsonb));
end $$;

/**
 * A club's health: members per role, households, totals, entries per day (14 days), members'
 * devices, entries flagged off_device, and sync failures (7 days) grouped by error.
 */
create function public.ops_club_health(p_club uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_club public.clubs;
begin
  perform ops.require_staff('club.health', p_club::text);
  select * into v_club from public.clubs where id = p_club;
  if not found then
    raise exception 'err_notFound' using errcode = 'P0001';
  end if;
  return jsonb_build_object(
    'club', jsonb_build_object('id', v_club.id, 'slug', v_club.slug, 'name_bn', v_club.name_bn,
      'name_en', v_club.name_en, 'puja_year', v_club.puja_year, 'created_at', v_club.created_at),
    'members', (select jsonb_object_agg(role, n) from (
      select role, count(*) as n from public.club_members where club_id = p_club group by role) r),
    'households', (select count(*) from public.households where club_id = p_club),
    'summary', public.public_accounts(v_club.slug) -> 'summary',
    'entries', jsonb_build_object(
      'chanda', (select count(*) from public.chanda_transactions where club_id = p_club),
      'chanda_voided', (select count(*) from public.chanda_transactions
                        where club_id = p_club and voided_at is not null),
      'expenses', (select count(*) from public.expense_records where club_id = p_club),
      'handovers', (select count(*) from public.cash_handovers where club_id = p_club)),
    'off_device', jsonb_build_object(
      'chanda', (select count(*) from public.chanda_transactions
                 where club_id = p_club and off_device),
      'expenses', (select count(*) from public.expense_records
                   where club_id = p_club and off_device),
      'handovers', (select count(*) from public.cash_handovers
                    where club_id = p_club and off_device)),
    'activity_14d', (
      select jsonb_agg(jsonb_build_object('day', d.day,
        'chanda', (select count(*) from public.chanda_transactions c
                   where c.club_id = p_club and c.created_at::date = d.day),
        'expenses', (select count(*) from public.expense_records e
                     where e.club_id = p_club and e.created_at::date = d.day)) order by d.day)
      from (select generate_series(current_date - 13, current_date, interval '1 day')::date
              as day) d),
    'devices', coalesce((
      select jsonb_agg(jsonb_build_object(
        'member', m.name, 'role', m.role, 'collector_code', m.collector_code,
        'devices', coalesce((
          select jsonb_agg(jsonb_build_object('label', d.label, 'is_collect', d.is_collect,
            'last_seen_at', d.last_seen_at) order by d.last_seen_at desc)
          from public.user_devices d where d.phone = m.phone and d.removed_at is null),
          '[]'::jsonb)) order by m.collector_code)
      from public.club_members m where m.club_id = p_club), '[]'::jsonb),
    'sync_failures_7d', coalesce((
      select jsonb_agg(jsonb_build_object('error_key', error_key, 'entity_type', entity_type,
        'app_version', app_version, 'count', n, 'devices', devices, 'last_at', last_at)
        order by n desc)
      from (select error_key, entity_type, app_version, count(*) as n,
                   count(distinct device_id) as devices, max(created_at) as last_at
            from public.client_events
            where club_id = p_club and created_at > now() - interval '7 days'
            group by 1, 2, 3) f), '[]'::jsonb));
end $$;

/** Clears a person's collect device; they pick one again on the phone they now use. */
create function public.ops_reset_collect_device(p_phone text, p_reason text) returns integer
language plpgsql security definer set search_path = public as $$
declare
  v_phone text := ops.clean_phone(p_phone);
  v_count integer;
begin
  perform ops.require_staff('device.reset_collect', ops.masked(v_phone), p_reason, 'support', true);
  update public.user_devices set is_collect = false where phone = v_phone and is_collect;
  get diagnostics v_count = row_count;
  return v_count;
end $$;

/**
 * Signs out one of a person's devices (a lost phone). The server then refuses that device's
 * session (…_removed_device_sessions.sql); cash it recorded offline is still accepted, flagged.
 */
create function public.ops_remove_device(p_phone text, p_device uuid, p_reason text)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_phone text := ops.clean_phone(p_phone);
begin
  perform ops.require_staff('device.remove', ops.masked(v_phone) || ':' || p_device::text,
                            p_reason, 'support', true);
  update public.user_devices set removed_at = now(), is_collect = false
   where phone = v_phone and id = p_device and removed_at is null;
  if not found then
    raise exception 'err_notFound' using errcode = 'P0001';
  end if;
end $$;

/** A club's latest entries with names and amounts (read-only; up to p_limit of each kind). */
create function public.ops_club_entries(p_club uuid, p_reason text, p_limit integer default 50)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_limit integer := least(greatest(coalesce(p_limit, 50), 1), 200);
begin
  perform ops.require_staff('club.read_entries', p_club::text, p_reason, 'support', true);
  if not exists (select 1 from public.clubs where id = p_club) then
    raise exception 'err_notFound' using errcode = 'P0001';
  end if;
  return jsonb_build_object(
    'chanda', coalesce((
      select jsonb_agg(x order by x ->> 'created_at' desc) from (
        select jsonb_build_object('id', c.id, 'receipt_no', c.receipt_no,
          'created_at', c.created_at, 'amount', c.amount, 'method', c.payment_method,
          'status', c.status, 'void_reason', c.void_reason, 'household', h.resident_name,
          'house', h.house_flat_no, 'lane', h.lane_block, 'collector', m.name,
          'device_id', c.device_id, 'off_device', c.off_device) as x
        from public.chanda_transactions c
        join public.households h on h.id = c.household_id
        join public.club_members m on m.id = c.collector_id
        where c.club_id = p_club order by c.created_at desc limit v_limit) s), '[]'::jsonb),
    'expenses', coalesce((
      select jsonb_agg(x order by x ->> 'created_at' desc) from (
        select jsonb_build_object('id', e.id, 'date', e.date, 'created_at', e.created_at,
          'title', e.title, 'category', e.category, 'amount', e.amount, 'paid_to', e.paid_to,
          'authorized_by', m.name, 'void_reason', e.void_reason,
          'off_device', e.off_device) as x
        from public.expense_records e join public.club_members m on m.id = e.authorized_by_id
        where e.club_id = p_club order by e.created_at desc limit v_limit) s), '[]'::jsonb),
    'handovers', coalesce((
      select jsonb_agg(x order by x ->> 'created_at' desc) from (
        select jsonb_build_object('id', h.id, 'created_at', h.created_at, 'amount', h.amount,
          'collector', c.name, 'received_by', r.name, 'void_reason', h.void_reason,
          'off_device', h.off_device) as x
        from public.cash_handovers h
        join public.club_members c on c.id = h.collector_id
        join public.club_members r on r.id = h.received_by_id
        where h.club_id = p_club order by h.created_at desc limit v_limit) s), '[]'::jsonb));
end $$;

revoke execute on all functions in schema ops from public, anon, authenticated;
revoke execute on function public.ops_find_club(text), public.ops_find_person(text),
  public.ops_club_health(uuid), public.ops_reset_collect_device(text, text),
  public.ops_remove_device(text, uuid, text), public.ops_club_entries(uuid, text, integer)
  from public, anon;
grant execute on function public.ops_find_club(text), public.ops_find_person(text),
  public.ops_club_health(uuid), public.ops_reset_collect_device(text, text),
  public.ops_remove_device(text, uuid, text), public.ops_club_entries(uuid, text, integer)
  to authenticated;
