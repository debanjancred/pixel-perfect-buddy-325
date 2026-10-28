-- Usage figures (…_ops_usage.sql). Runs after 01–04 (helpers, staff). Adds known data and
-- checks each figure moves by exactly that much.
\set ON_ERROR_STOP on

\set u_club   '''66666666-6666-4666-8666-666666666661'''
\set u_old    '''66666666-6666-4666-8666-666666666662'''
\set u_mem    '''66666666-0000-4000-8000-000000000001'''
\set u_mem2   '''66666666-0000-4000-8000-000000000002'''
\set u_hh     '''66666666-0000-4000-8000-0000000000a1'''
\set u_hh2    '''66666666-0000-4000-8000-0000000000a2'''
\set support_u '''5a000000-0000-4000-8000-000000000002'''

reset role;
select set_config('request.jwt.claims', '', false);
create temp table before_totals as select * from ops.usage_totals;
create temp table before_today as
  select * from ops.usage_daily where day = (now() at time zone 'Asia/Kolkata')::date;

-- Today: a sign-up, a new club with a member, a household, a device seen now, two chanda
-- (one voided). 40 days ago: another club's only entry. A device last seen 10 days ago.
insert into auth.users (id, phone) values ('66666666-0000-4000-8000-0000000000f1', '919000000801');
insert into public.clubs (id, slug, name_bn, name_en, target_amount, puja_year) values
  (:u_club, 'usage-club-2026', 'ব্যবহার ক্লাব', 'Usage Club', 100000, 2026),
  (:u_old, 'usage-old-2026', 'পুরনো ক্লাব', 'Old Club', 100000, 2026);
insert into public.club_members (id, club_id, name, role, phone, collector_code) values
  (:u_mem, :u_club, 'কর্মী', 'collector', '9000000801', 'C01'),
  (:u_mem2, :u_old, 'কর্মী', 'collector', '9000000802', 'C01');
insert into public.households (id, club_id, lane_block, house_flat_no, resident_name) values
  (:u_hh, :u_club, 'লেন ১', '1', 'আবাসিক'), (:u_hh2, :u_old, 'লেন ১', '1', 'আবাসিক');
insert into public.user_devices (phone, id, label, last_seen_at) values
  ('9000000801', '66666666-0000-4000-8000-0000000000d1', 'ফোন', now()),
  ('9000000802', '66666666-0000-4000-8000-0000000000d2', 'ফোন', now() - interval '10 days');
insert into public.chanda_transactions (id, receipt_no, club_id, household_id, amount,
  payment_method, status, collector_id, voided_at, void_reason) values
  ('66666666-0000-4000-8000-0000000000c1', 'PK-2026-C01-0001', :u_club, :u_hh, 777, 'cash',
   'collected', :u_mem, null, null),
  ('66666666-0000-4000-8000-0000000000c2', 'PK-2026-C01-0002', :u_club, :u_hh, 300, 'cash',
   'void', :u_mem, now(), 'ভুল এন্ট্রি');
insert into public.chanda_transactions (id, receipt_no, club_id, household_id, amount,
  payment_method, status, collector_id, created_at) values
  ('66666666-0000-4000-8000-0000000000c3', 'PK-2026-C01-0001', :u_old, :u_hh2, 50, 'upi',
   'collected', :u_mem2, now() - interval '40 days');

-- 1. Totals.
select test.ok((select t.people - b.people = 1 and t.clubs - b.clubs = 2
    and t.collectors - b.collectors = 2 and t.households - b.households = 2
    and t.chanda_entries - b.chanda_entries = 3 and t.chanda_voided - b.chanda_voided = 1
    and t.amount_collected - b.amount_collected = 777 + 50
  from ops.usage_totals t, before_totals b),
  'totals count sign-ups, clubs, roles, households and entries; voided money is left out');
select test.ok((select t.active_clubs_7d - b.active_clubs_7d = 1
    and t.active_clubs_30d - b.active_clubs_30d = 1
    and t.active_devices_7d - b.active_devices_7d = 1
  from ops.usage_totals t, before_totals b),
  'active clubs and devices count only recent activity');

-- 2. Daily (India time).
select test.ok((select d.signups - coalesce(b.signups, 0) = 1
    and d.new_clubs - coalesce(b.new_clubs, 0) = 2
    and d.chanda_entries - coalesce(b.chanda_entries, 0) = 2
    and d.amount_collected - coalesce(b.amount_collected, 0) = 777
    and d.active_clubs - coalesce(b.active_clubs, 0) = 1
  from ops.usage_daily d left join before_today b using (day)
  where d.day = (now() at time zone 'Asia/Kolkata')::date),
  'today''s row counts today''s sign-ups, clubs, entries, money and active clubs');
select test.ok((select chanda_entries >= 1 and amount_collected >= 50 and active_clubs >= 1
  from ops.usage_daily
  where day = ((now() - interval '40 days') at time zone 'Asia/Kolkata')::date),
  'an older entry is counted on its own day');

-- 3. No names or phone numbers anywhere.
select test.ok(not exists (select 1 from information_schema.columns
    where table_schema = 'ops' and table_name in ('usage_totals', 'usage_daily', 'entry_activity')
      and column_name ~ 'name|phone|label|title|paid_to'),
  'the usage views have no name, phone or text columns');

-- 4. Staff read it through ops_usage; nobody else.
select test.act_as_user(:support_u);
select test.ok((select u -> 'totals' ? 'amount_collected'
    and jsonb_array_length(u -> 'daily') = 7
    and (u -> 'daily' -> 0 ->> 'day')::date = (now() at time zone 'Asia/Kolkata')::date
  from (select public.ops_usage(7) as u) x),
  'ops_usage returns the totals and the last N days, newest first');
select test.act_as('9000000001');
select test.expect_error('select public.ops_usage()', 'err_forbidden');
select test.expect_error('select * from ops.usage_totals', 'permission denied');
select test.ok(true, 'app users cannot read usage figures');
select test.act_as(null);
select test.expect_error('select public.ops_usage()', 'permission denied');
select test.ok(true, 'logged-out visitors cannot read usage figures');
reset role;
select test.ok(exists (select 1 from ops.audit_log where action = 'usage.read' and target = '7'),
  'reading usage is logged');

select test.ok(true, 'all usage tests passed');
