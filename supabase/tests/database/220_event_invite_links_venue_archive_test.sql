begin;

create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public, pg_catalog;

select no_plan();

select has_table(
  'public',
  'event_invite_tokens',
  'event invite links have a private-by-default persisted capability boundary'
);
select has_column(
  'public',
  'venues',
  'archived_at',
  'Venues can be closed without deleting retained history'
);
select has_column(
  'public',
  'venues',
  'archived_by',
  'Venue closure records its authenticated owner'
);
select has_function(
  'public',
  'create_event_invite_token',
  array['uuid', 'timestamp with time zone', 'integer', 'uuid'],
  'event managers can create a controlled invite-only link'
);
select has_function(
  'public',
  'list_event_invite_tokens',
  array['uuid'],
  'event managers can list non-secret invite-link metadata'
);
select is(
  (
    select procedure.provolatile
    from pg_catalog.pg_proc as procedure
    join pg_catalog.pg_namespace as namespace on namespace.oid = procedure.pronamespace
    where namespace.nspname = 'public'
      and procedure.proname = 'list_event_invite_tokens'
      and pg_catalog.pg_get_function_identity_arguments(procedure.oid) = 'input_event_id uuid'
  ),
  'v'::"char",
  'authenticated invite-link listing remains writable enough for the locking actor guard'
);
select has_function(
  'public',
  'revoke_event_invite_token',
  array['uuid', 'uuid'],
  'event managers can revoke an invite link'
);
select has_function(
  'public',
  'redeem_event_invite_token',
  array['text', 'uuid'],
  'signed-in Fans can exchange one controlled link for one pending invitation'
);
select has_function(
  'public',
  'archive_venue',
  array['uuid', 'text', 'uuid'],
  'Venue owners can close a workspace through one audited transaction'
);
select has_function(
  'public',
  'withdraw_group_event_submission',
  array['uuid', 'uuid'],
  'a group-event submitter can withdraw instead of attempting forbidden self-review'
);
select is(
  (
    select procedure.provolatile
    from pg_catalog.pg_proc as procedure
    join pg_catalog.pg_namespace as namespace on namespace.oid = procedure.pronamespace
    where namespace.nspname = 'public'
      and procedure.proname = 'list_group_event_submissions'
      and pg_catalog.pg_get_function_identity_arguments(procedure.oid) =
        'input_group_id uuid, input_offset integer, input_limit integer'
  ),
  'v'::"char",
  'the group-event queue remains writable enough for its locking actor guard'
);

select ok(
  has_function_privilege(
    'authenticated',
    'public.create_event_invite_token(uuid,timestamptz,integer,uuid)',
    'execute'
  )
  and not has_function_privilege(
    'anon',
    'public.create_event_invite_token(uuid,timestamptz,integer,uuid)',
    'execute'
  ),
  'only authenticated callers can reach invite-link creation'
);
select ok(
  not has_table_privilege('authenticated', 'public.event_invite_tokens', 'select')
  and not has_table_privilege('authenticated', 'public.event_invite_tokens', 'insert')
  and not has_table_privilege('authenticated', 'public.event_invite_tokens', 'update'),
  'clients cannot read or mutate invite-token rows directly'
);
select ok(
  has_function_privilege(
    'authenticated',
    'private.venue_follow_is_allowed(uuid,uuid)',
    'execute'
  )
  and not has_function_privilege(
    'anon',
    'private.venue_follow_is_allowed(uuid,uuid)',
    'execute'
  ),
  'the authenticated follow policy can execute its private predicate without exposing it anonymously'
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
    ('fa000000-0000-4000-8000-000000000101'::uuid, 'link-owner@example.test'),
    ('fa000000-0000-4000-8000-000000000102'::uuid, 'link-invitee@example.test'),
    ('fa000000-0000-4000-8000-000000000103'::uuid, 'link-outsider@example.test'),
    ('fa000000-0000-4000-8000-000000000104'::uuid, 'venue-admin@example.test')
) as fixture(id, email);

