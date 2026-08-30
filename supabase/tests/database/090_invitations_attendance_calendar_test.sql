begin;

create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public, pg_catalog;

select no_plan();

select has_index(
  'public',
  'event_attendance',
  'event_attendance_pending_review_idx',
  'pending attendance review has a bounded queue index'
);
select has_index(
  'public',
  'security_audit_events',
  'security_audit_event_participation_idx',
  'event participation audit lookup is indexed'
);
select ok(
  not has_table_privilege('authenticated', 'public.event_invitations', 'select'),
  'authenticated callers cannot bypass invitation projections'
);
select ok(
  not has_table_privilege('authenticated', 'public.event_attendance', 'select'),
  'authenticated callers cannot bypass attendance projections'
);
select ok(
  has_function_privilege(
    'authenticated',
    'public.request_or_join_event(uuid,uuid)',
    'execute'
  ),
  'eligible users can invoke the controlled participation function'
);
select ok(
  has_function_privilege(
    'authenticated',
    'public.resolve_event_invitation_candidate_handles(uuid,uuid[])',
    'execute'
  ),
  'authenticated event managers can invoke the bounded invitation-candidate resolver'
);
select ok(
  not has_function_privilege(
    'anon',
    'public.resolve_event_invitation_candidate_handles(uuid,uuid[])',
    'execute'
  ),
  'anonymous callers cannot resolve invitation candidates'
);
select ok(
  not has_function_privilege(
    'anon',
    'public.get_private_event_location(uuid,uuid)',
    'execute'
  ),
  'anonymous callers cannot invoke the private-location function'
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
    ('90000000-0000-4000-8000-000000000101'::uuid, 'b10-host@example.com'),
    ('90000000-0000-4000-8000-000000000102'::uuid, 'b10-invited-friend@example.com'),
    ('90000000-0000-4000-8000-000000000103'::uuid, 'b10-requester-friend@example.com'),
    ('90000000-0000-4000-8000-000000000104'::uuid, 'b10-direct@example.com'),
    ('90000000-0000-4000-8000-000000000105'::uuid, 'b10-venue-one@example.com'),
    ('90000000-0000-4000-8000-000000000106'::uuid, 'b10-venue-two@example.com'),
    ('90000000-0000-4000-8000-000000000107'::uuid, 'b10-team-follower@example.com'),
    ('90000000-0000-4000-8000-000000000108'::uuid, 'b10-group-member@example.com'),
    ('90000000-0000-4000-8000-000000000109'::uuid, 'b10-unrelated@example.com'),
    ('90000000-0000-4000-8000-000000000110'::uuid, 'b10-suspended@example.com')
) as fixture(id, email);

update public.profiles
set
  handle = 'b10_user_' || right(id::text, 3),
  display_name = 'B10 User ' || right(id::text, 3),
  city_id = (select id from public.cities where slug = 'haifa'),
  adult_attested_at = statement_timestamp(),
  rules_version = 1,
  rules_accepted_at = statement_timestamp(),
  profile_completed_at = statement_timestamp(),
  fan_enabled_at = statement_timestamp()
where id between
  '90000000-0000-4000-8000-000000000101' and
  '90000000-0000-4000-8000-000000000110';

update public.profiles
set suspended_at = statement_timestamp()
where id = '90000000-0000-4000-8000-000000000110';

insert into public.competitions (
  id, sport_id, provider, provider_external_id, code, name, country_name, last_synced_at
)
values (
  '90000000-0000-4000-8000-000000000201',
  '00000000-0000-4000-8000-000000000020',
  'b10-test', 'competition', 'B10', 'B10 League', 'England', statement_timestamp()
);

insert into public.teams (
  id, sport_id, provider, provider_external_id, name, short_name, tla,
  country_name, last_synced_at
)
values
  (
    '90000000-0000-4000-8000-000000000202',
    '00000000-0000-4000-8000-000000000020',
    'b10-test', 'home-team', 'B10 Arsenal FC', 'B10 Arsenal', 'BTA',
    'England', statement_timestamp()
  ),
  (
    '90000000-0000-4000-8000-000000000203',
    '00000000-0000-4000-8000-000000000020',
    'b10-test', 'away-team', 'B10 Chelsea FC', 'B10 Chelsea', 'BTC',
    'England', statement_timestamp()
  );

insert into public.matches (
  id, provider, provider_external_id, competition_id, home_team_id,
  away_team_id, starts_at, status, matchday, season_label, last_synced_at
)
values (
  '90000000-0000-4000-8000-000000000204',
  'b10-test', 'match',
  '90000000-0000-4000-8000-000000000201',
  '90000000-0000-4000-8000-000000000202',
  '90000000-0000-4000-8000-000000000203',
  statement_timestamp() + interval '7 days', 'timed', 1, '2026',
  statement_timestamp()
);

