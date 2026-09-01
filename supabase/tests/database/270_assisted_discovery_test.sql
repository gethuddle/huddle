begin;

create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public, pg_catalog;

select no_plan();

select has_table(
  'private',
  'assisted_discovery_actor_rate_limits',
  'per-Fan AI limits retain only private counter metadata'
);
select has_table(
  'private',
  'assisted_discovery_global_rate_limit',
  'the global AI budget has one private counter domain'
);
select ok(
  (
    select relation.relrowsecurity and relation.relforcerowsecurity
    from pg_class as relation
    join pg_namespace as namespace on namespace.oid = relation.relnamespace
    where namespace.nspname = 'private'
      and relation.relname = 'assisted_discovery_actor_rate_limits'
  ),
  'per-Fan counters have RLS enabled and forced'
);
select ok(
  (
    select relation.relrowsecurity and relation.relforcerowsecurity
    from pg_class as relation
    join pg_namespace as namespace on namespace.oid = relation.relnamespace
    where namespace.nspname = 'private'
      and relation.relname = 'assisted_discovery_global_rate_limit'
  ),
  'global counters have RLS enabled and forced'
);
select ok(
  not has_table_privilege(
    'authenticated',
    'private.assisted_discovery_actor_rate_limits',
    'select'
  )
  and not has_table_privilege(
    'authenticated',
    'private.assisted_discovery_global_rate_limit',
    'select'
  ),
  'authenticated clients cannot inspect private rate metadata'
);
select is(
  (
    select array_agg(column_name::text order by ordinal_position)
    from information_schema.columns
    where table_schema = 'private'
      and table_name = 'assisted_discovery_actor_rate_limits'
  ),
  array[
    'actor_id', 'minute_started_at', 'minute_count',
    'day_value', 'day_count', 'updated_at'
  ]::text[],
  'per-Fan counters contain no query, entity, model payload, or origin data'
);
select has_function(
  'public',
  'claim_assisted_discovery_interpretation',
  array[]::text[],
  'interpretation budget is claimed atomically at the database boundary'
);
select has_function(
  'public',
  'search_assisted_events',
  array[
    'date', 'date', 'uuid[]', 'uuid', 'text', 'text', 'text[]',
    'double precision', 'double precision'
  ],
  'assisted discovery uses one bounded authorized search RPC'
);
select ok(
  has_function_privilege(
    'authenticated',
    'public.claim_assisted_discovery_interpretation()',
    'execute'
  )
  and not has_function_privilege(
    'anon',
    'public.claim_assisted_discovery_interpretation()',
    'execute'
  ),
  'only authenticated actors can claim an interpretation'
);
select ok(
  has_function_privilege(
    'authenticated',
    'public.search_assisted_events(date,date,uuid[],uuid,text,text,text[],double precision,double precision)',
    'execute'
  )
  and not has_function_privilege(
    'anon',
    'public.search_assisted_events(date,date,uuid[],uuid,text,text,text[],double precision,double precision)',
    'execute'
  ),
  'only authenticated actors can reach the assisted search boundary'
);
select ok(
  position(
    'address' in lower(pg_get_function_result(
      'public.search_assisted_events(date,date,uuid[],uuid,text,text,text[],double precision,double precision)'::regprocedure
    ))
  ) = 0
  and position(
    'longitude' in lower(pg_get_function_result(
      'public.search_assisted_events(date,date,uuid[],uuid,text,text,text[],double precision,double precision)'::regprocedure
    ))
  ) = 0
  and position(
    'latitude' in lower(pg_get_function_result(
      'public.search_assisted_events(date,date,uuid[],uuid,text,text,text[],double precision,double precision)'::regprocedure
    ))
  ) = 0,
  'the result type structurally omits private and exact location fields'
);
select has_index(
  'public',
  'venues',
  'venues_facilities_gin_idx',
  'venue facilities support contained-by search through GIN'
);
select ok(
  position(
    'facilities text[]' in lower(pg_get_function_result(
      'public.get_venue_by_slug(text)'::regprocedure
    ))
  ) > 0,
  'the safe public Venue projection exposes controlled self-reported facilities'
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
    ('aa100000-0000-4000-8000-000000000101'::uuid, 'ai-viewer@example.com'),
    ('aa100000-0000-4000-8000-000000000102'::uuid, 'ai-friend@example.com'),
    ('aa100000-0000-4000-8000-000000000103'::uuid, 'ai-pending@example.com'),
    ('aa100000-0000-4000-8000-000000000104'::uuid, 'ai-group-host@example.com'),
    ('aa100000-0000-4000-8000-000000000105'::uuid, 'ai-venue-owner@example.com'),
    ('aa100000-0000-4000-8000-000000000106'::uuid, 'ai-blocked@example.com'),
    ('aa100000-0000-4000-8000-000000000107'::uuid, 'ai-suspended@example.com'),
    ('aa100000-0000-4000-8000-000000000108'::uuid, 'ai-other@example.com'),
    ('aa100000-0000-4000-8000-000000000109'::uuid, 'ai-venue-only@example.com'),
    ('aa100000-0000-4000-8000-000000000110'::uuid, 'ai-second-fan@example.com')
) as fixture(id, email);

