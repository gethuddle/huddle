begin;

create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public, pg_catalog;

select no_plan();

select isnt(
  to_regprocedure(
    'public.discover_event_feed(double precision,double precision,integer,timestamptz,timestamptz,uuid,uuid,uuid,integer,integer,timestamptz,uuid,integer)'
  ),
  null::regprocedure,
  'Explore uses one bounded discovery feed RPC'
);
select is(
  lower(pg_get_function_result(
    'public.discover_event_feed(double precision,double precision,integer,timestamptz,timestamptz,uuid,uuid,uuid,integer,integer,timestamptz,uuid,integer)'::regprocedure
  )),
  'jsonb',
  'the discovery feed returns one JSON payload'
);
select ok(
  (
    select procedure.prosecdef
      and procedure.provolatile = 's'
      and procedure.proconfig = array['search_path=""']::text[]
    from pg_proc as procedure
    where procedure.oid = to_regprocedure(
      'public.discover_event_feed(double precision,double precision,integer,timestamptz,timestamptz,uuid,uuid,uuid,integer,integer,timestamptz,uuid,integer)'
    )
  ),
  'the discovery feed is a stable security-definer projection with an empty search path'
);
select function_privs_are(
  'public',
  'discover_event_feed',
  array[
    'double precision', 'double precision', 'integer', 'timestamp with time zone',
    'timestamp with time zone', 'uuid', 'uuid', 'uuid', 'integer', 'integer',
    'timestamp with time zone', 'uuid', 'integer'
  ],
  'anon',
  array['EXECUTE'],
  'anonymous discovery may execute only the safe feed projection'
);
select function_privs_are(
  'public',
  'discover_event_feed',
  array[
    'double precision', 'double precision', 'integer', 'timestamp with time zone',
    'timestamp with time zone', 'uuid', 'uuid', 'uuid', 'integer', 'integer',
    'timestamp with time zone', 'uuid', 'integer'
  ],
  'authenticated',
  array['EXECUTE'],
  'authenticated discovery may execute the safe feed projection'
);
select function_privs_are(
  'public',
  'discover_event_feed',
  array[
    'double precision', 'double precision', 'integer', 'timestamp with time zone',
    'timestamp with time zone', 'uuid', 'uuid', 'uuid', 'integer', 'integer',
    'timestamp with time zone', 'uuid', 'integer'
  ],
  'public',
  array[]::text[],
  'the discovery feed is not granted through PUBLIC'
);
select function_privs_are(
  'public',
  'discover_event_feed',
  array[
    'double precision', 'double precision', 'integer', 'timestamp with time zone',
    'timestamp with time zone', 'uuid', 'uuid', 'uuid', 'integer', 'integer',
    'timestamp with time zone', 'uuid', 'integer'
  ],
  'service_role',
  array[]::text[],
  'the discovery feed is not an unrestricted service capability'
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
    ('fc000000-0000-4000-8000-000000000001'::uuid, 'feed-owner@example.test'),
    ('fc000000-0000-4000-8000-000000000002'::uuid, 'feed-viewer@example.test')
) as fixture(id, email);

update public.profiles
set handle = 'feed_' || right(id::text, 3),
    display_name = 'Feed Fan ' || right(id::text, 3),
    adult_attested_at = statement_timestamp(),
    rules_version = private.current_rules_version(),
    rules_accepted_at = statement_timestamp(),
    profile_completed_at = statement_timestamp(),
    fan_enabled_at = statement_timestamp()
where id in (
  'fc000000-0000-4000-8000-000000000001',
  'fc000000-0000-4000-8000-000000000002'
);

insert into public.friendships (
  user_low_id, user_high_id, requested_by, status, responded_at
)
values (
  'fc000000-0000-4000-8000-000000000001',
  'fc000000-0000-4000-8000-000000000002',
  'fc000000-0000-4000-8000-000000000001',
  'accepted',
  statement_timestamp()
);

