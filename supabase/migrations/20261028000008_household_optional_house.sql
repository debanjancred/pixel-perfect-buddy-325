-- Households after UAT (2026-10-28): the house / flat number is optional (many households
-- have none), stored as '' when not given. Without it, the lane tells two residents of the
-- same name apart, so the lane joins the household's identity — the same rule the app uses
-- (api.createHousehold: same lane, house and name = the same household).

alter table public.households drop constraint households_house_flat_no_check;
alter table public.households
  alter column house_flat_no set default '',
  add constraint households_house_flat_no_check check (char_length(btrim(house_flat_no)) <= 20);

drop index public.households_identity;
create unique index households_identity on public.households
  (club_id, lower(regexp_replace(btrim(lane_block), '\s+', ' ', 'g')), lower(btrim(house_flat_no)),
   lower(regexp_replace(btrim(resident_name), '\s+', ' ', 'g')));
