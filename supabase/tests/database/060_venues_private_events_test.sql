begin;

create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public, pg_catalog;

select no_plan();

select has_table('public', 'venues', 'B07 creates public venue identities');
select has_table('public', 'venue_follows', 'B07 creates own-row venue follows');
select has_table('public', 'events', 'B07 creates the provider-independent event aggregate');
select has_table('public', 'event_private_locations', 'B07 isolates exact home locations');
select has_table('public', 'event_invitations', 'B07 creates one-account invitations');
select has_table('public', 'event_attendance', 'B07 creates durable attendance history');

select is(
  enum_range(null::public.venue_verification_status)::text,
  '{unverified,verified,suspended}',
  'venue verification has explicit visible states'
);
select is(
  enum_range(null::public.event_place_kind)::text,
  '{home,venue,public_place}',
  'event places match the locked host contract'
);
select is(
  enum_range(null::public.event_audience)::text,
  '{public,team_followers,group,friends,invite_only}',
  'event audiences match the locked contract'
);
select is(
  enum_range(null::public.event_status)::text,
  '{draft,pending_group_review,published,cancelled,completed}',
  'event lifecycle preserves every required state'
);

select ok(
  (
    select bool_and(relation.relrowsecurity and relation.relforcerowsecurity)
    from pg_class as relation
    join pg_namespace as namespace on namespace.oid = relation.relnamespace
    where namespace.nspname = 'public'
      and relation.relname in (
        'venues',
        'venue_follows',
        'events',
        'event_private_locations',
        'event_invitations',
        'event_attendance'
      )
  ),
  'every B07 table has RLS enabled and forced'
);

select has_index('public', 'venues', 'venues_slug_lower_uidx', 'venue slugs are unique');
select has_index('public', 'venues', 'venues_location_gist_idx', 'venue distance queries are spatially indexed');
select has_index('public', 'venues', 'venues_city_verification_idx', 'venue city/status queries are indexed');
select has_index('public', 'venues', 'venues_owner_idx', 'venue ownership is indexed');
select has_index('public', 'venue_follows', 'venue_follows_pkey', 'one user follows a venue once');
select has_index('public', 'venue_follows', 'venue_follows_venue_created_idx', 'venue follower lookup is indexed');
select has_index('public', 'events', 'events_status_starts_idx', 'event lifecycle/time queries are indexed');
select has_index('public', 'events', 'events_match_status_idx', 'fixture event lookup is indexed');
select has_index('public', 'events', 'events_city_status_starts_idx', 'city discovery is indexed');
select has_index('public', 'events', 'events_host_user_status_idx', 'personal host management is indexed');
select has_index('public', 'events', 'events_host_venue_status_idx', 'venue host management is indexed');
select has_index('public', 'events', 'events_organizing_group_status_idx', 'group review lookup is indexed');
select has_index('public', 'events', 'events_audience_group_status_idx', 'group audience lookup is indexed');
select has_index('public', 'events', 'events_audience_team_status_idx', 'team audience lookup is indexed');
select has_index('public', 'events', 'events_public_location_gist_idx', 'public event distance is spatially indexed');
select has_index('public', 'event_private_locations', 'event_private_locations_location_gist_idx', 'protected distance comparison is indexed');
select has_index('public', 'event_invitations', 'event_invitations_event_status_idx', 'event invitation queues are indexed');
select has_index('public', 'event_invitations', 'event_invitations_invitee_status_idx', 'invitee lookup is indexed');
select has_index('public', 'event_attendance', 'event_attendance_event_status_created_idx', 'event attendance queues are indexed');
select has_index('public', 'event_attendance', 'event_attendance_user_status_event_idx', 'attendee history is indexed');

select hasnt_column('public', 'event_attendance', 'guest_count', 'attendance has no plus-one count');
select hasnt_column('public', 'event_invitations', 'guest_count', 'invitations have no plus-one count');
select hasnt_column('public', 'events', 'address_text', 'ordinary events have no home-address column');

select ok(not has_table_privilege('anon', 'public.venues', 'select'), 'anonymous callers use the venue projection');
select ok(not has_table_privilege('authenticated', 'public.venues', 'select'), 'authenticated callers use the venue projection');
select ok(not has_table_privilege('authenticated', 'public.events', 'select'), 'events require an audience-safe projection');
select ok(not has_table_privilege('authenticated', 'public.event_private_locations', 'select'), 'exact locations cannot be selected directly');
select ok(not has_table_privilege('authenticated', 'public.event_private_locations', 'update'), 'exact locations cannot be updated directly');
select ok(not has_table_privilege('authenticated', 'public.event_private_locations', 'insert'), 'exact locations cannot be inserted directly');
select ok(has_table_privilege('authenticated', 'public.venue_follows', 'insert'), 'eligible users may create an RLS-owned follow');
select ok(not has_table_privilege('authenticated', 'public.event_invitations', 'insert'), 'invitations cannot be forged directly');
select ok(not has_table_privilege('authenticated', 'public.event_attendance', 'insert'), 'attendance cannot be forged directly');

