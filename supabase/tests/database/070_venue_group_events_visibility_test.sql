begin;

create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public, pg_catalog;

select no_plan();

select ok(
  has_function_privilege(
    'authenticated',
    'public.publish_group_event(uuid,text,uuid)',
    'execute'
  ),
  'active group administrators may invoke the controlled review transition'
);
select ok(
  has_function_privilege(
    'authenticated',
    'public.create_group_event(uuid,uuid,text,text,text,text,text,text,boolean,timestamptz,timestamptz,uuid,text,text,text,double precision,double precision,text,uuid,integer,text,text,double precision,double precision,text,uuid)',
    'execute'
  ),
  'active members may invoke the controlled organizing-group event transaction'
);
select ok(
  not has_function_privilege('anon', 'public.publish_group_event(uuid,text,uuid)', 'execute'),
  'anonymous callers cannot review group events'
);
select ok(
  has_function_privilege('anon', 'public.list_venue_events(text,integer)', 'execute'),
  'anonymous visitors may invoke the safe venue-event listing'
);
select ok(
  has_function_privilege('authenticated', 'public.list_group_events(uuid,integer)', 'execute'),
  'authenticated callers may request audience-filtered group event cards'
);
select ok(
  not has_table_privilege('authenticated', 'public.events', 'select'),
  'B08 keeps event base rows behind controlled projections'
);
select ok(
  not has_table_privilege('authenticated', 'public.event_private_locations', 'select'),
  'B08 keeps exact home locations inaccessible to ordinary clients'
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
    ('62000000-0000-4000-8000-000000000101'::uuid, 'b08-owner@example.com'),
    ('62000000-0000-4000-8000-000000000102'::uuid, 'b08-admin@example.com'),
    ('62000000-0000-4000-8000-000000000103'::uuid, 'b08-submitter@example.com'),
    ('62000000-0000-4000-8000-000000000104'::uuid, 'b08-member-two@example.com'),
    ('62000000-0000-4000-8000-000000000105'::uuid, 'b08-member-three@example.com'),
    ('62000000-0000-4000-8000-000000000106'::uuid, 'b08-outsider@example.com'),
    ('62000000-0000-4000-8000-000000000107'::uuid, 'b08-friend@example.com'),
    ('62000000-0000-4000-8000-000000000108'::uuid, 'b08-invitee@example.com'),
    ('62000000-0000-4000-8000-000000000109'::uuid, 'b08-banned@example.com')
) as fixture(id, email);

update public.profiles
set
  handle = case id
    when '62000000-0000-4000-8000-000000000101' then 'b08_owner'
    when '62000000-0000-4000-8000-000000000102' then 'b08_admin'
    when '62000000-0000-4000-8000-000000000103' then 'b08_submitter'
    when '62000000-0000-4000-8000-000000000104' then 'b08_member_two'
    when '62000000-0000-4000-8000-000000000105' then 'b08_member_three'
    when '62000000-0000-4000-8000-000000000106' then 'b08_outsider'
    when '62000000-0000-4000-8000-000000000107' then 'b08_friend'
    when '62000000-0000-4000-8000-000000000108' then 'b08_invitee'
    else 'b08_banned'
  end,
  display_name = 'B08 Fan ' || right(id::text, 3),
  city_id = (select id from public.cities where slug = 'haifa'),
  adult_attested_at = statement_timestamp(),
  rules_version = 1,
  rules_accepted_at = statement_timestamp(),
  profile_completed_at = statement_timestamp()
where id between
  '62000000-0000-4000-8000-000000000101' and
  '62000000-0000-4000-8000-000000000109';

insert into public.competitions (
  id, sport_id, provider, provider_external_id, code, name, country_name, last_synced_at
)
values (
  '62000000-0000-4000-8000-000000000201',
  '00000000-0000-4000-8000-000000000020',
  'b08-test',
  'competition',
  'B08',
  'B08 Premier League',
  'England',
  statement_timestamp()
);

