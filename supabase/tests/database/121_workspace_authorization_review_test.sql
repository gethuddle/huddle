begin;

create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public, pg_catalog;

select no_plan();

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
    ('c2100000-0000-4000-8000-000000000101'::uuid, 'review-venue-owner@example.com'),
    ('c2100000-0000-4000-8000-000000000102'::uuid, 'review-venue-admin@example.com'),
    ('c2100000-0000-4000-8000-000000000103'::uuid, 'review-suspended-admin@example.com'),
    ('c2100000-0000-4000-8000-000000000104'::uuid, 'review-target-fan@example.com'),
    ('c2100000-0000-4000-8000-000000000105'::uuid, 'review-suspended-fan@example.com'),
    ('c2100000-0000-4000-8000-000000000106'::uuid, 'review-restricted-fan@example.com'),
    ('c2100000-0000-4000-8000-000000000107'::uuid, 'review-stale-rules-fan@example.com'),
    ('c2100000-0000-4000-8000-000000000108'::uuid, 'review-ineligible@example.com'),
    ('c2100000-0000-4000-8000-000000000109'::uuid, 'review-null-attestation@example.com')
) as fixture(id, email);

update public.profiles
set
  adult_attested_at = statement_timestamp(),
  rules_version = 1,
  rules_accepted_at = statement_timestamp()
where id between
  'c2100000-0000-4000-8000-000000000101' and
  'c2100000-0000-4000-8000-000000000107'
or id = 'c2100000-0000-4000-8000-000000000109';

update public.profiles
set
  handle = case id
    when 'c2100000-0000-4000-8000-000000000103' then 'review_suspended_admin'
    when 'c2100000-0000-4000-8000-000000000104' then 'review_target_fan'
    when 'c2100000-0000-4000-8000-000000000105' then 'review_suspended_fan'
    when 'c2100000-0000-4000-8000-000000000106' then 'review_restricted_fan'
    else 'review_stale_fan'
  end,
  display_name = 'Review Fan ' || right(id::text, 3),
  profile_completed_at = statement_timestamp(),
  fan_enabled_at = statement_timestamp()
where id between
  'c2100000-0000-4000-8000-000000000103' and
  'c2100000-0000-4000-8000-000000000107';

update public.profiles
set suspended_at = statement_timestamp()
where id in (
  'c2100000-0000-4000-8000-000000000103',
  'c2100000-0000-4000-8000-000000000105'
);

insert into public.competitions (
  id, sport_id, provider, provider_external_id, code, name, country_name, last_synced_at
)
values (
  'c2100000-0000-4000-8000-000000000201',
  '00000000-0000-4000-8000-000000000020',
  'workspace-review', 'competition', 'WR1', 'Workspace Review League',
  'England', statement_timestamp()
);

insert into public.teams (
  id, sport_id, provider, provider_external_id, name, short_name, tla,
  country_name, last_synced_at
)
values
  (
    'c2100000-0000-4000-8000-000000000202',
    '00000000-0000-4000-8000-000000000020',
    'workspace-review', 'home-team', 'Workspace Review Home', 'Review Home', 'WRH',
    'England', statement_timestamp()
  ),
  (
    'c2100000-0000-4000-8000-000000000203',
    '00000000-0000-4000-8000-000000000020',
    'workspace-review', 'away-team', 'Workspace Review Away', 'Review Away', 'WRA',
    'England', statement_timestamp()
  );

insert into public.matches (
  id, provider, provider_external_id, competition_id, home_team_id,
  away_team_id, starts_at, status, matchday, season_label, last_synced_at
)
values (
  'c2100000-0000-4000-8000-000000000204',
  'workspace-review', 'match',
  'c2100000-0000-4000-8000-000000000201',
  'c2100000-0000-4000-8000-000000000202',
  'c2100000-0000-4000-8000-000000000203',
  statement_timestamp() + interval '14 days', 'timed', 1, '2026',
  statement_timestamp()
);