select ok(has_function_privilege('authenticated', 'public.create_venue(text,text,uuid,text,double precision,double precision,text,integer,integer,uuid)', 'execute'), 'eligible users invoke controlled venue creation');
select ok(not has_function_privilege('anon', 'public.create_venue(text,text,uuid,text,double precision,double precision,text,integer,integer,uuid)', 'execute'), 'anonymous callers cannot create venues');
select ok(has_function_privilege('anon', 'public.get_venue_by_slug(text)', 'execute'), 'public venue details use a safe projection');
select ok(has_function_privilege('authenticated', 'public.create_or_update_event(uuid,uuid,uuid,uuid,text,text,text,text,text,text,boolean,timestamptz,timestamptz,uuid,text,uuid,text,text,double precision,double precision,text,uuid,uuid,integer,boolean,text,text,double precision,double precision,text,uuid)', 'execute'), 'eligible hosts use one controlled event transaction');
select ok(not has_function_privilege('anon', 'public.create_or_update_event(uuid,uuid,uuid,uuid,text,text,text,text,text,text,boolean,timestamptz,timestamptz,uuid,text,uuid,text,text,double precision,double precision,text,uuid,uuid,integer,boolean,text,text,double precision,double precision,text,uuid)', 'execute'), 'anonymous callers cannot create events');
select is(
  to_regprocedure('public.get_private_event_location(uuid,uuid)'),
  null::regprocedure,
  'B07 does not publish the deferred exact-location read capability'
);
select is(
  to_regprocedure('public.cancel_event(uuid,text,uuid)'),
  null::regprocedure,
  'B07 does not publish deferred cancellation and attendance side effects'
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
    ('61000000-0000-4000-8000-000000000101'::uuid, 'b07-owner@example.com'),
    ('61000000-0000-4000-8000-000000000102'::uuid, 'b07-friend@example.com'),
    ('61000000-0000-4000-8000-000000000103'::uuid, 'b07-moderator@example.com'),
    ('61000000-0000-4000-8000-000000000104'::uuid, 'b07-group-member@example.com'),
    ('61000000-0000-4000-8000-000000000105'::uuid, 'b07-group-viewer@example.com')
) as fixture(id, email);

update public.profiles
set
  handle = case id
    when '61000000-0000-4000-8000-000000000101' then 'b07_owner'
    when '61000000-0000-4000-8000-000000000102' then 'b07_friend'
    when '61000000-0000-4000-8000-000000000103' then 'b07_moderator'
    when '61000000-0000-4000-8000-000000000104' then 'b07_group_member'
    else 'b07_group_viewer'
  end,
  display_name = 'B07 Fan ' || right(id::text, 3),
  city_id = (select id from public.cities where slug = 'haifa'),
  adult_attested_at = statement_timestamp(),
  rules_version = 1,
  rules_accepted_at = statement_timestamp(),
  profile_completed_at = statement_timestamp()
where id between
  '61000000-0000-4000-8000-000000000101' and
  '61000000-0000-4000-8000-000000000105';

insert into public.platform_roles (profile_id, role)
values ('61000000-0000-4000-8000-000000000103', 'moderator');

insert into public.competitions (
  id, sport_id, provider, provider_external_id, code, name, country_name, last_synced_at
)
values (
  '61000000-0000-4000-8000-000000000201',
  '00000000-0000-4000-8000-000000000020',
  'b07-test',
  'competition',
  'B07',
  'B07 Premier League',
  'England',
  statement_timestamp()
);

insert into public.teams (
  id, sport_id, provider, provider_external_id, name, short_name, tla, country_name, last_synced_at
)
values
  (
    '61000000-0000-4000-8000-000000000202',
    '00000000-0000-4000-8000-000000000020',
    'b07-test',
    'home-team',
    'B07 Arsenal FC',
    'B07 Arsenal',
    'B7A',
    'England',
    statement_timestamp()
  ),
  (
    '61000000-0000-4000-8000-000000000203',
    '00000000-0000-4000-8000-000000000020',
    'b07-test',
    'away-team',
    'B07 Chelsea FC',
    'B07 Chelsea',
    'B7C',
    'England',
    statement_timestamp()
  );

