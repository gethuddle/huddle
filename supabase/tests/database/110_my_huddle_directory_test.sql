begin;

create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public, pg_catalog;

select no_plan();

select ok(
  has_function_privilege('authenticated', 'public.list_my_groups(integer,integer)', 'execute'),
  'authenticated members can list only their own group relationships'
);
select ok(
  has_function_privilege('authenticated', 'public.list_my_huddle_events(integer,integer)', 'execute'),
  'authenticated members can list their own event relationships'
);
select ok(
  has_function_privilege('authenticated', 'public.search_people(text,integer,integer)', 'execute'),
  'authenticated members can use the bounded safe people directory'
);
select ok(
  not has_function_privilege('anon', 'public.search_people(text,integer,integer)', 'execute'),
  'anonymous visitors cannot enumerate the people directory'
);
select ok(
  position(
    'address' in pg_get_function_result(
      'public.list_my_huddle_events(integer,integer)'::regprocedure
    )
  ) = 0,
  'the My Huddle event result structurally omits every address field'
);
select ok(
  position(
    'email' in pg_get_function_result(
      'public.search_people(text,integer,integer)'::regprocedure
    )
  ) = 0,
  'people search structurally omits email addresses'
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
    ('b1000000-0000-4000-8000-000000000101'::uuid, 'directory-alice@example.com'),
    ('b1000000-0000-4000-8000-000000000102'::uuid, 'directory-blair@example.com'),
    ('b1000000-0000-4000-8000-000000000103'::uuid, 'directory-casey@example.com'),
    ('b1000000-0000-4000-8000-000000000104'::uuid, 'directory-devin@example.com')
) as fixture(id, email);

update public.profiles
set
  handle = case id
    when 'b1000000-0000-4000-8000-000000000101' then 'directory_alice'
    when 'b1000000-0000-4000-8000-000000000102' then 'directory_blair'
    when 'b1000000-0000-4000-8000-000000000103' then 'directory_casey'
    else 'directory_devin'
  end,
  display_name = case id
    when 'b1000000-0000-4000-8000-000000000101' then 'Directory Alice'
    when 'b1000000-0000-4000-8000-000000000102' then 'Directory Blair'
    when 'b1000000-0000-4000-8000-000000000103' then 'Directory Casey'
    else 'Directory Devin'
  end,
  city_id = (select id from public.cities where slug = 'haifa'),
  adult_attested_at = statement_timestamp(),
  rules_version = 1,
  rules_accepted_at = statement_timestamp(),
  profile_completed_at = statement_timestamp(),
  fan_enabled_at = statement_timestamp()
where id between
  'b1000000-0000-4000-8000-000000000101' and
  'b1000000-0000-4000-8000-000000000104';

insert into public.friendships (
  user_low_id, user_high_id, requested_by, status
)
values (
  'b1000000-0000-4000-8000-000000000101',
  'b1000000-0000-4000-8000-000000000102',
  'b1000000-0000-4000-8000-000000000101',
  'pending'
);

insert into public.user_blocks (blocker_id, blocked_id)
values (
  'b1000000-0000-4000-8000-000000000103',
  'b1000000-0000-4000-8000-000000000101'
);

insert into public.groups (
  id, slug, name, owner_id, city_id, visibility, lifecycle, description, activated_at
)
values (
  'b1000000-0000-4000-8000-000000000201',
  'directory-unlisted',
  'Directory Unlisted Group',
  'b1000000-0000-4000-8000-000000000101',
  (select id from public.cities where slug = 'haifa'),
  'unlisted',
  'active',
  'An unlisted group that must remain findable by its owner.',
  statement_timestamp()
);

insert into public.group_memberships (group_id, user_id, role, status)
values
  (
    'b1000000-0000-4000-8000-000000000201',
    'b1000000-0000-4000-8000-000000000101',
    'owner',
    'active'
  ),
  (
    'b1000000-0000-4000-8000-000000000201',
    'b1000000-0000-4000-8000-000000000102',
    'member',
    'pending'
  );

insert into public.competitions (
  id, sport_id, provider, provider_external_id, code, name, country_name, last_synced_at
)
values (
  'b1000000-0000-4000-8000-000000000301',
  '00000000-0000-4000-8000-000000000020',
  'directory-test', 'competition', 'DIR', 'Directory League', 'England', statement_timestamp()
);

