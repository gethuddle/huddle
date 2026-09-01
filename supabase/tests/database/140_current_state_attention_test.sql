begin;

create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public, pg_catalog;

select no_plan();

select isnt(
  to_regprocedure('public.list_attention_items(integer)'),
  null::regprocedure,
  'attention is exposed through one bounded current-state projection'
);
select isnt(
  to_regprocedure('public.list_my_events(text,integer,integer)'),
  null::regprocedure,
  'Fan event libraries use one bucketed projection'
);
select isnt(
  to_regprocedure('public.list_my_group_relationships(text,integer,integer)'),
  null::regprocedure,
  'Fan group libraries use one bucketed projection'
);
select isnt(
  to_regprocedure('public.list_my_saved_items(text,integer,integer)'),
  null::regprocedure,
  'saved interests use one bounded union projection'
);
select isnt(
  to_regprocedure('public.list_people_hub(text,text,integer,integer)'),
  null::regprocedure,
  'People discovery and relationships share one bounded projection'
);

select is(
  (
    select count(*)
    from pg_proc as procedure
    join pg_namespace as namespace on namespace.oid = procedure.pronamespace
    where namespace.nspname = 'public'
      and procedure.proname in (
        'list_attention_items',
        'list_my_events',
        'list_my_group_relationships',
        'list_my_saved_items',
        'list_people_hub'
      )
      and procedure.prosecdef
      and procedure.proconfig = array['search_path=""']::text[]
  ),
  5::bigint,
  'every current-state RPC is security definer with an empty search path'
);
select is(
  (
    select count(*)
    from pg_proc as procedure
    join pg_namespace as namespace on namespace.oid = procedure.pronamespace
    where namespace.nspname = 'public'
      and procedure.proname in (
        'list_attention_items',
        'list_my_events',
        'list_my_group_relationships',
        'list_my_saved_items',
        'list_people_hub'
      )
      and procedure.provolatile = 'v'
  ),
  5::bigint,
  'lock-capable Fan projections remain callable through PostgREST'
);

select ok(
  has_function_privilege('authenticated', 'public.list_attention_items(integer)', 'execute')
  and has_function_privilege(
    'authenticated', 'public.list_my_events(text,integer,integer)', 'execute'
  )
  and has_function_privilege(
    'authenticated', 'public.list_my_group_relationships(text,integer,integer)', 'execute'
  )
  and has_function_privilege(
    'authenticated', 'public.list_my_saved_items(text,integer,integer)', 'execute'
  )
  and has_function_privilege(
    'authenticated', 'public.list_people_hub(text,text,integer,integer)', 'execute'
  ),
  'authenticated Fans may call every current-state RPC'
);
select ok(
  not has_function_privilege('anon', 'public.list_attention_items(integer)', 'execute')
  and not has_function_privilege(
    'anon', 'public.list_my_events(text,integer,integer)', 'execute'
  )
  and not has_function_privilege(
    'anon', 'public.list_my_group_relationships(text,integer,integer)', 'execute'
  )
  and not has_function_privilege(
    'anon', 'public.list_my_saved_items(text,integer,integer)', 'execute'
  )
  and not has_function_privilege(
    'anon', 'public.list_people_hub(text,text,integer,integer)', 'execute'
  ),
  'anonymous sessions cannot enumerate current-state Fan projections'
);

select ok(
  not (
    lower(pg_get_function_result('public.list_attention_items(integer)'::regprocedure))
    ~ '(email|address|coordinate|latitude|longitude|token|report)'
  ),
  'attention structurally omits secrets, locations, email and safety data'
);
select ok(
  not (
    lower(pg_get_function_result(
      'public.list_my_events(text,integer,integer)'::regprocedure
    )) ~ '(email|address|coordinate|latitude|longitude|token|report)'
  ),
  'event libraries structurally omit private and confidential fields'
);
select ok(
  not (
    lower(pg_get_function_result(
      'public.list_my_group_relationships(text,integer,integer)'::regprocedure
    )) ~ '(email|application_message|token|report)'
  ),
  'group libraries structurally omit application notes and confidential fields'
);
select ok(
  not (
    lower(pg_get_function_result(
      'public.list_people_hub(text,text,integer,integer)'::regprocedure
    )) ~ '(email|address|coordinate|latitude|longitude|token|report)'
  ),
  'People structurally omits private and confidential fields'
);
select ok(
  lower(pg_get_function_result(
    'public.list_event_attendance(uuid,integer,integer)'::regprocedure
  )) ~ 'review_mode text'
  and lower(pg_get_function_result(
    'public.list_event_attendance(uuid,integer,integer)'::regprocedure
  )) ~ 'review_reason text'
  and lower(pg_get_function_result(
    'public.list_event_attendance(uuid,integer,integer)'::regprocedure
  )) ~ 'can_approve boolean',
  'event-management attendance exposes an authoritative review mode without client inference'
);