insert into public.venues (
  id, owner_id, slug, name, address_text, location, description
)
values
  (
    'fc000000-0000-4000-8000-000000000201',
    'fc000000-0000-4000-8000-000000000001',
    'feed-active-venue', 'Feed Active Venue', '1 Feed Street, Tel Aviv',
    extensions.st_setsrid(extensions.st_makepoint(34.7818, 32.0853), 4326)::extensions.geography,
    'An active Venue used to prove the one-call discovery feed.'
  ),
  (
    'fc000000-0000-4000-8000-000000000202',
    'fc000000-0000-4000-8000-000000000001',
    'feed-unpaid-venue', 'Feed Unpaid Venue', '2 Feed Street, Tel Aviv',
    extensions.st_setsrid(extensions.st_makepoint(34.7820, 32.0855), 4326)::extensions.geography,
    'An unpaid Venue that must remain absent from discovery.'
  );

update private.venue_billing_entitlements
set status = 'active',
    interval = 'month',
    interval_count = 1,
    polar_customer_id = 'feed-customer',
    polar_subscription_id = 'feed-subscription',
    polar_product_id = 'feed-product',
    polar_product_price_id = 'feed-price',
    amount = 1500,
    currency = 'ils',
    paid_through_at = statement_timestamp() + interval '365 days',
    first_activated_at = statement_timestamp()
where venue_id = 'fc000000-0000-4000-8000-000000000201';

insert into public.competitions (
  id, sport_id, provider, provider_external_id, code, name, country_name, last_synced_at
)
values (
  'fc000000-0000-4000-8000-000000000301',
  '00000000-0000-4000-8000-000000000020',
  'feed-test', 'feed-competition', 'FED', 'Feed Test League', 'Israel',
  statement_timestamp()
);

insert into public.teams (
  id, sport_id, provider, provider_external_id, name, short_name, tla,
  crest_url, country_name, last_synced_at
)
values
  (
    'fc000000-0000-4000-8000-000000000311',
    '00000000-0000-4000-8000-000000000020',
    'feed-test', 'feed-home', 'Feed Home', 'Feed Home', 'FDH',
    'https://crests.football-data.org/9011.png', 'Israel', statement_timestamp()
  ),
  (
    'fc000000-0000-4000-8000-000000000312',
    '00000000-0000-4000-8000-000000000020',
    'feed-test', 'feed-away', 'Feed Away', 'Feed Away', 'FDA',
    'https://crests.football-data.org/9012.png', 'Israel', statement_timestamp()
  );

insert into public.matches (
  id, provider, provider_external_id, competition_id, home_team_id, away_team_id,
  starts_at, status, matchday, season_label, last_synced_at
)
values (
  'fc000000-0000-4000-8000-000000000321',
  'feed-test', 'feed-match', 'fc000000-0000-4000-8000-000000000301',
  'fc000000-0000-4000-8000-000000000311',
  'fc000000-0000-4000-8000-000000000312',
  statement_timestamp() + interval '2 days', 'timed', 1, '2026', statement_timestamp()
);

