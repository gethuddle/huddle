begin;

create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public, pg_catalog;

select no_plan();

select has_index(
  'public',
  'groups',
  'groups_active_discoverable_name_idx',
  'active discoverable group keyset ordering is indexed'
);
select has_index(
  'public',
  'events',
  'events_public_location_gist_idx',
  'public-place discovery has a GiST location index'
);
select has_index(
  'public',
  'venues',
  'venues_location_gist_idx',
  'venue discovery has a GiST location index'
);
select has_index(
  'public',
  'event_private_locations',
  'event_private_locations_location_gist_idx',
  'protected-home discovery has a GiST location index'
);
select ok(
  has_function_privilege(
    'authenticated',
    'public.evaluate_group_discoverability(uuid)',
    'execute'
  ),
  'group administrators may evaluate the complete discovery gate'
);
select ok(
  has_function_privilege(
    'authenticated',
    'public.update_group_description(uuid,text,uuid)',
    'execute'
  ),
  'group administrators may update the discovery description through a controlled RPC'
);
select ok(
  not has_function_privilege(
    'anon',
    'public.update_group_description(uuid,text,uuid)',
    'execute'
  ),
  'anonymous visitors cannot mutate group descriptions'
);
select ok(
  has_function_privilege(
    'anon',
    'public.search_groups(text,uuid,uuid,text,uuid,integer)',
    'execute'
  ),
  'anonymous visitors may invoke safe active-group search'
);
select ok(
  has_function_privilege(
    'anon',
    'public.discover_events(uuid,double precision,double precision,integer,timestamptz,timestamptz,uuid,uuid,uuid,integer,integer,timestamptz,uuid,integer)',
    'execute'
  ),
  'anonymous visitors may invoke safe event discovery'
);
select ok(
  position(
    'address_text' in pg_get_function_result(
      'public.discover_events(uuid,double precision,double precision,integer,timestamptz,timestamptz,uuid,uuid,uuid,integer,integer,timestamptz,uuid,integer)'::regprocedure
    )
  ) = 0,
  'the discovery result type structurally omits addresses'
);
select ok(
  position(
    'distance_meters' in pg_get_function_result(
      'public.discover_events(uuid,double precision,double precision,integer,timestamptz,timestamptz,uuid,uuid,uuid,integer,integer,timestamptz,uuid,integer)'::regprocedure
    )
  ) = 0,
  'the discovery result type structurally omits exact distances'
);

insert into auth.users (
  instance_id,
  id,
  aud,
  role,
  email,
  email_confirmed_at,
  raw_app_meta_data,
  raw_user_meta_data,
  created_at,
  updated_at
)
select
  '00000000-0000-0000-0000-000000000000',
  fixture.id,
  'authenticated',
  'authenticated',
  fixture.email,
  statement_timestamp(),
  '{}'::jsonb,
  '{}'::jsonb,
  statement_timestamp(),
  statement_timestamp()
from (
  values
    ('63000000-0000-4000-8000-000000000101'::uuid, 'b09-owner@example.com'),
    ('63000000-0000-4000-8000-000000000102'::uuid, 'b09-admin@example.com'),
    ('63000000-0000-4000-8000-000000000103'::uuid, 'b09-member-one@example.com'),
    ('63000000-0000-4000-8000-000000000104'::uuid, 'b09-member-two@example.com'),
    ('63000000-0000-4000-8000-000000000105'::uuid, 'b09-member-three@example.com'),
    ('63000000-0000-4000-8000-000000000106'::uuid, 'b09-outsider@example.com'),
    ('63000000-0000-4000-8000-000000000107'::uuid, 'b09-friend@example.com'),
    ('63000000-0000-4000-8000-000000000108'::uuid, 'b09-blocked@example.com')
) as fixture(id, email);

update public.profiles
set
  handle = 'b09_' || right(id::text, 3),
  display_name = 'B09 Fan ' || right(id::text, 3),
  city_id = (select id from public.cities where slug = 'haifa'),
  adult_attested_at = statement_timestamp(),
  rules_version = 1,
  rules_accepted_at = statement_timestamp(),
  profile_completed_at = statement_timestamp()
where id between
  '63000000-0000-4000-8000-000000000101' and
  '63000000-0000-4000-8000-000000000108';

