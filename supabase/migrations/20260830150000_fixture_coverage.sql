create index matches_provider_future_coverage_idx
  on public.matches (provider, starts_at desc)
  where status in ('scheduled', 'timed', 'postponed');

drop function public.get_public_provider_freshness(text);

create function public.get_public_provider_freshness(input_provider text)
returns table (
  provider text,
  updated_at timestamptz,
  coverage_through timestamptz
)
language sql
security definer
stable
set search_path = ''
as $function$
  with last_good as (
    select
      sync_run.provider,
      sync_run.finished_at as updated_at
    from public.provider_sync_runs as sync_run
    where sync_run.provider = lower(btrim(input_provider))
      and sync_run.status = 'succeeded'
    order by sync_run.finished_at desc, sync_run.id desc
    limit 1
  )
  select
    last_good.provider,
    last_good.updated_at,
    (
      select max(match.starts_at)
      from public.matches as match
      join public.competitions as competition
        on competition.id = match.competition_id
      join public.sports as sport
        on sport.id = competition.sport_id
      join public.teams as home_team
        on home_team.id = match.home_team_id
      join public.teams as away_team
        on away_team.id = match.away_team_id
      where match.provider = last_good.provider
        and match.starts_at >= statement_timestamp()
        and match.last_synced_at <= last_good.updated_at
        and match.status in ('scheduled', 'timed', 'postponed')
        and sport.active
        and competition.active
        and home_team.active
        and away_team.active
    ) as coverage_through
  from last_good;
$function$;

comment on function public.get_public_provider_freshness(text) is
  'Returns the last successful update and maximum observed eligible future fixture, without detailed run evidence or a completeness claim.';

revoke all on function public.get_public_provider_freshness(text)
  from public, anon, authenticated, service_role;
grant execute on function public.get_public_provider_freshness(text)
  to anon, authenticated;