insert into public.matches (
  id,
  provider,
  provider_external_id,
  competition_id,
  home_team_id,
  away_team_id,
  starts_at,
  status,
  matchday,
  season_label,
  last_synced_at
)
values (
  '61000000-0000-4000-8000-000000000204',
  'b07-test',
  'match',
  '61000000-0000-4000-8000-000000000201',
  '61000000-0000-4000-8000-000000000202',
  '61000000-0000-4000-8000-000000000203',
  statement_timestamp() + interval '7 days',
  'timed',
  1,
  '2026',
  statement_timestamp()
);

insert into public.groups (
  id, slug, name, owner_id, city_id, visibility, lifecycle, description, activated_at
)
values (
  '61000000-0000-4000-8000-000000000205',
  'b07-supporters',
  'B07 Supporters',
  '61000000-0000-4000-8000-000000000101',
  (select id from public.cities where slug = 'haifa'),
  'unlisted',
  'active',
  'A reviewed B07 supporter group.',
  statement_timestamp()
);

insert into public.group_memberships (group_id, user_id, role, status, reviewed_by, reviewed_at)
values
  ('61000000-0000-4000-8000-000000000205', '61000000-0000-4000-8000-000000000101', 'owner', 'active', null, null),
  ('61000000-0000-4000-8000-000000000205', '61000000-0000-4000-8000-000000000104', 'member', 'active', '61000000-0000-4000-8000-000000000101', statement_timestamp()),
  ('61000000-0000-4000-8000-000000000205', '61000000-0000-4000-8000-000000000105', 'member', 'active', '61000000-0000-4000-8000-000000000101', statement_timestamp());

insert into public.friendships (
  user_low_id, user_high_id, requested_by, status, responded_at
)
values (
  '61000000-0000-4000-8000-000000000101',
  '61000000-0000-4000-8000-000000000102',
  '61000000-0000-4000-8000-000000000101',
  'accepted',
  statement_timestamp()
);

insert into public.venues (
  id,
  owner_id,
  slug,
  name,
  city_id,
  address_text,
  location,
  description,
  screen_count,
  stated_capacity
)
values
  (
    '61000000-0000-4000-8000-000000000301',
    '61000000-0000-4000-8000-000000000101',
    'b07-match-corner',
    'B07 Match Corner',
    (select id from public.cities where slug = 'haifa'),
    '12 Public Street, Haifa',
    extensions.st_setsrid(extensions.st_makepoint(34.99928, 32.81303), 4326)::extensions.geography,
    'A public venue profile for B07 tests.',
    4,
    80
  ),
  (
    '61000000-0000-4000-8000-000000000302',
    '61000000-0000-4000-8000-000000000102',
    'b07-friend-bar',
    'B07 Friend Bar',
    (select id from public.cities where slug = 'haifa'),
    '14 Public Street, Haifa',
    extensions.st_setsrid(extensions.st_makepoint(35.00000, 32.81400), 4326)::extensions.geography,
    'Another public venue profile for B07 tests.',
    2,
    40
  );

select throws_ok(
  $$update public.venues set slug = 'Bad Slug' where id = '61000000-0000-4000-8000-000000000301'$$,
  '23514', null, 'venue slug format is enforced'
);
select throws_ok(
  $$update public.venues set name = 'x' where id = '61000000-0000-4000-8000-000000000301'$$,
  '23514', null, 'venue name length is enforced'
);
select throws_ok(
  $$update public.venues set address_text = 'x' where id = '61000000-0000-4000-8000-000000000301'$$,
  '23514', null, 'venue public-address length is enforced'
);
select throws_ok(
  $$update public.venues set description = 'short' where id = '61000000-0000-4000-8000-000000000301'$$,
  '23514', null, 'venue description length is enforced'
);
select throws_ok(
  $$update public.venues set screen_count = 0 where id = '61000000-0000-4000-8000-000000000301'$$,
  '23514', null, 'venue screen count is positive'
);
select throws_ok(
  $$update public.venues set stated_capacity = 0 where id = '61000000-0000-4000-8000-000000000301'$$,
  '23514', null, 'venue stated capacity is positive'
);
select throws_ok(
  $$update public.venues set location = extensions.st_setsrid(extensions.st_makepoint(1, 1), 4326)::extensions.geography where id = '61000000-0000-4000-8000-000000000301'$$,
  '23514', null, 'venue coordinates remain in Israel bounds'
);
select throws_ok(
  $$update public.venues set verification_status = 'suspended' where id = '61000000-0000-4000-8000-000000000301'$$,
  '23514', null, 'venue suspension status requires timestamp evidence'
);
select throws_ok(
  $$insert into public.venues (owner_id,slug,name,city_id,address_text,location,description) values ('61000000-0000-4000-8000-000000000102','b07-match-corner','Duplicate Venue',(select id from public.cities where slug='haifa'),'16 Public Street, Haifa',extensions.st_setsrid(extensions.st_makepoint(35,32.8),4326)::extensions.geography,'A duplicate venue slug test.')$$,
  '23505', null, 'venue slugs are case-insensitively unique'
);
select throws_ok(
  $$update public.venues set owner_id = '61000000-0000-4000-8000-000000000999' where id = '61000000-0000-4000-8000-000000000301'$$,
  '23503', null, 'venue owner references a profile'
);
select throws_ok(
  $$update public.venues set city_id = '61000000-0000-4000-8000-000000000999' where id = '61000000-0000-4000-8000-000000000301'$$,
  '23503', null, 'venue city references the reviewed catalog'
);

