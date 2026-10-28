-- Help requests (…_support_tickets.sql). Runs after 01–05: uses 01's club and members and
-- 03's staff.
\set ON_ERROR_STOP on

\set club      '''11111111-1111-4111-8111-111111111111'''
\set t1        '''7c000000-0000-4000-8000-000000000001'''
\set t2        '''7c000000-0000-4000-8000-000000000002'''
\set support_u '''5a000000-0000-4000-8000-000000000002'''

-- 1. A member sends a request; a resend is stored once.
select test.act_as('9000000003'); -- 01's collector
select public.submit_support_ticket(:t1, :club, 'sync',
  '  এন্ট্রি অন্য ফোনে যাচ্ছে না  ', '{"app_version": "0.11.0", "pending": 3}');
select public.submit_support_ticket(:t1, :club, 'sync', 'আবার পাঠানো হলো একই অনুরোধ', null);
select test.ok((select count(*) from public.support_tickets) = 1
  and (select message from public.support_tickets) = 'এন্ট্রি অন্য ফোনে যাচ্ছে না'
  and (select status from public.support_tickets) = 'open'
  and (select (diagnostics ->> 'pending')::int from public.support_tickets) = 3,
  'a member sends a request (trimmed, open, with device details); a resend is stored once');
select test.ok((select phone = '9000000003' and member_id = 'aaaaaaaa-0000-4000-8000-000000000003'
  from public.support_tickets), 'the server records who sent it');

-- 2. Checks.
select test.expect_error($$select public.submit_support_ticket(gen_random_uuid(),
  '11111111-1111-4111-8111-111111111111', 'billing', 'একটা লম্বা বার্তা লিখলাম', null)$$,
  'err_ticketCategory');
select test.expect_error($$select public.submit_support_ticket(gen_random_uuid(),
  '11111111-1111-4111-8111-111111111111', 'other', ' ছোট ', null)$$, 'err_ticketMessage');
select test.ok(true, 'unknown categories and too-short messages are refused');
select test.expect_error($$select public.submit_support_ticket(gen_random_uuid(),
  '44444444-4444-4444-8444-444444444444', 'other', 'অন্য ক্লাবের অনুরোধ', null)$$,
  'err_forbidden');
select test.ok(true, 'a request for a club you are not in is refused');
select public.submit_support_ticket(gen_random_uuid(), :club, 'other', 'আরও একটি অনুরোধ ' || g, null)
  from generate_series(1, 9) g;
select test.expect_error($$select public.submit_support_ticket(gen_random_uuid(),
  '11111111-1111-4111-8111-111111111111', 'other', 'এগারো নম্বর অনুরোধ', null)$$,
  'err_ticketLimit');
select test.ok(true, 'at most 10 requests a day per person');

-- 3. Members see only their own, and can't change them.
select test.ok((select count(*) from public.support_tickets) = 10,
  'the sender sees their own requests');
select test.expect_error($$update public.support_tickets set status = 'closed'$$,
  'permission denied');
select test.expect_error('delete from public.support_tickets', 'permission denied');
select test.ok(true, 'members cannot change or delete a request');
select test.act_as('9000000001'); -- the admin of the same club
select test.ok((select count(*) from public.support_tickets) = 0,
  'other members, even the club admin, cannot see someone else''s requests');
select public.submit_support_ticket(:t2, :club, 'login', 'নতুন ফোনে লগইন হচ্ছে না', null);
select test.act_as(null);
select test.expect_error('select count(*) from public.support_tickets', 'permission denied');
select test.ok(true, 'logged-out visitors cannot read requests');

-- 4. Staff list and close them; the member sees the note.
reset role;
select test.act_as_user(:support_u);
select test.ok(jsonb_array_length(public.ops_tickets()) = 11
  and public.ops_tickets('open', 1) -> 0 ->> 'id' = '7c000000-0000-4000-8000-000000000002',
  'staff list open requests, newest first');
select test.expect_error($$select public.ops_close_ticket('7c000000-0000-4000-8000-000000000001',
  'ok')$$, 'err_reasonRequired');
select public.ops_close_ticket(:t1, 'Fixed: app updated, entries synced');
select test.expect_error($$select public.ops_close_ticket('7c000000-0000-4000-8000-000000000001',
  'Closing it again')$$, 'err_notFound');
select test.ok(jsonb_array_length(public.ops_tickets('closed')) = 1,
  'closing needs a note; a closed request can''t be closed again');
select test.act_as('9000000003');
select test.ok((select status = 'closed' and staff_note = 'Fixed: app updated, entries synced'
  from public.support_tickets where id = :t1), 'the member sees it closed, with the note');
select test.expect_error($$select public.ops_tickets()$$, 'err_forbidden');
select test.ok(true, 'members cannot use the staff functions');

-- 5. Retention: device details older than 90 days are cleared; the request stays.
reset role;
update public.support_tickets set created_at = now() - interval '91 days' where id = :t1;
select test.ok(public.purge_ticket_diagnostics() = 1, 'old device details are cleared');
select test.ok((select diagnostics is null and message is not null
  from public.support_tickets where id = :t1), 'the request itself is kept');

-- 6. A request that fails to send can be reported like other records.
select test.ok(exists (select 1 from pg_constraint
  where conname = 'client_events_entity_type_check'
    and pg_get_constraintdef(oid) like '%ticket%'), 'client_events accepts the ticket kind');

select test.ok(true, 'all help request tests passed');