insert into public.teams (
  id, sport_id, provider, provider_external_id, name, short_name, tla, country_name, last_synced_at
)
values
  (
    '62000000-0000-4000-8000-000000000202',
    '00000000-0000-4000-8000-000000000020',
    'b08-test',
    'home-team',
    'B08 Arsenal FC',
    'B08 Arsenal',
    'B8A',
    'England',
    statement_timestamp()
  ),
  (
    '62000000-0000-4000-8000-000000000203',
    '00000000-0000-4000-8000-000000000020',
    'b08-test',
    'away-team',
    'B08 Chelsea FC',
    'B08 Chelsea',
    'B8C',
    'England',
    statement_timestamp()
  );

insert into public.matches (
  id, provider, provider_external_id, competition_id, home_team_id, away_team_id,
  starts_at, status, matchday, season_label, last_synced_at
)
values (
  '62000000-0000-4000-8000-000000000204',
  'b08-test',
  'match',
  '62000000-0000-4000-8000-000000000201',
  '62000000-0000-4000-8000-000000000202',
  '62000000-0000-4000-8000-000000000203',
  statement_timestamp() + interval '7 days',
  'timed',
  1,
  '2026',
  statement_timestamp()
);

insert into public.groups (
  id, slug, name, owner_id, city_id, visibility, lifecycle, description
)
values (
  '62000000-0000-4000-8000-000000000205',
  'b08-supporters',
  'B08 Supporters',
  '62000000-0000-4000-8000-000000000101',
  (select id from public.cities where slug = 'haifa'),
  'discoverable',
  'forming',
  'A complete group description awaiting its first approved future event.'
);

insert into public.group_memberships (
  group_id, user_id, role, status, reviewed_by, reviewed_at
)
values
  ('62000000-0000-4000-8000-000000000205', '62000000-0000-4000-8000-000000000101', 'owner', 'active', null, null),
  ('62000000-0000-4000-8000-000000000205', '62000000-0000-4000-8000-000000000102', 'admin', 'active', '62000000-0000-4000-8000-000000000101', statement_timestamp()),
  ('62000000-0000-4000-8000-000000000205', '62000000-0000-4000-8000-000000000103', 'member', 'active', '62000000-0000-4000-8000-000000000101', statement_timestamp()),
  ('62000000-0000-4000-8000-000000000205', '62000000-0000-4000-8000-000000000104', 'member', 'active', '62000000-0000-4000-8000-000000000101', statement_timestamp()),
  ('62000000-0000-4000-8000-000000000205', '62000000-0000-4000-8000-000000000105', 'member', 'active', '62000000-0000-4000-8000-000000000101', statement_timestamp()),
  ('62000000-0000-4000-8000-000000000205', '62000000-0000-4000-8000-000000000108', 'member', 'active', '62000000-0000-4000-8000-000000000101', statement_timestamp());

insert into public.group_rules (group_id, position, text, published_at)
values (
  '62000000-0000-4000-8000-000000000205',
  1,
  'Respect every supporter and host.',
  statement_timestamp()
);

insert into public.group_bans (group_id, user_id, banned_by, reason)
values (
  '62000000-0000-4000-8000-000000000205',
  '62000000-0000-4000-8000-000000000109',
  '62000000-0000-4000-8000-000000000101',
  'Banned before attempting event submission.'
);

insert into public.venues (
  id, owner_id, slug, name, city_id, address_text, location, description,
  screen_count, stated_capacity
)
values (
  '62000000-0000-4000-8000-000000000301',
  '62000000-0000-4000-8000-000000000101',
  'b08-match-corner',
  'B08 Match Corner',
  (select id from public.cities where slug = 'haifa'),
  '12 Public Street, Haifa',
  extensions.st_setsrid(
    extensions.st_makepoint(34.99928, 32.81303),
    4326
  )::extensions.geography,
  'A public venue profile for B08 event tests.',
  4,
  80
);

set local role anon;
select is(
  (select viewer_is_owner from public.get_venue_by_slug('b08-match-corner')),
  false,
  'an anonymous public venue summary normalizes ownership state to false'
);
reset role;