insert into public.friendships (
  user_low_id, user_high_id, requested_by, status, responded_at
)
values
  (
    '90000000-0000-4000-8000-000000000101',
    '90000000-0000-4000-8000-000000000102',
    '90000000-0000-4000-8000-000000000101', 'accepted', statement_timestamp()
  ),
  (
    '90000000-0000-4000-8000-000000000101',
    '90000000-0000-4000-8000-000000000103',
    '90000000-0000-4000-8000-000000000103', 'accepted', statement_timestamp()
  );

insert into public.groups (
  id, slug, name, owner_id, city_id, visibility, lifecycle, description, activated_at
)
values (
  '90000000-0000-4000-8000-000000000205',
  'b10-group', 'B10 Group', '90000000-0000-4000-8000-000000000101',
  (select id from public.cities where slug = 'haifa'),
  'unlisted', 'active', 'A B10 group for current eligibility checks.',
  statement_timestamp()
);

insert into public.group_memberships (group_id, user_id, role, status, reviewed_by, reviewed_at)
values
  (
    '90000000-0000-4000-8000-000000000205',
    '90000000-0000-4000-8000-000000000101', 'owner', 'active', null, null
  ),
  (
    '90000000-0000-4000-8000-000000000205',
    '90000000-0000-4000-8000-000000000108', 'member', 'active',
    '90000000-0000-4000-8000-000000000101', statement_timestamp()
  ),
  (
    '90000000-0000-4000-8000-000000000205',
    '90000000-0000-4000-8000-000000000106', 'admin', 'active',
    '90000000-0000-4000-8000-000000000101', statement_timestamp()
  );

insert into public.venues (
  id, owner_id, slug, name, city_id, address_text, location,
  description, screen_count, stated_capacity
)
values (
  '90000000-0000-4000-8000-000000000301',
  '90000000-0000-4000-8000-000000000101',
  'b10-venue', 'B10 Match Corner',
  (select id from public.cities where slug = 'haifa'),
  '12 Public Street, Haifa',
  extensions.st_setsrid(extensions.st_makepoint(34.999, 32.813), 4326)::extensions.geography,
  'A public venue for B10 attendance and calendar tests.', 4, 80
);

insert into public.events (
  id, created_by, host_user_id, match_id, title, description,
  expected_activity, cost_description, event_rules, commercial_affiliation,
  host_presence_confirmed_at, starts_at, ends_at, city_id, place_kind,
  audience, capacity, requires_approval, status, published_at
)
values
  (
    '90000000-0000-4000-8000-000000000401',
    '90000000-0000-4000-8000-000000000101',
    '90000000-0000-4000-8000-000000000101',
    '90000000-0000-4000-8000-000000000204',
    'B10 Friends Home', 'A protected home event for invitation and request tests.',
    'Watch the full match', 'Free', 'Respect every attendee.', 'None',
    statement_timestamp(), statement_timestamp() + interval '7 days',
    statement_timestamp() + interval '7 days 3 hours',
    (select id from public.cities where slug = 'haifa'),
    'home', 'friends', 3, true, 'published', statement_timestamp()
  ),
  (
    '90000000-0000-4000-8000-000000000402',
    '90000000-0000-4000-8000-000000000101',
    '90000000-0000-4000-8000-000000000101',
    '90000000-0000-4000-8000-000000000204',
    'B10 Invite Home', 'A protected invite-only home event for direct acceptance.',
    'Watch the full match', 'Free', 'Respect every attendee.', 'None',
    statement_timestamp(), statement_timestamp() + interval '8 days',
    statement_timestamp() + interval '8 days 3 hours',
    (select id from public.cities where slug = 'haifa'),
    'home', 'invite_only', 1, true, 'published', statement_timestamp()
  );

insert into public.event_private_locations (event_id, address_text, directions, location)
values
  (
    '90000000-0000-4000-8000-000000000401',
    '99 Protected Home, Haifa', 'Ring apartment 4.',
    extensions.st_setsrid(extensions.st_makepoint(34.998, 32.812), 4326)::extensions.geography
  ),
  (
    '90000000-0000-4000-8000-000000000402',
    '101 Protected Home, Haifa', 'Use the side entrance.',
    extensions.st_setsrid(extensions.st_makepoint(34.997, 32.811), 4326)::extensions.geography
  );