insert into public.venues (
  id, owner_id, slug, name, address_text, location,
  description, screen_count, stated_capacity
)
values (
  'c2100000-0000-4000-8000-000000000301',
  'c2100000-0000-4000-8000-000000000101',
  'workspace-review-venue', 'Workspace Review Venue',
  '21 Review Street, Haifa',
  extensions.st_setsrid(extensions.st_makepoint(34.999, 32.813), 4326)::extensions.geography,
  'A venue for the workspace authorization review regression matrix.',
  4, 80
);

-- These exact synthetic venues exercise public or publishing behavior.
update private.venue_billing_entitlements set status='active',interval='month',interval_count=1,
  polar_customer_id='fixture-customer',polar_subscription_id='fixture-'||venue_id::text,
  polar_product_id='fixture-product',polar_product_price_id='fixture-price',amount=1500,currency='ils',
  paid_through_at=statement_timestamp()+interval '365 days',first_activated_at=statement_timestamp()
where venue_id in ('c2100000-0000-4000-8000-000000000301');

insert into public.venue_memberships (venue_id, user_id, role, status)
values
  (
    'c2100000-0000-4000-8000-000000000301',
    'c2100000-0000-4000-8000-000000000102',
    'admin', 'active'
  ),
  (
    'c2100000-0000-4000-8000-000000000301',
    'c2100000-0000-4000-8000-000000000103',
    'admin', 'active'
  );

insert into public.events (
  id, created_by, host_venue_id, match_id, title, description,
  expected_activity, cost_description, event_rules, commercial_affiliation,
  host_presence_confirmed_at, starts_at, ends_at, place_kind,
  venue_id, audience, capacity, requires_approval, status, published_at
)
values
  (
    'c2100000-0000-4000-8000-000000000501',
    'c2100000-0000-4000-8000-000000000101',
    'c2100000-0000-4000-8000-000000000301',
    'c2100000-0000-4000-8000-000000000204',
    'Venue owner managed fixture',
    'A commercial event fixture managed by the venue-only owner.',
    'Watch the full match together', 'Food and drinks available',
    'Respect staff and every guest.', 'Hosted by Workspace Review Venue',
    statement_timestamp(), statement_timestamp() + interval '14 days',
    statement_timestamp() + interval '14 days 3 hours',
    'venue', 'c2100000-0000-4000-8000-000000000301',
    'public', 40, false, 'published', statement_timestamp()
  ),
  (
    'c2100000-0000-4000-8000-000000000502',
    'c2100000-0000-4000-8000-000000000102',
    'c2100000-0000-4000-8000-000000000301',
    'c2100000-0000-4000-8000-000000000204',
    'Venue admin managed fixture',
    'A commercial event fixture managed by the active venue administrator.',
    'Watch the full match together', 'Food and drinks available',
    'Respect staff and every guest.', 'Hosted by Workspace Review Venue',
    statement_timestamp(), statement_timestamp() + interval '15 days',
    statement_timestamp() + interval '15 days 3 hours',
    'venue', 'c2100000-0000-4000-8000-000000000301',
    'public', 40, true, 'published', statement_timestamp()
  );

set local role authenticated;
set local "request.jwt.claim.sub" = 'c2100000-0000-4000-8000-000000000109';

select throws_ok(
  $$select * from public.activate_fan_workspace('review_null_fan','Review Null Fan','',null,1,null)$$,
  'P0001', 'ADULT_ATTESTATION_REQUIRED',
  'raw Fan activation rejects a NULL adult attestation'
);

set local "request.jwt.claim.sub" = 'c2100000-0000-4000-8000-000000000101';

select lives_ok(
  $$select public.block_user('review_target_fan',null)$$,
  'a venue-only common-eligible account can create a private block'
);
select lives_ok(
  $$select public.unblock_user('review_target_fan',null)$$,
  'a venue-only common-eligible account can remove its own private block'
);

select lives_ok(
  $$select * from public.create_or_update_event(null,'c2100000-0000-4000-8000-000000000301',null,'c2100000-0000-4000-8000-000000000204','Venue-only owner event','A commercial event created by a venue-only owner account.','Watch the full match together','Food and drinks available','Respect staff and every guest.','Hosted by Workspace Review Venue',true,statement_timestamp()+interval '14 days',statement_timestamp()+interval '14 days 3 hours','venue','c2100000-0000-4000-8000-000000000301',null,null,null,null,'public',null,null,40,false,null,null,null,null,'publish',null)$$,
  'a venue-only owner creates a published commercial event through the raw RPC'
);

