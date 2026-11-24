-- Admin approval (ADR 0003): what a non-admin records waits for an admin.
--   1. Chanda, expenses and handovers carry an approval status, stamped by the server: an
--      admin's own entries are approved at once, everyone else's start pending. Rejected
--      entries stay for audit, never count, and keep their receipt number (never reused).
--   2. A treasurer's void is a request with a reason; the entry keeps counting until an admin
--      voids it (approving) or declines. Only an admin sets voided_at.
--   3. A treasurer's expense edit goes back to pending; the handover lock stays.
--   4. Public accounts count approved entries only. Cash in hand still counts pending chanda
--      and handovers, because that money really moved; rejected ones don't count.
-- Existing entries count as approved. Apply together with the app release that speaks this:
-- older apps' treasurer voids are refused (err_voidNeedsApproval), so raise the minimum version.

create type public.approval_status as enum ('pending', 'approved', 'rejected');

do $$
declare
  t text;
begin
  foreach t in array array['chanda_transactions', 'expense_records', 'cash_handovers'] loop
    -- Added with 'approved' so existing rows are approved; new rows default to pending.
    execute format($f$
      alter table public.%1$I
        add column approval_status public.approval_status not null default 'approved',
        add column reviewed_by_id uuid,
        add column reviewed_at timestamptz,
        add column rejection_reason text
          check (char_length(btrim(rejection_reason)) between 3 and 200),
        add column void_requested_at timestamptz,
        add column void_requested_by_id uuid,
        add column void_request_reason text
          check (char_length(btrim(void_request_reason)) between 3 and 200),
        add column void_declined_at timestamptz,
        add column void_declined_reason text
          check (char_length(btrim(void_declined_reason)) between 3 and 200),
        add constraint %1$s_rejection_has_reason
          check ((approval_status = 'rejected') = (rejection_reason is not null)),
        add constraint %1$s_void_request_has_reason
          check ((void_requested_at is null) = (void_request_reason is null))
    $f$, t);
    execute format('alter table public.%I alter column approval_status set default ''pending''', t);
  end loop;
end $$;

/**
 * Mirror of ROLE_PERMISSIONS in src/lib/permissions.ts: collectors add chanda; treasurers
 * also add expenses, request voids, receive handovers and export; admins do everything,
 * including approving. A removed device's session keeps only the three that record money
 * already taken or paid.
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
        when 'entry.approve' then m.role in ('admin')
        when 'handover.record' then m.role in ('admin', 'treasurer')
        when 'member.manage' then m.role = 'admin'
        when 'event.manage' then m.role = 'admin'
        when 'data.export' then m.role in ('admin', 'treasurer')
        else false
      end
      from public.club_members m
      where m.club_id = p_club and m.phone = public.auth_phone()
    ), false)
$$;

/** The server decides an entry's approval; nothing the phone says about it is trusted. */
create function public.stamp_entry_approval() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_me uuid := public.my_member_id(new.club_id);
  v_admin boolean := public.can(new.club_id, 'entry.approve');
begin
  if v_me is not null and not v_admin and new.voided_at is not null then
    raise exception 'err_voidNeedsApproval' using errcode = 'P0001';
  end if;
  new.approval_status := case when v_admin then 'approved' else 'pending' end::public.approval_status;
  new.reviewed_by_id := case when v_admin then v_me end;
  new.reviewed_at := case when v_admin then now() end;
  new.rejection_reason := null;
  new.void_declined_at := null;
  new.void_declined_reason := null;
  -- Written offline and voided before it was ever sent: the request travels with the entry.
  if new.void_requested_at is not null and public.can(new.club_id, 'entry.void') then
    new.void_requested_at := now();
    new.void_requested_by_id := v_me;
  else
    new.void_requested_at := null;
    new.void_requested_by_id := null;
    new.void_request_reason := null;
  end if;
  return new;
end $$;

create trigger chanda_approval_stamp before insert on public.chanda_transactions
  for each row execute function public.stamp_entry_approval();
create trigger expenses_approval_stamp before insert on public.expense_records
  for each row execute function public.stamp_entry_approval();
create trigger handovers_approval_stamp before insert on public.cash_handovers
  for each row execute function public.stamp_entry_approval();

/**
 * Review decisions and void requests. Runs first (triggers fire in name order) and leaves
 * these columns valid and server-stamped, so the guards after it only judge everything else.
 * Decisions already taken are kept, so re-sending from an offline phone is harmless.
 */
create function public.guard_entry_review() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_me uuid := public.my_member_id(old.club_id);
  v_admin boolean := public.can(old.club_id, 'entry.approve');
