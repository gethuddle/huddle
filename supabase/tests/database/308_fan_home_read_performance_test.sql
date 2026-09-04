begin;

create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public, pg_catalog;

select no_plan();

select isnt(
  to_regprocedure('public.get_fan_home()'),
  null::regprocedure,
  'Fan Home uses one bounded read projection'
);
select is(
  (
    select procedure.provolatile
    from pg_catalog.pg_proc as procedure
    where procedure.oid = 'public.get_fan_home()'::regprocedure
  ),
  's'::"char",
  'Fan Home runs as a read-only projection'
);
select ok(
  (
    select procedure.prosecdef
      and procedure.proconfig = array['search_path=""']::text[]
    from pg_catalog.pg_proc as procedure
    where procedure.oid = 'public.get_fan_home()'::regprocedure
  ),
  'Fan Home is security definer with an empty search path'
);
select is(
  lower(pg_catalog.pg_get_function_result('public.get_fan_home()'::regprocedure)),
  'jsonb',
  'Fan Home returns one JSON payload'
);
select ok(
  has_function_privilege('authenticated', 'public.get_fan_home()', 'execute')
    and not has_function_privilege('anon', 'public.get_fan_home()', 'execute')
    and not has_function_privilege('public', 'public.get_fan_home()', 'execute'),
  'only authenticated sessions may execute Fan Home'
);