insert into public.events (
  id,
  created_by,
  host_user_id,
  match_id,
  title,
  description,
  expected_activity,
  cost_description,
  event_rules,
  commercial_affiliation,
  host_presence_confirmed_at,
  starts_at,
  ends_at,
  city_id,
  place_kind,
  audience,
  capacity,
  requires_approval,
  status
)
values (
  '61000000-0000-4000-8000-000000000401',
  '61000000-0000-4000-8000-000000000101',
  '61000000-0000-4000-8000-000000000101',
  '61000000-0000-4000-8000-000000000204',
  'B07 Home Draft',
  'A valid protected home event draft.',
  'Watch the full match',
  'Free',
  'Respect everyone.',
  'None',
  statement_timestamp(),
  statement_timestamp() + interval '7 days',
  statement_timestamp() + interval '7 days 3 hours',
  (select id from public.cities where slug = 'haifa'),
  'home',
  'friends',
  6,
  true,
  'draft'
);

insert into public.event_private_locations (event_id, address_text, directions, location)
values (
  '61000000-0000-4000-8000-000000000401',
  '99 Protected Home, Haifa',
  'Ring apartment 4.',
  extensions.st_setsrid(extensions.st_makepoint(34.99800, 32.81200), 4326)::extensions.geography
);

insert into public.events (
  id, created_by, host_user_id, match_id, title, description, expected_activity,
  cost_description, event_rules, commercial_affiliation, host_presence_confirmed_at,
  starts_at, ends_at, city_id, place_kind, public_place_name, public_address_text,
  public_location, audience, capacity, requires_approval, status
)
values (
  '61000000-0000-4000-8000-000000000402',
  '61000000-0000-4000-8000-000000000102',
  '61000000-0000-4000-8000-000000000102',
  '61000000-0000-4000-8000-000000000204',
  'B07 Public Draft',
  'A valid ordinary public-place event draft.',
  'Watch the full match',
  'Free',
  'Respect everyone.',
  'None',
  statement_timestamp(),
  statement_timestamp() + interval '7 days',
  statement_timestamp() + interval '7 days 3 hours',
  (select id from public.cities where slug = 'haifa'),
  'public_place',
  'Community Hall',
  '20 Public Street, Haifa',
  extensions.st_setsrid(extensions.st_makepoint(35.001, 32.815), 4326)::extensions.geography,
  'invite_only',
  20,
  true,
  'draft'
);

insert into public.events (
  id, created_by, host_venue_id, match_id, title, description, expected_activity,
  cost_description, event_rules, commercial_affiliation, host_presence_confirmed_at,
  starts_at, ends_at, city_id, place_kind, venue_id, audience, capacity,
  requires_approval, status
)
values (
  '61000000-0000-4000-8000-000000000403',
  '61000000-0000-4000-8000-000000000101',
  '61000000-0000-4000-8000-000000000301',
  '61000000-0000-4000-8000-000000000204',
  'B07 Venue Draft',
  'A valid venue-hosted event draft.',
  'Watch the full match',
  'Free',
  'Respect everyone.',
  'None',
  statement_timestamp(),
  statement_timestamp() + interval '7 days',
  statement_timestamp() + interval '7 days 3 hours',
  (select id from public.cities where slug = 'haifa'),
  'venue',
  '61000000-0000-4000-8000-000000000301',
  'public',
  80,
  false,
  'draft'
);

