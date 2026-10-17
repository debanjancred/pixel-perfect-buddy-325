-- Voucher photos (SPEC 3.1) in a private bucket, one folder per club:
--   vouchers/<club_id>/<expense_id>.jpg
-- Members may view; those who may add expenses may upload. Photos are compressed on the
-- phone (≤ ~400 KB); the bucket caps uploads at 1.5 MB, images only.
-- Guarded so the migration also runs on plain PostgreSQL (tests), where `storage` is absent.
do $$
begin
  if not exists (select 1 from pg_namespace where nspname = 'storage') then
    raise notice 'storage schema not present — skipping voucher bucket';
    return;
  end if;

  insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  values ('vouchers', 'vouchers', false, 1500000, array['image/jpeg', 'image/png', 'image/webp'])
  on conflict (id) do nothing;

  execute $p$
    create policy vouchers_read on storage.objects for select to authenticated
    using (bucket_id = 'vouchers' and public.is_member(((storage.foldername(name))[1])::uuid))
  $p$;
  execute $p$
    create policy vouchers_upload on storage.objects for insert to authenticated
    with check (bucket_id = 'vouchers'
                and public.can(((storage.foldername(name))[1])::uuid, 'expense.add'))
  $p$;
end $$;