update public.profiles
set
  handle = 'ai_' || right(id::text, 3),
  display_name = 'AI Test ' || right(id::text, 3),
  adult_attested_at = statement_timestamp(),
  rules_version = 1,
  rules_accepted_at = statement_timestamp(),
  profile_completed_at = statement_timestamp(),
  fan_enabled_at = statement_timestamp()
where id between
  'aa100000-0000-4000-8000-000000000101' and
  'aa100000-0000-4000-8000-000000000110'
  and id <> 'aa100000-0000-4000-8000-000000000109';

update public.profiles
set
  adult_attested_at = statement_timestamp(),
  rules_version = 1,
  rules_accepted_at = statement_timestamp()
where id = 'aa100000-0000-4000-8000-000000000109';

set local role authenticated;
set local "request.jwt.claim.sub" = 'aa100000-0000-4000-8000-000000000101';
select lives_ok(
  $$select public.claim_assisted_discovery_interpretation()$$,
  'an activated Fan can claim the first interpretation'
);
select lives_ok(
  $$select public.claim_assisted_discovery_interpretation()$$,
  'an activated Fan can claim the second interpretation in a minute'
);
select lives_ok(
  $$select public.claim_assisted_discovery_interpretation()$$,
  'an activated Fan can claim the third interpretation in a minute'
);
select throws_ok(
  $$select public.claim_assisted_discovery_interpretation()$$,
  'P0001',
  'RATE_LIMITED',
  'the fourth interpretation in a minute is rejected atomically'
);
reset role;

update private.assisted_discovery_actor_rate_limits
set minute_started_at = statement_timestamp() - interval '2 minutes',
    minute_count = 0,
    day_count = 20
where actor_id = 'aa100000-0000-4000-8000-000000000101';

set local role authenticated;
set local "request.jwt.claim.sub" = 'aa100000-0000-4000-8000-000000000101';
select throws_ok(
  $$select public.claim_assisted_discovery_interpretation()$$,
  'P0001',
  'RATE_LIMITED',
  'the twenty-first interpretation in the Israel day is rejected'
);
reset role;

update private.assisted_discovery_global_rate_limit
set day_count = 400;

set local role authenticated;
set local "request.jwt.claim.sub" = 'aa100000-0000-4000-8000-000000000110';
select throws_ok(
  $$select public.claim_assisted_discovery_interpretation()$$,
  'P0001',
  'RATE_LIMITED',
  'the global four-hundredth-call ceiling rejects another interpretation'
);
reset role;