select throws_ok(
  $$update public.events set host_venue_id = '61000000-0000-4000-8000-000000000301' where id = '61000000-0000-4000-8000-000000000401'$$,
  '23514', null, 'events require exactly one host'
);
select throws_ok($$update public.events set title = 'x' where id = '61000000-0000-4000-8000-000000000401'$$, '23514', null, 'event title length is enforced');
select throws_ok($$update public.events set description = 'short' where id = '61000000-0000-4000-8000-000000000401'$$, '23514', null, 'event description length is enforced');
select throws_ok($$update public.events set expected_activity = 'x' where id = '61000000-0000-4000-8000-000000000401'$$, '23514', null, 'expected activity length is enforced');
select throws_ok($$update public.events set cost_description = 'x' where id = '61000000-0000-4000-8000-000000000401'$$, '23514', null, 'cost description length is enforced');
select throws_ok($$update public.events set event_rules = 'x' where id = '61000000-0000-4000-8000-000000000401'$$, '23514', null, 'event rules length is enforced');
select throws_ok($$update public.events set commercial_affiliation = 'x' where id = '61000000-0000-4000-8000-000000000401'$$, '23514', null, 'commercial affiliation length is enforced');
select throws_ok($$update public.events set ends_at = starts_at where id = '61000000-0000-4000-8000-000000000401'$$, '23514', null, 'event end follows event start');
select throws_ok($$update public.events set capacity = 0 where id = '61000000-0000-4000-8000-000000000401'$$, '23514', null, 'event capacity is positive');
select throws_ok($$update public.events set audience = 'public' where id = '61000000-0000-4000-8000-000000000401'$$, '23514', null, 'private hosts cannot create public audiences');
select throws_ok($$update public.events set audience = 'friends' where id = '61000000-0000-4000-8000-000000000403'$$, '23514', null, 'venue hosts cannot create private audiences');
select throws_ok($$update public.events set place_kind = 'public_place' where id = '61000000-0000-4000-8000-000000000401'$$, '23514', null, 'event place fields must match the place kind');
select throws_ok($$update public.events set public_place_name = 'x' where id = '61000000-0000-4000-8000-000000000402'$$, '23514', null, 'public place name length is enforced');
select throws_ok($$update public.events set public_address_text = 'x' where id = '61000000-0000-4000-8000-000000000402'$$, '23514', null, 'public address length is enforced');
select throws_ok($$update public.events set public_location = extensions.st_setsrid(extensions.st_makepoint(1,1),4326)::extensions.geography where id = '61000000-0000-4000-8000-000000000402'$$, '23514', null, 'public event coordinates remain in Israel bounds');
select throws_ok($$update public.events set audience = 'group' where id = '61000000-0000-4000-8000-000000000401'$$, '23514', null, 'audience targets must match the audience kind');
select throws_ok($$update public.events set capacity = 13 where id = '61000000-0000-4000-8000-000000000401'$$, '23514', null, 'home events have a hard capacity of 12');
select throws_ok($$update public.events set status = 'published' where id = '61000000-0000-4000-8000-000000000401'$$, '23514', null, 'published events require lifecycle evidence');

select throws_ok($$update public.events set created_by = '61000000-0000-4000-8000-000000000999' where id = '61000000-0000-4000-8000-000000000401'$$, '23503', null, 'event creator references a profile');
select throws_ok($$update public.events set host_user_id = '61000000-0000-4000-8000-000000000999' where id = '61000000-0000-4000-8000-000000000401'$$, '23503', null, 'personal host references a profile');
select throws_ok($$update public.events set organizing_group_id = '61000000-0000-4000-8000-000000000999' where id = '61000000-0000-4000-8000-000000000401'$$, '23503', null, 'organizing group references a group');
select throws_ok($$update public.events set match_id = '61000000-0000-4000-8000-000000000999' where id = '61000000-0000-4000-8000-000000000401'$$, '23503', null, 'event fixture references the sports catalog');
select throws_ok($$update public.events set city_id = '61000000-0000-4000-8000-000000000999' where id = '61000000-0000-4000-8000-000000000401'$$, '23503', null, 'event city references the city catalog');
select throws_ok($$update public.events set audience = 'group', audience_group_id = '61000000-0000-4000-8000-000000000999' where id = '61000000-0000-4000-8000-000000000401'$$, '23503', null, 'group audience target references a group');
select throws_ok($$update public.events set audience = 'team_followers', audience_team_id = '61000000-0000-4000-8000-000000000999' where id = '61000000-0000-4000-8000-000000000403'$$, '23503', null, 'team audience target references a team');

select throws_ok($$update public.event_private_locations set address_text = 'x' where event_id = '61000000-0000-4000-8000-000000000401'$$, '23514', null, 'private address length is enforced');
select throws_ok($$update public.event_private_locations set directions = 'x' where event_id = '61000000-0000-4000-8000-000000000401'$$, '23514', null, 'private directions length is enforced');
select throws_ok($$update public.event_private_locations set location = extensions.st_setsrid(extensions.st_makepoint(1,1),4326)::extensions.geography where event_id = '61000000-0000-4000-8000-000000000401'$$, '23514', null, 'private coordinates remain in Israel bounds');
select throws_ok($$insert into public.event_private_locations (event_id,address_text,location) values ('61000000-0000-4000-8000-000000000999','Missing event',extensions.st_setsrid(extensions.st_makepoint(35,32.8),4326)::extensions.geography)$$, '23514', null, 'private locations require a personal home event parent');
select throws_ok($$insert into public.event_private_locations (event_id,address_text,location) values ('61000000-0000-4000-8000-000000000402','Not a home',extensions.st_setsrid(extensions.st_makepoint(35,32.8),4326)::extensions.geography)$$, '23514', null, 'public-place events cannot acquire a private location');