insert into public.events (
  id, created_by, host_user_id, match_id, title, description,
  expected_activity, cost_description, event_rules, commercial_affiliation,
  host_presence_confirmed_at, starts_at, ends_at, city_id, place_kind,
  audience, audience_group_id, organizing_group_id, capacity, requires_approval,
  status, published_at
)
values (
  '90000000-0000-4000-8000-000000000405',
  '90000000-0000-4000-8000-000000000101',
  '90000000-0000-4000-8000-000000000101',
  '90000000-0000-4000-8000-000000000204',
  'B10 Group Home', 'A protected group home event for live eligibility revocation.',
  'Watch the full match', 'Free', 'Respect every attendee.', 'None',
  statement_timestamp(), statement_timestamp() + interval '9 days',
  statement_timestamp() + interval '9 days 3 hours',
  (select id from public.cities where slug = 'haifa'),
  'home', 'group', '90000000-0000-4000-8000-000000000205',
  '90000000-0000-4000-8000-000000000205', 3, true, 'published',
  statement_timestamp()
);

insert into public.event_private_locations (event_id, address_text, directions, location)
values (
  '90000000-0000-4000-8000-000000000405',
  '105 Protected Group Home, Haifa', 'Ring the green bell.',
  extensions.st_setsrid(extensions.st_makepoint(34.996, 32.810), 4326)::extensions.geography
);

insert into public.events (
  id, created_by, host_user_id, match_id, title, description,
  expected_activity, cost_description, event_rules, commercial_affiliation,
  host_presence_confirmed_at, starts_at, ends_at, city_id, place_kind,
  public_place_name, public_address_text, public_location,
  audience, organizing_group_id, capacity, requires_approval, status, published_at
)
values (
  '90000000-0000-4000-8000-000000000406',
  '90000000-0000-4000-8000-000000000101',
  '90000000-0000-4000-8000-000000000101',
  '90000000-0000-4000-8000-000000000204',
  'B10 Unlisted Organizer',
  'An invite-only event proving the organizing-group link projection.',
  'Watch the full match', 'Free', 'Respect every attendee.', 'None',
  statement_timestamp(), statement_timestamp() + interval '10 days',
  statement_timestamp() + interval '10 days 3 hours',
  (select id from public.cities where slug = 'haifa'),
  'public_place', 'B10 Public Room', '20 Public Street, Haifa',
  extensions.st_setsrid(extensions.st_makepoint(35.001, 32.815), 4326)::extensions.geography,
  'invite_only', '90000000-0000-4000-8000-000000000205',
  10, true, 'published', statement_timestamp()
);

insert into public.event_invitations (event_id, invitee_id, invited_by)
values (
  '90000000-0000-4000-8000-000000000406',
  '90000000-0000-4000-8000-000000000104',
  '90000000-0000-4000-8000-000000000101'
);

set local role authenticated;
set local "request.jwt.claim.sub" = '90000000-0000-4000-8000-000000000106';
select is(
  (
    select organizing_group_slug
    from public.get_event_summary('90000000-0000-4000-8000-000000000406')
  ),
  'b10-group',
  'an active organizing-group admin receives the authorized group slug link projection'
);

set local "request.jwt.claim.sub" = '90000000-0000-4000-8000-000000000104';
select is(
  (
    select organizing_group_name
    from public.get_event_summary('90000000-0000-4000-8000-000000000406')
  ),
  'B10 Group',
  'a directly invited nonmember retains the approved organizing-group name context'
);
select is(
  (
    select organizing_group_slug
    from public.get_event_summary('90000000-0000-4000-8000-000000000406')
  ),
  null,
  'an invited nonmember cannot obtain an unlisted organizing-group slug'
);
reset role;

insert into public.event_attendance (
  event_id, user_id, status, source, reviewed_by, reviewed_at
)
values (
  '90000000-0000-4000-8000-000000000405',
  '90000000-0000-4000-8000-000000000108',
  'approved', 'self_request',
  '90000000-0000-4000-8000-000000000101', statement_timestamp()
);

insert into public.events (
  id, created_by, host_venue_id, match_id, title, description,
  expected_activity, cost_description, event_rules, commercial_affiliation,
  host_presence_confirmed_at, starts_at, ends_at, city_id, place_kind,
  venue_id, audience, audience_team_id, capacity, requires_approval,
  status, published_at
)
values
  (
    '90000000-0000-4000-8000-000000000403',
    '90000000-0000-4000-8000-000000000101',
    '90000000-0000-4000-8000-000000000301',
    '90000000-0000-4000-8000-000000000204',
    'B10 Public Venue', 'A public venue event with one atomic immediate place.',
    'Watch the full match', 'Free', 'Respect every attendee.', 'Commercial venue',
    statement_timestamp(), statement_timestamp() + interval '7 days',
    statement_timestamp() + interval '7 days 3 hours',
    (select id from public.cities where slug = 'haifa'),
    'venue', '90000000-0000-4000-8000-000000000301',
    'public', null, 1, false, 'published', statement_timestamp()
  ),
  (
    '90000000-0000-4000-8000-000000000404',
    '90000000-0000-4000-8000-000000000101',
    '90000000-0000-4000-8000-000000000301',
    '90000000-0000-4000-8000-000000000204',
    'B10 Team Venue', 'A team-follower venue event with direct-invite override.',
    'Watch the full match', 'Free', 'Respect every attendee.', 'Commercial venue',
    statement_timestamp(), statement_timestamp() + interval '7 days',
    statement_timestamp() + interval '7 days 3 hours',
    (select id from public.cities where slug = 'haifa'),
    'venue', '90000000-0000-4000-8000-000000000301',
    'team_followers', '90000000-0000-4000-8000-000000000202',
    2, false, 'published', statement_timestamp()
  );