insert into public.competitions (
  id, sport_id, provider, provider_external_id, code, name, country_name, last_synced_at
)
values (
  '63000000-0000-4000-8000-000000000201',
  '00000000-0000-4000-8000-000000000020',
  'b09-test',
  'competition',
  'B09',
  'B09 Premier League',
  'England',
  statement_timestamp()
);

insert into public.teams (
  id, sport_id, provider, provider_external_id, name, short_name, tla,
  country_name, last_synced_at
)
values
  (
    '63000000-0000-4000-8000-000000000202',
    '00000000-0000-4000-8000-000000000020',
    'b09-test',
    'team-a',
    'B09 Arsenal FC',
    'B09 Arsenal',
    'B9A',
    'England',
    statement_timestamp()
  ),
  (
    '63000000-0000-4000-8000-000000000203',
    '00000000-0000-4000-8000-000000000020',
    'b09-test',
    'team-b',
    'B09 Chelsea FC',
    'B09 Chelsea',
    'B9C',
    'England',
    statement_timestamp()
  ),
  (
    '63000000-0000-4000-8000-000000000204',
    '00000000-0000-4000-8000-000000000020',
    'b09-test',
    'team-c',
    'B09 Liverpool FC',
    'B09 Liverpool',
    'B9L',
    'England',
    statement_timestamp()
  );

insert into public.matches (
  id, provider, provider_external_id, competition_id, home_team_id, away_team_id,
  starts_at, status, matchday, season_label, last_synced_at
)
values
  (
    '63000000-0000-4000-8000-000000000205',
    'b09-test',
    'match-a',
    '63000000-0000-4000-8000-000000000201',
    '63000000-0000-4000-8000-000000000202',
    '63000000-0000-4000-8000-000000000203',
    statement_timestamp() + interval '7 days',
    'timed',
    1,
    '2026',
    statement_timestamp()
  ),
  (
    '63000000-0000-4000-8000-000000000206',
    'b09-test',
    'match-b',
    '63000000-0000-4000-8000-000000000201',
    '63000000-0000-4000-8000-000000000204',
    '63000000-0000-4000-8000-000000000203',
    statement_timestamp() + interval '8 days',
    'timed',
    1,
    '2026',
    statement_timestamp()
  );

insert into public.groups (
  id, slug, name, owner_id, city_id, team_id, visibility, lifecycle, description,
  activated_at
)
values
  (
    '63000000-0000-4000-8000-000000000301',
    'b09-alpha-supporters',
    'B09 Alpha Supporters',
    '63000000-0000-4000-8000-000000000101',
    (select id from public.cities where slug = 'haifa'),
    '63000000-0000-4000-8000-000000000202',
    'discoverable',
    'forming',
    'A complete description awaiting its approved future event.',
    null
  ),
  (
    '63000000-0000-4000-8000-000000000302',
    'b09-unlisted-supporters',
    'B09 Unlisted Supporters',
    '63000000-0000-4000-8000-000000000101',
    (select id from public.cities where slug = 'haifa'),
    '63000000-0000-4000-8000-000000000202',
    'unlisted',
    'active',
    'This group deliberately remains outside global search.',
    statement_timestamp()
  ),
  (
    '63000000-0000-4000-8000-000000000303',
    'b09-other-forming',
    'B09 Other Forming Group',
    '63000000-0000-4000-8000-000000000108',
    (select id from public.cities where slug = 'haifa'),
    null,
    'discoverable',
    'forming',
    'Another user forming a group that must never leak into search.',
    null
  ),
  (
    '63000000-0000-4000-8000-000000000304',
    'b09-zulu-supporters',
    'B09 Zulu Supporters',
    '63000000-0000-4000-8000-000000000101',
    (select id from public.cities where slug = 'haifa'),
    '63000000-0000-4000-8000-000000000202',
    'discoverable',
    'forming',
    'A second complete group for deterministic keyset pagination.',
    null
  );

insert into public.group_memberships (
  group_id, user_id, role, status, reviewed_by, reviewed_at
)
select
  supporter_group.group_id,
  member.user_id,
  member.role::public.group_role,
  'active'::public.group_membership_status,
  case
    when member.role = 'owner' then null
    else '63000000-0000-4000-8000-000000000101'::uuid
  end,
  case when member.role = 'owner' then null else statement_timestamp() end