create function pg_temp.create_b08_group_event(input_title text)
returns table (event_id uuid, status text)
language sql
as $function$
  select *
  from public.create_or_update_event(
    null,
    null,
    '62000000-0000-4000-8000-000000000205',
    '62000000-0000-4000-8000-000000000204',
    input_title,
    'A protected group event submitted for administrator review.',
    'Watch the full match together',
    'Free',
    'Respect the host and every attendee.',
    'None',
    true,
    statement_timestamp() + interval '7 days',
    statement_timestamp() + interval '7 days 3 hours',
    (select id from public.cities where slug = 'haifa'),
    'home',
    null,
    null,
    null,
    null,
    null,
    'group',
    null,
    '62000000-0000-4000-8000-000000000205',
    8,
    true,
    '88 Protected B08 Home, Haifa',
    'Use the private entrance.',
    34.997,
    32.811,
    'publish',
    null
  );
$function$;

create function pg_temp.create_b08_venue_event(
  input_title text,
  input_audience text,
  input_team_id uuid
)
returns table (event_id uuid, status text)
language sql
as $function$
  select *
  from public.create_or_update_event(
    null,
    '62000000-0000-4000-8000-000000000301',
    null,
    '62000000-0000-4000-8000-000000000204',
    input_title,
    'A truthful public business-venue fixture listing.',
    'Watch the full match on venue screens',
    'No cover charge',
    'Respect venue staff and every attendee.',
    'Hosted commercially by B08 Match Corner',
    true,
    statement_timestamp() + interval '7 days',
    statement_timestamp() + interval '7 days 3 hours',
    (select id from public.cities where slug = 'haifa'),
    'venue',
    '62000000-0000-4000-8000-000000000301',
    null,
    null,
    null,
    null,
    input_audience,
    input_team_id,
    null,
    80,
    false,
    null,
    null,
    null,
    null,
    'publish',
    null
  );
$function$;

create function pg_temp.create_b08_separately_organized_event()
returns table (event_id uuid, status text)
language sql
as $function$
  select *
  from public.create_group_event(
    '62000000-0000-4000-8000-000000000205',
    '62000000-0000-4000-8000-000000000204',
    'B08 separately organized invite event',
    'An invite-only event reviewed by a separately selected organizing group.',
    'Watch the full match together',
    'Free',
    'Respect the host and every attendee.',
    'None',
    true,
    statement_timestamp() + interval '7 days',
    statement_timestamp() + interval '7 days 3 hours',
    (select id from public.cities where slug = 'haifa'),
    'home',
    null,
    null,
    null,
    null,
    'invite_only',
    null,
    6,
    '77 Protected B08 Home, Haifa',
    'Use the side entrance.',
    34.996,
    32.810,
    'publish',
    null
  );
$function$;

set local role authenticated;
set local "request.jwt.claim.sub" = '62000000-0000-4000-8000-000000000108';
select is(
  (select status from pg_temp.create_b08_separately_organized_event()),
  'pending_group_review',
  'a member may submit an invite-only event to a separately selected organizing group'
);

reset role;
select set_config(
  'test.b08_separately_organized_event_id',
  (select id::text from public.events where title = 'B08 separately organized invite event'),
  true
);
select is(
  (
    select organizing_group_id
    from public.events
    where id = current_setting('test.b08_separately_organized_event_id')::uuid
  ),
  '62000000-0000-4000-8000-000000000205'::uuid,
  'the transaction stores the reviewing group as the organizer'
);
select is(
  (
    select audience_group_id
    from public.events
    where id = current_setting('test.b08_separately_organized_event_id')::uuid
  ),
  null::uuid,
  'the organizing group does not silently become the invite-only audience'
);
set local role authenticated;
set local "request.jwt.claim.sub" = '62000000-0000-4000-8000-000000000102';
select is(
  (
    select status
    from public.publish_group_event(
      current_setting('test.b08_separately_organized_event_id')::uuid,
      'reject',
      null
    )
  ),
  'cancelled',
  'the organizing-group administrator can reject the separately scoped submission'
);

reset role;
set local role authenticated;
set local "request.jwt.claim.sub" = '62000000-0000-4000-8000-000000000109';
select throws_ok(
  $$select * from pg_temp.create_b08_group_event('Banned group submission')$$,
  'P0001',
  'NOT_ALLOWED',
  'an actively banned user cannot submit a group event'
);