update public.profiles
set
  handle = case id
    when 'fa000000-0000-4000-8000-000000000101' then 'link_owner'
    when 'fa000000-0000-4000-8000-000000000102' then 'link_invitee'
    when 'fa000000-0000-4000-8000-000000000103' then 'link_outsider'
    else 'venue_admin'
  end,
  display_name = case id
    when 'fa000000-0000-4000-8000-000000000101' then 'Link Owner'
    when 'fa000000-0000-4000-8000-000000000102' then 'Link Invitee'
    when 'fa000000-0000-4000-8000-000000000103' then 'Link Outsider'
    else 'Venue Admin'
  end,
  city_id = (select id from public.cities where slug = 'haifa'),
  adult_attested_at = statement_timestamp(),
  rules_version = 1,
  rules_accepted_at = statement_timestamp(),
  profile_completed_at = statement_timestamp(),
  fan_enabled_at = statement_timestamp()
where id in (
  'fa000000-0000-4000-8000-000000000101',
  'fa000000-0000-4000-8000-000000000102',
  'fa000000-0000-4000-8000-000000000103',
  'fa000000-0000-4000-8000-000000000104'
);

insert into public.competitions (
  id, sport_id, provider, provider_external_id, code, name, country_name, last_synced_at
)
values (
  'fa000000-0000-4000-8000-000000000201',
  '00000000-0000-4000-8000-000000000020',
  'invite-link-test', 'competition', 'ILT', 'Invite Link League', 'England',
  statement_timestamp()
);

insert into public.teams (
  id, sport_id, provider, provider_external_id, name, short_name, tla,
  country_name, last_synced_at
)
values
  (
    'fa000000-0000-4000-8000-000000000202',
    '00000000-0000-4000-8000-000000000020',
    'invite-link-test', 'home', 'Invite Home FC', 'Invite Home', 'IHF',
    'England', statement_timestamp()
  ),
  (
    'fa000000-0000-4000-8000-000000000203',
    '00000000-0000-4000-8000-000000000020',
    'invite-link-test', 'away', 'Invite Away FC', 'Invite Away', 'IAF',
    'England', statement_timestamp()
  );

insert into public.matches (
  id, provider, provider_external_id, competition_id, home_team_id, away_team_id,
  starts_at, status, matchday, season_label, last_synced_at
)
values (
  'fa000000-0000-4000-8000-000000000204',
  'invite-link-test', 'match',
  'fa000000-0000-4000-8000-000000000201',
  'fa000000-0000-4000-8000-000000000202',
  'fa000000-0000-4000-8000-000000000203',
  statement_timestamp() + interval '8 days', 'timed', 1, '2026',
  statement_timestamp()
);

insert into public.groups (
  id, slug, name, owner_id, city_id, visibility, lifecycle, description, activated_at
)
values (
  'fa000000-0000-4000-8000-000000000205',
  'withdrawal-test-group',
  'Withdrawal Test Group',
  'fa000000-0000-4000-8000-000000000101',
  (select id from public.cities where slug = 'haifa'),
  'unlisted',
  'active',
  'A private group used to verify that creators withdraw instead of reviewing themselves.',
  statement_timestamp()
);

insert into public.group_memberships (
  group_id, user_id, role, status, reviewed_by, reviewed_at
)
values
  (
    'fa000000-0000-4000-8000-000000000205',
    'fa000000-0000-4000-8000-000000000101',
    'owner', 'active', null, null
  ),
  (
    'fa000000-0000-4000-8000-000000000205',
    'fa000000-0000-4000-8000-000000000102',
    'admin', 'active',
    'fa000000-0000-4000-8000-000000000101', statement_timestamp()
  );

insert into public.venues (
  id, owner_id, slug, name, city_id, address_text, location, description,
  stated_capacity, verification_status
)
values (
  'fa000000-0000-4000-8000-000000000301',
  'fa000000-0000-4000-8000-000000000101',
  'archive-me-venue', 'Archive Me Venue',
  (select id from public.cities where slug = 'haifa'),
  '42 Fixture Street, Haifa',
  extensions.st_setsrid(extensions.st_makepoint(35.000, 32.813), 4326)::extensions.geography,
  'A test Venue that will be closed without deleting its history.',
  50,
  'unverified'
);

