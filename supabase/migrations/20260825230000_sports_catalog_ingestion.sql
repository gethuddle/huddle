begin;

create type public.sports_match_status as enum (
  'scheduled',
  'timed',
  'postponed',
  'cancelled',
  'finished'
);

create type public.provider_sync_status as enum ('running', 'succeeded', 'failed');

create table public.sports (
  id uuid primary key default gen_random_uuid(),
  slug extensions.citext not null unique,
  name text not null,
  active boolean not null default true,
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  constraint sports_slug_format_check check (
    slug::text = lower(slug::text)
    and slug::text ~ '^[a-z0-9]+(-[a-z0-9]+)*$'
  ),
  constraint sports_name_length_check check (
    name = btrim(name)
    and char_length(name) between 2 and 80
  )
);

create trigger sports_set_updated_at
before update on public.sports
for each row execute function private.set_updated_at();

create table public.competitions (
  id uuid primary key default gen_random_uuid(),
  sport_id uuid not null references public.sports(id) on delete restrict,
  provider text not null,
  provider_external_id text not null,
  code text,
  name text not null,
  country_name text,
  active boolean not null default true,
  last_synced_at timestamptz not null,
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  constraint competitions_provider_format_check check (
    provider = lower(provider)
    and provider ~ '^[a-z0-9]+(-[a-z0-9]+)*$'
  ),
  constraint competitions_external_id_check check (
    provider_external_id = btrim(provider_external_id)
    and char_length(provider_external_id) between 1 and 100
  ),
  constraint competitions_code_check check (
    code is null
    or (
      code = upper(code)
      and code ~ '^[A-Z0-9_-]{2,20}$'
    )
  ),
  constraint competitions_name_length_check check (
    name = btrim(name)
    and char_length(name) between 2 and 120
  ),
  constraint competitions_country_length_check check (
    country_name is null
    or (
      country_name = btrim(country_name)
      and char_length(country_name) between 2 and 100
    )
  ),
  unique (provider, provider_external_id)
);

create index competitions_sport_active_idx on public.competitions (sport_id, active);
create index competitions_code_idx on public.competitions (code);

create trigger competitions_set_updated_at
before update on public.competitions
for each row execute function private.set_updated_at();

create table public.teams (
  id uuid primary key default gen_random_uuid(),
  sport_id uuid not null references public.sports(id) on delete restrict,
  provider text not null,
  provider_external_id text not null,
  name text not null,
  short_name text,
  tla text,
  country_name text,
  active boolean not null default true,
  last_synced_at timestamptz not null,
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  constraint teams_provider_format_check check (
    provider = lower(provider)
    and provider ~ '^[a-z0-9]+(-[a-z0-9]+)*$'
  ),
  constraint teams_external_id_check check (
    provider_external_id = btrim(provider_external_id)
    and char_length(provider_external_id) between 1 and 100
  ),
  constraint teams_name_length_check check (
    name = btrim(name)
    and char_length(name) between 2 and 120
  ),
  constraint teams_short_name_length_check check (
    short_name is null
    or (
      short_name = btrim(short_name)
      and char_length(short_name) between 1 and 80
    )
  ),
  constraint teams_tla_check check (
    tla is null
    or (
      tla = upper(tla)
      and tla ~ '^[A-Z0-9]{2,5}$'
    )
  ),
  constraint teams_country_length_check check (
    country_name is null
    or (
      country_name = btrim(country_name)
      and char_length(country_name) between 2 and 100
    )
  ),
  unique (provider, provider_external_id)
);

create index teams_sport_id_idx on public.teams (sport_id);
create index teams_name_lower_idx on public.teams (lower(name));
create index teams_tla_idx on public.teams (tla);

create trigger teams_set_updated_at
before update on public.teams
for each row execute function private.set_updated_at();

create table public.competition_teams (
  competition_id uuid not null references public.competitions(id) on delete cascade,
  team_id uuid not null references public.teams(id) on delete cascade,
  season_label text not null,
  created_at timestamptz not null default statement_timestamp(),
  primary key (competition_id, team_id, season_label),
  constraint competition_teams_season_label_check check (
    season_label = btrim(season_label)
    and char_length(season_label) between 1 and 40
  )
);

