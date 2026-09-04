begin;

create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public, pg_catalog;

select no_plan();

select ok(
  position(
    'viewer_attendance_status' in pg_get_function_result(
      'public.discover_events(double precision,double precision,integer,timestamptz,timestamptz,uuid,uuid,uuid,integer,integer,timestamptz,uuid,integer)'::regprocedure
    )
  ) = 0,
  'acquisition discovery structurally omits viewer attendance history'
);
select ok(
  position(
    'address' in lower(pg_get_function_result(
      'public.discover_events(double precision,double precision,integer,timestamptz,timestamptz,uuid,uuid,uuid,integer,integer,timestamptz,uuid,integer)'::regprocedure
    ))
  ) = 0
  and position(
    'longitude' in lower(pg_get_function_result(
      'public.discover_events(double precision,double precision,integer,timestamptz,timestamptz,uuid,uuid,uuid,integer,integer,timestamptz,uuid,integer)'::regprocedure
    ))
  ) = 0
  and position(
    'latitude' in lower(pg_get_function_result(
      'public.discover_events(double precision,double precision,integer,timestamptz,timestamptz,uuid,uuid,uuid,integer,integer,timestamptz,uuid,integer)'::regprocedure
    ))
  ) = 0,
  'acquisition discovery structurally omits exact location fields'
);
select ok(
  has_function_privilege(
    'anon',
    'public.discover_events(double precision,double precision,integer,timestamptz,timestamptz,uuid,uuid,uuid,integer,integer,timestamptz,uuid,integer)',
    'execute'
  )
  and has_function_privilege(
    'authenticated',
    'public.discover_events(double precision,double precision,integer,timestamptz,timestamptz,uuid,uuid,uuid,integer,integer,timestamptz,uuid,integer)',
    'execute'
  ),
  'only the documented safe discovery roles retain the RPC grant'
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
    ('64500000-0000-4000-8000-000000000101'::uuid, 'task6-viewer@example.com'),
    ('64500000-0000-4000-8000-000000000102'::uuid, 'task6-friend-host@example.com'),
    ('64500000-0000-4000-8000-000000000103'::uuid, 'task6-group-host@example.com'),
    ('64500000-0000-4000-8000-000000000104'::uuid, 'task6-venue-only@example.com'),
    ('64500000-0000-4000-8000-000000000105'::uuid, 'task6-venue-owner@example.com'),
    ('64500000-0000-4000-8000-000000000106'::uuid, 'task6-blocked-host@example.com'),
    ('64500000-0000-4000-8000-000000000107'::uuid, 'task6-suspended-host@example.com'),
    ('64500000-0000-4000-8000-000000000108'::uuid, 'task6-other-attendee@example.com'),
    ('64500000-0000-4000-8000-000000000109'::uuid, 'task6-spare@example.com'),
    ('64500000-0000-4000-8000-000000000110'::uuid, 'task6-unrelated-host@example.com')
) as fixture(id, email);

update public.profiles
set
  handle = 'task6_' || right(id::text, 3),
  display_name = 'Task 6 Fan ' || right(id::text, 3),
  adult_attested_at = statement_timestamp(),
  rules_version = 1,
  rules_accepted_at = statement_timestamp(),
  profile_completed_at = statement_timestamp(),
  fan_enabled_at = statement_timestamp()
where id between
  '64500000-0000-4000-8000-000000000101' and
  '64500000-0000-4000-8000-000000000110'
  and id <> '64500000-0000-4000-8000-000000000104';

update public.profiles
set
  adult_attested_at = statement_timestamp(),
  rules_version = 1,
  rules_accepted_at = statement_timestamp()
where id = '64500000-0000-4000-8000-000000000104';

insert into public.competitions (
  id, sport_id, provider, provider_external_id, code, name, country_name, last_synced_at
)
values (
  '64500000-0000-4000-8000-000000000201',
  '00000000-0000-4000-8000-000000000020',
  'task6-test',
  'task6-competition',
  'T6',
  'Task 6 League',
  'England',
  statement_timestamp()
);

insert into public.teams (
  id, sport_id, provider, provider_external_id, name, short_name, tla,
  country_name, last_synced_at
)
values
  (
    '64500000-0000-4000-8000-000000000202',
    '00000000-0000-4000-8000-000000000020',
    'task6-test',
    'task6-team-a',
    'Task 6 Home',
    'T6 Home',
    'T6H',
    'England',
    statement_timestamp()
  ),
  (
    '64500000-0000-4000-8000-000000000203',
    '00000000-0000-4000-8000-000000000020',
    'task6-test',
    'task6-team-b',
    'Task 6 Away',
    'T6 Away',
    'T6A',
    'England',
    statement_timestamp()
  );