reset role;
set local role authenticated;
set local "request.jwt.claim.sub" = '62000000-0000-4000-8000-000000000106';
select throws_ok(
  $$select * from pg_temp.create_b08_group_event('Nonmember group submission')$$,
  'P0001',
  'NOT_ALLOWED',
  'a non-member cannot submit a group event'
);

reset role;
set local role authenticated;
set local "request.jwt.claim.sub" = '62000000-0000-4000-8000-000000000103';
select is(
  (select status from pg_temp.create_b08_group_event('B08 reviewed group event')),
  'pending_group_review',
  'an active non-banned member submission remains pending review'
);

reset role;
select set_config(
  'test.b08_group_event_id',
  (select id::text from public.events where title = 'B08 reviewed group event'),
  true
);
set local role authenticated;
set local "request.jwt.claim.sub" = '62000000-0000-4000-8000-000000000105';
select is(
  (
    select count(*)
    from public.get_event_summary(current_setting('test.b08_group_event_id')::uuid)
  ),
  0::bigint,
  'an ordinary member cannot see a pending group submission'
);

reset role;
set local role authenticated;
set local "request.jwt.claim.sub" = '62000000-0000-4000-8000-000000000102';
select is(
  (
    select count(*)
    from public.get_event_summary(current_setting('test.b08_group_event_id')::uuid)
  ),
  1::bigint,
  'an active group administrator may inspect the pending safe summary'
);
select is(
  (
    select count(*)
    from public.list_group_event_submissions(
      '62000000-0000-4000-8000-000000000205',
      0,
      20
    )
    where status = 'pending_group_review'
  ),
  1::bigint,
  'the administrator queue contains the pending submission'
);
select ok(
  (
    select row_to_json(queue_row)::text not like '%88 Protected B08 Home%'
    from public.list_group_event_submissions(
      '62000000-0000-4000-8000-000000000205',
      0,
      20
    ) as queue_row
    where event_id = current_setting('test.b08_group_event_id')::uuid
  ),
  'the group review queue omits the protected home address'
);

reset role;
set local role authenticated;
set local "request.jwt.claim.sub" = '62000000-0000-4000-8000-000000000106';
select throws_ok(
  format(
    'select * from public.publish_group_event(%L::uuid,%L,null)',
    current_setting('test.b08_group_event_id'),
    'approve'
  ),
  'P0001',
  'NOT_FOUND',
  'an ordinary non-member cannot infer or review a pending group event'
);

reset role;
select is(
  (select lifecycle::text from public.groups where id = '62000000-0000-4000-8000-000000000205'),
  'forming',
  'a pending event does not prematurely activate a discoverable group'
);

set local role authenticated;
set local "request.jwt.claim.sub" = '62000000-0000-4000-8000-000000000102';
select is(
  (
    select status
    from public.publish_group_event(
      current_setting('test.b08_group_event_id')::uuid,
      'approve',
      null
    )
  ),
  'published',
  'an active group administrator approves and publishes the pending event'
);

reset role;
select is(
  (select lifecycle::text from public.groups where id = '62000000-0000-4000-8000-000000000205'),
  'active',
  'event approval activates a discoverable group only after every gate fact passes'
);
select ok(
  exists (
    select 1
    from public.security_audit_events
    where action = 'event.group_review.approve'
      and resource_id = current_setting('test.b08_group_event_id')::uuid
      and metadata ->> 'decision' = 'approve'
  ),
  'group event approval writes bounded audit evidence'
);

set local role authenticated;
set local "request.jwt.claim.sub" = '62000000-0000-4000-8000-000000000103';
select is(
  (
    select count(*)
    from public.get_event_summary(current_setting('test.b08_group_event_id')::uuid)
  ),
  1::bigint,
  'an active group member sees the approved future event'
);
select is(
  (
    select count(*)
    from public.list_group_events('62000000-0000-4000-8000-000000000205', 12)
  ),
  1::bigint,
  'the approved event appears in the member-safe group listing'
);

