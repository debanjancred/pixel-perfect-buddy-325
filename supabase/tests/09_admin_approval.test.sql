-- Admin approval (…_admin_approval.sql, ADR 0003). Runs after 01–08: uses 01's club and members.
\set ON_ERROR_STOP on

\set club  '''11111111-1111-4111-8111-111111111111'''
\set admin '''aaaaaaaa-0000-4000-8000-000000000001'''
\set treas '''aaaaaaaa-0000-4000-8000-000000000002'''
\set coll  '''aaaaaaaa-0000-4000-8000-000000000003'''
\set hh    '''bbbbbbbb-0000-4000-8000-000000000001'''
\set e1    '''af000000-0000-4000-8000-000000000001'''
\set e2    '''af000000-0000-4000-8000-000000000002'''
\set c1    '''af000000-0000-4000-8000-0000000000c1'''
\set c2    '''af000000-0000-4000-8000-0000000000c2'''

-- 1. Existing entries count as approved.
select test.ok((select approval_status = 'approved' from public.expense_records
  where id = '5eed0000-0000-4000-8000-0000000000e1'),
  'entries from before the migration are approved');

-- 2. The server stamps approval: what the phone claims is ignored.
select test.act_as('9000000002'); -- treasurer
insert into public.expense_records (id, club_id, category, title, amount, paid_to,
  authorized_by_id, date, approval_status, reviewed_by_id, reviewed_at)
values (:e1, :club, 'bhog', 'ভোগের চাল', 400, 'দোকান ০১', :treas, current_date, 'approved',
  :treas, now());
select test.ok((select approval_status = 'pending' and reviewed_by_id is null and reviewed_at is null
  from public.expense_records where id = :e1),
  'a treasurer''s expense starts pending, whatever the phone says');
select test.act_as('9000000003'); -- collector
insert into public.chanda_transactions (id, receipt_no, club_id, household_id, amount,
  payment_method, status, collector_id)
values (:c1, 'PK-2026-C01-0901', :club, :hh, 300, 'cash', 'collected', :coll);
select test.ok((select approval_status = 'pending' and receipt_no is not null
  from public.chanda_transactions where id = :c1),
  'a collector''s chanda starts pending and still has its receipt number');
select test.act_as('9000000001'); -- admin
insert into public.expense_records (id, club_id, category, title, amount, paid_to,
  authorized_by_id, date)
values (:e2, :club, 'bhog', 'ফুল', 200, 'দোকান ০২', :admin, current_date);
select test.ok((select approval_status = 'approved'
    and reviewed_by_id = 'aaaaaaaa-0000-4000-8000-000000000001'::uuid
  from public.expense_records where id = :e2), 'an admin''s own entry is approved at once');

