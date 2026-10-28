-- Retention (ADR 0002 §2): client_events are kept for 90 days, then deleted by a daily job.
-- The deleting is a plain function so it can be tested anywhere; the schedule needs pg_cron,
-- which Supabase provides but a stock PostgreSQL (local tests, CI) doesn't — there the
-- schedule is skipped with a notice. Check it on Supabase with: select * from cron.job;

/** Deletes client_events older than 90 days; returns how many. Run daily by pg_cron. */
create function public.purge_client_events() returns integer
language plpgsql security definer set search_path = public as $$
declare
  v_deleted integer;
begin
  delete from public.client_events where created_at < now() - interval '90 days';
  get diagnostics v_deleted = row_count;
  return v_deleted;
end $$;

revoke execute on function public.purge_client_events() from public, anon, authenticated;

do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    create extension if not exists pg_cron;
    -- 21:30 UTC = 03:00 in India, when nobody is collecting. Same name: re-running updates it.
    perform cron.schedule('purge-client-events', '30 21 * * *',
      'select public.purge_client_events()');
  else
    raise notice 'pg_cron is not available: purge_client_events() is not scheduled';
  end if;
end $$;