insert into public.subscriptions (user_id, kind, team_id)
values (
  '90000000-0000-4000-8000-000000000107',
  'team',
  '90000000-0000-4000-8000-000000000202'
);

select set_config(
  'test.b10_requester_friendship_id',
  (
    select id::text from public.friendships
    where user_low_id = '90000000-0000-4000-8000-000000000101'
      and user_high_id = '90000000-0000-4000-8000-000000000103'
  ),
  true
);

set local role authenticated;
set local "request.jwt.claim.sub" = '90000000-0000-4000-8000-000000000106';
select is(
  (
    select status
    from public.request_or_join_event(
      '90000000-0000-4000-8000-000000000405',
      null
    )
  ),
  'requested',
  'an organizing-group admin can request attendance from the personal host'
);

reset role;
select set_config(
  'test.b10_group_admin_request_id',
  (
    select id::text
    from public.event_attendance
    where event_id = '90000000-0000-4000-8000-000000000405'
      and user_id = '90000000-0000-4000-8000-000000000106'
  ),
  true
);
set local role authenticated;
set local "request.jwt.claim.sub" = '90000000-0000-4000-8000-000000000106';
select throws_ok(
  $$select * from public.review_attendance(current_setting('test.b10_group_admin_request_id')::uuid,'approve',null)$$,
  'P0001', 'NOT_ALLOWED',
  'an organizing-group admin cannot approve their own attendance request'
);
select throws_ok(
  $$select * from public.get_private_event_location('90000000-0000-4000-8000-000000000405',null)$$,
  'P0001', 'LOCATION_NOT_AUTHORIZED',
  'a denied self-review does not reveal the protected home location'
);
reset role;
select is(
  (
    select status::text
    from public.event_attendance
    where id = current_setting('test.b10_group_admin_request_id')::uuid
  ),
  'requested',
  'a denied self-review leaves the host approval request pending'
);

set local role authenticated;
set local "request.jwt.claim.sub" = '90000000-0000-4000-8000-000000000109';
select throws_ok(
  $$select * from public.resolve_event_invitation_candidate_handles('90000000-0000-4000-8000-000000000401',array['90000000-0000-4000-8000-000000000102'::uuid])$$,
  'P0001', 'NOT_FOUND', 'a non-manager cannot resolve candidates for another host event'
);
select throws_ok(
  $$select * from public.create_event_invitation('90000000-0000-4000-8000-000000000401','b10_user_102',null)$$,
  'P0001', 'NOT_FOUND', 'a non-manager cannot invite to another host event'
);

set local "request.jwt.claim.sub" = '90000000-0000-4000-8000-000000000101';
select results_eq(
  $$select profile_id, handle from public.resolve_event_invitation_candidate_handles('90000000-0000-4000-8000-000000000401',array['90000000-0000-4000-8000-000000000102'::uuid,'90000000-0000-4000-8000-000000000103'::uuid])$$,
  $$values ('90000000-0000-4000-8000-000000000102'::uuid,'b10_user_102'::text),('90000000-0000-4000-8000-000000000103'::uuid,'b10_user_103'::text)$$,
  'an event manager resolves only the selected profile ids to their current handles in selection order'
);
select throws_ok(
  $$select * from public.resolve_event_invitation_candidate_handles('90000000-0000-4000-8000-000000000401',array['90000000-0000-4000-8000-000000000102'::uuid,'90000000-0000-4000-8000-000000000102'::uuid])$$,
  'P0001', 'VALIDATION_FAILED', 'the candidate resolver rejects duplicate profile ids'
);
select throws_ok(
  $$select * from public.create_event_invitation('90000000-0000-4000-8000-000000000401','b10_user_101',null)$$,
  'P0001', 'NOT_ALLOWED', 'self-invitation is rejected'
);
select throws_ok(
  $$select * from public.create_event_invitation('90000000-0000-4000-8000-000000000401','b10_user_104',null)$$,
  'P0001', 'NOT_ALLOWED', 'direct invitation does not bypass friends audience eligibility'
);
select throws_ok(
  $$select * from public.create_event_invitation('90000000-0000-4000-8000-000000000402','b10_user_110',null)$$,
  'P0001', 'NOT_ALLOWED', 'a suspended account cannot be invited'
);
select is(
  public.block_user('b10_user_109', null),
  true,
  'the host can establish the block boundary used by invitation checks'
);
select throws_ok(
  $$select * from public.create_event_invitation('90000000-0000-4000-8000-000000000402','b10_user_109',null)$$,
  'P0001', 'BLOCKED_RELATIONSHIP', 'a blocked account cannot be invited'
);

