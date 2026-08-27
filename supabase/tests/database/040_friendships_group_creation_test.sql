begin;

create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public, pg_catalog;

select no_plan();

select has_table('public', 'friendships', 'B05 creates canonical direct friendships');
select has_table('public', 'groups', 'B05 creates supporter groups');
select has_table('public', 'group_rules', 'B05 creates ordered group rules');
select has_table('public', 'group_memberships', 'B05 creates durable group memberships');
select has_table('public', 'group_invite_tokens', 'B05 creates hashed invite metadata');
select has_table('public', 'group_bans', 'B05 creates durable group bans');

select is(
  enum_range(null::public.friendship_status)::text,
  '{pending,accepted,declined}',
  'friendship states match the locked lifecycle'
);
select is(
  enum_range(null::public.group_visibility)::text,
  '{discoverable,unlisted}',
  'group visibility is deliberately bounded'
);
select is(
  enum_range(null::public.group_lifecycle)::text,
  '{forming,active,suspended,archived}',
  'group lifecycle states match the contract'
);
select is(
  enum_range(null::public.group_role)::text,
  '{owner,admin,member}',
  'group roles match the contract'
);
select is(
  enum_range(null::public.group_membership_status)::text,
  '{pending,active,rejected,left,banned}',
  'group membership states match the contract'
);

select ok(
  (
    select relation.relrowsecurity and relation.relforcerowsecurity
    from pg_class as relation
    join pg_namespace as namespace on namespace.oid = relation.relnamespace
    where namespace.nspname = 'public' and relation.relname = 'friendships'
  ),
  'friendships has RLS enabled and forced'
);
select ok(
  (
    select bool_and(relation.relrowsecurity and relation.relforcerowsecurity)
    from pg_class as relation
    join pg_namespace as namespace on namespace.oid = relation.relnamespace
    where namespace.nspname = 'public'
      and relation.relname in (
        'groups',
        'group_rules',
        'group_memberships',
        'group_invite_tokens',
        'group_bans'
      )
  ),
  'every B05 group table has RLS enabled and forced'
);

select has_index('public', 'friendships', 'friendships_pair_key', 'friendship pairs are unique');
select has_index('public', 'friendships', 'friendships_user_low_status_updated_idx', 'low-side friendship lists are indexed');
select has_index('public', 'friendships', 'friendships_user_high_status_updated_idx', 'high-side friendship lists are indexed');
select has_index('public', 'security_audit_events', 'security_audit_friendship_request_cooldown_idx', 'friendship request cooldowns use durable indexed audit evidence');
select has_index('public', 'groups', 'groups_slug_lower_uidx', 'group slugs are case-insensitively unique');
select has_index('public', 'groups', 'groups_visibility_lifecycle_city_idx', 'public group visibility queries are indexed');
select has_index('public', 'groups', 'groups_team_city_idx', 'same-team/city suggestions are indexed');
select has_index('public', 'groups', 'groups_owner_id_idx', 'group ownership is indexed');
select has_index('public', 'groups', 'groups_name_trgm_idx', 'group names have a trigram suggestion index');
select has_index('public', 'group_memberships', 'group_memberships_one_active_owner_uidx', 'only one active owner is possible');
select has_index('public', 'group_memberships', 'group_memberships_group_status_role_idx', 'group roster and role checks are indexed');
select has_index('public', 'group_memberships', 'group_memberships_user_status_idx', 'user membership lists are indexed');
select has_index('public', 'group_memberships', 'group_memberships_reviewer_reviewed_idx', 'review evidence is indexed');

select ok(not has_table_privilege('anon', 'public.friendships', 'select'), 'anonymous callers cannot enumerate friendships');
select ok(has_table_privilege('authenticated', 'public.friendships', 'select'), 'participants may read RLS-filtered friendship rows');
select ok(not has_table_privilege('authenticated', 'public.friendships', 'insert'), 'friendships cannot be inserted directly');
select ok(not has_table_privilege('authenticated', 'public.friendships', 'update'), 'friendships cannot be responded to directly');
select ok(not has_table_privilege('authenticated', 'public.friendships', 'delete'), 'friendships cannot be removed directly');
select ok(has_table_privilege('anon', 'public.groups', 'select'), 'anonymous callers can read only RLS-approved group summaries');
select ok(not has_table_privilege('authenticated', 'public.groups', 'insert'), 'groups require the atomic creation function');
select ok(not has_table_privilege('authenticated', 'public.group_memberships', 'insert'), 'owner and membership rows cannot be forged directly');
select ok(not has_table_privilege('authenticated', 'public.group_invite_tokens', 'select'), 'invite hashes and metadata are not directly exposed');
select ok(not has_table_privilege('authenticated', 'public.group_bans', 'select'), 'ordinary members cannot enumerate bans');

