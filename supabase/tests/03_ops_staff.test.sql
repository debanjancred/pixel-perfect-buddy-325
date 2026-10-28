-- Staff access (…_ops_staff.sql). Runs after 01_access.test.sql, whose test.* helpers it uses.
\set ON_ERROR_STOP on

create or replace function test.act_as_user(p_sub uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_sub)::text, false);
  execute 'set role authenticated';
end $$;
grant execute on function test.act_as_user(uuid) to authenticated;

\set owner_u   '''5a000000-0000-4000-8000-000000000001'''
\set support_u '''5a000000-0000-4000-8000-000000000002'''
\set gone_u    '''5a000000-0000-4000-8000-000000000003'''
\set nobody_u  '''5a000000-0000-4000-8000-000000000004'''

-- Two actions to exercise the gate's options, as future ops_* functions will use it.
create function public.pk_test_owner_only() returns text
language sql security definer set search_path = public as $$
  select ops.require_staff('test.owner_only', 'club-x', null, 'owner')
$$;
create function public.pk_test_with_reason(p_reason text) returns text
language sql security definer set search_path = public as $$
  select ops.require_staff('test.read_entries', 'club-x', p_reason, 'support', true)
$$;
grant execute on function public.pk_test_owner_only(), public.pk_test_with_reason(text)
  to authenticated;

-- 1. The owner adds staff in the SQL editor; that is audited as the dashboard.
reset role;
select set_config('request.jwt.claims', '', false);
insert into auth.users (id) values (:owner_u), (:support_u), (:gone_u), (:nobody_u);
insert into ops.staff (user_id, role, label) values
  (:owner_u, 'owner', 'Owner'), (:support_u, 'support', 'Support 1'), (:gone_u, 'support', 'Old');
update ops.staff set removed_at = now() where user_id = :gone_u;
select test.ok((select count(*) from ops.audit_log
  where actor_kind = 'dashboard' and action in ('staff.insert', 'staff.update')) = 4,
  'adding and removing staff in the SQL editor is audited as the dashboard');
select test.ok(public.ops_whoami() = '{"role": "owner", "actor": "dashboard"}'::jsonb,
  'the SQL editor counts as the owner');

-- 2. Staff through the API.
select test.act_as_user(:owner_u);
select test.ok(public.ops_whoami() = '{"role": "owner", "actor": "staff"}'::jsonb,
  'an owner is recognised');
select test.ok(public.pk_test_owner_only() = 'owner', 'an owner may do owner-only actions');
select test.act_as_user(:support_u);
select test.ok(public.ops_whoami() ->> 'role' = 'support', 'support staff are recognised');
select test.expect_error('select public.pk_test_owner_only()', 'err_forbidden');
select test.ok(true, 'support cannot do owner-only actions');
select test.expect_error($$select public.pk_test_with_reason('  ab ')$$, 'err_reasonRequired');
select test.ok(public.pk_test_with_reason('Ticket 12: stuck sync') = 'support',
  'an action that needs a reason runs once one is given');

-- 3. Everyone else is refused.
select test.act_as_user(:gone_u);
select test.expect_error('select public.ops_whoami()', 'err_forbidden');
select test.ok(true, 'removed staff are refused');
select test.act_as_user(:nobody_u);
select test.expect_error('select public.ops_whoami()', 'err_forbidden');
select test.ok(true, 'a signed-in user who is not staff is refused');
select test.act_as('9000000001'); -- a committee admin
select test.expect_error('select public.ops_whoami()', 'err_forbidden');
select test.expect_error('select count(*) from ops.staff', 'permission denied');
select test.expect_error('select count(*) from ops.audit_log', 'permission denied');
select test.expect_error($$select ops.require_staff('x')$$, 'permission denied');
select test.ok(true, 'app users cannot read the ops schema or call the gate directly');
select test.act_as(null);
select test.expect_error('select public.ops_whoami()', 'permission denied');
select test.ok(true, 'logged-out visitors cannot call ops functions');

-- 4. The audit log records each call and can't be changed.
reset role;
select set_config('request.jwt.claims', '', false);
select test.ok((select count(*) from ops.audit_log
  where actor_kind = 'staff' and actor_user = :owner_u) = 2
  and (select count(*) from ops.audit_log where actor_user = :support_u) = 2
  and (select reason from ops.audit_log where action = 'test.read_entries')
      = 'Ticket 12: stuck sync',
  'every allowed call is logged with who, what, target and reason; refused ones are not');
select test.expect_error('update ops.audit_log set reason = null', 'append-only');
select test.expect_error('delete from ops.audit_log', 'append-only');
select test.expect_error('truncate ops.audit_log', 'append-only');
select test.ok(true, 'the audit log cannot be edited, deleted or truncated, even by the owner');

drop function public.pk_test_owner_only(), public.pk_test_with_reason(text);
select test.ok(true, 'all staff access tests passed');
