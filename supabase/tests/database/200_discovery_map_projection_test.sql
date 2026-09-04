begin;

create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public, pg_catalog;

select no_plan();

select has_function(
  'public',
  'get_public_event_map_points',
  array['uuid[]'],
  'discovery exposes one bounded public map projection'
);
select ok(
  (
    select procedure.prosecdef
      and procedure.provolatile = 's'
      and procedure.proconfig = array['search_path=""']::text[]
    from pg_proc as procedure
    where procedure.oid = to_regprocedure('public.get_public_event_map_points(uuid[])')
  ),
  'the map projection is stable, security definer, and uses an empty fixed search path'
);
select ok(
  has_function_privilege('anon', 'public.get_public_event_map_points(uuid[])', 'execute')
  and has_function_privilege(
    'authenticated',
    'public.get_public_event_map_points(uuid[])',
    'execute'
  ),
  'only discovery callers may execute the safe map projection'
);
select ok(
  position(
    'address' in lower(pg_get_function_result(
      'public.get_public_event_map_points(uuid[])'::regprocedure
    ))
  ) = 0,
  'the map projection has no address field'
);

insert into auth.users (
  instance_id, id, aud, role, email, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
select
  '00000000-0000-0000-0000-000000000000', fixture.id,
  'authenticated', 'authenticated', fixture.email, statement_timestamp(),
  '{}'::jsonb, '{}'::jsonb, statement_timestamp(), statement_timestamp()
from (
  values
    ('9a000000-0000-4000-8000-000000000101'::uuid, 'map-owner@example.test'),
    ('9a000000-0000-4000-8000-000000000102'::uuid, 'map-viewer@example.test')
) as fixture(id, email);

update public.profiles
set handle = 'map_' || right(id::text, 3),
    display_name = 'Map Fan ' || right(id::text, 3),
    adult_attested_at = statement_timestamp(),
    rules_version = 1,
    rules_accepted_at = statement_timestamp(),
    profile_completed_at = statement_timestamp(),
    fan_enabled_at = statement_timestamp()
where id in (
  '9a000000-0000-4000-8000-000000000101',
  '9a000000-0000-4000-8000-000000000102'
);

insert into public.friendships (
  user_low_id, user_high_id, requested_by, status, responded_at
)
values (
  '9a000000-0000-4000-8000-000000000101',
  '9a000000-0000-4000-8000-000000000102',
  '9a000000-0000-4000-8000-000000000101',
  'accepted',
  statement_timestamp()
);

insert into public.venues (
  id, owner_id, slug, name, address_text, location, description,
  stated_capacity, facilities, house_information, default_attendance_mode,
  default_requires_approval, business_representation_attested_at,
  business_representation_attested_by
)
values (
  '9a000000-0000-4000-8000-000000000201',
  '9a000000-0000-4000-8000-000000000101',
  'map-corner', 'Map Corner',
  '12 Public Street, Haifa',
  extensions.st_setsrid(extensions.st_makepoint(34.99, 32.81), 4326)::extensions.geography,
  'A public Venue used to prove the discovery map boundary.',
  null, array['drinks']::public.venue_facility[], 'Walk in.', 'open_door', false,
  statement_timestamp(), '9a000000-0000-4000-8000-000000000101'
);

-- These exact synthetic venues exercise public or publishing behavior.
update private.venue_billing_entitlements set status='active',interval='month',interval_count=1,
  polar_customer_id='fixture-customer',polar_subscription_id='fixture-'||venue_id::text,
  polar_product_id='fixture-product',polar_product_price_id='fixture-price',amount=1500,currency='ils',
  paid_through_at=statement_timestamp()+interval '365 days',first_activated_at=statement_timestamp()
where venue_id in ('9a000000-0000-4000-8000-000000000201');

insert into public.competitions (
  id, sport_id, provider, provider_external_id, code, name, country_name, last_synced_at
)
values (
  '9a000000-0000-4000-8000-000000000301',
  '00000000-0000-4000-8000-000000000020',
  'map-test', 'map-competition', 'MAP', 'Map Test League', 'England',
  statement_timestamp()
);

insert into public.teams (
  id, sport_id, provider, provider_external_id, name, short_name, tla,
  country_name, last_synced_at
)
values
  (
    '9a000000-0000-4000-8000-000000000311',
    '00000000-0000-4000-8000-000000000020',
    'map-test', 'map-home', 'Map Home', 'Home', 'MPH', 'England', statement_timestamp()
  ),
  (
    '9a000000-0000-4000-8000-000000000312',
    '00000000-0000-4000-8000-000000000020',
    'map-test', 'map-away', 'Map Away', 'Away', 'MPA', 'England', statement_timestamp()
  );

insert into public.matches (
  id, provider, provider_external_id, competition_id, home_team_id, away_team_id,
  starts_at, status, matchday, season_label, last_synced_at
)
values (
  '9a000000-0000-4000-8000-000000000321',
  'map-test', 'map-match', '9a000000-0000-4000-8000-000000000301',
  '9a000000-0000-4000-8000-000000000311',
  '9a000000-0000-4000-8000-000000000312',
  statement_timestamp() + interval '10 days', 'timed', 1, '2026', statement_timestamp()
);

insert into public.events (
  id, created_by, host_venue_id, match_id, title, description, expected_activity,
  cost_description, event_rules, commercial_affiliation, host_presence_confirmed_at,
  starts_at, ends_at, place_kind, venue_id, audience, capacity,
  attendance_mode, requires_approval, status, published_at
)
values (
  '9a000000-0000-4000-8000-000000000401',
  '9a000000-0000-4000-8000-000000000101',
  '9a000000-0000-4000-8000-000000000201',
  '9a000000-0000-4000-8000-000000000321',
  'Public venue map event', 'A public venue event visible on the discovery map.',
  'Watch the match', 'Free', 'Respect the Venue.', 'Venue hosted', statement_timestamp(),
  statement_timestamp() + interval '10 days', statement_timestamp() + interval '10 days 3 hours',
  'venue', '9a000000-0000-4000-8000-000000000201', 'public', null,
  'open_door', false, 'published', statement_timestamp()
);

insert into public.events (
  id, created_by, host_user_id, match_id, title, description, expected_activity,
  cost_description, event_rules, commercial_affiliation, host_presence_confirmed_at,
  starts_at, ends_at, place_kind, public_place_name, public_address_text,
  public_location, audience, capacity, attendance_mode, requires_approval, status, published_at
)
values
  (
    '9a000000-0000-4000-8000-000000000402',
    '9a000000-0000-4000-8000-000000000101',
    '9a000000-0000-4000-8000-000000000101',
    '9a000000-0000-4000-8000-000000000321',
    'Visible public place', 'A friends event at a public place visible to the viewer.',
    'Watch the match', 'Free', 'Respect the host.', 'None', statement_timestamp(),
    statement_timestamp() + interval '10 days 5 minutes',
    statement_timestamp() + interval '10 days 3 hours 5 minutes',
    'public_place', 'Map Public Hall', '20 Public Street, Haifa',
    extensions.st_setsrid(extensions.st_makepoint(35.01, 32.82), 4326)::extensions.geography,
    'friends', 20, 'reservations', true, 'published', statement_timestamp()
  ),
  (
    '9a000000-0000-4000-8000-000000000404',
    '9a000000-0000-4000-8000-000000000101',
    '9a000000-0000-4000-8000-000000000101',
    '9a000000-0000-4000-8000-000000000321',
    'Invite only public place', 'An invite-only place must not enter acquisition map data.',
    'Watch the match', 'Free', 'Respect the host.', 'None', statement_timestamp(),
    statement_timestamp() + interval '10 days 15 minutes',
    statement_timestamp() + interval '10 days 3 hours 15 minutes',
    'public_place', 'Map Invite Hall', '21 Public Street, Haifa',
    extensions.st_setsrid(extensions.st_makepoint(35.02, 32.83), 4326)::extensions.geography,
    'invite_only', 20, 'reservations', true, 'published', statement_timestamp()
  );

insert into public.events (
  id, created_by, host_user_id, match_id, title, description, expected_activity,
  cost_description, event_rules, commercial_affiliation, host_presence_confirmed_at,
  starts_at, ends_at, place_kind, audience, capacity, attendance_mode,
  requires_approval, status, published_at
)
values (
  '9a000000-0000-4000-8000-000000000403',
  '9a000000-0000-4000-8000-000000000101',
  '9a000000-0000-4000-8000-000000000101',
  '9a000000-0000-4000-8000-000000000321',
  'Visible private home', 'A visible home event that must never produce a map point.',
  'Watch the match', 'Free', 'Respect the home.', 'None', statement_timestamp(),
  statement_timestamp() + interval '10 days 10 minutes',
  statement_timestamp() + interval '10 days 3 hours 10 minutes',
  'home', 'friends', 8, 'reservations', true, 'published', statement_timestamp()
);

insert into public.event_private_locations (event_id, address_text, directions, location)
values (
  '9a000000-0000-4000-8000-000000000403',
  '99 Secret Home, Haifa', 'Never reveal this location.',
  extensions.st_setsrid(extensions.st_makepoint(35.03, 32.84), 4326)::extensions.geography
);

set local role authenticated;
set local "request.jwt.claim.sub" = '9a000000-0000-4000-8000-000000000102';

select results_eq(
  $$
    select event_id, place_name, round(latitude::numeric, 2), round(longitude::numeric, 2)
    from public.get_public_event_map_points(array[
      '9a000000-0000-4000-8000-000000000401'::uuid,
      '9a000000-0000-4000-8000-000000000402'::uuid,
      '9a000000-0000-4000-8000-000000000403'::uuid,
      '9a000000-0000-4000-8000-000000000404'::uuid
    ])
  $$,
  $$values
    (
      '9a000000-0000-4000-8000-000000000401'::uuid,
      'Map Corner'::text, 32.81::numeric, 34.99::numeric
    ),
    (
      '9a000000-0000-4000-8000-000000000402'::uuid,
      'Map Public Hall'::text, 32.82::numeric, 35.01::numeric
    )
  $$,
  'an eligible viewer receives only visible Venue and public-place points'
);

select throws_ok(
  $$select * from public.get_public_event_map_points(
    array_fill('9a000000-0000-4000-8000-000000000401'::uuid, array[51])
  )$$,
  'P0001', 'VALIDATION_FAILED',
  'the projection rejects an unbounded event-id request'
);

reset role;
set local "request.jwt.claim.sub" = '';
set local role anon;

select results_eq(
  $$
    select event_id
    from public.get_public_event_map_points(array[
      '9a000000-0000-4000-8000-000000000401'::uuid,
      '9a000000-0000-4000-8000-000000000402'::uuid
    ])
  $$,
  $$values ('9a000000-0000-4000-8000-000000000401'::uuid)$$,
  'anonymous discovery maps the public Venue but not a friends-only public place'
);

reset role;

select * from finish();
rollback;