select ok(has_function_privilege('authenticated', 'public.request_friendship(uuid,uuid)', 'execute'), 'complete users may invoke the controlled friendship request function');
select ok(not has_function_privilege('anon', 'public.request_friendship(uuid,uuid)', 'execute'), 'anonymous callers cannot request friendships');
select ok(has_function_privilege('authenticated', 'public.respond_to_friendship(uuid,text,uuid)', 'execute'), 'recipients may invoke the controlled response function');
select ok(has_function_privilege('authenticated', 'public.remove_friendship(uuid,uuid)', 'execute'), 'participants may invoke controlled removal');
select ok(has_function_privilege('authenticated', 'public.create_group(text,text,uuid,uuid,text,text,uuid)', 'execute'), 'complete users may invoke atomic group creation');
select ok(not has_function_privilege('anon', 'public.create_group(text,text,uuid,uuid,text,text,uuid)', 'execute'), 'anonymous callers cannot create groups');
select ok(has_function_privilege('anon', 'public.get_group_by_slug(text)', 'execute'), 'anonymous callers may request a safe public group projection');
select ok(not has_function_privilege('authenticated', 'private.enforce_group_owner_invariant()', 'execute'), 'the owner invariant helper is private');
select ok(not has_function_privilege('authenticated', 'private.lock_direct_user_pair(uuid,uuid)', 'execute'), 'the direct-pair lock helper is private');

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
values
  ('00000000-0000-0000-0000-000000000000', '50000000-0000-4000-8000-000000000101', 'authenticated', 'authenticated', 'b05-a@example.com', statement_timestamp(), '{}'::jsonb, '{}'::jsonb, statement_timestamp(), statement_timestamp()),
  ('00000000-0000-0000-0000-000000000000', '50000000-0000-4000-8000-000000000102', 'authenticated', 'authenticated', 'b05-b@example.com', statement_timestamp(), '{}'::jsonb, '{}'::jsonb, statement_timestamp(), statement_timestamp()),
  ('00000000-0000-0000-0000-000000000000', '50000000-0000-4000-8000-000000000103', 'authenticated', 'authenticated', 'b05-c@example.com', statement_timestamp(), '{}'::jsonb, '{}'::jsonb, statement_timestamp(), statement_timestamp()),
  ('00000000-0000-0000-0000-000000000000', '50000000-0000-4000-8000-000000000104', 'authenticated', 'authenticated', 'b05-d@example.com', statement_timestamp(), '{}'::jsonb, '{}'::jsonb, statement_timestamp(), statement_timestamp()),
  ('00000000-0000-0000-0000-000000000000', '50000000-0000-4000-8000-000000000105', 'authenticated', 'authenticated', 'b05-unverified@example.com', null, '{}'::jsonb, '{}'::jsonb, statement_timestamp(), statement_timestamp()),
  ('00000000-0000-0000-0000-000000000000', '50000000-0000-4000-8000-000000000106', 'authenticated', 'authenticated', 'b05-incomplete@example.com', statement_timestamp(), '{}'::jsonb, '{}'::jsonb, statement_timestamp(), statement_timestamp()),
  ('00000000-0000-0000-0000-000000000000', '50000000-0000-4000-8000-000000000107', 'authenticated', 'authenticated', 'b05-suspended@example.com', statement_timestamp(), '{}'::jsonb, '{}'::jsonb, statement_timestamp(), statement_timestamp());

update public.profiles
set handle = case id
      when '50000000-0000-4000-8000-000000000101' then 'b05_alex'
      when '50000000-0000-4000-8000-000000000102' then 'b05_blair'
      when '50000000-0000-4000-8000-000000000103' then 'b05_casey'
      when '50000000-0000-4000-8000-000000000104' then 'b05_devon'
      when '50000000-0000-4000-8000-000000000105' then 'b05_unverified'
      when '50000000-0000-4000-8000-000000000107' then 'b05_suspended'
    end,
    display_name = case id
      when '50000000-0000-4000-8000-000000000101' then 'Alex Fan'
      when '50000000-0000-4000-8000-000000000102' then 'Blair Fan'
      when '50000000-0000-4000-8000-000000000103' then 'Casey Fan'
      when '50000000-0000-4000-8000-000000000104' then 'Devon Fan'
      when '50000000-0000-4000-8000-000000000105' then 'Unverified Fan'
      when '50000000-0000-4000-8000-000000000107' then 'Suspended Fan'
    end,
    city_id = (select id from public.cities where slug = 'haifa'),
    adult_attested_at = statement_timestamp(),
    rules_version = 1,
    rules_accepted_at = statement_timestamp(),
    profile_completed_at = statement_timestamp()
where id in (
  '50000000-0000-4000-8000-000000000101',
  '50000000-0000-4000-8000-000000000102',
  '50000000-0000-4000-8000-000000000103',
  '50000000-0000-4000-8000-000000000104',
  '50000000-0000-4000-8000-000000000105',
  '50000000-0000-4000-8000-000000000107'
);

update public.profiles
set suspended_at = statement_timestamp()
where id = '50000000-0000-4000-8000-000000000107';

insert into public.teams (
  id,
  sport_id,
  provider,
  provider_external_id,
  name,
  short_name,
  tla,
  country_name,
  active,
  last_synced_at
)
values (
  '50000000-0000-4000-8000-000000000201',
  '00000000-0000-4000-8000-000000000020',
  'b05-test',
  'team-arsenal',
  'Arsenal FC',
  'Arsenal',
  'ARS',
  'England',
  true,
  statement_timestamp()
);

