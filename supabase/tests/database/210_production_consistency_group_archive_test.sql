begin;

create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public, pg_catalog;

select no_plan();

select has_function(
  'public',
  'discover_owned_venue_events',
  array[
    'double precision', 'double precision', 'integer', 'timestamp with time zone',
    'timestamp with time zone', 'uuid', 'uuid', 'uuid', 'integer', 'integer',
    'timestamp with time zone', 'uuid', 'integer'
  ],
  'Fan discovery has a bounded projection for public events from Venues the Fan manages'
);
select has_function(
  'public',
  'list_match_events',
  array['uuid', 'integer'],
  'fixture details have one authorization-filtered watch-event projection'
);
select has_function(
  'public',
  'archive_group',
  array['uuid', 'uuid'],
  'group owners have one audited archive mutation'
);
select ok(
  has_function_privilege(
    'authenticated',
    'public.discover_owned_venue_events(double precision,double precision,integer,timestamptz,timestamptz,uuid,uuid,uuid,integer,integer,timestamptz,uuid,integer)',
    'execute'
  ),
  'authenticated Fans may load managed-Venue events into Fan discovery'
);
select ok(
  has_function_privilege('anon', 'public.list_match_events(uuid,integer)', 'execute')
  and has_function_privilege('authenticated', 'public.list_match_events(uuid,integer)', 'execute'),
  'anonymous and signed-in fixture viewers may load only safe visible events'
);
select ok(
  has_function_privilege('authenticated', 'public.archive_group(uuid,uuid)', 'execute')
  and not has_function_privilege('anon', 'public.archive_group(uuid,uuid)', 'execute'),
  'only authenticated callers can reach the owner-authorized archive mutation'
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
    ('f6000000-0000-4000-8000-000000000101'::uuid, 'consistency-owner@example.test'),
    ('f6000000-0000-4000-8000-000000000102'::uuid, 'consistency-viewer@example.test'),
    ('f6000000-0000-4000-8000-000000000103'::uuid, 'consistency-venue-only@example.test')
) as fixture(id, email);

update public.profiles
set
  handle = case id
    when 'f6000000-0000-4000-8000-000000000101' then 'consistency_owner'
    else 'consistency_viewer'
  end,
  display_name = case id
    when 'f6000000-0000-4000-8000-000000000101' then 'Consistency Owner'
    else 'Consistency Viewer'
  end,
  adult_attested_at = statement_timestamp(),
  rules_version = 1,
  rules_accepted_at = statement_timestamp(),
  profile_completed_at = statement_timestamp(),
  fan_enabled_at = statement_timestamp()
where id in (
  'f6000000-0000-4000-8000-000000000101',
  'f6000000-0000-4000-8000-000000000102'
);

update public.profiles
set
  adult_attested_at = statement_timestamp(),
  rules_version = 1,
  rules_accepted_at = statement_timestamp()
where id = 'f6000000-0000-4000-8000-000000000103';

insert into public.competitions (
  id, sport_id, provider, provider_external_id, code, name, country_name, last_synced_at
)
values (
  'f6000000-0000-4000-8000-000000000201',
  '00000000-0000-4000-8000-000000000020',
  'consistency-test', 'competition', 'CST', 'Consistency League', 'England',
  statement_timestamp()
);

insert into public.teams (
  id, sport_id, provider, provider_external_id, name, short_name, tla,
  country_name, last_synced_at
)
values
  (
    'f6000000-0000-4000-8000-000000000202',
    '00000000-0000-4000-8000-000000000020',
    'consistency-test', 'home', 'Consistency Home FC', 'Consistency Home', 'CSH',
    'England', statement_timestamp()
  ),
  (
    'f6000000-0000-4000-8000-000000000203',
    '00000000-0000-4000-8000-000000000020',
    'consistency-test', 'away', 'Consistency Away FC', 'Consistency Away', 'CSA',
    'England', statement_timestamp()
  );

