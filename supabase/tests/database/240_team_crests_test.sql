begin;

create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public, pg_catalog;

select no_plan();

select has_column(
  'public',
  'teams',
  'crest_url',
  'normalized teams persist the provider crest URL'
);

select has_column(
  'public',
  'public_future_matches',
  'home_team_crest_url',
  'the fixture projection exposes the home crest'
);

select has_column(
  'public',
  'public_future_matches',
  'away_team_crest_url',
  'the fixture projection exposes the away crest'
);

set local role service_role;

do $crest_sync$
declare
  sync_run_id uuid;
begin
  sync_run_id := public.begin_sports_sync(
    'football-data',
    current_date,
    current_date + 7,
    'manual'
  );

  perform *
  from public.complete_sports_sync(
    sync_run_id,
    'football',
    '[{"provider_external_id":"crest-competition","code":"CRT","name":"Crest Cup","country_name":"England"}]'::jsonb,
    '[{"provider_external_id":"crest-home","name":"Crest Home FC","short_name":"Crest Home","tla":"CRH","country_name":"England","crest_url":"https://crests.football-data.org/57.png"},{"provider_external_id":"crest-away","name":"Crest Away FC","short_name":"Crest Away","tla":"CRA","country_name":"England","crest_url":"https://crests.football-data.org/61.png"}]'::jsonb,
    '[{"competition_external_id":"crest-competition","team_external_id":"crest-home","season_label":"2026"},{"competition_external_id":"crest-competition","team_external_id":"crest-away","season_label":"2026"}]'::jsonb,
    jsonb_build_array(
      jsonb_build_object(
        'provider_external_id', 'crest-match',
        'competition_external_id', 'crest-competition',
        'home_team_external_id', 'crest-home',
        'away_team_external_id', 'crest-away',
        'starts_at', statement_timestamp() + interval '7 days',
        'status', 'timed',
        'matchday', 1,
        'stage', 'REGULAR_SEASON',
        'season_label', '2026'
      )
    ),
    1,
    0
  );
end;
$crest_sync$;

reset role;

select throws_ok(
  $$
    update public.teams
    set crest_url = 'http://crests.football-data.org/57.png'
    where provider = 'football-data' and provider_external_id = 'crest-home'
  $$,
  '23514',
  'new row for relation "teams" violates check constraint "teams_crest_url_check"',
  'an insecure crest URL cannot enter the catalog'
);

select throws_ok(
  $$
    update public.teams
    set crest_url = 'https://example.com/57.png'
    where provider = 'football-data' and provider_external_id = 'crest-home'
  $$,
  '23514',
  'new row for relation "teams" violates check constraint "teams_crest_url_check"',
  'a foreign crest host cannot enter the catalog'
);

select is(
  (
    select crest_url
    from public.teams
    where provider = 'football-data' and provider_external_id = 'crest-home'
  ),
  'https://crests.football-data.org/57.png',
  'the transactional provider sync persists a validated crest'
);

select results_eq(
  $$
    select home_team_crest_url, away_team_crest_url
    from public.public_future_matches
    where id = (
      select id
      from public.matches
      where provider = 'football-data' and provider_external_id = 'crest-match'
    )
  $$,
  $$values (
    'https://crests.football-data.org/57.png'::text,
    'https://crests.football-data.org/61.png'::text
  )$$,
  'the public fixture projection returns both validated crests'
);

select * from finish();
rollback;