select throws_ok(
  $$insert into public.friendships (user_low_id, user_high_id, requested_by) values ('50000000-0000-4000-8000-000000000102', '50000000-0000-4000-8000-000000000101', '50000000-0000-4000-8000-000000000102')$$,
  '23514',
  'new row for relation "friendships" violates check constraint "friendships_canonical_pair_check"',
  'friendship rows enforce canonical low/high ordering'
);
select throws_ok(
  $$insert into public.friendships (user_low_id, user_high_id, requested_by) values ('50000000-0000-4000-8000-000000000101', '50000000-0000-4000-8000-000000000102', '50000000-0000-4000-8000-000000000103')$$,
  '23514',
  'new row for relation "friendships" violates check constraint "friendships_requester_in_pair_check"',
  'the requester must belong to the canonical pair'
);
select throws_ok(
  $$insert into public.friendships (user_low_id, user_high_id, requested_by, status) values ('50000000-0000-4000-8000-000000000101', '50000000-0000-4000-8000-000000000102', '50000000-0000-4000-8000-000000000101', 'accepted')$$,
  '23514',
  'new row for relation "friendships" violates check constraint "friendships_response_state_check"',
  'accepted or declined friendship rows require response evidence'
);
select throws_ok(
  $$insert into public.friendships (user_low_id, user_high_id, requested_by) values ('40000000-0000-4000-8000-000000000001', '50000000-0000-4000-8000-000000000101', '50000000-0000-4000-8000-000000000101')$$,
  '23503',
  null,
  'the low friendship participant must reference a profile'
);
select throws_ok(
  $$insert into public.friendships (user_low_id, user_high_id, requested_by) values ('50000000-0000-4000-8000-000000000101', '60000000-0000-4000-8000-000000000001', '50000000-0000-4000-8000-000000000101')$$,
  '23503',
  null,
  'the high friendship participant must reference a profile'
);
select throws_ok(
  $$insert into public.friendships (user_low_id, user_high_id, requested_by) values ('50000000-0000-4000-8000-000000000101', '50000000-0000-4000-8000-000000000102', '50000000-0000-4000-8000-000000000106')$$,
  '23514',
  null,
  'a nonparticipant cannot satisfy the requester invariant even when the profile exists'
);

set local role authenticated;
set local "request.jwt.claim.sub" = '50000000-0000-4000-8000-000000000101';

select lives_ok(
  $$select public.request_friendship_by_handle('B05_Blair', null)$$,
  'a complete actor can request a direct friendship by normalized handle'
);
select is(
  (
    select user_low_id::text || ':' || user_high_id::text
    from public.friendships
  ),
  '50000000-0000-4000-8000-000000000101:50000000-0000-4000-8000-000000000102',
  'the request function persists the canonical pair'
);
select throws_ok(
  $$select public.request_friendship_by_handle('b05_blair', null)$$,
  'P0001',
  'FRIENDSHIP_EXISTS',
  'a duplicate pair is rejected without a second row'
);
select throws_ok(
  $$select public.request_friendship('50000000-0000-4000-8000-000000000101', null)$$,
  'P0001',
  'NOT_ALLOWED',
  'self friendship is rejected'
);
select throws_ok(
  $$select public.request_friendship('50000000-0000-4000-8000-000000000105', null)$$,
  'P0001',
  'NOT_FOUND',
  'an unverified target is rejected non-enumeratingly'
);
select throws_ok(
  $$select public.request_friendship('50000000-0000-4000-8000-000000000106', null)$$,
  'P0001',
  'NOT_FOUND',
  'an incomplete target is rejected non-enumeratingly'
);
select throws_ok(
  $$select public.request_friendship('50000000-0000-4000-8000-000000000107', null)$$,
  'P0001',
  'NOT_FOUND',
  'a suspended target is rejected non-enumeratingly'
);
select throws_ok(
  $$select public.request_friendship('50000000-0000-4000-8000-000000000103', null)$$,
  'P0001',
  'RATE_LIMITED',
  'friend requests have a bounded database cooldown'
);
select is((select count(*) from public.friendships), 1::bigint, 'the requester reads exactly their direct row');

reset role;
select throws_ok(
  $$insert into public.friendships (id, user_low_id, user_high_id, requested_by) values ((select id from public.friendships limit 1), '50000000-0000-4000-8000-000000000101', '50000000-0000-4000-8000-000000000103', '50000000-0000-4000-8000-000000000101')$$,
  '23505', null, 'friendship primary identifiers are unique'
);
select throws_ok(
  $$insert into public.friendships (user_low_id, user_high_id, requested_by) values ('50000000-0000-4000-8000-000000000101', '50000000-0000-4000-8000-000000000102', '50000000-0000-4000-8000-000000000101')$$,
  '23505', null, 'the database unique constraint independently rejects a duplicate canonical pair'
);
set local role authenticated;
set local "request.jwt.claim.sub" = '50000000-0000-4000-8000-000000000101';

select throws_ok(
  $$select public.respond_to_friendship((select id from public.friendships), 'accept', null)$$,
  'P0001',
  'NOT_ALLOWED',
  'the requester cannot accept their own request'
);

set local "request.jwt.claim.sub" = '50000000-0000-4000-8000-000000000103';
select is((select count(*) from public.friendships), 0::bigint, 'an unrelated user cannot read the pair');
select throws_ok(
  $$select public.respond_to_friendship((select id from public.friendships where user_low_id = '50000000-0000-4000-8000-000000000101'), 'accept', null)$$,
  'P0001',
  'NOT_FOUND',
  'an unrelated actor cannot respond to a friendship'
);

