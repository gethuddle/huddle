begin;

drop function public.discover_events(
  uuid,
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
);

create function public.discover_events(
  input_city_id uuid,
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
  away_team_name text,
  starts_at timestamptz,
  ends_at timestamptz,
  city_name text,
  place_kind text,
  location_summary text,
  audience text,
  audience_group_name text,
  audience_team_name text,
  capacity integer,
  approved_attendee_count bigint,
  remaining_capacity integer,
  requires_approval boolean,
  interest_score integer,
  cursor_distance_band integer,
  has_more boolean
)
language plpgsql
security definer
stable
set search_path = ''
as $function$
#variable_conflict use_variable
declare
  actor_id uuid := auth.uid();
  origin extensions.geography(Point, 4326);
  bounded_limit integer;
begin
  if input_city_id is null
    or not exists (
      select 1
      from public.cities as city
      where city.id = input_city_id
        and city.active
    )
    or input_radius_km is null
    or input_radius_km not in (5, 15, 30, 50)
    or not private.discovery_window_is_valid(input_from, input_to)
    or (input_lat is null) <> (input_lng is null)
    or (input_lat is not null and input_lat not between -90 and 90)
    or (input_lng is not null and input_lng not between -180 and 180)
    or input_limit is null
    or input_limit not between 1 and 50
    or num_nonnulls(
      input_after_interest_score,
      input_after_distance_band,
      input_after_starts_at,
      input_after_event_id
    ) not in (0, 4)
    or (
      input_after_interest_score is not null
      and input_after_interest_score not between 0 and 15
    )
    or (
      input_after_distance_band is not null
      and input_after_distance_band not between 0 and 4
    )
    or (
      input_after_starts_at is not null
      and (
        input_after_starts_at < input_from
        or input_after_starts_at >= input_to
      )
    ) then
    raise exception using errcode = 'P0001', message = 'VALIDATION_FAILED';
  end if;
  bounded_limit := input_limit;

  if input_lat is null then
    select city.center
    into origin
    from public.cities as city
    where city.id = input_city_id
      and city.active;
  else
    origin := extensions.st_setsrid(
      extensions.st_makepoint(input_lng, input_lat),
      4326
    )::extensions.geography;
  end if;

  if origin is null then
    raise exception using errcode = 'P0001', message = 'VALIDATION_FAILED';
  end if;

  return query
  with spatial_candidates as (
    select
      public_event.id as event_id,
      round(
        extensions.st_distance(origin, public_event.public_location)
      )::bigint as distance_meters
    from public.events as public_event
    where public_event.place_kind = 'public_place'
      and public_event.public_location is not null
      and extensions.st_dwithin(
        public_event.public_location,
        origin,
        input_radius_km * 1000.0
      )

    union all

    select
      venue_event.id as event_id,
      round(
        extensions.st_distance(origin, nearby_venue.location)
      )::bigint as distance_meters
    from public.venues as nearby_venue
    join public.events as venue_event on venue_event.host_venue_id = nearby_venue.id
    where venue_event.place_kind = 'venue'
      and extensions.st_dwithin(
        nearby_venue.location,
        origin,
        input_radius_km * 1000.0
      )

    union all

    select
      private_location.event_id,
      round(
        extensions.st_distance(origin, private_location.location)
      )::bigint as distance_meters
    from public.event_private_locations as private_location
    join public.events as home_event on home_event.id = private_location.event_id
    where home_event.place_kind = 'home'
      and extensions.st_dwithin(
        private_location.location,
        origin,
        input_radius_km * 1000.0
      )
  ),
  ranked_events as (
    select
      event.id as event_id,
      event.title,
      case when event.host_user_id is not null then 'person' else 'venue' end as host_kind,
      coalesce(host_profile.display_name, host_venue.name) as host_display_name,
      host_venue.slug as host_venue_slug,
      host_venue.verification_status::text as venue_verification_status,
      event.match_id,
      competition.name as competition_name,
      home_team.name as home_team_name,
      away_team.name as away_team_name,
      event.starts_at,
      event.ends_at,
      city.name_en as city_name,
      event.place_kind::text as place_kind,
      case
        when event.place_kind = 'home' and distance.distance_meters < 5000
          then 'Within 5 km'
        when event.place_kind = 'home' and distance.distance_meters < 15000
          then '5–15 km away'
        when event.place_kind = 'home' and distance.distance_meters < 50000
          then '15–50 km away'
        when event.place_kind = 'home'
          then '50+ km away'
        when distance.distance_meters < 1000
          then 'Within 1 km'
        when distance.distance_meters < 5000
          then '1–5 km away'
        when distance.distance_meters < 15000
          then '5–15 km away'
        when distance.distance_meters < 50000
          then '15–50 km away'
        else '50+ km away'
      end as location_summary,
      event.audience::text as audience,
      audience_group.name as audience_group_name,
      audience_team.name as audience_team_name,
      event.capacity,
      attendance_counts.approved_count as approved_attendee_count,
      greatest(event.capacity - attendance_counts.approved_count::integer, 0)
        as remaining_capacity,
      event.requires_approval,
      case
        when actor_id is null then 0
        else
          case when exists (
            select 1
            from public.subscriptions as subscription
            where subscription.user_id = actor_id
              and subscription.kind = 'team'
              and subscription.team_id in (
                match.home_team_id,
                match.away_team_id,
                event.audience_team_id
              )
          ) then 8 else 0 end
          + case when exists (
            select 1
            from public.subscriptions as subscription
            where subscription.user_id = actor_id
              and subscription.kind = 'competition'
              and subscription.competition_id = match.competition_id
          ) then 4 else 0 end
          + case when exists (
            select 1
            from public.subscriptions as subscription
            where subscription.user_id = actor_id
              and subscription.kind = 'sport'
              and subscription.sport_id = competition.sport_id
          ) then 2 else 0 end
          + case when exists (
            select 1
            from public.venue_follows as venue_follow
            where venue_follow.user_id = actor_id
              and venue_follow.venue_id = event.host_venue_id
          ) then 1 else 0 end
      end as interest_score,
      case
        when event.place_kind = 'home' and distance.distance_meters < 5000 then 0
        when event.place_kind = 'home' and distance.distance_meters < 15000 then 1
        when event.place_kind = 'home' and distance.distance_meters < 50000 then 2
        when event.place_kind = 'home' then 3
        when distance.distance_meters < 1000 then 0
        when distance.distance_meters < 5000 then 1
        when distance.distance_meters < 15000 then 2
        when distance.distance_meters < 50000 then 3
        else 4
      end as distance_band
    from public.events as event
    join public.matches as match on match.id = event.match_id
    join public.competitions as competition on competition.id = match.competition_id
    join public.teams as home_team on home_team.id = match.home_team_id
    join public.teams as away_team on away_team.id = match.away_team_id
    join public.cities as city on city.id = event.city_id
    join spatial_candidates as distance on distance.event_id = event.id
    left join public.profiles as host_profile on host_profile.id = event.host_user_id
    left join public.venues as host_venue on host_venue.id = event.host_venue_id
    left join public.groups as audience_group on audience_group.id = event.audience_group_id
    left join public.teams as audience_team on audience_team.id = event.audience_team_id
    cross join lateral (
      select count(*) as approved_count
      from public.event_attendance as attendance
      where attendance.event_id = event.id
        and attendance.status = 'approved'
    ) as attendance_counts
    where event.status = 'published'
      and event.starts_at > statement_timestamp()
      and event.starts_at >= input_from
      and event.starts_at < input_to
      and event.audience <> 'invite_only'
      and (input_team_id is null or input_team_id in (match.home_team_id, match.away_team_id))
      and (input_competition_id is null or match.competition_id = input_competition_id)
      and (input_match_id is null or match.id = input_match_id)
      and private.event_is_visible_to_actor(event.id, actor_id)
      and (
        event.host_venue_id is not null
        or private.profile_is_fan_eligible(actor_id)
      )
      and (actor_id is null or event.host_user_id is distinct from actor_id)
      and (actor_id is null or event.created_by is distinct from actor_id)
      and not exists (
        select 1
        from public.venue_memberships as membership
        where membership.user_id = actor_id
          and membership.venue_id = event.host_venue_id
          and membership.status = 'active'
          and membership.revoked_at is null
      )
      and not exists (
        select 1
        from public.event_invitations as invitation
        where invitation.event_id = event.id
          and invitation.invitee_id = actor_id
      )
      and not exists (
        select 1
        from public.event_attendance as attendance
        where attendance.event_id = event.id
          and attendance.user_id = actor_id
      )
      and attendance_counts.approved_count < event.capacity
  ),
  cursor_page as (
    select ranked.*
    from ranked_events as ranked
    where input_after_interest_score is null
      or ranked.interest_score < input_after_interest_score
      or (
        ranked.interest_score = input_after_interest_score
        and ranked.distance_band > input_after_distance_band
      )
      or (
        ranked.interest_score = input_after_interest_score
        and ranked.distance_band = input_after_distance_band
        and ranked.starts_at > input_after_starts_at
      )
      or (
        ranked.interest_score = input_after_interest_score
        and ranked.distance_band = input_after_distance_band
        and ranked.starts_at = input_after_starts_at
        and ranked.event_id > input_after_event_id
      )
    order by
      ranked.interest_score desc,
      ranked.distance_band,
      ranked.starts_at,
      ranked.event_id
    limit bounded_limit + 1
  ),
  numbered_page as (
    select
      page.*,
      row_number() over (
        order by
          page.interest_score desc,
          page.distance_band,
          page.starts_at,
          page.event_id
      ) as row_number,
      count(*) over () > bounded_limit as has_more
    from cursor_page as page
  )
  select
    page.event_id,
    page.title,
    page.host_kind,
    page.host_display_name,
    page.host_venue_slug,
    page.venue_verification_status,
    page.match_id,
    page.competition_name,
    page.home_team_name,
    page.away_team_name,
    page.starts_at,
    page.ends_at,
    page.city_name,
    page.place_kind,
    page.location_summary,
    page.audience,
    page.audience_group_name,
    page.audience_team_name,
    page.capacity,
    page.approved_attendee_count,
    page.remaining_capacity,
    page.requires_approval,
    page.interest_score,
    page.distance_band,
    page.has_more
  from numbered_page as page
  where page.row_number <= bounded_limit
  order by
    page.interest_score desc,
    page.distance_band,
    page.starts_at,
    page.event_id;
end;
$function$;

comment on function public.discover_events(
  uuid,
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
  'Returns one acquisition-only authorization-filtered PostGIS keyset page. Owned, managed, invited, responded, full, and invite-only events are excluded before pagination; exact private locations remain internal.';

revoke all on function public.discover_events(
  uuid,
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
) from public;

grant execute on function public.discover_events(
  uuid,
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

commit;