insert into auth.users (
  instance_id, id, aud, role, email, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
values (
  '00000000-0000-0000-0000-000000000000',
  'fb000000-0000-4000-8000-000000000001',
  'authenticated',
  'authenticated',
  'fan-home-performance@example.test',
  statement_timestamp(),
  '{}'::jsonb,
  '{}'::jsonb,
  statement_timestamp(),
  statement_timestamp()
);

update public.profiles
set
  handle = 'fan_home_performance',
  display_name = 'Fan Home Performance',
  adult_attested_at = statement_timestamp(),
  rules_version = private.current_rules_version(),
  rules_accepted_at = statement_timestamp(),
  profile_completed_at = statement_timestamp(),
  fan_enabled_at = statement_timestamp()
where id = 'fb000000-0000-4000-8000-000000000001';

insert into auth.users (
  instance_id, id, aud, role, email, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
values (
  '00000000-0000-0000-0000-000000000000',
  'fb000000-0000-4000-8000-000000000002',
  'authenticated',
  'authenticated',
  'fan-home-isolation@example.test',
  statement_timestamp(),
  '{}'::jsonb,
  '{}'::jsonb,
  statement_timestamp(),
  statement_timestamp()
);

update public.profiles
set
  handle = 'fan_home_isolation',
  display_name = 'Fan Home Isolation',
  adult_attested_at = statement_timestamp(),
  rules_version = private.current_rules_version(),
  rules_accepted_at = statement_timestamp(),
  profile_completed_at = statement_timestamp(),
  fan_enabled_at = statement_timestamp()
where id = 'fb000000-0000-4000-8000-000000000002';

insert into public.competitions (
  id, sport_id, provider, provider_external_id, code, name, country_name, last_synced_at
)
values (
  'fb000000-0000-4000-8000-000000000010',
  '00000000-0000-4000-8000-000000000020',
  'fan-home-test',
  'competition',
  'FHT',
  'Fan Home Test League',
  'Israel',
  statement_timestamp()
);

insert into public.teams (
  id, sport_id, provider, provider_external_id, name, short_name, tla,
  country_name, last_synced_at
)
values
  (
    'fb000000-0000-4000-8000-000000000011',
    '00000000-0000-4000-8000-000000000020',
    'fan-home-test',
    'home',
    'Fan Home FC',
    'Fan Home',
    'FHM',
    'Israel',
    statement_timestamp()
  ),
  (
    'fb000000-0000-4000-8000-000000000012',
    '00000000-0000-4000-8000-000000000020',
    'fan-home-test',
    'away',
    'Fan Away FC',
    'Fan Away',
    'FAW',
    'Israel',
    statement_timestamp()
  ),
  (
    'fb000000-0000-4000-8000-000000000014',
    '00000000-0000-4000-8000-000000000020',
    'fan-home-test',
    'unrelated',
    'Fan Unrelated FC',
    'Unrelated',
    'FUN',
    'Israel',
    statement_timestamp()
  );

insert into public.matches (
  id, provider, provider_external_id, competition_id, home_team_id, away_team_id,
  starts_at, status, matchday, season_label, last_synced_at
)
values (
  'fb000000-0000-4000-8000-000000000013',
  'fan-home-test',
  'match',
  'fb000000-0000-4000-8000-000000000010',
  'fb000000-0000-4000-8000-000000000011',
  'fb000000-0000-4000-8000-000000000012',
  statement_timestamp() + interval '1 day',
  'timed',
  1,
  '2026',
  statement_timestamp()
);

insert into public.subscriptions (user_id, kind, team_id)
values
  (
    'fb000000-0000-4000-8000-000000000001',
    'team',
    'fb000000-0000-4000-8000-000000000011'
  ),
  (
    'fb000000-0000-4000-8000-000000000002',
    'team',
    'fb000000-0000-4000-8000-000000000014'
  );

select set_config(
  'request.jwt.claim.sub',
  'fb000000-0000-4000-8000-000000000001',
  true
);
set local role authenticated;

select is(
  (public.get_fan_home() -> 'next_event')::text,
  'null',
  'Fan Home returns no invented next event'
);
select is(
  public.get_fan_home() -> 'attention',
  '[]'::jsonb,
  'Fan Home returns a stable empty attention array'
);
select is(
  public.get_fan_home() #>> '{suggestion,id}',
  'fb000000-0000-4000-8000-000000000013',
  'Fan Home chooses the next fixture matching a followed team'
);

reset role;
select set_config(
  'request.jwt.claim.sub',
  'fb000000-0000-4000-8000-000000000002',
  true
);
set local role authenticated;
select is(
  public.get_fan_home(),
  '{"attention": [], "next_event": null, "suggestion": null}'::jsonb,
  'Fan Home does not expose another Fan''s team follow or home payload'
);

reset role;
select set_config(
  'request.jwt.claim.sub',
  'fb000000-0000-4000-8000-000000000001',
  true
);
delete from public.subscriptions
where user_id = 'fb000000-0000-4000-8000-000000000001';
insert into public.subscriptions (user_id, kind, competition_id)
values (
  'fb000000-0000-4000-8000-000000000001',
  'competition',
  'fb000000-0000-4000-8000-000000000010'
);
set local role authenticated;
select is(
  public.get_fan_home() #>> '{suggestion,id}',
  'fb000000-0000-4000-8000-000000000013',
  'Fan Home also chooses a fixture matching a followed competition'
);

reset role;
select set_config(
  'request.jwt.claim.sub',
  'fb000000-0000-4000-8000-000000000002',
  true
);
set local role authenticated;
select is(
  public.get_fan_home(),
  '{"attention": [], "next_event": null, "suggestion": null}'::jsonb,
  'Fan Home does not expose another Fan''s competition follow or home payload'
);

reset role;
select set_config(
  'request.jwt.claim.sub',
  'fb000000-0000-4000-8000-000000000001',
  true
);
set local role authenticated;
select is(
  (
    select array_agg(key order by key)
    from jsonb_object_keys(public.get_fan_home()) as key
  ),
  array['attention', 'next_event', 'suggestion']::text[],
  'Fan Home exposes only its three bounded sections'
);
select ok(
  not (lower(public.get_fan_home()::text) ~ '(email|address|coordinate|latitude|longitude|token|report)'),
  'Fan Home omits identity, location, provider and moderation secrets'
);

reset role;
select set_config('request.jwt.claim.sub', '', true);
set local role anon;
select throws_ok(
  $$select public.get_fan_home()$$,
  '42501',
  null,
  'anonymous sessions cannot execute Fan Home'
);

reset role;
update public.profiles
set fan_enabled_at = null
where id = 'fb000000-0000-4000-8000-000000000001';
select set_config(
  'request.jwt.claim.sub',
  'fb000000-0000-4000-8000-000000000001',
  true
);
set local role authenticated;
select throws_ok(
  $$select public.get_fan_home()$$,
  'P0001',
  'PROFILE_INCOMPLETE',
  'Fan Home fails closed when Fan eligibility is lost'
);

select * from finish();
rollback;