set local "request.jwt.claim.sub" = 'c2100000-0000-4000-8000-000000000102';

select lives_ok(
  $$select * from public.create_or_update_event(null,'c2100000-0000-4000-8000-000000000301',null,'c2100000-0000-4000-8000-000000000204','Venue admin event','A commercial event created by an active venue administrator.','Watch the full match together','Food and drinks available','Respect staff and every guest.','Hosted by Workspace Review Venue',true,statement_timestamp()+interval '15 days',statement_timestamp()+interval '15 days 3 hours','venue','c2100000-0000-4000-8000-000000000301',null,null,null,null,'public',null,null,40,true,null,null,null,null,'publish',null)$$,
  'an active venue admin creates a published commercial event through the raw RPC'
);

select lives_ok(
  $$select * from public.create_or_update_event(
      'c2100000-0000-4000-8000-000000000502',
      'c2100000-0000-4000-8000-000000000301',
      null,
      'c2100000-0000-4000-8000-000000000204',
      'Venue admin event updated',
      'A commercial event updated by an active venue administrator.',
      'Watch the full match together',
      'Food and drinks available',
      'Respect staff and every guest.',
      'Hosted by Workspace Review Venue',
      true,
      statement_timestamp() + interval '15 days',
      statement_timestamp() + interval '15 days 3 hours',
      'venue',
      'c2100000-0000-4000-8000-000000000301',
      null, null, null, null,
      'public', null, null, 40, true,
      null, null, null, null,
      'publish', null
    )$$,
  'an active venue admin updates the concrete commercial event'
);

reset role;

insert into public.event_attendance (id, event_id, user_id, status, source)
values
  (
    'c2100000-0000-4000-8000-000000000601',
    'c2100000-0000-4000-8000-000000000502',
    'c2100000-0000-4000-8000-000000000104',
    'requested', 'self_request'
  ),
  (
    'c2100000-0000-4000-8000-000000000602',
    'c2100000-0000-4000-8000-000000000501',
    'c2100000-0000-4000-8000-000000000106',
    'approved', 'direct_invite'
  ),
  (
    'c2100000-0000-4000-8000-000000000603',
    'c2100000-0000-4000-8000-000000000501',
    'c2100000-0000-4000-8000-000000000107',
    'approved', 'direct_invite'
  ),
  (
    'c2100000-0000-4000-8000-000000000604',
    'c2100000-0000-4000-8000-000000000501',
    'c2100000-0000-4000-8000-000000000109',
    'approved', 'direct_invite'
  );

insert into public.event_invitations (id, event_id, invitee_id, invited_by)
values (
  'c2100000-0000-4000-8000-000000000701',
  'c2100000-0000-4000-8000-000000000501',
  'c2100000-0000-4000-8000-000000000105',
  'c2100000-0000-4000-8000-000000000101'
);

insert into public.groups (
  id, slug, name, owner_id, visibility, lifecycle, description, activated_at
)
values (
  'c2100000-0000-4000-8000-000000000401',
  'workspace-review-group', 'Workspace Review Group',
  'c2100000-0000-4000-8000-000000000104',
  'unlisted', 'active', 'A group for safe exit authorization regression tests.',
  statement_timestamp()
);

insert into public.group_memberships (group_id, user_id, role, status)
values
  (
    'c2100000-0000-4000-8000-000000000401',
    'c2100000-0000-4000-8000-000000000104',
    'owner', 'active'
  ),
  (
    'c2100000-0000-4000-8000-000000000401',
    'c2100000-0000-4000-8000-000000000105',
    'member', 'active'
  );

set local role authenticated;
set local "request.jwt.claim.sub" = 'c2100000-0000-4000-8000-000000000102';

