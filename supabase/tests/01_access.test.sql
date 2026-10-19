-- Access-control tests: run against a database with the migrations applied (see
-- supabase/tests/run.sh). Each check acts as a user by setting their phone in the JWT.
\set ON_ERROR_STOP on
set client_min_messages = warning;

create schema if not exists test;
create or replace function test.act_as(p_phone text) returns void language plpgsql as $$
begin
  if p_phone is null then
    perform set_config('request.jwt.claims', '', false);
    execute 'set role anon';
  else
    perform set_config('request.jwt.claims', json_build_object('phone', '91' || p_phone)::text, false);
    execute 'set role authenticated';
  end if;
end $$;
create or replace function test.act_in_session(p_phone text, p_session uuid) returns void
language plpgsql as $$
begin
  perform set_config('request.jwt.claims',
    json_build_object('phone', '91' || p_phone, 'session_id', p_session)::text, false);
  execute 'set role authenticated';
end $$;
create or replace function test.expect_error(p_sql text, p_message text) returns void
language plpgsql as $$
begin
  begin
    execute p_sql;
  exception when others then
    if sqlerrm like '%' || p_message || '%' then return; end if;
    raise exception 'expected "%" but got "%" for: %', p_message, sqlerrm, p_sql;
  end;
  raise exception 'expected "%" but the statement succeeded: %', p_message, p_sql;
end $$;
create or replace function test.ok(p_cond boolean, p_what text) returns void language plpgsql as $$
begin
  if not coalesce(p_cond, false) then raise exception 'FAILED: %', p_what; end if;
  raise notice 'ok - %', p_what;
end $$;
grant usage on schema test to anon, authenticated;
grant execute on all functions in schema test to anon, authenticated;
set client_min_messages = notice;

-- Fixed ids keep the script readable.
\set club   '''11111111-1111-4111-8111-111111111111'''
\set admin  '''aaaaaaaa-0000-4000-8000-000000000001'''
\set treas  '''aaaaaaaa-0000-4000-8000-000000000002'''
\set coll   '''aaaaaaaa-0000-4000-8000-000000000003'''
\set hh     '''bbbbbbbb-0000-4000-8000-000000000001'''
\set tx1    '''cccccccc-0000-4000-8000-000000000001'''
\set tx2    '''cccccccc-0000-4000-8000-000000000002'''
\set exp1   '''dddddddd-0000-4000-8000-000000000001'''
\set ev1    '''eeeeeeee-0000-4000-8000-000000000001'''
\set other  '''22222222-2222-4222-8222-222222222222'''

-- 1. Creating a club makes the caller its admin, atomically and idempotently.
select test.act_as('9000000001');
select test.ok((select slug from public.create_club(:club, 'test-club-2026', 'পরীক্ষা ক্লাব',
  'ব্লক এ', 500000, 2026, :admin, 'সম্পাদক ০১')) = 'test-club-2026', 'create_club returns the club');
select test.ok((select role from public.club_members where id = :admin) = 'admin', 'creator is admin');
select test.ok((select count(*) from public.create_club(:club, 'test-club-2026', 'পরীক্ষা ক্লাব',
  'ব্লক এ', 500000, 2026, :admin, 'সম্পাদক ০১')) = 1, 'create_club is idempotent by id');
select test.expect_error($$select public.create_club('33333333-3333-4333-8333-333333333333',
  'x-2026', '  পরীক্ষা   ক্লাব ', '', 500000, 2026, gen_random_uuid(), 'কেউ')$$, 'err_clubExists');

-- 2. A second club with a clashing slug gets a unique one.
select test.act_as('9000000099');
select test.ok((select slug from public.create_club(:other, 'test-club-2026', 'অন্য ক্লাব', '',
  100000, 2026, gen_random_uuid(), 'অন্য')) = 'test-club-2026-2', 'slug made unique server-side');