set local role authenticated;
set local "request.jwt.claim.sub" = 'aa100000-0000-4000-8000-000000000109';
select throws_ok(
  $$select public.claim_assisted_discovery_interpretation()$$,
  'P0001',
  'PROFILE_INCOMPLETE',
  'a common-eligible Venue-only workspace cannot use Fan assisted discovery'
);
reset role;

update private.assisted_discovery_global_rate_limit set day_count = 0;

insert into public.competitions (
  id, sport_id, provider, provider_external_id, code, name, country_name, last_synced_at
)
values (
  'aa100000-0000-4000-8000-000000000201',
  '00000000-0000-4000-8000-000000000020',
  'ai-test', 'ai-competition', 'AIT', 'AI Test League', 'England', statement_timestamp()
);

insert into public.teams (
  id, sport_id, provider, provider_external_id, name, short_name, tla,
  country_name, last_synced_at
)
values
  ('aa100000-0000-4000-8000-000000000202', '00000000-0000-4000-8000-000000000020', 'ai-test', 'ai-team-a', 'AI Arsenal', 'Arsenal', 'AIA', 'England', statement_timestamp()),
  ('aa100000-0000-4000-8000-000000000203', '00000000-0000-4000-8000-000000000020', 'ai-test', 'ai-team-b', 'AI Chelsea', 'Chelsea', 'AIC', 'England', statement_timestamp()),
  ('aa100000-0000-4000-8000-000000000204', '00000000-0000-4000-8000-000000000020', 'ai-test', 'ai-team-c', 'AI United', 'United', 'AIU', 'England', statement_timestamp());

insert into public.matches (
  id, provider, provider_external_id, competition_id, home_team_id, away_team_id,
  starts_at, status, matchday, season_label, last_synced_at
)
values
  ('aa100000-0000-4000-8000-000000000205', 'ai-test', 'ai-match-ab', 'aa100000-0000-4000-8000-000000000201', 'aa100000-0000-4000-8000-000000000202', 'aa100000-0000-4000-8000-000000000203', statement_timestamp() + interval '7 days', 'timed', 1, '2026', statement_timestamp()),
  ('aa100000-0000-4000-8000-000000000206', 'ai-test', 'ai-match-ac', 'aa100000-0000-4000-8000-000000000201', 'aa100000-0000-4000-8000-000000000202', 'aa100000-0000-4000-8000-000000000204', statement_timestamp() + interval '8 days', 'timed', 2, '2026', statement_timestamp());

insert into public.friendships (
  user_low_id, user_high_id, requested_by, status, responded_at
)
values
  ('aa100000-0000-4000-8000-000000000101', 'aa100000-0000-4000-8000-000000000102', 'aa100000-0000-4000-8000-000000000101', 'accepted', statement_timestamp()),
  ('aa100000-0000-4000-8000-000000000101', 'aa100000-0000-4000-8000-000000000103', 'aa100000-0000-4000-8000-000000000101', 'pending', null),
  ('aa100000-0000-4000-8000-000000000101', 'aa100000-0000-4000-8000-000000000106', 'aa100000-0000-4000-8000-000000000101', 'accepted', statement_timestamp()),
  ('aa100000-0000-4000-8000-000000000101', 'aa100000-0000-4000-8000-000000000107', 'aa100000-0000-4000-8000-000000000101', 'accepted', statement_timestamp());

insert into public.user_blocks (blocker_id, blocked_id)
values ('aa100000-0000-4000-8000-000000000101', 'aa100000-0000-4000-8000-000000000106');

update public.profiles set suspended_at = statement_timestamp()
where id = 'aa100000-0000-4000-8000-000000000107';