from (
  values
    ('63000000-0000-4000-8000-000000000301'::uuid),
    ('63000000-0000-4000-8000-000000000302'::uuid),
    ('63000000-0000-4000-8000-000000000304'::uuid)
) as supporter_group(group_id)
cross join (
  values
    ('63000000-0000-4000-8000-000000000101'::uuid, 'owner'),
    ('63000000-0000-4000-8000-000000000102'::uuid, 'admin'),
    ('63000000-0000-4000-8000-000000000103'::uuid, 'member'),
    ('63000000-0000-4000-8000-000000000104'::uuid, 'member'),
    ('63000000-0000-4000-8000-000000000105'::uuid, 'member')
) as member(user_id, role);

insert into public.group_memberships (group_id, user_id, role, status)
values (
  '63000000-0000-4000-8000-000000000303',
  '63000000-0000-4000-8000-000000000108',
  'owner',
  'active'
);

insert into public.group_rules (group_id, position, text, published_at)
values
  (
    '63000000-0000-4000-8000-000000000301',
    1,
    'Respect every supporter and host.',
    statement_timestamp()
  ),
  (
    '63000000-0000-4000-8000-000000000304',
    1,
    'Respect every supporter and host.',
    statement_timestamp()
  );

set local role authenticated;
set local "request.jwt.claim.sub" = '63000000-0000-4000-8000-000000000101';
select is(
  (
    select concat_ws(
      ':',
      active_member_count,
      active_moderator_count,
      owner_is_active,
      has_description,
      has_published_rule,
      has_future_event,
      gate_satisfied,
      lifecycle
    )
    from public.evaluate_group_discoverability(
      '63000000-0000-4000-8000-000000000301'
    )
  ),
  '5:2:t:t:t:f:f:forming',
  'the forming panel reports every gate fact before a future event is approved'
);
set local "request.jwt.claim.sub" = '63000000-0000-4000-8000-000000000106';
select throws_ok(
  $$select * from public.evaluate_group_discoverability('63000000-0000-4000-8000-000000000301')$$,
  'P0001',
  'NOT_FOUND',
  'a non-admin cannot inspect group gate internals'
);
reset role;

insert into public.events (
  id, created_by, host_user_id, organizing_group_id, match_id, title, description,
  expected_activity, cost_description, event_rules, commercial_affiliation,
  host_presence_confirmed_at, starts_at, ends_at, city_id, place_kind,
  public_place_name, public_address_text, public_location, audience,
  audience_group_id, capacity, requires_approval, status, published_at
)
values
  (
    '63000000-0000-4000-8000-000000000501',
    '63000000-0000-4000-8000-000000000101',
    '63000000-0000-4000-8000-000000000101',
    '63000000-0000-4000-8000-000000000301',
    '63000000-0000-4000-8000-000000000205',
    'B09 Alpha group event',
    'A reviewed future group event for the activation gate.',
    'Watch the full match',
    'Free',
    'Respect the host.',
    'None',
    statement_timestamp(),
    statement_timestamp() + interval '7 days',
    statement_timestamp() + interval '7 days 3 hours',
    (select id from public.cities where slug = 'haifa'),
    'public_place',
    'B09 Community Hall',
    '21 Audience Safe Street, Haifa',
    extensions.st_setsrid(extensions.st_makepoint(35.001, 32.805), 4326)::extensions.geography,
    'group',
    '63000000-0000-4000-8000-000000000301',
    20,
    true,
    'published',
    statement_timestamp()
  ),
  (
    '63000000-0000-4000-8000-000000000502',
    '63000000-0000-4000-8000-000000000101',
    '63000000-0000-4000-8000-000000000101',
    '63000000-0000-4000-8000-000000000304',
    '63000000-0000-4000-8000-000000000205',
    'B09 Zulu group event',
    'A second reviewed future group event for pagination.',
    'Watch the full match',
    'Free',
    'Respect the host.',
    'None',
    statement_timestamp(),
    statement_timestamp() + interval '7 days 1 hour',
    statement_timestamp() + interval '7 days 4 hours',
    (select id from public.cities where slug = 'haifa'),
    'public_place',
    'B09 Zulu Hall',
    '22 Audience Safe Street, Haifa',
    extensions.st_setsrid(extensions.st_makepoint(35.002, 32.806), 4326)::extensions.geography,
    'group',
    '63000000-0000-4000-8000-000000000304',
    20,
    true,
    'published',
    statement_timestamp()
  ),
  (
    '63000000-0000-4000-8000-000000000506',
    '63000000-0000-4000-8000-000000000101',
    '63000000-0000-4000-8000-000000000101',
    '63000000-0000-4000-8000-000000000301',
    '63000000-0000-4000-8000-000000000205',
    'B09 Alpha replacement event',
    'A draft replacement used after the approved event is cancelled.',
    'Watch the full match',
    'Free',
    'Respect the host.',
    'None',
    statement_timestamp(),
    statement_timestamp() + interval '9 days',
    statement_timestamp() + interval '9 days 3 hours',
    (select id from public.cities where slug = 'haifa'),
    'public_place',
    'B09 Replacement Hall',
    '23 Audience Safe Street, Haifa',
    extensions.st_setsrid(extensions.st_makepoint(35.003, 32.807), 4326)::extensions.geography,
    'group',
    '63000000-0000-4000-8000-000000000301',
    20,
    true,
    'draft',
    null
  );