set local "request.jwt.claim.sub" = '50000000-0000-4000-8000-000000000102';
select is((select count(*) from public.friendships), 1::bigint, 'the recipient reads the direct pending row');
select is(
  public.respond_to_friendship((select id from public.friendships), 'accept', null),
  'accepted',
  'only the recipient can accept a pending request'
);
select throws_ok(
  $$select public.respond_to_friendship((select id from public.friendships), 'decline', null)$$,
  'P0001',
  'INVALID_TRANSITION',
  'a completed response cannot transition again'
);

set local "request.jwt.claim.sub" = '50000000-0000-4000-8000-000000000101';
select ok(public.remove_friendship((select id from public.friendships), null), 'either participant can remove an accepted friendship');
select is((select count(*) from public.friendships), 0::bigint, 'friendship removal deletes only the canonical pair');

set local "request.jwt.claim.sub" = '50000000-0000-4000-8000-000000000102';
select lives_ok(
  $$select public.request_friendship('50000000-0000-4000-8000-000000000101', null)$$,
  'the reverse requester still creates the same canonical direction'
);
set local "request.jwt.claim.sub" = '50000000-0000-4000-8000-000000000101';
select is(
  public.respond_to_friendship((select id from public.friendships), 'decline', null),
  'declined',
  'the recipient can decline a pending request'
);
set local "request.jwt.claim.sub" = '50000000-0000-4000-8000-000000000102';
select ok(public.remove_friendship((select id from public.friendships), null), 'either participant can remove a declined row');

reset role;
insert into public.user_blocks (blocker_id, blocked_id)
values ('50000000-0000-4000-8000-000000000102', '50000000-0000-4000-8000-000000000103');
set local role authenticated;
set local "request.jwt.claim.sub" = '50000000-0000-4000-8000-000000000103';
select throws_ok(
  $$select public.request_friendship('50000000-0000-4000-8000-000000000102', null)$$,
  'P0001',
  'BLOCKED_RELATIONSHIP',
  'either direction of a private block rejects friendship requests generically'
);

set local "request.jwt.claim.sub" = '50000000-0000-4000-8000-000000000101';
select throws_ok(
  $$select public.request_friendship('50000000-0000-4000-8000-000000000102', null)$$,
  'P0001',
  'RATE_LIMITED',
  'a removed friendship does not erase the durable request cooldown'
);
reset role;
update public.security_audit_events
set created_at = statement_timestamp() - interval '11 seconds'
where actor_id = '50000000-0000-4000-8000-000000000101'
  and action = 'friendship.request';
set local role authenticated;
set local "request.jwt.claim.sub" = '50000000-0000-4000-8000-000000000101';
select lives_ok(
  $$select public.request_friendship('50000000-0000-4000-8000-000000000102', null)$$,
  'a pair can be requested again after explicit removal and the cooldown window'
);
set local "request.jwt.claim.sub" = '50000000-0000-4000-8000-000000000102';
select is(
  public.respond_to_friendship((select id from public.friendships where user_low_id = '50000000-0000-4000-8000-000000000101'), 'accept', null),
  'accepted',
  'the recreated pair can be accepted'
);
set local "request.jwt.claim.sub" = '50000000-0000-4000-8000-000000000101';
select ok(public.block_user('b05_blair', null), 'blocking an accepted friend succeeds');
select is((select count(*) from public.friendships), 0::bigint, 'block removes the friendship in the same transaction');
select is((select count(*) from public.user_blocks where blocker_id = auth.uid()), 1::bigint, 'the blocker reads only their outgoing block');
reset role;
select is(
  (
    select metadata ->> 'friendship_removed'
    from public.security_audit_events
    where action = 'user.block' and actor_id = auth.uid()
    order by created_at desc
    limit 1
  ),
  'true',
  'block audit evidence records the transactional friendship effect without target notification'
);
set local role authenticated;
set local "request.jwt.claim.sub" = '50000000-0000-4000-8000-000000000102';
select is((select count(*) from public.user_blocks), 1::bigint, 'a target sees only their unrelated outgoing block, never who blocked them');
reset role;

select throws_ok(
  $$insert into public.groups (slug, name, owner_id, city_id, visibility, lifecycle) values ('Bad Slug', 'Valid Group', '50000000-0000-4000-8000-000000000101', (select id from public.cities where slug = 'haifa'), 'discoverable', 'forming')$$,
  '23514',
  null,
  'group slugs enforce normalized URL-safe values'
);
select throws_ok(
  $$insert into public.groups (slug, name, owner_id, city_id, visibility, lifecycle) values ('bad-name', 'X', '50000000-0000-4000-8000-000000000101', (select id from public.cities where slug = 'haifa'), 'discoverable', 'forming')$$,
  '23514',
  null,
  'group names enforce the bounded trimmed contract'
);
select throws_ok(
  $$insert into public.groups (slug, name, owner_id, city_id, visibility, lifecycle, description) values ('bad-description', 'Valid Group', '50000000-0000-4000-8000-000000000101', (select id from public.cities where slug = 'haifa'), 'discoverable', 'forming', '')$$,
  '23514',
  null,
  'group descriptions reject empty stored text'
);
select throws_ok(
  $$insert into public.groups (slug, name, owner_id, city_id, visibility, lifecycle) values ('bad-active-time', 'Valid Group', '50000000-0000-4000-8000-000000000101', (select id from public.cities where slug = 'haifa'), 'unlisted', 'active')$$,
  '23514',
  null,
  'active groups require activation evidence'
);
select throws_ok(
  $$insert into public.groups (slug, name, owner_id, city_id, visibility, lifecycle) values ('bad-owner', 'Valid Group', '60000000-0000-4000-8000-000000000001', (select id from public.cities where slug = 'haifa'), 'discoverable', 'forming')$$,
  '23503',
  null,
  'group owners must reference profiles'
);
select throws_ok(
  $$insert into public.groups (slug, name, owner_id, team_id, city_id, visibility, lifecycle) values ('bad-team', 'Valid Group', '50000000-0000-4000-8000-000000000101', '60000000-0000-4000-8000-000000000002', (select id from public.cities where slug = 'haifa'), 'discoverable', 'forming')$$,
  '23503',
  null,
  'group teams must reference the sports catalog'
);
select throws_ok(
  $$insert into public.groups (slug, name, owner_id, city_id, visibility, lifecycle) values ('bad-city', 'Valid Group', '50000000-0000-4000-8000-000000000101', '60000000-0000-4000-8000-000000000003', 'discoverable', 'forming')$$,
  '23503',
  null,
  'group cities must reference the active city catalog'
);