begin
  -- 1. Approve or reject.
  if new.approval_status <> old.approval_status then
    if old.approval_status <> 'pending' then
      raise exception 'err_alreadyReviewed' using errcode = 'P0001';
    end if;
    if not v_admin then
      raise exception 'err_forbidden' using errcode = 'P0001';
    end if;
    if old.voided_at is not null then
      raise exception 'err_alreadyVoid' using errcode = 'P0001';
    end if;
    if new.approval_status = 'rejected' and new.rejection_reason is null then
      raise exception 'err_rejectReason' using errcode = 'P0001';
    end if;
    new.reviewed_by_id := v_me;
    new.reviewed_at := now();
    if new.approval_status = 'approved' then
      new.rejection_reason := null;
    end if;
  else
    new.reviewed_by_id := old.reviewed_by_id;
    new.reviewed_at := old.reviewed_at;
    new.rejection_reason := old.rejection_reason;
  end if;

  -- 2. Ask for a void, or decline the request.
  if new.void_requested_at is null and old.void_requested_at is not null then
    if not v_admin then
      raise exception 'err_forbidden' using errcode = 'P0001';
    end if;
    if new.void_declined_reason is null then
      raise exception 'err_rejectReason' using errcode = 'P0001';
    end if;
    new.void_request_reason := null;
    new.void_requested_by_id := null;
    new.void_declined_at := now();
  elsif new.void_requested_at is not null and old.void_requested_at is null then
    if not public.can(old.club_id, 'entry.void') then
      raise exception 'err_forbidden' using errcode = 'P0001';
    end if;
    if old.voided_at is not null then
      raise exception 'err_alreadyVoid' using errcode = 'P0001';
    end if;
    if old.approval_status = 'rejected' then
      raise exception 'err_entryRejected' using errcode = 'P0001';
    end if;
    new.void_requested_at := now();
    new.void_requested_by_id := v_me;
    new.void_declined_at := null;
    new.void_declined_reason := null;
  else
    new.void_requested_at := old.void_requested_at;
    new.void_requested_by_id := old.void_requested_by_id;
    new.void_request_reason := old.void_request_reason;
    new.void_declined_at := old.void_declined_at;
    new.void_declined_reason := old.void_declined_reason;
  end if;

  -- 3. Whatever else changes, only an admin voids, and a rejected entry stays as it is.
  if new.voided_at is not null and old.voided_at is null then
    if v_me is not null and not v_admin then
      raise exception 'err_voidNeedsApproval' using errcode = 'P0001';
    end if;
    if old.approval_status = 'rejected' then
      raise exception 'err_entryRejected' using errcode = 'P0001';
    end if;
  end if;
  return new;
end $$;

create trigger chanda_approval_guard before update on public.chanda_transactions
  for each row execute function public.guard_entry_review();
create trigger expenses_approval_guard before update on public.expense_records
  for each row execute function public.guard_entry_review();
create trigger handovers_approval_guard before update on public.cash_handovers
  for each row execute function public.guard_entry_review();

/** As before (…_access.sql), with the review columns handled by guard_entry_review. */
create or replace function public.guard_void_only() returns trigger
language plpgsql set search_path = public as $$
declare
  fixed constant text[] := array['voided_at', 'void_reason', 'status', 'updated_at'];
  review constant text[] := array['approval_status', 'reviewed_by_id', 'reviewed_at',
    'rejection_reason', 'void_requested_at', 'void_requested_by_id', 'void_request_reason',
    'void_declined_at', 'void_declined_reason', 'updated_at'];
begin
  if (to_jsonb(new) - 'updated_at') = (to_jsonb(old) - 'updated_at') then
    return old;
  end if;
  if (to_jsonb(new) - review) = (to_jsonb(old) - review) then
    return new;
  end if;
  if (to_jsonb(new) - fixed - review) <> (to_jsonb(old) - fixed - review) then
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

/** As before (…_expense_edit_categories.sql); rejected entries are locked too. */
create or replace function public.expense_locked(p_expense public.expense_records) returns boolean
language sql stable security definer set search_path = public as $$
  select p_expense.voided_at is not null or p_expense.approval_status = 'rejected' or exists (
    select 1 from public.cash_handovers h
    where h.club_id = p_expense.club_id
      and h.voided_at is null
      and h.approval_status <> 'rejected'
      and h.created_at > p_expense.created_at
      and coalesce(p_expense.recorded_by_id, p_expense.authorized_by_id)
          in (h.collector_id, h.received_by_id)
  )
