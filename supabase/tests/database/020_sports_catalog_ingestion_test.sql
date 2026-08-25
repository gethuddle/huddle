begin;

create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public, pg_catalog;

select no_plan();

select has_table('public', 'sports', 'B03 creates the sport catalog');
select has_table('public', 'competitions', 'B03 creates competitions');
select has_table('public', 'teams', 'B03 creates teams');
select has_table('public', 'competition_teams', 'B03 creates competition memberships');
select has_table('public', 'matches', 'B03 creates provider-neutral fixtures');
select has_table('public', 'provider_sync_runs', 'B03 creates durable sync evidence');
select has_view('public', 'public_future_matches', 'B03 creates the future-match projection');
select hasnt_column('public', 'teams', 'crest', 'provider crest URLs are not persisted');
select hasnt_column('public', 'matches', 'score', 'B03 does not add live-score storage');

select is(
  enum_range(null::public.sports_match_status)::text,
  '{scheduled,timed,postponed,cancelled,finished}',
  'match status is normalized without a live-score state'
);
select is(
  enum_range(null::public.provider_sync_status)::text,
  '{running,succeeded,failed}',
  'provider runs use the reviewed lifecycle'
);
select is(
  (select name from public.sports where slug = 'football'),
  'Football',
  'the minimum football sport seed is present'
);

select ok(
  (
    select bool_and(relation.relrowsecurity and relation.relforcerowsecurity)
    from pg_class as relation
    join pg_namespace as namespace on namespace.oid = relation.relnamespace
    where namespace.nspname = 'public'
      and relation.relname in (
        'sports',
        'competitions',
        'teams',
        'competition_teams',
        'matches',
        'provider_sync_runs'
      )
  ),
  'every B03 exposed table has RLS enabled and forced'
);
select ok(
  (
    select bool_and(
      procedure.prosecdef
      and procedure.proconfig = array['search_path=""']::text[]
    )
    from pg_proc as procedure
    join pg_namespace as namespace on namespace.oid = procedure.pronamespace
    where namespace.nspname = 'public'
      and procedure.proname in (
        'record_sports_sync_denial',
        'begin_sports_sync',
        'complete_sports_sync',
        'fail_sports_sync',
        'get_public_provider_freshness'
      )
  ),
  'every B03 security-definer function has an empty fixed search_path'
);

select has_index('public', 'competitions', 'competitions_provider_provider_external_id_key', 'competition provider identity is unique');
select has_index('public', 'competitions', 'competitions_sport_active_idx', 'competitions support active sport reads');
select has_index('public', 'competitions', 'competitions_code_idx', 'competitions support code lookup');
select has_index('public', 'teams', 'teams_provider_provider_external_id_key', 'team provider identity is unique');
select has_index('public', 'teams', 'teams_sport_id_idx', 'teams support sport lookup');
select has_index('public', 'teams', 'teams_name_lower_idx', 'teams support normalized name lookup');
select has_index('public', 'teams', 'teams_tla_idx', 'teams support TLA lookup');
select has_index('public', 'competition_teams', 'competition_teams_team_idx', 'competition membership supports reverse team lookup');
select has_index('public', 'matches', 'matches_provider_provider_external_id_key', 'match provider identity is unique');
select has_index('public', 'matches', 'matches_starts_status_idx', 'matches support time and status lookup');
select has_index('public', 'matches', 'matches_competition_starts_idx', 'matches support competition timelines');
select has_index('public', 'matches', 'matches_home_team_starts_idx', 'matches support home-team timelines');
select has_index('public', 'matches', 'matches_away_team_starts_idx', 'matches support away-team timelines');
select has_index('public', 'provider_sync_runs', 'provider_sync_one_running_idx', 'only one provider run may be running');
select has_index('public', 'provider_sync_runs', 'provider_sync_provider_finished_idx', 'successful provider freshness is indexed');

