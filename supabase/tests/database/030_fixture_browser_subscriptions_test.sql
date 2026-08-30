begin;

create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public, pg_catalog;

select no_plan();

select has_table('public', 'subscriptions', 'B04 creates provider-neutral follows');
select is(
  enum_range(null::public.subscription_kind)::text,
  '{sport,competition,team}',
  'subscription kinds are limited to catalog target types'
);
select ok(
  (
    select relation.relrowsecurity and relation.relforcerowsecurity
    from pg_class as relation
    join pg_namespace as namespace on namespace.oid = relation.relnamespace
    where namespace.nspname = 'public'
      and relation.relname = 'subscriptions'
  ),
  'subscriptions has RLS enabled and forced'
);

select has_index('public', 'subscriptions', 'subscriptions_user_sport_uidx', 'sport follows have a partial unique index');
select has_index('public', 'subscriptions', 'subscriptions_user_competition_uidx', 'competition follows have a partial unique index');
select has_index('public', 'subscriptions', 'subscriptions_user_team_uidx', 'team follows have a partial unique index');
select has_index('public', 'subscriptions', 'subscriptions_user_created_idx', 'own follows have a bounded listing index');
select has_index('public', 'subscriptions', 'subscriptions_sport_user_idx', 'sport targets support reverse lookup');
select has_index('public', 'subscriptions', 'subscriptions_competition_user_idx', 'competition targets support reverse lookup');
select has_index('public', 'subscriptions', 'subscriptions_team_user_idx', 'team targets support reverse lookup');

select ok(not has_table_privilege('anon', 'public.subscriptions', 'select'), 'anonymous visitors cannot enumerate follows');
select ok(has_table_privilege('authenticated', 'public.subscriptions', 'select'), 'authenticated users may read their own follows');
select ok(has_table_privilege('authenticated', 'public.subscriptions', 'insert'), 'eligible authenticated users may insert their own follows');
select ok(has_table_privilege('authenticated', 'public.subscriptions', 'delete'), 'eligible authenticated users may delete their own follows');
select ok(not has_table_privilege('authenticated', 'public.subscriptions', 'update'), 'follow rows cannot be retargeted with updates');
select ok(not has_function_privilege('anon', 'public.current_actor_is_community_eligible()', 'execute'), 'anonymous callers cannot invoke the community gate');
select ok(has_function_privilege('authenticated', 'public.current_actor_is_community_eligible()', 'execute'), 'authenticated sessions may evaluate only their own community gate');

