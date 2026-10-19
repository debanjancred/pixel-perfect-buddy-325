-- Promises (pledges): a household says it will pay later. A promise is recorded as a chanda
-- row with status 'promised' — no money, no receipt — and later payments are ordinary
-- 'collected' rows counted against it. Receipt numbers belong to money received only, so a
-- promise has none, which keeps each collector's receipt sequence free of gaps.

alter table public.chanda_transactions alter column receipt_no drop not null;

-- Promises recorded before this (none from the app, which couldn't create them) lose theirs.
update public.chanda_transactions set receipt_no = null where status = 'promised';

alter table public.chanda_transactions
  add constraint chanda_receipt_for_money check (
    (status = 'collected' and receipt_no is not null)
    or (status = 'promised' and receipt_no is null)
    or status = 'void'
  );

/** As before (…_receipt_renumber.sql); a promise has no number to renumber. */
create or replace function public.renumber_clashing_receipt() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_prefix text := substring(new.receipt_no from '^(.*-)[0-9]+$');
  v_next integer;
begin
  if new.receipt_no is null then
    return new;
  end if;
  -- A re-send of a row already stored is dropped by its primary key; leave it alone.
  if exists (select 1 from public.chanda_transactions where id = new.id) then
    return new;
  end if;
  -- Serialise numbering per club and collector so two inserts can't both take the same slot.
  perform pg_advisory_xact_lock(hashtextextended(new.club_id::text || v_prefix, 0));
  if exists (select 1 from public.chanda_transactions
             where club_id = new.club_id and receipt_no = new.receipt_no) then
    select coalesce(max(substring(receipt_no from '[0-9]+$')::integer), 0) + 1
      into v_next
      from public.chanda_transactions
     where club_id = new.club_id and starts_with(receipt_no, v_prefix);
    new.receipt_no := v_prefix || lpad(v_next::text, 4, '0');
  end if;
  return new;
end $$;