insert into public.groups (
  id, slug, name, owner_id, team_id, visibility, lifecycle, description,
  activated_at, suspended_at
)
values
  ('aa100000-0000-4000-8000-000000000301', 'ai-active-group', 'AI Active Group', 'aa100000-0000-4000-8000-000000000104', 'aa100000-0000-4000-8000-000000000202', 'unlisted', 'active', 'An active AI test supporter group.', statement_timestamp(), null),
  ('aa100000-0000-4000-8000-000000000302', 'ai-left-group', 'AI Left Group', 'aa100000-0000-4000-8000-000000000104', 'aa100000-0000-4000-8000-000000000202', 'unlisted', 'active', 'A left AI test supporter group.', statement_timestamp(), null),
  ('aa100000-0000-4000-8000-000000000303', 'ai-banned-group', 'AI Banned Group', 'aa100000-0000-4000-8000-000000000104', 'aa100000-0000-4000-8000-000000000202', 'unlisted', 'active', 'A banned AI test supporter group.', statement_timestamp(), null);

insert into public.group_memberships (group_id, user_id, role, status, reviewed_by, reviewed_at)
values
  ('aa100000-0000-4000-8000-000000000301', 'aa100000-0000-4000-8000-000000000104', 'owner', 'active', null, null),
  ('aa100000-0000-4000-8000-000000000302', 'aa100000-0000-4000-8000-000000000104', 'owner', 'active', null, null),
  ('aa100000-0000-4000-8000-000000000303', 'aa100000-0000-4000-8000-000000000104', 'owner', 'active', null, null),
  ('aa100000-0000-4000-8000-000000000301', 'aa100000-0000-4000-8000-000000000101', 'member', 'active', 'aa100000-0000-4000-8000-000000000104', statement_timestamp()),
  ('aa100000-0000-4000-8000-000000000302', 'aa100000-0000-4000-8000-000000000101', 'member', 'left', 'aa100000-0000-4000-8000-000000000104', statement_timestamp()),
  ('aa100000-0000-4000-8000-000000000303', 'aa100000-0000-4000-8000-000000000101', 'member', 'banned', 'aa100000-0000-4000-8000-000000000104', statement_timestamp());

insert into public.venues (
  id, owner_id, slug, name, address_text, location, description,
  screen_count, stated_capacity, facilities, verification_status
)
values
  ('aa100000-0000-4000-8000-000000000401', 'aa100000-0000-4000-8000-000000000105', 'ai-food-venue', 'AI Food Venue', '1 Hidden Public Address, Haifa', extensions.st_setsrid(extensions.st_makepoint(35.000, 32.800), 4326)::extensions.geography, 'A venue with self-reported food for assisted search.', 4, 80, array['food','drinks']::public.venue_facility[], 'unverified'),
  ('aa100000-0000-4000-8000-000000000402', 'aa100000-0000-4000-8000-000000000105', 'ai-drinks-venue', 'AI Drinks Venue', '2 Hidden Public Address, Haifa', extensions.st_setsrid(extensions.st_makepoint(35.002, 32.802), 4326)::extensions.geography, 'A venue without self-reported food for assisted search.', 4, 80, array['drinks']::public.venue_facility[], 'unverified');

insert into public.subscriptions (user_id, kind, team_id)
values ('aa100000-0000-4000-8000-000000000101', 'team', 'aa100000-0000-4000-8000-000000000202');

insert into public.events (
  id, created_by, host_venue_id, match_id, title, description,
  expected_activity, cost_description, event_rules, commercial_affiliation,
  host_presence_confirmed_at, starts_at, ends_at, place_kind, venue_id,
  audience, capacity, requires_approval, status, published_at
)
select
  fixture.id,
  'aa100000-0000-4000-8000-000000000105',
  fixture.venue_id,
  fixture.match_id,
  fixture.title,
  'A public venue event for deterministic assisted discovery tests.',
  'Watch the match', 'Free', 'Respect the venue.', 'Venue hosted',
  statement_timestamp(),
  statement_timestamp() + fixture.start_offset,
  statement_timestamp() + fixture.start_offset + interval '3 hours',
  'venue', fixture.venue_id, 'public', fixture.capacity, false,
  'published', statement_timestamp()