insert into public.matches (
  id, provider, provider_external_id, competition_id, home_team_id, away_team_id,
  starts_at, status, matchday, season_label, last_synced_at
)
values
  (
    '64500000-0000-4000-8000-000000000204',
    'task6-test',
    'task6-match-in-scope',
    '64500000-0000-4000-8000-000000000201',
    '64500000-0000-4000-8000-000000000202',
    '64500000-0000-4000-8000-000000000203',
    statement_timestamp() + interval '7 days',
    'timed',
    1,
    '2026',
    statement_timestamp()
  ),
  (
    '64500000-0000-4000-8000-000000000205',
    'task6-test',
    'task6-match-out-of-scope',
    '64500000-0000-4000-8000-000000000201',
    '64500000-0000-4000-8000-000000000203',
    '64500000-0000-4000-8000-000000000202',
    statement_timestamp() + interval '8 days',
    'timed',
    2,
    '2026',
    statement_timestamp()
  );

insert into public.groups (
  id, slug, name, owner_id, team_id, visibility, lifecycle, description,
  activated_at, suspended_at
)
values
  (
    '64500000-0000-4000-8000-000000000301',
    'task6-eligible-group',
    'Task 6 Eligible Group',
    '64500000-0000-4000-8000-000000000103',
    '64500000-0000-4000-8000-000000000202',
    'unlisted',
    'active',
    'A private group whose active member may discover a new event.',
    statement_timestamp(),
    null
  ),
  (
    '64500000-0000-4000-8000-000000000302',
    'task6-banned-group',
    'Task 6 Banned Group',
    '64500000-0000-4000-8000-000000000103',
    '64500000-0000-4000-8000-000000000202',
    'unlisted',
    'active',
    'A group used to prove a retained active ban removes discovery.',
    statement_timestamp(),
    null
  ),
  (
    '64500000-0000-4000-8000-000000000303',
    'task6-suspended-group',
    'Task 6 Suspended Group',
    '64500000-0000-4000-8000-000000000103',
    '64500000-0000-4000-8000-000000000202',
    'unlisted',
    'suspended',
    'A suspended group whose event must remain invisible.',
    null,
    statement_timestamp()
  );

insert into public.group_memberships (group_id, user_id, role, status)
select group_id, user_id, role::public.group_role, 'active'::public.group_membership_status
from (
  values
    ('64500000-0000-4000-8000-000000000301'::uuid, '64500000-0000-4000-8000-000000000103'::uuid, 'owner'),
    ('64500000-0000-4000-8000-000000000301'::uuid, '64500000-0000-4000-8000-000000000101'::uuid, 'member'),
    ('64500000-0000-4000-8000-000000000302'::uuid, '64500000-0000-4000-8000-000000000103'::uuid, 'owner'),
    ('64500000-0000-4000-8000-000000000302'::uuid, '64500000-0000-4000-8000-000000000101'::uuid, 'member'),
    ('64500000-0000-4000-8000-000000000303'::uuid, '64500000-0000-4000-8000-000000000103'::uuid, 'owner'),
    ('64500000-0000-4000-8000-000000000303'::uuid, '64500000-0000-4000-8000-000000000101'::uuid, 'member')
) as membership(group_id, user_id, role);

insert into public.group_bans (group_id, user_id, banned_by, reason)
values (
  '64500000-0000-4000-8000-000000000302',
  '64500000-0000-4000-8000-000000000101',
  '64500000-0000-4000-8000-000000000103',
  'Task 6 acquisition ban boundary.'
);

insert into public.friendships (
  user_low_id, user_high_id, requested_by, status, responded_at
)
values
  (
    '64500000-0000-4000-8000-000000000101',
    '64500000-0000-4000-8000-000000000102',
    '64500000-0000-4000-8000-000000000101',
    'accepted',
    statement_timestamp()
  ),
  (
    '64500000-0000-4000-8000-000000000101',
    '64500000-0000-4000-8000-000000000106',
    '64500000-0000-4000-8000-000000000101',
    'accepted',
    statement_timestamp()
  ),
  (
    '64500000-0000-4000-8000-000000000101',
    '64500000-0000-4000-8000-000000000107',
    '64500000-0000-4000-8000-000000000101',
    'accepted',
    statement_timestamp()
  );

insert into public.user_blocks (blocker_id, blocked_id)
values (
  '64500000-0000-4000-8000-000000000101',
  '64500000-0000-4000-8000-000000000106'
);

update public.profiles
set suspended_at = statement_timestamp()
where id = '64500000-0000-4000-8000-000000000107';

insert into public.venues (
  id, owner_id, slug, name, address_text, location, description,
  screen_count, stated_capacity, verification_status, suspended_at
)
values
  (
    '64500000-0000-4000-8000-000000000401',
    '64500000-0000-4000-8000-000000000105',
    'task6-open-venue',
    'Task 6 Open Venue',
    '1 Public Venue Street, Haifa',
    extensions.st_setsrid(extensions.st_makepoint(35.000, 32.800), 4326)::extensions.geography,
    'A nearby venue for acquisition-only discovery.',
    4,
    80,
    'unverified',
    null
  ),
  (
    '64500000-0000-4000-8000-000000000402',
    '64500000-0000-4000-8000-000000000104',
    'task6-managed-venue',
    'Task 6 Managed Venue',
    '2 Public Venue Street, Haifa',
    extensions.st_setsrid(extensions.st_makepoint(35.002, 32.802), 4326)::extensions.geography,
    'A Venue workspace whose inventory is not an acquisition.',
    4,
    80,
    'unverified',
    null
  ),
  (
    '64500000-0000-4000-8000-000000000403',
    '64500000-0000-4000-8000-000000000105',
    'task6-far-venue',
    'Task 6 Far Venue',
    '3 Public Venue Street, Israel',
    extensions.st_setsrid(extensions.st_makepoint(34.800, 29.550), 4326)::extensions.geography,
    'A valid Israeli venue outside the requested radius.',
    4,
    80,
    'unverified',
    null
  ),
  (
    '64500000-0000-4000-8000-000000000404',
    '64500000-0000-4000-8000-000000000105',
    'task6-suspended-venue',
    'Task 6 Suspended Venue',
    '4 Public Venue Street, Haifa',
    extensions.st_setsrid(extensions.st_makepoint(35.004, 32.804), 4326)::extensions.geography,
    'A suspended venue that must never enter discovery.',
    4,
    80,
    'suspended',
    statement_timestamp()
  );