insert into public.events (
  id, created_by, host_venue_id, match_id, title, description, expected_activity,
  cost_description, event_rules, commercial_affiliation, host_presence_confirmed_at,
  starts_at, ends_at, place_kind, venue_id, audience, capacity,
  attendance_mode, requires_approval, status, published_at
)
values
  (
    'fc000000-0000-4000-8000-000000000401',
    'fc000000-0000-4000-8000-000000000001',
    'fc000000-0000-4000-8000-000000000201',
    'fc000000-0000-4000-8000-000000000321',
    'Feed reservation', 'A public reservation event.', 'Watch the match.', 'Free',
    'Respect the Venue.', 'Venue hosted', statement_timestamp(),
    statement_timestamp() + interval '2 days', statement_timestamp() + interval '2 days 3 hours',
    'venue', 'fc000000-0000-4000-8000-000000000201', 'public', 20,
    'reservations', false, 'published', statement_timestamp()
  ),
  (
    'fc000000-0000-4000-8000-000000000402',
    'fc000000-0000-4000-8000-000000000001',
    'fc000000-0000-4000-8000-000000000201',
    'fc000000-0000-4000-8000-000000000321',
    'Feed open door', 'A public walk-in event.', 'Watch the match.', 'Free',
    'Respect the Venue.', 'Venue hosted', statement_timestamp(),
    statement_timestamp() + interval '2 days 1 minute',
    statement_timestamp() + interval '2 days 3 hours 1 minute',
    'venue', 'fc000000-0000-4000-8000-000000000201', 'public', null,
    'open_door', false, 'published', statement_timestamp()
  ),
  (
    'fc000000-0000-4000-8000-000000000405',
    'fc000000-0000-4000-8000-000000000001',
    'fc000000-0000-4000-8000-000000000202',
    'fc000000-0000-4000-8000-000000000321',
    'Feed unpaid', 'An unpaid Venue event.', 'Watch the match.', 'Free',
    'Respect the Venue.', 'Venue hosted', statement_timestamp(),
    statement_timestamp() + interval '2 days 4 minutes',
    statement_timestamp() + interval '2 days 3 hours 4 minutes',
    'venue', 'fc000000-0000-4000-8000-000000000202', 'public', 20,
    'reservations', false, 'published', statement_timestamp()
  );

insert into public.events (
  id, created_by, host_user_id, match_id, title, description, expected_activity,
  cost_description, event_rules, commercial_affiliation, host_presence_confirmed_at,
  starts_at, ends_at, place_kind, public_place_name, public_address_text,
  public_location, audience, capacity, attendance_mode, requires_approval, status, published_at
)
values (
  'fc000000-0000-4000-8000-000000000403',
  'fc000000-0000-4000-8000-000000000001',
  'fc000000-0000-4000-8000-000000000001',
  'fc000000-0000-4000-8000-000000000321',
  'Feed public place', 'A visible friends event at a public place.', 'Watch the match.',
  'Free', 'Respect the host.', 'None', statement_timestamp(),
  statement_timestamp() + interval '2 days 2 minutes',
  statement_timestamp() + interval '2 days 3 hours 2 minutes',
  'public_place', 'Feed Public Hall', '3 Feed Street, Tel Aviv',
  extensions.st_setsrid(extensions.st_makepoint(34.7830, 32.0860), 4326)::extensions.geography,
  'friends', 12, 'reservations', true, 'published', statement_timestamp()
);

insert into public.events (
  id, created_by, host_user_id, match_id, title, description, expected_activity,
  cost_description, event_rules, commercial_affiliation, host_presence_confirmed_at,
  starts_at, ends_at, place_kind, audience, capacity, attendance_mode,
  requires_approval, status, published_at
)
values (
  'fc000000-0000-4000-8000-000000000404',
  'fc000000-0000-4000-8000-000000000001',
  'fc000000-0000-4000-8000-000000000001',
  'fc000000-0000-4000-8000-000000000321',
  'Feed private home', 'A visible home event with no public map point.', 'Watch the match.',
  'Free', 'Respect the home.', 'None', statement_timestamp(),
  statement_timestamp() + interval '2 days 3 minutes',
  statement_timestamp() + interval '2 days 3 hours 3 minutes',
  'home', 'friends', 8, 'reservations', true, 'published', statement_timestamp()
);

insert into public.event_private_locations (event_id, address_text, directions, location)
values (
  'fc000000-0000-4000-8000-000000000404',
  '99 Secret Feed Home, Tel Aviv', 'Never expose this location.',
  extensions.st_setsrid(extensions.st_makepoint(34.7840, 32.0870), 4326)::extensions.geography
);

set local role authenticated;
set local "request.jwt.claim.sub" = 'fc000000-0000-4000-8000-000000000002';

create temporary table feed_payload as
select public.discover_event_feed(
  32.0853, 34.7818, 15,
  statement_timestamp(), statement_timestamp() + interval '14 days',
  null, null, 'fc000000-0000-4000-8000-000000000321',
  null, null, null, null, 20
) as payload;