insert into auth.users (
  instance_id, id, aud, role, email, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
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
  statement_timestamp() - interval '30 days',
  statement_timestamp()
from (
  values
    ('c5000000-0000-4000-8000-000000000101'::uuid, 'state-owner@example.test'),
    ('c5000000-0000-4000-8000-000000000102'::uuid, 'state-fan@example.test'),
    ('c5000000-0000-4000-8000-000000000103'::uuid, 'state-admin@example.test'),
    ('c5000000-0000-4000-8000-000000000104'::uuid, 'state-team@example.test'),
    ('c5000000-0000-4000-8000-000000000105'::uuid, 'state-group@example.test'),
    ('c5000000-0000-4000-8000-000000000106'::uuid, 'state-city@example.test'),
    ('c5000000-0000-4000-8000-000000000107'::uuid, 'state-blocked@example.test'),
    ('c5000000-0000-4000-8000-000000000108'::uuid, 'state-suspended@example.test'),
    ('c5000000-0000-4000-8000-000000000109'::uuid, 'state-restricted@example.test'),
    ('c5000000-0000-4000-8000-000000000110'::uuid, 'state-incomplete@example.test'),
    ('c5000000-0000-4000-8000-000000000111'::uuid, 'state-unlisted@example.test'),
    ('c5000000-0000-4000-8000-000000000112'::uuid, 'state-history@example.test')
) as fixture(id, email);

update public.profiles
set
  handle = case id
    when 'c5000000-0000-4000-8000-000000000101' then 'state_owner'
    when 'c5000000-0000-4000-8000-000000000102' then 'state_fan'
    when 'c5000000-0000-4000-8000-000000000103' then 'state_admin'
    when 'c5000000-0000-4000-8000-000000000104' then 'state_team'
    when 'c5000000-0000-4000-8000-000000000105' then 'state_group'
    when 'c5000000-0000-4000-8000-000000000106' then 'state_city'
    when 'c5000000-0000-4000-8000-000000000107' then 'state_blocked'
    when 'c5000000-0000-4000-8000-000000000108' then 'state_suspended'
    when 'c5000000-0000-4000-8000-000000000109' then 'state_restricted'
    when 'c5000000-0000-4000-8000-000000000111' then 'state_unlisted'
    else 'state_history'
  end,
  display_name = case id
    when 'c5000000-0000-4000-8000-000000000101' then 'Current Owner'
    when 'c5000000-0000-4000-8000-000000000102' then 'Current Fan'
    when 'c5000000-0000-4000-8000-000000000103' then 'Current Admin'
    when 'c5000000-0000-4000-8000-000000000104' then 'Shared Team Person'
    when 'c5000000-0000-4000-8000-000000000105' then 'Shared Group Person'
    when 'c5000000-0000-4000-8000-000000000106' then 'Same City Person'
    when 'c5000000-0000-4000-8000-000000000107' then 'Blocked Person'
    when 'c5000000-0000-4000-8000-000000000108' then 'Suspended Person'
    when 'c5000000-0000-4000-8000-000000000109' then 'Restricted Person'
    when 'c5000000-0000-4000-8000-000000000111' then 'Unlisted Applicant'
    else 'History Person'
  end,
  adult_attested_at = statement_timestamp(),
  rules_version = 1,
  rules_accepted_at = statement_timestamp(),
  profile_completed_at = statement_timestamp(),
  fan_enabled_at = statement_timestamp()
where id in (
  'c5000000-0000-4000-8000-000000000101',
  'c5000000-0000-4000-8000-000000000102',
  'c5000000-0000-4000-8000-000000000103',
  'c5000000-0000-4000-8000-000000000104',
  'c5000000-0000-4000-8000-000000000105',
  'c5000000-0000-4000-8000-000000000106',
  'c5000000-0000-4000-8000-000000000107',
  'c5000000-0000-4000-8000-000000000108',
  'c5000000-0000-4000-8000-000000000109',
  'c5000000-0000-4000-8000-000000000111',
  'c5000000-0000-4000-8000-000000000112'
);

update public.profiles
set suspended_at = statement_timestamp()
where id = 'c5000000-0000-4000-8000-000000000108';

update public.profiles
set
  community_restricted_at = statement_timestamp(),
  community_restricted_until = statement_timestamp() + interval '7 days'
where id = 'c5000000-0000-4000-8000-000000000109';

insert into public.competitions (
  id, sport_id, provider, provider_external_id, code, name, country_name, last_synced_at
)
values (
  'c5000000-0000-4000-8000-000000000201',
  '00000000-0000-4000-8000-000000000020',
  'current-state-test', 'competition', 'CST', 'Current State League', 'England',
  statement_timestamp()
);

insert into public.teams (
  id, sport_id, provider, provider_external_id, name, short_name, tla,
  country_name, last_synced_at
)
values
  (
    'c5000000-0000-4000-8000-000000000202',
    '00000000-0000-4000-8000-000000000020',
    'current-state-test', 'home', 'Current Home FC', 'Current Home', 'CHF',
    'England', statement_timestamp()
  ),
  (
    'c5000000-0000-4000-8000-000000000203',
    '00000000-0000-4000-8000-000000000020',
    'current-state-test', 'away', 'Current Away FC', 'Current Away', 'CAF',
    'England', statement_timestamp()
  ),
  (
    'c5000000-0000-4000-8000-000000000206',
    '00000000-0000-4000-8000-000000000020',
    'current-state-test', 'inactive', 'Inactive Follow FC', 'Inactive Follow', 'IFF',
    'England', statement_timestamp()
  );

update public.teams
set active = false
where id = 'c5000000-0000-4000-8000-000000000206';

insert into public.matches (
  id, provider, provider_external_id, competition_id, home_team_id,
  away_team_id, starts_at, status, matchday, season_label, last_synced_at
)
values
  (
    'c5000000-0000-4000-8000-000000000204',
    'current-state-test', 'future-match',
    'c5000000-0000-4000-8000-000000000201',
    'c5000000-0000-4000-8000-000000000202',
    'c5000000-0000-4000-8000-000000000203',
    statement_timestamp() + interval '7 days', 'timed', 1, '2026', statement_timestamp()
  ),
  (
    'c5000000-0000-4000-8000-000000000205',
    'current-state-test', 'past-match',
    'c5000000-0000-4000-8000-000000000201',
    'c5000000-0000-4000-8000-000000000202',
    'c5000000-0000-4000-8000-000000000203',
    statement_timestamp() - interval '7 days', 'finished', 1, '2026', statement_timestamp()
  );

insert into public.groups (
  id, slug, name, owner_id, team_id, visibility, lifecycle,
  description, activated_at
)
values
  (
    'c5000000-0000-4000-8000-000000000301',
    'current-active-group', 'Current Active Group',
    'c5000000-0000-4000-8000-000000000101',
    'c5000000-0000-4000-8000-000000000202',
    'unlisted', 'active', 'Member-only active group description.', statement_timestamp()
  ),
  (
    'c5000000-0000-4000-8000-000000000302',
    'current-applications', 'Current Applications',
    'c5000000-0000-4000-8000-000000000101', null,
    'discoverable', 'forming', 'Public application group description.', null
  ),
  (
    'c5000000-0000-4000-8000-000000000303',
    'current-unlisted-applications', 'Current Unlisted Applications',
    'c5000000-0000-4000-8000-000000000101', null,
    'unlisted', 'active', 'Never disclose this member description.', statement_timestamp()
  );

insert into public.group_memberships (group_id, user_id, role, status, application_message)
values
  ('c5000000-0000-4000-8000-000000000301', 'c5000000-0000-4000-8000-000000000101', 'owner', 'active', null),
  ('c5000000-0000-4000-8000-000000000301', 'c5000000-0000-4000-8000-000000000102', 'member', 'active', null),
  ('c5000000-0000-4000-8000-000000000301', 'c5000000-0000-4000-8000-000000000103', 'admin', 'active', null),
  ('c5000000-0000-4000-8000-000000000301', 'c5000000-0000-4000-8000-000000000105', 'member', 'active', null),
  ('c5000000-0000-4000-8000-000000000302', 'c5000000-0000-4000-8000-000000000101', 'owner', 'active', null),
  ('c5000000-0000-4000-8000-000000000302', 'c5000000-0000-4000-8000-000000000102', 'member', 'pending', 'No sensitive details here.'),
  ('c5000000-0000-4000-8000-000000000303', 'c5000000-0000-4000-8000-000000000101', 'owner', 'active', null),
  ('c5000000-0000-4000-8000-000000000303', 'c5000000-0000-4000-8000-000000000111', 'member', 'pending', 'Private invite application note.');

insert into public.venues (
  id, owner_id, slug, name, address_text, location,
  description, stated_capacity
)
values (
  'c5000000-0000-4000-8000-000000000401',
  'c5000000-0000-4000-8000-000000000102',
  'current-state-venue', 'Current State Venue',
  '20 Public Street, Haifa',
  extensions.st_setsrid(extensions.st_makepoint(34.998, 32.812), 4326)::extensions.geography,
  'A public venue used only for current-state projection tests.', 50
);

insert into public.events (
  id, created_by, host_user_id, host_venue_id, organizing_group_id,
  match_id, title, description, expected_activity, cost_description,
  event_rules, commercial_affiliation, host_presence_confirmed_at,
  starts_at, ends_at, place_kind, venue_id,
  public_place_name, public_address_text, public_location,
  audience, audience_group_id, capacity, requires_approval,
  status, published_at, cancelled_at, cancel_reason
)
values
  (
    'c5000000-0000-4000-8000-000000000501',
    'c5000000-0000-4000-8000-000000000101',
    'c5000000-0000-4000-8000-000000000101', null, null,
    'c5000000-0000-4000-8000-000000000204',
    'Current Invitation', 'A future invitation-only event for current-state tests.',
    'Watch together', 'Free', 'Respect everyone.', 'None', statement_timestamp(),
    statement_timestamp() + interval '7 days', statement_timestamp() + interval '7 days 3 hours',
    'public_place', null, 'Current Cafe', '10 Public Street, Haifa',
    extensions.st_setsrid(extensions.st_makepoint(34.997, 32.811), 4326)::extensions.geography,
    'invite_only', null, 10, true, 'published', statement_timestamp(), null, null
  ),
  (
    'c5000000-0000-4000-8000-000000000502',
    'c5000000-0000-4000-8000-000000000101',
    'c5000000-0000-4000-8000-000000000101', null,
    'c5000000-0000-4000-8000-000000000301',
    'c5000000-0000-4000-8000-000000000204',
    'Current Request', 'A group event with an attendance request.',
    'Watch together', 'Free', 'Respect everyone.', 'None', statement_timestamp(),
    statement_timestamp() + interval '7 days 1 hour', statement_timestamp() + interval '7 days 4 hours',
    'public_place', null, 'Group Cafe', '11 Public Street, Haifa',
    extensions.st_setsrid(extensions.st_makepoint(34.996, 32.810), 4326)::extensions.geography,
    'group', 'c5000000-0000-4000-8000-000000000301', 10, true,
    'published', statement_timestamp(), null, null
  ),
  (
    'c5000000-0000-4000-8000-000000000503',
    'c5000000-0000-4000-8000-000000000102',
    'c5000000-0000-4000-8000-000000000102', null,
    'c5000000-0000-4000-8000-000000000301',
    'c5000000-0000-4000-8000-000000000204',
    'Member Submission', 'A member submission that needs a different administrator.',
    'Watch together', 'Free', 'Respect everyone.', 'None', statement_timestamp(),
    statement_timestamp() + interval '8 days', statement_timestamp() + interval '8 days 3 hours',
    'public_place', null, 'Member Cafe', '12 Public Street, Haifa',
    extensions.st_setsrid(extensions.st_makepoint(34.995, 32.809), 4326)::extensions.geography,
    'group', 'c5000000-0000-4000-8000-000000000301', 10, true,
    'pending_group_review', null, null, null
  ),
  (
    'c5000000-0000-4000-8000-000000000504',
    'c5000000-0000-4000-8000-000000000101',
    'c5000000-0000-4000-8000-000000000101', null,
    'c5000000-0000-4000-8000-000000000301',
    'c5000000-0000-4000-8000-000000000204',
    'Legacy Self Review', 'A crafted legacy row the creator must not review.',
    'Watch together', 'Free', 'Respect everyone.', 'None', statement_timestamp(),
    statement_timestamp() + interval '9 days', statement_timestamp() + interval '9 days 3 hours',
    'public_place', null, 'Legacy Cafe', '13 Public Street, Haifa',
    extensions.st_setsrid(extensions.st_makepoint(34.994, 32.808), 4326)::extensions.geography,
    'group', 'c5000000-0000-4000-8000-000000000301', 10, true,
    'pending_group_review', null, null, null
  ),
  (
    'c5000000-0000-4000-8000-000000000505',
    'c5000000-0000-4000-8000-000000000101',
    'c5000000-0000-4000-8000-000000000101', null, null,
    'c5000000-0000-4000-8000-000000000204',
    'Cancelled Hosting', 'A cancelled event retained only for host history.',
    'Watch together', 'Free', 'Respect everyone.', 'None', statement_timestamp(),
    statement_timestamp() + interval '5 days', statement_timestamp() + interval '5 days 3 hours',
    'public_place', null, 'Cancelled Cafe', '14 Public Street, Haifa',
    extensions.st_setsrid(extensions.st_makepoint(34.993, 32.807), 4326)::extensions.geography,
    'invite_only', null, 10, true,
    'cancelled', null, statement_timestamp(), 'Cancelled for test'
  ),
  (
    'c5000000-0000-4000-8000-000000000506',
    'c5000000-0000-4000-8000-000000000112',
    'c5000000-0000-4000-8000-000000000112', null, null,
    'c5000000-0000-4000-8000-000000000205',
    'Completed Attendance', 'A completed event actually attended by the Fan.',
    'Watch together', 'Free', 'Respect everyone.', 'None', statement_timestamp() - interval '8 days',
    statement_timestamp() - interval '7 days', statement_timestamp() - interval '7 days' + interval '3 hours',
    'public_place', null, 'History Cafe', '15 Public Street, Haifa',
    extensions.st_setsrid(extensions.st_makepoint(34.992, 32.806), 4326)::extensions.geography,
    'invite_only', null, 10, true,
    'completed', statement_timestamp() - interval '8 days', null, null
  ),
  (
    'c5000000-0000-4000-8000-000000000507',
    'c5000000-0000-4000-8000-000000000112',
    'c5000000-0000-4000-8000-000000000112', null, null,
    'c5000000-0000-4000-8000-000000000205',
    'Completed Mere Invitation', 'A completed event that was only invited.',
    'Watch together', 'Free', 'Respect everyone.', 'None', statement_timestamp() - interval '8 days',
    statement_timestamp() - interval '6 days', statement_timestamp() - interval '6 days' + interval '3 hours',
    'public_place', null, 'Old Cafe', '16 Public Street, Haifa',
    extensions.st_setsrid(extensions.st_makepoint(34.991, 32.805), 4326)::extensions.geography,
    'invite_only', null, 10, true,
    'completed', statement_timestamp() - interval '8 days', null, null
  ),
  (
    'c5000000-0000-4000-8000-000000000508',
    'c5000000-0000-4000-8000-000000000102',
    null, 'c5000000-0000-4000-8000-000000000401', null,
    'c5000000-0000-4000-8000-000000000204',
    'Venue Work', 'Commercial work must not leak into Fan My Huddle.',
    'Watch together', 'Free', 'Respect everyone.', 'Current State Venue', statement_timestamp(),
    statement_timestamp() + interval '10 days', statement_timestamp() + interval '10 days 3 hours',
    'venue', 'c5000000-0000-4000-8000-000000000401', null, null, null,
    'public', null, 50, false, 'published', statement_timestamp(), null, null
  ),
  (
    'c5000000-0000-4000-8000-000000000509',
    'c5000000-0000-4000-8000-000000000112',
    'c5000000-0000-4000-8000-000000000112', null, null,
    'c5000000-0000-4000-8000-000000000204',
    'Cancelled Before Attendance', 'A cancelled event with a retained approved reservation.',
    'Watch together', 'Free', 'Respect everyone.', 'None', statement_timestamp(),
    statement_timestamp() + interval '4 days', statement_timestamp() + interval '4 days 3 hours',
    'public_place', null, 'Cancelled Reservation Cafe', '17 Public Street, Haifa',
    extensions.st_setsrid(extensions.st_makepoint(34.990, 32.804), 4326)::extensions.geography,
    'invite_only', null, 10, true,
    'cancelled', statement_timestamp() - interval '1 day', statement_timestamp(), 'Cancelled before it happened'
  );

insert into public.event_invitations (event_id, invitee_id, invited_by, status, responded_at)
values
  ('c5000000-0000-4000-8000-000000000501', 'c5000000-0000-4000-8000-000000000102', 'c5000000-0000-4000-8000-000000000101', 'pending', null),
  ('c5000000-0000-4000-8000-000000000507', 'c5000000-0000-4000-8000-000000000102', 'c5000000-0000-4000-8000-000000000112', 'accepted', statement_timestamp() - interval '8 days');

insert into public.event_attendance (
  event_id, user_id, status, source, requested_at, reviewed_by, reviewed_at,
  left_at, removed_by, removed_at, removal_reason
)
values
  ('c5000000-0000-4000-8000-000000000502', 'c5000000-0000-4000-8000-000000000102', 'requested', 'self_request', statement_timestamp(), null, null, null, null, null, null),
  ('c5000000-0000-4000-8000-000000000506', 'c5000000-0000-4000-8000-000000000102', 'approved', 'direct_invite', statement_timestamp() - interval '8 days', 'c5000000-0000-4000-8000-000000000112', statement_timestamp() - interval '8 days', null, null, null, null),
  ('c5000000-0000-4000-8000-000000000508', 'c5000000-0000-4000-8000-000000000102', 'approved', 'self_request', statement_timestamp(), 'c5000000-0000-4000-8000-000000000112', statement_timestamp(), null, null, null, null),
  ('c5000000-0000-4000-8000-000000000501', 'c5000000-0000-4000-8000-000000000102', 'declined', 'self_request', statement_timestamp(), 'c5000000-0000-4000-8000-000000000101', statement_timestamp(), null, null, null, null),
  ('c5000000-0000-4000-8000-000000000505', 'c5000000-0000-4000-8000-000000000102', 'left', 'self_request', statement_timestamp() - interval '1 day', 'c5000000-0000-4000-8000-000000000101', statement_timestamp() - interval '1 day', statement_timestamp(), null, null, null),
  ('c5000000-0000-4000-8000-000000000507', 'c5000000-0000-4000-8000-000000000102', 'removed', 'direct_invite', statement_timestamp() - interval '8 days', 'c5000000-0000-4000-8000-000000000112', statement_timestamp() - interval '8 days', null, 'c5000000-0000-4000-8000-000000000112', statement_timestamp() - interval '5 days', 'Removed before the event'),
  ('c5000000-0000-4000-8000-000000000509', 'c5000000-0000-4000-8000-000000000102', 'approved', 'self_request', statement_timestamp() - interval '1 day', 'c5000000-0000-4000-8000-000000000112', statement_timestamp() - interval '1 day', null, null, null, null);

insert into public.friendships (
  id, user_low_id, user_high_id, requested_by, status, responded_at
)
values (
  'c5000000-0000-4000-8000-000000000601',
  'c5000000-0000-4000-8000-000000000101',
  'c5000000-0000-4000-8000-000000000102',
  'c5000000-0000-4000-8000-000000000102',
  'pending', null
);

insert into public.user_blocks (blocker_id, blocked_id)
values ('c5000000-0000-4000-8000-000000000101', 'c5000000-0000-4000-8000-000000000107');

insert into public.subscriptions (user_id, kind, team_id)
values
  ('c5000000-0000-4000-8000-000000000101', 'team', 'c5000000-0000-4000-8000-000000000202'),
  ('c5000000-0000-4000-8000-000000000104', 'team', 'c5000000-0000-4000-8000-000000000202'),
  ('c5000000-0000-4000-8000-000000000102', 'team', 'c5000000-0000-4000-8000-000000000206');

insert into public.venue_follows (user_id, venue_id)
values ('c5000000-0000-4000-8000-000000000101', 'c5000000-0000-4000-8000-000000000401');

set local role authenticated;
set local "request.jwt.claim.sub" = 'c5000000-0000-4000-8000-000000000102';

select is(
  (select count(*) from public.list_attention_items(20) where kind = 'event_invitation'),
  1::bigint,
  'a pending direct invitation appears for its recipient'
);
select is(
  (select href from public.list_attention_items(20) where kind = 'event_invitation'),
  '/events/c5000000-0000-4000-8000-000000000501',
  'an invitation links directly to the authorized event'
);
select is(
  (select count(*) from public.list_attention_items(20) where kind = 'workspace_setup'),
  1::bigint,
  'a Fan without a team or competition follow gets one setup item'
);
select is(
  (select kind from public.list_attention_items(1)),
  'event_invitation'::text,
  'attention uses a stable created-at, kind and key order'
);
select is(
  (
    select count(*) = count(distinct key)
    from public.list_attention_items(20)
  ),
  true,
  'attention keys are unique within the derived current state'
);
select is(
  (select count(*) from public.list_my_events('upcoming', 20, 0)),
  1::bigint,
  'a Fan attendance relationship to a Venue event remains in the Fan library'
);
select is(
  (
    select event_id
    from public.list_my_events('upcoming', 20, 0)
  ),
  'c5000000-0000-4000-8000-000000000508'::uuid,
  'a pending invitation remains attention rather than displacing acquired Venue attendance'
);
select is(
  (
    select relationship_label
    from public.list_my_events('upcoming', 20, 0)
    where event_id = 'c5000000-0000-4000-8000-000000000508'
  ),
  'You are going'::text,
  'Venue-originated work keeps Fan attendance copy even when the same human created it'
);
select is(
  (
    select can_manage
    from public.list_my_events('upcoming', 20, 0)
    where event_id = 'c5000000-0000-4000-8000-000000000508'
  ),
  false,
  'Venue-originated attendance never exposes a commercial Manage action in Fan My Huddle'
);
select is(
  (select count(*) from public.list_my_events('pending', 20, 0)),
  2::bigint,
  'pending attendance and a member submission are recoverable'
);
select is(
  (select count(*) from public.list_my_events('history', 20, 0)),
  1::bigint,
  'History includes only a completed event the Fan actually attended'
);
select is(
  (select event_id from public.list_my_events('history', 20, 0)),
  'c5000000-0000-4000-8000-000000000506'::uuid,
  'mere invitations and removed relationships do not create history'
);
select is(
  (
    select count(*)
    from public.list_my_events('history', 20, 0)
    where event_id = 'c5000000-0000-4000-8000-000000000509'
  ),
  0::bigint,
  'an approved reservation on a cancelled event is not attendance history'
);
select is(
  (
    select count(*)
    from public.list_my_events('upcoming', 20, 0)
    where event_id in (
      'c5000000-0000-4000-8000-000000000501',
      'c5000000-0000-4000-8000-000000000505',
      'c5000000-0000-4000-8000-000000000507'
    )
  ),
  0::bigint,
  'declined, left and removed attendance residue never enters active event lists'
);
select is(
  (select count(*) from public.list_my_group_relationships('applying', 20, 0)),
  1::bigint,
  'a pending discoverable application is recoverable'
);
select is(
  (select description from public.list_my_group_relationships('applying', 20, 0)),
  null::text,
  'pending applicants receive no description/member projection'
);
select is(
  (select active_member_count from public.list_my_group_relationships('applying', 20, 0)),
  null::integer,
  'pending applicants receive no active-member count'
);
select is(
  (
    select count(*)
    from public.list_my_group_relationships('applying', 20, 0)
    where visibility = 'unlisted'
  ),
  0::bigint,
  'a pending unlisted applicant receives no dead or member-like projection'
);

reset role;
savepoint venue_pending_relationship;
update public.event_attendance
set status = 'requested', reviewed_by = null, reviewed_at = null
where event_id = 'c5000000-0000-4000-8000-000000000508'
  and user_id = 'c5000000-0000-4000-8000-000000000102';
set local role authenticated;
set local "request.jwt.claim.sub" = 'c5000000-0000-4000-8000-000000000102';
select is(
  (
    select relationship_label
    from public.list_my_events('pending', 20, 0)
    where event_id = 'c5000000-0000-4000-8000-000000000508'
  ),
  'Waiting for host'::text,
  'a Venue creator can still recover an independent pending Fan request'
);
select is(
  (
    select can_manage
    from public.list_my_events('pending', 20, 0)
    where event_id = 'c5000000-0000-4000-8000-000000000508'
  ),
  false,
  'a pending Fan relationship never inherits Venue management controls'
);
reset role;
rollback to savepoint venue_pending_relationship;

savepoint venue_in_progress_relationship;
update public.events
set
  starts_at = statement_timestamp() - interval '30 minutes',
  ends_at = statement_timestamp() + interval '2 hours'
where id = 'c5000000-0000-4000-8000-000000000508';
set local role authenticated;
set local "request.jwt.claim.sub" = 'c5000000-0000-4000-8000-000000000102';
select is(
  (
    select count(*)
    from public.list_my_events('upcoming', 20, 0)
    where event_id = 'c5000000-0000-4000-8000-000000000508'
  ),
  0::bigint,
  'approved attendance leaves Upcoming at kickoff rather than remaining until event end'
);
reset role;
rollback to savepoint venue_in_progress_relationship;

savepoint venue_history_relationship;
update public.events
set
  status = 'completed',
  starts_at = statement_timestamp() - interval '2 days',
  ends_at = statement_timestamp() - interval '2 days' + interval '3 hours'
where id = 'c5000000-0000-4000-8000-000000000508';
set local role authenticated;
set local "request.jwt.claim.sub" = 'c5000000-0000-4000-8000-000000000102';
select is(
  (
    select relationship_label
    from public.list_my_events('history', 20, 0)
    where event_id = 'c5000000-0000-4000-8000-000000000508'
  ),
  'You attended'::text,
  'completed Venue attendance stays Fan history rather than commercial ownership history'
);
select is(
  (
    select can_manage
    from public.list_my_events('history', 20, 0)
    where event_id = 'c5000000-0000-4000-8000-000000000508'
  ),
  false,
  'completed Venue attendance never exposes Venue management from Fan history'
);
reset role;
rollback to savepoint venue_history_relationship;

savepoint former_group_member_projection;
update public.group_memberships
set role = 'member', status = 'left'
where group_id = 'c5000000-0000-4000-8000-000000000301'
  and user_id = 'c5000000-0000-4000-8000-000000000102';
set local role authenticated;
set local "request.jwt.claim.sub" = 'c5000000-0000-4000-8000-000000000102';
select is(
  (
    select count(*)
    from public.list_my_events('pending', 20, 0)
    where event_id = 'c5000000-0000-4000-8000-000000000503'
  ),
  0::bigint,
  'a former group member receives no pending group-event content'
);
reset role;
rollback to savepoint former_group_member_projection;

savepoint suspended_group_projection;
update public.groups
set lifecycle = 'suspended', suspended_at = statement_timestamp()
where id = 'c5000000-0000-4000-8000-000000000301';
set local role authenticated;
set local "request.jwt.claim.sub" = 'c5000000-0000-4000-8000-000000000102';
select is(
  (
    select count(*)
    from public.list_my_events('pending', 20, 0)
    where event_id = 'c5000000-0000-4000-8000-000000000503'
  ),
  0::bigint,
  'a suspended group removes its pending event projection'
);
reset role;
rollback to savepoint suspended_group_projection;

reset role;
update public.event_invitations
set status = 'declined', responded_at = statement_timestamp()
where event_id = 'c5000000-0000-4000-8000-000000000501'
  and invitee_id = 'c5000000-0000-4000-8000-000000000102';
insert into public.subscriptions (user_id, kind, competition_id)
values (
  'c5000000-0000-4000-8000-000000000102',
  'competition',
  'c5000000-0000-4000-8000-000000000201'
);
set local role authenticated;
set local "request.jwt.claim.sub" = 'c5000000-0000-4000-8000-000000000102';
select is(
  (select count(*) from public.list_attention_items(20) where kind = 'event_invitation'),
  0::bigint,
  'responding removes an invitation from attention immediately'
);
select is(
  (select count(*) from public.list_attention_items(20) where kind = 'workspace_setup'),
  0::bigint,
  'following a competition removes setup attention immediately'
);

reset role;
set local role authenticated;
set local "request.jwt.claim.sub" = 'c5000000-0000-4000-8000-000000000101';

select is(
  (select count(*) from public.list_attention_items(20) where kind = 'attendance_request'),
  1::bigint,
  'an event manager sees a current attendance request'
);
select is(
  (select count(*) from public.list_attention_items(20) where kind = 'friend_request'),
  1::bigint,
  'a recipient sees a current friend request'
);
select is(
  (select href from public.list_attention_items(20) where kind = 'friend_request'),
  '/people#people-incoming'::text,
  'friend-request attention targets the real incoming section'
);
select is(
  (select count(*) from public.list_attention_items(20) where kind = 'group_application'),
  2::bigint,
  'a group owner sees discoverable and unlisted pending applications safely'
);
select is(
  (select count(*) from public.list_attention_items(20) where kind = 'group_event_submission'),
  1::bigint,
  'a different current owner sees one member event submission'
);
select is(
  (
    select count(*)
    from public.list_attention_items(20)
    where key = 'group_event_submission:c5000000-0000-4000-8000-000000000504'
  ),
  0::bigint,
  'a creator never receives self-review attention for a crafted pending row'
);
select is(
  (select count(*) from public.list_attention_items(1)),
  1::bigint,
  'attention enforces its requested bound'
);
select is(
  (select kind from public.list_attention_items(1)),
  'friend_request'::text,
  'manager attention remains deterministically ordered when kinds share a timestamp'
);
select is(
  (
    select to_jsonb(attendance_row) ->> 'review_mode'
    from public.list_event_attendance(
      'c5000000-0000-4000-8000-000000000502', 20, 0
    ) as attendance_row
    where attendance_row.requester_handle = 'state_fan'
  ),
  'approve_or_decline'::text,
  'event management marks a currently approvable request authoritatively'
);
select is(
  (
    select (to_jsonb(attendance_row) ->> 'can_approve')::boolean
    from public.list_event_attendance(
      'c5000000-0000-4000-8000-000000000502', 20, 0
    ) as attendance_row
    where attendance_row.requester_handle = 'state_fan'
  ),
  true,
  'event management exposes approval only when the authoritative mutation can approve now'
);

reset role;
savepoint null_attendance_decision;
select set_config(
  'test.attendance_request_id',
  (select id::text from public.event_attendance
    where event_id = 'c5000000-0000-4000-8000-000000000502'
      and user_id = 'c5000000-0000-4000-8000-000000000102'),
  true
);
set local role authenticated;
set local "request.jwt.claim.sub" = 'c5000000-0000-4000-8000-000000000101';
select throws_ok(
  $$select * from public.review_attendance(
    current_setting('test.attendance_request_id')::uuid,
    null, null
  )$$,
  'P0001', 'VALIDATION_FAILED',
  'a null attendance decision fails closed before mutation'
);
reset role;
select is(
  (
    select status
    from public.event_attendance
    where id = current_setting('test.attendance_request_id')::uuid
  ),
  'requested'::public.attendance_status,
  'a null attendance decision leaves the request untouched'
);
rollback to savepoint null_attendance_decision;

savepoint unsupported_attendance_decision;
select set_config(
  'test.attendance_request_id',
  (select id::text from public.event_attendance
    where event_id = 'c5000000-0000-4000-8000-000000000502'
      and user_id = 'c5000000-0000-4000-8000-000000000102'),
  true
);
set local role authenticated;
set local "request.jwt.claim.sub" = 'c5000000-0000-4000-8000-000000000101';
select throws_ok(
  $$select * from public.review_attendance(
    current_setting('test.attendance_request_id')::uuid,
    'later', null
  )$$,
  'P0001', 'VALIDATION_FAILED',
  'an unsupported attendance decision fails closed before mutation'
);
reset role;
select is(
  (
    select status
    from public.event_attendance
    where id = current_setting('test.attendance_request_id')::uuid
  ),
  'requested'::public.attendance_status,
  'an unsupported attendance decision leaves the request untouched'
);
rollback to savepoint unsupported_attendance_decision;

reset role;
savepoint kicked_off_attendance_request;
update public.events
set starts_at = statement_timestamp() - interval '1 minute'
where id = 'c5000000-0000-4000-8000-000000000502';
select set_config(
  'test.attendance_request_id',
  (select id::text from public.event_attendance
    where event_id = 'c5000000-0000-4000-8000-000000000502'
      and user_id = 'c5000000-0000-4000-8000-000000000102'),
  true
);
set local role authenticated;
set local "request.jwt.claim.sub" = 'c5000000-0000-4000-8000-000000000101';
select is(
  (
    select count(*)
    from public.list_attention_items(20)
    where kind = 'attendance_request'
      and resource_id = 'c5000000-0000-4000-8000-000000000502'
  ),
  1::bigint,
  'kickoff keeps one decline-only attendance request while the event is still in progress'
);
select is(
  (
    select position('decline' in description) > 0
    from public.list_attention_items(20)
    where kind = 'attendance_request'
      and resource_id = 'c5000000-0000-4000-8000-000000000502'
  ),
  true,
  'kickoff attention truthfully says only decline remains'
);
select is(
  (
    select to_jsonb(attendance_row) ->> 'review_mode'
    from public.list_event_attendance(
      'c5000000-0000-4000-8000-000000000502', 20, 0
    ) as attendance_row
    where attendance_row.attendance_id = current_setting('test.attendance_request_id')::uuid
  ),
  'decline_only'::text,
  'post-kickoff event management suppresses approval but preserves valid decline recovery'
);
select is(
  (
    select to_jsonb(attendance_row) ->> 'review_reason'
    from public.list_event_attendance(
      'c5000000-0000-4000-8000-000000000502', 20, 0
    ) as attendance_row
    where attendance_row.attendance_id = current_setting('test.attendance_request_id')::uuid
  ),
  'The event has started. Only decline remains.'::text,
  'post-kickoff event management gives a truthful decline-only reason'
);
select lives_ok(
  $$select * from public.review_attendance(
    current_setting('test.attendance_request_id')::uuid,
    'decline', null
  )$$,
  'the decline-only kickoff task invokes a valid decline mutation'
);
reset role;
rollback to savepoint kicked_off_attendance_request;

savepoint former_member_attendance_request;
update public.group_memberships
set status = 'left'
where group_id = 'c5000000-0000-4000-8000-000000000301'
  and user_id = 'c5000000-0000-4000-8000-000000000102';
select set_config(
  'test.attendance_request_id',
  (select id::text from public.event_attendance
    where event_id = 'c5000000-0000-4000-8000-000000000502'
      and user_id = 'c5000000-0000-4000-8000-000000000102'),
  true
);
set local role authenticated;
set local "request.jwt.claim.sub" = 'c5000000-0000-4000-8000-000000000101';
select is(
  (
    select count(*)
    from public.list_attention_items(20)
    where kind = 'attendance_request'
      and resource_id = 'c5000000-0000-4000-8000-000000000502'
  ),
  1::bigint,
  'audience membership loss keeps a decline-only attendance request'
);
select lives_ok(
  $$select * from public.review_attendance(
    current_setting('test.attendance_request_id')::uuid,
    'decline', null
  )$$,
  'the former-member task remains valid for decline'
);
reset role;
rollback to savepoint former_member_attendance_request;

savepoint group_lifecycle_attendance_request;
update public.groups
set lifecycle = 'suspended', suspended_at = statement_timestamp()
where id = 'c5000000-0000-4000-8000-000000000301';
set local role authenticated;
set local "request.jwt.claim.sub" = 'c5000000-0000-4000-8000-000000000101';
select is(
  (
    select count(*)
    from public.list_attention_items(20)
    where kind = 'attendance_request'
      and resource_id = 'c5000000-0000-4000-8000-000000000502'
  ),
  0::bigint,
  'group lifecycle loss removes an unapprovable attendance request'
);
reset role;
rollback to savepoint group_lifecycle_attendance_request;

savepoint friendship_loss_attendance_request;
update public.events
set audience = 'friends', audience_group_id = null
where id = 'c5000000-0000-4000-8000-000000000502';
update public.friendships
set status = 'accepted', responded_at = statement_timestamp()
where id = 'c5000000-0000-4000-8000-000000000601';
set local role authenticated;
set local "request.jwt.claim.sub" = 'c5000000-0000-4000-8000-000000000101';
select is(
  (
    select count(*)
    from public.list_attention_items(20)
    where kind = 'attendance_request'
      and resource_id = 'c5000000-0000-4000-8000-000000000502'
  ),
  1::bigint,
  'an accepted friend request remains currently approvable'
);
reset role;
update public.friendships
set status = 'declined', responded_at = statement_timestamp()
where id = 'c5000000-0000-4000-8000-000000000601';
set local role authenticated;
set local "request.jwt.claim.sub" = 'c5000000-0000-4000-8000-000000000101';
select is(
  (
    select count(*)
    from public.list_attention_items(20)
    where kind = 'attendance_request'
      and resource_id = 'c5000000-0000-4000-8000-000000000502'
  ),
  1::bigint,
  'friendship loss keeps a decline-only attendance request'
);
select is(
  (
    select position('decline' in description) > 0
    from public.list_attention_items(20)
    where kind = 'attendance_request'
      and resource_id = 'c5000000-0000-4000-8000-000000000502'
  ),
  true,
  'friendship-loss attention uses decline-only copy'
);
reset role;
rollback to savepoint friendship_loss_attendance_request;

savepoint banned_attendance_request;
insert into public.group_bans (group_id, user_id, banned_by, reason)
values (
  'c5000000-0000-4000-8000-000000000301',
  'c5000000-0000-4000-8000-000000000102',
  'c5000000-0000-4000-8000-000000000101',
  'Audience eligibility regression fixture'
);
set local role authenticated;
set local "request.jwt.claim.sub" = 'c5000000-0000-4000-8000-000000000101';
select is(
  (
    select count(*)
    from public.list_attention_items(20)
    where kind = 'attendance_request'
      and resource_id = 'c5000000-0000-4000-8000-000000000502'
  ),
  0::bigint,
  'a group ban removes attendance-request attention'
);
select is(
  (
    select count(*)
    from public.list_event_attendance(
      'c5000000-0000-4000-8000-000000000502', 20, 0
    )
    where requester_handle = 'state_fan'
  ),
  0::bigint,
  'a banned requester is omitted from the management projection as well as Attention'
);
reset role;
rollback to savepoint banned_attendance_request;

savepoint blocked_attendance_request;
insert into public.user_blocks (blocker_id, blocked_id)
values (
  'c5000000-0000-4000-8000-000000000101',
  'c5000000-0000-4000-8000-000000000102'
);
set local role authenticated;
set local "request.jwt.claim.sub" = 'c5000000-0000-4000-8000-000000000101';
select is(
  (
    select count(*)
    from public.list_attention_items(20)
    where kind = 'attendance_request'
      and resource_id = 'c5000000-0000-4000-8000-000000000502'
  ),
  0::bigint,
  'a block removes attendance-request attention immediately'
);
reset role;
rollback to savepoint blocked_attendance_request;

savepoint suspended_requester_attention;
update public.profiles
set suspended_at = statement_timestamp()
where id = 'c5000000-0000-4000-8000-000000000102';
set local role authenticated;
set local "request.jwt.claim.sub" = 'c5000000-0000-4000-8000-000000000101';
select is(
  (
    select count(*)
    from public.list_attention_items(20)
    where kind = 'attendance_request'
      and resource_id = 'c5000000-0000-4000-8000-000000000502'
  ),
  0::bigint,
  'requester suspension removes attendance-request attention'
);
reset role;
rollback to savepoint suspended_requester_attention;

savepoint restricted_requester_attention;
update public.profiles
set
  community_restricted_at = statement_timestamp(),
  community_restricted_until = statement_timestamp() + interval '1 day'
where id = 'c5000000-0000-4000-8000-000000000102';
set local role authenticated;
set local "request.jwt.claim.sub" = 'c5000000-0000-4000-8000-000000000101';
select is(
  (
    select count(*)
    from public.list_attention_items(20)
    where kind = 'attendance_request'
      and resource_id = 'c5000000-0000-4000-8000-000000000502'
  ),
  0::bigint,
  'requester restriction removes attendance-request attention'
);
reset role;
rollback to savepoint restricted_requester_attention;

savepoint disabled_fan_requester_attention;
update public.profiles
set fan_enabled_at = null
where id = 'c5000000-0000-4000-8000-000000000102';
set local role authenticated;
set local "request.jwt.claim.sub" = 'c5000000-0000-4000-8000-000000000101';
select is(
  (
    select count(*)
    from public.list_attention_items(20)
    where kind = 'attendance_request'
      and resource_id = 'c5000000-0000-4000-8000-000000000502'
  ),
  0::bigint,
  'a disabled Fan requester removes attendance-request attention'
);
reset role;
rollback to savepoint disabled_fan_requester_attention;

savepoint cancelled_request_attention;
update public.events
set status = 'cancelled', cancelled_at = statement_timestamp(), cancel_reason = 'Test cancellation'
where id = 'c5000000-0000-4000-8000-000000000502';
set local role authenticated;
set local "request.jwt.claim.sub" = 'c5000000-0000-4000-8000-000000000101';
select is(
  (
    select count(*)
    from public.list_attention_items(20)
    where kind = 'attendance_request'
      and resource_id = 'c5000000-0000-4000-8000-000000000502'
  ),
  0::bigint,
  'event cancellation removes attendance-request attention'
);
reset role;
rollback to savepoint cancelled_request_attention;

savepoint completed_request_attention;
update public.events
set status = 'completed'
where id = 'c5000000-0000-4000-8000-000000000502';
set local role authenticated;
set local "request.jwt.claim.sub" = 'c5000000-0000-4000-8000-000000000101';
select is(
  (
    select count(*)
    from public.list_attention_items(20)
    where kind = 'attendance_request'
      and resource_id = 'c5000000-0000-4000-8000-000000000502'
  ),
  0::bigint,
  'event completion removes attendance-request attention'
);
reset role;
rollback to savepoint completed_request_attention;

savepoint full_event_attendance_request;
update public.events
set capacity = 1
where id = 'c5000000-0000-4000-8000-000000000502';
insert into public.event_attendance (event_id, user_id, status, source, reviewed_by, reviewed_at)
values (
  'c5000000-0000-4000-8000-000000000502',
  'c5000000-0000-4000-8000-000000000103',
  'approved', 'self_request',
  'c5000000-0000-4000-8000-000000000101', statement_timestamp()
);
select set_config(
  'test.attendance_request_id',
  (select id::text from public.event_attendance
    where event_id = 'c5000000-0000-4000-8000-000000000502'
      and user_id = 'c5000000-0000-4000-8000-000000000102'),
  true
);
set local role authenticated;
set local "request.jwt.claim.sub" = 'c5000000-0000-4000-8000-000000000101';
select is(
  (
    select count(*)
    from public.list_attention_items(20)
    where kind = 'attendance_request'
      and resource_id = 'c5000000-0000-4000-8000-000000000502'
  ),
  1::bigint,
  'a full event keeps a request available for a valid decline'
);
select is(
  (
    select to_jsonb(attendance_row) ->> 'review_mode'
    from public.list_event_attendance(
      'c5000000-0000-4000-8000-000000000502', 20, 0
    ) as attendance_row
    where attendance_row.attendance_id = current_setting('test.attendance_request_id')::uuid
  ),
  'decline_only'::text,
  'a full event removes the impossible Approve control from event management'
);
select is(
  (
    select to_jsonb(attendance_row) ->> 'review_reason'
    from public.list_event_attendance(
      'c5000000-0000-4000-8000-000000000502', 20, 0
    ) as attendance_row
    where attendance_row.attendance_id = current_setting('test.attendance_request_id')::uuid
  ),
  'The event is full. Only decline remains.'::text,
  'a full event explains why only decline remains'
);
select lives_ok(
  $$select * from public.review_attendance(
    current_setting('test.attendance_request_id')::uuid,
    'decline', null
  )$$,
  'the full-event attention task invokes a valid decline mutation'
);
reset role;
rollback to savepoint full_event_attendance_request;

savepoint banned_group_manager_review;
select set_config(
  'test.attendance_request_id',
  (select id::text from public.event_attendance
    where event_id = 'c5000000-0000-4000-8000-000000000502'
      and user_id = 'c5000000-0000-4000-8000-000000000102'),
  true
);
insert into public.group_bans (group_id, user_id, banned_by, reason)
values (
  'c5000000-0000-4000-8000-000000000301',
  'c5000000-0000-4000-8000-000000000101',
  'c5000000-0000-4000-8000-000000000103',
  'Manager authority regression fixture'
);
set local role authenticated;
set local "request.jwt.claim.sub" = 'c5000000-0000-4000-8000-000000000101';
select is(
  (
    select count(*)
    from public.list_attention_items(20)
    where kind = 'attendance_request'
      and resource_id = 'c5000000-0000-4000-8000-000000000502'
  ),
  0::bigint,
  'a banned group manager receives no requester details in Attention'
);
select throws_ok(
  $$select * from public.list_event_attendance(
    'c5000000-0000-4000-8000-000000000502', 20, 0
  )$$,
  'P0001', 'NOT_FOUND',
  'a banned group manager cannot enumerate event attendance'
);
select throws_ok(
  $$select * from public.review_attendance(
    current_setting('test.attendance_request_id')::uuid,
    'approve', null
  )$$,
  'P0001', 'NOT_FOUND',
  'a banned group manager cannot mutate attendance'
);
reset role;
select is(
  (
    select status
    from public.event_attendance
    where id = current_setting('test.attendance_request_id')::uuid
  ),
  'requested'::public.attendance_status,
  'a denied banned-manager review leaves attendance unchanged'
);
rollback to savepoint banned_group_manager_review;

savepoint former_group_manager_review;
update public.events
set
  created_by = 'c5000000-0000-4000-8000-000000000103',
  host_user_id = 'c5000000-0000-4000-8000-000000000103'
where id = 'c5000000-0000-4000-8000-000000000502';
select set_config(
  'test.attendance_request_id',
  (select id::text from public.event_attendance
    where event_id = 'c5000000-0000-4000-8000-000000000502'
      and user_id = 'c5000000-0000-4000-8000-000000000102'),
  true
);
update public.group_memberships
set role = 'member', status = 'left'
where group_id = 'c5000000-0000-4000-8000-000000000301'
  and user_id = 'c5000000-0000-4000-8000-000000000103';
set local role authenticated;
set local "request.jwt.claim.sub" = 'c5000000-0000-4000-8000-000000000103';
select is(
  (
    select count(*)
    from public.list_attention_items(20)
    where kind = 'attendance_request'
      and resource_id = 'c5000000-0000-4000-8000-000000000502'
  ),
  0::bigint,
  'a former group manager receives no requester details in Attention'
);
select throws_ok(
  $$select * from public.review_attendance(
    current_setting('test.attendance_request_id')::uuid,
    'decline', null
  )$$,
  'P0001', 'NOT_FOUND',
  'a former group manager cannot even decline attendance'
);
reset role;
select is(
  (
    select status
    from public.event_attendance
    where id = current_setting('test.attendance_request_id')::uuid
  ),
  'requested'::public.attendance_status,
  'a denied former-manager review leaves attendance unchanged'
);
rollback to savepoint former_group_manager_review;

savepoint ineligible_group_manager_review;
select set_config(
  'test.attendance_request_id',
  (select id::text from public.event_attendance
    where event_id = 'c5000000-0000-4000-8000-000000000502'
      and user_id = 'c5000000-0000-4000-8000-000000000102'),
  true
);
update public.groups
set lifecycle = 'suspended', suspended_at = statement_timestamp()
where id = 'c5000000-0000-4000-8000-000000000301';
set local role authenticated;
set local "request.jwt.claim.sub" = 'c5000000-0000-4000-8000-000000000101';
select is(
  (
    select count(*)
    from public.list_attention_items(20)
    where kind = 'attendance_request'
      and resource_id = 'c5000000-0000-4000-8000-000000000502'
  ),
  0::bigint,
  'an ineligible group lifecycle removes manager Attention'
);
select throws_ok(
  $$select * from public.review_attendance(
    current_setting('test.attendance_request_id')::uuid,
    'decline', null
  )$$,
  'P0001', 'NOT_FOUND',
  'an ineligible group lifecycle ends attendance-review authority'
);
reset role;
select is(
  (
    select status
    from public.event_attendance
    where id = current_setting('test.attendance_request_id')::uuid
  ),
  'requested'::public.attendance_status,
  'a denied ineligible-manager review leaves attendance unchanged'
);
rollback to savepoint ineligible_group_manager_review;

savepoint banned_group_host_projection;
insert into public.group_bans (group_id, user_id, banned_by, reason)
values (
  'c5000000-0000-4000-8000-000000000301',
  'c5000000-0000-4000-8000-000000000101',
  'c5000000-0000-4000-8000-000000000103',
  'Group projection regression fixture'
);
set local role authenticated;
set local "request.jwt.claim.sub" = 'c5000000-0000-4000-8000-000000000101';
select is(
  (
    select count(*)
    from public.list_my_events('hosting', 20, 0)
    where event_id = 'c5000000-0000-4000-8000-000000000502'
  ),
  0::bigint,
  'a banned group host receives neither group event content nor Manage recovery'
);
reset role;
rollback to savepoint banned_group_host_projection;

savepoint banned_group_history_projection;
update public.events
set status = 'completed'
where id = 'c5000000-0000-4000-8000-000000000502';
insert into public.group_bans (group_id, user_id, banned_by, reason)
values (
  'c5000000-0000-4000-8000-000000000301',
  'c5000000-0000-4000-8000-000000000101',
  'c5000000-0000-4000-8000-000000000103',
  'Group history regression fixture'
);
set local role authenticated;
set local "request.jwt.claim.sub" = 'c5000000-0000-4000-8000-000000000101';
select is(
  (
    select count(*)
    from public.list_my_events('history', 20, 0)
    where event_id = 'c5000000-0000-4000-8000-000000000502'
  ),
  0::bigint,
  'a banned former group host receives no retained group-event history'
);
reset role;
rollback to savepoint banned_group_history_projection;

set local role authenticated;
set local "request.jwt.claim.sub" = 'c5000000-0000-4000-8000-000000000101';
select is(
  (
    select event_id
    from public.list_my_events('upcoming', 1, 0)
  ),
  'c5000000-0000-4000-8000-000000000501'::uuid,
  'Upcoming orders the earliest future published personal Fan event first'
);
select is(
  (
    select relationship_label
    from public.list_my_events('upcoming', 20, 0)
    where event_id = 'c5000000-0000-4000-8000-000000000501'
  ),
  'You are hosting'::text,
  'Upcoming gives personal non-Venue hosting honest Fan copy'
);
select is(
  (
    select can_manage
    from public.list_my_events('upcoming', 20, 0)
    where event_id = 'c5000000-0000-4000-8000-000000000501'
  ),
  true,
  'Upcoming preserves the direct Manage recovery for a personal Fan host'
);
select is(
  (select count(*) from public.list_my_events('hosting', 20, 0)),
  2::bigint,
  'Fan hosting includes private/group work but excludes commercial Venue work'
);
select is(
  (
    select count(*)
    from public.list_my_events('hosting', 20, 0)
    where event_id = 'c5000000-0000-4000-8000-000000000508'
  ),
  0::bigint,
  'Venue-owned work is recovered only through the Venue workspace'
);
select is(
  (select count(*) from public.list_my_events('history', 20, 0)),
  1::bigint,
  'a personally hosted cancelled event remains in collapsed History'
);
select is(
  (select count(*) from public.list_my_group_relationships('owner', 20, 0)),
  3::bigint,
  'active owned groups are recovered without inactive residue'
);
select is(
  (select count(*) from public.list_my_saved_items('all', 20, 0)),
  2::bigint,
  'Saved is a real union of catalog and venue follows'
);
select is(
  string_agg(kind, ',' order by kind),
  'team,venue',
  'Saved reports stable safe kinds'
)
from public.list_my_saved_items('all', 20, 0);

select is(
  (select reason from public.list_people_hub('', 'suggested', 20, 0) where handle = 'state_team'),
  'You both follow Current Home FC',
  'People suggestions may expose one shared followed team'
);
select is(
  (select reason from public.list_people_hub('', 'suggested', 20, 0) where handle = 'state_group'),
  'You are both in Current Active Group',
  'People suggestions may expose one group visible through active membership'
);
select is(
  (select count(*) from public.list_people_hub('person', 'search', 20, 0)),
  4::bigint,
  'People search finds display names without exact-handle knowledge and filters unsafe profiles'
);
select ok(
  (select count(*) from public.list_people_hub('st', 'search', 20, 0)) > 0,
  'two-character People search uses the indexed handle prefix path'
);
select is(
  (select count(*) from public.list_people_hub('sh', 'search', 20, 0)),
  0::bigint,
  'two-character People search does not run display-name containment'
);
select is(
  (select count(*) from public.list_people_hub('sha', 'search', 20, 0)),
  0::bigint,
  'partial display-name tokens do not trigger a broad containment scan'
);
select is(
  (select count(*) from public.list_people_hub('shared', 'search', 20, 0)),
  2::bigint,
  'a complete display-name word uses the indexed full-text candidate path'
);

reset role;
savepoint lexical_people_search;
insert into auth.users (
  instance_id, id, aud, role, email, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
values
  (
    '00000000-0000-0000-0000-000000000000',
    'c5000000-0000-4000-8000-000000000113',
    'authenticated', 'authenticated', 'short-words@example.test',
    statement_timestamp(), '{}'::jsonb, '{}'::jsonb,
    statement_timestamp() - interval '30 days', statement_timestamp()
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    'c5000000-0000-4000-8000-000000000114',
    'authenticated', 'authenticated', 'complete-words@example.test',
    statement_timestamp(), '{}'::jsonb, '{}'::jsonb,
    statement_timestamp() - interval '30 days', statement_timestamp()
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    'c5000000-0000-4000-8000-000000000115',
    'authenticated', 'authenticated', 'dot-words@example.test',
    statement_timestamp(), '{}'::jsonb, '{}'::jsonb,
    statement_timestamp() - interval '30 days', statement_timestamp()
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    'c5000000-0000-4000-8000-000000000116',
    'authenticated', 'authenticated', 'slash-words@example.test',
    statement_timestamp(), '{}'::jsonb, '{}'::jsonb,
    statement_timestamp() - interval '30 days', statement_timestamp()
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    'c5000000-0000-4000-8000-000000000117',
    'authenticated', 'authenticated', 'hyphen-words@example.test',
    statement_timestamp(), '{}'::jsonb, '{}'::jsonb,
    statement_timestamp() - interval '30 days', statement_timestamp()
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    'c5000000-0000-4000-8000-000000000118',
    'authenticated', 'authenticated', 'underscore-words@example.test',
    statement_timestamp(), '{}'::jsonb, '{}'::jsonb,
    statement_timestamp() - interval '30 days', statement_timestamp()
  );
update public.profiles
set
  handle = case id
    when 'c5000000-0000-4000-8000-000000000113' then 'zz_short_words'
    when 'c5000000-0000-4000-8000-000000000114' then 'zz_complete_words'
    when 'c5000000-0000-4000-8000-000000000115' then 'punct_dot_words'
    when 'c5000000-0000-4000-8000-000000000116' then 'punct_slash_words'
    when 'c5000000-0000-4000-8000-000000000117' then 'punct_hyphen_words'
    else 'punct_underscore_words'
  end,
  display_name = case id
    when 'c5000000-0000-4000-8000-000000000113' then 'AB CD'
    when 'c5000000-0000-4000-8000-000000000114' then 'ABC DEF'
    when 'c5000000-0000-4000-8000-000000000115' then 'AB.CD'
    when 'c5000000-0000-4000-8000-000000000116' then 'AB/CD'
    when 'c5000000-0000-4000-8000-000000000117' then 'AB-CD'
    else 'AB_CD'
  end,
  adult_attested_at = statement_timestamp(),
  rules_version = private.current_rules_version(),
  rules_accepted_at = statement_timestamp(),
  profile_completed_at = statement_timestamp(),
  fan_enabled_at = statement_timestamp()
where id in (
  'c5000000-0000-4000-8000-000000000113',
  'c5000000-0000-4000-8000-000000000114',
  'c5000000-0000-4000-8000-000000000115',
  'c5000000-0000-4000-8000-000000000116',
  'c5000000-0000-4000-8000-000000000117',
  'c5000000-0000-4000-8000-000000000118'
);
set local role authenticated;
set local "request.jwt.claim.sub" = 'c5000000-0000-4000-8000-000000000101';
select is(
  (select count(*) from public.list_people_hub('ab cd', 'search', 20, 0)),
  0::bigint,
  'short words cannot bypass the display-name lexical minimum through total query length'
);
select is(
  (select count(*) from public.list_people_hub('abc def', 'search', 20, 0)),
  1::bigint,
  'every complete display-name word of at least three characters remains searchable'
);
select is(
  (select count(*) from public.list_people_hub('abc de', 'search', 20, 0)),
  0::bigint,
  'one short word disables the entire display-name branch'
);
select is(
  (select count(*) from public.list_people_hub('ab.cd', 'search', 20, 0)),
  0::bigint,
  'a dot cannot combine short display-name fragments'
);
select is(
  (select count(*) from public.list_people_hub('ab/cd', 'search', 20, 0)),
  0::bigint,
  'a slash cannot combine short display-name fragments'
);
select is(
  (select count(*) from public.list_people_hub('ab-cd', 'search', 20, 0)),
  0::bigint,
  'a hyphen cannot combine short display-name fragments'
);
select is(
  (select count(*) from public.list_people_hub('ab_cd', 'search', 20, 0)),
  0::bigint,
  'an underscore cannot combine short display-name fragments'
);
select is(
  (select count(*) from public.list_people_hub('...ab///cd...', 'search', 20, 0)),
  0::bigint,
  'leading trailing and repeated punctuation cannot bypass fragment validation'
);
select is(
  (select count(*) from public.list_people_hub('  ABC...DEF  ', 'search', 20, 0)),
  1::bigint,
  'valid mixed-case display-name fragments remain searchable through punctuation'
);
select is(
  (select count(*) from public.list_people_hub('...', 'search', 20, 0)),
  0::bigint,
  'punctuation-only search has no eligible display-name fragment'
);
select is(
  (select count(*) from public.list_people_hub('zz', 'search', 20, 0)),
  2::bigint,
  'two-character handle-prefix search remains independent of display-name word rules'
);

reset role;
update public.profiles
set display_name = 'José Daniel דניאל'
where id = 'c5000000-0000-4000-8000-000000000114';
set local role authenticated;
set local "request.jwt.claim.sub" = 'c5000000-0000-4000-8000-000000000101';
select is(
  (
    select handle
    from public.list_people_hub('José', 'search', 20, 0)
    where handle = 'zz_complete_words'
  ),
  'zz_complete_words',
  'a composed Latin query finds an equivalent decomposed display name'
);
reset role;
update public.profiles
set display_name = 'José Daniel דניאל'
where id = 'c5000000-0000-4000-8000-000000000114';
set local role authenticated;
set local "request.jwt.claim.sub" = 'c5000000-0000-4000-8000-000000000101';
select is(
  (
    select handle
    from public.list_people_hub('José', 'search', 20, 0)
    where handle = 'zz_complete_words'
  ),
  'zz_complete_words',
  'a decomposed Latin query finds an equivalent composed display name'
);
select is(
  (
    select handle
    from public.list_people_hub('דניאל', 'search', 20, 0)
    where handle = 'zz_complete_words'
  ),
  'zz_complete_words',
  'People search preserves non-Latin name matching while normalizing Unicode'
);
reset role;
rollback to savepoint lexical_people_search;
set local role authenticated;
set local "request.jwt.claim.sub" = 'c5000000-0000-4000-8000-000000000101';
select is(
  (
    with relationship_rows as (
      select 'suggested'::text as bucket, profile_id
      from public.list_people_hub('', 'suggested', 50, 0)
      union all
      select 'accepted', profile_id
      from public.list_people_hub('', 'accepted', 50, 0)
      union all
      select 'incoming', profile_id
      from public.list_people_hub('', 'incoming', 50, 0)
      union all
      select 'sent', profile_id
      from public.list_people_hub('', 'sent', 50, 0)
    ), repeated as (
      select profile_id
      from relationship_rows
      group by profile_id
      having count(*) > 1
    )
    select count(*) from repeated
  ),
  0::bigint,
  'relationship mode assigns each visible profile to one SQL bucket before pagination'
);
select is(
  (select count(*) from public.list_people_hub('%%', 'search', 20, 0)),
  0::bigint,
  'People treats SQL wildcard characters as literal search text'
);
select is(
  (select count(*) from public.list_people_hub('', 'incoming', 20, 0)),
  1::bigint,
  'incoming requests remain on the People route'
);
select is(
  (select total_count from public.list_people_hub('', 'suggested', 1, 0)),
  3::bigint,
  'People pagination reports the full safe suggestion count'
);
select is(
  (select handle from public.list_people_hub('', 'suggested', 1, 0)),
  'state_admin'::text,
  'People suggestions have a stable first page'
);
select is(
  (select handle from public.list_people_hub('', 'suggested', 1, 1)),
  'state_group'::text,
  'People suggestions have a stable second page'
);

reset role;
update public.event_attendance
set status = 'approved', reviewed_by = 'c5000000-0000-4000-8000-000000000101',
    reviewed_at = statement_timestamp()
where event_id = 'c5000000-0000-4000-8000-000000000502'
  and user_id = 'c5000000-0000-4000-8000-000000000102';
update public.friendships
set status = 'accepted', responded_at = statement_timestamp()
where id = 'c5000000-0000-4000-8000-000000000601';
update public.group_memberships
set status = 'active', reviewed_by = 'c5000000-0000-4000-8000-000000000101',
    reviewed_at = statement_timestamp()
where group_id = 'c5000000-0000-4000-8000-000000000302'
  and user_id = 'c5000000-0000-4000-8000-000000000102';
update public.events
set status = 'published', published_at = statement_timestamp()
where id = 'c5000000-0000-4000-8000-000000000503';

set local role authenticated;
set local "request.jwt.claim.sub" = 'c5000000-0000-4000-8000-000000000101';
select is(
  (select count(*) from public.list_attention_items(20) where kind = 'attendance_request'),
  0::bigint,
  'approving attendance removes its attention item'
);
select is(
  (select count(*) from public.list_attention_items(20) where kind = 'friend_request'),
  0::bigint,
  'accepting a friendship removes its attention item'
);
select is(
  (select count(*) from public.list_attention_items(20) where kind = 'group_application'),
  1::bigint,
  'reviewing one application removes exactly that attention item'
);
select is(
  (select count(*) from public.list_attention_items(20) where kind = 'group_event_submission'),
  0::bigint,
  'publishing a member submission removes its attention item'
);
select is(
  (select count(*) from public.list_people_hub('', 'incoming', 20, 0)),
  0::bigint,
  'accepting a friendship removes it from incoming requests'
);
select is(
  (select count(*) from public.list_people_hub('', 'accepted', 20, 0)),
  1::bigint,
  'an accepted friendship remains manageable on the People page'
);

reset role;
insert into public.friendships (
  id, user_low_id, user_high_id, requested_by, status, responded_at
)
values (
  'c5000000-0000-4000-8000-000000000602',
  'c5000000-0000-4000-8000-000000000101',
  'c5000000-0000-4000-8000-000000000104',
  'c5000000-0000-4000-8000-000000000101',
  'pending', null
);
set local role authenticated;
set local "request.jwt.claim.sub" = 'c5000000-0000-4000-8000-000000000101';
select is(
  (select count(*) from public.list_people_hub('', 'sent', 20, 0)),
  1::bigint,
  'sent requests remain manageable on the same People page'
);

reset role;
update public.friendships
set status = 'declined', responded_at = statement_timestamp()
where id = 'c5000000-0000-4000-8000-000000000602';
set local role authenticated;
set local "request.jwt.claim.sub" = 'c5000000-0000-4000-8000-000000000101';
select is(
  (select count(*) from public.list_people_hub('', 'sent', 20, 0)),
  0::bigint,
  'declining a sent request removes relationship residue from active People buckets'
);

reset role;
update public.group_memberships
set status = 'banned', reviewed_by = 'c5000000-0000-4000-8000-000000000101',
    reviewed_at = statement_timestamp()
where group_id = 'c5000000-0000-4000-8000-000000000303'
  and user_id = 'c5000000-0000-4000-8000-000000000111';
insert into public.group_bans (group_id, user_id, banned_by, reason)
values (
  'c5000000-0000-4000-8000-000000000303',
  'c5000000-0000-4000-8000-000000000111',
  'c5000000-0000-4000-8000-000000000101',
  'Banned for deterministic projection test'
);

set local role authenticated;
set local "request.jwt.claim.sub" = 'c5000000-0000-4000-8000-000000000101';
select is(
  (select count(*) from public.list_attention_items(20) where kind = 'group_application'),
  0::bigint,
  'a ban removes the remaining application attention item'
);
select is(
  (select total_count from public.list_my_saved_items('all', 1, 0)),
  2::bigint,
  'saved pagination reports the full deterministic count'
);
select is(
  (select count(*) from public.list_my_saved_items('all', 1, 1)),
  1::bigint,
  'saved pagination supports a stable second page'
);

select throws_ok(
  $$select * from public.list_my_events('unknown', 20, 0)$$,
  'P0001', 'VALIDATION_FAILED',
  'event buckets reject unbounded arbitrary input'
);
select throws_ok(
  $$select * from public.list_people_hub('', 'unknown', 20, 0)$$,
  'P0001', 'VALIDATION_FAILED',
  'People buckets reject unbounded arbitrary input'
);
select throws_ok(
  $$select * from public.list_my_events(null, 20, 0)$$,
  'P0001', 'VALIDATION_FAILED',
  'event buckets reject null input'
);
select throws_ok(
  $$select * from public.list_my_group_relationships(null, 20, 0)$$,
  'P0001', 'VALIDATION_FAILED',
  'group buckets reject null input'
);
select throws_ok(
  $$select * from public.list_my_saved_items(null, 20, 0)$$,
  'P0001', 'VALIDATION_FAILED',
  'saved buckets reject null input'
);
select throws_ok(
  $$select * from public.list_people_hub('', null, 20, 0)$$,
  'P0001', 'VALIDATION_FAILED',
  'People buckets reject null input'
);
select throws_ok(
  $$select * from public.list_attention_items(null)$$,
  'P0001', 'VALIDATION_FAILED',
  'attention rejects an explicit null limit'
);
select throws_ok(
  $$select * from public.list_attention_items(0)$$,
  'P0001', 'VALIDATION_FAILED',
  'attention rejects a non-positive limit'
);
select throws_ok(
  $$select * from public.list_attention_items(51)$$,
  'P0001', 'VALIDATION_FAILED',
  'attention rejects a limit above the safe maximum'
);
select throws_ok(
  $$select * from public.list_my_events('hosting', 51, 0)$$,
  'P0001', 'VALIDATION_FAILED',
  'event pages reject a limit above the safe maximum'
);
select throws_ok(
  $$select * from public.list_my_group_relationships('owner', 20, -1)$$,
  'P0001', 'VALIDATION_FAILED',
  'group pages reject a negative offset'
);
select throws_ok(
  $$select * from public.list_my_saved_items('all', 20, 10001)$$,
  'P0001', 'VALIDATION_FAILED',
  'saved pages reject an offset above the safe maximum'
);
select throws_ok(
  $$select * from public.list_people_hub(repeat('x', 51), 'suggested', 20, 0)$$,
  'P0001', 'VALIDATION_FAILED',
  'irrelevant oversized People queries fail closed'
);
select throws_ok(
  $$select * from public.list_people_hub('', 'suggested', null, 0)$$,
  'P0001', 'VALIDATION_FAILED',
  'People rejects an explicit null limit'
);
select throws_ok(
  $$select * from public.list_people_hub('', 'suggested', 20, null)$$,
  'P0001', 'VALIDATION_FAILED',
  'People rejects an explicit null offset'
);
select lives_ok(
  $$select * from public.list_attention_items(50)$$,
  'attention accepts the documented maximum limit'
);
select lives_ok(
  $$select * from public.list_my_events('hosting', 20, 10000)$$,
  'event pages accept the exact final 20-row window'
);
select lives_ok(
  $$select * from public.list_my_group_relationships('owner', 20, 10000)$$,
  'group pages accept the exact final 20-row window'
);
select lives_ok(
  $$select * from public.list_my_saved_items('all', 20, 10000)$$,
  'saved pages accept the exact final 20-row window'
);
select lives_ok(
  $$select * from public.list_people_hub(repeat('a', 50), 'search', 20, 10000)$$,
  'People search accepts its exact final 20-row window'
);
select lives_ok(
  $$select * from public.list_people_hub(null, 'suggested', 20, 10000)$$,
  'People suggestions accept a semantically empty query at the exact final window'
);
select throws_ok(
  $$select * from public.list_my_events('hosting', 50, 10000)$$,
  'P0001', 'VALIDATION_FAILED',
  'event pages reject a limit and offset whose sum exceeds 10020'
);
select throws_ok(
  $$select * from public.list_my_group_relationships('owner', 21, 10000)$$,
  'P0001', 'VALIDATION_FAILED',
  'group pages reject the first row beyond the 10020 result window'
);
select throws_ok(
  $$select * from public.list_my_saved_items('all', 20, 10001)$$,
  'P0001', 'VALIDATION_FAILED',
  'saved pages reject an offset beyond the page-501 boundary'
);
select throws_ok(
  $$select * from public.list_people_hub(null, 'suggested', 21, 10000)$$,
  'P0001', 'VALIDATION_FAILED',
  'People rejects a result window ending at row 10021'
);
select has_index(
  'public', 'profiles', 'profiles_display_name_search_idx',
  'display-name word search has full-text index support'
);
select has_index(
  'public', 'profiles', 'profiles_handle_lower_pattern_idx',
  'handle prefix search has pattern index support'
);
select ok(
  position(
    'candidate_ids' in pg_get_functiondef(
      'public.list_people_hub(text,text,integer,integer)'::regprocedure
    )
  ) > 0,
  'People builds indexed candidate IDs before eligible-profile reason work'
);
select ok(
  position(
    'to_tsvector' in pg_get_functiondef(
      'public.list_people_hub(text,text,integer,integer)'::regprocedure
    )
  ) > 0,
  'People display-name candidates use the default-planner full-text search contract'
);

set local "request.jwt.claim.sub" = 'c5000000-0000-4000-8000-000000000108';
select throws_ok(
  $$select * from public.list_attention_items(20)$$,
  'P0001', 'ACCOUNT_SUSPENDED',
  'suspended Fans cannot read personalized attention'
);

select * from finish();
rollback;
