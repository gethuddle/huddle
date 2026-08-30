begin;

create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public, pg_catalog;

select no_plan();

select isnt(
  to_regprocedure('public.accept_common_onboarding(boolean,integer)'),
  null::regprocedure,
  'common safety acceptance has a dedicated controlled function'
);
select ok(
  (
    select procedure.prosecdef
      and procedure.proconfig = array['search_path=""']::text[]
    from pg_proc as procedure
    join pg_namespace as namespace on namespace.oid = procedure.pronamespace
    where namespace.nspname = 'public'
      and procedure.oid = to_regprocedure('public.accept_common_onboarding(boolean,integer)')
  ),
  'common onboarding is security definer with an empty search path'
);
select ok(
  has_function_privilege(
    'authenticated', 'public.accept_common_onboarding(boolean,integer)', 'execute'
  )
  and not has_function_privilege(
    'anon', 'public.accept_common_onboarding(boolean,integer)', 'execute'
  ),
  'only authenticated actors may accept common safety onboarding'
);
select isnt(
  to_regprocedure('public.list_my_workspace_recovery()'),
  null::regprocedure,
  'stale common rules have a narrowly scoped existing-workspace recovery projection'
);
select ok(
  has_function_privilege('authenticated', 'public.list_my_workspace_recovery()', 'execute')
  and not has_function_privilege('anon', 'public.list_my_workspace_recovery()', 'execute'),
  'only authenticated actors may inspect their own recoverable workspaces'
);
select is(
  (
    select procedure.provolatile
    from pg_proc as procedure
    join pg_namespace as namespace on namespace.oid = procedure.pronamespace
    where namespace.nspname = 'public'
      and procedure.oid = to_regprocedure('public.get_venue_workspace(uuid)')
  ),
  'v'::"char",
  'the lock-taking Venue workspace projection is callable through PostgREST'
);
select is(
  (
    select procedure.provolatile
    from pg_proc as procedure
    join pg_namespace as namespace on namespace.oid = procedure.pronamespace
    where namespace.nspname = 'public'
      and procedure.oid = to_regprocedure('public.list_venue_calendar(uuid,integer)')
  ),
  'v'::"char",
  'the lock-taking Venue calendar projection is callable through PostgREST'
);
select is(
  (
    select procedure.provolatile
    from pg_proc as procedure
    where procedure.oid = to_regprocedure('public.get_venue_for_management(text)')
  ),
  'v'::"char",
  'the management projection is callable through PostgREST'
);
select is(
  (
    select procedure.provolatile
    from pg_proc as procedure
    where procedure.oid = to_regprocedure('public.list_owned_venues(integer,integer)')
  ),
  'v'::"char",
  'the managed Venue directory is callable through PostgREST'
);
select is(
  (
    select procedure.provolatile
    from pg_proc as procedure
    where procedure.oid = to_regprocedure('public.list_managed_venue_events(uuid,integer)')
  ),
  'v'::"char",
  'the managed Venue event list is callable through PostgREST'
);
select is(
  (
    select procedure.provolatile
    from pg_proc as procedure
    where procedure.oid = to_regprocedure('public.list_my_huddle_events(integer,integer)')
  ),
  'v'::"char",
  'the mixed-workspace My Huddle event list is callable through PostgREST'
);
select is(
  (
    select count(*)
    from pg_proc as procedure
    join pg_namespace as namespace on namespace.oid = procedure.pronamespace
    where namespace.nspname = 'public'
      and procedure.prokind = 'f'
      and procedure.provolatile = 's'
      and (
        pg_get_functiondef(procedure.oid) like '%private.assert_actor(%'
        or pg_get_functiondef(procedure.oid) like '%private.assert_common_actor(%'
        or pg_get_functiondef(procedure.oid) like '%private.assert_fan_actor(%'
        or pg_get_functiondef(procedure.oid) like '%private.assert_event_context_actor(%'
        or pg_get_functiondef(procedure.oid) like '%private.assert_event_manager_or_fan_actor(%'
        or pg_get_functiondef(procedure.oid) like '%private.assert_attendance_context_actor(%'
        or pg_get_functiondef(procedure.oid) like '%private.assert_invitation_context_actor(%'
      )
  ),
  0::bigint,
  'no lock-capable authenticated projection is misclassified as read-only for PostgREST'
);