insert into public.venue_memberships (venue_id, user_id, role, status)
values (
  'fa000000-0000-4000-8000-000000000301',
  'fa000000-0000-4000-8000-000000000104',
  'admin',
  'active'
);

insert into public.events (
  id, created_by, host_user_id, match_id, title, description,
  expected_activity, cost_description, event_rules, commercial_affiliation,
  host_presence_confirmed_at, starts_at, ends_at, city_id, place_kind,
  audience, capacity, requires_approval, status, published_at
)
values (
  'fa000000-0000-4000-8000-000000000401',
  'fa000000-0000-4000-8000-000000000101',
  'fa000000-0000-4000-8000-000000000101',
  'fa000000-0000-4000-8000-000000000204',
  'Private link watch',
  'A future invite-only event whose link creates an invitation only.',
  'Watch together', 'Free entry', 'Respect the host.', 'None',
  statement_timestamp(), statement_timestamp() + interval '8 days',
  statement_timestamp() + interval '8 days 3 hours',
  (select id from public.cities where slug = 'haifa'),
  'home', 'invite_only', 8, true, 'published', statement_timestamp()
);

insert into public.events (
  id, created_by, host_user_id, organizing_group_id, match_id, title, description,
  expected_activity, cost_description, event_rules, commercial_affiliation,
  host_presence_confirmed_at, starts_at, ends_at, city_id, place_kind,
  audience, capacity, requires_approval, status
)
values (
  'fa000000-0000-4000-8000-000000000403',
  'fa000000-0000-4000-8000-000000000102',
  'fa000000-0000-4000-8000-000000000102',
  'fa000000-0000-4000-8000-000000000205',
  'fa000000-0000-4000-8000-000000000204',
  'Pending group watch',
  'A group event whose submitter must not be offered self-review controls.',
  'Watch together', 'Free entry', 'Respect the group.', 'None',
  statement_timestamp(), statement_timestamp() + interval '8 days 10 minutes',
  statement_timestamp() + interval '8 days 3 hours 10 minutes',
  (select id from public.cities where slug = 'haifa'),
  'home', 'invite_only', 8, true, 'pending_group_review'
);

insert into public.events (
  id, created_by, host_venue_id, match_id, title, description,
  expected_activity, cost_description, event_rules, commercial_affiliation,
  host_presence_confirmed_at, starts_at, ends_at, city_id, place_kind, venue_id,
  audience, capacity, requires_approval, status, published_at
)
values (
  'fa000000-0000-4000-8000-000000000402',
  'fa000000-0000-4000-8000-000000000101',
  'fa000000-0000-4000-8000-000000000301',
  'fa000000-0000-4000-8000-000000000204',
  'Venue closure event',
  'A future Venue event cancelled by the retained closure transaction.',
  'Watch together', 'Free entry', 'Respect the Venue.', 'Venue-hosted',
  statement_timestamp(), statement_timestamp() + interval '8 days 5 minutes',
  statement_timestamp() + interval '8 days 3 hours 5 minutes',
  (select id from public.cities where slug = 'haifa'),
  'venue', 'fa000000-0000-4000-8000-000000000301',
  'public', 50, true, 'published', statement_timestamp()
);

insert into public.event_invitations (event_id, invitee_id, invited_by)
values (
  'fa000000-0000-4000-8000-000000000402',
  'fa000000-0000-4000-8000-000000000102',
  'fa000000-0000-4000-8000-000000000101'
);

create temporary table captured_event_invite (
  invite_token_id uuid,
  invite_token text,
  expires_at timestamptz,
  max_uses integer,
  use_count integer,
  created_at timestamptz
) on commit drop;
grant select, insert on captured_event_invite to authenticated;

