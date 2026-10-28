-- Optional house number (…_household_optional_house.sql). Runs after 01–07: uses 01's club.
\set ON_ERROR_STOP on

\set club '''11111111-1111-4111-8111-111111111111'''

select test.act_as('9000000003'); -- a collector adds households
insert into public.households (id, club_id, lane_block, house_flat_no, resident_name)
  values ('ab000000-0000-4000-8000-000000000001', :club, 'নতুন গলি', '', 'আবাসিক ৫০');
select test.ok((select house_flat_no = '' from public.households
  where id = 'ab000000-0000-4000-8000-000000000001'), 'a household can have no house number');
insert into public.households (id, club_id, lane_block, resident_name)
  values ('ab000000-0000-4000-8000-000000000002', :club, 'অন্য গলি', 'আবাসিক ৫০');
select test.ok(true, 'the same name without a house number in another lane is a different household');
select test.expect_error($$insert into public.households (id, club_id, lane_block, house_flat_no,
  resident_name) values (gen_random_uuid(), '11111111-1111-4111-8111-111111111111', ' নতুন  গলি ',
  '', 'আবাসিক  ৫০')$$, 'households_identity');
select test.ok(true, 'the same lane, house and name is refused as a duplicate');
select test.expect_error($$insert into public.households (id, club_id, lane_block, house_flat_no,
  resident_name) values (gen_random_uuid(), '11111111-1111-4111-8111-111111111111', 'গলি',
  repeat('১', 21), 'আবাসিক ৫১')$$, 'households_house_flat_no_check');
select test.ok(true, 'a house number longer than 20 characters is refused');
reset role;

select test.ok(true, 'all household tests passed');
