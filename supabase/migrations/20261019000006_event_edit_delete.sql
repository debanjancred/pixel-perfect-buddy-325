-- Events (competitions) can be edited and deleted by admins (event.manage); every other member
-- only views and registers. Deleting is soft — deleted_at — because other phones learn about
-- changes through their incremental pull (rows with a newer updated_at), and a row that is
-- really gone would never reach them.

alter table public.club_events add column deleted_at timestamptz;

-- Only these columns: the tally changes through register_event alone.
grant update (title_bn, title_en, date, deleted_at) on public.club_events to authenticated;
create policy events_edit on public.club_events for update to authenticated
  using (public.can(club_id, 'event.manage')) with check (public.can(club_id, 'event.manage'));

/**
 * A deleted event stays deleted and unchanged. Deleting it again (a re-send, or a second
 * admin) is harmless and keeps the first deletion time; editing or restoring it is refused.
 */
create function public.guard_event_update() returns trigger
language plpgsql set search_path = public as $$
begin
  if old.deleted_at is not null then
    if new.deleted_at is null
       or (new.title_bn, new.title_en, new.date) is distinct from
          (old.title_bn, old.title_en, old.date) then
      raise exception 'err_notFound' using errcode = 'P0001';
    end if;
    new.deleted_at := old.deleted_at;
  end if;
  return new;
end $$;

create trigger events_guard before update on public.club_events
  for each row execute function public.guard_event_update();

/**
 * As before (…_access.sql), but a deleted event takes no registrations. A tap queued offline
 * for an event an admin has since deleted counts nothing and is not an error, so it doesn't
 * sit in the phone's "didn't sync" list forever.
 */
create or replace function public.register_event(p_event uuid, p_delta integer) returns integer
language plpgsql security definer set search_path = public as $$
declare
  result integer;
begin
  if p_delta not in (-1, 1) then
    raise exception 'err_immutable' using errcode = 'P0001';
  end if;
  update public.club_events
     set registrations_count = greatest(0, registrations_count + p_delta)
   where id = p_event and public.is_member(club_id) and deleted_at is null
  returning registrations_count into result;
  if result is null then
    if exists (select 1 from public.club_events
               where id = p_event and deleted_at is not null and public.is_member(club_id)) then
      return 0;
    end if;
    raise exception 'err_notFound' using errcode = 'P0001';
  end if;
  return result;
end $$;