select lives_ok(
  $$select * from public.list_managed_venue_events('c2100000-0000-4000-8000-000000000301',20)$$,
  'an active venue admin lists the concrete venue managed events'
);
select is(
  (
    select count(*)
    from public.list_managed_venue_events('c2100000-0000-4000-8000-000000000301',20)
    where event_id = 'c2100000-0000-4000-8000-000000000502'
  ),
  1::bigint,
  'an active non-Fan admin sees its concrete Venue event in the Venue workspace'
);
select is(
  (
    select viewer_is_owner
    from public.get_venue_by_slug('workspace-review-venue')
  ),
  true,
  'the public Venue projection marks an active admin as a current manager'
);
select lives_ok(
  $$select * from public.list_event_attendance('c2100000-0000-4000-8000-000000000502',20,0)$$,
  'an active venue admin reads the concrete event attendance queue'
);
select lives_ok(
  $$select * from public.review_attendance('c2100000-0000-4000-8000-000000000601','approve',null)$$,
  'an active venue admin manages attendance for the concrete commercial event'
);

reset role;
select is(
  (
    select status::text from public.event_attendance
    where event_id = 'c2100000-0000-4000-8000-000000000502'
      and user_id = 'c2100000-0000-4000-8000-000000000104'
  ),
  'approved',
  'venue admin attendance management persists the approved transition'
);

update public.venue_memberships
set status = 'revoked', revoked_at = statement_timestamp()
where venue_id = 'c2100000-0000-4000-8000-000000000301'
  and user_id = 'c2100000-0000-4000-8000-000000000102';

set local role authenticated;
set local "request.jwt.claim.sub" = 'c2100000-0000-4000-8000-000000000102';
select throws_ok(
  $$select * from public.list_managed_venue_events('c2100000-0000-4000-8000-000000000301',20)$$,
  'P0001', 'NOT_FOUND',
  'a revoked non-Fan admin cannot retain Venue workspace access through created_by'
);

reset role;
update public.profiles
set
  handle = 'review_revoked_admin_fan',
  display_name = 'Review Revoked Admin Fan',
  profile_completed_at = statement_timestamp(),
  fan_enabled_at = statement_timestamp()
where id = 'c2100000-0000-4000-8000-000000000102';

set local role authenticated;
set local "request.jwt.claim.sub" = 'c2100000-0000-4000-8000-000000000102';
select is(
  (
    select count(*)
    from public.list_my_events('upcoming', 20, 0)
    where event_id = 'c2100000-0000-4000-8000-000000000502'
  ),
  0::bigint,
  'a revoked Fan admin cannot retain commercial event access through created_by alone'
);

reset role;
insert into public.event_invitations (id, event_id, invitee_id, invited_by)
values (
  'c2100000-0000-4000-8000-000000000702',
  'c2100000-0000-4000-8000-000000000502',
  'c2100000-0000-4000-8000-000000000102',
  'c2100000-0000-4000-8000-000000000101'
);

set local role authenticated;
set local "request.jwt.claim.sub" = 'c2100000-0000-4000-8000-000000000102';
select is(
  (
    select count(*)
    from public.list_attention_items(20)
    where kind = 'event_invitation'
      and resource_id = 'c2100000-0000-4000-8000-000000000502'
  ),
  1::bigint,
  'a revoked Fan admin sees the commercial event only as a separate current invitation'
);
select is(
  (
    select viewer_is_owner
    from public.get_venue_by_slug('workspace-review-venue')
  ),
  false,
  'a separate Fan invitation never restores revoked Venue management authority'
);

set local role authenticated;
set local "request.jwt.claim.sub" = 'c2100000-0000-4000-8000-000000000103';

select throws_ok(
  $$select * from public.create_or_update_event(null,'c2100000-0000-4000-8000-000000000301',null,'c2100000-0000-4000-8000-000000000204','Suspended venue event','A commercial event denied to a suspended venue administrator.','Watch the full match together','Food and drinks available','Respect staff and every guest.','Hosted by Workspace Review Venue',true,statement_timestamp()+interval '16 days',statement_timestamp()+interval '16 days 3 hours','venue','c2100000-0000-4000-8000-000000000301',null,null,null,null,'public',null,null,40,false,null,null,null,null,'publish',null)$$,
  'P0001', 'ACCOUNT_SUSPENDED',
  'a suspended venue member cannot create a commercial event'
);

