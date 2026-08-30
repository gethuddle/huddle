begin;

create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public, pg_catalog;

select no_plan();

select has_function(
  'public',
  'get_public_provider_freshness',
  array['text'],
  'fixture coverage extends the reviewed public freshness projection'
);
select ok(
  (
    select procedure.prosecdef
      and procedure.proconfig = array['search_path=""']::text[]
    from pg_proc as procedure
    join pg_namespace as namespace on namespace.oid = procedure.pronamespace
    where namespace.nspname = 'public'
      and procedure.proname = 'get_public_provider_freshness'
  ),
  'the coverage projection is security definer with an empty fixed search path'
);
select ok(
  has_function_privilege('anon', 'public.get_public_provider_freshness(text)', 'execute'),
  'anonymous fixture browsing may read the safe coverage projection'
);
select ok(
  has_function_privilege('authenticated', 'public.get_public_provider_freshness(text)', 'execute'),
  'signed-in fixture browsing may read the safe coverage projection'
);
select ok(
  not has_table_privilege('anon', 'public.provider_sync_runs', 'select'),
  'coverage does not grant direct access to detailed sync evidence'
);
select has_index(
  'public',
  'matches',
  'matches_provider_future_coverage_idx',
  'coverage lookup has a provider-first future-fixture index'
);

insert into public.competitions (
  id,
  sport_id,
  provider,
  provider_external_id,
  code,
  name,
  country_name,
  active,
  last_synced_at
)
values (
  '88000000-0000-4000-8000-000000000001',
  '00000000-0000-4000-8000-000000000020',
  'football-data',
  'coverage-pl',
  'PL',
  'Coverage Premier League',
  'England',
  true,
  '2026-08-30T10:00:00Z'
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
    '88000000-0000-4000-8000-000000000002',
    '00000000-0000-4000-8000-000000000020',
    'football-data',
    'coverage-home',
    'Coverage Home FC',
    'Coverage Home',
    'CVH',
    'England',
    true,
    '2026-08-30T10:00:00Z'
  ),
  (
    '88000000-0000-4000-8000-000000000003',
    '00000000-0000-4000-8000-000000000020',
    'football-data',
    'coverage-away',
    'Coverage Away FC',
    'Coverage Away',
    'CVA',
    'England',
    true,
    '2026-08-30T10:00:00Z'
  );

insert into public.provider_sync_runs (
  id,
  provider,
  started_at,
  finished_at,
  status,
  window_start,
  window_end,
  request_count,
  retry_count,
  duration_ms,
  trigger_source
)
values (
  '88000000-0000-4000-8000-000000000010',
  'football-data',
  '2026-08-30T09:59:59Z',
  '2026-08-30T10:00:00Z',
  'succeeded',
  '2026-08-29',
  '2027-05-31',
  3,
  0,
  1000,
  'manual'
);

insert into public.matches (
  provider,
  provider_external_id,
  competition_id,
  home_team_id,
  away_team_id,
  starts_at,
  status,
  matchday,
  stage,
  season_label,
  last_synced_at
)
values
  (
    'football-data',
    'coverage-october',
    '88000000-0000-4000-8000-000000000001',
    '88000000-0000-4000-8000-000000000002',
    '88000000-0000-4000-8000-000000000003',
    '2026-10-12T18:00:00Z',
    'timed',
    8,
    'REGULAR_SEASON',
    '2026',
    '2026-08-30T10:00:00Z'
  ),
  (
    'football-data',
    'coverage-may',
    '88000000-0000-4000-8000-000000000001',
    '88000000-0000-4000-8000-000000000002',
    '88000000-0000-4000-8000-000000000003',
    '2027-05-24T18:00:00Z',
    'scheduled',
    38,
    'REGULAR_SEASON',
    '2026',
    '2026-08-30T10:00:00Z'
  ),
  (
    'football-data',
    'coverage-cancelled-later',
    '88000000-0000-4000-8000-000000000001',
    '88000000-0000-4000-8000-000000000002',
    '88000000-0000-4000-8000-000000000003',
    '2027-06-01T18:00:00Z',
    'cancelled',
    39,
    'REGULAR_SEASON',
    '2026',
    '2026-08-30T10:00:00Z'
  );

set local role anon;
select is(
  (select count(*) from public.get_public_provider_freshness('football-data')),
  1::bigint,
  'the public projection returns one last-good provider row'
);
select is(
  (
    select updated_at
    from public.get_public_provider_freshness('football-data')
  ),
  '2026-08-30T10:00:00Z'::timestamptz,
  'updated_at is the last successful run rather than the latest attempt'
);
select is(
  (
    select coverage_through
    from public.get_public_provider_freshness('football-data')
  ),
  '2027-05-24T18:00:00Z'::timestamptz,
  'coverage never exceeds the maximum eligible observed local fixture'
);
select is(
  (
    select array_agg(field_name order by field_name)
    from public.get_public_provider_freshness('football-data') as coverage,
      lateral jsonb_object_keys(to_jsonb(coverage)) as field_name
  ),
  array['coverage_through', 'provider', 'updated_at']::text[],
  'the public projection exposes only provider identity, update, and coverage'
);
select is(
  (select count(*) from public.get_public_provider_freshness('not-configured')),
  0::bigint,
  'unknown providers reveal no row'
);
reset role;

insert into public.provider_sync_runs (
  id,
  provider,
  started_at,
  finished_at,
  status,
  window_start,
  window_end,
  request_count,
  retry_count,
  duration_ms,
  error_code,
  error_summary,
  trigger_source
)
values (
  '88000000-0000-4000-8000-000000000011',
  'football-data',
  '2026-08-30T10:59:59Z',
  '2026-08-30T11:00:00Z',
  'failed',
  '2026-08-29',
  '2027-05-31',
  1,
  0,
  1000,
  'INVALID_RESPONSE',
  'Sanitized failure summary.',
  'retry'
);

set local role anon;
select is(
  (
    select updated_at
    from public.get_public_provider_freshness('football-data')
  ),
  '2026-08-30T10:00:00Z'::timestamptz,
  'a later failed sync preserves the prior successful update'
);
select is(
  (
    select coverage_through
    from public.get_public_provider_freshness('football-data')
  ),
  '2027-05-24T18:00:00Z'::timestamptz,
  'a later failed sync preserves the prior observed coverage'
);
reset role;

select * from finish();
rollback;