insert into auth.users (
  instance_id, id, aud, role, email, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
values
  (
    '00000000-0000-0000-0000-000000000000',
    'e4000000-0000-4000-8000-000000000101',
    'authenticated', 'authenticated', 'common-success@example.com', statement_timestamp(),
    '{}'::jsonb, '{}'::jsonb, statement_timestamp(), statement_timestamp()
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    'e4000000-0000-4000-8000-000000000102',
    'authenticated', 'authenticated', 'common-unverified@example.com', null,
    '{}'::jsonb, '{}'::jsonb, statement_timestamp(), statement_timestamp()
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    'e4000000-0000-4000-8000-000000000103',
    'authenticated', 'authenticated', 'common-restricted@example.com', statement_timestamp(),
    '{}'::jsonb, '{}'::jsonb, statement_timestamp(), statement_timestamp()
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    'e4000000-0000-4000-8000-000000000104',
    'authenticated', 'authenticated', 'common-suspended@example.com', statement_timestamp(),
    '{}'::jsonb, '{}'::jsonb, statement_timestamp(), statement_timestamp()
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    'e4000000-0000-4000-8000-000000000105',
    'authenticated', 'authenticated', 'common-stale-fan@example.com', statement_timestamp(),
    '{}'::jsonb, '{}'::jsonb, statement_timestamp(), statement_timestamp()
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    'e4000000-0000-4000-8000-000000000106',
    'authenticated', 'authenticated', 'common-stale-venue@example.com', statement_timestamp(),
    '{}'::jsonb, '{}'::jsonb, statement_timestamp(), statement_timestamp()
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    'e4000000-0000-4000-8000-000000000107',
    'authenticated', 'authenticated', 'common-stale-both@example.com', statement_timestamp(),
    '{}'::jsonb, '{}'::jsonb, statement_timestamp(), statement_timestamp()
  );

update public.profiles
set community_restricted_at = statement_timestamp(),
    community_restricted_until = statement_timestamp() + interval '1 hour'
where id = 'e4000000-0000-4000-8000-000000000103';

update public.profiles
set suspended_at = statement_timestamp()
where id = 'e4000000-0000-4000-8000-000000000104';

update public.profiles
set handle = case id
      when 'e4000000-0000-4000-8000-000000000105' then 'common_stale_fan'
      when 'e4000000-0000-4000-8000-000000000107' then 'common_stale_both'
    end,
    display_name = case id
      when 'e4000000-0000-4000-8000-000000000105' then 'Common Stale Fan'
      when 'e4000000-0000-4000-8000-000000000107' then 'Common Stale Both'
    end,
    city_id = (select id from public.cities where slug = 'haifa'),
    adult_attested_at = statement_timestamp(),
    rules_version = 2,
    rules_accepted_at = statement_timestamp() - interval '30 days',
    profile_completed_at = statement_timestamp(),
    fan_enabled_at = statement_timestamp()
where id in (
  'e4000000-0000-4000-8000-000000000105',
  'e4000000-0000-4000-8000-000000000107'
);

update public.profiles
set adult_attested_at = statement_timestamp(),
    rules_version = 2,
    rules_accepted_at = statement_timestamp() - interval '30 days'
where id = 'e4000000-0000-4000-8000-000000000106';

insert into public.venues (
  id, owner_id, slug, name, city_id, address_text, location, description
)
values
  (
    'e4000000-0000-4000-8000-000000000206',
    'e4000000-0000-4000-8000-000000000106',
    'common-stale-venue', 'Common Stale Venue',
    (select id from public.cities where slug = 'haifa'),
    '16 Recovery Street, Haifa',
    extensions.st_setsrid(extensions.st_makepoint(34.998, 32.812), 4326)::extensions.geography,
    'An existing Venue used to verify stale-rules recovery.'
  ),
  (
    'e4000000-0000-4000-8000-000000000207',
    'e4000000-0000-4000-8000-000000000107',
    'common-stale-both', 'Common Stale Both Venue',
    (select id from public.cities where slug = 'haifa'),
    '17 Recovery Street, Haifa',
    extensions.st_setsrid(extensions.st_makepoint(34.999, 32.813), 4326)::extensions.geography,
    'An existing Fan plus Venue account used to verify stale-rules recovery.'
  );

set local role authenticated;
set local "request.jwt.claim.sub" = 'e4000000-0000-4000-8000-000000000101';

select throws_ok(
  $$select * from public.accept_common_onboarding(true, 0)$$,
  'P0001', 'RULES_ACCEPTANCE_REQUIRED',
  'stale rules cannot be accepted'
);
select lives_ok(
  $$select * from public.accept_common_onboarding(true, 1)$$,
  'a verified active actor can accept common safety onboarding'
);

reset role;
select ok(
  private.profile_is_common_eligible('e4000000-0000-4000-8000-000000000101'),
  'the accepted profile now satisfies the common gate used by public-address lookup'
);
select ok(
  not private.profile_is_fan_eligible('e4000000-0000-4000-8000-000000000101'),
  'common onboarding does not activate Fan'
);
select is(
  (select count(*) from public.list_my_workspaces()),
  0::bigint,
  'common onboarding creates no Fan or Venue workspace'
);
select is(
  (
    select count(*)
    from public.venues
    where owner_id = 'e4000000-0000-4000-8000-000000000101'
  ),
  0::bigint,
  'common onboarding creates no Venue record'
);

set local role authenticated;
set local "request.jwt.claim.sub" = 'e4000000-0000-4000-8000-000000000102';
select throws_ok(
  $$select * from public.accept_common_onboarding(true, 1)$$,
  'P0001', 'EMAIL_NOT_VERIFIED',
  'an unverified actor cannot accept common onboarding'
);

set local "request.jwt.claim.sub" = 'e4000000-0000-4000-8000-000000000103';
select throws_ok(
  $$select * from public.accept_common_onboarding(true, 1)$$,
  'P0001', 'ACCOUNT_RESTRICTED',
  'a restricted actor cannot accept common onboarding'
);

set local "request.jwt.claim.sub" = 'e4000000-0000-4000-8000-000000000104';
select throws_ok(
  $$select * from public.accept_common_onboarding(true, 1)$$,
  'P0001', 'ACCOUNT_SUSPENDED',
  'a suspended actor cannot accept common onboarding'
);

set local "request.jwt.claim.sub" = 'e4000000-0000-4000-8000-000000000105';
select is(
  (select count(*) from public.list_my_workspaces()),
  0::bigint,
  'stale rules remove an existing Fan from the active authorization projection'
);
select is(
  (select string_agg(workspace_kind, ',' order by workspace_kind) from public.list_my_workspace_recovery()),
  'fan'::text,
  'Fan-only recovery exposes only the actor existing Fan identity'
);

set local "request.jwt.claim.sub" = 'e4000000-0000-4000-8000-000000000106';
select is(
  (select count(*) from public.list_my_workspaces()),
  0::bigint,
  'stale rules remove an existing Venue from the active authorization projection'
);
select is(
  (select string_agg(workspace_kind, ',' order by workspace_kind) from public.list_my_workspace_recovery()),
  'venue'::text,
  'Venue-only recovery exposes only the actor active Venue membership'
);

set local "request.jwt.claim.sub" = 'e4000000-0000-4000-8000-000000000107';
select is(
  (select string_agg(workspace_kind, ',' order by workspace_kind) from public.list_my_workspace_recovery()),
  'fan,venue'::text,
  'Fan plus Venue recovery exposes both existing actor workspaces'
);
select is(
  (
    select count(*)
    from public.list_my_workspace_recovery()
    where workspace_id not in (
      'e4000000-0000-4000-8000-000000000107',
      'e4000000-0000-4000-8000-000000000207'
    )
  ),
  0::bigint,
  'the recovery projection never crosses the current actor workspace boundary'
);

select * from finish();
rollback;