-- These exact synthetic venues exercise public or publishing behavior.
update private.venue_billing_entitlements set status='active',interval='month',interval_count=1,
  polar_customer_id='fixture-customer',polar_subscription_id='fixture-'||venue_id::text,
  polar_product_id='fixture-product',polar_product_price_id='fixture-price',amount=1500,currency='ils',
  paid_through_at=statement_timestamp()+interval '365 days',first_activated_at=statement_timestamp()
where venue_id in ('64500000-0000-4000-8000-000000000401','64500000-0000-4000-8000-000000000402','64500000-0000-4000-8000-000000000403','64500000-0000-4000-8000-000000000404');

insert into public.venue_memberships (venue_id, user_id, role, status)
values (
  '64500000-0000-4000-8000-000000000402',
  '64500000-0000-4000-8000-000000000101',
  'admin',
  'active'
);

insert into public.subscriptions (user_id, kind, sport_id, competition_id, team_id)
values (
  '64500000-0000-4000-8000-000000000101',
  'team',
  null,
  null,
  '64500000-0000-4000-8000-000000000202'
);

insert into public.events (
  id, created_by, host_user_id, organizing_group_id, match_id, title, description,
  expected_activity, cost_description, event_rules, commercial_affiliation,
  host_presence_confirmed_at, starts_at, ends_at, place_kind,
  public_place_name, public_address_text, public_location, audience,
  audience_group_id, capacity, requires_approval, status, published_at
)
values
  (
    '64500000-0000-4000-8000-000000000501',
    '64500000-0000-4000-8000-000000000103',
    '64500000-0000-4000-8000-000000000103',
    '64500000-0000-4000-8000-000000000301',
    '64500000-0000-4000-8000-000000000204',
    'Eligible group opportunity',
    'A genuinely new group event for the active member.',
    'Watch the match', 'Free', 'Respect the group.', 'None',
    statement_timestamp(), statement_timestamp() + interval '7 days',
    statement_timestamp() + interval '7 days 3 hours',
    'public_place', 'Task 6 Group Hall', '10 Public Street, Haifa',
    extensions.st_setsrid(extensions.st_makepoint(35.006, 32.806), 4326)::extensions.geography,
    'group', '64500000-0000-4000-8000-000000000301', 20, true,
    'published', statement_timestamp()
  ),
  (
    '64500000-0000-4000-8000-000000000503',
    '64500000-0000-4000-8000-000000000101',
    '64500000-0000-4000-8000-000000000101',
    null,
    '64500000-0000-4000-8000-000000000204',
    'Viewer hosted event',
    'A personally hosted event belongs in My Huddle, not Explore.',
    'Watch the match', 'Free', 'Respect the host.', 'None',
    statement_timestamp(), statement_timestamp() + interval '7 days 10 minutes',
    statement_timestamp() + interval '7 days 3 hours 10 minutes',
    'public_place', 'Task 6 Hosted Hall', '11 Public Street, Haifa',
    extensions.st_setsrid(extensions.st_makepoint(35.007, 32.807), 4326)::extensions.geography,
    'friends', null, 20, true, 'published', statement_timestamp()
  ),
  (
    '64500000-0000-4000-8000-000000000504',
    '64500000-0000-4000-8000-000000000101',
    '64500000-0000-4000-8000-000000000103',
    '64500000-0000-4000-8000-000000000301',
    '64500000-0000-4000-8000-000000000204',
    'Viewer created group submission',
    'A submitted event is already owned work rather than acquisition.',
    'Watch the match', 'Free', 'Respect the group.', 'None',
    statement_timestamp(), statement_timestamp() + interval '7 days 20 minutes',
    statement_timestamp() + interval '7 days 3 hours 20 minutes',
    'public_place', 'Task 6 Submitted Hall', '12 Public Street, Haifa',
    extensions.st_setsrid(extensions.st_makepoint(35.008, 32.808), 4326)::extensions.geography,
    'group', '64500000-0000-4000-8000-000000000301', 20, true,
    'published', statement_timestamp()
  ),
  (
    '64500000-0000-4000-8000-000000000505',
    '64500000-0000-4000-8000-000000000102',
    '64500000-0000-4000-8000-000000000102',
    null,
    '64500000-0000-4000-8000-000000000204',
    'Invite only pending event',
    'An invite-only relationship belongs in Attention, not acquisition.',
    'Watch the match', 'Free', 'Respect the host.', 'None',
    statement_timestamp(), statement_timestamp() + interval '7 days 30 minutes',
    statement_timestamp() + interval '7 days 3 hours 30 minutes',
    'public_place', 'Task 6 Invite Hall', '13 Public Street, Haifa',
    extensions.st_setsrid(extensions.st_makepoint(35.009, 32.809), 4326)::extensions.geography,
    'invite_only', null, 20, true, 'published', statement_timestamp()
  ),
  (
    '64500000-0000-4000-8000-000000000506',
    '64500000-0000-4000-8000-000000000106',
    '64500000-0000-4000-8000-000000000106',
    null,
    '64500000-0000-4000-8000-000000000204',
    'Blocked host event',
    'A blocked private host must remain invisible in discovery.',
    'Watch the match', 'Free', 'Respect the host.', 'None',
    statement_timestamp(), statement_timestamp() + interval '7 days 40 minutes',
    statement_timestamp() + interval '7 days 3 hours 40 minutes',
    'public_place', 'Task 6 Blocked Hall', '14 Public Street, Haifa',
    extensions.st_setsrid(extensions.st_makepoint(35.010, 32.810), 4326)::extensions.geography,
    'friends', null, 20, true, 'published', statement_timestamp()
  ),
  (
    '64500000-0000-4000-8000-000000000507',
    '64500000-0000-4000-8000-000000000103',
    '64500000-0000-4000-8000-000000000103',
    '64500000-0000-4000-8000-000000000302',
    '64500000-0000-4000-8000-000000000204',
    'Banned group event',
    'An active group ban removes this otherwise eligible private event.',
    'Watch the match', 'Free', 'Respect the group.', 'None',
    statement_timestamp(), statement_timestamp() + interval '7 days 50 minutes',
    statement_timestamp() + interval '7 days 3 hours 50 minutes',
    'public_place', 'Task 6 Banned Hall', '15 Public Street, Haifa',
    extensions.st_setsrid(extensions.st_makepoint(35.011, 32.811), 4326)::extensions.geography,
    'group', '64500000-0000-4000-8000-000000000302', 20, true,
    'published', statement_timestamp()
  ),
  (
    '64500000-0000-4000-8000-000000000508',
    '64500000-0000-4000-8000-000000000107',
    '64500000-0000-4000-8000-000000000107',
    null,
    '64500000-0000-4000-8000-000000000204',
    'Suspended host event',
    'A suspended private host must remain invisible in discovery.',
    'Watch the match', 'Free', 'Respect the host.', 'None',
    statement_timestamp(), statement_timestamp() + interval '7 days 60 minutes',
    statement_timestamp() + interval '7 days 4 hours',
    'public_place', 'Task 6 Suspended Hall', '16 Public Street, Haifa',
    extensions.st_setsrid(extensions.st_makepoint(35.012, 32.812), 4326)::extensions.geography,
    'friends', null, 20, true, 'published', statement_timestamp()
  ),
  (
    '64500000-0000-4000-8000-000000000509',
    '64500000-0000-4000-8000-000000000110',
    '64500000-0000-4000-8000-000000000110',
    null,
    '64500000-0000-4000-8000-000000000204',
    'Unrelated private event',
    'An unrelated private host grants no visibility to this viewer.',
    'Watch the match', 'Free', 'Respect the host.', 'None',
    statement_timestamp(), statement_timestamp() + interval '7 days 70 minutes',
    statement_timestamp() + interval '7 days 4 hours 10 minutes',
    'public_place', 'Task 6 Unrelated Hall', '17 Public Street, Haifa',
    extensions.st_setsrid(extensions.st_makepoint(35.013, 32.813), 4326)::extensions.geography,
    'friends', null, 20, true, 'published', statement_timestamp()
  ),
  (
    '64500000-0000-4000-8000-000000000510',
    '64500000-0000-4000-8000-000000000103',
    '64500000-0000-4000-8000-000000000103',
    '64500000-0000-4000-8000-000000000303',
    '64500000-0000-4000-8000-000000000204',
    'Suspended group event',
    'A suspended group must not leak its private future event.',
    'Watch the match', 'Free', 'Respect the group.', 'None',
    statement_timestamp(), statement_timestamp() + interval '7 days 80 minutes',
    statement_timestamp() + interval '7 days 4 hours 20 minutes',
    'public_place', 'Task 6 Suspended Group Hall', '18 Public Street, Haifa',
    extensions.st_setsrid(extensions.st_makepoint(35.014, 32.814), 4326)::extensions.geography,
    'group', '64500000-0000-4000-8000-000000000303', 20, true,
    'published', statement_timestamp()
  );

