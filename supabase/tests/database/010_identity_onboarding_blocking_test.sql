begin;

create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public, pg_catalog;

select no_plan();

select has_table('public', 'cities', 'B02 creates the city catalog');
select has_table('public', 'profiles', 'B02 creates Auth-linked profiles');
select has_table('public', 'platform_roles', 'B02 creates platform roles');
select has_table('public', 'user_blocks', 'B02 creates private block records');
select has_table('public', 'security_audit_events', 'B02 creates security audit evidence');

select ok(
  (
    select relation.relrowsecurity and relation.relforcerowsecurity
    from pg_class as relation
    join pg_namespace as namespace on namespace.oid = relation.relnamespace
    where namespace.nspname = 'public' and relation.relname = 'cities'
  ),
  'cities has RLS enabled and forced'
);
select ok(
  (
    select relation.relrowsecurity and relation.relforcerowsecurity
    from pg_class as relation
    join pg_namespace as namespace on namespace.oid = relation.relnamespace
    where namespace.nspname = 'public' and relation.relname = 'profiles'
  ),
  'profiles has RLS enabled and forced'
);
select ok(
  (
    select relation.relrowsecurity and relation.relforcerowsecurity
    from pg_class as relation
    join pg_namespace as namespace on namespace.oid = relation.relnamespace
    where namespace.nspname = 'public' and relation.relname = 'platform_roles'
  ),
  'platform roles has RLS enabled and forced'
);
select ok(
  (
    select relation.relrowsecurity and relation.relforcerowsecurity
    from pg_class as relation
    join pg_namespace as namespace on namespace.oid = relation.relnamespace
    where namespace.nspname = 'public' and relation.relname = 'user_blocks'
  ),
  'user blocks has RLS enabled and forced'
);
select ok(
  (
    select relation.relrowsecurity and relation.relforcerowsecurity
    from pg_class as relation
    join pg_namespace as namespace on namespace.oid = relation.relnamespace
    where namespace.nspname = 'public' and relation.relname = 'security_audit_events'
  ),
  'security audit events has RLS enabled and forced'
);

select is((select count(*) from public.cities), 13::bigint, 'the reviewed city seed is present');
select is(
  (select count(*) from public.cities where center is null),
  0::bigint,
  'every seeded city has a PostGIS center'
);
select has_index(
  'public',
  'cities',
  'cities_center_gist_idx',
  'cities has the required spatial index'
);
select has_index(
  'public',
  'profiles',
  'profiles_handle_lower_uidx',
  'profiles has a case-insensitive unique handle index'
);
select has_index(
  'public',
  'user_blocks',
  'user_blocks_blocked_blocker_idx',
  'blocks are indexed in the reverse direction'
);

select is(
  enum_range(null::public.platform_role)::text,
  '{moderator,admin}',
  'platform roles are limited to moderator and admin'
);

select throws_ok(
  $$insert into public.cities (slug, name_en, center) select 'invalid slug', 'Constraint City', center from public.cities where slug = 'haifa'$$,
  '23514',
  'new row for relation "cities" violates check constraint "cities_slug_format_check"',
  'city slugs enforce the normalized format constraint'
);
select throws_ok(
  $$insert into public.cities (slug, name_en, center) select 'constraint-city-name', 'X', center from public.cities where slug = 'haifa'$$,
  '23514',
  'new row for relation "cities" violates check constraint "cities_name_en_length_check"',
  'city names enforce the trimmed length constraint'
);
select throws_ok(
  $$insert into public.cities (slug, name_en, center) select 'haifa', 'Duplicate Haifa', center from public.cities where slug = 'haifa'$$,
  '23505',
  'duplicate key value violates unique constraint "cities_slug_key"',
  'city slugs remain unique'
);