insert into public.event_invitations (event_id, invitee_id, invited_by)
values
  ('61000000-0000-4000-8000-000000000401', '61000000-0000-4000-8000-000000000102', '61000000-0000-4000-8000-000000000101'),
  ('61000000-0000-4000-8000-000000000402', '61000000-0000-4000-8000-000000000101', '61000000-0000-4000-8000-000000000102');

select throws_ok($$update public.event_invitations set status = 'accepted' where event_id = '61000000-0000-4000-8000-000000000401' and invitee_id = '61000000-0000-4000-8000-000000000102'$$, '23514', null, 'invitation response status requires response evidence');
select throws_ok($$insert into public.event_invitations (event_id,invitee_id,invited_by) values ('61000000-0000-4000-8000-000000000401','61000000-0000-4000-8000-000000000102','61000000-0000-4000-8000-000000000101')$$, '23505', null, 'one account receives one invitation per event');
select throws_ok($$update public.event_invitations set event_id = '61000000-0000-4000-8000-000000000999' where event_id = '61000000-0000-4000-8000-000000000401' and invitee_id = '61000000-0000-4000-8000-000000000102'$$, '23503', null, 'invitation references an event');
select throws_ok($$update public.event_invitations set invitee_id = '61000000-0000-4000-8000-000000000999' where event_id = '61000000-0000-4000-8000-000000000401' and invitee_id = '61000000-0000-4000-8000-000000000102'$$, '23503', null, 'invitee references a profile');
select throws_ok($$update public.event_invitations set invited_by = '61000000-0000-4000-8000-000000000999' where event_id = '61000000-0000-4000-8000-000000000401' and invitee_id = '61000000-0000-4000-8000-000000000102'$$, '23503', null, 'inviter references a profile');

insert into public.event_attendance (event_id, user_id, status, source)
values ('61000000-0000-4000-8000-000000000401', '61000000-0000-4000-8000-000000000102', 'requested', 'self_request');

select throws_ok($$update public.event_attendance set reviewed_by = '61000000-0000-4000-8000-000000000101' where event_id = '61000000-0000-4000-8000-000000000401' and user_id = '61000000-0000-4000-8000-000000000102'$$, '23514', null, 'attendance review evidence is paired');
select throws_ok($$update public.event_attendance set status = 'left' where event_id = '61000000-0000-4000-8000-000000000401' and user_id = '61000000-0000-4000-8000-000000000102'$$, '23514', null, 'left attendance requires a timestamp');
select throws_ok($$update public.event_attendance set status = 'removed' where event_id = '61000000-0000-4000-8000-000000000401' and user_id = '61000000-0000-4000-8000-000000000102'$$, '23514', null, 'removed attendance requires actor and timestamp evidence');
select throws_ok($$update public.event_attendance set removal_reason = 'Unexpected removal reason' where event_id = '61000000-0000-4000-8000-000000000401' and user_id = '61000000-0000-4000-8000-000000000102'$$, '23514', null, 'only removed attendance may carry a bounded removal reason');
select throws_ok($$insert into public.event_attendance (event_id,user_id,status,source) values ('61000000-0000-4000-8000-000000000401','61000000-0000-4000-8000-000000000102','requested','self_request')$$, '23505', null, 'one account has one attendance history row per event');
select throws_ok($$update public.event_attendance set event_id = '61000000-0000-4000-8000-000000000999' where event_id = '61000000-0000-4000-8000-000000000401' and user_id = '61000000-0000-4000-8000-000000000102'$$, '23503', null, 'attendance references an event');
select throws_ok($$update public.event_attendance set user_id = '61000000-0000-4000-8000-000000000999' where event_id = '61000000-0000-4000-8000-000000000401' and user_id = '61000000-0000-4000-8000-000000000102'$$, '23503', null, 'attendee references a profile');

set local role authenticated;
set local "request.jwt.claim.sub" = '61000000-0000-4000-8000-000000000101';