$$;

/**
 * As before (…_expense_edit_categories.sql), plus: a review must be of the version the admin
 * saw, and an edit by a non-admin goes back to pending (an admin's edit counts as approved).
 */
create or replace function public.guard_expense_update() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  review constant text[] := array['approval_status', 'reviewed_by_id', 'reviewed_at',
    'rejection_reason', 'void_requested_at', 'void_requested_by_id', 'void_request_reason',
    'void_declined_at', 'void_declined_reason', 'updated_at'];
  void_fields constant text[] := array['voided_at', 'void_reason'];
  edit_fields constant text[] := array['category', 'category_name', 'title', 'amount',
    'paid_to', 'date', 'authorized_by_id', 'edited_at', 'edited_by_id'];
  v_new jsonb := to_jsonb(new);
  v_old jsonb := to_jsonb(old);
  v_admin boolean := public.can(old.club_id, 'entry.approve');
begin
  if (v_new - 'updated_at') = (v_old - 'updated_at') then
    return old;
  end if;
  -- The phone sends the edited_at it reviewed; a later edit means the admin saw old details.
  if new.approval_status <> old.approval_status
     and new.edited_at is distinct from old.edited_at then
    raise exception 'err_changedSinceReview' using errcode = 'P0001';
  end if;
  if (v_new - review) = (v_old - review) then
    return new;
  end if;
  if old.voided_at is not null then
    raise exception 'err_alreadyVoid' using errcode = 'P0001';
  end if;
  -- A void: only the void fields change.
  if (v_new - review - void_fields) = (v_old - review - void_fields) then
    if new.voided_at is null then
      raise exception 'err_immutable' using errcode = 'P0001';
    end if;
    return new;
  end if;
  -- An edit: only the details change, and it isn't locked.
  if (v_new - review - edit_fields) <> (v_old - review - edit_fields) then
    raise exception 'err_immutable' using errcode = 'P0001';
  end if;
  if old.approval_status = 'rejected' then
    raise exception 'err_entryRejected' using errcode = 'P0001';
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
  new.approval_status := case when v_admin then 'approved' else 'pending' end::public.approval_status;
  new.reviewed_by_id := case when v_admin then new.edited_by_id end;
  new.reviewed_at := case when v_admin then now() end;
  return new;
end $$;

/**
 * As before (…_handover_resend.sql). Rejected chanda and handovers hold no cash, and a
 * handover whose void was already requested takes none, so a refused one can still sync.
 */
create or replace function public.guard_handover_insert() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  outstanding integer;
begin
  if exists (select 1 from public.cash_handovers where id = new.id) then
    return new;
  end if;
  -- Same message as the app; the handover_not_self constraint stays as a backstop.
  if new.collector_id = new.received_by_id then
    raise exception 'err_handoverSelf' using errcode = 'P0001';
  end if;
  if new.voided_at is not null or new.void_requested_at is not null then
    return new;
  end if;
  -- Serialise handovers per collector so two treasurers can't both take the same cash.
  perform 1 from public.club_members where id = new.collector_id for update;
  select
    coalesce((select sum(amount) from public.chanda_transactions
              where collector_id = new.collector_id and status = 'collected'
                and payment_method = 'cash' and voided_at is null
                and approval_status <> 'rejected'), 0)
    - coalesce((select sum(amount) from public.cash_handovers
                where collector_id = new.collector_id and voided_at is null
                  and approval_status <> 'rejected'), 0)
  into outstanding;
  if new.amount > outstanding then
    raise exception 'err_handoverTooMuch' using errcode = 'P0001';
  end if;
  return new;
end $$;

revoke execute on function public.stamp_entry_approval(), public.guard_entry_review(),
  public.guard_expense_update(), public.guard_handover_insert(),
  public.expense_locked(public.expense_records) from public, anon, authenticated;

-- Public accounts: as before (…_expense_edit_categories.sql), approved entries only.
create or replace function public.public_accounts(p_slug text) returns jsonb
language sql stable security definer set search_path = public as $$
  with club as (select * from public.clubs where slug = p_slug),
  live as (
    select c.* from public.chanda_transactions c join club on c.club_id = club.id
    where c.voided_at is null and c.status <> 'void' and c.approval_status = 'approved'
  ),
  spent as (
    select e.category, e.category_name as name, sum(e.amount)::integer as total
    from public.expense_records e join club on e.club_id = club.id
    where e.voided_at is null and e.approval_status = 'approved'
    group by e.category, e.category_name
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
