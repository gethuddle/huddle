begin;

revoke all on function public.search_assisted_events(
  date, date, uuid[], uuid, text, text, text[], double precision, double precision
) from public, anon, authenticated;

alter function public.search_assisted_events(
  date, date, uuid[], uuid, text, text, text[], double precision, double precision
) set schema private;

alter function private.search_assisted_events(
  date, date, uuid[], uuid, text, text, text[], double precision, double precision
) rename to search_assisted_events_core;

revoke all on function private.search_assisted_events_core(
  date, date, uuid[], uuid, text, text, text[], double precision, double precision
) from public, anon, authenticated;

comment on function private.search_assisted_events_core(
  date, date, uuid[], uuid, text, text, text[], double precision, double precision
) is
  'Internal authorized and deterministically ranked assisted-event search. Public callers use the bounded safe projection.';

create function public.search_assisted_events(
  input_from_date date,
  input_to_date date,
  input_team_ids uuid[],
  input_competition_id uuid,
  input_relationship text,
  input_host_kind text,
  input_facilities text[],
  input_lat double precision,
  input_lng double precision
)
returns table (
  event_id uuid,
  title text,
  host_kind text,
  host_display_name text,
  host_venue_slug text,
  venue_verification_status text,
  match_id uuid,
  competition_name text,
  home_team_name text,
  home_team_tla text,
  home_team_crest_url text,
  away_team_name text,
  away_team_tla text,
  away_team_crest_url text,
  group_name text,
  group_slug text,
  group_relationship text,
  starts_at timestamptz,
  ends_at timestamptz,
  place_kind text,
  location_summary text,
  audience text,
  capacity integer,
  approved_attendee_count bigint,
  remaining_capacity integer,
  requires_approval boolean,
  attendance_mode text,
  viewer_participation_state text,
  venue_facilities text[],
  interest_score integer,
  distance_band integer,
  matched_friend_host boolean,
  matched_my_group boolean
)
language sql
security definer
stable
set search_path = ''
as $function$
  select
    result.event_id,
    result.title,
    result.host_kind,
    result.host_display_name,
    result.host_venue_slug,
    result.venue_verification_status,
    result.match_id,
    result.competition_name,
    result.home_team_name,
    home_team.tla,
    home_team.crest_url,
    result.away_team_name,
    away_team.tla,
    away_team.crest_url,
    coalesce(organizing_group.name, audience_group.name),
    case
      when organizing_group.id is not null and (
        (
          organizing_group.visibility = 'discoverable'
          and organizing_group.lifecycle = 'active'
          and organizing_group.suspended_at is null
        )
        or private.actor_is_active_group_member(organizing_group.id, auth.uid())
      ) then organizing_group.slug
      when organizing_group.id is null
        and audience_group.id is not null
        and (
          (
            audience_group.visibility = 'discoverable'
            and audience_group.lifecycle = 'active'
            and audience_group.suspended_at is null
          )
          or private.actor_is_active_group_member(audience_group.id, auth.uid())
        ) then audience_group.slug
      else null
    end,
    case
      when organizing_group.id is not null then 'organizer'
      when audience_group.id is not null then 'audience'
      else null
    end,
    result.starts_at,
    result.ends_at,
    result.place_kind,
    result.location_summary,
    result.audience,
    result.capacity,
    result.approved_attendee_count,
    result.remaining_capacity,
    result.requires_approval,
    result.attendance_mode,
    result.viewer_participation_state,
    result.venue_facilities,
    result.interest_score,
    result.distance_band,
    result.matched_friend_host,
    result.matched_my_group
  from private.search_assisted_events_core(
    input_from_date,
    input_to_date,
    input_team_ids,
    input_competition_id,
    input_relationship,
    input_host_kind,
    input_facilities,
    input_lat,
    input_lng
  ) as result
  join public.events as event on event.id = result.event_id
  join public.matches as match on match.id = result.match_id
  join public.teams as home_team on home_team.id = match.home_team_id
  join public.teams as away_team on away_team.id = match.away_team_id
  left join public.groups as organizing_group on organizing_group.id = event.organizing_group_id
  left join public.groups as audience_group on audience_group.id = event.audience_group_id
  order by
    result.interest_score desc,
    result.distance_band,
    result.starts_at,
    result.event_id;
$function$;

comment on function public.search_assisted_events(
  date, date, uuid[], uuid, text, text, text[], double precision, double precision
) is
  'Returns at most three authorized assisted-event summaries with provider-safe team visuals and bounded related-group context; exact locations remain excluded.';

revoke all on function public.search_assisted_events(
  date, date, uuid[], uuid, text, text, text[], double precision, double precision
) from public, anon, authenticated;
grant execute on function public.search_assisted_events(
  date, date, uuid[], uuid, text, text, text[], double precision, double precision
) to authenticated;

commit;