from (
  values
    ('aa100000-0000-4000-8000-000000000501'::uuid, 'aa100000-0000-4000-8000-000000000401'::uuid, 'aa100000-0000-4000-8000-000000000205'::uuid, 'Food event one', interval '7 days', 20),
    ('aa100000-0000-4000-8000-000000000502'::uuid, 'aa100000-0000-4000-8000-000000000401'::uuid, 'aa100000-0000-4000-8000-000000000205'::uuid, 'Food event two', interval '7 days 10 minutes', 20),
    ('aa100000-0000-4000-8000-000000000503'::uuid, 'aa100000-0000-4000-8000-000000000401'::uuid, 'aa100000-0000-4000-8000-000000000205'::uuid, 'Food event three', interval '7 days 20 minutes', 20),
    ('aa100000-0000-4000-8000-000000000504'::uuid, 'aa100000-0000-4000-8000-000000000401'::uuid, 'aa100000-0000-4000-8000-000000000205'::uuid, 'Food event four', interval '7 days 30 minutes', 20),
    ('aa100000-0000-4000-8000-000000000505'::uuid, 'aa100000-0000-4000-8000-000000000402'::uuid, 'aa100000-0000-4000-8000-000000000205'::uuid, 'Drinks only event', interval '7 days 40 minutes', 20),
    ('aa100000-0000-4000-8000-000000000506'::uuid, 'aa100000-0000-4000-8000-000000000401'::uuid, 'aa100000-0000-4000-8000-000000000206'::uuid, 'Full venue event', interval '8 days', 1)
) as fixture(id, venue_id, match_id, title, start_offset, capacity);

insert into public.events (
  id, created_by, host_user_id, organizing_group_id, match_id, title, description,
  expected_activity, cost_description, event_rules, commercial_affiliation,
  host_presence_confirmed_at, starts_at, ends_at, place_kind,
  public_place_name, public_address_text, public_location, audience,
  audience_group_id, capacity, requires_approval, status, published_at
)
select
  fixture.id, fixture.host_id, fixture.host_id, fixture.group_id,
  'aa100000-0000-4000-8000-000000000206', fixture.title,
  'A private network event for assisted discovery authorization tests.',
  'Watch the match', 'Free', 'Respect the host.', 'None',
  statement_timestamp(), statement_timestamp() + fixture.start_offset,
  statement_timestamp() + fixture.start_offset + interval '3 hours',
  'public_place', 'AI Test Hall', '99 Never Return This Address, Haifa',
  extensions.st_setsrid(extensions.st_makepoint(35.005, 32.805), 4326)::extensions.geography,
  fixture.audience::public.event_audience, fixture.group_id, fixture.capacity, true,
  'published', statement_timestamp()