select is(
  (
    select lifecycle::text
    from public.groups
    where id = '63000000-0000-4000-8000-000000000301'
  ),
  'active',
  'approving the final future-event fact activates the group automatically'
);

set local role anon;
set local "request.jwt.claim.sub" = '';
select is(
  (
    select count(*)
    from public.search_groups('B09', null, null, null, null, 20)
  ),
  2::bigint,
  'global search returns only the two active discoverable groups'
);
select is(
  (
    select count(*)
    from public.search_groups('Unlisted', null, null, null, null, 20)
  ),
  0::bigint,
  'an unlisted group never leaks into global search'
);
select is(
  (
    select count(*)
    from public.search_groups('Other Forming', null, null, null, null, 20)
  ),
  0::bigint,
  'another user forming a group never leaks into global search'
);
reset role;

create temporary table b09_group_first_page as
select *
from public.search_groups(
  'B09',
  (select id from public.cities where slug = 'haifa'),
  '63000000-0000-4000-8000-000000000202',
  null,
  null,
  1
);

select is(
  (select count(*) from b09_group_first_page),
  1::bigint,
  'group keyset pagination returns the requested bounded first page'
);
select ok(
  (select has_more from b09_group_first_page),
  'the first group page truthfully reports another result'
);
select is(
  (
    select count(*)
    from public.search_groups(
      'B09',
      (select id from public.cities where slug = 'haifa'),
      '63000000-0000-4000-8000-000000000202',
      (select cursor_name from b09_group_first_page),
      (select group_id from b09_group_first_page),
      1
    ) as next_page
    where next_page.group_id <> (select group_id from b09_group_first_page)
  ),
  1::bigint,
  'the next group keyset page has no duplicate from the prior page'
);

update public.events
set status = 'cancelled', published_at = null, cancelled_at = statement_timestamp(),
  cancel_reason = 'Cancelled for a gate regression test.'
where id = '63000000-0000-4000-8000-000000000501';
select is(
  (select lifecycle::text from public.groups where id = '63000000-0000-4000-8000-000000000301'),
  'forming',
  'cancelling the only future event immediately removes group activation'
);
update public.events
set status = 'published', published_at = statement_timestamp()
where id = '63000000-0000-4000-8000-000000000506';

update public.group_memberships
set status = 'left'
where group_id = '63000000-0000-4000-8000-000000000301'
  and user_id = '63000000-0000-4000-8000-000000000105';
select is(
  (select lifecycle::text from public.groups where id = '63000000-0000-4000-8000-000000000301'),
  'forming',
  'dropping below five eligible members removes group activation'
);
update public.group_memberships
set status = 'active'
where group_id = '63000000-0000-4000-8000-000000000301'
  and user_id = '63000000-0000-4000-8000-000000000105';

update public.group_memberships
set role = 'member'
where group_id = '63000000-0000-4000-8000-000000000301'
  and user_id = '63000000-0000-4000-8000-000000000102';
select is(
  (select lifecycle::text from public.groups where id = '63000000-0000-4000-8000-000000000301'),
  'forming',
  'dropping below two active moderators removes group activation'
);
update public.group_memberships
set role = 'admin'
where group_id = '63000000-0000-4000-8000-000000000301'
  and user_id = '63000000-0000-4000-8000-000000000102';