select is(
  (select payload ->> 'viewer_id' from feed_payload),
  'fc000000-0000-4000-8000-000000000002',
  'the payload carries the authenticated viewer identity even without a separate Auth request'
);
select is(
  (select jsonb_array_length(payload -> 'items') from feed_payload),
  4,
  'one feed returns reservation, open-door, public-place, and eligible home events exactly once'
);
select is(
  (select array_agg(item ->> 'event_id' order by ordinal)
   from feed_payload,
   lateral jsonb_array_elements(payload -> 'items') with ordinality as result(item, ordinal)),
  array[
    'fc000000-0000-4000-8000-000000000401',
    'fc000000-0000-4000-8000-000000000402',
    'fc000000-0000-4000-8000-000000000403',
    'fc000000-0000-4000-8000-000000000404'
  ],
  'the combined feed preserves deterministic discovery ordering and excludes the unpaid Venue'
);
select ok(
  (
    select bool_and(
      item ->> 'home_team_tla' = 'FDH'
      and item ->> 'away_team_tla' = 'FDA'
      and item ->> 'home_team_crest_url' = 'https://crests.football-data.org/9011.png'
      and item ->> 'away_team_crest_url' = 'https://crests.football-data.org/9012.png'
    )
    from feed_payload, lateral jsonb_array_elements(payload -> 'items') as result(item)
  ),
  'the single feed enriches every safe row with team visuals'
);
select ok(
  (
    select bool_and(
      case
        when item ->> 'place_kind' = 'home' then
          item -> 'map_place_name' = 'null'::jsonb
          and item -> 'map_latitude' = 'null'::jsonb
          and item -> 'map_longitude' = 'null'::jsonb
        when item ->> 'place_kind' in ('venue', 'public_place') then
          jsonb_typeof(item -> 'map_place_name') = 'string'
          and jsonb_typeof(item -> 'map_latitude') = 'number'
          and jsonb_typeof(item -> 'map_longitude') = 'number'
        else false
      end
    )
    from feed_payload, lateral jsonb_array_elements(payload -> 'items') as result(item)
  ),
  'only public places and Venues receive map points while a home remains coarse'
);
select ok(
  (select payload::text not like '%Secret Feed Home%'
     and payload::text not like '%address_text%'
     and payload::text not like '%distance_meters%'
   from feed_payload),
  'the one-call payload omits protected locations, addresses, and exact distance fields'
);
select is(
  (
    select payload ->> 'viewer_id'
    from public.discover_event_feed(
      32.0853, 34.7818, 15,
      statement_timestamp(), statement_timestamp() + interval '14 days',
      null, null, 'fc000000-0000-4000-8000-000000000399',
      null, null, null, null, 20
    ) as payload
  ),
  'fc000000-0000-4000-8000-000000000002',
  'an empty result still carries the viewer identity for cache isolation'
);
select is(
  (
    select jsonb_array_length(payload -> 'items')
    from public.discover_event_feed(
      32.0853, 34.7818, 15,
      statement_timestamp(), statement_timestamp() + interval '14 days',
      null, null, 'fc000000-0000-4000-8000-000000000399',
      null, null, null, null, 20
    ) as payload
  ),
  0,
  'an empty discovery result returns an empty JSON array'
);

reset role;
set local role anon;
select set_config('request.jwt.claim.sub', '', true);

select is(
  (
    select payload -> 'viewer_id'
    from public.discover_event_feed(
      32.0853, 34.7818, 15,
      statement_timestamp(), statement_timestamp() + interval '14 days',
      null, null, 'fc000000-0000-4000-8000-000000000321',
      null, null, null, null, 20
    ) as payload
  ),
  'null'::jsonb,
  'anonymous discovery returns a null viewer identity'
);
select is(
  (
    select jsonb_array_length(payload -> 'items')
    from public.discover_event_feed(
      32.0853, 34.7818, 15,
      statement_timestamp(), statement_timestamp() + interval '14 days',
      null, null, 'fc000000-0000-4000-8000-000000000321',
      null, null, null, null, 20
    ) as payload
  ),
  2,
  'anonymous discovery receives only the two entitled public Venue events'
);

reset role;
select * from finish();
rollback;