set local role authenticated;
set local "request.jwt.claim.sub" = 'fa000000-0000-4000-8000-000000000101';
insert into captured_event_invite
select *
from public.create_event_invite_token(
  'fa000000-0000-4000-8000-000000000401',
  statement_timestamp() + interval '7 days',
  1,
  'fa000000-0000-4000-8000-000000000901'
);
reset role;

select is(
  (select char_length(invite_token) from captured_event_invite),
  43,
  'creation returns one high-entropy URL-safe token exactly once'
);
select ok(
  (
    select stored.token_hash <> captured.invite_token
      and stored.token_hash = private.hash_event_invite_token(captured.invite_token)
    from public.event_invite_tokens as stored
    join captured_event_invite as captured on captured.invite_token_id = stored.id
  ),
  'the database stores only the token digest'
);
set local role authenticated;
set local "request.jwt.claim.sub" = 'fa000000-0000-4000-8000-000000000101';
select results_eq(
  $$select invite_status, max_uses, use_count
    from public.list_event_invite_tokens(
      'fa000000-0000-4000-8000-000000000401'
    )$$,
  $$values ('active'::text, 1, 0)$$,
  'the host can list non-secret invite-link metadata through the authenticated RPC'
);
reset role;

set local role authenticated;
set local "request.jwt.claim.sub" = 'fa000000-0000-4000-8000-000000000102';
select is(
  (
    select count(*)
    from public.get_event_summary('fa000000-0000-4000-8000-000000000401')
  ),
  0::bigint,
  'an ordinary event URL reveals nothing to a viewer before link redemption'
);
select is(
  (
    select invitation_status
    from public.redeem_event_invite_token(
      (select invite_token from captured_event_invite),
      'fa000000-0000-4000-8000-000000000902'
    )
  ),
  'pending'::text,
  'a valid signed-in Fan receives a pending invitation, not attendance'
);
select is(
  (
    select count(*)
    from public.get_event_summary('fa000000-0000-4000-8000-000000000401')
  ),
  1::bigint,
  'the redeemed invitation makes the event available to that invitee'
);
select is(
  (
    select invitation_status
    from public.redeem_event_invite_token(
      (select invite_token from captured_event_invite),
      'fa000000-0000-4000-8000-000000000903'
    )
  ),
  'pending'::text,
  'redeeming the same link again is idempotent for the same pending invitee'
);
reset role;

select is(
  (
    select use_count
    from public.event_invite_tokens
    where id = (select invite_token_id from captured_event_invite)
  ),
  1,
  'idempotent redemption consumes only one use'
);
select is(
  (
    select count(*)
    from public.event_attendance
    where event_id = 'fa000000-0000-4000-8000-000000000401'
      and user_id = 'fa000000-0000-4000-8000-000000000102'
  ),
  0::bigint,
  'link redemption never reserves a place'
);

set local role authenticated;
set local "request.jwt.claim.sub" = 'fa000000-0000-4000-8000-000000000102';
select results_eq(
  $$select can_review, can_withdraw
    from public.list_group_event_submissions(
      'fa000000-0000-4000-8000-000000000205', 0, 20
    )
    where event_id = 'fa000000-0000-4000-8000-000000000403'$$,
  $$values (false, true)$$,
  'the submitter receives withdrawal capability instead of forbidden self-review'
);
reset role;

set local role authenticated;
set local "request.jwt.claim.sub" = 'fa000000-0000-4000-8000-000000000101';
select results_eq(
  $$select can_review, can_withdraw
    from public.list_group_event_submissions(
      'fa000000-0000-4000-8000-000000000205', 0, 20
    )
    where event_id = 'fa000000-0000-4000-8000-000000000403'$$,
  $$values (true, false)$$,
  'a different owner receives review capability without withdrawal capability'
);
select throws_ok(
  $$select public.withdraw_group_event_submission(
    'fa000000-0000-4000-8000-000000000403',
    'fa000000-0000-4000-8000-000000000908'
  )$$,
  'P0001',
  'NOT_FOUND',
  'another administrator cannot withdraw the submitter event'
);
reset role;