reset role;
update public.events
set
  starts_at = statement_timestamp() - interval '30 minutes',
  ends_at = statement_timestamp() + interval '2 hours'
where id = '90000000-0000-4000-8000-000000000402';
set local role authenticated;
set local "request.jwt.claim.sub" = '90000000-0000-4000-8000-000000000101';
select throws_ok(
  $$select * from public.create_event_invitation('90000000-0000-4000-8000-000000000402','b10_user_104',null)$$,
  'P0001', 'EVENT_STARTED', 'a host cannot create an invitation after kickoff'
);
reset role;
update public.events
set
  starts_at = statement_timestamp() + interval '7 days',
  ends_at = statement_timestamp() + interval '7 days 3 hours'
where id = '90000000-0000-4000-8000-000000000402';
set local role authenticated;
set local "request.jwt.claim.sub" = '90000000-0000-4000-8000-000000000101';
select lives_ok(
  $$select * from public.create_event_invitation('90000000-0000-4000-8000-000000000401','b10_user_102','90000000-0000-4000-8000-000000000501')$$,
  'a manager can create one pending invitation for an eligible friend'
);
select throws_ok(
  $$select * from public.create_event_invitation('90000000-0000-4000-8000-000000000401','b10_user_102',null)$$,
  'P0001', 'INVITE_INVALID', 'a duplicate pending invitation is rejected'
);
select is(
  (select count(*) from public.list_event_invitations('90000000-0000-4000-8000-000000000401',20,0)),
  1::bigint,
  'the manager invitation projection returns the retained pending row'
);
select throws_ok(
  $$select count(*) from public.event_invitations$$,
  '42501',
  'permission denied for table event_invitations',
  'the manager cannot directly enumerate invitation rows'
);

set local "request.jwt.claim.sub" = '90000000-0000-4000-8000-000000000103';
select throws_ok(
  $$select * from public.respond_to_event_invitation((select invitation_id from public.list_event_invitations('90000000-0000-4000-8000-000000000401',20,0) limit 1),'accept',null)$$,
  'P0001', 'NOT_FOUND', 'only the named invitee may respond'
);

reset role;
select set_config(
  'test.b10_friend_invitation_id',
  (
    select id::text from public.event_invitations
    where event_id = '90000000-0000-4000-8000-000000000401'
      and invitee_id = '90000000-0000-4000-8000-000000000102'
  ),
  true
);

set local role authenticated;
set local "request.jwt.claim.sub" = '90000000-0000-4000-8000-000000000102';
select is(
  (
    select attendance_status
    from public.respond_to_event_invitation(
      current_setting('test.b10_friend_invitation_id')::uuid,
      'accept',
      '90000000-0000-4000-8000-000000000502'
    )
  ),
  'approved',
  'accepting a private invitation is pre-approved and reserves one place'
);
select is(
  (select address_text from public.get_private_event_location('90000000-0000-4000-8000-000000000401',null)),
  '99 Protected Home, Haifa',
  'an approved currently eligible attendee receives the exact location'
);
select is(
  (select count(*) from public.list_approved_event_attendees('90000000-0000-4000-8000-000000000401',20,0)),
  1::bigint,
  'an approved attendee can read the safe approved-attendee list'
);

set local "request.jwt.claim.sub" = '90000000-0000-4000-8000-000000000101';
select lives_ok(
  $$select * from public.create_event_invitation('90000000-0000-4000-8000-000000000401','b10_user_103',null)$$,
  'the host can create a separate invitation for decline coverage'
);
reset role;
select set_config(
  'test.b10_declined_invitation_id',
  (
    select id::text from public.event_invitations
    where event_id = '90000000-0000-4000-8000-000000000401'
      and invitee_id = '90000000-0000-4000-8000-000000000103'
  ),
  true
);
set local role authenticated;
set local "request.jwt.claim.sub" = '90000000-0000-4000-8000-000000000103';
select is(
  (
    select invitation_status
    from public.respond_to_event_invitation(
      current_setting('test.b10_declined_invitation_id')::uuid,
      'decline',
      null
    )
  ),
  'declined',
  'the named invitee can decline without creating attendance'
);
select is(
  (
    select status from public.request_or_join_event(
      '90000000-0000-4000-8000-000000000401',
      '90000000-0000-4000-8000-000000000503'
    )
  ),
  'requested',
  'a private-event self request remains pending and consumes no place'
);

