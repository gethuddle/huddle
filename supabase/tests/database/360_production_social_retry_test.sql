begin;

create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public, pg_catalog;
select no_plan();

-- Fixture pattern shared with 250_group_direct_invites_member_removal_test.sql.
insert into auth.users (
  instance_id, id, aud, role, email, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
select '00000000-0000-0000-0000-000000000000', fixture.id,
  'authenticated', 'authenticated', fixture.email, statement_timestamp(),
  '{}'::jsonb, '{}'::jsonb, statement_timestamp(), statement_timestamp()
from (values
  ('fd360000-0000-4000-8000-000000000101'::uuid, 'retry-owner@example.test'),
  ('fd360000-0000-4000-8000-000000000102'::uuid, 'retry-member@example.test'),
  ('fd360000-0000-4000-8000-000000000103'::uuid, 'retry-other@example.test'),
  ('fd360000-0000-4000-8000-000000000104'::uuid, 'retry-recipient@example.test')
) as fixture(id, email);

update public.profiles
set handle = 'retry_' || right(id::text, 3),
  display_name = 'Retry Fan ' || right(id::text, 3),
  adult_attested_at = statement_timestamp(), rules_version = 1,
  rules_accepted_at = statement_timestamp(),
  profile_completed_at = statement_timestamp(), fan_enabled_at = statement_timestamp()
where id::text like 'fd360000-%';

-- Establish real requests and declines, then age only the fixture audit timestamps
-- to test the existing cooldown without a wall-clock sleep.
set local role authenticated;
set local "request.jwt.claim.sub" = 'fd360000-0000-4000-8000-000000000101';
select public.request_friendship_by_handle('retry_102');
set local "request.jwt.claim.sub" = 'fd360000-0000-4000-8000-000000000102';
select public.respond_to_friendship((select id from public.friendships), 'decline');
set local "request.jwt.claim.sub" = 'fd360000-0000-4000-8000-000000000103';
select public.request_friendship_by_handle('retry_104');
set local "request.jwt.claim.sub" = 'fd360000-0000-4000-8000-000000000104';
select public.respond_to_friendship((select id from public.friendships), 'decline');
reset role;
update public.security_audit_events
set created_at = statement_timestamp() - interval '1 minute'
where actor_id::text like 'fd360000-%';
create temporary table retry_original_pairs as
select id, user_low_id, user_high_id, created_at from public.friendships
where user_low_id::text like 'fd360000-%';

set local role authenticated;
set local "request.jwt.claim.sub" = 'fd360000-0000-4000-8000-000000000101';
select lives_ok(
  $$select public.request_friendship_by_handle('retry_102', 'fd360000-0000-4000-8000-000000000301')$$,
  'F01 original requester can retry a declined pair after cooldown'
);
set local "request.jwt.claim.sub" = 'fd360000-0000-4000-8000-000000000104';
select lives_ok(
  $$select public.request_friendship_by_handle('retry_103', 'fd360000-0000-4000-8000-000000000302')$$,
  'F01 former recipient can retry a declined pair in the opposite direction'
);
reset role;
select results_eq(
  $$select requested_by, status::text, responded_at from public.friendships
    where user_low_id::text like 'fd360000-%' order by user_low_id$$,
  $$values
    ('fd360000-0000-4000-8000-000000000101'::uuid, 'pending'::text, null::timestamptz),
    ('fd360000-0000-4000-8000-000000000104'::uuid, 'pending'::text, null::timestamptz)$$,
  'retries reset the response and set the current requester in both directions'
);
select is((select count(*) from public.friendships where user_low_id::text like 'fd360000-%'),
  2::bigint, 'retry retains exactly one row per canonical pair');
select is((select count(*) from public.friendships f join retry_original_pairs old
  on f.id = old.id and f.created_at = old.created_at),
  2::bigint, 'retry preserves original pair identities and creation history');
select is((select count(*) from public.security_audit_events
  where actor_id::text like 'fd360000-%' and action = 'friendship.respond'),
  2::bigint, 'original decline audit history remains');
select is((select count(*) from public.security_audit_events
  where request_id in ('fd360000-0000-4000-8000-000000000301', 'fd360000-0000-4000-8000-000000000302')
  and action = 'friendship.request' and outcome = 'succeeded'),
  2::bigint, 'each successful retry writes fresh request audit evidence');

set local role authenticated;
set local "request.jwt.claim.sub" = 'fd360000-0000-4000-8000-000000000101';
select throws_ok($$select public.request_friendship_by_handle('retry_102')$$,
  'P0001', 'FRIENDSHIP_EXISTS', 'pending requests remain duplicates');
set local "request.jwt.claim.sub" = 'fd360000-0000-4000-8000-000000000102';
select throws_ok($$select public.request_friendship_by_handle('retry_101')$$,
  'P0001', 'FRIENDSHIP_EXISTS', 'pending requests also reject the opposite direction');
select lives_ok($$select public.respond_to_friendship((select id from public.friendships), 'accept')$$,
  'the new pending request can be accepted only by its recipient');
select throws_ok($$select public.request_friendship_by_handle('retry_101')$$,
  'P0001', 'FRIENDSHIP_EXISTS', 'accepted friendships cannot be recycled');
set local "request.jwt.claim.sub" = 'fd360000-0000-4000-8000-000000000104';
select throws_ok($$select public.respond_to_friendship((select id from public.friendships), 'accept')$$,
  'P0001', 'NOT_ALLOWED', 'the reversed requester cannot accept their own retry');
set local "request.jwt.claim.sub" = 'fd360000-0000-4000-8000-000000000103';
select lives_ok($$select public.respond_to_friendship((select id from public.friendships), 'decline')$$,
  'the reversed recipient can decline the new request');
set local "request.jwt.claim.sub" = 'fd360000-0000-4000-8000-000000000104';
select throws_ok($$select public.request_friendship_by_handle('retry_103')$$,
  'P0001', 'RATE_LIMITED', 'retrying a newly declined request still observes the actor cooldown');
reset role;
-- Retain a declined pair beside a block to exercise the guard on the retry path.
insert into public.user_blocks (blocker_id, blocked_id)
values ('fd360000-0000-4000-8000-000000000103', 'fd360000-0000-4000-8000-000000000104');
set local role authenticated;
set local "request.jwt.claim.sub" = 'fd360000-0000-4000-8000-000000000104';
select throws_ok($$select public.request_friendship_by_handle('retry_103')$$,
  'P0001', 'BLOCKED_RELATIONSHIP', 'an incoming block prevents recycling a declined pair');
set local "request.jwt.claim.sub" = 'fd360000-0000-4000-8000-000000000103';
select throws_ok($$select public.request_friendship_by_handle('retry_104')$$,
  'P0001', 'BLOCKED_RELATIONSHIP', 'an outgoing block prevents recycling a declined pair');
reset role;

insert into public.groups (id, slug, name, owner_id, visibility, lifecycle, description, activated_at)
values ('fd360000-0000-4000-8000-000000000201', 'social-retry-group', 'Social Retry Group',
  'fd360000-0000-4000-8000-000000000101', 'unlisted', 'active',
  'A private group for explicit unban recovery tests.', statement_timestamp());
insert into public.group_memberships (group_id, user_id, role, status)
values
  ('fd360000-0000-4000-8000-000000000201', 'fd360000-0000-4000-8000-000000000101', 'owner', 'active'),
  ('fd360000-0000-4000-8000-000000000201', 'fd360000-0000-4000-8000-000000000102', 'member', 'active'),
  ('fd360000-0000-4000-8000-000000000201', 'fd360000-0000-4000-8000-000000000103', 'member', 'active');

-- A real protected home-event fixture makes the no-restored-location assertion meaningful.
insert into public.competitions (id, sport_id, provider, provider_external_id, code, name, country_name, last_synced_at)
values ('fd360000-0000-4000-8000-000000000211', '00000000-0000-4000-8000-000000000020',
  'social-retry-test', 'competition', 'RETRY', 'Retry League', 'England', statement_timestamp());
insert into public.teams (id, sport_id, provider, provider_external_id, name, short_name, tla, country_name, last_synced_at)
values
  ('fd360000-0000-4000-8000-000000000212', '00000000-0000-4000-8000-000000000020',
    'social-retry-test', 'home', 'Retry Home', 'Retry Home', 'RTH', 'England', statement_timestamp()),
  ('fd360000-0000-4000-8000-000000000213', '00000000-0000-4000-8000-000000000020',
    'social-retry-test', 'away', 'Retry Away', 'Retry Away', 'RTA', 'England', statement_timestamp());
insert into public.matches (id, provider, provider_external_id, competition_id, home_team_id, away_team_id,
  starts_at, status, matchday, season_label, last_synced_at)
values ('fd360000-0000-4000-8000-000000000214', 'social-retry-test', 'match',
  'fd360000-0000-4000-8000-000000000211', 'fd360000-0000-4000-8000-000000000212',
  'fd360000-0000-4000-8000-000000000213', statement_timestamp() + interval '7 days', 'timed', 1, '2026', statement_timestamp());
insert into public.events (id, created_by, host_user_id, match_id, title, description,
  expected_activity, cost_description, event_rules, commercial_affiliation,
  host_presence_confirmed_at, starts_at, ends_at, place_kind, audience, audience_group_id,
  organizing_group_id, capacity, requires_approval, status, published_at)
values ('fd360000-0000-4000-8000-000000000221', 'fd360000-0000-4000-8000-000000000101',
  'fd360000-0000-4000-8000-000000000101', 'fd360000-0000-4000-8000-000000000214',
  'Retry Group Home', 'A protected group home event for recovery tests.',
  'Watch the full match', 'Free', 'Respect every attendee.', 'None', statement_timestamp(),
  statement_timestamp() + interval '7 days', statement_timestamp() + interval '7 days 3 hours',
  'home', 'group', 'fd360000-0000-4000-8000-000000000201', 'fd360000-0000-4000-8000-000000000201',
  3, true, 'published', statement_timestamp());
insert into public.event_private_locations (event_id, address_text, directions, location)
values ('fd360000-0000-4000-8000-000000000221', '105 Test Home, Haifa', 'Test fixture.',
  extensions.st_setsrid(extensions.st_makepoint(34.996, 32.810), 4326)::extensions.geography);
insert into public.event_attendance (event_id, user_id, status, source, reviewed_by, reviewed_at)
values ('fd360000-0000-4000-8000-000000000221', 'fd360000-0000-4000-8000-000000000102', 'approved', 'self_request',
  'fd360000-0000-4000-8000-000000000101', statement_timestamp());

set local role authenticated;
set local "request.jwt.claim.sub" = 'fd360000-0000-4000-8000-000000000102';
select lives_ok($$select * from public.get_private_event_location('fd360000-0000-4000-8000-000000000221', null)$$,
  'the approved active member initially has protected location access');
set local "request.jwt.claim.sub" = 'fd360000-0000-4000-8000-000000000101';
select * from public.ban_group_member('fd360000-0000-4000-8000-000000000201', 'fd360000-0000-4000-8000-000000000102', 'Test ban recovery.');
select * from public.ban_group_member('fd360000-0000-4000-8000-000000000201', 'fd360000-0000-4000-8000-000000000103', 'Test active ban.');
select throws_ok($$select * from public.create_group_invitation('fd360000-0000-4000-8000-000000000201', 'fd360000-0000-4000-8000-000000000102')$$,
  'P0001', 'NOT_ALLOWED', 'an active ban prevents a new invitation');
select public.unban_group_member('fd360000-0000-4000-8000-000000000201', 'fd360000-0000-4000-8000-000000000102');
reset role;
select is((select status::text from public.group_memberships
  where group_id = 'fd360000-0000-4000-8000-000000000201' and user_id = 'fd360000-0000-4000-8000-000000000102'),
  'banned', 'unban alone preserves the historical membership state');
select ok(not private.actor_is_active_group_member('fd360000-0000-4000-8000-000000000201', 'fd360000-0000-4000-8000-000000000102'),
  'unban alone grants no active group membership');
select is((select count(*) from public.group_bans where user_id = 'fd360000-0000-4000-8000-000000000102'
  and revoked_at is not null and revoked_by = 'fd360000-0000-4000-8000-000000000101'),
  1::bigint, 'explicit unban retains auditable revocation evidence');
set local role authenticated;
set local "request.jwt.claim.sub" = 'fd360000-0000-4000-8000-000000000102';
select throws_ok($$select * from public.get_private_event_location('fd360000-0000-4000-8000-000000000221', null)$$,
  'P0001', 'LOCATION_NOT_AUTHORIZED', 'unban alone never restores private-location access');
select is((select count(*) from public.groups where id = 'fd360000-0000-4000-8000-000000000201'),
  0::bigint, 'unban alone never restores private group visibility');
set local "request.jwt.claim.sub" = 'fd360000-0000-4000-8000-000000000101';
select lives_ok($$select * from public.create_group_invitation('fd360000-0000-4000-8000-000000000201',
  'fd360000-0000-4000-8000-000000000102', 'fd360000-0000-4000-8000-000000000303')$$,
  'F04 an explicitly unbanned former member can receive a fresh invitation');
select throws_ok($$select * from public.create_group_invitation('fd360000-0000-4000-8000-000000000201', 'fd360000-0000-4000-8000-000000000102')$$,
  'P0001', 'INVALID_TRANSITION', 'only one pending invitation is allowed after unban');
reset role;
select is((select status::text from public.group_memberships
  where group_id = 'fd360000-0000-4000-8000-000000000201' and user_id = 'fd360000-0000-4000-8000-000000000102'),
  'banned', 'sending the invitation does not reactivate membership');
set local role authenticated;
set local "request.jwt.claim.sub" = 'fd360000-0000-4000-8000-000000000102';
select throws_ok($$select * from public.get_private_event_location('fd360000-0000-4000-8000-000000000221', null)$$,
  'P0001', 'LOCATION_NOT_AUTHORIZED', 'a pending invitation still grants no protected location access');
select lives_ok($$select * from public.respond_group_invitation(
  (select invitation_id from public.list_my_group_invitations() where group_id = 'fd360000-0000-4000-8000-000000000201'),
  'accept', 'fd360000-0000-4000-8000-000000000304')$$,
  'F04 the unbanned recipient can explicitly accept their new invitation');
reset role;
select is((select status::text from public.group_memberships
  where group_id = 'fd360000-0000-4000-8000-000000000201' and user_id = 'fd360000-0000-4000-8000-000000000102'),
  'active', 'explicit invitation acceptance restores membership');
select is((select count(*) from public.group_memberships where group_id = 'fd360000-0000-4000-8000-000000000201'
  and user_id = 'fd360000-0000-4000-8000-000000000102'), 1::bigint, 'recovery reuses one membership history row');
select is((select count(*) from public.event_attendance where event_id = 'fd360000-0000-4000-8000-000000000221'
  and user_id = 'fd360000-0000-4000-8000-000000000102'), 1::bigint, 'ban and recovery retain attendance history');
select is((select count(*) from public.security_audit_events
  where request_id in ('fd360000-0000-4000-8000-000000000303', 'fd360000-0000-4000-8000-000000000304')
  and action in ('group.invitation.create', 'group.invitation.accepted') and outcome = 'succeeded'),
  2::bigint, 'invitation creation and acceptance each retain fresh audit evidence');

-- Isolate the acceptance regression from creation: a historical pending invite
-- must still respect the current ban, and becomes acceptable only after unban.
insert into public.group_invitations (id, group_id, invitee_id, invited_by)
values ('fd360000-0000-4000-8000-000000000231', 'fd360000-0000-4000-8000-000000000201',
  'fd360000-0000-4000-8000-000000000103', 'fd360000-0000-4000-8000-000000000101');
set local role authenticated;
set local "request.jwt.claim.sub" = 'fd360000-0000-4000-8000-000000000103';
select throws_ok($$select * from public.respond_group_invitation('fd360000-0000-4000-8000-000000000231', 'accept')$$,
  'P0001', 'NOT_ALLOWED', 'an existing invitation cannot bypass an active ban at acceptance');
set local "request.jwt.claim.sub" = 'fd360000-0000-4000-8000-000000000101';
select public.unban_group_member('fd360000-0000-4000-8000-000000000201', 'fd360000-0000-4000-8000-000000000103');
set local "request.jwt.claim.sub" = 'fd360000-0000-4000-8000-000000000103';
select lives_ok($$select * from public.respond_group_invitation('fd360000-0000-4000-8000-000000000231', 'accept')$$,
  'F04 acceptance independently permits historical banned membership after explicit unban');
reset role;

select * from finish();
rollback;
