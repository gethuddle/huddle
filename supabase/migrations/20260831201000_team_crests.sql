alter table public.teams
add column crest_url text;

alter table public.teams
add constraint teams_crest_url_check check (
  crest_url is null
  or (
    char_length(crest_url) <= 500
    and crest_url ~ '^https://crests[.]football-data[.]org/[^[:space:]]+$'
  )
);

alter function public.complete_sports_sync(uuid, text, jsonb, jsonb, jsonb, jsonb, integer, integer)
rename to complete_sports_sync_without_crests;

alter function public.complete_sports_sync_without_crests(uuid, text, jsonb, jsonb, jsonb, jsonb, integer, integer)
set schema private;

revoke all on function private.complete_sports_sync_without_crests(uuid, text, jsonb, jsonb, jsonb, jsonb, integer, integer)
from public, anon, authenticated, service_role;

create function public.complete_sports_sync(
  input_run_id uuid,
  input_sport_slug text,
  input_competitions jsonb,
  input_teams jsonb,
  input_competition_teams jsonb,
  input_matches jsonb,
  input_request_count integer,
  input_retry_count integer
)
returns table (
  competitions_changed integer,
  teams_changed integer,
  matches_changed integer,
  duration_ms integer
)
language plpgsql
security definer
set search_path = ''
as $function$
declare
  target_provider text;
  target_sport_id uuid;
  competition_change_count integer;
  core_team_change_count integer;
  total_team_change_count integer := 0;
  match_change_count integer;
  run_duration_ms integer;
begin
  if jsonb_typeof(input_teams) <> 'array' then
    raise exception using errcode = 'P0001', message = 'INVALID_RESPONSE';
  end if;

  select sync_run.provider
  into target_provider
  from public.provider_sync_runs as sync_run
  where sync_run.id = input_run_id
    and sync_run.status = 'running'
  for update;

  if target_provider is null then
    raise exception using errcode = 'P0001', message = 'INVALID_TRANSITION';
  end if;

  select sport.id
  into target_sport_id
  from public.sports as sport
  where sport.slug = lower(btrim(input_sport_slug))::extensions.citext
    and sport.active;

  if target_sport_id is null then
    raise exception using errcode = 'P0001', message = 'INVALID_RESPONSE';
  end if;

  if exists (
    select 1
    from jsonb_to_recordset(input_teams) as incoming(
      provider_external_id text,
      name text,
      short_name text,
      tla text,
      country_name text,
      crest_url text
    )
    where incoming.crest_url is not null
      and (
        char_length(incoming.crest_url) > 500
        or incoming.crest_url !~ '^https://crests[.]football-data[.]org/[^[:space:]]+$'
      )
  ) then
    raise exception using errcode = 'P0001', message = 'INVALID_RESPONSE';
  end if;

  select count(*)::integer
  into total_team_change_count
  from jsonb_to_recordset(input_teams) as incoming(
    provider_external_id text,
    name text,
    short_name text,
    tla text,
    country_name text,
    crest_url text
  )
  left join public.teams as existing
    on existing.provider = target_provider
   and existing.provider_external_id = incoming.provider_external_id
  where existing.id is null
     or existing.sport_id is distinct from target_sport_id
     or existing.name is distinct from incoming.name
     or existing.short_name is distinct from incoming.short_name
     or existing.tla is distinct from incoming.tla
     or existing.country_name is distinct from incoming.country_name
     or (
       incoming.crest_url is not null
       and existing.crest_url is distinct from incoming.crest_url
     )
     or not existing.active;

  select
    result.competitions_changed,
    result.teams_changed,
    result.matches_changed,
    result.duration_ms
  into
    competition_change_count,
    core_team_change_count,
    match_change_count,
    run_duration_ms
  from private.complete_sports_sync_without_crests(
    input_run_id,
    input_sport_slug,
    input_competitions,
    input_teams,
    input_competition_teams,
    input_matches,
    input_request_count,
    input_retry_count
  ) as result;

  update public.teams as team
  set crest_url = incoming.crest_url
  from jsonb_to_recordset(input_teams) as incoming(
    provider_external_id text,
    name text,
    short_name text,
    tla text,
    country_name text,
    crest_url text
  )
  where team.provider = target_provider
    and team.provider_external_id = incoming.provider_external_id
    and incoming.crest_url is not null
    and team.crest_url is distinct from incoming.crest_url;

  update public.provider_sync_runs
  set teams_changed = total_team_change_count
  where id = input_run_id;

  return query
  select
    competition_change_count,
    total_team_change_count,
    match_change_count,
    run_duration_ms;
end;
$function$;

comment on function public.complete_sports_sync(uuid, text, jsonb, jsonb, jsonb, jsonb, integer, integer) is
  'Atomically upserts one normalized provider batch, including allowlisted team crests, and marks its durable sync run successful.';

revoke all on function public.complete_sports_sync(uuid, text, jsonb, jsonb, jsonb, jsonb, integer, integer)
from public, anon, authenticated;
grant execute on function public.complete_sports_sync(uuid, text, jsonb, jsonb, jsonb, jsonb, integer, integer)
to service_role;

create or replace view public.public_future_matches
with (security_invoker = true)
as
select
  match.id,
  sport.id as sport_id,
  sport.slug::text as sport_slug,
  competition.id as competition_id,
  competition.code as competition_code,
  competition.name as competition_name,
  home_team.id as home_team_id,
  home_team.name as home_team_name,
  home_team.short_name as home_team_short_name,
  home_team.tla as home_team_tla,
  away_team.id as away_team_id,
  away_team.name as away_team_name,
  away_team.short_name as away_team_short_name,
  away_team.tla as away_team_tla,
  match.starts_at,
  match.status,
  match.matchday,
  match.stage,
  match.season_label,
  match.last_synced_at,
  home_team.crest_url as home_team_crest_url,
  away_team.crest_url as away_team_crest_url
from public.matches as match
join public.competitions as competition on competition.id = match.competition_id
join public.sports as sport on sport.id = competition.sport_id
join public.teams as home_team on home_team.id = match.home_team_id
join public.teams as away_team on away_team.id = match.away_team_id
where match.starts_at >= statement_timestamp()
  and match.status in ('scheduled', 'timed', 'postponed')
  and sport.active
  and competition.active
  and home_team.active
  and away_team.active;

comment on view public.public_future_matches is
  'Provider-neutral future fixture projection with validated football-data team crest URLs.';