insert into public.events (
  id, created_by, host_user_id, match_id, title, description, expected_activity,
  cost_description, event_rules, commercial_affiliation, host_presence_confirmed_at,
  starts_at, ends_at, place_kind, audience, capacity, requires_approval,
  status, published_at
)
values (
  '64500000-0000-4000-8000-000000000502',
  '64500000-0000-4000-8000-000000000102',
  '64500000-0000-4000-8000-000000000102',
  '64500000-0000-4000-8000-000000000204',
  'Eligible friends opportunity',
  'A genuinely new friends-only home event with coarse discovery.',
  'Watch the match', 'Free', 'Respect the home.', 'None',
  statement_timestamp(), statement_timestamp() + interval '7 days 5 minutes',
  statement_timestamp() + interval '7 days 3 hours 5 minutes',
  'home', 'friends', 8, true, 'published', statement_timestamp()
);

insert into public.event_private_locations (event_id, address_text, directions, location)
values (
  '64500000-0000-4000-8000-000000000502',
  '99 Task 6 Secret Home, Haifa',
  'Private directions must never enter discovery.',
  extensions.st_setsrid(extensions.st_makepoint(35.005, 32.805), 4326)::extensions.geography
);

insert into public.events (
  id, created_by, host_venue_id, match_id, title, description, expected_activity,
  cost_description, event_rules, commercial_affiliation, host_presence_confirmed_at,
  starts_at, ends_at, place_kind, venue_id, audience, audience_team_id,
  capacity, requires_approval, status, published_at, cancelled_at, cancel_reason
)
select
  fixture.id,
  '64500000-0000-4000-8000-000000000105',
  fixture.venue_id,
  fixture.match_id,
  fixture.title,
  'A bounded Task 6 venue event used by the acquisition matrix.',
  'Watch the match',
  'Free',
  'Respect every supporter.',
  'None',
  statement_timestamp(),
  statement_timestamp() + fixture.start_offset,
  statement_timestamp() + fixture.end_offset,
  'venue',
  fixture.venue_id,
  fixture.audience::public.event_audience,
  case when fixture.audience = 'team_followers'
    then '64500000-0000-4000-8000-000000000202'::uuid
    else null
  end,
  fixture.capacity,
  fixture.requires_approval,
  fixture.status::public.event_status,
  case when fixture.status in ('published', 'completed') then statement_timestamp() else null end,
  case when fixture.status = 'cancelled' then statement_timestamp() else null end,
  case when fixture.status = 'cancelled' then 'Cancelled for the Task 6 matrix.' else null end