reset role;
update public.groups
set lifecycle = 'suspended', suspended_at = statement_timestamp()
where id = '62000000-0000-4000-8000-000000000205';
set local role authenticated;
set local "request.jwt.claim.sub" = '62000000-0000-4000-8000-000000000105';
select is(
  (
    select count(*)
    from public.get_event_summary(current_setting('test.b08_group_event_id')::uuid)
  ),
  0::bigint,
  'group suspension immediately removes an ordinary member event summary'
);

reset role;
update public.groups
set lifecycle = 'active', activated_at = coalesce(activated_at, statement_timestamp()), suspended_at = null
where id = '62000000-0000-4000-8000-000000000205';
insert into public.group_bans (group_id, user_id, banned_by, reason)
values (
  '62000000-0000-4000-8000-000000000205',
  '62000000-0000-4000-8000-000000000105',
  '62000000-0000-4000-8000-000000000101',
  'Banned viewer test.'
);
set local role authenticated;
set local "request.jwt.claim.sub" = '62000000-0000-4000-8000-000000000105';
select is(
  (
    select count(*)
    from public.get_event_summary(current_setting('test.b08_group_event_id')::uuid)
  ),
  0::bigint,
  'an active group ban removes event visibility without revealing the event'
);

reset role;
update public.events
set
  status = 'cancelled',
  published_at = null,
  cancelled_at = statement_timestamp(),
  cancel_reason = 'Cancelled for the event-gate regression test.'
where id = current_setting('test.b08_group_event_id')::uuid;
select is(
  (select lifecycle::text from public.groups where id = '62000000-0000-4000-8000-000000000205'),
  'forming',
  'event cancellation re-evaluates and removes the future-event discovery gate'
);

set local role authenticated;
set local "request.jwt.claim.sub" = '62000000-0000-4000-8000-000000000104';
select is(
  (select status from pg_temp.create_b08_group_event('B08 rejected group event')),
  'pending_group_review',
  'another active member may submit a separate reviewed event'
);

reset role;
select set_config(
  'test.b08_rejected_event_id',
  (select id::text from public.events where title = 'B08 rejected group event'),
  true
);

insert into public.group_bans (group_id, user_id, banned_by, reason)
values (
  '62000000-0000-4000-8000-000000000205',
  '62000000-0000-4000-8000-000000000104',
  '62000000-0000-4000-8000-000000000101',
  'Submitter became ineligible before review.'
);
set local role authenticated;
set local "request.jwt.claim.sub" = '62000000-0000-4000-8000-000000000102';
select throws_ok(
  format(
    'select * from public.publish_group_event(%L::uuid,%L,null)',
    current_setting('test.b08_rejected_event_id'),
    'approve'
  ),
  'P0001',
  'NOT_ALLOWED',
  'an administrator cannot publish after the submitting member becomes banned'
);
select is(
  (
    select status
    from public.publish_group_event(
      current_setting('test.b08_rejected_event_id')::uuid,
      'reject',
      null
    )
  ),
  'cancelled',
  'an administrator may reject and close an ineligible pending submission'
);
select throws_ok(
  format(
    'select * from public.publish_group_event(%L::uuid,%L,null)',
    current_setting('test.b08_rejected_event_id'),
    'reject'
  ),
  'P0001',
  'INVALID_TRANSITION',
  'a second review cannot transition the same terminal event'
);

reset role;
set local role authenticated;
set local "request.jwt.claim.sub" = '62000000-0000-4000-8000-000000000101';
select throws_ok(
  $$select * from pg_temp.create_b08_venue_event('Missing follower team','team_followers',null)$$,
  'P0001',
  'VALIDATION_FAILED',
  'team-follower venue events require a selected team'
);
select throws_ok(
  $$select * from pg_temp.create_b08_venue_event('Private venue audience','friends',null)$$,
  'P0001',
  'NOT_ALLOWED',
  'venue owners cannot craft a private audience'
);
select is(
  (select status from pg_temp.create_b08_venue_event('B08 public venue event','public',null)),
  'published',
  'the owner publishes a public venue event with immediate approval by default'
);

reset role;
select set_config(
  'test.b08_public_venue_event_id',
  (select id::text from public.events where title = 'B08 public venue event'),
  true
);