reset role;
select is(
  (
    select count(*) from public.event_attendance
    where event_id = '90000000-0000-4000-8000-000000000401'
      and status = 'approved'
  ),
  1::bigint,
  'the pending request did not consume capacity'
);
select set_config(
  'test.b10_friend_request_id',
  (
    select id::text from public.event_attendance
    where event_id = '90000000-0000-4000-8000-000000000401'
      and user_id = '90000000-0000-4000-8000-000000000103'
  ),
  true
);

set local role authenticated;
set local "request.jwt.claim.sub" = '90000000-0000-4000-8000-000000000101';
select is(
  (
    select requester_handle
    from public.request_context(
      '90000000-0000-4000-8000-000000000401',
      '90000000-0000-4000-8000-000000000103'
    )
  ),
  'b10_user_103',
  'the manager receives bounded factual requester context'
);
select ok(
  (
    select row_to_json(context)::text not like '%@example.com%'
      and row_to_json(context)::text not like '%score%'
    from public.request_context(
      '90000000-0000-4000-8000-000000000401',
      '90000000-0000-4000-8000-000000000103'
    ) as context
  ),
  'request context exposes neither email nor a reputation score'
);
select is(
  (
    select status from public.review_attendance(
      current_setting('test.b10_friend_request_id')::uuid,
      'approve',
      '90000000-0000-4000-8000-000000000504'
    )
  ),
  'approved',
  'the host approves a pending request through the controlled transition'
);
select is(
  (select count(*) from public.list_event_attendance('90000000-0000-4000-8000-000000000401',20,0)),
  2::bigint,
  'the manager attendance projection returns retained rows'
);

select lives_ok(
  $$select * from public.create_event_invitation('90000000-0000-4000-8000-000000000402','b10_user_104',null)$$,
  'invite-only eligibility is supplied by a direct invitation'
);
reset role;
select set_config(
  'test.b10_direct_invitation_id',
  (
    select id::text from public.event_invitations
    where event_id = '90000000-0000-4000-8000-000000000402'
  ),
  true
);

set local role authenticated;
set local "request.jwt.claim.sub" = '90000000-0000-4000-8000-000000000101';
select is(
  public.revoke_event_invitation(current_setting('test.b10_direct_invitation_id')::uuid,null),
  true,
  'a manager may revoke a pending invitation before acceptance'
);
select lives_ok(
  $$select * from public.create_event_invitation('90000000-0000-4000-8000-000000000402','b10_user_104',null)$$,
  'a declined or revoked retained invitation row may be reissued without duplication'
);

reset role;
update public.events
set
  starts_at = statement_timestamp() - interval '30 minutes',
  ends_at = statement_timestamp() + interval '2 hours'
where id = '90000000-0000-4000-8000-000000000402';
set local role authenticated;
set local "request.jwt.claim.sub" = '90000000-0000-4000-8000-000000000104';
select throws_ok(
  $$select * from public.respond_to_event_invitation(current_setting('test.b10_direct_invitation_id')::uuid,'accept',null)$$,
  'P0001', 'EVENT_STARTED', 'an invitation cannot be accepted after kickoff'
);
reset role;
update public.events
set
  starts_at = statement_timestamp() + interval '7 days',
  ends_at = statement_timestamp() + interval '7 days 3 hours'
where id = '90000000-0000-4000-8000-000000000402';
set local role authenticated;
set local "request.jwt.claim.sub" = '90000000-0000-4000-8000-000000000104';
select is(
  (
    select invitation_status
    from public.respond_to_event_invitation(
      current_setting('test.b10_direct_invitation_id')::uuid,
      'accept',
      null
    )
  ),
  'accepted',
  'the reissued invite-only invitation can be accepted'
);