insert into public.teams (
  id, sport_id, provider, provider_external_id, name, short_name, tla,
  country_name, last_synced_at
)
values
  (
    'b1000000-0000-4000-8000-000000000302',
    '00000000-0000-4000-8000-000000000020',
    'directory-test', 'home', 'Directory Home FC', 'Directory Home', 'DHO',
    'England', statement_timestamp()
  ),
  (
    'b1000000-0000-4000-8000-000000000303',
    '00000000-0000-4000-8000-000000000020',
    'directory-test', 'away', 'Directory Away FC', 'Directory Away', 'DAW',
    'England', statement_timestamp()
  );

insert into public.matches (
  id, provider, provider_external_id, competition_id, home_team_id,
  away_team_id, starts_at, status, matchday, season_label, last_synced_at
)
values (
  'b1000000-0000-4000-8000-000000000304',
  'directory-test', 'match',
  'b1000000-0000-4000-8000-000000000301',
  'b1000000-0000-4000-8000-000000000302',
  'b1000000-0000-4000-8000-000000000303',
  statement_timestamp() + interval '7 days', 'timed', 1, '2026', statement_timestamp()
);

insert into public.events (
  id, created_by, host_user_id, match_id, title, description,
  expected_activity, cost_description, event_rules, commercial_affiliation,
  host_presence_confirmed_at, starts_at, ends_at, city_id, place_kind,
  audience, capacity, requires_approval, status, published_at
)
values (
  'b1000000-0000-4000-8000-000000000401',
  'b1000000-0000-4000-8000-000000000101',
  'b1000000-0000-4000-8000-000000000101',
  'b1000000-0000-4000-8000-000000000304',
  'Directory Home Event', 'A safe dashboard event with a protected private location.',
  'Watch the full match', 'Free', 'Respect every attendee.', 'None',
  statement_timestamp(), statement_timestamp() + interval '7 days',
  statement_timestamp() + interval '7 days 3 hours',
  (select id from public.cities where slug = 'haifa'),
  'home', 'invite_only', 6, true, 'published', statement_timestamp()
);

insert into public.event_private_locations (event_id, address_text, directions, location)
values (
  'b1000000-0000-4000-8000-000000000401',
  '111 Never Expose Street, Haifa',
  'Private directions.',
  extensions.st_setsrid(extensions.st_makepoint(34.998, 32.812), 4326)::extensions.geography
);

insert into public.event_invitations (event_id, invitee_id, invited_by)
values (
  'b1000000-0000-4000-8000-000000000401',
  'b1000000-0000-4000-8000-000000000102',
  'b1000000-0000-4000-8000-000000000101'
);

set local role authenticated;
set local "request.jwt.claim.sub" = 'b1000000-0000-4000-8000-000000000101';

select is(
  (select count(*) from public.list_my_groups(20, 0)),
  1::bigint,
  'an owner can find an unlisted group in My Huddle'
);
select is(
  (select visibility from public.list_my_groups(20, 0)),
  'unlisted',
  'the owner list preserves the group visibility state'
);
select is(
  (select involvement from public.list_my_huddle_events(20, 0)),
  'hosting',
  'a host can find their event without an attendance row'
);
select is(
  (select count(*) from public.search_people('directory', 20, 0)),
  2::bigint,
  'people search excludes self and either direction of a block'
);
select is(
  (
    select friendship_direction
    from public.search_people('@directory_blair', 20, 0)
  ),
  'outgoing',
  'people search accepts an at-prefixed handle and returns only the actor direct friendship state'
);

set local "request.jwt.claim.sub" = 'b1000000-0000-4000-8000-000000000102';

select is(
  (select involvement from public.list_my_huddle_events(20, 0)),
  'invited',
  'an invitee can find their pending event in My Huddle'
);
select is(
  (select can_manage from public.list_my_huddle_events(20, 0)),
  false,
  'an invitee receives a concrete false management flag rather than a nullable result'
);
select is(
  (select count(*) from public.list_my_groups(20, 0)),
  0::bigint,
  'a pending unlisted applicant receives no member-only group projection or dead detail action'
);

reset role;

update public.matches
set
  starts_at = statement_timestamp() - interval '7 days',
  status = 'finished'
where id = 'b1000000-0000-4000-8000-000000000304';

update public.events
set
  starts_at = statement_timestamp() - interval '7 days',
  ends_at = statement_timestamp() - interval '7 days' + interval '3 hours',
  status = 'completed'
where id = 'b1000000-0000-4000-8000-000000000401';

set local role authenticated;
set local "request.jwt.claim.sub" = 'b1000000-0000-4000-8000-000000000102';

select is(
  (select involvement from public.list_my_huddle_events(20, 0)),
  'history',
  'an invitee keeps a safe historical event entry after the future visibility window ends'
);

select * from finish();
rollback;