-- 3. Members only see their own club.
select test.ok((select count(*) from public.clubs) = 1, 'a user sees only clubs they belong to');
select test.act_as('9000000555');
select test.ok((select count(*) from public.clubs) = 0, 'a non-member sees no clubs');
select test.expect_error($$insert into public.households (id, club_id, lane_block, house_flat_no,
  resident_name) values (gen_random_uuid(), '11111111-1111-4111-8111-111111111111', 'ব্লক এ', '1',
  'বাইরের লোক')$$, 'row-level security');

-- 4. The admin adds a treasurer and a collector; nobody else may manage members.
select test.act_as('9000000001');
insert into public.club_members (id, club_id, name, role, phone, collector_code) values
  (:treas, :club, 'কোষাধ্যক্ষ ০১', 'treasurer', '9000000002', 'T01'),
  (:coll, :club, 'কর্মী ০১', 'collector', '9000000003', 'C01');
select test.ok((select count(*) from public.club_members where club_id = :club) = 3, 'admin adds members');
select test.expect_error($$update public.club_members set role = 'collector'
  where id = 'aaaaaaaa-0000-4000-8000-000000000001'$$, 'err_lastAdmin');
select test.expect_error($$update public.club_members set phone = '9000000009'
  where id = 'aaaaaaaa-0000-4000-8000-000000000003'$$, 'err_immutable');
select test.act_as('9000000002');
select test.expect_error($$insert into public.club_members (id, club_id, name, role, phone,
  collector_code) values (gen_random_uuid(), '11111111-1111-4111-8111-111111111111', 'x',
  'collector', '9000000004', 'C02')$$, 'row-level security');

-- 5. A collector collects chanda, but can't spend, void or receive cash.
select test.act_as('9000000003');
insert into public.households (id, club_id, lane_block, house_flat_no, resident_name)
  values (:hh, :club, 'ব্লক এ', '101', 'আবাসিক ০১');
insert into public.chanda_transactions (id, receipt_no, club_id, household_id, amount,
  payment_method, status, collector_id) values
  (:tx1, 'PK-2026-C01-0001', :club, :hh, 1001, 'cash', 'collected', :coll),
  (:tx2, 'PK-2026-C01-0002', :club, :hh, 501, 'cash', 'collected', :coll);
select test.ok((select count(*) from public.chanda_transactions) = 2, 'collector records chanda');
select test.expect_error($$insert into public.expense_records (id, club_id, category, title,
  amount, paid_to, authorized_by_id, date) values (gen_random_uuid(),
  '11111111-1111-4111-8111-111111111111', 'misc', 't', 10, 'p',
  'aaaaaaaa-0000-4000-8000-000000000002', current_date)$$, 'row-level security');
-- RLS hides the row from a collector's UPDATE: it runs but changes nothing.
update public.chanda_transactions set status = 'void', voided_at = now(), void_reason = 'ভুল'
  where id = :tx2;
select test.ok((select status from public.chanda_transactions where id = :tx2) = 'collected',
  'collector cannot void');

-- 6. Same-club integrity: an entry can't point at another club's household.
select test.act_as('9000000099');
select test.expect_error($$insert into public.chanda_transactions (id, receipt_no, club_id,
  household_id, amount, payment_method, status, collector_id) values (gen_random_uuid(),
  'PK-2026-A01-0001', '22222222-2222-4222-8222-222222222222',
  'bbbbbbbb-0000-4000-8000-000000000001', 5, 'cash', 'collected',
  (select id from public.club_members where club_id = '22222222-2222-4222-8222-222222222222'))$$,
  'foreign key');

-- 7. A treasurer voids (once, reason required) and adds expenses with valid authorisers.
select test.act_as('9000000002');
update public.chanda_transactions set status = 'void', voided_at = now(), void_reason = 'ভুল এন্ট্রি'
  where id = :tx2;
select test.ok((select status from public.chanda_transactions where id = :tx2) = 'void', 'treasurer voids');
select test.expect_error($$update public.chanda_transactions set void_reason = 'আবার'
  where id = 'cccccccc-0000-4000-8000-000000000002'$$, 'err_alreadyVoid');
