-- Receipt numbers are issued on the phone ("PK-{year}-{collector_code}-{seq}", next after the
-- highest it has seen). Two phones recording for the same collector before they sync — an
-- admin entering cash for a collector while the collector also collects — pick the same
-- number. The second insert then failed the (club_id, receipt_no) unique key on every retry,
-- so that cash never reached the server and handovers covering it were refused as
-- err_handoverTooMuch. The server, which sees every phone's receipts, now settles the clash:
-- a taken number becomes the next free one for that collector, and the phone picks the final
-- number up on its next pull.

create function public.renumber_clashing_receipt() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_prefix text := substring(new.receipt_no from '^(.*-)[0-9]+$');
  v_next integer;
begin
  -- A re-send of a row already stored is dropped by ON CONFLICT (id); leave it alone.
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

create trigger chanda_receipt_renumber before insert on public.chanda_transactions
  for each row execute function public.renumber_clashing_receipt();
