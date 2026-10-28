-- Client events (…_client_events.sql). Runs after 01_access.test.sql, whose test.* helpers it
-- uses; it makes its own club and devices so it doesn't depend on that file's data.
\set ON_ERROR_STOP on

\set ce_club  '''44444444-4444-4444-8444-444444444444'''
\set ce_admin '''aaaaaaaa-0000-4000-8000-000000000701'''
\set ce_dev   '''f7000000-0000-4000-8000-000000000001'''
\set ce_dev2  '''f7000000-0000-4000-8000-000000000002'''
\set ce_rec   '''c7000000-0000-4000-8000-000000000001'''

select test.act_as('9000000701');
select public.create_club(:ce_club, 'events-club-2026', 'ইভেন্ট ক্লাব', '', 100000, 2026,
  :ce_admin, 'সম্পাদক');
select public.touch_device(:ce_dev, 'ফোন', true);
select test.act_as('9000000702');
select public.touch_device(:ce_dev2, 'অন্য ফোন', true);

-- 1. A member reports failures from their own device.
select test.act_as('9000000701');
select test.ok(public.log_client_events(:ce_dev, '0.11.0', jsonb_build_array(
  jsonb_build_object('id', 'e7000000-0000-4000-8000-000000000001', 'kind', 'sync_failed',
    'error_key', 'err_forbidden', 'entity_type', 'chanda', 'record_id', :ce_rec,
    'club_id', :ce_club),
  jsonb_build_object('id', 'e7000000-0000-4000-8000-000000000002', 'kind', 'sync_failed',
    'error_key', 'err_handoverTooMuch', 'entity_type', 'handover',
    'record_id', 'c7000000-0000-4000-8000-000000000002', 'club_id', :ce_club))) = 2,
  'a member stores failure reports from their own device');
select test.ok(public.log_client_events(:ce_dev, '0.11.0', jsonb_build_array(
  jsonb_build_object('id', 'e7000000-0000-4000-8000-000000000001', 'kind', 'sync_failed',
    'error_key', 'err_forbidden', 'entity_type', 'chanda', 'record_id', :ce_rec,
    'club_id', :ce_club))) = 0, 'a retried report is stored once');

-- 2. Nobody reads the table through the API, not even the reporter.
select test.expect_error('select count(*) from public.client_events', 'permission denied');
select test.ok(true, 'members cannot read client_events');

-- 3. Bad reports are skipped, the good ones in the same batch kept.
select test.ok(public.log_client_events(:ce_dev, '0.11.0', jsonb_build_array(
  jsonb_build_object('id', 'e7000000-0000-4000-8000-000000000003', 'kind', 'sync_failed',
    'error_key', 'drop table', 'entity_type', 'chanda', 'record_id', :ce_rec, 'club_id', :ce_club),
  jsonb_build_object('id', 'e7000000-0000-4000-8000-000000000004', 'kind', 'sync_failed',
    'error_key', 'err_forbidden', 'entity_type', 'users', 'record_id', :ce_rec, 'club_id', :ce_club),
  jsonb_build_object('id', 'e7000000-0000-4000-8000-000000000005', 'kind', 'crash',
    'error_key', 'err_forbidden', 'entity_type', 'chanda', 'record_id', :ce_rec, 'club_id', :ce_club),
  jsonb_build_object('id', 'e7000000-0000-4000-8000-000000000006', 'kind', 'sync_failed',
    'error_key', 'err_forbidden', 'entity_type', 'chanda', 'record_id', :ce_rec,
    'club_id', '11111111-1111-4111-8111-111111111111'),
  jsonb_build_object('id', 'e7000000-0000-4000-8000-000000000007', 'kind', 'sync_failed',
    'error_key', 'err_syncDependency', 'entity_type', 'expense', 'record_id', :ce_rec,
    'club_id', :ce_club))) = 1,
  'bad keys, unknown types or kinds, and other clubs are skipped; the rest is stored');
select test.ok(public.log_client_events(:ce_dev, 'latest', '[]'::jsonb) = 0
  and public.log_client_events(:ce_dev, '0.11.0', '{}'::jsonb) = 0,
  'a malformed version or batch stores nothing');

-- 4. Only the caller's own devices.
select test.ok(public.log_client_events(:ce_dev2, '0.11.0', jsonb_build_array(
  jsonb_build_object('id', 'e7000000-0000-4000-8000-000000000008', 'kind', 'sync_failed',
    'error_key', 'err_forbidden', 'entity_type', 'chanda', 'record_id', :ce_rec,
    'club_id', :ce_club))) = 0, 'reports for someone else''s device are not stored');

-- 5. Signed out: no access.
select test.act_as(null);
select test.expect_error($$select public.log_client_events('f7000000-0000-4000-8000-000000000001',
  '0.11.0', '[]')$$, 'permission denied');
select test.ok(true, 'logged-out visitors cannot report');

-- 6. At most 50 a day per device.
select test.act_as('9000000701');
select test.ok(public.log_client_events(:ce_dev, '0.11.0', (
  select jsonb_agg(jsonb_build_object('id', gen_random_uuid(), 'kind', 'sync_failed',
    'error_key', 'err_syncFailed', 'entity_type', 'chanda', 'record_id', gen_random_uuid(),
    'club_id', :ce_club))
  from generate_series(1, 60))) = 47, 'a device stores at most 50 reports a day');
select test.ok(public.log_client_events(:ce_dev, '0.11.0', jsonb_build_array(
  jsonb_build_object('id', gen_random_uuid(), 'kind', 'sync_failed', 'error_key', 'err_forbidden',
    'entity_type', 'chanda', 'record_id', :ce_rec, 'club_id', :ce_club))) = 0,
  'over the cap, nothing more is stored that day');

reset role;
select test.ok((select member_id = 'aaaaaaaa-0000-4000-8000-000000000701'::uuid
    and app_version = '0.11.0' and device_id = 'f7000000-0000-4000-8000-000000000001'::uuid
  from public.client_events where id = 'e7000000-0000-4000-8000-000000000002'),
  'the server records the reporter''s member id, device and app version');
select test.ok((select count(*) from public.client_events where club_id = :ce_club) = 50,
  'the device has exactly 50 stored');

-- 7. Retention: older than 90 days is deleted; nobody but the job can run it.
update public.client_events set created_at = now() - interval '91 days'
 where id = 'e7000000-0000-4000-8000-000000000001';
update public.client_events set created_at = now() - interval '89 days'
 where id = 'e7000000-0000-4000-8000-000000000002';
select test.ok(public.purge_client_events() = 1, 'the purge reports how many it deleted');
select test.ok(not exists (select 1 from public.client_events
                  where id = 'e7000000-0000-4000-8000-000000000001')
  and exists (select 1 from public.client_events
              where id = 'e7000000-0000-4000-8000-000000000002'),
  'reports older than 90 days are deleted, newer ones kept');
select test.act_as('9000000701');
select test.expect_error('select public.purge_client_events()', 'permission denied');
select test.ok(true, 'members cannot run the purge');
reset role;

select test.ok(true, 'all client event tests passed');