select ok(not has_table_privilege('anon', 'public.profiles', 'select'), 'anonymous cannot read profile rows');
select ok(has_table_privilege('authenticated', 'public.profiles', 'select'), 'authenticated owners can read their profile row');
select ok(not has_table_privilege('authenticated', 'public.profiles', 'update'), 'profiles cannot be forged with direct updates');
select ok(not has_table_privilege('authenticated', 'public.profiles', 'insert'), 'profiles cannot be forged with direct inserts');
select ok(not has_table_privilege('authenticated', 'public.platform_roles', 'select'), 'ordinary users cannot enumerate platform roles');
select ok(not has_table_privilege('authenticated', 'public.security_audit_events', 'select'), 'ordinary users cannot enumerate security audit events');
select ok(not has_table_privilege('authenticated', 'public.user_blocks', 'insert'), 'blocks cannot be forged with direct inserts');
select ok(not has_function_privilege('anon', 'public.complete_profile(text,text,text,text,boolean,integer)', 'execute'), 'anonymous cannot complete a profile');
select ok(has_function_privilege('authenticated', 'public.complete_profile(text,text,text,text,boolean,integer)', 'execute'), 'authenticated users may invoke controlled onboarding');
select ok(not has_function_privilege('anon', 'public.block_user(text,uuid)', 'execute'), 'anonymous cannot block a user');
select ok(not has_function_privilege('authenticated', 'private.assert_actor(boolean)', 'execute'), 'the actor assertion helper is not directly exposed');

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
  (
    '00000000-0000-0000-0000-000000000000',
    '10000000-0000-4000-8000-000000000001',
    'authenticated',
    'authenticated',
    'one@example.com',
    statement_timestamp(),
    '{}'::jsonb,
    '{}'::jsonb,
    statement_timestamp(),
    statement_timestamp()
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    '10000000-0000-4000-8000-000000000002',
    'authenticated',
    'authenticated',
    'two@example.com',
    statement_timestamp(),
    '{}'::jsonb,
    '{}'::jsonb,
    statement_timestamp(),
    statement_timestamp()
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    '10000000-0000-4000-8000-000000000003',
    'authenticated',
    'authenticated',
    'unverified@example.com',
    null,
    '{}'::jsonb,
    '{}'::jsonb,
    statement_timestamp(),
    statement_timestamp()
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    '10000000-0000-4000-8000-000000000004',
    'authenticated',
    'authenticated',
    'incomplete@example.com',
    statement_timestamp(),
    '{}'::jsonb,
    '{}'::jsonb,
    statement_timestamp(),
    statement_timestamp()
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    '10000000-0000-4000-8000-000000000005',
    'authenticated',
    'authenticated',
    'suspended@example.com',
    statement_timestamp(),
    '{}'::jsonb,
    '{}'::jsonb,
    statement_timestamp(),
    statement_timestamp()
  );

select is(
  (select count(*) from public.profiles where id::text like '10000000-%'),
  5::bigint,
  'the Auth trigger creates one empty profile per user'
);

select throws_ok(
  $$update public.profiles set handle = 'Invalid Handle' where id = '10000000-0000-4000-8000-000000000004'$$,
  '23514',
  'new row for relation "profiles" violates check constraint "profiles_handle_format_check"',
  'profile handles enforce the normalized format constraint'
);
select throws_ok(
  $$update public.profiles set display_name = 'X' where id = '10000000-0000-4000-8000-000000000004'$$,
  '23514',
  'new row for relation "profiles" violates check constraint "profiles_display_name_length_check"',
  'profile display names enforce the trimmed length constraint'
);
select throws_ok(
  $$update public.profiles set bio = '' where id = '10000000-0000-4000-8000-000000000004'$$,
  '23514',
  'new row for relation "profiles" violates check constraint "profiles_bio_length_check"',
  'profile biographies enforce the trimmed length constraint'
);
select throws_ok(
  $$update public.profiles set rules_version = 1 where id = '10000000-0000-4000-8000-000000000004'$$,
  '23514',
  'new row for relation "profiles" violates check constraint "profiles_rules_acceptance_pair_check"',
  'rules version and acceptance time must be recorded together'
);
select throws_ok(
  $$update public.profiles set profile_completed_at = statement_timestamp() where id = '10000000-0000-4000-8000-000000000004'$$,
  '23514',
  'new row for relation "profiles" violates check constraint "profiles_completion_fields_check"',
  'profile completion requires every protected completion field'
);
select throws_ok(
  $$insert into public.profiles (id) values ('20000000-0000-4000-8000-000000000001')$$,
  '23503',
  'insert or update on table "profiles" violates foreign key constraint "profiles_id_fkey"',
  'profiles must reference an Auth user'
);
select throws_ok(
  $$update public.profiles set city_id = '20000000-0000-4000-8000-000000000002' where id = '10000000-0000-4000-8000-000000000004'$$,
  '23503',
  'insert or update on table "profiles" violates foreign key constraint "profiles_city_id_fkey"',
  'profile city choices must reference the city catalog'
);

