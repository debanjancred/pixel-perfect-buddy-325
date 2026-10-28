-- Usage figures (ADR 0002 §2): registrations and activity as SQL views over existing tables.
-- Totals and counts only: no names, phone numbers or per-club rows. Days are counted in India
-- time. The views live in the private ops schema (query them in the SQL editor); staff read
-- them through ops_usage(), which goes through the staff gate and is logged.
--   active club    recorded a chanda, expense or handover in the period
--   active device  checked in (app opened online) in the last 7 days and not removed

/** Every money entry's club and time, for the activity figures. */
create view ops.entry_activity as
  select club_id, created_at from public.chanda_transactions
  union all select club_id, created_at from public.expense_records
  union all select club_id, created_at from public.cash_handovers;

create view ops.usage_totals as
select
  (select count(*) from auth.users) as people,
  (select count(*) from public.clubs) as clubs,
  (select count(*) from public.club_members where role = 'admin') as admins,
  (select count(*) from public.club_members where role = 'treasurer') as treasurers,
  (select count(*) from public.club_members where role = 'collector') as collectors,
  (select count(*) from public.households) as households,
  (select count(distinct club_id) from ops.entry_activity
    where created_at > now() - interval '7 days') as active_clubs_7d,
  (select count(distinct club_id) from ops.entry_activity
    where created_at > now() - interval '30 days') as active_clubs_30d,
  (select count(*) from public.user_devices
    where removed_at is null and last_seen_at > now() - interval '7 days') as active_devices_7d,
  (select count(*) from public.chanda_transactions) as chanda_entries,
  (select count(*) from public.chanda_transactions where voided_at is not null) as chanda_voided,
  (select count(*) from public.expense_records) as expense_entries,
  (select count(*) from public.cash_handovers) as handover_entries,
  (select coalesce(sum(amount), 0) from public.chanda_transactions
    where status = 'collected' and voided_at is null) as amount_collected;

create view ops.usage_daily as
with
  ist(d) as (select (now() at time zone 'Asia/Kolkata')::date),
  signups as (select (created_at at time zone 'Asia/Kolkata')::date as day, count(*) as n
              from auth.users group by 1),
  new_clubs as (select (created_at at time zone 'Asia/Kolkata')::date as day, count(*) as n
                from public.clubs group by 1),
  new_members as (select (created_at at time zone 'Asia/Kolkata')::date as day, count(*) as n
                  from public.club_members group by 1),
  new_devices as (select (created_at at time zone 'Asia/Kolkata')::date as day, count(*) as n
                  from public.user_devices group by 1),
  chanda as (select (created_at at time zone 'Asia/Kolkata')::date as day, count(*) as n,
                    coalesce(sum(amount) filter (where status = 'collected' and voided_at is null),
                             0) as amount
             from public.chanda_transactions group by 1),
  expenses as (select (created_at at time zone 'Asia/Kolkata')::date as day, count(*) as n
               from public.expense_records group by 1),
  active as (select (created_at at time zone 'Asia/Kolkata')::date as day,
                    count(distinct club_id) as n
             from ops.entry_activity group by 1),
  days as (
    select generate_series(
      -- From the earliest sign-up, club or entry (entries carry the phone's time, so one
      -- recorded offline can be older than its club on the server).
      least((select d from ist), (select min(day) from signups), (select min(day) from new_clubs),
            (select min(day) from active)),
      (select d from ist), interval '1 day')::date as day)
select days.day,
  coalesce(signups.n, 0) as signups,
  coalesce(new_clubs.n, 0) as new_clubs,
  coalesce(new_members.n, 0) as new_members,
  coalesce(new_devices.n, 0) as new_devices,
  coalesce(chanda.n, 0) as chanda_entries,
  coalesce(chanda.amount, 0) as amount_collected,
  coalesce(expenses.n, 0) as expense_entries,
  coalesce(active.n, 0) as active_clubs
from days
left join signups using (day)
left join new_clubs using (day)
left join new_members using (day)
left join new_devices using (day)
left join chanda using (day)
left join expenses using (day)
left join active using (day);

revoke all on ops.entry_activity, ops.usage_totals, ops.usage_daily
  from public, anon, authenticated;

/** Headline totals and the last p_days days (1–366, default 30), newest first. */
create function public.ops_usage(p_days integer default 30) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_days integer := least(greatest(coalesce(p_days, 30), 1), 366);
begin
  perform ops.require_staff('usage.read', v_days::text);
  return jsonb_build_object(
    'totals', (select to_jsonb(t) from ops.usage_totals t),
    'daily', coalesce((
      select jsonb_agg(to_jsonb(d) order by d.day desc)
      from ops.usage_daily d
      where d.day > (now() at time zone 'Asia/Kolkata')::date - v_days), '[]'::jsonb));
end $$;

revoke execute on function public.ops_usage(integer) from public, anon;
grant execute on function public.ops_usage(integer) to authenticated;