delete from public.security_audit_events
where actor_id = '62000000-0000-4000-8000-000000000101'
  and action = 'event.create';
set local role authenticated;
set local "request.jwt.claim.sub" = '62000000-0000-4000-8000-000000000101';
select is(
  (
    select status
    from pg_temp.create_b08_venue_event(
      'B08 team follower venue event',
      'team_followers',
      '62000000-0000-4000-8000-000000000202'
    )
  ),
  'published',
  'the owner publishes a team-follower venue event with its target'
);

reset role;
select set_config(
  'test.b08_team_venue_event_id',
  (select id::text from public.events where title = 'B08 team follower venue event'),
  true
);

set local role authenticated;
set local "request.jwt.claim.sub" = '62000000-0000-4000-8000-000000000106';
select throws_ok(
  $$select * from pg_temp.create_b08_venue_event('Forged venue host','public',null)$$,
  'P0001',
  'NOT_ALLOWED',
  'a non-owner cannot forge the venue host ID'
);
select throws_ok(
  $$select count(*) from public.list_managed_venue_events('62000000-0000-4000-8000-000000000301',20)$$,
  'P0001',
  'NOT_FOUND',
  'a non-owner cannot list venue management state'
);

reset role;
reset "request.jwt.claim.sub";
set local role anon;
select is(
  (
    select count(*)
    from public.get_event_summary(current_setting('test.b08_public_venue_event_id')::uuid)
  ),
  1::bigint,
  'an anonymous visitor sees a safe public venue-event summary'
);
select is(
  (
    select count(*)
    from public.get_event_summary(current_setting('test.b08_team_venue_event_id')::uuid)
  ),
  1::bigint,
  'team-follower summary visibility remains public to anonymous visitors'
);
select is(
  (select count(*) from public.list_venue_events('b08-match-corner', 12)),
  2::bigint,
  'the public venue page lists both eligible future venue events'
);

reset role;
insert into public.subscriptions (user_id, kind, team_id)
values (
  '62000000-0000-4000-8000-000000000106',
  'team',
  '62000000-0000-4000-8000-000000000202'
);
insert into public.event_attendance (event_id, user_id, status, source)
values
  (
    current_setting('test.b08_public_venue_event_id')::uuid,
    '62000000-0000-4000-8000-000000000106',
    'approved',
    'self_request'
  ),
  (
    current_setting('test.b08_public_venue_event_id')::uuid,
    '62000000-0000-4000-8000-000000000108',
    'requested',
    'self_request'
  );

set local role authenticated;
set local "request.jwt.claim.sub" = '62000000-0000-4000-8000-000000000106';
select is(
  (
    select count(*)
    from public.get_event_summary(current_setting('test.b08_team_venue_event_id')::uuid)
  ),
  1::bigint,
  'a team follower sees the same safe team-follower summary'
);

reset role;
set local role authenticated;
set local "request.jwt.claim.sub" = '62000000-0000-4000-8000-000000000107';
select is(
  (
    select count(*)
    from public.get_event_summary(current_setting('test.b08_team_venue_event_id')::uuid)
  ),
  1::bigint,
  'an unrelated non-follower also sees the public team-follower summary'
);

reset role;
reset "request.jwt.claim.sub";
set local role anon;
select is(
  (
    select approved_attendee_count
    from public.get_event_summary(current_setting('test.b08_public_venue_event_id')::uuid)
  ),
  1::bigint,
  'the safe projection exposes only the bounded approved-attendee aggregate'
);
select is(
  (
    select remaining_capacity
    from public.get_event_summary(current_setting('test.b08_public_venue_event_id')::uuid)
  ),
  79,
  'the safe projection derives remaining capacity from approved rows'
);
select ok(
  (
    select row_to_json(summary)::text not like '%62000000-0000-4000-8000-000000000106%'
      and row_to_json(summary)::text not like '%b08_outsider%'
    from public.get_event_summary(current_setting('test.b08_public_venue_event_id')::uuid) as summary
  ),
  'the public event payload does not expose attendee identities'
);