set local "request.jwt.claim.sub" = 'c2100000-0000-4000-8000-000000000105';

select lives_ok(
  $$select * from public.respond_to_event_invitation('c2100000-0000-4000-8000-000000000701','decline',null)$$,
  'a suspended verified profile can safely decline an invitation'
);
select lives_ok(
  $$select * from public.leave_group('c2100000-0000-4000-8000-000000000401',null)$$,
  'a suspended verified profile can safely leave a group'
);

reset role;
select is(
  (
    select status::text from public.event_invitations
    where event_id = 'c2100000-0000-4000-8000-000000000501'
      and invitee_id = 'c2100000-0000-4000-8000-000000000105'
  ),
  'declined',
  'safe invitation decline persists for a suspended verified profile'
);
select is(
  (
    select status::text from public.group_memberships
    where group_id = 'c2100000-0000-4000-8000-000000000401'
      and user_id = 'c2100000-0000-4000-8000-000000000105'
  ),
  'left',
  'safe group exit persists for a suspended verified profile'
);

update public.profiles
set
  community_restricted_at = statement_timestamp(),
  community_restricted_until = statement_timestamp() + interval '7 days'
where id = 'c2100000-0000-4000-8000-000000000106';
update public.profiles
set rules_version = 2
where id = 'c2100000-0000-4000-8000-000000000107';

set local role authenticated;
set local "request.jwt.claim.sub" = 'c2100000-0000-4000-8000-000000000106';
select lives_ok(
  $$select public.leave_event('c2100000-0000-4000-8000-000000000602',null)$$,
  'a restricted verified profile can safely leave an event'
);

set local "request.jwt.claim.sub" = 'c2100000-0000-4000-8000-000000000107';
select lives_ok(
  $$select public.leave_event('c2100000-0000-4000-8000-000000000603',null)$$,
  'a verified profile with stale rules can safely leave an event'
);

reset role;
select is(
  (
    select status::text from public.event_attendance
    where event_id = 'c2100000-0000-4000-8000-000000000501'
      and user_id = 'c2100000-0000-4000-8000-000000000106'
  ),
  'left',
  'safe event exit persists for a restricted verified profile'
);
select is(
  (
    select status::text from public.event_attendance
    where event_id = 'c2100000-0000-4000-8000-000000000501'
      and user_id = 'c2100000-0000-4000-8000-000000000107'
  ),
  'left',
  'safe event exit persists after current-rules eligibility loss'
);

set local role authenticated;
set local "request.jwt.claim.sub" = 'c2100000-0000-4000-8000-000000000109';
select throws_ok(
  $$select * from public.list_approved_event_attendees('c2100000-0000-4000-8000-000000000501',20,0)$$,
  'P0001', 'PROFILE_INCOMPLETE',
  'a venue-event attendee still requires Fan eligibility for attendee-facing reads'
);

set local role authenticated;
set local "request.jwt.claim.sub" = 'c2100000-0000-4000-8000-000000000108';
select throws_ok(
  $$select public.block_user('review_target_fan',null)$$,
  'P0001', 'ADULT_ATTESTATION_REQUIRED',
  'an account without common eligibility cannot create a block'
);

reset role;

select throws_ok(
  $$update public.venues set owner_id = 'c2100000-0000-4000-8000-000000000104' where id = 'c2100000-0000-4000-8000-000000000301'$$,
  '23514', 'VENUE_OWNER_CHANGE_NOT_ALLOWED',
  'direct canonical venue owner changes are rejected until atomic transfer exists'
);
select is(
  (
    select owner_id
    from public.venues
    where id = 'c2100000-0000-4000-8000-000000000301'
  ),
  'c2100000-0000-4000-8000-000000000101'::uuid,
  'a rejected canonical owner change leaves venues.owner_id unchanged'
);
select is(
  (
    select user_id
    from public.venue_memberships
    where venue_id = 'c2100000-0000-4000-8000-000000000301'
      and role = 'owner'
      and status = 'active'
  ),
  'c2100000-0000-4000-8000-000000000101'::uuid,
  'a rejected canonical owner change leaves the active owner membership unchanged'
);

select * from finish();
rollback;