create index competition_teams_team_idx
  on public.competition_teams (team_id, competition_id);

create table public.matches (
  id uuid primary key default gen_random_uuid(),
  provider text not null,
  provider_external_id text not null,
  competition_id uuid not null references public.competitions(id) on delete restrict,
  home_team_id uuid not null references public.teams(id) on delete restrict,
  away_team_id uuid not null references public.teams(id) on delete restrict,
  starts_at timestamptz not null,
  status public.sports_match_status not null,
  matchday integer,
  stage text,
  season_label text,
  last_synced_at timestamptz not null,
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  constraint matches_provider_format_check check (
    provider = lower(provider)
    and provider ~ '^[a-z0-9]+(-[a-z0-9]+)*$'
  ),
  constraint matches_external_id_check check (
    provider_external_id = btrim(provider_external_id)
    and char_length(provider_external_id) between 1 and 100
  ),
  constraint matches_distinct_teams_check check (home_team_id <> away_team_id),
  constraint matches_matchday_check check (matchday is null or matchday > 0),
  constraint matches_stage_length_check check (
    stage is null
    or (
      stage = btrim(stage)
      and char_length(stage) between 1 and 80
    )
  ),
  constraint matches_season_label_check check (
    season_label is null
    or (
      season_label = btrim(season_label)
      and char_length(season_label) between 1 and 40
    )
  ),
  unique (provider, provider_external_id)
);

create index matches_starts_status_idx on public.matches (starts_at, status);
create index matches_competition_starts_idx on public.matches (competition_id, starts_at);
create index matches_home_team_starts_idx on public.matches (home_team_id, starts_at);
create index matches_away_team_starts_idx on public.matches (away_team_id, starts_at);

create trigger matches_set_updated_at
before update on public.matches
for each row execute function private.set_updated_at();

create table public.provider_sync_runs (
  id uuid primary key default gen_random_uuid(),
  provider text not null,
  started_at timestamptz not null default statement_timestamp(),
  finished_at timestamptz,
  status public.provider_sync_status not null default 'running',
  window_start date not null,
  window_end date not null,
  request_count integer not null default 0,
  retry_count integer not null default 0,
  competitions_changed integer not null default 0,
  teams_changed integer not null default 0,
  matches_changed integer not null default 0,
  duration_ms integer,
  error_code text,
  error_summary text,
  trigger_source text not null,
  constraint provider_sync_provider_format_check check (
    provider = lower(provider)
    and provider ~ '^[a-z0-9]+(-[a-z0-9]+)*$'
  ),
  constraint provider_sync_window_check check (window_end >= window_start),
  constraint provider_sync_counts_check check (
    request_count >= 0
    and retry_count >= 0
    and competitions_changed >= 0
    and teams_changed >= 0
    and matches_changed >= 0
    and (duration_ms is null or duration_ms >= 0)
  ),
  constraint provider_sync_trigger_check check (
    trigger_source in ('scheduled', 'manual', 'retry')
  ),
  constraint provider_sync_error_code_check check (
    error_code is null
    or error_code in (
      'AUTH',
      'RATE_LIMIT',
      'UPSTREAM_4XX',
      'UPSTREAM_5XX',
      'TIMEOUT',
      'INVALID_RESPONSE',
      'UNKNOWN'
    )
  ),
  constraint provider_sync_error_summary_check check (
    error_summary is null
    or (
      error_summary = btrim(error_summary)
      and char_length(error_summary) between 1 and 280
    )
  ),
  constraint provider_sync_lifecycle_check check (
    (
      status = 'running'
      and finished_at is null
      and duration_ms is null
      and error_code is null
      and error_summary is null
    )
    or (
      status = 'succeeded'
      and finished_at is not null
      and duration_ms is not null
      and error_code is null
      and error_summary is null
    )
    or (
      status = 'failed'
      and finished_at is not null
      and duration_ms is not null
      and error_code is not null
      and error_summary is not null
    )
  )
);

create unique index provider_sync_one_running_idx
  on public.provider_sync_runs (provider)
  where status = 'running';
