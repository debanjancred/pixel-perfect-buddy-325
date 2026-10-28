-- Export permission (UAT 2026-10-28): admins and treasurers download the ledgers; collectors
-- don't. Exports are built on the phone, so the app enforces this; can() mirrors
-- ROLE_PERMISSIONS in src/lib/permissions.ts (src/test/cloud.test.ts checks they match).

/**
 * Mirror of ROLE_PERMISSIONS in src/lib/permissions.ts: collectors add chanda; treasurers
 * also add expenses, void, receive handovers and export; admins do everything. A removed
 * device's session keeps only the three that record money already taken or paid.
 */
create or replace function public.can(p_club uuid, p_permission text) returns boolean
language sql stable security definer set search_path = public as $$
  select (not public.removed_session()
          or p_permission in ('chanda.add', 'expense.add', 'handover.record'))
    and coalesce((
      select case p_permission
        when 'chanda.add' then true
        when 'expense.add' then m.role in ('admin', 'treasurer')
        when 'entry.void' then m.role in ('admin', 'treasurer')
        when 'handover.record' then m.role in ('admin', 'treasurer')
        when 'member.manage' then m.role = 'admin'
        when 'event.manage' then m.role = 'admin'
        when 'data.export' then m.role in ('admin', 'treasurer')
        else false
      end
      from public.club_members m
      where m.club_id = p_club and m.phone = public.auth_phone()
    ), false)
$$;