select throws_ok(
  $$insert into public.sports (slug, name) values ('Bad Slug', 'Valid Sport')$$,
  '23514',
  'new row for relation "sports" violates check constraint "sports_slug_format_check"',
  'sport slugs enforce normalized format'
);
select throws_ok(
  $$insert into public.sports (slug, name) values ('bad-name', 'X')$$,
  '23514',
  'new row for relation "sports" violates check constraint "sports_name_length_check"',
  'sport names enforce bounded trimmed text'
);
select throws_ok(
  $$insert into public.sports (slug, name) values ('football', 'Duplicate Football')$$,
  '23505',
  'duplicate key value violates unique constraint "sports_slug_key"',
  'sport slugs remain unique'
);

insert into public.sports (slug, name, active)
values ('archived-sport', 'Archived Sport', false);

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
select
  '30000000-0000-4000-8000-000000000001',
  sport.id,
  'football-data',
  '2021',
  'PL',
  'Premier League',
  'England',
  true,
  statement_timestamp()
from public.sports as sport
where sport.slug = 'football';

select throws_ok(
  $$insert into public.competitions (sport_id, provider, provider_external_id, name, last_synced_at) values ('39999999-0000-4000-8000-000000000001', 'football-data', 'bad-sport', 'Bad Sport', statement_timestamp())$$,
  '23503',
  'insert or update on table "competitions" violates foreign key constraint "competitions_sport_id_fkey"',
  'competitions must reference a sport'
);
select throws_ok(
  $$insert into public.competitions (sport_id, provider, provider_external_id, name, last_synced_at) select id, 'Bad Provider', 'bad-provider', 'Bad Provider', statement_timestamp() from public.sports where slug = 'football'$$,
  '23514',
  'new row for relation "competitions" violates check constraint "competitions_provider_format_check"',
  'competition providers enforce normalized format'
);
select throws_ok(
  $$insert into public.competitions (sport_id, provider, provider_external_id, name, last_synced_at) select id, 'football-data', ' ', 'Bad Identity', statement_timestamp() from public.sports where slug = 'football'$$,
  '23514',
  'new row for relation "competitions" violates check constraint "competitions_external_id_check"',
  'competition provider IDs cannot be blank'
);
select throws_ok(
  $$insert into public.competitions (sport_id, provider, provider_external_id, code, name, last_synced_at) select id, 'football-data', 'bad-code', 'pl!', 'Bad Code', statement_timestamp() from public.sports where slug = 'football'$$,
  '23514',
  'new row for relation "competitions" violates check constraint "competitions_code_check"',
  'competition codes enforce normalized format'
);
select throws_ok(
  $$insert into public.competitions (sport_id, provider, provider_external_id, name, last_synced_at) select id, 'football-data', 'bad-name', 'X', statement_timestamp() from public.sports where slug = 'football'$$,
  '23514',
  'new row for relation "competitions" violates check constraint "competitions_name_length_check"',
  'competition names enforce bounded text'
);
select throws_ok(
  $$insert into public.competitions (sport_id, provider, provider_external_id, name, country_name, last_synced_at) select id, 'football-data', 'bad-country', 'Bad Country', 'X', statement_timestamp() from public.sports where slug = 'football'$$,
  '23514',
  'new row for relation "competitions" violates check constraint "competitions_country_length_check"',
  'competition countries enforce bounded text'
);
select throws_ok(
  $$insert into public.competitions (sport_id, provider, provider_external_id, name, last_synced_at) select id, 'football-data', '2021', 'Duplicate Competition', statement_timestamp() from public.sports where slug = 'football'$$,
  '23505',
  'duplicate key value violates unique constraint "competitions_provider_provider_external_id_key"',
  'competition provider identity is unique'
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
select
  fixture.id,
  sport.id,
  'football-data',
  fixture.external_id,
  fixture.name,
  fixture.short_name,
  fixture.tla,
  'England',
  true,
  statement_timestamp()
from public.sports as sport
cross join (
  values
    ('30000000-0000-4000-8000-000000000002'::uuid, '57', 'Arsenal FC', 'Arsenal', 'ARS'),
    ('30000000-0000-4000-8000-000000000003'::uuid, '61', 'Chelsea FC', 'Chelsea', 'CHE')
) as fixture(id, external_id, name, short_name, tla)
where sport.slug = 'football';

select throws_ok(
  $$insert into public.teams (sport_id, provider, provider_external_id, name, last_synced_at) values ('39999999-0000-4000-8000-000000000002', 'football-data', 'bad-sport', 'Bad Sport Team', statement_timestamp())$$,
  '23503',
  'insert or update on table "teams" violates foreign key constraint "teams_sport_id_fkey"',
  'teams must reference a sport'
);
select throws_ok(
  $$insert into public.teams (sport_id, provider, provider_external_id, name, last_synced_at) select id, 'Bad Provider', 'bad-provider', 'Bad Provider Team', statement_timestamp() from public.sports where slug = 'football'$$,
  '23514',
  'new row for relation "teams" violates check constraint "teams_provider_format_check"',
  'team providers enforce normalized format'
);
select throws_ok(
  $$insert into public.teams (sport_id, provider, provider_external_id, name, last_synced_at) select id, 'football-data', ' ', 'Bad Identity Team', statement_timestamp() from public.sports where slug = 'football'$$,
  '23514',
  'new row for relation "teams" violates check constraint "teams_external_id_check"',
  'team provider IDs cannot be blank'
);
select throws_ok(
  $$insert into public.teams (sport_id, provider, provider_external_id, name, last_synced_at) select id, 'football-data', 'bad-name', 'X', statement_timestamp() from public.sports where slug = 'football'$$,
  '23514',
  'new row for relation "teams" violates check constraint "teams_name_length_check"',
  'team names enforce bounded text'
);
select throws_ok(
  $$insert into public.teams (sport_id, provider, provider_external_id, name, short_name, last_synced_at) select id, 'football-data', 'bad-short', 'Bad Short Team', '', statement_timestamp() from public.sports where slug = 'football'$$,
  '23514',
  'new row for relation "teams" violates check constraint "teams_short_name_length_check"',
  'team short names enforce bounded text'
);
select throws_ok(
  $$insert into public.teams (sport_id, provider, provider_external_id, name, tla, last_synced_at) select id, 'football-data', 'bad-tla', 'Bad TLA Team', 'ars!', statement_timestamp() from public.sports where slug = 'football'$$,
  '23514',
  'new row for relation "teams" violates check constraint "teams_tla_check"',
  'team TLAs enforce normalized format'
);
select throws_ok(
  $$insert into public.teams (sport_id, provider, provider_external_id, name, country_name, last_synced_at) select id, 'football-data', 'bad-country', 'Bad Country Team', 'X', statement_timestamp() from public.sports where slug = 'football'$$,
  '23514',
  'new row for relation "teams" violates check constraint "teams_country_length_check"',
  'team countries enforce bounded text'
);
select throws_ok(
  $$insert into public.teams (sport_id, provider, provider_external_id, name, last_synced_at) select id, 'football-data', '57', 'Duplicate Team', statement_timestamp() from public.sports where slug = 'football'$$,
  '23505',
  'duplicate key value violates unique constraint "teams_provider_provider_external_id_key"',
  'team provider identity is unique'
);

insert into public.competition_teams (competition_id, team_id, season_label)
values
  ('30000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000002', '2026'),
  ('30000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000003', '2026');

select throws_ok(
  $$insert into public.competition_teams (competition_id, team_id, season_label) values ('39999999-0000-4000-8000-000000000003', '30000000-0000-4000-8000-000000000002', '2026')$$,
  '23503',
  'insert or update on table "competition_teams" violates foreign key constraint "competition_teams_competition_id_fkey"',
  'competition membership must reference a competition'
);
select throws_ok(
  $$insert into public.competition_teams (competition_id, team_id, season_label) values ('30000000-0000-4000-8000-000000000001', '39999999-0000-4000-8000-000000000004', '2026')$$,
  '23503',
  'insert or update on table "competition_teams" violates foreign key constraint "competition_teams_team_id_fkey"',
  'competition membership must reference a team'
);
select throws_ok(
  $$insert into public.competition_teams (competition_id, team_id, season_label) values ('30000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000002', '')$$,
  '23514',
  'new row for relation "competition_teams" violates check constraint "competition_teams_season_label_check"',
  'competition membership requires a season label'
);
select throws_ok(
  $$insert into public.competition_teams (competition_id, team_id, season_label) values ('30000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000002', '2026')$$,
  '23505',
  'duplicate key value violates unique constraint "competition_teams_pkey"',
  'competition membership identity is unique'
);

insert into public.matches (
  id,
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
values (
  '30000000-0000-4000-8000-000000000004',
  'football-data',
  '5001',
  '30000000-0000-4000-8000-000000000001',
  '30000000-0000-4000-8000-000000000002',
  '30000000-0000-4000-8000-000000000003',
  statement_timestamp() + interval '7 days',
  'timed',
  1,
  'REGULAR_SEASON',
  '2026',
  statement_timestamp()
);

insert into public.matches (
  provider,
  provider_external_id,
  competition_id,
  home_team_id,
  away_team_id,
  starts_at,
  status,
  last_synced_at
)
values (
  'football-data',
  '5000',
  '30000000-0000-4000-8000-000000000001',
  '30000000-0000-4000-8000-000000000002',
  '30000000-0000-4000-8000-000000000003',
  statement_timestamp() - interval '30 days',
  'finished',
  statement_timestamp() - interval '30 days'
);

select throws_ok(
  $$insert into public.matches (provider, provider_external_id, competition_id, home_team_id, away_team_id, starts_at, status, last_synced_at) values ('football-data', 'bad-competition', '39999999-0000-4000-8000-000000000005', '30000000-0000-4000-8000-000000000002', '30000000-0000-4000-8000-000000000003', statement_timestamp(), 'timed', statement_timestamp())$$,
  '23503',
  'insert or update on table "matches" violates foreign key constraint "matches_competition_id_fkey"',
  'matches must reference a competition'
);
select throws_ok(
  $$insert into public.matches (provider, provider_external_id, competition_id, home_team_id, away_team_id, starts_at, status, last_synced_at) values ('football-data', 'bad-home', '30000000-0000-4000-8000-000000000001', '39999999-0000-4000-8000-000000000006', '30000000-0000-4000-8000-000000000003', statement_timestamp(), 'timed', statement_timestamp())$$,
  '23503',
  'insert or update on table "matches" violates foreign key constraint "matches_home_team_id_fkey"',
  'matches must reference a home team'
);
select throws_ok(
  $$insert into public.matches (provider, provider_external_id, competition_id, home_team_id, away_team_id, starts_at, status, last_synced_at) values ('football-data', 'bad-away', '30000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000002', '39999999-0000-4000-8000-000000000007', statement_timestamp(), 'timed', statement_timestamp())$$,
  '23503',
  'insert or update on table "matches" violates foreign key constraint "matches_away_team_id_fkey"',
  'matches must reference an away team'
);
select throws_ok(
  $$insert into public.matches (provider, provider_external_id, competition_id, home_team_id, away_team_id, starts_at, status, last_synced_at) values ('Bad Provider', 'bad-provider', '30000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000002', '30000000-0000-4000-8000-000000000003', statement_timestamp(), 'timed', statement_timestamp())$$,
  '23514',
  'new row for relation "matches" violates check constraint "matches_provider_format_check"',
  'match providers enforce normalized format'
);
select throws_ok(
  $$insert into public.matches (provider, provider_external_id, competition_id, home_team_id, away_team_id, starts_at, status, last_synced_at) values ('football-data', ' ', '30000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000002', '30000000-0000-4000-8000-000000000003', statement_timestamp(), 'timed', statement_timestamp())$$,
  '23514',
  'new row for relation "matches" violates check constraint "matches_external_id_check"',
  'match provider IDs cannot be blank'
);
select throws_ok(
  $$insert into public.matches (provider, provider_external_id, competition_id, home_team_id, away_team_id, starts_at, status, last_synced_at) values ('football-data', 'same-team', '30000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000002', '30000000-0000-4000-8000-000000000002', statement_timestamp(), 'timed', statement_timestamp())$$,
  '23514',
  'new row for relation "matches" violates check constraint "matches_distinct_teams_check"',
  'home and away teams must differ'
);
select throws_ok(
  $$insert into public.matches (provider, provider_external_id, competition_id, home_team_id, away_team_id, starts_at, status, matchday, last_synced_at) values ('football-data', 'bad-matchday', '30000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000002', '30000000-0000-4000-8000-000000000003', statement_timestamp(), 'timed', 0, statement_timestamp())$$,
  '23514',
  'new row for relation "matches" violates check constraint "matches_matchday_check"',
  'matchdays must be positive when present'
);
select throws_ok(
  $$insert into public.matches (provider, provider_external_id, competition_id, home_team_id, away_team_id, starts_at, status, stage, last_synced_at) values ('football-data', 'bad-stage', '30000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000002', '30000000-0000-4000-8000-000000000003', statement_timestamp(), 'timed', '', statement_timestamp())$$,
  '23514',
  'new row for relation "matches" violates check constraint "matches_stage_length_check"',
  'match stages enforce bounded text'
);
select throws_ok(
  $$insert into public.matches (provider, provider_external_id, competition_id, home_team_id, away_team_id, starts_at, status, season_label, last_synced_at) values ('football-data', 'bad-season', '30000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000002', '30000000-0000-4000-8000-000000000003', statement_timestamp(), 'timed', '', statement_timestamp())$$,
  '23514',
  'new row for relation "matches" violates check constraint "matches_season_label_check"',
  'match seasons enforce bounded text'
);
select throws_ok(
  $$insert into public.matches (provider, provider_external_id, competition_id, home_team_id, away_team_id, starts_at, status, last_synced_at) values ('football-data', '5001', '30000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000002', '30000000-0000-4000-8000-000000000003', statement_timestamp(), 'timed', statement_timestamp())$$,
  '23505',
  'duplicate key value violates unique constraint "matches_provider_provider_external_id_key"',
  'match provider identity is unique'
);

select throws_ok(
  $$insert into public.provider_sync_runs (provider, window_start, window_end, trigger_source) values ('Bad Provider', current_date, current_date, 'manual')$$,
  '23514',
  'new row for relation "provider_sync_runs" violates check constraint "provider_sync_provider_format_check"',
  'sync provider names enforce normalized format'
);
select throws_ok(
  $$insert into public.provider_sync_runs (provider, window_start, window_end, trigger_source) values ('test-window', current_date, current_date - 1, 'manual')$$,
  '23514',
  'new row for relation "provider_sync_runs" violates check constraint "provider_sync_window_check"',
  'sync windows cannot end before they begin'
);
select throws_ok(
  $$insert into public.provider_sync_runs (provider, window_start, window_end, request_count, trigger_source) values ('test-counts', current_date, current_date, -1, 'manual')$$,
  '23514',
  'new row for relation "provider_sync_runs" violates check constraint "provider_sync_counts_check"',
  'sync counts cannot be negative'
);
select throws_ok(
  $$insert into public.provider_sync_runs (provider, window_start, window_end, trigger_source) values ('test-trigger', current_date, current_date, 'browser')$$,
  '23514',
  'new row for relation "provider_sync_runs" violates check constraint "provider_sync_trigger_check"',
  'sync trigger sources are allowlisted'
);
select throws_ok(
  $$insert into public.provider_sync_runs (provider, status, window_start, window_end, finished_at, duration_ms, error_code, error_summary, trigger_source) values ('test-error-code', 'failed', current_date, current_date, statement_timestamp(), 1, 'TOKEN_LEAK', 'Safe summary.', 'manual')$$,
  '23514',
  'new row for relation "provider_sync_runs" violates check constraint "provider_sync_error_code_check"',
  'sync error categories are allowlisted'
);
select throws_ok(
  $$insert into public.provider_sync_runs (provider, status, window_start, window_end, finished_at, duration_ms, error_code, error_summary, trigger_source) values ('test-error-summary', 'failed', current_date, current_date, statement_timestamp(), 1, 'UNKNOWN', '', 'manual')$$,
  '23514',
  'new row for relation "provider_sync_runs" violates check constraint "provider_sync_error_summary_check"',
  'sync error summaries cannot be empty'
);
select throws_ok(
  $$insert into public.provider_sync_runs (provider, status, window_start, window_end, finished_at, trigger_source) values ('test-lifecycle', 'succeeded', current_date, current_date, statement_timestamp(), 'manual')$$,
  '23514',
  'new row for relation "provider_sync_runs" violates check constraint "provider_sync_lifecycle_check"',
  'sync lifecycle fields must agree with status'
);

select ok(has_table_privilege('anon', 'public.sports', 'select'), 'anonymous users may read active sports');
select ok(has_table_privilege('authenticated', 'public.matches', 'select'), 'authenticated users may read eligible future matches');
select ok(not has_table_privilege('authenticated', 'public.matches', 'insert'), 'ordinary users cannot insert catalog matches');
select ok(not has_table_privilege('anon', 'public.provider_sync_runs', 'select'), 'detailed provider run evidence is private');
select ok(not has_function_privilege('authenticated', 'public.begin_sports_sync(text,date,date,text)', 'execute'), 'ordinary sessions cannot begin a sync');
select ok(has_function_privilege('service_role', 'public.begin_sports_sync(text,date,date,text)', 'execute'), 'the service role may begin a sync');
select ok(not has_function_privilege('anon', 'public.complete_sports_sync(uuid,text,jsonb,jsonb,jsonb,jsonb,integer,integer)', 'execute'), 'anonymous callers cannot upsert catalog data');
select ok(has_function_privilege('service_role', 'public.complete_sports_sync(uuid,text,jsonb,jsonb,jsonb,jsonb,integer,integer)', 'execute'), 'the service role may invoke the transactional upsert');

set local role anon;
select is((select count(*) from public.sports), 1::bigint, 'anonymous users see the active football sport');
select is((select count(*) from public.public_future_matches), 1::bigint, 'anonymous users see an eligible future match');
select is(
  (
    select array_agg(field_name order by field_name)
    from public.public_future_matches as future_match,
      lateral jsonb_object_keys(to_jsonb(future_match)) as field_name
    limit 1
  ),
  array[
    'away_team_id',
    'away_team_name',
    'away_team_short_name',
    'away_team_tla',
    'competition_code',
    'competition_id',
    'competition_name',
    'home_team_id',
    'home_team_name',
    'home_team_short_name',
    'home_team_tla',
    'id',
    'last_synced_at',
    'matchday',
    'season_label',
    'sport_id',
    'sport_slug',
    'stage',
    'starts_at',
    'status'
  ]::text[],
  'the public match projection contains only reviewed provider-neutral fields'
);
select throws_ok(
  $$insert into public.matches (provider, provider_external_id, competition_id, home_team_id, away_team_id, starts_at, status, last_synced_at) values ('football-data', 'forged', '30000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000002', '30000000-0000-4000-8000-000000000003', statement_timestamp(), 'timed', statement_timestamp())$$,
  '42501',
  'permission denied for table matches',
  'anonymous callers cannot forge provider fixtures'
);
select lives_ok(
  $$select public.record_sports_sync_denial('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee')$$,
  'an unauthenticated route can record generic sync-denial evidence'
);
reset role;

select is(
  (
    select count(*)
    from public.security_audit_events
    where action = 'sports.sync_authorize'
      and resource_type = 'provider_sync'
      and outcome = 'denied'
      and request_id = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee'
      and metadata = '{}'::jsonb
  ),
  1::bigint,
  'sync denial auditing stores no secret or provider payload'
);

create temporary table sports_sync_test_state (
  label text primary key,
  run_id uuid not null
) on commit drop;
grant select, insert, update on sports_sync_test_state to service_role;

set local role service_role;
insert into sports_sync_test_state (label, run_id)
values (
  'success',
  public.begin_sports_sync('football-data', current_date - 1, current_date + 45, 'manual')
);
select throws_ok(
  $$select public.begin_sports_sync('football-data', current_date - 1, current_date + 45, 'scheduled')$$,
  'P0001',
  'SYNC_ALREADY_RUNNING',
  'a second provider run is rejected while one is running'
);
select lives_ok(
  $$select * from public.complete_sports_sync(
    (select run_id from sports_sync_test_state where label = 'success'),
    'football',
    '[{"provider_external_id":"2001","code":"CL","name":"UEFA Champions League","country_name":"Europe"}]'::jsonb,
    '[{"provider_external_id":"64","name":"Liverpool FC","short_name":"Liverpool","tla":"LIV","country_name":"England"},{"provider_external_id":"65","name":"Manchester City FC","short_name":"Man City","tla":"MCI","country_name":"England"}]'::jsonb,
    '[{"competition_external_id":"2001","team_external_id":"64","season_label":"2026"},{"competition_external_id":"2001","team_external_id":"65","season_label":"2026"}]'::jsonb,
    '[{"provider_external_id":"6001","competition_external_id":"2001","home_team_external_id":"64","away_team_external_id":"65","starts_at":"2026-09-10T18:00:00Z","status":"timed","matchday":1,"stage":"LEAGUE_STAGE","season_label":"2026"}]'::jsonb,
    3,
    0
  )$$,
  'the service transaction imports a normalized catalog batch'
);
reset role;

select is((select status::text from public.provider_sync_runs where id = (select run_id from sports_sync_test_state where label = 'success')), 'succeeded', 'a successful batch completes its run');
select is((select competitions_changed from public.provider_sync_runs where id = (select run_id from sports_sync_test_state where label = 'success')), 1, 'the run records changed competition count');
select is((select teams_changed from public.provider_sync_runs where id = (select run_id from sports_sync_test_state where label = 'success')), 2, 'the run records changed team count');
select is((select matches_changed from public.provider_sync_runs where id = (select run_id from sports_sync_test_state where label = 'success')), 1, 'the run records changed match count');
select is((select count(*) from public.competition_teams where season_label = '2026'), 4::bigint, 'provider-upserted team memberships are retained');
select is((select starts_at from public.matches where provider_external_id = '6001'), '2026-09-10 18:00:00+00'::timestamptz, 'provider timestamps are stored as UTC timestamptz');

set local role service_role;
insert into sports_sync_test_state (label, run_id)
values (
  'idempotent',
  public.begin_sports_sync('football-data', current_date - 1, current_date + 45, 'retry')
);
select lives_ok(
  $$select * from public.complete_sports_sync(
    (select run_id from sports_sync_test_state where label = 'idempotent'),
    'football',
    '[{"provider_external_id":"2001","code":"CL","name":"UEFA Champions League","country_name":"Europe"}]'::jsonb,
    '[{"provider_external_id":"64","name":"Liverpool FC","short_name":"Liverpool","tla":"LIV","country_name":"England"},{"provider_external_id":"65","name":"Manchester City FC","short_name":"Man City","tla":"MCI","country_name":"England"}]'::jsonb,
    '[{"competition_external_id":"2001","team_external_id":"64","season_label":"2026"},{"competition_external_id":"2001","team_external_id":"65","season_label":"2026"}]'::jsonb,
    '[{"provider_external_id":"6001","competition_external_id":"2001","home_team_external_id":"64","away_team_external_id":"65","starts_at":"2026-09-10T18:00:00Z","status":"timed","matchday":1,"stage":"LEAGUE_STAGE","season_label":"2026"}]'::jsonb,
    3,
    0
  )$$,
  'an identical provider batch is idempotent'
);
reset role;

select is(
  (
    select competitions_changed + teams_changed + matches_changed
    from public.provider_sync_runs
    where id = (select run_id from sports_sync_test_state where label = 'idempotent')
  ),
  0,
  'an identical rerun records zero semantic changes'
);

set local role service_role;
insert into sports_sync_test_state (label, run_id)
values (
  'changed',
  public.begin_sports_sync('football-data', current_date - 1, current_date + 45, 'retry')
);
select lives_ok(
  $$select * from public.complete_sports_sync(
    (select run_id from sports_sync_test_state where label = 'changed'),
    'football',
    '[{"provider_external_id":"2001","code":"CL","name":"UEFA Champions League","country_name":"Europe"}]'::jsonb,
    '[{"provider_external_id":"64","name":"Liverpool FC","short_name":"Liverpool","tla":"LIV","country_name":"England"},{"provider_external_id":"65","name":"Manchester City FC","short_name":"Man City","tla":"MCI","country_name":"England"}]'::jsonb,
    '[{"competition_external_id":"2001","team_external_id":"64","season_label":"2026"},{"competition_external_id":"2001","team_external_id":"65","season_label":"2026"}]'::jsonb,
    '[{"provider_external_id":"6001","competition_external_id":"2001","home_team_external_id":"64","away_team_external_id":"65","starts_at":"2026-09-10T19:30:00+01:30","status":"postponed","matchday":1,"stage":"LEAGUE_STAGE","season_label":"2026"}]'::jsonb,
    3,
    0
  )$$,
  'a changed provider fixture updates the existing identity'
);
reset role;

select is((select count(*) from public.matches where provider = 'football-data' and provider_external_id = '6001'), 1::bigint, 'changed fixtures do not duplicate provider identity');
select is((select starts_at from public.matches where provider_external_id = '6001'), '2026-09-10 18:00:00+00'::timestamptz, 'equivalent offset timestamps normalize to the same UTC instant');
select is((select status::text from public.matches where provider_external_id = '6001'), 'postponed', 'changed fixture state is updated');
select is((select matches_changed from public.provider_sync_runs where id = (select run_id from sports_sync_test_state where label = 'changed')), 1, 'changed fixture count is recorded');

set local role service_role;
insert into sports_sync_test_state (label, run_id)
values (
  'failed',
  public.begin_sports_sync('football-data', current_date - 1, current_date + 45, 'retry')
);
select throws_ok(
  $$select * from public.complete_sports_sync(
    (select run_id from sports_sync_test_state where label = 'failed'),
    'football',
    '[{"provider_external_id":"9991","code":"FAIL","name":"Should Roll Back","country_name":"Nowhere"}]'::jsonb,
    '[]'::jsonb,
    '[]'::jsonb,
    '[{"provider_external_id":"9992","competition_external_id":"9991","home_team_external_id":"missing-home","away_team_external_id":"missing-away","starts_at":"2026-09-10T18:00:00Z","status":"timed","matchday":1,"stage":"TEST","season_label":"2026"}]'::jsonb,
    2,
    0
  )$$,
  'P0001',
  'INVALID_RESPONSE',
  'an invalid normalized batch fails atomically'
);
select lives_ok(
  $$select public.fail_sports_sync(
    (select run_id from sports_sync_test_state where label = 'failed'),
    2,
    0,
    'INVALID_RESPONSE',
    'Provider response did not match the expected schema.'
  )$$,
  'a failed run records only bounded safe diagnostics'
);
reset role;

select is((select count(*) from public.competitions where provider_external_id = '9991'), 0::bigint, 'a failed batch preserves the prior catalog without partial competition rows');
select is((select status::text from public.matches where provider_external_id = '6001'), 'postponed', 'a failed batch preserves the last-good fixture');
select is((select count(*) from public.matches where provider_external_id = '5000'), 1::bigint, 'syncs retain matches that fall outside the active window');
select ok(
  (
    select status = 'failed'
      and error_code = 'INVALID_RESPONSE'
      and error_summary = 'Provider response did not match the expected schema.'
      and finished_at is not null
      and duration_ms >= 0
    from public.provider_sync_runs
    where id = (select run_id from sports_sync_test_state where label = 'failed')
  ),
  'failed sync evidence records safe outcome and duration'
);

set local role anon;
select is(
  (select count(*) from public.get_public_provider_freshness('football-data')),
  1::bigint,
  'public freshness reveals only a successful provider timestamp'
);
reset role;

select * from finish();
rollback;