select lives_ok(
  $$select * from public.create_venue('B07 New Venue','b07-new-venue',(select id from public.cities where slug='haifa'),'30 Public Street, Haifa',35.01,32.82,'A safely created unverified venue.',3,60,null)$$,
  'a complete user creates a venue through the controlled function'
);
select is(
  (select verification_status from public.get_venue_by_slug('b07-new-venue')),
  'unverified',
  'every user-created venue is visibly unverified'
);
select throws_ok(
  $$select public.set_venue_verification_status('61000000-0000-4000-8000-000000000301','verified',null)$$,
  'P0001', 'NOT_ALLOWED', 'a venue owner cannot self-verify'
);
select throws_ok(
  $$select * from public.update_venue('61000000-0000-4000-8000-000000000302','Stolen Venue','stolen-venue',(select id from public.cities where slug='haifa'),'14 Public Street, Haifa',35,32.814,'A crafted cross-owner venue edit.',2,40,null)$$,
  'P0001', 'NOT_ALLOWED', 'cross-owner venue edits are denied'
);

insert into public.venue_follows (user_id, venue_id)
values (auth.uid(), '61000000-0000-4000-8000-000000000301');
select is(
  (select count(*) from public.venue_follows),
  1::bigint,
  'a follower sees only their own venue follow'
);
select throws_ok(
  $$insert into public.venue_follows (user_id,venue_id) values ('61000000-0000-4000-8000-000000000102','61000000-0000-4000-8000-000000000301')$$,
  '42501', null, 'a caller cannot forge another user follow'
);
select throws_ok(
  $$insert into public.venue_follows (user_id,venue_id) values ('61000000-0000-4000-8000-000000000101','61000000-0000-4000-8000-000000000301')$$,
  '23505', null, 'duplicate follows are rejected'
);

select throws_ok(
  $$select * from public.create_or_update_event(null,null,null,'61000000-0000-4000-8000-000000000204','Crafted public event','A crafted private-host public event.','Watch the full match','Free','Respect everyone.','None',true,statement_timestamp()+interval '7 days',statement_timestamp()+interval '7 days 3 hours',(select id from public.cities where slug='haifa'),'home',null,null,null,null,null,'public',null,null,6,true,'Secret address',null,34.998,32.812,'publish',null)$$,
  'P0001', 'NOT_ALLOWED', 'a crafted private host cannot publish to the public audience'
);

reset role;
set local role authenticated;
set local "request.jwt.claim.sub" = '61000000-0000-4000-8000-000000000104';
select is(
  (
    select status
    from public.create_or_update_event(
      null,
      null,
      '61000000-0000-4000-8000-000000000205',
      '61000000-0000-4000-8000-000000000204',
      'B07 Group Home',
      'A protected group home event.',
      'Watch the full match',
      'Free',
      'Respect everyone.',
      'None',
      true,
      statement_timestamp()+interval '7 days',
      statement_timestamp()+interval '7 days 3 hours',
      (select id from public.cities where slug='haifa'),
      'home',null,null,null,null,null,'group',null,
      '61000000-0000-4000-8000-000000000205',6,true,
      '88 Protected Group Home',null,34.997,32.811,'publish',null
    )
  ),
  'pending_group_review',
  'an active member submission remains pending group review'
);

reset role;
set local role authenticated;
set local "request.jwt.claim.sub" = '61000000-0000-4000-8000-000000000103';
select is(
  public.set_venue_verification_status('61000000-0000-4000-8000-000000000301','verified',null),
  true,
  'a platform moderator can change venue verification'
);

reset role;
update public.events
set status = 'published', published_at = statement_timestamp()
where id = '61000000-0000-4000-8000-000000000401';
update public.events
set status = 'published', published_at = statement_timestamp()
where id in (
  '61000000-0000-4000-8000-000000000402',
  '61000000-0000-4000-8000-000000000403'
)
or title = 'B07 Group Home';
select set_config(
  'test.b07_group_event_id',
  (select id::text from public.events where title = 'B07 Group Home'),
  true
);
update public.event_attendance
set status = 'approved', reviewed_by = '61000000-0000-4000-8000-000000000101', reviewed_at = statement_timestamp()
where event_id = '61000000-0000-4000-8000-000000000401'
  and user_id = '61000000-0000-4000-8000-000000000102';

set local role authenticated;
set local "request.jwt.claim.sub" = '61000000-0000-4000-8000-000000000101';
select ok(
  (select row_to_json(summary)::text not like '%99 Protected Home%' from public.get_event_summary('61000000-0000-4000-8000-000000000401') as summary),
  'the ordinary event DTO omits the exact home address'
);
select ok(
  (select row_to_json(summary)::text not like '%34.998%' from public.get_event_summary('61000000-0000-4000-8000-000000000401') as summary),
  'the ordinary event DTO omits exact home coordinates'
);

reset role;
set local role authenticated;
set local "request.jwt.claim.sub" = '61000000-0000-4000-8000-000000000102';
select is(
  (select count(*) from public.get_event_summary('61000000-0000-4000-8000-000000000401')),
  1::bigint,
  'an accepted direct friend sees a published friends event summary'
);