update public.group_rules
set published_at = null
where group_id = '63000000-0000-4000-8000-000000000301';
select is(
  (select lifecycle::text from public.groups where id = '63000000-0000-4000-8000-000000000301'),
  'forming',
  'unpublishing the final rule removes group activation'
);
update public.group_rules
set published_at = statement_timestamp()
where group_id = '63000000-0000-4000-8000-000000000301';

set local role authenticated;
set local "request.jwt.claim.sub" = '63000000-0000-4000-8000-000000000101';
select lives_ok(
  $$select * from public.update_group_description('63000000-0000-4000-8000-000000000301', '', null)$$,
  'an administrator may clear the bounded group description'
);
select is(
  (
    select lifecycle
    from public.update_group_description(
      '63000000-0000-4000-8000-000000000301',
      'A restored complete searchable group description.',
      null
    )
  ),
  'active',
  'restoring the final description fact reactivates the group'
);
reset role;

update public.profiles
set suspended_at = statement_timestamp()
where id = '63000000-0000-4000-8000-000000000101';
select is(
  (select lifecycle::text from public.groups where id = '63000000-0000-4000-8000-000000000301'),
  'forming',
  'suspending the owner removes owner and member eligibility from the gate'
);
update public.profiles
set suspended_at = null
where id = '63000000-0000-4000-8000-000000000101';

update public.groups
set lifecycle = 'suspended', activated_at = null, suspended_at = statement_timestamp()
where id = '63000000-0000-4000-8000-000000000301';
select is(
  (select lifecycle::text from public.groups where id = '63000000-0000-4000-8000-000000000301'),
  'suspended',
  'a group suspension synchronizes the lifecycle to suspended'
);
set local role anon;
select is(
  (
    select count(*)
    from public.search_groups('Alpha', null, null, null, null, 20)
  ),
  0::bigint,
  'a suspended group is removed from search immediately'
);
reset role;
update public.groups
set lifecycle = 'forming', activated_at = null, suspended_at = null
where id = '63000000-0000-4000-8000-000000000301';
select is(
  (select lifecycle::text from public.groups where id = '63000000-0000-4000-8000-000000000301'),
  'active',
  'clearing suspension recalculates the current gate instead of leaving stale state'
);

insert into public.venues (
  id, owner_id, slug, name, city_id, address_text, location, description,
  screen_count, stated_capacity
)
values
  (
    '63000000-0000-4000-8000-000000000401',
    '63000000-0000-4000-8000-000000000101',
    'b09-near-corner',
    'B09 Near Corner',
    (select id from public.cities where slug = 'haifa'),
    '31 Public Venue Street, Haifa',
    extensions.st_setsrid(extensions.st_makepoint(35.000, 32.800), 4326)::extensions.geography,
    'A public unverified venue for discovery.',
    4,
    80
  ),
  (
    '63000000-0000-4000-8000-000000000402',
    '63000000-0000-4000-8000-000000000101',
    'b09-followed-corner',
    'B09 Followed Corner',
    (select id from public.cities where slug = 'haifa'),
    '32 Public Venue Street, Haifa',
    extensions.st_setsrid(extensions.st_makepoint(35.010, 32.810), 4326)::extensions.geography,
    'A second public unverified venue for discovery.',
    4,
    80
  );

insert into public.events (
  id, created_by, host_venue_id, match_id, title, description, expected_activity,
  cost_description, event_rules, commercial_affiliation, host_presence_confirmed_at,
  starts_at, ends_at, city_id, place_kind, venue_id, audience, audience_team_id,
  capacity, requires_approval, status, published_at
)
values
  (
    '63000000-0000-4000-8000-000000000504',
    '63000000-0000-4000-8000-000000000101',
    '63000000-0000-4000-8000-000000000401',
    '63000000-0000-4000-8000-000000000205',
    'B09 public venue event',
    'A public venue event included in anonymous discovery.',
    'Watch the full match',
    'Free',
    'Respect every supporter.',
    'None',
    statement_timestamp(),
    statement_timestamp() + interval '7 days',
    statement_timestamp() + interval '7 days 3 hours',
    (select id from public.cities where slug = 'haifa'),
    'venue',
    '63000000-0000-4000-8000-000000000401',
    'public',
    null,
    50,
    false,
    'published',
    statement_timestamp()
  ),
  (
    '63000000-0000-4000-8000-000000000505',
    '63000000-0000-4000-8000-000000000101',
    '63000000-0000-4000-8000-000000000402',
    '63000000-0000-4000-8000-000000000206',
    'B09 team follower venue event',
    'A publicly visible team-follower venue summary.',
    'Watch the full match',
    'Free',
    'Respect every supporter.',
    'None',
    statement_timestamp(),
    statement_timestamp() + interval '8 days',
    statement_timestamp() + interval '8 days 3 hours',
    (select id from public.cities where slug = 'haifa'),
    'venue',
    '63000000-0000-4000-8000-000000000402',
    'team_followers',
    '63000000-0000-4000-8000-000000000204',
    50,
    false,
    'published',
    statement_timestamp()
  );