from (
  values
    ('64500000-0000-4000-8000-000000000601'::uuid, '64500000-0000-4000-8000-000000000401'::uuid, '64500000-0000-4000-8000-000000000204'::uuid, 'Eligible public opportunity', 'public', 40, false, 'published', interval '7 days', interval '7 days 3 hours'),
    ('64500000-0000-4000-8000-000000000602'::uuid, '64500000-0000-4000-8000-000000000401'::uuid, '64500000-0000-4000-8000-000000000204'::uuid, 'Eligible team opportunity', 'team_followers', 40, false, 'published', interval '7 days 2 minutes', interval '7 days 3 hours 2 minutes'),
    ('64500000-0000-4000-8000-000000000603'::uuid, '64500000-0000-4000-8000-000000000401'::uuid, '64500000-0000-4000-8000-000000000204'::uuid, 'Attendance requested event', 'public', 40, false, 'published', interval '7 days 3 minutes', interval '7 days 3 hours 3 minutes'),
    ('64500000-0000-4000-8000-000000000604'::uuid, '64500000-0000-4000-8000-000000000401'::uuid, '64500000-0000-4000-8000-000000000204'::uuid, 'Attendance approved event', 'public', 40, false, 'published', interval '7 days 4 minutes', interval '7 days 3 hours 4 minutes'),
    ('64500000-0000-4000-8000-000000000605'::uuid, '64500000-0000-4000-8000-000000000401'::uuid, '64500000-0000-4000-8000-000000000204'::uuid, 'Attendance declined event', 'public', 40, false, 'published', interval '7 days 5 minutes', interval '7 days 3 hours 5 minutes'),
    ('64500000-0000-4000-8000-000000000606'::uuid, '64500000-0000-4000-8000-000000000401'::uuid, '64500000-0000-4000-8000-000000000204'::uuid, 'Attendance left event', 'public', 40, false, 'published', interval '7 days 6 minutes', interval '7 days 3 hours 6 minutes'),
    ('64500000-0000-4000-8000-000000000607'::uuid, '64500000-0000-4000-8000-000000000401'::uuid, '64500000-0000-4000-8000-000000000204'::uuid, 'Attendance removed event', 'public', 40, false, 'published', interval '7 days 7 minutes', interval '7 days 3 hours 7 minutes'),
    ('64500000-0000-4000-8000-000000000608'::uuid, '64500000-0000-4000-8000-000000000401'::uuid, '64500000-0000-4000-8000-000000000204'::uuid, 'Invitation accepted event', 'public', 40, false, 'published', interval '7 days 8 minutes', interval '7 days 3 hours 8 minutes'),
    ('64500000-0000-4000-8000-000000000609'::uuid, '64500000-0000-4000-8000-000000000401'::uuid, '64500000-0000-4000-8000-000000000204'::uuid, 'Invitation declined event', 'public', 40, false, 'published', interval '7 days 9 minutes', interval '7 days 3 hours 9 minutes'),
    ('64500000-0000-4000-8000-000000000610'::uuid, '64500000-0000-4000-8000-000000000401'::uuid, '64500000-0000-4000-8000-000000000204'::uuid, 'Invitation revoked event', 'public', 40, false, 'published', interval '7 days 10 minutes', interval '7 days 3 hours 10 minutes'),
    ('64500000-0000-4000-8000-000000000611'::uuid, '64500000-0000-4000-8000-000000000401'::uuid, '64500000-0000-4000-8000-000000000204'::uuid, 'Full event', 'public', 1, false, 'published', interval '7 days 11 minutes', interval '7 days 3 hours 11 minutes'),
    ('64500000-0000-4000-8000-000000000612'::uuid, '64500000-0000-4000-8000-000000000401'::uuid, '64500000-0000-4000-8000-000000000204'::uuid, 'Draft event', 'public', 40, false, 'draft', interval '7 days 12 minutes', interval '7 days 3 hours 12 minutes'),
    ('64500000-0000-4000-8000-000000000613'::uuid, '64500000-0000-4000-8000-000000000401'::uuid, '64500000-0000-4000-8000-000000000204'::uuid, 'Pending review event', 'public', 40, false, 'pending_group_review', interval '7 days 13 minutes', interval '7 days 3 hours 13 minutes'),
    ('64500000-0000-4000-8000-000000000614'::uuid, '64500000-0000-4000-8000-000000000401'::uuid, '64500000-0000-4000-8000-000000000204'::uuid, 'Cancelled event', 'public', 40, false, 'cancelled', interval '7 days 14 minutes', interval '7 days 3 hours 14 minutes'),
    ('64500000-0000-4000-8000-000000000615'::uuid, '64500000-0000-4000-8000-000000000401'::uuid, '64500000-0000-4000-8000-000000000204'::uuid, 'Completed event', 'public', 40, false, 'completed', interval '7 days 15 minutes', interval '7 days 3 hours 15 minutes'),
    ('64500000-0000-4000-8000-000000000616'::uuid, '64500000-0000-4000-8000-000000000401'::uuid, '64500000-0000-4000-8000-000000000204'::uuid, 'Started event', 'public', 40, false, 'published', interval '-1 hour', interval '2 hours'),
    ('64500000-0000-4000-8000-000000000617'::uuid, '64500000-0000-4000-8000-000000000401'::uuid, '64500000-0000-4000-8000-000000000204'::uuid, 'Outside date event', 'public', 40, false, 'published', interval '35 days', interval '35 days 3 hours'),
    ('64500000-0000-4000-8000-000000000618'::uuid, '64500000-0000-4000-8000-000000000403'::uuid, '64500000-0000-4000-8000-000000000204'::uuid, 'Outside radius event', 'public', 40, false, 'published', interval '7 days 16 minutes', interval '7 days 3 hours 16 minutes'),
    ('64500000-0000-4000-8000-000000000619'::uuid, '64500000-0000-4000-8000-000000000404'::uuid, '64500000-0000-4000-8000-000000000204'::uuid, 'Suspended venue event', 'public', 40, false, 'published', interval '7 days 17 minutes', interval '7 days 3 hours 17 minutes'),
    ('64500000-0000-4000-8000-000000000620'::uuid, '64500000-0000-4000-8000-000000000402'::uuid, '64500000-0000-4000-8000-000000000204'::uuid, 'Viewer managed venue event', 'public', 40, false, 'published', interval '7 days 18 minutes', interval '7 days 3 hours 18 minutes'),
    ('64500000-0000-4000-8000-000000000621'::uuid, '64500000-0000-4000-8000-000000000401'::uuid, '64500000-0000-4000-8000-000000000205'::uuid, 'Outside match filter event', 'public', 40, false, 'published', interval '8 days', interval '8 days 3 hours'),
    ('64500000-0000-4000-8000-000000000622'::uuid, '64500000-0000-4000-8000-000000000401'::uuid, '64500000-0000-4000-8000-000000000204'::uuid, 'Pending invitation public event', 'public', 40, false, 'published', interval '7 days 19 minutes', interval '7 days 3 hours 19 minutes')
) as fixture(
  id, venue_id, match_id, title, audience, capacity, requires_approval, status,
  start_offset, end_offset
);