set local "request.jwt.claim.sub" = '90000000-0000-4000-8000-000000000105';
select is(
  (select status from public.request_or_join_event('90000000-0000-4000-8000-000000000403',null)),
  'approved',
  'a public venue immediate join atomically reserves the only place'
);
set local "request.jwt.claim.sub" = '90000000-0000-4000-8000-000000000101';
select throws_ok(
  $$select * from public.create_event_invitation('90000000-0000-4000-8000-000000000403','b10_user_106',null)$$,
  'P0001', 'EVENT_FULL', 'a host cannot create a new invitation for an already full event'
);
set local "request.jwt.claim.sub" = '90000000-0000-4000-8000-000000000106';
select throws_ok(
  $$select * from public.request_or_join_event('90000000-0000-4000-8000-000000000403',null)$$,
  'P0001', 'EVENT_FULL', 'a second immediate join cannot overfill the event'
);
select throws_ok(
  $$select * from public.request_or_join_event('90000000-0000-4000-8000-000000000404',null)$$,
  'P0001', 'NOT_ALLOWED', 'a non-follower cannot self-join a team-followers event'
);

set local "request.jwt.claim.sub" = '90000000-0000-4000-8000-000000000101';
select lives_ok(
  $$select * from public.create_event_invitation('90000000-0000-4000-8000-000000000404','b10_user_106',null)$$,
  'a direct invitation explicitly overrides only the team-follow requirement'
);
reset role;
select set_config(
  'test.b10_team_invitation_id',
  (
    select id::text from public.event_invitations
    where event_id = '90000000-0000-4000-8000-000000000404'
      and invitee_id = '90000000-0000-4000-8000-000000000106'
  ),
  true
);
set local role authenticated;
set local "request.jwt.claim.sub" = '90000000-0000-4000-8000-000000000106';
select is(
  (
    select attendance_status
    from public.respond_to_event_invitation(
      current_setting('test.b10_team_invitation_id')::uuid,
      'accept',
      null
    )
  ),
  'approved',
  'the directly invited team non-follower receives one approved place'
);
set local "request.jwt.claim.sub" = '90000000-0000-4000-8000-000000000107';
select is(
  (select status from public.request_or_join_event('90000000-0000-4000-8000-000000000404',null)),
  'approved',
  'a current team follower may self-join the venue event'
);

reset role;
reset "request.jwt.claim.sub";
set local role anon;
select is(
  (
    select location_text
    from public.get_calendar_event('90000000-0000-4000-8000-000000000403',null)
  ),
  '12 Public Street, Haifa',
  'an anonymous public venue calendar contains only the public venue address'
);
select is(
  (
    select public_cacheable
    from public.get_calendar_event('90000000-0000-4000-8000-000000000403',null)
  ),
  true,
  'a public venue calendar is explicitly cacheable'
);

reset role;
set local role authenticated;
set local "request.jwt.claim.sub" = '90000000-0000-4000-8000-000000000109';
select throws_ok(
  $$select * from public.get_private_event_location('90000000-0000-4000-8000-000000000401',null)$$,
  'P0001', 'LOCATION_NOT_AUTHORIZED', 'an unrelated user cannot read a home address'
);
select throws_ok(
  $$select * from public.list_approved_event_attendees('90000000-0000-4000-8000-000000000401',20,0)$$,
  'P0001', 'NOT_FOUND', 'an unrelated user cannot enumerate private attendees'
);

reset role;
select set_config(
  'test.b10_friend_attendance_id',
  (
    select id::text
    from public.event_attendance
    where event_id = '90000000-0000-4000-8000-000000000401'
      and user_id = '90000000-0000-4000-8000-000000000102'
  ),
  true
);
update public.profiles
set rules_version = 2
where id = '90000000-0000-4000-8000-000000000102';

set local role authenticated;
set local "request.jwt.claim.sub" = '90000000-0000-4000-8000-000000000102';
select is(
  public.leave_event(
    current_setting('test.b10_friend_attendance_id')::uuid,
    null
  ),
  true,
  'an approved attendee can leave with stale rules while retaining one history row'
);

reset role;
update public.profiles
set rules_version = 1
where id = '90000000-0000-4000-8000-000000000102';
set local role authenticated;
set local "request.jwt.claim.sub" = '90000000-0000-4000-8000-000000000102';
select throws_ok(
  $$select * from public.get_private_event_location('90000000-0000-4000-8000-000000000401',null)$$,
  'P0001', 'LOCATION_NOT_AUTHORIZED', 'leaving immediately revokes private-location reads'
);

set local "request.jwt.claim.sub" = '90000000-0000-4000-8000-000000000103';
select is(
  public.remove_friendship(
    current_setting('test.b10_requester_friendship_id')::uuid,
    null
  ),
  true,
  'an approved attendee can end the friendship without deleting attendance history'
);
select throws_ok(
  $$select * from public.get_private_event_location('90000000-0000-4000-8000-000000000401',null)$$,
  'P0001', 'LOCATION_NOT_AUTHORIZED',
  'friendship loss immediately revokes protected-location access'
);
set local "request.jwt.claim.sub" = '90000000-0000-4000-8000-000000000101';
select is(
  (
    select count(*)
    from public.list_approved_event_attendees(
      '90000000-0000-4000-8000-000000000401',
      20,
      0
    )
    where profile_handle = 'b10_user_103'
  ),
  0::bigint,
  'the safe attendee list omits an approved row that lost current audience eligibility'
);

