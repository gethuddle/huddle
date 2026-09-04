-- Recover saved private-host drafts without projecting protected location data.
create or replace function public.list_my_event_drafts(
  input_limit integer default 20,
  input_offset integer default 0
)
returns table (
  draft_id uuid,
  title text,
  step integer,
  home_team_name text,
  away_team_name text,
  starts_at timestamptz,
  updated_at timestamptz,
  total_count bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  actor_id uuid := auth.uid();
begin
  if actor_id is null or not private.profile_is_not_deleted(actor_id)
    or not exists (select 1 from auth.users as account where account.id = actor_id) then
    raise exception using errcode = 'P0001', message = 'AUTH_REQUIRED';
  end if;
  if input_limit is null or input_limit < 1 or input_limit > 50
    or input_offset is null or input_offset < 0 or input_offset > 10000 then
    raise exception using errcode = 'P0001', message = 'VALIDATION_FAILED';
  end if;

  return query
  select draft.id, nullif(draft.draft_values ->> 'title', ''), draft.step,
    home_team.name, away_team.name, fixture.starts_at, draft.updated_at,
    count(*) over ()
  from public.event_drafts as draft
  -- Compare text to avoid casting incomplete draft JSON. The stored values are
  -- validated separately on save, but recovery does not depend on completeness.
  left join public.matches as fixture on fixture.id::text = draft.draft_values ->> 'matchId'
  left join public.teams as home_team on home_team.id = fixture.home_team_id
  left join public.teams as away_team on away_team.id = fixture.away_team_id
  where draft.owner_id = actor_id
  order by draft.updated_at desc, draft.id
  limit input_limit offset input_offset;
end;
$function$;

comment on function public.list_my_event_drafts(integer, integer) is
  'Bounded authenticated-owner recovery summaries; never returns protected address, coordinates or draft JSON. Recovery remains available without current Fan activation.';
revoke all on function public.list_my_event_drafts(integer, integer) from public, anon, authenticated, service_role;
grant execute on function public.list_my_event_drafts(integer, integer) to authenticated;