set local role authenticated;
set local "request.jwt.claim.sub" = '10000000-0000-4000-8000-000000000003';
select throws_ok(
  $$select * from public.complete_profile('unverified', 'Unverified Fan', 'haifa', '', true, 1)$$,
  'P0001',
  'EMAIL_NOT_VERIFIED',
  'an unverified account cannot complete onboarding'
);

set local "request.jwt.claim.sub" = '10000000-0000-4000-8000-000000000001';
select throws_ok(
  $$select * from public.complete_profile('fan_one', 'Fan One', 'haifa', '', false, 1)$$,
  'P0001',
  'ADULT_ATTESTATION_REQUIRED',
  'adult attestation is required by the database function'
);
select throws_ok(
  $$select * from public.complete_profile('fan_one', 'Fan One', 'haifa', '', true, 0)$$,
  'P0001',
  'RULES_ACCEPTANCE_REQUIRED',
  'the current rules version is required by the database function'
);
select throws_ok(
  $$select * from public.complete_profile('fan_one', 'Fan One', 'missing-city', '', true, 1)$$,
  'P0001',
  'VALIDATION_FAILED',
  'an inactive or unknown city is rejected'
);
select lives_ok(
  $$select * from public.complete_profile('Fan_One', 'Fan One', 'haifa', 'Football and friends.', true, 1)$$,
  'a verified adult can complete onboarding'
);

set local "request.jwt.claim.sub" = '10000000-0000-4000-8000-000000000002';
select throws_ok(
  $$select * from public.complete_profile('fan_one', 'Fan Two', 'netanya', '', true, 1)$$,
  'P0001',
  'HANDLE_UNAVAILABLE',
  'case-insensitive duplicate handles are rejected'
);
select lives_ok(
  $$select * from public.complete_profile('fan_two', 'Fan Two', 'netanya', '', true, 1)$$,
  'a second user can choose a distinct handle'
);

set local "request.jwt.claim.sub" = '10000000-0000-4000-8000-000000000005';
select lives_ok(
  $$select * from public.complete_profile('suspended_fan', 'Suspended Fan', 'ashdod', '', true, 1)$$,
  'the suspension fixture completes before platform suspension'
);
reset role;

select throws_ok(
  $$update public.profiles set handle = 'fan_one' where id = '10000000-0000-4000-8000-000000000004'$$,
  '23505',
  'duplicate key value violates unique constraint "profiles_handle_lower_uidx"',
  'the database rejects duplicate normalized profile handles'
);

update public.profiles
set suspended_at = statement_timestamp()
where id = '10000000-0000-4000-8000-000000000005';

select is(
  (select handle from public.profiles where id = '10000000-0000-4000-8000-000000000001'),
  'fan_one',
  'handles are normalized to lowercase'
);
select ok(
  (
    select adult_attested_at is not null
      and rules_version = 1
      and rules_accepted_at is not null
      and profile_completed_at is not null
    from public.profiles
    where id = '10000000-0000-4000-8000-000000000001'
  ),
  'completion timestamps are derived only after all required fields pass'
);

set local role authenticated;
set local "request.jwt.claim.sub" = '10000000-0000-4000-8000-000000000001';
select is((select count(*) from public.profiles), 1::bigint, 'an owner reads only their own full profile row');
select throws_ok(
  $$update public.profiles set profile_completed_at = statement_timestamp() where id = '10000000-0000-4000-8000-000000000004'$$,
  '42501',
  'permission denied for table profiles',
  'a crafted direct update cannot forge another profile completion'
);
reset role;