select test.expect_error($$update public.chanda_transactions set amount = 9999
  where id = 'cccccccc-0000-4000-8000-000000000001'$$, 'err_immutable');
select test.expect_error($$update public.chanda_transactions set status = 'void',
  voided_at = now() where id = 'cccccccc-0000-4000-8000-000000000001'$$, 'check constraint');
-- Re-pushing an unchanged row (offline retry) is a harmless no-op.
update public.chanda_transactions set amount = 1001 where id = :tx1;
select test.ok(true, 're-pushing an unchanged row is allowed');
insert into public.expense_records (id, club_id, category, title, amount, paid_to,
  authorized_by_id, date) values (:exp1, :club, 'pandal', 'প্যান্ডেল অগ্রিম', 300, 'ভেন্ডর ০১', :treas, current_date);
select test.expect_error($$insert into public.expense_records (id, club_id, category, title,
  amount, paid_to, authorized_by_id, date) values (gen_random_uuid(),
  '11111111-1111-4111-8111-111111111111', 'misc', 't', 10, 'p',
  'aaaaaaaa-0000-4000-8000-000000000003', current_date)$$, 'err_authorizer');
select test.expect_error($$insert into public.expense_records (id, club_id, category, title,
  amount, paid_to, authorized_by_id, date) values (gen_random_uuid(),
  '11111111-1111-4111-8111-111111111111', 'misc', 't', 10, 'p',
  'aaaaaaaa-0000-4000-8000-000000000002', current_date + 3)$$, 'err_dateFuture');

-- 8. Cash handovers: receiver is the caller; never more than outstanding; not to oneself.
\set ho1 '''99999999-0000-4000-8000-000000000001'''
insert into public.cash_handovers (id, club_id, collector_id, received_by_id, amount)
  values (:ho1, :club, :coll, :treas, 600);
-- A phone re-sending a handover the server already has (a retry, or two overlapping syncs)
-- must not be refused as more than the cash held: ON CONFLICT drops it.
insert into public.cash_handovers (id, club_id, collector_id, received_by_id, amount)
  values (:ho1, :club, :coll, :treas, 600) on conflict (id) do nothing;
select test.ok((select count(*) from public.cash_handovers where id = :ho1) = 1,
  'a re-sent handover is accepted as a no-op');
-- A voided handover takes no cash, so a refused one can be voided and still sync.
insert into public.cash_handovers (id, club_id, collector_id, received_by_id, amount,
  voided_at, void_reason) values (gen_random_uuid(), :club, :coll, :treas, 5000, now(), 'দুবার লেখা');
select test.ok((select count(*) from public.cash_handovers where voided_at is not null) = 1,
  'a voided handover syncs without the cash check');
select test.expect_error($$insert into public.cash_handovers (id, club_id, collector_id,
  received_by_id, amount) values (gen_random_uuid(), '11111111-1111-4111-8111-111111111111',
  'aaaaaaaa-0000-4000-8000-000000000003', 'aaaaaaaa-0000-4000-8000-000000000002', 402)$$,
  'err_handoverTooMuch'); -- 1001 collected (501 voided) − 600 = 401 left
select test.expect_error($$insert into public.cash_handovers (id, club_id, collector_id,
  received_by_id, amount) values (gen_random_uuid(), '11111111-1111-4111-8111-111111111111',
  'aaaaaaaa-0000-4000-8000-000000000003', 'aaaaaaaa-0000-4000-8000-000000000001', 1)$$,
  'row-level security'); -- someone else as receiver
select test.expect_error($$insert into public.cash_handovers (id, club_id, collector_id,
  received_by_id, amount) values (gen_random_uuid(), '11111111-1111-4111-8111-111111111111',
  'aaaaaaaa-0000-4000-8000-000000000002', 'aaaaaaaa-0000-4000-8000-000000000002', 1)$$,
  'err_handoverSelf');