insert into public.event_invitations (
  event_id, invitee_id, invited_by, status, responded_at
)
values
  (
    '64500000-0000-4000-8000-000000000622',
    '64500000-0000-4000-8000-000000000101',
    '64500000-0000-4000-8000-000000000102',
    'pending',
    null
  ),
  (
    '64500000-0000-4000-8000-000000000608',
    '64500000-0000-4000-8000-000000000101',
    '64500000-0000-4000-8000-000000000105',
    'accepted',
    statement_timestamp()
  ),
  (
    '64500000-0000-4000-8000-000000000609',
    '64500000-0000-4000-8000-000000000101',
    '64500000-0000-4000-8000-000000000105',
    'declined',
    statement_timestamp()
  ),
  (
    '64500000-0000-4000-8000-000000000610',
    '64500000-0000-4000-8000-000000000101',
    '64500000-0000-4000-8000-000000000105',
    'revoked',
    statement_timestamp()
  ),
  (
    '64500000-0000-4000-8000-000000000606',
    '64500000-0000-4000-8000-000000000101',
    '64500000-0000-4000-8000-000000000105',
    'accepted',
    statement_timestamp()
  );

insert into public.event_attendance (
  event_id, user_id, status, source, reviewed_by, reviewed_at, left_at,
  removed_by, removed_at, removal_reason
)
values
  ('64500000-0000-4000-8000-000000000603', '64500000-0000-4000-8000-000000000101', 'requested', 'self_request', null, null, null, null, null, null),
  ('64500000-0000-4000-8000-000000000604', '64500000-0000-4000-8000-000000000101', 'approved', 'self_request', '64500000-0000-4000-8000-000000000105', statement_timestamp(), null, null, null, null),
  ('64500000-0000-4000-8000-000000000605', '64500000-0000-4000-8000-000000000101', 'declined', 'self_request', '64500000-0000-4000-8000-000000000105', statement_timestamp(), null, null, null, null),
  ('64500000-0000-4000-8000-000000000606', '64500000-0000-4000-8000-000000000101', 'left', 'direct_invite', '64500000-0000-4000-8000-000000000105', statement_timestamp(), statement_timestamp(), null, null, null),
  ('64500000-0000-4000-8000-000000000607', '64500000-0000-4000-8000-000000000101', 'removed', 'self_request', '64500000-0000-4000-8000-000000000105', statement_timestamp(), null, '64500000-0000-4000-8000-000000000105', statement_timestamp(), 'Removed for the Task 6 matrix.'),
  ('64500000-0000-4000-8000-000000000622', '64500000-0000-4000-8000-000000000101', 'left', 'direct_invite', '64500000-0000-4000-8000-000000000105', statement_timestamp(), statement_timestamp(), null, null, null),
  ('64500000-0000-4000-8000-000000000611', '64500000-0000-4000-8000-000000000108', 'approved', 'self_request', '64500000-0000-4000-8000-000000000105', statement_timestamp(), null, null, null, null);