insert into public.matches (
  id, provider, provider_external_id, competition_id, home_team_id, away_team_id,
  starts_at, status, matchday, season_label, last_synced_at
)
values (
  'f6000000-0000-4000-8000-000000000204',
  'consistency-test', 'match',
  'f6000000-0000-4000-8000-000000000201',
  'f6000000-0000-4000-8000-000000000202',
  'f6000000-0000-4000-8000-000000000203',
  statement_timestamp() + interval '7 days', 'timed', 1, '2026',
  statement_timestamp()
);

insert into public.venues (
  id, owner_id, slug, name, address_text, location, description,
  stated_capacity, verification_status
)
values (
  'f6000000-0000-4000-8000-000000000301',
  'f6000000-0000-4000-8000-000000000101',
  'consistency-venue', 'Consistency Venue',
  '31 Stadium Street, Haifa',
  extensions.st_setsrid(extensions.st_makepoint(35.000, 32.813), 4326)::extensions.geography,
  'A public Venue managed by a Fan workspace owner.',
  80,
  'unverified'
);

insert into public.groups (
  id, slug, name, owner_id, team_id, visibility, lifecycle, description
)
values (
  'f6000000-0000-4000-8000-000000000401',
  'consistency-supporters', 'Consistency Supporters',
  'f6000000-0000-4000-8000-000000000101',
  'f6000000-0000-4000-8000-000000000202',
  'discoverable', 'forming',
  'A clear supporter-group description is enough to make the group findable.'
);

insert into public.group_memberships (group_id, user_id, role, status)
values (
  'f6000000-0000-4000-8000-000000000401',
  'f6000000-0000-4000-8000-000000000101',
  'owner', 'active'
);

select is(
  (
    select lifecycle::text
    from public.groups
    where id = 'f6000000-0000-4000-8000-000000000401'
  ),
  'active'::text,
  'a described discoverable group with its active owner no longer needs members, rules, or an event'
);

set local role authenticated;
set local "request.jwt.claim.sub" = 'f6000000-0000-4000-8000-000000000102';
select is(
  (
    select count(*)
    from public.search_groups('Consistency', null, null, null, null, 20)
    where group_id = 'f6000000-0000-4000-8000-000000000401'
  ),
  1::bigint,
  'the group search returns a ready group before it has a rule or future event'
);
reset role;

insert into public.events (
  id, created_by, host_venue_id, match_id, title, description,
  expected_activity, cost_description, event_rules, commercial_affiliation,
  host_presence_confirmed_at, starts_at, ends_at, place_kind, venue_id,
  audience, capacity, requires_approval, status, published_at
)
values (
  'f6000000-0000-4000-8000-000000000501',
  'f6000000-0000-4000-8000-000000000101',
  'f6000000-0000-4000-8000-000000000301',
  'f6000000-0000-4000-8000-000000000204',
  'Managed Venue watch event',
  'A published Venue event that remains visible from the owner Fan workspace.',
  'Watch together', 'Free entry', 'Respect the Venue.', 'Venue-hosted',
  statement_timestamp(), statement_timestamp() + interval '7 days',
  statement_timestamp() + interval '7 days 3 hours',
  'venue', 'f6000000-0000-4000-8000-000000000301',
  'public', 80, false, 'published', statement_timestamp()
);

insert into public.events (
  id, created_by, host_user_id, organizing_group_id, match_id, title, description,
  expected_activity, cost_description, event_rules, commercial_affiliation,
  host_presence_confirmed_at, starts_at, ends_at, place_kind,
  public_place_name, public_address_text, public_location,
  audience, audience_group_id, capacity, requires_approval, status, published_at
)
values (
  'f6000000-0000-4000-8000-000000000502',
  'f6000000-0000-4000-8000-000000000101',
  'f6000000-0000-4000-8000-000000000101',
  'f6000000-0000-4000-8000-000000000401',
  'f6000000-0000-4000-8000-000000000204',
  'Public group watch event',
  'A public-place group event that may acquire new supporters safely.',
  'Watch together', 'Free entry', 'Respect the group.', 'None',
  statement_timestamp(), statement_timestamp() + interval '7 days 10 minutes',
  statement_timestamp() + interval '7 days 3 hours 10 minutes',
  'public_place', 'Supporters Hall', '32 Stadium Street, Haifa',
  extensions.st_setsrid(extensions.st_makepoint(35.001, 32.814), 4326)::extensions.geography,
  'group', 'f6000000-0000-4000-8000-000000000401',
  12, true, 'published', statement_timestamp()
);