set local role authenticated;
set local "request.jwt.claim.sub" = '50000000-0000-4000-8000-000000000106';
select throws_ok(
  $$select * from public.create_group('Incomplete Group', 'incomplete-group', (select id from public.cities where slug = 'haifa'), null, 'discoverable', '', null)$$,
  'P0001',
  'ADULT_ATTESTATION_REQUIRED',
  'an incomplete actor cannot create a group'
);
set local "request.jwt.claim.sub" = '50000000-0000-4000-8000-000000000107';
select throws_ok(
  $$select * from public.create_group('Suspended Group', 'suspended-group', (select id from public.cities where slug = 'haifa'), null, 'discoverable', '', null)$$,
  'P0001',
  'ACCOUNT_SUSPENDED',
  'a suspended actor cannot create a group'
);
set local "request.jwt.claim.sub" = '50000000-0000-4000-8000-000000000105';
select throws_ok(
  $$select * from public.create_group('Unverified Group', 'unverified-group', (select id from public.cities where slug = 'haifa'), null, 'discoverable', '', null)$$,
  'P0001',
  'EMAIL_NOT_VERIFIED',
  'an unverified actor cannot create a group'
);

set local "request.jwt.claim.sub" = '50000000-0000-4000-8000-000000000101';
select lives_ok(
  $$select * from public.create_group('Haifa Arsenal Supporters', 'haifa-arsenal-supporters', (select id from public.cities where slug = 'haifa'), '50000000-0000-4000-8000-000000000201', 'discoverable', 'Match-going Arsenal supporters in Haifa.', null)$$,
  'a complete actor atomically creates a discoverable group'
);
select is(
  (select lifecycle::text from public.groups where slug = 'haifa-arsenal-supporters'),
  'forming',
  'a discoverable group starts forming'
);
select is(
  (
    select role::text || ':' || status::text
    from public.group_memberships
    where group_id = (select id from public.groups where slug = 'haifa-arsenal-supporters')
  ),
  'owner:active',
  'group creation inserts the creator as the active owner atomically'
);
select lives_ok(
  $$select * from public.create_group('Haifa Arsenal Circle', 'haifa-arsenal-circle', (select id from public.cities where slug = 'haifa'), '50000000-0000-4000-8000-000000000201', 'unlisted', '', null)$$,
  'a complete actor can create an unlisted group'
);
select ok(
  (
    select lifecycle = 'active' and activated_at is not null
    from public.groups
    where slug = 'haifa-arsenal-circle'
  ),
  'an unlisted group is immediately active for its members'
);

reset role;
select throws_ok(
  $$insert into public.groups (id, slug, name, owner_id, city_id, visibility, lifecycle) values ((select id from public.groups where slug = 'haifa-arsenal-supporters'), 'different-group-id', 'Different Group', '50000000-0000-4000-8000-000000000101', (select id from public.cities where slug = 'haifa'), 'discoverable', 'forming')$$,
  '23505', null, 'group primary identifiers are unique'
);
select throws_ok(
  $$insert into public.groups (slug, name, owner_id, city_id, visibility, lifecycle) values ('haifa-arsenal-supporters', 'Duplicate URL Direct', '50000000-0000-4000-8000-000000000101', (select id from public.cities where slug = 'haifa'), 'discoverable', 'forming')$$,
  '23505', null, 'the case-insensitive slug index independently rejects duplicate URLs'
);
set local role authenticated;

set local "request.jwt.claim.sub" = '50000000-0000-4000-8000-000000000102';
select throws_ok(
  $$select * from public.create_group('Duplicate URL', 'HAIFA-ARSENAL-SUPPORTERS', (select id from public.cities where slug = 'haifa'), null, 'discoverable', '', null)$$,
  'P0001',
  'GROUP_SLUG_UNAVAILABLE',
  'case-insensitive duplicate group slugs are rejected'
);
select is(
  (select count(*) from public.group_memberships where user_id = auth.uid()),
  0::bigint,
  'a failed duplicate creation leaves no partial owner membership'
);
select is(
  (select count(*) from public.suggest_similar_groups('Haifa Arsenal Fans', (select id from public.cities where slug = 'haifa'), '50000000-0000-4000-8000-000000000201', 5)),
  1::bigint,
  'similar suggestions include the discoverable same-team/city group but not the unlisted group'
);
select is((select count(*) from public.groups), 0::bigint, 'a nonmember cannot directly enumerate forming or unlisted groups');
select is((select count(*) from public.get_group_by_slug('haifa-arsenal-circle')), 0::bigint, 'an unlisted group is non-enumerating to a nonmember');
select throws_ok(
  $$select * from public.list_safe_group_members((select id from public.groups where slug = 'haifa-arsenal-circle'), 0, 20)$$,
  'P0001',
  'NOT_FOUND',
  'a nonmember cannot cross the protected roster boundary'
);