insert into public.events (
  id, created_by, host_user_id, match_id, title, description, expected_activity,
  cost_description, event_rules, commercial_affiliation, host_presence_confirmed_at,
  starts_at, ends_at, city_id, place_kind, audience, capacity, requires_approval,
  status, published_at
)
values (
  '63000000-0000-4000-8000-000000000503',
  '63000000-0000-4000-8000-000000000101',
  '63000000-0000-4000-8000-000000000101',
  '63000000-0000-4000-8000-000000000205',
  'B09 friends home event',
  'A protected home event for an accepted direct friend.',
  'Watch the full match',
  'Free',
  'Respect the home and host.',
  'None',
  statement_timestamp(),
  statement_timestamp() + interval '7 days 2 hours',
  statement_timestamp() + interval '7 days 5 hours',
  (select id from public.cities where slug = 'haifa'),
  'home',
  'friends',
  8,
  true,
  'published',
  statement_timestamp()
);

insert into public.event_private_locations (event_id, address_text, directions, location)
values (
  '63000000-0000-4000-8000-000000000503',
  '99 B09 Secret Home, Haifa',
  'Private directions are never part of discovery.',
  extensions.st_setsrid(extensions.st_makepoint(34.997, 32.803), 4326)::extensions.geography
);

insert into public.friendships (
  user_low_id, user_high_id, requested_by, status, responded_at
)
values (
  '63000000-0000-4000-8000-000000000101',
  '63000000-0000-4000-8000-000000000107',
  '63000000-0000-4000-8000-000000000101',
  'accepted',
  statement_timestamp()
);

set local role anon;
set local "request.jwt.claim.sub" = '';
select is(
  (
    select count(*)
    from public.discover_events(
      (select id from public.cities where slug = 'haifa'),
      32.800,
      35.000,
      50,
      statement_timestamp(),
      statement_timestamp() + interval '30 days',
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      20
    )
  ),
  2::bigint,
  'anonymous discovery returns only publicly visible business-venue events'
);
select is(
  (
    select count(*)
    from public.discover_events(
      (select id from public.cities where slug = 'haifa'),
      32.800,
      35.000,
      50,
      statement_timestamp(),
      statement_timestamp() + interval '30 days',
      '63000000-0000-4000-8000-000000000202',
      null,
      null,
      null,
      null,
      null,
      null,
      20
    )
  ),
  1::bigint,
  'team filtering is applied inside the discovery query before rows return'
);
select throws_ok(
  $$select * from public.discover_events((select id from public.cities where slug = 'haifa'),32.8,35.0,12,statement_timestamp(),statement_timestamp() + interval '30 days',null,null,null,null,null,null,null,20)$$,
  'P0001',
  'VALIDATION_FAILED',
  'an unallowlisted radius is rejected in the database'
);
reset role;

create temporary table b09_event_first_page as
select *
from public.discover_events(
  (select id from public.cities where slug = 'haifa'),
  32.800,
  35.000,
  50,
  statement_timestamp(),
  statement_timestamp() + interval '30 days',
  null,
  null,
  null,
  null,
  null,
  null,
  null,
  1
);

select ok(
  (select has_more from b09_event_first_page),
  'the first event keyset page truthfully reports another result'
);
select is(
  (
    select count(*)
    from public.discover_events(
      (select id from public.cities where slug = 'haifa'),
      32.800,
      35.000,
      50,
      statement_timestamp(),
      statement_timestamp() + interval '30 days',
      null,
      null,
      null,
      (select interest_score from b09_event_first_page),
      (select cursor_distance_band from b09_event_first_page),
      (select starts_at from b09_event_first_page),
      (select event_id from b09_event_first_page),
      1
    ) as next_page
    where next_page.event_id <> (select event_id from b09_event_first_page)
  ),
  1::bigint,
  'the next event keyset page has no duplicate from the prior page'
);