set local role anon;
select is(
  (select count(*) from public.get_public_profile_by_handle('fan_one')),
  1::bigint,
  'anonymous visitors can read a completed safe profile projection'
);
select is(
  (
    select array_agg(field_name order by field_name)
    from public.get_public_profile_by_handle('fan_one') as summary,
      lateral jsonb_object_keys(to_jsonb(summary)) as field_name
  ),
  array[
    'bio',
    'city_name',
    'display_name',
    'friendship_direction',
    'friendship_id',
    'friendship_status',
    'handle',
    'member_since',
    'viewer_has_blocked'
  ]::text[],
  'the public projection exposes only the reviewed safe fields'
);
select is(
  (select count(*) from public.get_public_profile_by_handle('suspended_fan')),
  0::bigint,
  'a suspended profile is non-enumerating not found'
);
reset role;

insert into public.platform_roles (profile_id, role)
values ('10000000-0000-4000-8000-000000000001', 'moderator');
select throws_ok(
  $$insert into public.platform_roles (profile_id, role) values ('10000000-0000-4000-8000-000000000001', 'moderator')$$,
  '23505',
  'duplicate key value violates unique constraint "platform_roles_pkey"',
  'a profile cannot receive the same platform role twice'
);
select throws_ok(
  $$insert into public.platform_roles (profile_id, role) values ('20000000-0000-4000-8000-000000000003', 'admin')$$,
  '23503',
  'insert or update on table "platform_roles" violates foreign key constraint "platform_roles_profile_id_fkey"',
  'platform roles must reference a profile'
);
select ok(
  private.has_platform_role(
    '10000000-0000-4000-8000-000000000001',
    array['moderator']::public.platform_role[]
  ),
  'the private helper answers a bounded moderator authorization question'
);

select throws_ok(
  $$insert into public.user_blocks (blocker_id, blocked_id) values ('10000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001')$$,
  '23514',
  'new row for relation "user_blocks" violates check constraint "user_blocks_not_self_check"',
  'the block table rejects self-block rows directly'
);
select throws_ok(
  $$insert into public.user_blocks (blocker_id, blocked_id) values ('20000000-0000-4000-8000-000000000004', '10000000-0000-4000-8000-000000000001')$$,
  '23503',
  'insert or update on table "user_blocks" violates foreign key constraint "user_blocks_blocker_id_fkey"',
  'a block must reference an existing blocker profile'
);
select throws_ok(
  $$insert into public.user_blocks (blocker_id, blocked_id) values ('10000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000005')$$,
  '23503',
  'insert or update on table "user_blocks" violates foreign key constraint "user_blocks_blocked_id_fkey"',
  'a block must reference an existing blocked profile'
);

set local role authenticated;
set local "request.jwt.claim.sub" = '10000000-0000-4000-8000-000000000003';
select throws_ok(
  $$select public.block_user('fan_one', null)$$,
  'P0001',
  'EMAIL_NOT_VERIFIED',
  'an unverified actor cannot perform the community block mutation'
);

set local "request.jwt.claim.sub" = '10000000-0000-4000-8000-000000000004';
select throws_ok(
  $$select public.block_user('fan_one', null)$$,
  'P0001',
  'ADULT_ATTESTATION_REQUIRED',
  'an incomplete actor cannot perform the community block mutation'
);

set local "request.jwt.claim.sub" = '10000000-0000-4000-8000-000000000005';
select throws_ok(
  $$select public.block_user('fan_one', null)$$,
  'P0001',
  'ACCOUNT_SUSPENDED',
  'a suspended actor cannot perform the community block mutation'
);