from (
  values
    ('aa100000-0000-4000-8000-000000000601'::uuid, 'aa100000-0000-4000-8000-000000000102'::uuid, null::uuid, 'Accepted friend event', 'friends', interval '8 days 5 minutes', 20),
    ('aa100000-0000-4000-8000-000000000602'::uuid, 'aa100000-0000-4000-8000-000000000103'::uuid, null::uuid, 'Pending friend event', 'friends', interval '8 days 10 minutes', 20),
    ('aa100000-0000-4000-8000-000000000603'::uuid, 'aa100000-0000-4000-8000-000000000106'::uuid, null::uuid, 'Blocked friend event', 'friends', interval '8 days 15 minutes', 20),
    ('aa100000-0000-4000-8000-000000000604'::uuid, 'aa100000-0000-4000-8000-000000000107'::uuid, null::uuid, 'Suspended friend event', 'friends', interval '8 days 20 minutes', 20),
    ('aa100000-0000-4000-8000-000000000605'::uuid, 'aa100000-0000-4000-8000-000000000102'::uuid, null::uuid, 'Full friend viewer attends', 'friends', interval '8 days 25 minutes', 1),
    ('aa100000-0000-4000-8000-000000000606'::uuid, 'aa100000-0000-4000-8000-000000000102'::uuid, null::uuid, 'Full friend unavailable', 'friends', interval '8 days 30 minutes', 1),
    ('aa100000-0000-4000-8000-000000000607'::uuid, 'aa100000-0000-4000-8000-000000000104'::uuid, 'aa100000-0000-4000-8000-000000000301'::uuid, 'Active group event', 'group', interval '8 days 35 minutes', 20),
    ('aa100000-0000-4000-8000-000000000608'::uuid, 'aa100000-0000-4000-8000-000000000104'::uuid, 'aa100000-0000-4000-8000-000000000302'::uuid, 'Left group event', 'group', interval '8 days 40 minutes', 20),
    ('aa100000-0000-4000-8000-000000000609'::uuid, 'aa100000-0000-4000-8000-000000000104'::uuid, 'aa100000-0000-4000-8000-000000000303'::uuid, 'Banned group event', 'group', interval '8 days 45 minutes', 20)
) as fixture(id, host_id, group_id, title, audience, start_offset, capacity);

insert into public.event_attendance (
  event_id, user_id, status, source, reviewed_by, reviewed_at
)
values
  ('aa100000-0000-4000-8000-000000000506', 'aa100000-0000-4000-8000-000000000108', 'approved', 'self_request', 'aa100000-0000-4000-8000-000000000105', statement_timestamp()),
  ('aa100000-0000-4000-8000-000000000605', 'aa100000-0000-4000-8000-000000000101', 'approved', 'self_request', 'aa100000-0000-4000-8000-000000000102', statement_timestamp()),
  ('aa100000-0000-4000-8000-000000000606', 'aa100000-0000-4000-8000-000000000108', 'approved', 'self_request', 'aa100000-0000-4000-8000-000000000102', statement_timestamp());

set local role authenticated;
set local "request.jwt.claim.sub" = 'aa100000-0000-4000-8000-000000000101';
create temporary table ai_general_results on commit drop as
select * from public.search_assisted_events(
  (statement_timestamp() at time zone 'Asia/Jerusalem')::date,
  (statement_timestamp() at time zone 'Asia/Jerusalem')::date + 14,
  array['aa100000-0000-4000-8000-000000000202','aa100000-0000-4000-8000-000000000203']::uuid[],
  'aa100000-0000-4000-8000-000000000201',
  'any', 'venue', array['food'], 32.800, 35.000
);
reset role;

select is(
  (select array_agg(title order by starts_at, event_id) from ai_general_results),
  array['Food event one','Food event two','Food event three']::text[],
  'two-team and facility filters produce a stable top three without relaxation'
);
select ok(
  (select bool_and(venue_facilities @> array['food']::text[]) from ai_general_results),
  'every returned facility match is explicitly self-reported by the Venue'
);
select ok(
  (select bool_and(row_to_json(result)::text not like '%Hidden Public Address%') from ai_general_results as result),
  'safe result cards never expose a Venue address or coordinates'
);

set local role authenticated;
set local "request.jwt.claim.sub" = 'aa100000-0000-4000-8000-000000000101';
create temporary table ai_friend_results on commit drop as
select * from public.search_assisted_events(
  (statement_timestamp() at time zone 'Asia/Jerusalem')::date,
  (statement_timestamp() at time zone 'Asia/Jerusalem')::date + 14,
  array['aa100000-0000-4000-8000-000000000202','aa100000-0000-4000-8000-000000000204']::uuid[],
  null, 'friend_host', 'person', '{}'::text[], null, null
);
reset role;

