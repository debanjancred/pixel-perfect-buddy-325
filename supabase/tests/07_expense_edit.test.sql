-- Expense editing and own categories (…_expense_edit_categories.sql). Runs after 01–06:
-- uses 01's club, members and the collector's remaining cash.
\set ON_ERROR_STOP on

\set club  '''11111111-1111-4111-8111-111111111111'''
\set admin '''aaaaaaaa-0000-4000-8000-000000000001'''
\set treas '''aaaaaaaa-0000-4000-8000-000000000002'''
\set coll  '''aaaaaaaa-0000-4000-8000-000000000003'''
\set e1    '''de000000-0000-4000-8000-000000000001'''
\set e2    '''de000000-0000-4000-8000-000000000002'''

-- 1. Own categories are 'misc' plus a name; the server records who wrote the expense.
select test.act_as('9000000002'); -- treasurer
insert into public.expense_records (id, club_id, category, category_name, title, amount,
  paid_to, authorized_by_id, recorded_by_id, date)
values (:e1, :club, 'misc', 'সাউন্ড সিস্টেম', 'মাইক ভাড়া', 800, 'ভেন্ডর ০২', :treas, :admin,
  current_date);
select test.ok((select recorded_by_id = 'aaaaaaaa-0000-4000-8000-000000000002'::uuid
    and category_name = 'সাউন্ড সিস্টেম' and edited_at is null
  from public.expense_records where id = :e1),
  'an own category is stored with its name; the recorder is the caller, not what the phone says');
select test.expect_error($$insert into public.expense_records (id, club_id, category,
  category_name, title, amount, paid_to, authorized_by_id, date) values (gen_random_uuid(),
  '11111111-1111-4111-8111-111111111111', 'pandal', 'নতুন', 'x', 1, 'p',
  'aaaaaaaa-0000-4000-8000-000000000002', current_date)$$, 'expense_custom_is_misc');
select test.ok(true, 'an own category name only goes with the misc category');

-- 2. Editing before a handover: allowed for treasurer/admin, stamped by the server.
update public.expense_records set amount = 850, title = 'মাইক ও স্পিকার ভাড়া',
  category_name = 'সাউন্ড', edited_at = now(), edited_by_id = :coll
 where id = :e1;
select test.ok((select amount = 850 and category_name = 'সাউন্ড' and edited_at is not null
    and edited_by_id = 'aaaaaaaa-0000-4000-8000-000000000002'::uuid
  from public.expense_records where id = :e1),
  'a treasurer edits an expense; the server records who edited');
select test.expect_error($$update public.expense_records set club_id =
  '44444444-4444-4444-8444-444444444444' where id = 'de000000-0000-4000-8000-000000000001'$$,
  'err_immutable');
select test.expect_error($$update public.expense_records set amount = 1, voided_at = now(),
  void_reason = 'দুটো একসাথে' where id = 'de000000-0000-4000-8000-000000000001'$$, 'err_immutable');
select test.expect_error($$update public.expense_records set date = current_date + 2
  where id = 'de000000-0000-4000-8000-000000000001'$$, 'err_dateFuture');
select test.ok(true, 'fixed fields, editing and voiding together, and future dates are refused');
update public.expense_records set amount = 850 where id = :e1; -- the same value again
select test.ok((select amount from public.expense_records where id = :e1) = 850,
  'resending stored values is a harmless no-op');

-- 3. Collectors can't edit (row-level security hides the row from their update).
select test.act_as('9000000003');
update public.expense_records set amount = 1 where id = :e1;
select test.act_as('9000000002');
select test.ok((select amount from public.expense_records where id = :e1) = 850,
  'a collector cannot edit an expense');

-- 4. A handover involving the recorder locks the expense; voiding still works.
insert into public.cash_handovers (id, club_id, collector_id, received_by_id, amount)
  values (gen_random_uuid(), :club, :coll, :treas, 1);
select test.expect_error($$update public.expense_records set amount = 900
  where id = 'de000000-0000-4000-8000-000000000001'$$, 'err_expenseLocked');
select test.ok(true, 'after a handover involving the recorder, the expense is locked');
update public.expense_records set voided_at = now(), void_reason = 'ভুল খরচ' where id = :e1;
select test.ok((select voided_at is not null from public.expense_records where id = :e1),
  'a locked expense can still be voided');
select test.expect_error($$update public.expense_records set amount = 1
  where id = 'de000000-0000-4000-8000-000000000001'$$, 'err_alreadyVoid');
select test.ok(true, 'a voided expense cannot be edited');

-- 5. A handover that doesn't involve the recorder doesn't lock it.
select test.act_as('9000000001'); -- admin records this one
insert into public.expense_records (id, club_id, category, title, amount, paid_to,
  authorized_by_id, date)
values (:e2, :club, 'bhog', 'ভোগের চাল', 400, 'দোকান ০১', :treas, current_date);
select test.act_as('9000000002');
insert into public.cash_handovers (id, club_id, collector_id, received_by_id, amount)
  values (gen_random_uuid(), :club, :coll, :treas, 1);
update public.expense_records set amount = 450, edited_at = now() where id = :e2;
select test.ok((select amount from public.expense_records where id = :e2) = 450,
  'a handover between other members leaves the expense editable');

-- 6. Public accounts total own categories under their names.
select test.act_as(null);
select test.ok((select bool_or(x ->> 'category' = 'bhog' and (x ->> 'total')::int >= 450)
  from jsonb_array_elements(public.public_accounts('test-club-2026') -> 'expenses_by_category') x),
  'public accounts list per-category totals');
reset role;

-- 7. Expenses that existed before the migration got their recorder filled in.
select test.ok((select recorded_by_id = authorized_by_id from public.expense_records
  where id = '5eed0000-0000-4000-8000-0000000000e1'),
  'existing expenses are backfilled with their authoriser as recorder');

select test.ok(true, 'all expense edit tests passed');
