-- Expenses after UAT (2026-10-28):
--   1. Own categories: a committee can type a category of its own. It is stored as 'misc' with
--      the typed name in category_name, so the six built-in categories (and their chart
--      colours) stay fixed while the app shows each name as a category of its own.
--   2. Editing: a treasurer/admin may correct an expense until the next cash handover that
--      involves the member who recorded it. After that, or once voided, it is locked: only
--      voiding is possible (SPEC 2.3 otherwise unchanged). Edits are stamped edited_at /
--      edited_by_id; the server decides who edited.

alter table public.expense_records
  add column category_name text
    check (category_name is null or char_length(btrim(category_name)) between 2 and 40),
  add column recorded_by_id uuid,
  add column edited_at timestamptz,
  add column edited_by_id uuid,
  add constraint expense_custom_is_misc check (category_name is null or category = 'misc');

-- Older expenses: the authoriser is the best guess for who recorded them. The old void-only
-- guard would refuse this update, so it goes first (the new guard is added further down).
drop trigger expenses_void_only on public.expense_records;
update public.expense_records set recorded_by_id = authorized_by_id where recorded_by_id is null;

/** The server records who wrote an expense (never trusted from the phone). */
create function public.stamp_expense_recorder() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  new.recorded_by_id := coalesce(public.my_member_id(new.club_id), new.authorized_by_id);
  new.edited_at := null;
  new.edited_by_id := null;
  return new;
end $$;
create trigger expenses_stamp_recorder before insert on public.expense_records
  for each row execute function public.stamp_expense_recorder();

/** True once a non-voided handover involving the recorder came after the expense. */
create function public.expense_locked(p_expense public.expense_records) returns boolean
language sql stable security definer set search_path = public as $$
  select p_expense.voided_at is not null or exists (
    select 1 from public.cash_handovers h
    where h.club_id = p_expense.club_id
      and h.voided_at is null
      and h.created_at > p_expense.created_at
      and coalesce(p_expense.recorded_by_id, p_expense.authorized_by_id)
          in (h.collector_id, h.received_by_id)
  )
$$;

/**
 * Updates to an expense are either a void (as before) or an edit of its details by a
 * treasurer/admin while it isn't locked — never both at once. Re-sending stored values is a
 * no-op, so an offline phone re-pushing a synced row is harmless.
 */
create function public.guard_expense_update() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  void_fields constant text[] := array['voided_at', 'void_reason', 'updated_at'];
  edit_fields constant text[] := array['category', 'category_name', 'title', 'amount',
    'paid_to', 'date', 'authorized_by_id', 'edited_at', 'edited_by_id', 'updated_at'];
  v_new jsonb := to_jsonb(new);
  v_old jsonb := to_jsonb(old);
begin
  if (v_new - 'updated_at') = (v_old - 'updated_at') then
    return old;
  end if;
  if old.voided_at is not null then
    raise exception 'err_alreadyVoid' using errcode = 'P0001';
  end if;
  -- A void: only the void fields change.
  if (v_new - void_fields) = (v_old - void_fields) then
    if new.voided_at is null then
      raise exception 'err_immutable' using errcode = 'P0001';
    end if;
    return new;
  end if;
  -- An edit: only the details change, and it isn't locked.
  if (v_new - edit_fields) <> (v_old - edit_fields) then
    raise exception 'err_immutable' using errcode = 'P0001';
  end if;
  if public.expense_locked(old) then
    raise exception 'err_expenseLocked' using errcode = 'P0001';
  end if;
  if not public.can(old.club_id, 'expense.add') then
    raise exception 'err_forbidden' using errcode = 'P0001';
  end if;
  if not exists (select 1 from public.club_members where id = new.authorized_by_id
                 and club_id = new.club_id and role in ('admin', 'treasurer')) then
    raise exception 'err_authorizer' using errcode = 'P0001';
  end if;
  if new.date > (now() at time zone 'Asia/Kolkata')::date then
    raise exception 'err_dateFuture' using errcode = 'P0001';
  end if;
  new.edited_at := now();
  new.edited_by_id := public.my_member_id(old.club_id);
  return new;
end $$;

create trigger expenses_guard_update before update on public.expense_records
  for each row execute function public.guard_expense_update();

revoke execute on function public.stamp_expense_recorder(), public.guard_expense_update(),
  public.expense_locked(public.expense_records) from public, anon, authenticated;

-- Public accounts: own categories are totalled under their own names.
create or replace function public.public_accounts(p_slug text) returns jsonb
language sql stable security definer set search_path = public as $$
  with club as (select * from public.clubs where slug = p_slug),
  live as (
    select c.* from public.chanda_transactions c join club on c.club_id = club.id
    where c.voided_at is null and c.status <> 'void'
  ),
  spent as (
    select e.category, e.category_name as name, sum(e.amount)::integer as total
    from public.expense_records e join club on e.club_id = club.id
    where e.voided_at is null group by e.category, e.category_name
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
      (select jsonb_agg(jsonb_strip_nulls(jsonb_build_object('category', category, 'name', name,
         'total', total))) from spent),
      '[]'::jsonb))
  from club, totals t
$$;