set local "request.jwt.claim.sub" = '50000000-0000-4000-8000-000000000101';
select is((select count(*) from public.groups), 2::bigint, 'the owner reads both owned forming and unlisted groups');
select is((select count(*) from public.get_group_by_slug('haifa-arsenal-circle')), 1::bigint, 'an active owner may read their unlisted group');
select is(
  (select can_view_member_content from public.get_group_by_slug('haifa-arsenal-circle')),
  true,
  'the active non-banned owner crosses the member-content boundary'
);

reset role;
set constraints all immediate;
select throws_ok(
  $$delete from public.group_memberships where group_id = (select id from public.groups where slug = 'haifa-arsenal-supporters') and role = 'owner'$$,
  'P0001',
  'GROUP_OWNER_REQUIRED',
  'the sole active owner membership cannot be removed'
);
select throws_ok(
  $$update public.group_memberships set role = 'member' where group_id = (select id from public.groups where slug = 'haifa-arsenal-supporters') and role = 'owner'$$,
  'P0001',
  'GROUP_OWNER_REQUIRED',
  'the sole active owner cannot be demoted'
);
set constraints all deferred;

insert into public.group_memberships (
  group_id,
  user_id,
  role,
  status,
  reviewed_by,
  reviewed_at
)
values (
  (select id from public.groups where slug = 'haifa-arsenal-supporters'),
  '50000000-0000-4000-8000-000000000102',
  'member',
  'active',
  '50000000-0000-4000-8000-000000000101',
  statement_timestamp()
);
select throws_ok(
  $$update public.group_memberships set role = 'owner' where group_id = (select id from public.groups where slug = 'haifa-arsenal-supporters') and user_id = '50000000-0000-4000-8000-000000000102'$$,
  '23505',
  null,
  'the partial unique invariant prevents a second active owner'
);
select throws_ok(
  $$insert into public.group_memberships (group_id, user_id, role, status, reviewed_by, reviewed_at) values ((select id from public.groups where slug = 'haifa-arsenal-supporters'), '50000000-0000-4000-8000-000000000102', 'member', 'active', '50000000-0000-4000-8000-000000000101', statement_timestamp())$$,
  '23505', null, 'membership group and user pairs are unique'
);

set local role authenticated;
set local "request.jwt.claim.sub" = '50000000-0000-4000-8000-000000000101';
select is(
  (select count(*) from public.list_safe_group_members((select id from public.groups where slug = 'haifa-arsenal-supporters'), 0, 20)),
  2::bigint,
  'an active member receives a bounded safe roster without application messages'
);
select is(
  (
    select array_agg(distinct field_name order by field_name)
    from public.list_safe_group_members((select id from public.groups where slug = 'haifa-arsenal-supporters'), 0, 20) as member_row,
      lateral jsonb_object_keys(to_jsonb(member_row)) as field_name
  ),
  array['display_name', 'handle', 'member_since', 'role', 'total_count']::text[],
  'the protected roster exposes only reviewed safe fields'
);
reset role;

update public.groups
set lifecycle = 'active', activated_at = statement_timestamp()
where slug = 'haifa-arsenal-supporters';

set local role anon;
set local "request.jwt.claim.sub" = '';
select is((select count(*) from public.groups), 1::bigint, 'anonymous callers read only active discoverable groups');
select is((select count(*) from public.get_group_by_slug('haifa-arsenal-supporters')), 1::bigint, 'the safe group RPC returns an active discoverable summary');
select is((select count(*) from public.get_group_by_slug('haifa-arsenal-circle')), 0::bigint, 'the safe group RPC never exposes an unlisted group anonymously');
reset role;

insert into public.group_bans (group_id, user_id, banned_by, reason)
values (
  (select id from public.groups where slug = 'haifa-arsenal-supporters'),
  '50000000-0000-4000-8000-000000000102',
  '50000000-0000-4000-8000-000000000101',
  'Repeated abuse'
);
set local role authenticated;
set local "request.jwt.claim.sub" = '50000000-0000-4000-8000-000000000102';
select is(
  (select can_view_member_content from public.get_group_by_slug('haifa-arsenal-supporters')),
  null::boolean,
  'a ban recalculates the incomplete legacy fixture to forming and exposes no summary to the banned member'
);
select throws_ok(
  $$select * from public.list_safe_group_members((select id from public.groups where slug = 'haifa-arsenal-supporters'), 0, 20)$$,
  'P0001', 'NOT_FOUND', 'a banned member cannot cross the protected roster boundary'
);
reset role;
delete from public.group_bans
where group_id = (select id from public.groups where slug = 'haifa-arsenal-supporters')
  and user_id = '50000000-0000-4000-8000-000000000102';