set local role authenticated;
set local "request.jwt.claim.sub" = '63000000-0000-4000-8000-000000000107';
select is(
  (
    select count(*)
    from public.discover_events(
      (select id from public.cities where slug = 'haifa'),
      32.800,
      35.000,
      50,
      statement_timestamp(),
      statement_timestamp() + interval '30 days',
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      20
    )
    where event_id = '63000000-0000-4000-8000-000000000503'
  ),
  1::bigint,
  'an accepted direct friend discovers the eligible protected home event'
);
select ok(
  (
    select row_to_json(discovery)::text not like '%99 B09 Secret Home%'
      and row_to_json(discovery)::text not like '%34.997%'
      and row_to_json(discovery)::text not like '%32.803%'
    from public.discover_events(
      (select id from public.cities where slug = 'haifa'),
      32.800,
      35.000,
      50,
      statement_timestamp(),
      statement_timestamp() + interval '30 days',
      null,
      null,
      '63000000-0000-4000-8000-000000000205',
      null,
      null,
      null,
      null,
      20
    ) as discovery
    where event_id = '63000000-0000-4000-8000-000000000503'
  ),
  'eligible home discovery returns a coarse band without address or exact coordinate'
);
reset role;

insert into public.user_blocks (blocker_id, blocked_id)
values (
  '63000000-0000-4000-8000-000000000101',
  '63000000-0000-4000-8000-000000000107'
);
set local role authenticated;
set local "request.jwt.claim.sub" = '63000000-0000-4000-8000-000000000107';
select is(
  (
    select count(*)
    from public.discover_events(
      (select id from public.cities where slug = 'haifa'),
      32.800,
      35.000,
      50,
      statement_timestamp(),
      statement_timestamp() + interval '30 days',
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      20
    )
    where event_id = '63000000-0000-4000-8000-000000000503'
  ),
  0::bigint,
  'blocking immediately removes the private event from discovery'
);
reset role;
delete from public.user_blocks
where blocker_id = '63000000-0000-4000-8000-000000000101'
  and blocked_id = '63000000-0000-4000-8000-000000000107';

insert into public.group_bans (group_id, user_id, banned_by, reason)
values (
  '63000000-0000-4000-8000-000000000301',
  '63000000-0000-4000-8000-000000000103',
  '63000000-0000-4000-8000-000000000101',
  'Discovery authorization regression test.'
);
set local role authenticated;
set local "request.jwt.claim.sub" = '63000000-0000-4000-8000-000000000103';
select is(
  (
    select count(*)
    from public.discover_events(
      (select id from public.cities where slug = 'haifa'),
      32.800,
      35.000,
      50,
      statement_timestamp(),
      statement_timestamp() + interval '30 days',
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      20
    )
    where event_id = '63000000-0000-4000-8000-000000000506'
  ),
  0::bigint,
  'an active group ban removes the private group event from discovery'
);
reset role;

insert into public.venue_follows (user_id, venue_id)
values (
  '63000000-0000-4000-8000-000000000106',
  '63000000-0000-4000-8000-000000000402'
);
set local role authenticated;
set local "request.jwt.claim.sub" = '63000000-0000-4000-8000-000000000106';
select is(
  (
    select event_id
    from public.discover_events(
      (select id from public.cities where slug = 'haifa'),
      32.800,
      35.000,
      50,
      statement_timestamp(),
      statement_timestamp() + interval '30 days',
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      20
    )
    limit 1
  ),
  '63000000-0000-4000-8000-000000000505'::uuid,
  'signed-in discovery ranks a followed venue ahead of otherwise eligible public summaries'
);
reset role;

insert into public.user_blocks (blocker_id, blocked_id)
values (
  '63000000-0000-4000-8000-000000000106',
  '63000000-0000-4000-8000-000000000101'
);
set local role authenticated;
set local "request.jwt.claim.sub" = '63000000-0000-4000-8000-000000000106';
select is(
  (
    select count(*)
    from public.search_groups('Alpha', null, null, null, null, 20)
  ),
  0::bigint,
  'a viewer block with the group owner removes that group from personalized search'
);
reset role;

select * from finish();
rollback;