set local role authenticated;
set local "request.jwt.claim.sub" = '64500000-0000-4000-8000-000000000101';
create temporary table task6_fan_results on commit drop as
select *
from public.discover_events(
  32.800,
  35.000,
  50,
  statement_timestamp(),
  statement_timestamp() + interval '30 days',
  null,
  null,
  '64500000-0000-4000-8000-000000000204',
  null,
  null,
  null,
  null,
  50
);
reset role;

select is(
  (select array_agg(title order by title) from task6_fan_results),
  array[
    'Attendance left event',
    'Eligible friends opportunity',
    'Eligible group opportunity',
    'Eligible public opportunity',
    'Eligible team opportunity',
    'Viewer created group submission',
    'Viewer hosted event',
    'Viewer managed venue event'
  ]::text[],
  'a signed-in Fan receives new opportunities plus events they created or manage'
);
select is(
  (select count(*) from task6_fan_results where event_id = '64500000-0000-4000-8000-000000000606'),
  1::bigint,
  'retained left attendance does not permanently hide an otherwise-actionable event'
);
select is(
  (select count(*) from task6_fan_results where audience = 'invite_only'),
  0::bigint,
  'invite-only events are categorically absent from acquisition discovery'
);
select is(
  (select count(*) from task6_fan_results where event_id = '64500000-0000-4000-8000-000000000622'),
  0::bigint,
  'a current pending invitation still excludes an otherwise-visible event with retained left attendance'
);
select ok(
  (
    select location_summary like '%km%'
      and row_to_json(result)::text not like '%99 Task 6 Secret Home%'
      and row_to_json(result)::text not like '%35.005%'
      and row_to_json(result)::text not like '%32.805%'
    from task6_fan_results as result
    where event_id = '64500000-0000-4000-8000-000000000502'
  ),
  'eligible home acquisition keeps only a coarse band and no exact location'
);

set local role anon;
set local "request.jwt.claim.sub" = '';
create temporary table task6_anon_results on commit drop as
select *
from public.discover_events(
  32.800,
  35.000,
  50,
  statement_timestamp(),
  statement_timestamp() + interval '30 days',
  null,
  null,
  '64500000-0000-4000-8000-000000000204',
  null,
  null,
  null,
  null,
  50
);
reset role;

select is(
  (select count(*) from task6_anon_results),
  12::bigint,
  'anonymous discovery keeps only safe, available public and team-follower acquisition rows'
);
select is(
  (select count(*) from task6_anon_results where host_kind <> 'venue' or audience not in ('public', 'team_followers')),
  0::bigint,
  'anonymous acquisition never gains private Fan visibility'
);
select is(
  (select count(*) from task6_anon_results where title = 'Full event'),
  0::bigint,
  'anonymous acquisition excludes a capacity-exhausted event before pagination'
);

set local role authenticated;
set local "request.jwt.claim.sub" = '64500000-0000-4000-8000-000000000104';
create temporary table task6_venue_only_results on commit drop as
select *
from public.discover_events(
  32.800,
  35.000,
  50,
  statement_timestamp(),
  statement_timestamp() + interval '30 days',
  null,
  null,
  '64500000-0000-4000-8000-000000000204',
  null,
  null,
  null,
  null,
  50
);
reset role;

