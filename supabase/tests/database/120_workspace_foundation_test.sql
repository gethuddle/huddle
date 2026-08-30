begin;

create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public, pg_catalog;

select no_plan();

select has_column('public', 'profiles', 'fan_enabled_at', 'Fan activation is explicit');
select has_table('public', 'venue_memberships', 'Venue authorization uses memberships');
select isnt(
  to_regprocedure('private.profile_is_common_eligible(uuid)'),
  null::regprocedure,
  'common eligibility has a dedicated predicate'
);
select isnt(
  to_regprocedure('private.profile_is_fan_eligible(uuid)'),
  null::regprocedure,
  'Fan eligibility has a dedicated predicate'
);
select isnt(
  to_regprocedure('private.actor_manages_venue(uuid,uuid)'),
  null::regprocedure,
  'Venue management has a membership-aware predicate'
);
select isnt(
  to_regprocedure('public.list_my_workspaces()'),
  null::regprocedure,
  'workspace recovery has a bounded projection'
);
select isnt(
  to_regprocedure('public.activate_fan_workspace(text,text,text,text,boolean,integer)'),
  null::regprocedure,
  'Fan activation has an explicit controlled function'
);

select ok(
  (
    select relation.relrowsecurity and relation.relforcerowsecurity
    from pg_class as relation
    join pg_namespace as namespace on namespace.oid = relation.relnamespace
    where namespace.nspname = 'public'
      and relation.relname = 'venue_memberships'
  ),
  'venue memberships have RLS enabled and forced'
);
select ok(
  has_table_privilege('authenticated', 'public.venue_memberships', 'select'),
  'authenticated actors can read their own safe membership rows through RLS'
);
select ok(
  not has_table_privilege('authenticated', 'public.venue_memberships', 'insert'),
  'authenticated actors cannot insert memberships directly'
);
select ok(
  not has_table_privilege('authenticated', 'public.venue_memberships', 'update'),
  'authenticated actors cannot update memberships directly'
);
select ok(
  not has_table_privilege('authenticated', 'public.venue_memberships', 'delete'),
  'authenticated actors cannot delete memberships directly'
);
select ok(
  has_function_privilege(
    'authenticated',
    'public.activate_fan_workspace(text,text,text,text,boolean,integer)',
    'execute'
  ),
  'authenticated actors can activate a Fan workspace through the controlled function'
);
select ok(
  not has_function_privilege(
    'anon',
    'public.activate_fan_workspace(text,text,text,text,boolean,integer)',
    'execute'
  ),
  'anonymous actors cannot activate a Fan workspace'
);
select ok(
  not has_function_privilege(
    'authenticated',
    'private.actor_manages_venue(uuid,uuid)',
    'execute'
  ),
  'the Venue authorization predicate is not directly exposed'
);
select is(
  (
    select count(*)
    from public.profiles
    where profile_completed_at is not null
      and fan_enabled_at is null
  ),
  0::bigint,
  'existing completed profiles receive Fan activation during migration'
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
  statement_timestamp(),
  statement_timestamp()
from (
  values
    ('c2000000-0000-4000-8000-000000000101'::uuid, 'workspace-fan@example.com'),
    ('c2000000-0000-4000-8000-000000000102'::uuid, 'workspace-venue-only@example.com'),
    ('c2000000-0000-4000-8000-000000000103'::uuid, 'workspace-operator@example.com'),
    ('c2000000-0000-4000-8000-000000000104'::uuid, 'workspace-revoked@example.com'),
    ('c2000000-0000-4000-8000-000000000105'::uuid, 'workspace-suspended@example.com'),
    ('c2000000-0000-4000-8000-000000000106'::uuid, 'workspace-unrelated@example.com'),
    ('c2000000-0000-4000-8000-000000000107'::uuid, 'workspace-legacy@example.com')
) as fixture(id, email);

update public.profiles
set
  adult_attested_at = statement_timestamp(),
  rules_version = 1,
  rules_accepted_at = statement_timestamp()
where id between
  'c2000000-0000-4000-8000-000000000101' and
  'c2000000-0000-4000-8000-000000000107';

update public.profiles
set
  handle = case id
    when 'c2000000-0000-4000-8000-000000000101' then 'workspace_fan'
    when 'c2000000-0000-4000-8000-000000000103' then 'workspace_operator'
    when 'c2000000-0000-4000-8000-000000000104' then 'workspace_revoked'
    when 'c2000000-0000-4000-8000-000000000105' then 'workspace_suspended'
    else 'workspace_unrelated'
  end,
  display_name = 'Workspace ' || right(id::text, 3),
  city_id = (select id from public.cities where slug = 'haifa'),
  profile_completed_at = statement_timestamp(),
  fan_enabled_at = statement_timestamp()
where id in (
  'c2000000-0000-4000-8000-000000000101',
  'c2000000-0000-4000-8000-000000000103',
  'c2000000-0000-4000-8000-000000000104',
  'c2000000-0000-4000-8000-000000000105',
  'c2000000-0000-4000-8000-000000000106'
);

update public.profiles
set suspended_at = statement_timestamp()
where id = 'c2000000-0000-4000-8000-000000000105';

insert into public.venues (
  id, owner_id, slug, name, city_id, address_text, location, description
)
values
  (
    'c2000000-0000-4000-8000-000000000201',
    'c2000000-0000-4000-8000-000000000103',
    'workspace-operator-venue',
    'Workspace Operator Venue',
    (select id from public.cities where slug = 'haifa'),
    '12 Workspace Street, Haifa',
    extensions.st_setsrid(extensions.st_makepoint(34.998, 32.812), 4326)::extensions.geography,
    'A venue used to verify membership-aware workspace authorization.'
  ),
  (
    'c2000000-0000-4000-8000-000000000202',
    'c2000000-0000-4000-8000-000000000102',
    'workspace-venue-only',
    'Workspace Venue Only',
    (select id from public.cities where slug = 'haifa'),
    '13 Workspace Street, Haifa',
    extensions.st_setsrid(extensions.st_makepoint(34.999, 32.813), 4326)::extensions.geography,
    'A venue owned by a common-eligible operator without a public Fan identity.'
  );

insert into public.venue_memberships (venue_id, user_id, role, status, revoked_at)
values (
  'c2000000-0000-4000-8000-000000000201',
  'c2000000-0000-4000-8000-000000000104',
  'admin',
  'revoked',
  statement_timestamp()
);

select ok(
  private.profile_is_common_eligible('c2000000-0000-4000-8000-000000000102'),
  'venue-only operator is common eligible'
);
select ok(
  not private.profile_is_fan_eligible('c2000000-0000-4000-8000-000000000102'),
  'venue-only operator is not a Fan'
);
select ok(
  private.profile_is_fan_eligible('c2000000-0000-4000-8000-000000000101'),
  'completed existing Fan is Fan eligible'
);
select ok(
  private.actor_manages_venue(
    'c2000000-0000-4000-8000-000000000103',
    'c2000000-0000-4000-8000-000000000201'
  ),
  'active owner manages venue'
);
select ok(
  not private.actor_manages_venue(
    'c2000000-0000-4000-8000-000000000104',
    'c2000000-0000-4000-8000-000000000201'
  ),
  'revoked admin does not manage venue'
);
select ok(
  not private.actor_manages_venue(
    'c2000000-0000-4000-8000-000000000106',
    'c2000000-0000-4000-8000-000000000201'
  ),
  'unrelated Fan does not manage venue'
);
select ok(
  not private.profile_is_common_eligible('c2000000-0000-4000-8000-000000000105'),
  'suspended account is not common eligible'
);
select ok(
  not private.actor_manages_venue(
    'c2000000-0000-4000-8000-000000000105',
    'c2000000-0000-4000-8000-000000000201'
  ),
  'suspended account cannot manage a venue'
);
select is(
  (
    select count(*)
    from public.venue_memberships
    where venue_id = 'c2000000-0000-4000-8000-000000000201'
      and role = 'owner'
      and status = 'active'
  ),
  1::bigint,
  'each venue has exactly one active owner membership'
);
select is(
  (
    select user_id
    from public.venue_memberships
    where venue_id = 'c2000000-0000-4000-8000-000000000201'
      and role = 'owner'
      and status = 'active'
  ),
  'c2000000-0000-4000-8000-000000000103'::uuid,
  'the active membership owner stays synchronized with venues.owner_id'
);
select throws_ok(
  $$update public.venue_memberships set status = 'revoked', revoked_at = statement_timestamp() where venue_id = 'c2000000-0000-4000-8000-000000000201' and user_id = 'c2000000-0000-4000-8000-000000000103'$$,
  '23514',
  'VENUE_ACTIVE_OWNER_REQUIRED',
  'the active owner cannot be revoked without an atomic owner transfer'
);
select throws_ok(
  $$insert into public.venue_memberships (venue_id, user_id, role) values ('c2000000-0000-4000-8000-000000000201', 'c2000000-0000-4000-8000-000000000106', 'owner')$$,
  '23514',
  'VENUE_OWNER_MISMATCH',
  'a venue cannot gain a second active owner'
);
select throws_ok(
  $$update public.profiles set fan_enabled_at = statement_timestamp() where id = 'c2000000-0000-4000-8000-000000000102'$$,
  '23514',
  null,
  'Fan activation cannot exist without a completed profile'
);

set local role authenticated;
set local "request.jwt.claim.sub" = 'c2000000-0000-4000-8000-000000000103';

select is(
  (select count(*) from public.venue_memberships),
  1::bigint,
  'membership RLS exposes only the current actor own safe rows'
);
select is(
  (select count(*) from public.list_my_workspaces()),
  2::bigint,
  'a Fan and Venue operator recovers both authorized workspaces'
);
select throws_ok(
  $$insert into public.venue_memberships (venue_id, user_id, role) values ('c2000000-0000-4000-8000-000000000201', 'c2000000-0000-4000-8000-000000000106', 'admin')$$,
  '42501',
  null,
  'authenticated clients cannot grant Venue membership directly'
);
select throws_ok(
  $$update public.venue_memberships set role = 'owner' where venue_id = 'c2000000-0000-4000-8000-000000000201' and user_id = 'c2000000-0000-4000-8000-000000000104'$$,
  '42501',
  null,
  'authenticated clients cannot change Venue roles directly'
);

set local "request.jwt.claim.sub" = 'c2000000-0000-4000-8000-000000000102';

select is(
  (select count(*) from public.list_my_workspaces()),
  1::bigint,
  'a venue-only common operator recovers only the owned Venue workspace'
);
select is(
  (select handle from public.profiles where id = auth.uid()),
  null::text,
  'venue-only onboarding does not invent a public Fan handle'
);
select lives_ok(
  $$select * from public.get_venue_for_management('workspace-venue-only')$$,
  'a venue-only common owner can load the concrete Venue management projection'
);
select is(
  (select count(*) from public.list_owned_venues(0, 50)),
  1::bigint,
  'the legacy managed-Venue list is membership-aware during transition'
);
select lives_ok(
  $$select * from public.activate_fan_workspace('workspace_venue_only', 'Workspace Venue Fan', 'haifa', '', true, 1)$$,
  'a common-eligible Venue operator can explicitly activate Fan later'
);
select ok(
  (select fan_enabled_at is not null from public.profiles where id = auth.uid()),
  'Fan activation sets fan_enabled_at only after all Fan fields validate'
);

set local "request.jwt.claim.sub" = 'c2000000-0000-4000-8000-000000000107';

select lives_ok(
  $$select * from public.complete_profile('workspace_legacy', 'Workspace Legacy', 'haifa', '', true, 1)$$,
  'the existing complete_profile signature remains a compatibility wrapper'
);
select ok(
  (select fan_enabled_at is not null from public.profiles where id = auth.uid()),
  'the compatibility wrapper activates the Fan workspace'
);

set local "request.jwt.claim.sub" = 'c2000000-0000-4000-8000-000000000105';

select is(
  (select count(*) from public.list_my_workspaces()),
  0::bigint,
  'a suspended actor receives no active workspace projection'
);

select * from finish();
rollback;
