begin;

create index if not exists events_match_watch_page_idx
  on public.events(match_id,starts_at,title,id) where status='published';

-- Preserve the existing acquisition/visibility contract while making later
-- pages reachable. The legacy two-argument RPC remains available to callers.
create or replace function public.list_match_events_page(
  input_match_id uuid,
  input_limit integer default 20,
  input_offset integer default 0
)
returns table (
  event_id uuid,title text,home_team_name text,away_team_name text,
  competition_name text,starts_at timestamptz,audience text,audience_team_name text,
  capacity integer,approved_attendee_count bigint,requires_approval boolean
)
language plpgsql stable security definer set search_path = ''
as $function$
declare
  actor_id uuid := auth.uid();
begin
  if input_match_id is null or input_limit is null or input_limit not between 1 and 50
    or input_offset is null or input_offset not between 0 and 10000 then
    raise exception using errcode='P0001',message='VALIDATION_FAILED';
  end if;
  return query select event.id,event.title,home_team.name,away_team.name,competition.name,
    event.starts_at,event.audience::text,audience_team.name,event.capacity,
    (select count(*) from public.event_attendance attendance
      where attendance.event_id=event.id and attendance.status='approved'),
    event.requires_approval
  from public.events event
  join public.matches match on match.id=event.match_id
  join public.teams home_team on home_team.id=match.home_team_id
  join public.teams away_team on away_team.id=match.away_team_id
  join public.competitions competition on competition.id=match.competition_id
  left join public.teams audience_team on audience_team.id=event.audience_team_id
  where event.match_id=input_match_id
    and (event.host_venue_id is null or private.venue_allows_event_acquisition(event.id,statement_timestamp()))
    and event.status='published' and event.starts_at>statement_timestamp()
    and private.event_is_visible_to_actor(event.id,actor_id)
  order by event.starts_at,event.title,event.id
  limit input_limit offset input_offset;
end;
$function$;

revoke all on function public.list_match_events_page(uuid,integer,integer) from public,anon,authenticated,service_role;
grant execute on function public.list_match_events_page(uuid,integer,integer) to anon,authenticated;
comment on function public.list_match_events_page(uuid,integer,integer) is
  'Bounded fixture watch-plan pagination with unchanged visibility, billing acquisition and safe summary fields.';

commit;