select throws_ok(
  $$insert into public.group_rules (group_id, position, text) values ((select id from public.groups where slug = 'haifa-arsenal-supporters'), 0, 'Valid rule')$$,
  '23514', null, 'group rule positions are bounded'
);
select throws_ok(
  $$insert into public.group_rules (group_id, position, text) values ((select id from public.groups where slug = 'haifa-arsenal-supporters'), 1, '')$$,
  '23514', null, 'group rule text is bounded and nonempty'
);
insert into public.group_rules (group_id, position, text)
values ((select id from public.groups where slug = 'haifa-arsenal-supporters'), 1, 'Respect every supporter.');
insert into public.group_rules (id, group_id, position, text)
values ('50000000-0000-4000-8000-000000000401', (select id from public.groups where slug = 'haifa-arsenal-supporters'), 2, 'Keep the group safe.');
set constraints group_rules_group_position_key immediate;
select throws_ok(
  $$insert into public.group_rules (id, group_id, position, text) values ('50000000-0000-4000-8000-000000000401', (select id from public.groups where slug = 'haifa-arsenal-supporters'), 3, 'Duplicate identifier')$$,
  '23505', null, 'group rule primary identifiers are unique'
);
select throws_ok(
  $$insert into public.group_rules (group_id, position, text) values ((select id from public.groups where slug = 'haifa-arsenal-supporters'), 1, 'Duplicate position')$$,
  '23505', null, 'rule positions are unique inside a group'
);
set constraints group_rules_group_position_key deferred;
select throws_ok(
  $$insert into public.group_rules (group_id, position, text) values ('60000000-0000-4000-8000-000000000004', 1, 'Missing group')$$,
  '23503', null, 'group rules reference an existing group'
);

select throws_ok(
  $$insert into public.group_invite_tokens (group_id, token_hash, created_by, expires_at, max_uses) values ((select id from public.groups where slug = 'haifa-arsenal-circle'), 'not-a-hash', '50000000-0000-4000-8000-000000000101', statement_timestamp() + interval '1 day', 2)$$,
  '23514', null, 'invite metadata accepts only SHA-256 hex digests'
);
select throws_ok(
  $$insert into public.group_invite_tokens (group_id, token_hash, created_by, expires_at, max_uses) values ((select id from public.groups where slug = 'haifa-arsenal-circle'), repeat('a', 64), '50000000-0000-4000-8000-000000000101', statement_timestamp() - interval '1 day', 2)$$,
  '23514', null, 'invite expiry must follow creation'
);
select throws_ok(
  $$insert into public.group_invite_tokens (group_id, token_hash, created_by, expires_at, max_uses, use_count) values ((select id from public.groups where slug = 'haifa-arsenal-circle'), repeat('b', 64), '50000000-0000-4000-8000-000000000101', statement_timestamp() + interval '1 day', 1, 2)$$,
  '23514', null, 'invite use count cannot exceed its bounded limit'
);
select throws_ok(
  $$insert into public.group_invite_tokens (group_id, token_hash, created_by, expires_at, max_uses, revoked_at) values ((select id from public.groups where slug = 'haifa-arsenal-circle'), repeat('c', 64), '50000000-0000-4000-8000-000000000101', statement_timestamp() + interval '1 day', 2, statement_timestamp() - interval '1 day')$$,
  '23514', null, 'invite revocation cannot predate creation'
);
select throws_ok(
  $$insert into public.group_invite_tokens (group_id, token_hash, created_by, expires_at, max_uses) values ('60000000-0000-4000-8000-000000000005', repeat('d', 64), '50000000-0000-4000-8000-000000000101', statement_timestamp() + interval '1 day', 2)$$,
  '23503', null, 'invite metadata references an existing group'
);
select throws_ok(
  $$insert into public.group_invite_tokens (group_id, token_hash, created_by, expires_at, max_uses) values ((select id from public.groups where slug = 'haifa-arsenal-circle'), repeat('e', 64), '60000000-0000-4000-8000-000000000006', statement_timestamp() + interval '1 day', 2)$$,
  '23503', null, 'invite creators reference an existing profile'
);
insert into public.group_invite_tokens (
  id, group_id, token_hash, created_by, expires_at, max_uses
)
values (
  '50000000-0000-4000-8000-000000000301',
  (select id from public.groups where slug = 'haifa-arsenal-circle'),
  repeat('f', 64),
  '50000000-0000-4000-8000-000000000101',
  statement_timestamp() + interval '1 day',
  2
);
select throws_ok(
  $$insert into public.group_invite_tokens (group_id, token_hash, created_by, expires_at, max_uses) values ((select id from public.groups where slug = 'haifa-arsenal-circle'), repeat('f', 64), '50000000-0000-4000-8000-000000000101', statement_timestamp() + interval '1 day', 2)$$,
  '23505', null, 'invite token digests are unique'
);
select throws_ok(
  $$insert into public.group_invite_tokens (id, group_id, token_hash, created_by, expires_at, max_uses) values ('50000000-0000-4000-8000-000000000301', (select id from public.groups where slug = 'haifa-arsenal-circle'), repeat('0', 64), '50000000-0000-4000-8000-000000000101', statement_timestamp() + interval '1 day', 2)$$,
  '23505', null, 'invite metadata primary identifiers are unique'
);