insert into public.events (
  id, created_by, host_user_id, organizing_group_id, match_id, title, description,
  expected_activity, cost_description, event_rules, commercial_affiliation,
  host_presence_confirmed_at, starts_at, ends_at, place_kind,
  audience, audience_group_id, capacity, requires_approval, status, published_at
)
values (
  'f6000000-0000-4000-8000-000000000503',
  'f6000000-0000-4000-8000-000000000101',
  'f6000000-0000-4000-8000-000000000101',
  'f6000000-0000-4000-8000-000000000401',
  'f6000000-0000-4000-8000-000000000204',
  'Private group home event',
  'A home event that must never become an acquisition result for a non-member.',
  'Watch together', 'Free entry', 'Respect the home.', 'None',
  statement_timestamp(), statement_timestamp() + interval '7 days 20 minutes',
  statement_timestamp() + interval '7 days 3 hours 20 minutes',
  'home', 'group', 'f6000000-0000-4000-8000-000000000401',
  8, true, 'published', statement_timestamp()
);

insert into public.event_private_locations (event_id, address_text, directions, location)
values (
  'f6000000-0000-4000-8000-000000000503',
  '99 Secret Home Street, Haifa', 'Do not expose this exact location.',
  extensions.st_setsrid(extensions.st_makepoint(35.002, 32.815), 4326)::extensions.geography
);

insert into public.group_invite_tokens (
  id, group_id, token_hash, created_by, expires_at, max_uses
)
values (
  'f6000000-0000-4000-8000-000000000601',
  'f6000000-0000-4000-8000-000000000401',
  repeat('a', 64),
  'f6000000-0000-4000-8000-000000000101',
  statement_timestamp() + interval '7 days',
  10
);

insert into public.event_attendance (
  event_id, user_id, status, source, reviewed_by, reviewed_at
)
values (
  'f6000000-0000-4000-8000-000000000502',
  'f6000000-0000-4000-8000-000000000102',
  'approved', 'self_request',
  'f6000000-0000-4000-8000-000000000101', statement_timestamp()
);

set local role authenticated;
set local "request.jwt.claim.sub" = 'f6000000-0000-4000-8000-000000000101';
select is(
  (
    select count(*)
    from public.discover_owned_venue_events(
      32.813, 35.000, 15,
      statement_timestamp(), statement_timestamp() + interval '30 days',
      null, null, 'f6000000-0000-4000-8000-000000000204',
      null, null, null, null, 20
    )
    where event_id = 'f6000000-0000-4000-8000-000000000501'
  ),
  1::bigint,
  'a Fan sees a public event from a Venue they also manage'
);
reset role;

set local role authenticated;
set local "request.jwt.claim.sub" = 'f6000000-0000-4000-8000-000000000103';
select is(
  (
    select count(*)
    from public.discover_owned_venue_events(
      32.813, 35.000, 15,
      statement_timestamp(), statement_timestamp() + interval '30 days',
      null, null, null, null, null, null, null, 20
    )
  ),
  0::bigint,
  'a Venue-only identity cannot use the Fan-owned-event acquisition bridge'
);
reset role;

