-- Support functions (…_ops_support.sql). Runs after 01–03: uses 01's club and entries,
-- 02's club, device and failure reports, and 03's staff.
\set ON_ERROR_STOP on

\set club     '''11111111-1111-4111-8111-111111111111'''
\set ce_club  '''44444444-4444-4444-8444-444444444444'''
\set ce_dev   '''f7000000-0000-4000-8000-000000000001'''
\set support_u '''5a000000-0000-4000-8000-000000000002'''

reset role;
insert into auth.users (id, phone, last_sign_in_at)
  values ('5a000000-0000-4000-8000-000000000701', '919000000701', now());
create temp table money_before as
  select (select coalesce(sum(amount), 0) from public.chanda_transactions) as chanda,
         (select count(*) from public.chanda_transactions where voided_at is not null) as voided,
         (select coalesce(sum(amount), 0) from public.expense_records) as expenses;
grant select on money_before to authenticated;

select test.act_as_user(:support_u);

-- 1. Finding clubs and people.
select test.ok(jsonb_array_length(public.ops_find_club('test-club')) = 2
  and jsonb_array_length(public.ops_find_club('  ')) = 0,
  'clubs are found by slug or name (an empty search finds nothing)');
select test.ok((select p -> 'clubs' -> 0 ->> 'role' = 'admin'
    and jsonb_array_length(p -> 'devices') = 1
    and (p -> 'devices' -> 0 ->> 'is_collect')::boolean
    and p ->> 'last_sign_in_at' is not null
  from (select public.ops_find_person('+91 90000 00701') as p) x),
  'a person is found by phone however it is typed: clubs, roles, devices, last login');
select test.expect_error($$select public.ops_find_person('12345')$$, 'err_phone');
select test.ok(true, 'a malformed phone is refused');

-- 2. Club health.
select test.ok((select (h -> 'households')::int >= 1
    and h -> 'summary' ? 'total_collected'
    and jsonb_array_length(h -> 'activity_14d') = 14
    and h -> 'members' ? 'admin'
    and jsonb_typeof(h -> 'devices') = 'array'
  from (select public.ops_club_health(:club) as h) x),
  'club health shows members, households, totals, 14 days of activity and devices');
select test.ok((select f ->> 'error_key' = 'err_syncFailed' and (f ->> 'count')::int > 0
  from (select public.ops_club_health(:ce_club) -> 'sync_failures_7d' -> 0 as f) x),
  'club health groups the last 7 days of sync failures by error');
select test.expect_error($$select public.ops_club_health(gen_random_uuid())$$, 'err_notFound');
select test.ok(true, 'an unknown club is reported as not found');

-- 3. Reading entries needs a reason.
select test.expect_error($$select public.ops_club_entries('11111111-1111-4111-8111-111111111111', '')$$,
  'err_reasonRequired');
select test.ok((select jsonb_array_length(e -> 'chanda') > 0
    and e -> 'chanda' -> 0 ? 'household' and e -> 'chanda' -> 0 ? 'collector'
    and jsonb_typeof(e -> 'expenses') = 'array' and jsonb_typeof(e -> 'handovers') = 'array'
  from (select public.ops_club_entries(:club, 'Ticket 7: missing receipt', 5) as e) x),
  'with a reason, staff read a club''s entries with names and amounts');

-- 4. Device actions need a reason and take effect.
select test.expect_error($$select public.ops_reset_collect_device('9000000701', 'x')$$,
  'err_reasonRequired');
select test.ok(public.ops_reset_collect_device('9000000701', 'Ticket 8: new phone') = 1,
  'resetting the collect device clears it');
select test.ok(not (public.ops_find_person('9000000701') -> 'devices' -> 0 ->> 'is_collect')::boolean,
  'the person has no collect device afterwards');
select public.ops_remove_device('9000000701', :ce_dev, 'Ticket 9: phone lost');
select test.ok((public.ops_find_person('9000000701') -> 'devices' -> 0 ->> 'removed_at') is not null,
  'removing a lost device signs it out');
select test.expect_error($$select public.ops_remove_device('9000000701',
  'f7000000-0000-4000-8000-000000000001', 'Ticket 9: phone lost')$$, 'err_notFound');
select test.ok(true, 'removing it again is reported as not found');

-- 5. Nobody else may use them.
select test.act_as('9000000001'); -- a committee admin
select test.expect_error($$select public.ops_find_person('9000000701')$$, 'err_forbidden');
select test.expect_error($$select public.ops_club_entries('11111111-1111-4111-8111-111111111111',
  'curious about it')$$, 'err_forbidden');
select test.expect_error($$select public.ops_reset_collect_device('9000000001', 'my own phone')$$,
  'err_forbidden');
select test.ok(true, 'app users cannot use the support functions');
select test.act_as(null);
select test.expect_error($$select public.ops_find_club('test')$$, 'permission denied');
select test.ok(true, 'logged-out visitors cannot use the support functions');

-- 6. Logged without personal details; money untouched.
reset role;
select test.ok(exists (select 1 from ops.audit_log
    where action = 'person.find' and target = 'xxxxxx0701')
  and not exists (select 1 from ops.audit_log where target like '%9000000701%')
  and (select reason from ops.audit_log where action = 'device.remove') = 'Ticket 9: phone lost'
  and (select count(*) from ops.audit_log where action = 'club.read_entries') = 1,
  'each use is logged with a masked phone and its reason; refused calls are not');
select test.ok((select chanda = (select coalesce(sum(amount), 0) from public.chanda_transactions)
    and voided = (select count(*) from public.chanda_transactions where voided_at is not null)
    and expenses = (select coalesce(sum(amount), 0) from public.expense_records)
  from money_before), 'no support function changed a money entry');

select test.ok(true, 'all support function tests passed');