reset role;
set local role authenticated;
set local "request.jwt.claim.sub" = '62000000-0000-4000-8000-000000000108';
select is(
  (
    select viewer_attendance_status
    from public.get_event_summary(current_setting('test.b08_public_venue_event_id')::uuid)
  ),
  'requested',
  'a signed-in viewer receives only their own attendance status'
);

reset role;
insert into public.friendships (
  user_low_id, user_high_id, requested_by, status, responded_at
)
values (
  '62000000-0000-4000-8000-000000000101',
  '62000000-0000-4000-8000-000000000107',
  '62000000-0000-4000-8000-000000000101',
  'accepted',
  statement_timestamp()
);

insert into public.events (
  id, created_by, host_user_id, match_id, title, description, expected_activity,
  cost_description, event_rules, commercial_affiliation, host_presence_confirmed_at,
  starts_at, ends_at, city_id, place_kind, audience, capacity, requires_approval,
  status, published_at
)
values
  (
    '62000000-0000-4000-8000-000000000401',
    '62000000-0000-4000-8000-000000000101',
    '62000000-0000-4000-8000-000000000101',
    '62000000-0000-4000-8000-000000000204',
    'B08 friends home event',
    'A published protected direct-friends event.',
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
    'published',
    statement_timestamp()
  ),
  (
    '62000000-0000-4000-8000-000000000402',
    '62000000-0000-4000-8000-000000000101',
    '62000000-0000-4000-8000-000000000101',
    '62000000-0000-4000-8000-000000000204',
    'B08 host draft',
    'A protected draft visible only to its manager.',
    'Watch the full match',
    'Free',
    'Respect everyone.',
    'None',
    statement_timestamp(),
    statement_timestamp() + interval '7 days',
    statement_timestamp() + interval '7 days 3 hours',
    (select id from public.cities where slug = 'haifa'),
    'home',
    'invite_only',
    6,
    true,
    'draft',
    null
  );

insert into public.event_private_locations (event_id, address_text, directions, location)
values
  (
    '62000000-0000-4000-8000-000000000401',
    '99 Never Expose Street, Haifa',
    'Private directions one.',
    extensions.st_setsrid(extensions.st_makepoint(34.998, 32.812), 4326)::extensions.geography
  ),
  (
    '62000000-0000-4000-8000-000000000402',
    '100 Never Expose Street, Haifa',
    'Private directions two.',
    extensions.st_setsrid(extensions.st_makepoint(34.9981, 32.8121), 4326)::extensions.geography
  );

insert into public.events (
  id, created_by, host_user_id, match_id, title, description, expected_activity,
  cost_description, event_rules, commercial_affiliation, host_presence_confirmed_at,
  starts_at, ends_at, city_id, place_kind, public_place_name, public_address_text,
  public_location, audience, capacity, requires_approval, status, published_at
)
values (
  '62000000-0000-4000-8000-000000000403',
  '62000000-0000-4000-8000-000000000101',
  '62000000-0000-4000-8000-000000000101',
  '62000000-0000-4000-8000-000000000204',
  'B08 invite-only public-place event',
  'A published invite-only event at an ordinary public place.',
  'Watch the full match',
  'Free',
  'Respect everyone.',
  'None',
  statement_timestamp(),
  statement_timestamp() + interval '7 days',
  statement_timestamp() + interval '7 days 3 hours',
  (select id from public.cities where slug = 'haifa'),
  'public_place',
  'B08 Community Hall',
  '20 Public Street, Haifa',
  extensions.st_setsrid(extensions.st_makepoint(35.001, 32.815), 4326)::extensions.geography,
  'invite_only',
  20,
  true,
  'published',
  statement_timestamp()
);

insert into public.event_invitations (event_id, invitee_id, invited_by)
values (
  '62000000-0000-4000-8000-000000000403',
  '62000000-0000-4000-8000-000000000108',
  '62000000-0000-4000-8000-000000000101'
);