create index provider_sync_provider_finished_idx
  on public.provider_sync_runs (provider, finished_at desc)
  where status = 'succeeded';

insert into public.sports (
  id,
  slug,
  name,
  active
)
values (
  '00000000-0000-4000-8000-000000000020',
  'football',
  'Football',
  true
)
on conflict (slug) do update
set name = excluded.name,
    active = excluded.active;

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
  match.last_synced_at
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
  'Provider-neutral future fixture projection with no crest or raw provider payload fields.';

create or replace function public.record_sports_sync_denial(audit_request_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
begin
  perform private.write_security_audit(
    null,
    'sports.sync_authorize',
    'provider_sync',
    null,
    'denied',
    audit_request_id,
    '{}'::jsonb
  );
end;
$function$;

comment on function public.record_sports_sync_denial(uuid) is
  'Records only generic denied internal-sync evidence; it accepts no credential or provider payload.';

create or replace function public.begin_sports_sync(
  input_provider text,
  input_window_start date,
  input_window_end date,
  input_trigger_source text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $function$
declare
  normalized_provider text := lower(btrim(input_provider));
  created_run_id uuid;
begin
  if not pg_try_advisory_xact_lock(hashtextextended('huddle:sports-sync:' || normalized_provider, 0)) then
    raise exception using errcode = 'P0001', message = 'SYNC_ALREADY_RUNNING';
  end if;

  update public.provider_sync_runs
  set status = 'failed',
      finished_at = statement_timestamp(),
      duration_ms = greatest(
        0,
        floor(extract(epoch from (statement_timestamp() - started_at)) * 1000)::integer
      ),
      error_code = 'UNKNOWN',
      error_summary = 'Previous synchronization exceeded the running timeout.'
  where provider = normalized_provider
    and status = 'running'
    and started_at < statement_timestamp() - interval '30 minutes';

  insert into public.provider_sync_runs (
    provider,
    window_start,
    window_end,
    trigger_source
  )
  values (
    normalized_provider,
    input_window_start,
    input_window_end,
    input_trigger_source
  )
  returning id into created_run_id;

  return created_run_id;
exception
  when unique_violation then
    raise exception using errcode = 'P0001', message = 'SYNC_ALREADY_RUNNING';
end;
$function$;

comment on function public.begin_sports_sync(text, date, date, text) is
  'Claims one provider synchronization and commits a running evidence row before network work.';

create or replace function public.complete_sports_sync(
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
  synced_at timestamptz := statement_timestamp();
  competition_change_count integer := 0;
  team_change_count integer := 0;
  match_change_count integer := 0;
  run_duration_ms integer;
begin
  if jsonb_typeof(input_competitions) <> 'array'
    or jsonb_typeof(input_teams) <> 'array'
    or jsonb_typeof(input_competition_teams) <> 'array'
    or jsonb_typeof(input_matches) <> 'array' then
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
    from jsonb_to_recordset(input_competitions) as incoming(
      provider_external_id text,
      code text,
      name text,
      country_name text
    )
    where incoming.provider_external_id is null or incoming.name is null
  ) then
    raise exception using errcode = 'P0001', message = 'INVALID_RESPONSE';
  end if;

  select count(*)::integer
  into competition_change_count
  from jsonb_to_recordset(input_competitions) as incoming(
    provider_external_id text,
    code text,
    name text,
    country_name text
  )
  left join public.competitions as existing
    on existing.provider = target_provider
   and existing.provider_external_id = incoming.provider_external_id
  where existing.id is null
     or existing.sport_id is distinct from target_sport_id
     or existing.code is distinct from incoming.code
     or existing.name is distinct from incoming.name
     or existing.country_name is distinct from incoming.country_name
     or not existing.active;

  insert into public.competitions (
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
    target_sport_id,
    target_provider,
    incoming.provider_external_id,
    incoming.code,
    incoming.name,
    incoming.country_name,
    true,
    synced_at
  from jsonb_to_recordset(input_competitions) as incoming(
    provider_external_id text,
    code text,
    name text,
    country_name text
  )
  on conflict (provider, provider_external_id) do update
  set sport_id = excluded.sport_id,
      code = excluded.code,
      name = excluded.name,
      country_name = excluded.country_name,
      active = true,
      last_synced_at = excluded.last_synced_at;

  if exists (
    select 1
    from jsonb_to_recordset(input_teams) as incoming(
      provider_external_id text,
      name text,
      short_name text,
      tla text,
      country_name text
    )
    where incoming.provider_external_id is null or incoming.name is null
  ) then
    raise exception using errcode = 'P0001', message = 'INVALID_RESPONSE';
  end if;

  select count(*)::integer
  into team_change_count
  from jsonb_to_recordset(input_teams) as incoming(
    provider_external_id text,
    name text,
    short_name text,
    tla text,
    country_name text
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
     or not existing.active;

  insert into public.teams (
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
    target_sport_id,
    target_provider,
    incoming.provider_external_id,
    incoming.name,
    incoming.short_name,
    incoming.tla,
    incoming.country_name,
    true,
    synced_at
  from jsonb_to_recordset(input_teams) as incoming(
    provider_external_id text,
    name text,
    short_name text,
    tla text,
    country_name text
  )
  on conflict (provider, provider_external_id) do update
  set sport_id = excluded.sport_id,
      name = excluded.name,
      short_name = excluded.short_name,
      tla = excluded.tla,
      country_name = excluded.country_name,
      active = true,
      last_synced_at = excluded.last_synced_at;

  insert into public.competition_teams (competition_id, team_id, season_label)
  select competition.id, team.id, payload.season_label
  from jsonb_to_recordset(input_competition_teams) as payload(
    competition_external_id text,
    team_external_id text,
    season_label text
  )
  join public.competitions as competition
    on competition.provider = target_provider
   and competition.provider_external_id = payload.competition_external_id
  join public.teams as team
    on team.provider = target_provider
   and team.provider_external_id = payload.team_external_id
  on conflict (competition_id, team_id, season_label) do nothing;

  if jsonb_array_length(input_competition_teams) <> (
    select count(*)
    from jsonb_to_recordset(input_competition_teams) as payload(
      competition_external_id text,
      team_external_id text,
      season_label text
    )
    join public.competitions as competition
      on competition.provider = target_provider
     and competition.provider_external_id = payload.competition_external_id
    join public.teams as team
      on team.provider = target_provider
     and team.provider_external_id = payload.team_external_id
    where payload.season_label is not null
  ) then
    raise exception using errcode = 'P0001', message = 'INVALID_RESPONSE';
  end if;

  if exists (
    select 1
    from jsonb_to_recordset(input_matches) as incoming(
      provider_external_id text,
      competition_external_id text,
      home_team_external_id text,
      away_team_external_id text,
      starts_at timestamptz,
      status public.sports_match_status,
      matchday integer,
      stage text,
      season_label text
    )
    where incoming.provider_external_id is null
      or incoming.competition_external_id is null
      or incoming.home_team_external_id is null
      or incoming.away_team_external_id is null
      or incoming.starts_at is null
      or incoming.status is null
  ) then
    raise exception using errcode = 'P0001', message = 'INVALID_RESPONSE';
  end if;

  if jsonb_array_length(input_matches) <> (
    select count(*)
    from jsonb_to_recordset(input_matches) as incoming(
      provider_external_id text,
      competition_external_id text,
      home_team_external_id text,
      away_team_external_id text,
      starts_at timestamptz,
      status public.sports_match_status,
      matchday integer,
      stage text,
      season_label text
    )
    join public.competitions as competition
      on competition.provider = target_provider
     and competition.provider_external_id = incoming.competition_external_id
    join public.teams as home_team
      on home_team.provider = target_provider
     and home_team.provider_external_id = incoming.home_team_external_id
    join public.teams as away_team
      on away_team.provider = target_provider
     and away_team.provider_external_id = incoming.away_team_external_id
  ) then
    raise exception using errcode = 'P0001', message = 'INVALID_RESPONSE';
  end if;

  select count(*)::integer
  into match_change_count
  from jsonb_to_recordset(input_matches) as incoming(
    provider_external_id text,
    competition_external_id text,
    home_team_external_id text,
    away_team_external_id text,
    starts_at timestamptz,
    status public.sports_match_status,
    matchday integer,
    stage text,
    season_label text
  )
  join public.competitions as competition
    on competition.provider = target_provider
   and competition.provider_external_id = incoming.competition_external_id
  join public.teams as home_team
    on home_team.provider = target_provider
   and home_team.provider_external_id = incoming.home_team_external_id
  join public.teams as away_team
    on away_team.provider = target_provider
   and away_team.provider_external_id = incoming.away_team_external_id
  left join public.matches as existing
    on existing.provider = target_provider
   and existing.provider_external_id = incoming.provider_external_id
  where existing.id is null
     or existing.competition_id is distinct from competition.id
     or existing.home_team_id is distinct from home_team.id
     or existing.away_team_id is distinct from away_team.id
     or existing.starts_at is distinct from incoming.starts_at
     or existing.status is distinct from incoming.status
     or existing.matchday is distinct from incoming.matchday
     or existing.stage is distinct from incoming.stage
     or existing.season_label is distinct from incoming.season_label;

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
  select
    target_provider,
    incoming.provider_external_id,
    competition.id,
    home_team.id,
    away_team.id,
    incoming.starts_at,
    incoming.status,
    incoming.matchday,
    incoming.stage,
    incoming.season_label,
    synced_at
  from jsonb_to_recordset(input_matches) as incoming(
    provider_external_id text,
    competition_external_id text,
    home_team_external_id text,
    away_team_external_id text,
    starts_at timestamptz,
    status public.sports_match_status,
    matchday integer,
    stage text,
    season_label text
  )
  join public.competitions as competition
    on competition.provider = target_provider
   and competition.provider_external_id = incoming.competition_external_id
  join public.teams as home_team
    on home_team.provider = target_provider
   and home_team.provider_external_id = incoming.home_team_external_id
  join public.teams as away_team
    on away_team.provider = target_provider
   and away_team.provider_external_id = incoming.away_team_external_id
  on conflict (provider, provider_external_id) do update
  set competition_id = excluded.competition_id,
      home_team_id = excluded.home_team_id,
      away_team_id = excluded.away_team_id,
      starts_at = excluded.starts_at,
      status = excluded.status,
      matchday = excluded.matchday,
      stage = excluded.stage,
      season_label = excluded.season_label,
      last_synced_at = excluded.last_synced_at;

  select greatest(
    0,
    floor(extract(epoch from (synced_at - sync_run.started_at)) * 1000)::integer
  )
  into run_duration_ms
  from public.provider_sync_runs as sync_run
  where sync_run.id = input_run_id;

  update public.provider_sync_runs
  set status = 'succeeded',
      finished_at = synced_at,
      request_count = input_request_count,
      retry_count = input_retry_count,
      competitions_changed = competition_change_count,
      teams_changed = team_change_count,
      matches_changed = match_change_count,
      duration_ms = run_duration_ms
  where id = input_run_id;

  return query
  select
    competition_change_count,
    team_change_count,
    match_change_count,
    run_duration_ms;
end;
$function$;

comment on function public.complete_sports_sync(uuid, text, jsonb, jsonb, jsonb, jsonb, integer, integer) is
  'Atomically upserts one normalized provider batch and marks its durable sync run successful.';

create or replace function public.fail_sports_sync(
  input_run_id uuid,
  input_request_count integer,
  input_retry_count integer,
  input_error_code text,
  input_error_summary text
)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare
  failed_at timestamptz := statement_timestamp();
begin
  update public.provider_sync_runs as sync_run
  set status = 'failed',
      finished_at = failed_at,
      request_count = input_request_count,
      retry_count = input_retry_count,
      duration_ms = greatest(
        0,
        floor(extract(epoch from (failed_at - sync_run.started_at)) * 1000)::integer
      ),
      error_code = input_error_code,
      error_summary = left(btrim(input_error_summary), 280)
  where sync_run.id = input_run_id
    and sync_run.status = 'running';

  if not found then
    raise exception using errcode = 'P0001', message = 'INVALID_TRANSITION';
  end if;
end;
$function$;

comment on function public.fail_sports_sync(uuid, integer, integer, text, text) is
  'Marks a failed run with bounded safe diagnostics without changing the last-good catalog.';

create or replace function public.get_public_provider_freshness(input_provider text)
returns table (provider text, last_succeeded_at timestamptz)
language sql
security definer
stable
set search_path = ''
as $function$
  select
    sync_run.provider,
    max(sync_run.finished_at) as last_succeeded_at
  from public.provider_sync_runs as sync_run
  where sync_run.provider = lower(btrim(input_provider))
    and sync_run.status = 'succeeded'
  group by sync_run.provider;
$function$;

comment on function public.get_public_provider_freshness(text) is
  'Returns only the last successful timestamp, never detailed provider run errors.';

alter table public.sports enable row level security;
alter table public.sports force row level security;
alter table public.competitions enable row level security;
alter table public.competitions force row level security;
alter table public.teams enable row level security;
alter table public.teams force row level security;
alter table public.competition_teams enable row level security;
alter table public.competition_teams force row level security;
alter table public.matches enable row level security;
alter table public.matches force row level security;
alter table public.provider_sync_runs enable row level security;
alter table public.provider_sync_runs force row level security;

create policy sports_read_active
on public.sports
for select
to anon, authenticated
using (active);

create policy competitions_read_active
on public.competitions
for select
to anon, authenticated
using (
  active
  and exists (
    select 1
    from public.sports as sport
    where sport.id = competitions.sport_id
      and sport.active
  )
);

create policy teams_read_active
on public.teams
for select
to anon, authenticated
using (
  active
  and exists (
    select 1
    from public.sports as sport
    where sport.id = teams.sport_id
      and sport.active
  )
);

create policy competition_teams_read_active
on public.competition_teams
for select
to anon, authenticated
using (
  exists (
    select 1
    from public.competitions as competition
    join public.teams as team on team.id = competition_teams.team_id
    where competition.id = competition_teams.competition_id
      and competition.active
      and team.active
  )
);

create policy matches_read_public_future
on public.matches
for select
to anon, authenticated
using (
  starts_at >= statement_timestamp()
  and status in ('scheduled', 'timed', 'postponed')
  and exists (
    select 1
    from public.competitions as competition
    join public.sports as sport on sport.id = competition.sport_id
    join public.teams as home_team on home_team.id = matches.home_team_id
    join public.teams as away_team on away_team.id = matches.away_team_id
    where competition.id = matches.competition_id
      and competition.active
      and sport.active
      and home_team.active
      and away_team.active
  )
);

revoke all on public.sports from anon, authenticated;
revoke all on public.competitions from anon, authenticated;
revoke all on public.teams from anon, authenticated;
revoke all on public.competition_teams from anon, authenticated;
revoke all on public.matches from anon, authenticated;
revoke all on public.provider_sync_runs from anon, authenticated;
revoke all on public.public_future_matches from anon, authenticated;

grant select on public.sports to anon, authenticated;
grant select on public.competitions to anon, authenticated;
grant select on public.teams to anon, authenticated;
grant select on public.competition_teams to anon, authenticated;
grant select on public.matches to anon, authenticated;
grant select on public.public_future_matches to anon, authenticated;

revoke all on function public.record_sports_sync_denial(uuid) from public;
revoke all on function public.begin_sports_sync(text, date, date, text) from public, anon, authenticated;
revoke all on function public.complete_sports_sync(uuid, text, jsonb, jsonb, jsonb, jsonb, integer, integer) from public, anon, authenticated;
revoke all on function public.fail_sports_sync(uuid, integer, integer, text, text) from public, anon, authenticated;
revoke all on function public.get_public_provider_freshness(text) from public;

grant execute on function public.record_sports_sync_denial(uuid) to anon, authenticated;
grant execute on function public.begin_sports_sync(text, date, date, text) to service_role;
grant execute on function public.complete_sports_sync(uuid, text, jsonb, jsonb, jsonb, jsonb, integer, integer) to service_role;
grant execute on function public.fail_sports_sync(uuid, integer, integer, text, text) to service_role;
grant execute on function public.get_public_provider_freshness(text) to anon, authenticated;

commit;
