-- The handover guard ran before ON CONFLICT (id) noticed a re-send, so re-sending a handover
-- the server already had counted it against the collector's cash and raised
-- err_handoverTooMuch. A phone that sent a handover twice (overlapping syncs) or retried
-- after a lost response kept that entry "not synced" forever, although the server had it.
-- Now a re-send passes through (ON CONFLICT drops it), and a voided handover — which takes
-- no cash — is not checked against the cash held, so a refused one can be voided and synced.

create or replace function public.guard_handover_insert() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  outstanding integer;
begin
  if exists (select 1 from public.cash_handovers where id = new.id) then
    return new;
  end if;
  -- Same message as the app; the handover_not_self constraint stays as a backstop.
  if new.collector_id = new.received_by_id then
    raise exception 'err_handoverSelf' using errcode = 'P0001';
  end if;
  if new.voided_at is not null then
    return new;
  end if;
  -- Serialise handovers per collector so two treasurers can't both take the same cash.
  perform 1 from public.club_members where id = new.collector_id for update;
  select
    coalesce((select sum(amount) from public.chanda_transactions
              where collector_id = new.collector_id and status = 'collected'
                and payment_method = 'cash' and voided_at is null), 0)
    - coalesce((select sum(amount) from public.cash_handovers
                where collector_id = new.collector_id and voided_at is null), 0)
  into outstanding;
  if new.amount > outstanding then
    raise exception 'err_handoverTooMuch' using errcode = 'P0001';
  end if;
  return new;
end $$;