set local "request.jwt.claim.sub" = '10000000-0000-4000-8000-000000000001';
select throws_ok(
  $$select public.block_user('fan_one', null)$$,
  'P0001',
  'NOT_ALLOWED',
  'self-block is rejected'
);
select is(
  public.block_user('fan_two', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'),
  true,
  'a complete actor can block another profile'
);
select is(
  public.block_user('fan_two', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'),
  false,
  'a duplicate block is an idempotent no-change result'
);
select is((select count(*) from public.user_blocks), 1::bigint, 'the blocker can read their own outgoing block');

set local "request.jwt.claim.sub" = '10000000-0000-4000-8000-000000000002';
select is((select count(*) from public.user_blocks), 0::bigint, 'the blocked user cannot enumerate who blocked them');
select is(
  public.unblock_user('fan_one', 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'),
  false,
  'the blocked user cannot remove the other person block'
);
reset role;

select throws_ok(
  $$insert into public.user_blocks (blocker_id, blocked_id) values ('10000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000002')$$,
  '23505',
  'duplicate key value violates unique constraint "user_blocks_pkey"',
  'the database rejects duplicate directional block pairs'
);

select ok(
  private.users_are_blocked(
    '10000000-0000-4000-8000-000000000001',
    '10000000-0000-4000-8000-000000000002'
  ),
  'the reusable helper detects a block in either direction'
);
select is(
  (
    select count(*)
    from public.security_audit_events
    where actor_id = '10000000-0000-4000-8000-000000000001'
      and action = 'user.block'
      and resource_id = '10000000-0000-4000-8000-000000000002'
      and request_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
      and metadata = jsonb_build_object(
        'friendship_removed', false,
        'invitations_revoked', 0,
        'attendance_ended', 0
      )
  ),
  1::bigint,
  'a successful block writes one minimal audit record without notification data'
);

set local role authenticated;
set local "request.jwt.claim.sub" = '10000000-0000-4000-8000-000000000001';
select is(
  public.unblock_user('fan_two', 'dddddddd-dddd-4ddd-8ddd-dddddddddddd'),
  true,
  'the blocker can remove their own outgoing block'
);
reset role;

select ok(
  not private.users_are_blocked(
    '10000000-0000-4000-8000-000000000001',
    '10000000-0000-4000-8000-000000000002'
  ),
  'the bidirectional helper reflects the unblock immediately'
);
select is(
  (
    select count(*)
    from public.security_audit_events
    where actor_id = '10000000-0000-4000-8000-000000000001'
      and action = 'user.unblock'
      and resource_id = '10000000-0000-4000-8000-000000000002'
      and request_id = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd'
  ),
  1::bigint,
  'a successful unblock writes one minimal audit record'
);
select throws_ok(
  $$insert into public.security_audit_events (action, resource_type, outcome) values ('Invalid Action', 'profile', 'denied')$$,
  '23514',
  'new row for relation "security_audit_events" violates check constraint "security_audit_action_format_check"',
  'audit actions enforce the bounded normalized format'
);
select throws_ok(
  $$insert into public.security_audit_events (action, resource_type, outcome) values ('test.event', 'invalid type', 'denied')$$,
  '23514',
  'new row for relation "security_audit_events" violates check constraint "security_audit_resource_type_format_check"',
  'audit resource types enforce the bounded normalized format'
);
select throws_ok(
  $$insert into public.security_audit_events (action, resource_type, outcome) values ('test.event', 'profile', 'failed')$$,
  '23514',
  'new row for relation "security_audit_events" violates check constraint "security_audit_outcome_check"',
  'audit outcomes are limited to the reviewed states'
);
select throws_ok(
  $$insert into public.security_audit_events (action, resource_type, outcome, metadata) values ('test.event', 'profile', 'denied', '[]'::jsonb)$$,
  '23514',
  'new row for relation "security_audit_events" violates check constraint "security_audit_metadata_object_check"',
  'audit metadata must be a JSON object'
);
select throws_ok(
  $$insert into public.security_audit_events (action, resource_type, outcome, metadata) values ('test.event', 'profile', 'denied', jsonb_build_object('note', repeat('x', 2050)))$$,
  '23514',
  'new row for relation "security_audit_events" violates check constraint "security_audit_metadata_size_check"',
  'audit metadata enforces its byte-size ceiling'
);
select throws_ok(
  $$insert into public.security_audit_events (action, resource_type, outcome, metadata) values ('test.event', 'profile', 'denied', '{"token":"secret"}'::jsonb)$$,
  '23514',
  'new row for relation "security_audit_events" violates check constraint "security_audit_metadata_safe_keys_check"',
  'audit metadata rejects sensitive key names'
);
select throws_ok(
  $$insert into public.security_audit_events (actor_id, action, resource_type, outcome) values ('20000000-0000-4000-8000-000000000006', 'test.event', 'profile', 'denied')$$,
  '23503',
  'insert or update on table "security_audit_events" violates foreign key constraint "security_audit_events_actor_id_fkey"',
  'audit actors must reference a profile when present'
);

select * from finish();
rollback;