-- 9. Events: only admins create; any member registers; the tally never goes negative.
select test.expect_error($$insert into public.club_events (id, club_id, title_bn, title_en, date)
  values (gen_random_uuid(), '11111111-1111-4111-8111-111111111111', 'খেলা', 'Game',
  current_date)$$, 'row-level security');
select test.act_as('9000000001');
insert into public.club_events (id, club_id, title_bn, title_en, date)
  values (:ev1, :club, 'বসে আঁকো', 'Sit & Draw', current_date + 1);
select test.act_as('9000000003');
select test.ok(public.register_event(:ev1, 1) = 1, 'member registers');
select test.ok(public.register_event(:ev1, -1) = 0 and public.register_event(:ev1, -1) = 0,
  'undo never goes below zero');
select test.act_as('9000000555');
select test.expect_error($$select public.register_event('eeeeeeee-0000-4000-8000-000000000001', 1)$$,
  'err_notFound');

-- 10. Public accounts: anyone may read totals by slug; no personal data.
select test.act_as(null);
select test.ok((public.public_accounts('test-club-2026') -> 'summary' ->> 'total_collected')::int = 1001,
  'public totals exclude voided entries');
select test.ok((public.public_accounts('test-club-2026') -> 'summary' ->> 'net_balance')::int = 701,
  'net balance = collected − spent');
select test.ok(public.public_accounts('test-club-2026')::text not like '%9000000%'
  and public.public_accounts('test-club-2026')::text not like '%আবাসিক%', 'no phones or names');
select test.ok(public.public_accounts('no-such-club') is null, 'unknown slug returns null');
select test.expect_error('select * from public.chanda_transactions', 'permission denied');

-- 11. Two phones that issued the same receipt number both sync: the later entry is renumbered
-- to the collector's next free number instead of failing on every retry. Last, so the extra
-- entry doesn't change the totals checked above.
select test.act_as('9000000003');
\set tx3 '''cccccccc-0000-4000-8000-000000000003'''
insert into public.chanda_transactions (id, receipt_no, club_id, household_id, amount,
  payment_method, status, collector_id) values
  (:tx3, 'PK-2026-C01-0001', :club, :hh, 5, 'cash', 'collected', :coll)
  on conflict (id) do nothing;
select test.ok((select receipt_no from public.chanda_transactions where id = :tx3)
  = 'PK-2026-C01-0003', 'a clashing receipt number gets the next free one');
insert into public.chanda_transactions (id, receipt_no, club_id, household_id, amount,
  payment_method, status, collector_id) values
  (:tx3, 'PK-2026-C01-0001', :club, :hh, 5, 'cash', 'collected', :coll)
  on conflict (id) do nothing;
select test.ok((select count(*) from public.chanda_transactions where id = :tx3) = 1
  and (select receipt_no from public.chanda_transactions where id = :tx3) = 'PK-2026-C01-0003',
  'a re-sent entry is ignored, not renumbered again');

-- 12. Devices: up to 3 per person, one of them the collect device.
\set d1 '''f0000000-0000-4000-8000-000000000001'''
\set d2 '''f0000000-0000-4000-8000-000000000002'''
\set d3 '''f0000000-0000-4000-8000-000000000003'''
\set d4 '''f0000000-0000-4000-8000-000000000004'''
select test.act_as('9000000003');
select test.ok((public.touch_device(:d1, 'Android · Chrome', true) ->> 'is_collect')::boolean,
  'a first device becomes the collect device');
select test.ok(public.touch_device(:d2, 'Mac · Chrome', true) @>
  '{"is_collect": false, "collect_label": "Android · Chrome"}', 'a second one does not');
select public.touch_device(:d3, 'iPhone · Safari', true);
select test.expect_error($$select public.touch_device('f0000000-0000-4000-8000-000000000004',
  'Tablet', true)$$, 'err_deviceLimit');
