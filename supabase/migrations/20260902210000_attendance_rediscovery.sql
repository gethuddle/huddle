begin;

-- Attendance history is retained. Only current or non-rejoinable attendance
-- suppresses an acquisition result; a viewer who left may discover and rejoin.
create or replace function private.discover_event_page(
  input_mode text,
  input_lat double precision,
  input_lng double precision,
  input_radius_km integer,
  input_from timestamptz,
  input_to timestamptz,
  input_team_id uuid,
  input_competition_id uuid,
  input_match_id uuid,
  input_after_interest_score integer,
  input_after_distance_band integer,
  input_after_starts_at timestamptz,
  input_after_event_id uuid,
  input_limit integer
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
  if input_mode not in ('reservations', 'open_door', 'owned')
    or input_lat is null or input_lng is null
    or input_lat not between -90 and 90 or input_lng not between -180 and 180
    or input_radius_km is null or input_radius_km not in (5, 15, 30, 50)
    or not private.discovery_window_is_valid(input_from, input_to)
    or input_limit is null or input_limit not between 1 and 50
    or num_nonnulls(
      input_after_interest_score, input_after_distance_band,
      input_after_starts_at, input_after_event_id
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
      and (input_after_starts_at < input_from or input_after_starts_at >= input_to)
    ) then
    raise exception using errcode = 'P0001', message = 'VALIDATION_FAILED';
  end if;
  bounded_limit := input_limit;
  origin := extensions.st_setsrid(
    extensions.st_makepoint(input_lng, input_lat), 4326
  )::extensions.geography;

  return query
  with spatial_candidates as (
    select
      public_event.id as event_id,
      round(extensions.st_distance(origin, public_event.public_location))::bigint
        as distance_meters
    from public.events as public_event
    where public_event.place_kind = 'public_place'
      and public_event.public_location is not null
      and extensions.st_dwithin(
        public_event.public_location, origin, input_radius_km * 1000.0
      )

    union all

    select
      venue_event.id,
      round(extensions.st_distance(origin, nearby_venue.location))::bigint
    from public.venues as nearby_venue
    join public.events as venue_event on venue_event.host_venue_id = nearby_venue.id
    where venue_event.place_kind = 'venue'
      and nearby_venue.archived_at is null
      and extensions.st_dwithin(
        nearby_venue.location, origin, input_radius_km * 1000.0
      )

    union all

    select
      private_location.event_id,
      round(extensions.st_distance(origin, private_location.location))::bigint
    from public.event_private_locations as private_location
    join public.events as home_event on home_event.id = private_location.event_id
    where home_event.place_kind = 'home'
      and extensions.st_dwithin(
        private_location.location, origin, input_radius_km * 1000.0
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
      event.place_kind::text as place_kind,
      case
        when event.place_kind = 'home' and distance.distance_meters < 5000 then 'Within 5 km'
        when event.place_kind = 'home' and distance.distance_meters < 15000 then '5–15 km away'
        when event.place_kind = 'home' and distance.distance_meters < 50000 then '15–50 km away'
        when event.place_kind = 'home' then '50+ km away'
        when distance.distance_meters < 1000 then 'Within 1 km'
        when distance.distance_meters < 5000 then '1–5 km away'
        when distance.distance_meters < 15000 then '5–15 km away'
        when distance.distance_meters < 50000 then '15–50 km away'
        else '50+ km away'
      end as location_summary,
      event.audience::text as audience,
      audience_group.name as audience_group_name,
      audience_team.name as audience_team_name,
      event.capacity,
      attendance_counts.approved_count as approved_attendee_count,
      case when event.capacity is null then null
        else greatest(event.capacity - attendance_counts.approved_count::integer, 0) end
        as remaining_capacity,
      event.requires_approval,
      case when actor_id is null then 0 else
        case when exists (
          select 1 from public.subscriptions as subscription
          where subscription.user_id = actor_id and subscription.kind = 'team'
            and subscription.team_id in (
              match.home_team_id, match.away_team_id, event.audience_team_id
            )
        ) then 8 else 0 end
        + case when exists (
          select 1 from public.subscriptions as subscription
          where subscription.user_id = actor_id and subscription.kind = 'competition'
            and subscription.competition_id = match.competition_id
        ) then 4 else 0 end
        + case when exists (
          select 1 from public.subscriptions as subscription
          where subscription.user_id = actor_id and subscription.kind = 'sport'
            and subscription.sport_id = competition.sport_id
        ) then 2 else 0 end
        + case when exists (
          select 1 from public.venue_follows as venue_follow
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
    join spatial_candidates as distance on distance.event_id = event.id
    left join public.profiles as host_profile on host_profile.id = event.host_user_id
    left join public.venues as host_venue on host_venue.id = event.host_venue_id
    left join public.groups as audience_group on audience_group.id = event.audience_group_id
    left join public.teams as audience_team on audience_team.id = event.audience_team_id
    cross join lateral (
      select count(*) as approved_count
      from public.event_attendance as attendance
      where attendance.event_id = event.id and attendance.status = 'approved'
    ) as attendance_counts
    where event.status = 'published'
      and event.starts_at > statement_timestamp()
      and event.starts_at >= input_from and event.starts_at < input_to
      and event.audience <> 'invite_only'
      and (input_team_id is null or input_team_id in (match.home_team_id, match.away_team_id))
      and (input_competition_id is null or match.competition_id = input_competition_id)
      and (input_match_id is null or match.id = input_match_id)
      and (
        private.event_is_visible_to_actor(event.id, actor_id)
        or private.actor_manages_event(event.id, actor_id)
      )
      and (
        actor_id is null
        or event.created_by = actor_id
        or private.actor_manages_event(event.id, actor_id)
        or (
          not exists (
            select 1
            from public.event_attendance as existing_attendance
            where existing_attendance.event_id = event.id
              and existing_attendance.user_id = actor_id
              and existing_attendance.status <> 'left'
          )
          and not exists (
            select 1
            from public.event_invitations as existing_invitation
            where existing_invitation.event_id = event.id
              and existing_invitation.invitee_id = actor_id
              and (
                existing_invitation.status = 'pending'
                or not exists (
                  select 1
                  from public.event_attendance as left_attendance
                  where left_attendance.event_id = event.id
                    and left_attendance.user_id = actor_id
                    and left_attendance.status = 'left'
                )
              )
          )
        )
      )
      and (event.host_venue_id is not null or private.profile_is_fan_eligible(actor_id))
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
      and (
        event.capacity is null
        or attendance_counts.approved_count < event.capacity
        or private.actor_manages_event(event.id, actor_id)
      )
      and (
        host_venue.id is null
        or (
          host_venue.verification_status <> 'suspended'
          and host_venue.suspended_at is null
          and host_venue.archived_at is null
        )
      )
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
    order by ranked.interest_score desc, ranked.distance_band, ranked.starts_at, ranked.event_id
    limit bounded_limit + 1
  ),
  numbered_page as (
    select
      page.*,
      row_number() over (
        order by page.interest_score desc, page.distance_band, page.starts_at, page.event_id
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
  order by page.interest_score desc, page.distance_band, page.starts_at, page.event_id;
end;
$function$;

comment on function private.discover_event_page(
  text, double precision, double precision, integer, timestamptz, timestamptz,
  uuid, uuid, uuid, integer, integer, timestamptz, uuid, integer
) is
  'Builds an authorization-filtered acquisition page. Retained left attendance is rediscoverable; active or closed non-rejoinable attendance remains excluded.';

create or replace function private.search_assisted_events_core(
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
  away_team_name text,
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
language plpgsql
security definer
stable
set search_path = ''
as $function$
#variable_conflict use_variable
declare
  actor_id uuid := private.assert_fan_actor();
  parsed_facilities public.venue_facility[];
  origin extensions.geography(Point, 4326);
  from_instant timestamptz;
  until_instant timestamptz;
begin
  begin
    select coalesce(
      array_agg(item.facility::public.venue_facility order by item.ordinal),
      '{}'::public.venue_facility[]
    )
    into parsed_facilities
    from unnest(coalesce(input_facilities, '{}'::text[]))
      with ordinality as item(facility, ordinal);
  exception when invalid_text_representation then
    raise exception using errcode = 'P0001', message = 'VALIDATION_FAILED';
  end;

  if input_from_date is null
    or input_to_date is null
    or input_from_date < (statement_timestamp() at time zone 'Asia/Jerusalem')::date
    or input_to_date < input_from_date
    or input_to_date - input_from_date > 30
    or cardinality(coalesce(input_team_ids, '{}'::uuid[])) > 2
    or array_position(coalesce(input_team_ids, '{}'::uuid[]), null) is not null
    or (
      select count(*) <> count(distinct team_id)
      from unnest(coalesce(input_team_ids, '{}'::uuid[])) as team(team_id)
    )
    or (
      select count(*) <> cardinality(coalesce(input_team_ids, '{}'::uuid[]))
      from public.teams as team
      where team.id = any(coalesce(input_team_ids, '{}'::uuid[]))
        and team.active
    )
    or (
      input_competition_id is not null
      and not exists (
        select 1 from public.competitions as competition
        where competition.id = input_competition_id and competition.active
      )
    )
    or input_relationship is null
    or input_relationship not in ('any', 'friend_host', 'my_groups')
    or input_host_kind is null
    or input_host_kind not in ('any', 'venue', 'person')
    or cardinality(parsed_facilities) > 7
    or not private.venue_facilities_are_unique(parsed_facilities)
    or (input_lat is null) <> (input_lng is null)
    or (input_lat is not null and input_lat not between -90 and 90)
    or (input_lng is not null and input_lng not between -180 and 180)
    or (input_relationship = 'any' and input_lat is null) then
    raise exception using errcode = 'P0001', message = 'VALIDATION_FAILED';
  end if;

  from_instant := input_from_date::timestamp at time zone 'Asia/Jerusalem';
  until_instant := (input_to_date + 1)::timestamp at time zone 'Asia/Jerusalem';
  if input_lat is not null then
    origin := extensions.st_setsrid(
      extensions.st_makepoint(input_lng, input_lat), 4326
    )::extensions.geography;
  end if;

  return query
  with event_facts as (
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
      event.place_kind::text as place_kind,
      event.public_place_name,
      event.audience::text as audience,
      event.capacity,
      event.requires_approval,
      event.attendance_mode::text as attendance_mode,
      host_venue.facilities::text[] as venue_facilities,
      match.home_team_id,
      match.away_team_id,
      match.competition_id,
      competition.sport_id,
      event.host_user_id,
      event.host_venue_id,
      event.organizing_group_id,
      event.audience_group_id,
      attendance_counts.approved_count,
      viewer_facts.viewer_attendance_status,
      viewer_facts.viewer_invitation_status,
      viewer_facts.viewer_manages_event,
      viewer_facts.viewer_involved,
      private.actor_is_accepted_friend(event.host_user_id, actor_id) as is_friend_host,
      exists (
        select 1
        from public.groups as related_group
        where related_group.id in (event.organizing_group_id, event.audience_group_id)
          and related_group.lifecycle = 'active'
          and related_group.suspended_at is null
          and private.actor_is_active_group_member(related_group.id, actor_id)
      ) as is_my_group,
      case
        when origin is null then null
        when event.place_kind = 'venue' then
          round(extensions.st_distance(origin, host_venue.location))::bigint
        when event.place_kind = 'public_place' then
          round(extensions.st_distance(origin, event.public_location))::bigint
        when event.place_kind = 'home' then (
          select round(extensions.st_distance(origin, private_location.location))::bigint
          from public.event_private_locations as private_location
          where private_location.event_id = event.id
        )
      end as distance_meters,
      case
        when exists (
          select 1 from public.subscriptions as subscription
          where subscription.user_id = actor_id
            and subscription.kind = 'team'
            and subscription.team_id in (
              match.home_team_id, match.away_team_id, event.audience_team_id
            )
        ) then 8 else 0 end
        + case when exists (
          select 1 from public.subscriptions as subscription
          where subscription.user_id = actor_id
            and subscription.kind = 'competition'
            and subscription.competition_id = match.competition_id
        ) then 4 else 0 end
        + case when exists (
          select 1 from public.subscriptions as subscription
          where subscription.user_id = actor_id
            and subscription.kind = 'sport'
            and subscription.sport_id = competition.sport_id
        ) then 2 else 0 end
        + case when exists (
          select 1 from public.venue_follows as venue_follow
          where venue_follow.user_id = actor_id
            and venue_follow.venue_id = event.host_venue_id
        ) then 1 else 0 end
      as interest_score
    from public.events as event
    join public.matches as match on match.id = event.match_id
    join public.competitions as competition on competition.id = match.competition_id
    join public.teams as home_team on home_team.id = match.home_team_id
    join public.teams as away_team on away_team.id = match.away_team_id
    left join public.profiles as host_profile on host_profile.id = event.host_user_id
    left join public.venues as host_venue on host_venue.id = event.host_venue_id
    cross join lateral (
      select count(*) as approved_count
      from public.event_attendance as attendance
      where attendance.event_id = event.id and attendance.status = 'approved'
    ) as attendance_counts
    cross join lateral (
      select
        (
          select attendance.status::text
          from public.event_attendance as attendance
          where attendance.event_id = event.id and attendance.user_id = actor_id
        ) as viewer_attendance_status,
        (
          select invitation.status::text
          from public.event_invitations as invitation
          where invitation.event_id = event.id and invitation.invitee_id = actor_id
        ) as viewer_invitation_status,
        private.actor_manages_event(event.id, actor_id) as viewer_manages_event,
        (
          private.actor_manages_event(event.id, actor_id)
          or exists (
            select 1 from public.event_attendance as attendance
            where attendance.event_id = event.id
              and attendance.user_id = actor_id
              and attendance.status in ('requested', 'approved')
          )
          or exists (
            select 1 from public.event_invitations as invitation
            where invitation.event_id = event.id
              and invitation.invitee_id = actor_id
              and invitation.status = 'pending'
          )
        ) as viewer_involved
    ) as viewer_facts
    where event.status = 'published'
      and event.starts_at > statement_timestamp()
      and event.starts_at >= from_instant
      and event.starts_at < until_instant
      and private.event_is_visible_to_actor(event.id, actor_id)
      and (
        cardinality(coalesce(input_team_ids, '{}'::uuid[])) = 0
        or (
          cardinality(input_team_ids) = 1
          and input_team_ids[1] in (match.home_team_id, match.away_team_id)
        )
        or (
          cardinality(input_team_ids) = 2
          and match.home_team_id = any(input_team_ids)
          and match.away_team_id = any(input_team_ids)
        )
      )
      and (input_competition_id is null or match.competition_id = input_competition_id)
      and (
        input_host_kind = 'any'
        or (input_host_kind = 'person' and event.host_user_id is not null)
        or (input_host_kind = 'venue' and event.host_venue_id is not null)
      )
      and (
        cardinality(parsed_facilities) = 0
        or host_venue.facilities @> parsed_facilities
      )
      and (
        host_venue.id is null
        or (
          host_venue.verification_status <> 'suspended'
          and host_venue.suspended_at is null
          and host_venue.archived_at is null
        )
      )
      and (host_profile.id is null or host_profile.suspended_at is null)
  ),
  hard_filtered as (
    select facts.*
    from event_facts as facts
    where (origin is null or facts.distance_meters <= 15000)
      and (
        (input_relationship = 'friend_host' and facts.is_friend_host)
        or (input_relationship = 'my_groups' and facts.is_my_group)
        or (
          input_relationship = 'any'
          and facts.audience <> 'invite_only'
          and (
            facts.viewer_manages_event
            or not exists (
              select 1 from public.event_attendance as existing_attendance
              where existing_attendance.event_id = facts.event_id
                and existing_attendance.user_id = actor_id
                and existing_attendance.status <> 'left'
            )
          )
          and (
            facts.viewer_manages_event
            or not exists (
              select 1 from public.event_invitations as existing_invitation
              where existing_invitation.event_id = facts.event_id
                and existing_invitation.invitee_id = actor_id
                and (
                  existing_invitation.status = 'pending'
                  or not exists (
                    select 1
                    from public.event_attendance as left_attendance
                    where left_attendance.event_id = facts.event_id
                      and left_attendance.user_id = actor_id
                      and left_attendance.status = 'left'
                  )
                )
            )
          )
        )
      )
      and (
        facts.capacity is null
        or facts.approved_count < facts.capacity
        or (
          input_relationship in ('friend_host', 'my_groups')
          and facts.viewer_involved
        )
        or (
          input_relationship = 'any'
          and facts.viewer_manages_event
        )
      )
  ),
  ranked as (
    select
      facts.*,
      case
        when facts.distance_meters is null then 4
        when facts.place_kind = 'home' and facts.distance_meters < 5000 then 0
        when facts.place_kind = 'home' and facts.distance_meters < 15000 then 1
        when facts.place_kind = 'home' then 2
        when facts.distance_meters < 1000 then 0
        when facts.distance_meters < 5000 then 1
        when facts.distance_meters < 15000 then 2
        else 3
      end as ranked_distance_band
    from hard_filtered as facts
  )
  select
    ranked.event_id,
    ranked.title,
    ranked.host_kind,
    ranked.host_display_name,
    ranked.host_venue_slug,
    ranked.venue_verification_status,
    ranked.match_id,
    ranked.competition_name,
    ranked.home_team_name,
    ranked.away_team_name,
    ranked.starts_at,
    ranked.ends_at,
    ranked.place_kind,
    case
      when ranked.distance_meters is null and ranked.place_kind = 'home' then 'Private home'
      when ranked.distance_meters is null and ranked.place_kind = 'venue' then ranked.host_display_name
      when ranked.distance_meters is null then ranked.public_place_name
      when ranked.place_kind = 'home' and ranked.distance_meters < 5000 then 'Within 5 km'
      when ranked.place_kind = 'home' and ranked.distance_meters < 15000 then '5–15 km away'
      when ranked.place_kind = 'home' then '15+ km away'
      when ranked.distance_meters < 1000 then 'Within 1 km'
      when ranked.distance_meters < 5000 then '1–5 km away'
      when ranked.distance_meters < 15000 then '5–15 km away'
      else '15+ km away'
    end as location_summary,
    ranked.audience,
    ranked.capacity,
    ranked.approved_count,
    case
      when ranked.capacity is null then null
      else greatest(ranked.capacity - ranked.approved_count::integer, 0)
    end as remaining_capacity,
    ranked.requires_approval,
    ranked.attendance_mode,
    case
      when ranked.viewer_manages_event then 'host'
      when ranked.viewer_attendance_status is not null then ranked.viewer_attendance_status
      when ranked.viewer_invitation_status in ('pending', 'accepted') then 'invited'
      else null
    end as viewer_participation_state,
    coalesce(ranked.venue_facilities, '{}'::text[]),
    ranked.interest_score,
    ranked.ranked_distance_band,
    ranked.is_friend_host,
    ranked.is_my_group
  from ranked
  order by
    ranked.interest_score desc,
    ranked.ranked_distance_band,
    ranked.starts_at,
    ranked.event_id
  limit 3;
end;
$function$;

comment on function private.search_assisted_events_core(
  date, date, uuid[], uuid, text, text, text[], double precision, double precision
) is
  'Internal authorized and deterministically ranked assisted-event search. Retained left attendance is rediscoverable without treating a historical accepted invitation as current participation.';

revoke all on function private.search_assisted_events_core(
  date, date, uuid[], uuid, text, text, text[], double precision, double precision
) from public, anon, authenticated;

commit;