set local role authenticated;
set local "request.jwt.claim.sub" = 'fa000000-0000-4000-8000-000000000102';
select ok(
  public.withdraw_group_event_submission(
    'fa000000-0000-4000-8000-000000000403',
    'fa000000-0000-4000-8000-000000000909'
  ),
  'the submitter can withdraw the pending event'
);
reset role;

select is(
  (
    select status::text
    from public.events
    where id = 'fa000000-0000-4000-8000-000000000403'
  ),
  'cancelled'::text,
  'withdrawal removes the event from the actionable review queue while retaining history'
);
select is(
  (
    select count(*)
    from public.security_audit_events
    where action = 'event.group_submission.withdraw'
      and resource_id = 'fa000000-0000-4000-8000-000000000403'
      and request_id = 'fa000000-0000-4000-8000-000000000909'
  ),
  1::bigint,
  'group-event withdrawal writes one auditable transition'
);

set local role authenticated;
set local "request.jwt.claim.sub" = 'fa000000-0000-4000-8000-000000000103';
select throws_ok(
  format(
    'select * from public.redeem_event_invite_token(%L, %L)',
    (select invite_token from captured_event_invite),
    'fa000000-0000-4000-8000-000000000904'
  ),
  'P0001',
  'INVITE_INVALID',
  'an exhausted link does not disclose the event to another account'
);
reset role;

set local role authenticated;
set local "request.jwt.claim.sub" = 'fa000000-0000-4000-8000-000000000104';
select throws_ok(
  $$select public.archive_venue(
    'fa000000-0000-4000-8000-000000000301',
    'Archive Me Venue',
    'fa000000-0000-4000-8000-000000000905'
  )$$,
  'P0001',
  'NOT_FOUND',
  'a Venue administrator cannot perform owner-only closure'
);
reset role;

set local role authenticated;
set local "request.jwt.claim.sub" = 'fa000000-0000-4000-8000-000000000101';
select throws_ok(
  $$select public.archive_venue(
    'fa000000-0000-4000-8000-000000000301',
    'wrong name',
    'fa000000-0000-4000-8000-000000000906'
  )$$,
  'P0001',
  'CONFIRMATION_MISMATCH',
  'Venue closure requires the exact current Venue name'
);
select ok(
  public.archive_venue(
    'fa000000-0000-4000-8000-000000000301',
    'Archive Me Venue',
    'fa000000-0000-4000-8000-000000000907'
  ),
  'the Venue owner can close the workspace'
);
select is(
  (
    select count(*)
    from public.list_my_workspaces()
    where workspace_id = 'fa000000-0000-4000-8000-000000000301'
  ),
  0::bigint,
  'a closed Venue disappears from workspace switching immediately'
);
reset role;

select is(
  (
    select count(*)
    from public.get_venue_by_slug('archive-me-venue')
  ),
  0::bigint,
  'a closed Venue disappears from its public route'
);
select is(
  (
    select status::text
    from public.events
    where id = 'fa000000-0000-4000-8000-000000000402'
  ),
  'cancelled'::text,
  'Venue closure cancels its future live events'
);
select is(
  (
    select status::text
    from public.event_invitations
    where event_id = 'fa000000-0000-4000-8000-000000000402'
      and invitee_id = 'fa000000-0000-4000-8000-000000000102'
  ),
  'revoked'::text,
  'Venue closure revokes pending invitations for cancelled events'
);
select is(
  (
    select count(*)
    from public.events
    where id = 'fa000000-0000-4000-8000-000000000402'
  ),
  1::bigint,
  'Venue closure retains event history instead of deleting it'
);
select is(
  (
    select count(*)
    from public.security_audit_events
    where action = 'venue.archive'
      and resource_id = 'fa000000-0000-4000-8000-000000000301'
      and request_id = 'fa000000-0000-4000-8000-000000000907'
  ),
  1::bigint,
  'Venue closure writes one auditable transition'
);

select * from finish();
rollback;