select test.ok(public.touch_device(:d4, 'Tablet', false) ->> 'status' = 'limit',
  'an unknown device checking in over the limit is told so');
select public.remove_device(:d3);
select test.ok(public.touch_device(:d3, 'iPhone · Safari', false) ->> 'status' = 'removed',
  'a removed device learns it was removed');
select test.ok(public.touch_device(:d4, 'Tablet', true) ->> 'status' = 'active',
  'removing a device makes room for another');
select test.ok((select count(*) from public.user_devices) = 3, 'a person sees their own 3 devices');
select test.ok((public.set_collect_device(:d2) ->> 'is_collect')::boolean,
  'a person switches their collect device');
select test.ok((select array_agg(id) from public.user_devices where is_collect) = array[:d2]::uuid[],
  'only the new one collects');
select test.expect_error($$select public.set_collect_device('f0000000-0000-4000-8000-000000000003')$$,
  'err_notFound');

-- Chanda keeps the device it came from; only the collect device's entries are unflagged.
insert into public.chanda_transactions (id, receipt_no, club_id, household_id, amount,
  payment_method, status, collector_id, device_id, off_device) values
  ('cccccccc-0000-4000-8000-000000000010', 'PK-2026-C01-0010', :club, :hh, 5, 'cash',
   'collected', :coll, :d2, true),
  ('cccccccc-0000-4000-8000-000000000011', 'PK-2026-C01-0011', :club, :hh, 5, 'cash',
   'collected', :coll, :d1, false);
select test.ok(not (select off_device from public.chanda_transactions
  where id = 'cccccccc-0000-4000-8000-000000000010'), 'collect-device chanda is not flagged');
select test.ok((select off_device from public.chanda_transactions
  where id = 'cccccccc-0000-4000-8000-000000000011'),
  'chanda from another device is accepted but flagged (the client cannot unflag it)');

-- Only an admin resets someone's collect device; others' devices stay private.
select test.expect_error($$select public.reset_collect_device('aaaaaaaa-0000-4000-8000-000000000003')$$,
  'err_forbidden');
select test.act_as('9000000001');
select test.ok((select count(*) from public.user_devices) = 0, 'devices are visible only to their owner');
select public.reset_collect_device(:coll);
select test.act_as('9000000003');
select test.ok(not exists (select 1 from public.user_devices where is_collect),
  'an admin reset clears the collect device');
select test.act_as(null);
select test.expect_error('select * from public.user_devices', 'permission denied');
select test.expect_error($$select public.touch_device(gen_random_uuid(), 'x', true)$$,
  'permission denied');

-- 14. A removed device's login session reads and changes nothing, but its cash entries
--     are still accepted, flagged for review (…_removed_device_sessions.sql).
\set t1 '''f1000000-0000-4000-8000-000000000001'''
\set t2 '''f1000000-0000-4000-8000-000000000002'''
\set s1 '''5e551000-0000-4000-8000-000000000001'''
\set s2 '''5e551000-0000-4000-8000-000000000002'''
select test.act_in_session('9000000002', :s1);
select public.touch_device(:t1, 'Old phone', true);
select test.act_in_session('9000000002', :s2);
select public.touch_device(:t2, 'New phone', true);
select public.remove_device(:t1);
select public.set_collect_device(:t2);

select test.act_in_session('9000000002', :s1);
select test.ok(public.touch_device(:t1, 'Old phone', false) ->> 'status' = 'removed',
  'a removed device can still check in and learn it was removed');
select test.ok((select count(*) from public.chanda_transactions) = 0
  and (select count(*) from public.clubs) = 0 and (select count(*) from public.club_members) = 0,
  'a removed device reads no club data');
insert into public.expense_records (id, club_id, category, title, amount, paid_to,
  authorized_by_id, date) values
  ('dddddddd-0000-4000-8000-000000000014', :club, 'misc', 'offline', 40, 'p', :treas, current_date);