insert into public.competitions (
  id,
  sport_id,
  provider,
  provider_external_id,
  code,
  name,
  country_name,
  last_synced_at
)
values (
  '40000000-0000-4000-8000-000000000001',
  '00000000-0000-4000-8000-000000000020',
  'b04-test',
  'competition-1',
  'B04',
  'B04 Test League',
  'Israel',
  statement_timestamp()
);

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
values
  (
    '40000000-0000-4000-8000-000000000002',
    '00000000-0000-4000-8000-000000000020',
    'b04-test',
    'team-1',
    'B04 Team One',
    'Team One',
    'ONE',
    'Israel',
    true,
    statement_timestamp()
  ),
  (
    '40000000-0000-4000-8000-000000000003',
    '00000000-0000-4000-8000-000000000020',
    'b04-test',
    'team-2',
    'B04 Team Two',
    'Team Two',
    'TWO',
    'Israel',
    true,
    statement_timestamp()
  ),
  (
    '40000000-0000-4000-8000-000000000004',
    '00000000-0000-4000-8000-000000000020',
    'b04-test',
    'inactive-team',
    'B04 Inactive Team',
    'Inactive',
    'OFF',
    'Israel',
    false,
    statement_timestamp()
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
values
  (
    '00000000-0000-0000-0000-000000000000',
    '40000000-0000-4000-8000-000000000101',
    'authenticated',
    'authenticated',
    'b04-one@example.com',
    statement_timestamp(),
    '{}'::jsonb,
    '{}'::jsonb,
    statement_timestamp(),
    statement_timestamp()
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    '40000000-0000-4000-8000-000000000102',
    'authenticated',
    'authenticated',
    'b04-two@example.com',
    statement_timestamp(),
    '{}'::jsonb,
    '{}'::jsonb,
    statement_timestamp(),
    statement_timestamp()
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    '40000000-0000-4000-8000-000000000103',
    'authenticated',
    'authenticated',
    'b04-incomplete@example.com',
    statement_timestamp(),
    '{}'::jsonb,
    '{}'::jsonb,
    statement_timestamp(),
    statement_timestamp()
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    '40000000-0000-4000-8000-000000000104',
    'authenticated',
    'authenticated',
    'b04-suspended@example.com',
    statement_timestamp(),
    '{}'::jsonb,
    '{}'::jsonb,
    statement_timestamp(),
    statement_timestamp()
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    '40000000-0000-4000-8000-000000000105',
    'authenticated',
    'authenticated',
    'b04-unverified@example.com',
    null,
    '{}'::jsonb,
    '{}'::jsonb,
    statement_timestamp(),
    statement_timestamp()
  );

update public.profiles
set handle = case id
      when '40000000-0000-4000-8000-000000000101' then 'b04_one'
      when '40000000-0000-4000-8000-000000000102' then 'b04_two'
      when '40000000-0000-4000-8000-000000000104' then 'b04_suspended'
      when '40000000-0000-4000-8000-000000000105' then 'b04_unverified'
    end,
    display_name = case id
      when '40000000-0000-4000-8000-000000000101' then 'B04 One'
      when '40000000-0000-4000-8000-000000000102' then 'B04 Two'
      when '40000000-0000-4000-8000-000000000104' then 'B04 Suspended'
      when '40000000-0000-4000-8000-000000000105' then 'B04 Unverified'
    end,
    city_id = '00000000-0000-4000-8000-000000000001',
    adult_attested_at = statement_timestamp(),
    rules_version = 1,
    rules_accepted_at = statement_timestamp(),
    profile_completed_at = statement_timestamp(),
    fan_enabled_at = statement_timestamp()
where id in (
  '40000000-0000-4000-8000-000000000101',
  '40000000-0000-4000-8000-000000000102',
  '40000000-0000-4000-8000-000000000104',
  '40000000-0000-4000-8000-000000000105'
);

update public.profiles
set suspended_at = statement_timestamp()
where id = '40000000-0000-4000-8000-000000000104';

select throws_ok(
  $$insert into public.subscriptions (user_id, kind, team_id) values ('40000000-0000-4000-8000-000000000101', 'sport', '40000000-0000-4000-8000-000000000002')$$,
  '23514',
  'new row for relation "subscriptions" violates check constraint "subscriptions_kind_target_check"',
  'kind must match exactly one populated target'
);
select throws_ok(
  $$insert into public.subscriptions (user_id, kind, sport_id) values ('49999999-0000-4000-8000-000000000101', 'sport', '00000000-0000-4000-8000-000000000020')$$,
  '23503',
  'insert or update on table "subscriptions" violates foreign key constraint "subscriptions_user_id_fkey"',
  'subscriptions must reference a profile'
);
select throws_ok(
  $$insert into public.subscriptions (user_id, kind, sport_id) values ('40000000-0000-4000-8000-000000000101', 'sport', '49999999-0000-4000-8000-000000000020')$$,
  '23503',
  'insert or update on table "subscriptions" violates foreign key constraint "subscriptions_sport_id_fkey"',
  'sport subscriptions must reference the catalog'
);
select throws_ok(
  $$insert into public.subscriptions (user_id, kind, competition_id) values ('40000000-0000-4000-8000-000000000101', 'competition', '49999999-0000-4000-8000-000000000001')$$,
  '23503',
  'insert or update on table "subscriptions" violates foreign key constraint "subscriptions_competition_id_fkey"',
  'competition subscriptions must reference the catalog'
);
select throws_ok(
  $$insert into public.subscriptions (user_id, kind, team_id) values ('40000000-0000-4000-8000-000000000101', 'team', '49999999-0000-4000-8000-000000000002')$$,
  '23503',
  'insert or update on table "subscriptions" violates foreign key constraint "subscriptions_team_id_fkey"',
  'team subscriptions must reference the catalog'
);

insert into public.subscriptions (id, user_id, kind, sport_id)
values (
  '40000000-0000-4000-8000-000000000201',
  '40000000-0000-4000-8000-000000000101',
  'sport',
  '00000000-0000-4000-8000-000000000020'
);
insert into public.subscriptions (user_id, kind, competition_id)
values (
  '40000000-0000-4000-8000-000000000101',
  'competition',
  '40000000-0000-4000-8000-000000000001'
);
insert into public.subscriptions (user_id, kind, team_id)
values (
  '40000000-0000-4000-8000-000000000101',
  'team',
  '40000000-0000-4000-8000-000000000002'
);

select throws_ok(
  $$insert into public.subscriptions (id, user_id, kind, team_id) values ('40000000-0000-4000-8000-000000000201', '40000000-0000-4000-8000-000000000102', 'team', '40000000-0000-4000-8000-000000000003')$$,
  '23505',
  'duplicate key value violates unique constraint "subscriptions_pkey"',
  'subscription IDs remain unique'
);
select throws_ok(
  $$insert into public.subscriptions (user_id, kind, sport_id) values ('40000000-0000-4000-8000-000000000101', 'sport', '00000000-0000-4000-8000-000000000020')$$,
  '23505',
  'duplicate key value violates unique constraint "subscriptions_user_sport_uidx"',
  'a user cannot follow the same sport twice'
);
select throws_ok(
  $$insert into public.subscriptions (user_id, kind, competition_id) values ('40000000-0000-4000-8000-000000000101', 'competition', '40000000-0000-4000-8000-000000000001')$$,
  '23505',
  'duplicate key value violates unique constraint "subscriptions_user_competition_uidx"',
  'a user cannot follow the same competition twice'
);
select throws_ok(
  $$insert into public.subscriptions (user_id, kind, team_id) values ('40000000-0000-4000-8000-000000000101', 'team', '40000000-0000-4000-8000-000000000002')$$,
  '23505',
  'duplicate key value violates unique constraint "subscriptions_user_team_uidx"',
  'a user cannot follow the same team twice'
);

delete from public.subscriptions;

insert into public.subscriptions (user_id, kind, team_id)
values
  ('40000000-0000-4000-8000-000000000103', 'team', '40000000-0000-4000-8000-000000000002'),
  ('40000000-0000-4000-8000-000000000104', 'team', '40000000-0000-4000-8000-000000000003');

set local role authenticated;
set local "request.jwt.claim.sub" = '40000000-0000-4000-8000-000000000103';
select is(public.current_actor_is_community_eligible(), false, 'an incomplete actor fails the shared community gate');
select throws_ok(
  $$insert into public.subscriptions (user_id, kind, sport_id) values ('40000000-0000-4000-8000-000000000103', 'sport', '00000000-0000-4000-8000-000000000020')$$,
  '42501',
  'new row violates row-level security policy for table "subscriptions"',
  'an incomplete actor cannot follow a target'
);
delete from public.subscriptions where user_id = '40000000-0000-4000-8000-000000000103';
select is((select count(*) from public.subscriptions), 1::bigint, 'an incomplete actor cannot remove an existing follow');

set local "request.jwt.claim.sub" = '40000000-0000-4000-8000-000000000104';
select is(public.current_actor_is_community_eligible(), false, 'a suspended actor fails the shared community gate');
select throws_ok(
  $$insert into public.subscriptions (user_id, kind, sport_id) values ('40000000-0000-4000-8000-000000000104', 'sport', '00000000-0000-4000-8000-000000000020')$$,
  '42501',
  'new row violates row-level security policy for table "subscriptions"',
  'a suspended actor cannot follow a target'
);
delete from public.subscriptions where user_id = '40000000-0000-4000-8000-000000000104';
select is((select count(*) from public.subscriptions), 1::bigint, 'a suspended actor cannot remove an existing follow');

set local "request.jwt.claim.sub" = '40000000-0000-4000-8000-000000000105';
select is(public.current_actor_is_community_eligible(), false, 'an unverified actor fails the shared community gate');
select throws_ok(
  $$insert into public.subscriptions (user_id, kind, sport_id) values ('40000000-0000-4000-8000-000000000105', 'sport', '00000000-0000-4000-8000-000000000020')$$,
  '42501',
  'new row violates row-level security policy for table "subscriptions"',
  'an unverified actor cannot follow a target'
);

reset role;
delete from public.subscriptions where user_id in (
  '40000000-0000-4000-8000-000000000103',
  '40000000-0000-4000-8000-000000000104'
);

set local role authenticated;
set local "request.jwt.claim.sub" = '40000000-0000-4000-8000-000000000101';
select is(public.current_actor_is_community_eligible(), true, 'a complete actor passes the shared community gate');
select lives_ok(
  $$insert into public.subscriptions (user_id, kind, team_id) values ('40000000-0000-4000-8000-000000000101', 'team', '40000000-0000-4000-8000-000000000002')$$,
  'a complete actor can follow an active target'
);
select throws_ok(
  $$insert into public.subscriptions (user_id, kind, team_id) values ('40000000-0000-4000-8000-000000000101', 'team', '40000000-0000-4000-8000-000000000004')$$,
  '42501',
  'new row violates row-level security policy for table "subscriptions"',
  'an inactive target cannot be followed'
);
select throws_ok(
  $$insert into public.subscriptions (user_id, kind, team_id) values ('40000000-0000-4000-8000-000000000102', 'team', '40000000-0000-4000-8000-000000000003')$$,
  '42501',
  'new row violates row-level security policy for table "subscriptions"',
  'a complete actor cannot forge another user follow'
);
select is((select count(*) from public.subscriptions), 1::bigint, 'the owner reads their own follow');

set local "request.jwt.claim.sub" = '40000000-0000-4000-8000-000000000102';
select is((select count(*) from public.subscriptions), 0::bigint, 'another user cannot enumerate the owner follows');
delete from public.subscriptions where user_id = '40000000-0000-4000-8000-000000000101';
select is((select count(*) from public.subscriptions), 0::bigint, 'cross-user delete exposes no target rows');
reset role;

select is((select count(*) from public.subscriptions), 1::bigint, 'cross-user delete leaves the owner row intact');

set local role authenticated;
set local "request.jwt.claim.sub" = '40000000-0000-4000-8000-000000000101';
delete from public.subscriptions where team_id = '40000000-0000-4000-8000-000000000002';
select is((select count(*) from public.subscriptions), 0::bigint, 'an eligible owner can unfollow their own target');
reset role;

select * from finish();
rollback;