set local role authenticated;
set local "request.jwt.claim.sub" = '62000000-0000-4000-8000-000000000107';
select is(
  (select count(*) from public.get_event_summary('62000000-0000-4000-8000-000000000401')),
  1::bigint,
  'an accepted direct friend sees the friends event'
);
select ok(
  (
    select row_to_json(summary)::text not like '%99 Never Expose Street%'
      and row_to_json(summary)::text not like '%34.998%'
    from public.get_event_summary('62000000-0000-4000-8000-000000000401') as summary
  ),
  'the friend-safe summary structurally omits exact home address and coordinate data'
);

reset role;
set local role authenticated;
set local "request.jwt.claim.sub" = '62000000-0000-4000-8000-000000000106';
select is(
  (select count(*) from public.get_event_summary('62000000-0000-4000-8000-000000000401')),
  0::bigint,
  'an unrelated completed user cannot see a friends event'
);
select is(
  (select count(*) from public.get_event_summary('62000000-0000-4000-8000-000000000403')),
  0::bigint,
  'an uninvited user cannot see an invite-only event'
);
select is(
  (select count(*) from public.get_event_summary('62000000-0000-4000-8000-000000009999')),
  0::bigint,
  'a nonexistent event returns the same empty projection as an invisible private event'
);

reset role;
set local role authenticated;
set local "request.jwt.claim.sub" = '62000000-0000-4000-8000-000000000108';
select is(
  (select count(*) from public.get_event_summary('62000000-0000-4000-8000-000000000403')),
  1::bigint,
  'a current direct invitee sees the invite-only safe summary'
);

reset role;
set local role authenticated;
set local "request.jwt.claim.sub" = '62000000-0000-4000-8000-000000000101';
select is(
  (select count(*) from public.get_event_summary('62000000-0000-4000-8000-000000000402')),
  1::bigint,
  'the personal host can inspect their own draft safe summary'
);
select is(public.block_user('b08_friend', null), true, 'the host blocks a direct friend immediately');

reset role;
set local role authenticated;
set local "request.jwt.claim.sub" = '62000000-0000-4000-8000-000000000107';
select is(
  (select count(*) from public.get_event_summary('62000000-0000-4000-8000-000000000401')),
  0::bigint,
  'either-direction blocking immediately hides the future private event'
);

reset role;
update public.venues
set verification_status = 'suspended', suspended_at = statement_timestamp()
where id = '62000000-0000-4000-8000-000000000301';
set local role authenticated;
set local "request.jwt.claim.sub" = '62000000-0000-4000-8000-000000000101';
select throws_ok(
  $$select * from pg_temp.create_b08_venue_event('Suspended venue event','public',null)$$,
  'P0001',
  'NOT_ALLOWED',
  'a suspended venue cannot create another event'
);

reset role;
reset "request.jwt.claim.sub";
set local role anon;
select is(
  (
    select count(*)
    from public.get_event_summary(current_setting('test.b08_public_venue_event_id')::uuid)
  ),
  0::bigint,
  'venue suspension removes its public event summary'
);
select is(
  (select count(*) from public.list_venue_events('b08-match-corner', 12)),
  0::bigint,
  'venue suspension removes every public venue listing'
);

reset role;
update public.venues
set verification_status = 'unverified', suspended_at = null
where id = '62000000-0000-4000-8000-000000000301';
update public.events
set
  starts_at = statement_timestamp() - interval '2 hours',
  ends_at = statement_timestamp() - interval '1 hour'
where id = current_setting('test.b08_team_venue_event_id')::uuid;
reset "request.jwt.claim.sub";
set local role anon;
select is(
  (
    select count(*)
    from public.get_event_summary(current_setting('test.b08_team_venue_event_id')::uuid)
  ),
  0::bigint,
  'a started venue event is removed by the time filter'
);
select is(
  (select count(*) from public.list_venue_events('b08-match-corner', 12)),
  1::bigint,
  'the venue listing excludes the started event but keeps the future event'
);

reset role;
set local role authenticated;
set local "request.jwt.claim.sub" = '62000000-0000-4000-8000-000000000101';
select is(
  (
    select count(*)
    from public.list_managed_venue_events('62000000-0000-4000-8000-000000000301', 20)
  ),
  2::bigint,
  'the eligible owner sees bounded venue management statuses, including the started listing'
);

select * from finish();
rollback;