reset role;
update public.events
set
  starts_at = statement_timestamp() - interval '30 minutes',
  ends_at = statement_timestamp() + interval '2 hours'
where id = '90000000-0000-4000-8000-000000000401';

set local role authenticated;
set local "request.jwt.claim.sub" = '90000000-0000-4000-8000-000000000101';
select is(
  public.remove_attendee(
    current_setting('test.b10_friend_request_id')::uuid,
    'Host removed this attendee.',
    null
  ),
  true,
  'the host can safely remove an approved attendee after kickoff and retain history'
);

set local "request.jwt.claim.sub" = '90000000-0000-4000-8000-000000000108';
select is(
  (select address_text from public.get_private_event_location('90000000-0000-4000-8000-000000000405',null)),
  '105 Protected Group Home, Haifa',
  'an approved active group member can read the protected location'
);

reset role;
update public.profiles
set suspended_at = statement_timestamp()
where id = '90000000-0000-4000-8000-000000000108';
set local role authenticated;
set local "request.jwt.claim.sub" = '90000000-0000-4000-8000-000000000108';
select throws_ok(
  $$select * from public.get_private_event_location('90000000-0000-4000-8000-000000000405',null)$$,
  'P0001', 'ACCOUNT_SUSPENDED', 'account suspension immediately revokes the location function'
);

reset role;
update public.profiles
set suspended_at = null
where id = '90000000-0000-4000-8000-000000000108';
set local role authenticated;
set local "request.jwt.claim.sub" = '90000000-0000-4000-8000-000000000101';
select lives_ok(
  $$select * from public.ban_group_member('90000000-0000-4000-8000-000000000205','90000000-0000-4000-8000-000000000108','Removed from this supporter group.',null)$$,
  'the group owner can ban the attendee through the existing controlled transition'
);
set local "request.jwt.claim.sub" = '90000000-0000-4000-8000-000000000108';
select throws_ok(
  $$select * from public.get_private_event_location('90000000-0000-4000-8000-000000000405',null)$$,
  'P0001', 'LOCATION_NOT_AUTHORIZED', 'a group ban immediately revokes protected-location access'
);
set local "request.jwt.claim.sub" = '90000000-0000-4000-8000-000000000101';
select is(
  (
    select count(*)
    from public.list_approved_event_attendees(
      '90000000-0000-4000-8000-000000000405',
      20,
      0
    )
    where profile_handle = 'b10_user_108'
  ),
  0::bigint,
  'the safe attendee list omits a group-banned approved row'
);

reset role;
update public.events
set
  starts_at = statement_timestamp() - interval '30 minutes',
  ends_at = statement_timestamp() + interval '2 hours'
where id = '90000000-0000-4000-8000-000000000402';

set local role authenticated;
set local "request.jwt.claim.sub" = '90000000-0000-4000-8000-000000000101';
select is(
  public.cancel_event(
    '90000000-0000-4000-8000-000000000402',
    'The host can no longer hold this event.',
    null
  ),
  true,
  'the host can cancel an in-progress event with a reason'
);

reset role;
select is(
  (
    select count(*) from public.event_invitations
    where event_id = '90000000-0000-4000-8000-000000000402'
  ),
  1::bigint,
  'cancellation retains invitation history'
);
select is(
  (
    select count(*) from public.event_attendance
    where event_id = '90000000-0000-4000-8000-000000000402'
  ),
  1::bigint,
  'cancellation retains attendance history'
);
select ok(
  not exists (
    select 1 from public.security_audit_events
    where action = 'event.private_location.read'
      and metadata::text like '%Protected Home%'
  ),
  'private-location audits never contain the address'
);
select ok(
  exists (
    select 1 from public.security_audit_events
    where action = 'event.private_location.read'
      and resource_id = '90000000-0000-4000-8000-000000000401'
  ),
  'every successful private-location read writes an audit record'
);

set local role authenticated;
set local "request.jwt.claim.sub" = '90000000-0000-4000-8000-000000000104';
select throws_ok(
  $$select * from public.get_private_event_location('90000000-0000-4000-8000-000000000402',null)$$,
  'P0001', 'LOCATION_NOT_AUTHORIZED', 'cancellation revokes a previously approved address read'
);
select throws_ok(
  $$select * from public.get_calendar_event('90000000-0000-4000-8000-000000000402',null)$$,
  'P0001', 'NOT_FOUND', 'cancellation also revokes the private calendar projection'
);

select * from finish();
rollback;
