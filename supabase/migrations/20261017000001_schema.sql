-- Pujo Khata schema (mirrors src/types/domain.ts and SPEC §4).
-- Ids are client-generated UUIDs (the idempotency key for offline sync), money is integer
-- rupees, phones are 10 ASCII digits. Checks repeat the zod rules in src/lib/validation.ts;
-- error messages raised by triggers/functions are the app's i18n error keys.

create type public.user_role as enum ('admin', 'treasurer', 'collector');
create type public.payment_method as enum ('cash', 'upi');
create type public.chanda_status as enum ('collected', 'promised', 'void');
create type public.expense_category as enum ('pandal', 'idol', 'lighting', 'bhog', 'cultural', 'misc');

create function public.set_updated_at() returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

create table public.clubs (
  id uuid primary key,
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  name_bn text not null check (char_length(btrim(name_bn)) between 3 and 80),
  name_en text not null check (char_length(btrim(name_en)) between 3 and 80),
  area_label text not null default '' check (char_length(area_label) <= 110),
  target_amount integer not null check (target_amount between 1000 and 100000000),
  puja_year integer not null check (puja_year between 2000 and 2100),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.club_members (
  id uuid primary key,
  club_id uuid not null references public.clubs (id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 80),
  role public.user_role not null,
  phone text not null check (phone ~ '^[6-9][0-9]{9}$'),
  collector_code text not null check (collector_code ~ '^[ATC][0-9]{2,}$'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (club_id, phone),
  unique (club_id, collector_code),
  unique (id, club_id) -- target of same-club composite foreign keys
);

create table public.households (
  id uuid primary key,
  club_id uuid not null references public.clubs (id) on delete cascade,
  lane_block text not null check (char_length(btrim(lane_block)) between 1 and 60),
  house_flat_no text not null check (char_length(btrim(house_flat_no)) between 1 and 20),
  resident_name text not null check (char_length(btrim(resident_name)) between 2 and 80),
  phone_number text check (phone_number ~ '^[6-9][0-9]{9}$'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, club_id)
);
-- Same resident at the same house is one household (case/space-insensitive, like sameName()).
create unique index households_identity on public.households
  (club_id, lower(btrim(house_flat_no)), lower(regexp_replace(btrim(resident_name), '\s+', ' ', 'g')));

create table public.chanda_transactions (
  id uuid primary key,
  receipt_no text not null check (receipt_no ~ '^PK-[0-9]{4}-[ATC][0-9]{2,}-[0-9]{4,}$'),
  club_id uuid not null references public.clubs (id) on delete cascade,
  household_id uuid not null,
  amount integer not null check (amount between 1 and 1000000),
  payment_method public.payment_method not null,
  status public.chanda_status not null,
  collector_id uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  voided_at timestamptz,
  void_reason text check (char_length(btrim(void_reason)) between 3 and 200),
  unique (club_id, receipt_no),
  foreign key (household_id, club_id) references public.households (id, club_id),
  foreign key (collector_id, club_id) references public.club_members (id, club_id),
  check ((status = 'void') = (voided_at is not null)),
  check ((voided_at is null) = (void_reason is null))
);

create table public.expense_records (
  id uuid primary key,
  club_id uuid not null references public.clubs (id) on delete cascade,
  category public.expense_category not null,
  title text not null check (char_length(btrim(title)) between 1 and 120),
  amount integer not null check (amount between 1 and 1000000),
  paid_to text not null check (char_length(btrim(paid_to)) between 1 and 80),
  authorized_by_id uuid not null,
  voucher_image_id text check (char_length(voucher_image_id) <= 200), -- storage path
  date date not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  voided_at timestamptz,
  void_reason text check (char_length(btrim(void_reason)) between 3 and 200),
  foreign key (authorized_by_id, club_id) references public.club_members (id, club_id),
  check ((voided_at is null) = (void_reason is null))
);

create table public.cash_handovers (
  id uuid primary key,
  club_id uuid not null references public.clubs (id) on delete cascade,
  collector_id uuid not null,
  received_by_id uuid not null,
  amount integer not null check (amount between 1 and 1000000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  voided_at timestamptz,
  void_reason text check (char_length(btrim(void_reason)) between 3 and 200),
  foreign key (collector_id, club_id) references public.club_members (id, club_id),
  foreign key (received_by_id, club_id) references public.club_members (id, club_id),
  constraint handover_not_self check (collector_id <> received_by_id),
  check ((voided_at is null) = (void_reason is null))
);

create table public.club_events (
  id uuid primary key,
  club_id uuid not null references public.clubs (id) on delete cascade,
  title_bn text not null check (char_length(btrim(title_bn)) between 2 and 80),
  title_en text not null check (char_length(btrim(title_en)) between 2 and 80),
  date date not null,
  registrations_count integer not null default 0 check (registrations_count >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- updated_at drives incremental pulls; index it per club.
do $$
declare t text;
begin
  foreach t in array array['clubs', 'club_members', 'households', 'chanda_transactions',
                           'expense_records', 'cash_handovers', 'club_events'] loop
    execute format('create trigger %I before update on public.%I
                    for each row execute function public.set_updated_at()', t || '_updated_at', t);
    if t <> 'clubs' then
      execute format('create index %I on public.%I (club_id, updated_at)', t || '_pull', t);
    end if;
  end loop;
end $$;