select throws_ok(
  $$insert into public.group_memberships (group_id, user_id, application_message) values ((select id from public.groups where slug = 'haifa-arsenal-circle'), '50000000-0000-4000-8000-000000000103', '')$$,
  '23514', null, 'membership application text is bounded and nonempty when stored'
);
select throws_ok(
  $$insert into public.group_memberships (group_id, user_id, reviewed_by) values ((select id from public.groups where slug = 'haifa-arsenal-circle'), '50000000-0000-4000-8000-000000000103', '50000000-0000-4000-8000-000000000101')$$,
  '23514', null, 'membership review actor and time are recorded together'
);
select throws_ok(
  $$insert into public.group_memberships (group_id, user_id, role, status) values ((select id from public.groups where slug = 'haifa-arsenal-circle'), '50000000-0000-4000-8000-000000000103', 'admin', 'pending')$$,
  '23514', null, 'non-active memberships cannot retain elevated roles'
);
select throws_ok(
  $$insert into public.group_memberships (group_id, user_id) values ('60000000-0000-4000-8000-000000000007', '50000000-0000-4000-8000-000000000103')$$,
  '23503', null, 'memberships reference an existing group'
);
select throws_ok(
  $$insert into public.group_memberships (group_id, user_id) values ((select id from public.groups where slug = 'haifa-arsenal-circle'), '60000000-0000-4000-8000-000000000008')$$,
  '23503', null, 'memberships reference an existing profile'
);
select throws_ok(
  $$insert into public.group_memberships (group_id, user_id, invite_id) values ((select id from public.groups where slug = 'haifa-arsenal-supporters'), '50000000-0000-4000-8000-000000000103', '50000000-0000-4000-8000-000000000301')$$,
  '23503', null, 'a membership invite must belong to the same group'
);
select throws_ok(
  $$insert into public.group_memberships (group_id, user_id, reviewed_by, reviewed_at) values ((select id from public.groups where slug = 'haifa-arsenal-circle'), '50000000-0000-4000-8000-000000000103', '60000000-0000-4000-8000-000000000009', statement_timestamp())$$,
  '23503', null, 'membership reviewers reference an existing profile'
);
insert into public.group_memberships (group_id, user_id, invite_id, application_message)
values (
  (select id from public.groups where slug = 'haifa-arsenal-circle'),
  '50000000-0000-4000-8000-000000000103',
  '50000000-0000-4000-8000-000000000301',
  'I would like to join.'
);
delete from public.group_invite_tokens
where id = '50000000-0000-4000-8000-000000000301';
select ok(
  exists (
    select 1 from public.group_memberships
    where group_id = (select id from public.groups where slug = 'haifa-arsenal-circle')
      and user_id = '50000000-0000-4000-8000-000000000103'
      and invite_id is null
  ),
  'deleting invite metadata clears only invite_id and preserves the membership group identity'
);

select throws_ok(
  $$insert into public.group_bans (group_id, user_id, banned_by, reason) values ((select id from public.groups where slug = 'haifa-arsenal-circle'), '50000000-0000-4000-8000-000000000103', '50000000-0000-4000-8000-000000000101', 'x')$$,
  '23514', null, 'group ban reasons are bounded and nonempty'
);
select throws_ok(
  $$insert into public.group_bans (group_id, user_id, banned_by, reason, revoked_by) values ((select id from public.groups where slug = 'haifa-arsenal-circle'), '50000000-0000-4000-8000-000000000103', '50000000-0000-4000-8000-000000000101', 'Repeated abuse', '50000000-0000-4000-8000-000000000101')$$,
  '23514', null, 'group ban revocation actor and time are recorded together'
);
select throws_ok(
  $$insert into public.group_bans (group_id, user_id, banned_by, reason) values ('60000000-0000-4000-8000-000000000010', '50000000-0000-4000-8000-000000000103', '50000000-0000-4000-8000-000000000101', 'Repeated abuse')$$,
  '23503', null, 'group bans reference an existing group'
);
select throws_ok(
  $$insert into public.group_bans (group_id, user_id, banned_by, reason) values ((select id from public.groups where slug = 'haifa-arsenal-circle'), '60000000-0000-4000-8000-000000000011', '50000000-0000-4000-8000-000000000101', 'Repeated abuse')$$,
  '23503', null, 'group bans reference an existing target profile'
);
select throws_ok(
  $$insert into public.group_bans (group_id, user_id, banned_by, reason) values ((select id from public.groups where slug = 'haifa-arsenal-circle'), '50000000-0000-4000-8000-000000000103', '60000000-0000-4000-8000-000000000012', 'Repeated abuse')$$,
  '23503', null, 'group bans reference an existing banning profile'
);
select throws_ok(
  $$insert into public.group_bans (group_id, user_id, banned_by, reason, revoked_by, revoked_at) values ((select id from public.groups where slug = 'haifa-arsenal-circle'), '50000000-0000-4000-8000-000000000103', '50000000-0000-4000-8000-000000000101', 'Repeated abuse', '60000000-0000-4000-8000-000000000013', statement_timestamp())$$,
  '23503', null, 'group ban revokers reference an existing profile'
);
insert into public.group_bans (group_id, user_id, banned_by, reason)
values (
  (select id from public.groups where slug = 'haifa-arsenal-circle'),
  '50000000-0000-4000-8000-000000000103',
  '50000000-0000-4000-8000-000000000101',
  'Repeated abuse'
);
select throws_ok(
  $$insert into public.group_bans (group_id, user_id, banned_by, reason) values ((select id from public.groups where slug = 'haifa-arsenal-circle'), '50000000-0000-4000-8000-000000000103', '50000000-0000-4000-8000-000000000101', 'Duplicate ban')$$,
  '23505', null, 'group ban group and user pairs are unique'
);

select * from finish();
rollback;