set local role authenticated;
set local "request.jwt.claim.sub" = 'f6000000-0000-4000-8000-000000000102';
select is(
  (
    select array_agg(title order by title)
    from public.list_match_events('f6000000-0000-4000-8000-000000000204', 20)
  ),
  array['Managed Venue watch event', 'Public group watch event']::text[],
  'fixture details list every safe visible linked event and exclude the private group home'
);
select is(
  (
    select count(*)
    from public.get_event_summary('f6000000-0000-4000-8000-000000000502')
  ),
  1::bigint,
  'a Fan may open a discoverable group public-place event before applying'
);
select is(
  (
    select count(*)
    from public.get_event_summary('f6000000-0000-4000-8000-000000000503')
  ),
  0::bigint,
  'the same Fan cannot open the group home event'
);
select throws_ok(
  $$select public.archive_group(
    'f6000000-0000-4000-8000-000000000401',
    'f6000000-0000-4000-8000-000000000901'
  )$$,
  'P0001', 'NOT_FOUND',
  'a non-owner cannot archive the group'
);
reset role;

select is(
  (
    select lifecycle::text
    from public.groups
    where id = 'f6000000-0000-4000-8000-000000000401'
  ),
  'active'::text,
  'the rejected archive attempt changes no group state'
);

set local role authenticated;
set local "request.jwt.claim.sub" = 'f6000000-0000-4000-8000-000000000101';
select ok(
  public.archive_group(
    'f6000000-0000-4000-8000-000000000401',
    'f6000000-0000-4000-8000-000000000902'
  ),
  'the active owner archives the group'
);
select is(
  (
    select count(*)
    from public.get_group_by_slug('consistency-supporters')
  ),
  0::bigint,
  'an archived group no longer resolves even for its former owner'
);
select throws_ok(
  $$select * from public.list_group_rules(
    'f6000000-0000-4000-8000-000000000401', 0, 20
  )$$,
  'P0001', 'NOT_FOUND',
  'archived group rules are no longer projected'
);
select throws_ok(
  $$select public.archive_group(
    'f6000000-0000-4000-8000-000000000401',
    'f6000000-0000-4000-8000-000000000903'
  )$$,
  'P0001', 'NOT_FOUND',
  'repeating an archive is a non-disclosing failure'
);
reset role;

select is(
  (
    select lifecycle::text
    from public.groups
    where id = 'f6000000-0000-4000-8000-000000000401'
  ),
  'archived'::text,
  'archive is a durable group lifecycle transition'
);
select is(
  (
    select count(*)
    from public.events
    where organizing_group_id = 'f6000000-0000-4000-8000-000000000401'
      and status = 'cancelled'
      and cancelled_at is not null
      and cancel_reason = 'Group archived by its owner.'
  ),
  2::bigint,
  'archive cancels every future live group event'
);
select ok(
  (
    select revoked_at is not null
    from public.group_invite_tokens
    where id = 'f6000000-0000-4000-8000-000000000601'
  ),
  'archive revokes unused active invite links'
);
select is(
  (
    select count(*)
    from public.group_memberships
    where group_id = 'f6000000-0000-4000-8000-000000000401'
  ),
  1::bigint,
  'archive retains membership history'
);
select is(
  (
    select count(*)
    from public.event_attendance
    where event_id = 'f6000000-0000-4000-8000-000000000502'
  ),
  1::bigint,
  'archive retains attendance history'
);
select is(
  (
    select count(*)
    from public.security_audit_events
    where actor_id = 'f6000000-0000-4000-8000-000000000101'
      and action = 'group.archive'
      and resource_id = 'f6000000-0000-4000-8000-000000000401'
      and outcome = 'succeeded'
      and request_id = 'f6000000-0000-4000-8000-000000000902'
  ),
  1::bigint,
  'archive records one request-correlated security audit event'
);

set local role authenticated;
set local "request.jwt.claim.sub" = 'f6000000-0000-4000-8000-000000000101';
select is(
  (
    select count(*)
    from public.groups
    where id = 'f6000000-0000-4000-8000-000000000401'
  ),
  0::bigint,
  'RLS removes an archived group from former-member direct reads'
);
reset role;

select * from finish();
rollback;