select is(
  (select array_agg(title order by title) from ai_friend_results),
  array['Accepted friend event','Full friend viewer attends']::text[],
  'friend search uses accepted direct hosts, permits viewer participation, and excludes pending, blocked, suspended, and unavailable full events'
);
select is(
  (select viewer_participation_state from ai_friend_results where event_id = 'aa100000-0000-4000-8000-000000000605'),
  'approved',
  'network results return only the current viewer participation state'
);
select ok(
  (select bool_and(matched_friend_host) from ai_friend_results),
  'friend results carry a deterministic matched-reason flag'
);

set local role authenticated;
set local "request.jwt.claim.sub" = 'aa100000-0000-4000-8000-000000000101';
create temporary table ai_group_results on commit drop as
select * from public.search_assisted_events(
  (statement_timestamp() at time zone 'Asia/Jerusalem')::date,
  (statement_timestamp() at time zone 'Asia/Jerusalem')::date + 14,
  array['aa100000-0000-4000-8000-000000000202']::uuid[],
  null, 'my_groups', 'person', '{}'::text[], null, null
);
reset role;

select is(
  (select array_agg(title order by title) from ai_group_results),
  array['Active group event']::text[],
  'group search requires an active, non-banned membership in the organizing or audience group'
);
select ok(
  (select bool_and(matched_my_group) from ai_group_results),
  'group results carry a deterministic matched-reason flag'
);

update public.group_memberships
set role = 'admin'
where group_id = 'aa100000-0000-4000-8000-000000000301'
  and user_id = 'aa100000-0000-4000-8000-000000000101';
update public.events
set
  created_by = 'aa100000-0000-4000-8000-000000000102',
  host_user_id = 'aa100000-0000-4000-8000-000000000102'
where id = 'aa100000-0000-4000-8000-000000000607';
update public.profiles
set suspended_at = statement_timestamp()
where id = 'aa100000-0000-4000-8000-000000000102';

set local role authenticated;
set local "request.jwt.claim.sub" = 'aa100000-0000-4000-8000-000000000101';
select is(
  (
    select count(*)
    from public.search_assisted_events(
      (statement_timestamp() at time zone 'Asia/Jerusalem')::date,
      (statement_timestamp() at time zone 'Asia/Jerusalem')::date + 14,
      array['aa100000-0000-4000-8000-000000000202']::uuid[],
      null, 'my_groups', 'person', '{}'::text[], null, null
    )
  ),
  0::bigint,
  'group management visibility never returns an event after its person host is suspended'
);
reset role;

set local role authenticated;
set local "request.jwt.claim.sub" = 'aa100000-0000-4000-8000-000000000101';
select is(
  (
    select count(*)
    from public.search_assisted_events(
      (statement_timestamp() at time zone 'Asia/Jerusalem')::date,
      (statement_timestamp() at time zone 'Asia/Jerusalem')::date + 14,
      array['aa100000-0000-4000-8000-000000000202','aa100000-0000-4000-8000-000000000204']::uuid[],
      null, 'any', 'venue', array['food'], 32.800, 35.000
    )
  ),
  0::bigint,
  'general discovery excludes full non-actionable events'
);
select throws_ok(
  $$select * from public.search_assisted_events(current_date, current_date + 1, '{}'::uuid[], null, 'any', 'any', '{}'::text[], null, null)$$,
  'P0001',
  'VALIDATION_FAILED',
  'general discovery cannot run without an origin'
);
select throws_ok(
  $$select * from public.search_assisted_events(current_date, current_date + 1, '{}'::uuid[], null, null, 'any', '{}'::text[], 32.800, 35.000)$$,
  'P0001',
  'VALIDATION_FAILED',
  'the relationship vocabulary cannot be null'
);
select throws_ok(
  $$select * from public.search_assisted_events(current_date, current_date + 1, '{}'::uuid[], null, 'any', null, '{}'::text[], 32.800, 35.000)$$,
  'P0001',
  'VALIDATION_FAILED',
  'the host-kind vocabulary cannot be null'
);
reset role;

select * from finish();
rollback;
