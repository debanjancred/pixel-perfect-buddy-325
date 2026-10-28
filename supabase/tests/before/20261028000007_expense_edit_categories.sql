-- Data that exists before …_expense_edit_categories.sql runs, as on a real project: that
-- migration backfills existing expenses, which once failed against the old void-only guard
-- (2026-10-28, staging). Inserted as the database owner; nobody else can see this club.
insert into public.clubs (id, slug, name_bn, name_en, target_amount, puja_year)
  values ('5eed0000-0000-4000-8000-000000000001', 'seed-club-2026', 'পুরনো ক্লাব', 'Seed Club',
          100000, 2026);
insert into public.club_members (id, club_id, name, role, phone, collector_code)
  values ('5eed0000-0000-4000-8000-0000000000a1', '5eed0000-0000-4000-8000-000000000001',
          'কোষাধ্যক্ষ', 'treasurer', '9000000901', 'T01');
insert into public.expense_records (id, club_id, category, title, amount, paid_to,
  authorized_by_id, date)
  values ('5eed0000-0000-4000-8000-0000000000e1', '5eed0000-0000-4000-8000-000000000001',
          'pandal', 'পুরনো খরচ', 500, 'ভেন্ডর', '5eed0000-0000-4000-8000-0000000000a1',
          current_date);
