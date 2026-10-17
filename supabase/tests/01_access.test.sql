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
select test.expect_error($$insert into public.chanda_transactions (id, receipt_no, club_id,
  household_id, amount, payment_method, status, collector_id) values (gen_random_uuid(),
  'PK-2026-C01-0001', '11111111-1111-4111-8111-111111111111',
  'bbbbbbbb-0000-4000-8000-000000000001', 5, 'cash', 'collected',
  'aaaaaaaa-0000-4000-8000-000000000003')$$, 'duplicate key');
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
insert into public.cash_handovers (id, club_id, collector_id, received_by_id, amount)
  values (gen_random_uuid(), :club, :coll, :treas, 600);
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

reset role;
select test.ok(true, 'all access tests passed');