-- 3. Pending entries stay out of the public totals, but in the collector's cash.
select test.act_as(null);
select (public.public_accounts('test-club-2026') #>> '{summary,total_collected}')::int as before_ok \gset
reset role;
select test.act_as('9000000001');
update public.chanda_transactions set approval_status = 'approved' where id = :c1;
select test.act_as(null);
select test.ok((public.public_accounts('test-club-2026') #>> '{summary,total_collected}')::int
  = :before_ok + 300, 'public totals count an entry only once it is approved');
reset role;

-- 4. Only an admin reviews, once, and a rejection needs a reason.
select test.act_as('9000000002');
select test.expect_error($$update public.expense_records set approval_status = 'approved'
  where id = 'af000000-0000-4000-8000-000000000001'$$, 'err_forbidden');
select test.ok(true, 'a treasurer cannot approve');
select test.act_as('9000000001');
select test.expect_error($$update public.expense_records set approval_status = 'rejected'
  where id = 'af000000-0000-4000-8000-000000000001'$$, 'err_rejectReason');
select test.ok(true, 'a rejection needs a reason');

-- 5. A review is of the version the admin saw.
select test.expect_error($$update public.expense_records set approval_status = 'approved',
  edited_at = now() - interval '1 day' where id = 'af000000-0000-4000-8000-000000000001'$$,
  'err_changedSinceReview');
select test.ok(true, 'an admin cannot approve details that changed since they looked');
update public.expense_records set approval_status = 'approved' where id = :e1;
select test.ok((select approval_status = 'approved'
    and reviewed_by_id = 'aaaaaaaa-0000-4000-8000-000000000001'::uuid and reviewed_at is not null
  from public.expense_records where id = :e1), 'an admin approves; the server records who');
select test.expect_error($$update public.expense_records set approval_status = 'rejected',
  rejection_reason = 'দেরিতে' where id = 'af000000-0000-4000-8000-000000000001'$$,
  'err_alreadyReviewed');
select test.ok(true, 'a decision is final');
update public.expense_records set approval_status = 'approved' where id = :e1;
select test.ok(true, 're-sending the same decision is a harmless no-op');

-- 6. A treasurer's edit goes back to pending; an admin's edit approves it.
select test.act_as('9000000002');
update public.expense_records set amount = 450, edited_at = now() where id = :e1;
select test.ok((select approval_status = 'pending' and reviewed_by_id is null and amount = 450
  from public.expense_records where id = :e1), 'a treasurer''s edit needs approval again');
select test.act_as('9000000001');
update public.expense_records set amount = 460, edited_at = now() where id = :e1;
select test.ok((select approval_status = 'approved' and amount = 460
  from public.expense_records where id = :e1), 'an admin''s edit counts as approved');

-- 7. A treasurer only asks for a void; the entry counts until an admin decides.
select test.act_as('9000000002');
select test.expect_error($$update public.expense_records set voided_at = now(),
  void_reason = 'ভুল খরচ' where id = 'af000000-0000-4000-8000-000000000001'$$,
  'err_voidNeedsApproval');
select test.ok(true, 'a treasurer cannot void directly');
update public.expense_records set void_requested_at = now(), void_request_reason = 'ভুল খরচ',
  void_requested_by_id = :admin where id = :e1;
select test.ok((select voided_at is null and void_request_reason = 'ভুল খরচ'
    and void_requested_by_id = 'aaaaaaaa-0000-4000-8000-000000000002'::uuid
  from public.expense_records where id = :e1),
  'a treasurer asks for a void; the server records who, and nothing is voided yet');
select test.expect_error($$update public.expense_records set void_requested_at = null,
  void_declined_reason = 'ঠিক আছে' where id = 'af000000-0000-4000-8000-000000000001'$$,
  'err_forbidden');
select test.ok(true, 'a treasurer cannot decline a void request');

-- 8. The admin declines, the treasurer asks again, and the admin voids.
select test.act_as('9000000001');
update public.expense_records set void_requested_at = null, void_declined_reason = 'খরচ ঠিক আছে'
 where id = :e1;
select test.ok((select void_requested_at is null and void_request_reason is null
    and void_declined_at is not null and voided_at is null
  from public.expense_records where id = :e1), 'an admin declines; the entry stays as it was');
select test.act_as('9000000002');
update public.expense_records set void_requested_at = now(), void_request_reason = 'আবার দেখুন'
 where id = :e1;
select test.ok((select void_requested_at is not null and void_declined_at is null
  from public.expense_records where id = :e1), 'a declined void can be asked for again');
select test.act_as('9000000001');
update public.expense_records set voided_at = now(), void_reason = 'আবার দেখুন' where id = :e1;
select test.ok((select voided_at is not null and void_request_reason = 'আবার দেখুন'
  from public.expense_records where id = :e1), 'an admin voids, and the request stays on record');

-- 9. Rejected entries: no cash, no void, no edit, and the number is never reused.
select test.act_as('9000000003');
insert into public.chanda_transactions (id, receipt_no, club_id, household_id, amount,
  payment_method, status, collector_id)
values (:c2, 'PK-2026-C01-0902', :club, :hh, 700, 'cash', 'collected', :coll);
select test.act_as('9000000001');
update public.chanda_transactions set approval_status = 'rejected', rejection_reason = 'ভুল বাড়ি'
 where id = :c2;
select test.ok((select approval_status = 'rejected' and receipt_no = 'PK-2026-C01-0902'
  from public.chanda_transactions where id = :c2), 'a rejected entry keeps its receipt number');
select test.expect_error($$update public.chanda_transactions set status = 'void', voided_at = now(),
  void_reason = 'বাতিল' where id = 'af000000-0000-4000-8000-0000000000c2'$$, 'err_entryRejected');
select test.ok(true, 'a rejected entry cannot be voided');
select test.expect_error($$update public.chanda_transactions set amount = 1
  where id = 'af000000-0000-4000-8000-0000000000c2'$$, 'err_immutable');
select test.ok(true, 'chanda stays uneditable');
select test.act_as('9000000002');
select test.expect_error(format($$insert into public.cash_handovers (id, club_id, collector_id,
  received_by_id, amount) values (gen_random_uuid(), '11111111-1111-4111-8111-111111111111',
  'aaaaaaaa-0000-4000-8000-000000000003', 'aaaaaaaa-0000-4000-8000-000000000002', %s)$$,
  (select coalesce((select sum(amount) from public.chanda_transactions
      where collector_id = 'aaaaaaaa-0000-4000-8000-000000000003'::uuid and status = 'collected'
        and payment_method = 'cash' and voided_at is null and approval_status <> 'rejected'), 0)
    - coalesce((select sum(amount) from public.cash_handovers
      where collector_id = 'aaaaaaaa-0000-4000-8000-000000000003'::uuid and voided_at is null
        and approval_status <> 'rejected'), 0) + 1)), 'err_handoverTooMuch');
select test.ok(true, 'rejected chanda is not cash the collector can hand over');

-- 10. A treasurer's handover waits for approval; an admin's doesn't.
insert into public.cash_handovers (id, club_id, collector_id, received_by_id, amount)
values ('af000000-0000-4000-8000-0000000000d1', :club, :coll, :treas, 1);
select test.ok((select approval_status = 'pending' from public.cash_handovers
  where id = 'af000000-0000-4000-8000-0000000000d1'), 'a treasurer''s handover starts pending');
select test.act_as('9000000001');
insert into public.cash_handovers (id, club_id, collector_id, received_by_id, amount)
values ('af000000-0000-4000-8000-0000000000d2', :club, :coll, :admin, 1);
select test.ok((select approval_status = 'approved' from public.cash_handovers
  where id = 'af000000-0000-4000-8000-0000000000d2'), 'an admin''s handover is approved at once');
reset role;

select test.ok(true, 'all admin approval tests passed');
