begin;

-- Explore previously evaluated this complete page projection once for each
-- attendance mode. Add one internal mode that evaluates the same authorized
-- candidate set once while preserving the compatibility wrappers.
do $migration$
declare
  function_signature constant regprocedure :=
    'private.discover_event_page(text,double precision,double precision,integer,timestamptz,timestamptz,uuid,uuid,uuid,integer,integer,timestamptz,uuid,integer)'::regprocedure;
  current_definition text := pg_get_functiondef(function_signature);
  updated_definition text;
  old_validation constant text :=
    'if input_mode not in (''reservations'', ''open_door'', ''owned'')';
  new_validation constant text :=
    'if input_mode not in (''reservations'', ''open_door'', ''owned'', ''all'')';
  old_mode_predicate constant text := $old$
      and (
        (input_mode = 'reservations' and event.attendance_mode = 'reservations')
        or (input_mode = 'open_door' and event.attendance_mode = 'open_door')
        or (
          input_mode = 'owned'
          and actor_id is not null
          and exists (
            select 1 from public.venue_memberships as membership
            where membership.user_id = actor_id
              and membership.venue_id = event.host_venue_id
              and membership.status = 'active'
              and membership.revoked_at is null
          )
        )
      )
$old$;
  new_mode_predicate constant text := $new$
      and (
        (input_mode = 'all' and event.attendance_mode in ('reservations', 'open_door'))
        or (input_mode = 'reservations' and event.attendance_mode = 'reservations')
        or (input_mode = 'open_door' and event.attendance_mode = 'open_door')
        or (
          input_mode = 'owned'
          and actor_id is not null
          and exists (
            select 1 from public.venue_memberships as membership
            where membership.user_id = actor_id
              and membership.venue_id = event.host_venue_id
              and membership.status = 'active'
              and membership.revoked_at is null
          )
        )
      )
$new$;
begin
  if strpos(current_definition, old_validation) = 0
    or strpos(current_definition, old_mode_predicate) = 0 then
    raise exception 'discover_event_page definition does not match the expected predecessor';
  end if;

  updated_definition := replace(current_definition, old_validation, new_validation);
  updated_definition := replace(updated_definition, old_mode_predicate, new_mode_predicate);
  execute updated_definition;
end;
$migration$;

create function public.discover_event_feed(
  input_lat double precision,
  input_lng double precision,
  input_radius_km integer,
  input_from timestamptz,
  input_to timestamptz,
  input_team_id uuid default null,
  input_competition_id uuid default null,
  input_match_id uuid default null,
  input_after_interest_score integer default null,
  input_after_distance_band integer default null,
  input_after_starts_at timestamptz default null,
  input_after_event_id uuid default null,
  input_limit integer default 20
)
returns jsonb
language sql
security definer
stable
set search_path = ''
as $function$
  with page as materialized (
    select *
    from private.discover_event_page(
      'all',
      input_lat,
      input_lng,
      input_radius_km,
      input_from,
      input_to,
      input_team_id,
      input_competition_id,
      input_match_id,
      input_after_interest_score,
      input_after_distance_band,
      input_after_starts_at,
      input_after_event_id,
      input_limit
    )
  ),
  enriched as (
    select
      page.*,
      case when home_team.active then home_team.tla else null end as home_team_tla,
      case when home_team.active then home_team.crest_url else null end as home_team_crest_url,
      case when away_team.active then away_team.tla else null end as away_team_tla,
      case when away_team.active then away_team.crest_url else null end as away_team_crest_url,
      case
        when event.place_kind = 'venue' and host_venue.location is not null
          then host_venue.name
        when event.place_kind = 'public_place' and event.public_location is not null
          then event.public_place_name
        else null
      end as map_place_name,
      case
        when event.place_kind = 'venue' and host_venue.location is not null
          then extensions.st_y(host_venue.location::extensions.geometry)::double precision
        when event.place_kind = 'public_place' and event.public_location is not null
          then extensions.st_y(event.public_location::extensions.geometry)::double precision
        else null
      end as map_latitude,
      case
        when event.place_kind = 'venue' and host_venue.location is not null
          then extensions.st_x(host_venue.location::extensions.geometry)::double precision
        when event.place_kind = 'public_place' and event.public_location is not null
          then extensions.st_x(event.public_location::extensions.geometry)::double precision
        else null
      end as map_longitude
    from page
    join public.events as event on event.id = page.event_id
    join public.matches as match on match.id = event.match_id
    join public.teams as home_team on home_team.id = match.home_team_id
    join public.teams as away_team on away_team.id = match.away_team_id
    left join public.venues as host_venue on host_venue.id = event.host_venue_id
  )
  select jsonb_build_object(
    'viewer_id', auth.uid(),
    'items', coalesce(
      jsonb_agg(
        to_jsonb(enriched)
        order by
          enriched.interest_score desc,
          enriched.cursor_distance_band,
          enriched.starts_at,
          enriched.event_id
      ),
      '[]'::jsonb
    )
  )
  from enriched;
$function$;

revoke all on function public.discover_event_feed(
  double precision,
  double precision,
  integer,
  timestamptz,
  timestamptz,
  uuid,
  uuid,
  uuid,
  integer,
  integer,
  timestamptz,
  uuid,
  integer
) from public, anon, authenticated, service_role;
grant execute on function public.discover_event_feed(
  double precision,
  double precision,
  integer,
  timestamptz,
  timestamptz,
  uuid,
  uuid,
  uuid,
  integer,
  integer,
  timestamptz,
  uuid,
  integer
) to anon, authenticated;

comment on function public.discover_event_feed(
  double precision,
  double precision,
  integer,
  timestamptz,
  timestamptz,
  uuid,
  uuid,
  uuid,
  integer,
  integer,
  timestamptz,
  uuid,
  integer
) is
  'One-call Explore page projection with actor identity, authorized rows, safe team visuals, and public-only map points.';

commit;
