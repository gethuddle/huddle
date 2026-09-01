begin;

create table private.assisted_discovery_actor_rate_limits (
  actor_id uuid primary key references public.profiles(id) on delete cascade,
  minute_started_at timestamptz not null,
  minute_count integer not null default 0,
  day_value date not null,
  day_count integer not null default 0,
  updated_at timestamptz not null default statement_timestamp(),
  constraint assisted_discovery_actor_minute_count_check
    check (minute_count between 0 and 3),
  constraint assisted_discovery_actor_day_count_check
    check (day_count between 0 and 20)
);

comment on table private.assisted_discovery_actor_rate_limits is
  'Private per-Fan interpretation counters only. Queries, entities, model payloads, and origins are never retained.';

create table private.assisted_discovery_global_rate_limit (
  singleton boolean primary key default true,
  day_value date not null,
  day_count integer not null default 0,
  updated_at timestamptz not null default statement_timestamp(),
  constraint assisted_discovery_global_singleton_check check (singleton),
  constraint assisted_discovery_global_day_count_check check (day_count between 0 and 400)
);

comment on table private.assisted_discovery_global_rate_limit is
  'One private daily interpretation counter protecting the free Workers AI allowance.';

alter table private.assisted_discovery_actor_rate_limits enable row level security;
alter table private.assisted_discovery_actor_rate_limits force row level security;
alter table private.assisted_discovery_global_rate_limit enable row level security;
alter table private.assisted_discovery_global_rate_limit force row level security;

revoke all on table private.assisted_discovery_actor_rate_limits from public, anon, authenticated;
revoke all on table private.assisted_discovery_global_rate_limit from public, anon, authenticated;

create or replace function public.claim_assisted_discovery_interpretation()
returns boolean
language plpgsql
security definer
volatile
set search_path = ''
as $function$
declare
  current_actor_id uuid := private.assert_fan_actor();
  observed_at timestamptz := statement_timestamp();
  israel_day date := (statement_timestamp() at time zone 'Asia/Jerusalem')::date;
  actor_counter private.assisted_discovery_actor_rate_limits%rowtype;
  global_counter private.assisted_discovery_global_rate_limit%rowtype;
begin
  insert into private.assisted_discovery_global_rate_limit (
    singleton, day_value, day_count, updated_at
  )
  values (true, israel_day, 0, observed_at)
  on conflict (singleton) do nothing;

  insert into private.assisted_discovery_actor_rate_limits (
    actor_id, minute_started_at, minute_count, day_value, day_count, updated_at
  )
  values (current_actor_id, observed_at, 0, israel_day, 0, observed_at)
  on conflict (actor_id) do nothing;

  select counter.*
  into strict global_counter
  from private.assisted_discovery_global_rate_limit as counter
  where counter.singleton
  for update;

  select counter.*
  into strict actor_counter
  from private.assisted_discovery_actor_rate_limits as counter
  where counter.actor_id = current_actor_id
  for update;

  if global_counter.day_value <> israel_day then
    global_counter.day_value := israel_day;
    global_counter.day_count := 0;
  end if;
  if actor_counter.day_value <> israel_day then
    actor_counter.day_value := israel_day;
    actor_counter.day_count := 0;
  end if;
  if actor_counter.minute_started_at <= observed_at - interval '1 minute' then
    actor_counter.minute_started_at := observed_at;
    actor_counter.minute_count := 0;
  end if;

  if actor_counter.minute_count >= 3
    or actor_counter.day_count >= 20
    or global_counter.day_count >= 400 then
    raise exception using errcode = 'P0001', message = 'RATE_LIMITED';
  end if;

  update private.assisted_discovery_global_rate_limit as counter
  set day_value = global_counter.day_value,
      day_count = global_counter.day_count + 1,
      updated_at = observed_at
  where counter.singleton;

  update private.assisted_discovery_actor_rate_limits as counter
  set minute_started_at = actor_counter.minute_started_at,
      minute_count = actor_counter.minute_count + 1,
      day_value = actor_counter.day_value,
      day_count = actor_counter.day_count + 1,
      updated_at = observed_at
  where counter.actor_id = current_actor_id;

  return true;
end;
$function$;

comment on function public.claim_assisted_discovery_interpretation() is
  'Atomically enforces 3/minute and 20/Israel-day per Fan plus 400/Israel-day globally without retaining request data.';

create index venues_facilities_gin_idx
  on public.venues using gin (facilities);

drop function public.get_venue_by_slug(text);

create function public.get_venue_by_slug(lookup_slug text)
returns table (
  venue_id uuid,
  slug text,
  name text,
  address_text text,
  description text,
  screen_count integer,
  stated_capacity integer,
  facilities text[],
  verification_status text,
  owner_handle text,
  follower_count bigint,
  viewer_follows boolean,
  viewer_is_owner boolean
)
language sql
stable
security definer
set search_path = ''
as $function$
  select
    venue.id,
    venue.slug,
    venue.name,
    venue.address_text,
    venue.description,
    venue.screen_count,
    venue.stated_capacity,
    venue.facilities::text[],
    venue.verification_status::text,
    owner_profile.handle,
    (select count(*) from public.venue_follows as follow where follow.venue_id = venue.id),
    exists (
      select 1 from public.venue_follows as own_follow
      where own_follow.venue_id = venue.id
        and own_follow.user_id = auth.uid()
    ),
    private.actor_manages_venue(auth.uid(), venue.id)
  from public.venues as venue
  join public.profiles as owner_profile on owner_profile.id = venue.owner_id
  where venue.slug = lower(btrim(lookup_slug))
    and venue.verification_status <> 'suspended'
    and venue.suspended_at is null
    and venue.archived_at is null;
$function$;

comment on function public.get_venue_by_slug(text) is
  'Returns the safe public Venue profile, including controlled facilities that remain visibly self-reported.';

revoke all on function public.get_venue_by_slug(text) from public, anon, authenticated;
grant execute on function public.get_venue_by_slug(text) to anon, authenticated;

create or replace function public.search_assisted_events(
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
              and invitation.status in ('pending', 'accepted')
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
            )
          )
          and (
            facts.viewer_manages_event
            or not exists (
              select 1 from public.event_invitations as existing_invitation
              where existing_invitation.event_id = facts.event_id
                and existing_invitation.invitee_id = actor_id
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

comment on function public.search_assisted_events(
  date, date, uuid[], uuid, text, text, text[], double precision, double precision
) is
  'Returns at most three authorized, future, exact-filter event cards. Exact locations and other peoples participation never leave the function.';

revoke all on function public.claim_assisted_discovery_interpretation()
  from public, anon, authenticated;
grant execute on function public.claim_assisted_discovery_interpretation()
  to authenticated;

revoke all on function public.search_assisted_events(
  date, date, uuid[], uuid, text, text, text[], double precision, double precision
) from public, anon, authenticated;
grant execute on function public.search_assisted_events(
  date, date, uuid[], uuid, text, text, text[], double precision, double precision
) to authenticated;

commit;