reset role;
set local role authenticated;
set local "request.jwt.claim.sub" = '61000000-0000-4000-8000-000000000104';
select is(
  (select count(*) from public.get_event_summary('61000000-0000-4000-8000-000000000401')),
  0::bigint,
  'a non-friend cannot see a published friends event'
);
select is(
  (select count(*) from public.get_event_summary('61000000-0000-4000-8000-000000000402')),
  0::bigint,
  'an uninvited user cannot see an invite-only event'
);
select throws_ok(
  $$select * from public.create_or_update_event('61000000-0000-4000-8000-000000000401',null,null,'61000000-0000-4000-8000-000000000204','Crafted cross-user edit','A crafted cross-user private event edit.','Watch the full match','Free','Respect everyone.','None',true,statement_timestamp()+interval '7 days',statement_timestamp()+interval '7 days 3 hours',(select id from public.cities where slug='haifa'),'home',null,null,null,null,null,'invite_only',null,null,6,true,'99 Protected Home, Haifa','Ring apartment 4.',34.998,32.812,'publish',null)$$,
  'P0001', 'NOT_ALLOWED', 'a crafted cross-user event update is denied'
);

reset role;
set local role authenticated;
set local "request.jwt.claim.sub" = '61000000-0000-4000-8000-000000000101';
select is(
  (select public_address_text from public.get_event_summary('61000000-0000-4000-8000-000000000402')),
  '20 Public Street, Haifa',
  'a current invitee receives the audience-safe public-place address'
);

reset role;
set local role authenticated;
set local "request.jwt.claim.sub" = '61000000-0000-4000-8000-000000000105';
select is(
  (
    select count(*)
    from public.get_event_summary(
      current_setting('test.b07_group_event_id')::uuid
    )
  ),
  1::bigint,
  'an ordinary active group member sees a published group event'
);

reset role;
set local role authenticated;
set local "request.jwt.claim.sub" = '61000000-0000-4000-8000-000000000102';
select is(
  (
    select count(*)
    from public.get_event_summary(
      current_setting('test.b07_group_event_id')::uuid
    )
  ),
  0::bigint,
  'a non-member cannot see a published group event'
);

reset role;
update public.groups
set lifecycle = 'suspended', suspended_at = statement_timestamp()
where id = '61000000-0000-4000-8000-000000000205';
set local role authenticated;
set local "request.jwt.claim.sub" = '61000000-0000-4000-8000-000000000105';
select is(
  (
    select count(*)
    from public.get_event_summary(
      current_setting('test.b07_group_event_id')::uuid
    )
  ),
  0::bigint,
  'group suspension removes an ordinary member event summary immediately'
);

reset role;
update public.groups
set lifecycle = 'active', suspended_at = null
where id = '61000000-0000-4000-8000-000000000205';
reset "request.jwt.claim.sub";
set local role anon;
select is(
  (select count(*) from public.get_event_summary('61000000-0000-4000-8000-000000000403')),
  1::bigint,
  'an anonymous visitor sees a published non-suspended venue event summary'
);

reset role;
select throws_ok(
  $$update public.events set audience = 'invite_only' where id = '61000000-0000-4000-8000-000000000401'$$,
  'P0001', 'MATERIAL_CHANGE_REQUIRES_NEW_EVENT', 'approved attendance freezes the material audience boundary'
);
select throws_ok(
  $$update public.event_private_locations set address_text = '100 Changed Home, Haifa' where event_id = '61000000-0000-4000-8000-000000000401'$$,
  'P0001', 'MATERIAL_CHANGE_REQUIRES_NEW_EVENT', 'approved attendance freezes the protected home address'
);

set local role authenticated;
set local "request.jwt.claim.sub" = '61000000-0000-4000-8000-000000000101';
select is(public.block_user('b07_friend', null), true, 'blocking a friend is immediate');
select is(
  (select status::text from public.event_invitations where event_id = '61000000-0000-4000-8000-000000000401'),
  'pending',
  'B07 leaves invitation mutation to the later attendance milestone'
);
select is(
  (select status::text from public.event_attendance where event_id = '61000000-0000-4000-8000-000000000401'),
  'approved',
  'B07 leaves attendance mutation to the later attendance milestone'
);

reset role;
set local role authenticated;
set local "request.jwt.claim.sub" = '61000000-0000-4000-8000-000000000102';
select is(
  (select count(*) from public.get_event_summary('61000000-0000-4000-8000-000000000401')),
  0::bigint,
  'blocking immediately removes the private event safe summary'
);

reset role;
select ok(
  exists (
    select 1 from public.security_audit_events
    where action = 'venue.status'
      and resource_id = '61000000-0000-4000-8000-000000000301'
  ),
  'moderator venue-status changes are audited'
);

select * from finish();
rollback;