insert into public.chanda_transactions (id, receipt_no, club_id, household_id, amount,
  payment_method, status, collector_id, device_id) values
  ('cccccccc-0000-4000-8000-000000000014', 'PK-2026-T01-0014', :club, :hh, 7, 'upi',
   'collected', :treas, :t2);
-- The app sends a plain insert and counts a duplicate primary key as already sent
-- (src/services/cloud/adapter.ts); an ON CONFLICT insert can need read access, which a
-- removed device doesn't have.
select test.expect_error($$insert into public.expense_records (id, club_id, category, title,
  amount, paid_to, authorized_by_id, date) values ('dddddddd-0000-4000-8000-000000000014',
  '11111111-1111-4111-8111-111111111111', 'misc', 'offline', 40, 'p',
  'aaaaaaaa-0000-4000-8000-000000000002', current_date)$$, 'expense_records_pkey');
select test.ok(true, 'a re-send from a removed device is a duplicate key, which the app counts as sent');
update public.expense_records set voided_at = now(), void_reason = 'x' where id = :exp1;
select test.expect_error($$select public.set_collect_device('f1000000-0000-4000-8000-000000000002')$$,
  'err_forbidden');
select test.expect_error($$select public.create_club('33333333-3333-4333-8333-333333333333',
  'removed-club', 'অন্য', '', 1000, 2026, gen_random_uuid(), 'x')$$, 'err_forbidden');

select test.act_in_session('9000000002', :s2);
select test.ok((select off_device from public.expense_records
  where id = 'dddddddd-0000-4000-8000-000000000014'),
  'an expense from a removed device is accepted and flagged');
select test.ok((select off_device from public.chanda_transactions
  where id = 'cccccccc-0000-4000-8000-000000000014'),
  'chanda from a removed device is flagged even when it names the collect device');
select test.ok((select voided_at is null from public.expense_records where id = :exp1),
  'a removed device cannot void');
insert into public.expense_records (id, club_id, category, title, amount, paid_to,
  authorized_by_id, date) values
  ('dddddddd-0000-4000-8000-000000000015', :club, 'misc', 'online', 40, 'p', :treas, current_date);
select test.ok(not (select off_device from public.expense_records
  where id = 'dddddddd-0000-4000-8000-000000000015'),
  'entries from the active device are not flagged');
select test.act_as('9000000002');
select test.ok((select count(*) from public.clubs) = 1,
  'a session the server has not seen yet keeps working (covered from its next check-in)');

reset role;

-- 13. Security hardening: no rights beyond what the policies were written for.
select test.ok(not exists (
  select 1 from information_schema.role_table_grants
  where table_schema = 'public' and grantee in ('anon', 'authenticated')
    and privilege_type not in ('SELECT', 'INSERT', 'UPDATE')),
  'signed-in users have no TRUNCATE, TRIGGER or REFERENCES on any table');
select test.ok((select coalesce(string_agg(p.proname, ',' order by p.proname), '')
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and has_function_privilege('anon', p.oid, 'execute'))
  = 'public_accounts', 'logged-out visitors can call only public_accounts');
select test.ok(not exists (
  select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and has_function_privilege('authenticated', p.oid, 'execute')
    and (p.prorettype = 'trigger'::regtype or p.proname in ('require_phone', 'device_state'))),
  'signed-in users cannot call trigger or internal functions');
select test.ok(not exists (
  select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and not exists (select 1 from unnest(coalesce(p.proconfig, '{}')) c where c like 'search_path=%')),
  'every function has a fixed search_path');
create table public.pk_default_grant_probe (id int);
create function public.pk_default_grant_probe_fn() returns int language sql as 'select 1';
select test.ok(not has_table_privilege('authenticated', 'public.pk_default_grant_probe', 'truncate')
  and not has_function_privilege('anon', 'public.pk_default_grant_probe_fn()', 'execute'),
  'new tables and functions get no automatic grants');
drop table public.pk_default_grant_probe;
drop function public.pk_default_grant_probe_fn();

select test.ok(true, 'all access tests passed');