select is(
  (select count(*) from task6_venue_only_results),
  12::bigint,
  'a Venue-only actor receives public acquisition including its own Venue inventory'
);
select is(
  (select count(*) from task6_venue_only_results where title = 'Viewer managed venue event'),
  1::bigint,
  'active Venue membership keeps that Venue inventory visible to its manager'
);
select is(
  (select count(*) from task6_venue_only_results where host_kind <> 'venue' or audience not in ('public', 'team_followers')),
  0::bigint,
  'Venue-only acquisition does not grant group, friends, or invite-only Fan visibility'
);

set local role authenticated;
set local "request.jwt.claim.sub" = '64500000-0000-4000-8000-000000000101';
create temporary table task6_fan_first_page on commit drop as
select *
from public.discover_events(
  32.800,
  35.000,
  50,
  statement_timestamp(),
  statement_timestamp() + interval '30 days',
  null,
  null,
  '64500000-0000-4000-8000-000000000204',
  null,
  null,
  null,
  null,
  4
);

create temporary table task6_fan_second_page on commit drop as
select *
from public.discover_events(
  32.800,
  35.000,
  50,
  statement_timestamp(),
  statement_timestamp() + interval '30 days',
  null,
  null,
  '64500000-0000-4000-8000-000000000204',
  (
    select interest_score from task6_fan_first_page
    order by interest_score desc, cursor_distance_band, starts_at, event_id
    offset 3 limit 1
  ),
  (
    select cursor_distance_band from task6_fan_first_page
    order by interest_score desc, cursor_distance_band, starts_at, event_id
    offset 3 limit 1
  ),
  (
    select starts_at from task6_fan_first_page
    order by interest_score desc, cursor_distance_band, starts_at, event_id
    offset 3 limit 1
  ),
  (
    select event_id from task6_fan_first_page
    order by interest_score desc, cursor_distance_band, starts_at, event_id
    offset 3 limit 1
  ),
  4
);
reset role;

select is((select count(*) from task6_fan_first_page), 4::bigint, 'the first acquisition page is full');
select ok((select bool_and(has_more) from task6_fan_first_page), 'the first acquisition page reports more eligible rows');
select is((select count(*) from task6_fan_second_page), 4::bigint, 'the second page contains the remaining owned and acquisition rows');
select ok((select not bool_or(has_more) from task6_fan_second_page), 'the final acquisition page reports the true end');
select is(
  (
    select count(*)
    from task6_fan_first_page as first_page
    join task6_fan_second_page as second_page using (event_id)
  ),
  0::bigint,
  'keyset acquisition pages contain no duplicate event'
);
select is(
  (
    select array_agg(title order by title)
    from (
      select title from task6_fan_first_page
      union all
      select title from task6_fan_second_page
    ) as page
  ),
  array[
    'Attendance left event',
    'Eligible friends opportunity',
    'Eligible group opportunity',
    'Eligible public opportunity',
    'Eligible team opportunity',
    'Viewer created group submission',
    'Viewer hosted event',
    'Viewer managed venue event'
  ]::text[],
  'two keyset pages contain the acquisition set plus owned events after exclusions'
);

set local role anon;
select throws_ok(
  $$select * from public.discover_events(32.8,35.0,null,statement_timestamp(),statement_timestamp() + interval '30 days',null,null,null,null,null,null,null,20)$$,
  'P0001',
  'VALIDATION_FAILED',
  'a direct anonymous SQL null radius is rejected'
);
select throws_ok(
  $$select * from public.discover_events(32.8,35.0,50,statement_timestamp(),statement_timestamp() + interval '30 days',null,null,null,null,null,null,null,null)$$,
  'P0001',
  'VALIDATION_FAILED',
  'a direct SQL null limit is rejected instead of widened'
);
select throws_ok(
  $$select * from public.discover_events(32.8,35.0,50,statement_timestamp(),statement_timestamp() + interval '30 days',null,null,null,null,null,null,null,0)$$,
  'P0001',
  'VALIDATION_FAILED',
  'a direct SQL zero limit is rejected instead of clamped'
);
select throws_ok(
  $$select * from public.discover_events(32.8,35.0,50,statement_timestamp(),statement_timestamp() + interval '30 days',null,null,null,null,null,null,null,51)$$,
  'P0001',
  'VALIDATION_FAILED',
  'a direct SQL oversized limit is rejected instead of clamped'
);
select throws_ok(
  $$select * from public.discover_events(32.8,35.0,50,statement_timestamp(),statement_timestamp() + interval '30 days',null,null,null,-1,0,statement_timestamp() + interval '7 days','64500000-0000-4000-8000-000000000601',20)$$,
  'P0001',
  'VALIDATION_FAILED',
  'a negative direct SQL cursor score is rejected'
);
select throws_ok(
  $$select * from public.discover_events(32.8,35.0,50,statement_timestamp(),statement_timestamp() + interval '30 days',null,null,null,0,5,statement_timestamp() + interval '7 days','64500000-0000-4000-8000-000000000601',20)$$,
  'P0001',
  'VALIDATION_FAILED',
  'an out-of-range direct SQL cursor distance band is rejected'
);
reset role;

select * from finish();
rollback;
