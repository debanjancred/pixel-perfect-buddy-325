-- App control (ADR 0002 §3): one public, read-only row the app checks on every open, in the
-- background, never waiting for it. Until the owner console exists, the owner edits this row
-- in the Supabase dashboard (Table Editor → app_config). Nobody can change it through the API.
--   maintenance      pauses syncing on every phone (recording on the phone carries on)
--   min_version      phones running an older app are asked to update; their sync pauses
--   announcement_*   a short notice every member sees until they close it
--   flags            feature switches for later

create table public.app_config (
  id boolean primary key default true check (id), -- exactly one row
  maintenance boolean not null default false,
  maintenance_message_bn text check (char_length(maintenance_message_bn) <= 200),
  maintenance_message_en text check (char_length(maintenance_message_en) <= 200),
  min_version text not null default '0.0.0' check (min_version ~ '^[0-9]+\.[0-9]+\.[0-9]+$'),
  announcement_bn text check (char_length(announcement_bn) <= 300),
  announcement_en text check (char_length(announcement_en) <= 300),
  announcement_url text check (announcement_url ~ '^https://'),
  flags jsonb not null default '{}' check (jsonb_typeof(flags) = 'object'),
  updated_at timestamptz not null default now()
);
insert into public.app_config default values;

create trigger app_config_updated_at before update on public.app_config
  for each row execute function public.set_updated_at();

alter table public.app_config enable row level security;
-- Read by everyone, logged in or not (the login screen needs it too); written by no one
-- through the API.
grant select on public.app_config to anon, authenticated;
create policy app_config_read on public.app_config for select to anon, authenticated using (true);
