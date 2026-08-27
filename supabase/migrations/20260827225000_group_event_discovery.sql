begin;

create index groups_active_discoverable_name_idx
  on public.groups (lower(name), id)
  where visibility = 'discoverable'
    and lifecycle = 'active'
    and suspended_at is null;

create or replace function private.recalculate_group_discoverability(input_group_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $function$
#variable_conflict use_variable
declare
  target_group public.groups%rowtype;
  gate_passes boolean;
begin
  if input_group_id is null then
    return false;
  end if;

  select supporter_group.*
  into target_group
  from public.groups as supporter_group
  where supporter_group.id = input_group_id
  for update;

  if not found then
    return false;
  end if;

  if target_group.lifecycle = 'archived' then
    return false;
  end if;

  if target_group.suspended_at is not null then
    update public.groups as supporter_group
    set lifecycle = 'suspended', activated_at = null
    where supporter_group.id = input_group_id
      and (
        supporter_group.lifecycle <> 'suspended'
        or supporter_group.activated_at is not null
      );
    return false;
  end if;

  if target_group.visibility <> 'discoverable' then
    return target_group.lifecycle = 'active';
  end if;

  select gate.gate_satisfied
  into gate_passes
  from private.group_discovery_gate(input_group_id) as gate;

  update public.groups as supporter_group
  set
    lifecycle = case
      when gate_passes then 'active'::public.group_lifecycle
      else 'forming'::public.group_lifecycle
    end,
    activated_at = case
      when gate_passes then coalesce(supporter_group.activated_at, statement_timestamp())
      else null
    end
  where supporter_group.id = input_group_id
    and (
      supporter_group.lifecycle is distinct from case
        when gate_passes then 'active'::public.group_lifecycle
        else 'forming'::public.group_lifecycle
      end
      or (gate_passes and supporter_group.activated_at is null)
      or (not gate_passes and supporter_group.activated_at is not null)
    );

  return gate_passes;
end;
$function$;

comment on function private.recalculate_group_discoverability(uuid) is
  'Serializes one group, preserves archived state, synchronizes suspension, and keeps discoverable forming/active lifecycle aligned with all current gate facts; the B09 migration also backfills existing groups once.';

create or replace function private.refresh_group_discoverability_from_membership()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  affected_group_id uuid;
begin
  for affected_group_id in
    select distinct candidate.group_id
    from unnest(
      array[
        case when tg_op = 'INSERT' then null else old.group_id end,
        case when tg_op = 'DELETE' then null else new.group_id end
      ]::uuid[]
    ) as candidate(group_id)
    where candidate.group_id is not null
    order by candidate.group_id
  loop
    perform private.recalculate_group_discoverability(affected_group_id);
  end loop;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$function$;

comment on function private.refresh_group_discoverability_from_membership() is
  'Recalculates affected discoverable groups after membership status, role, or group changes.';

create trigger group_memberships_refresh_discoverability
after insert or delete or update of group_id, user_id, role, status
on public.group_memberships
for each row execute function private.refresh_group_discoverability_from_membership();

create or replace function private.refresh_group_discoverability_from_rule()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  affected_group_id uuid;
begin
  for affected_group_id in
    select distinct candidate.group_id
    from unnest(
      array[
        case when tg_op = 'INSERT' then null else old.group_id end,
        case when tg_op = 'DELETE' then null else new.group_id end
      ]::uuid[]
    ) as candidate(group_id)
    where candidate.group_id is not null
    order by candidate.group_id
  loop
    perform private.recalculate_group_discoverability(affected_group_id);
  end loop;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$function$;

comment on function private.refresh_group_discoverability_from_rule() is
  'Recalculates affected discoverable groups after rule publication or ownership changes.';

create trigger group_rules_refresh_discoverability
after insert or delete or update of group_id, published_at
on public.group_rules
for each row execute function private.refresh_group_discoverability_from_rule();

create or replace function private.refresh_group_discoverability_from_ban()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  affected_group_id uuid;
begin
  for affected_group_id in
    select distinct candidate.group_id
    from unnest(
      array[
        case when tg_op = 'INSERT' then null else old.group_id end,
        case when tg_op = 'DELETE' then null else new.group_id end
      ]::uuid[]
    ) as candidate(group_id)
    where candidate.group_id is not null
    order by candidate.group_id
  loop
    perform private.recalculate_group_discoverability(affected_group_id);
  end loop;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$function$;

comment on function private.refresh_group_discoverability_from_ban() is
  'Recalculates affected discoverable groups after durable ban state changes.';

create trigger group_bans_refresh_discoverability
after insert or delete or update of group_id, user_id, revoked_at
on public.group_bans
for each row execute function private.refresh_group_discoverability_from_ban();

create or replace function private.refresh_group_discoverability_from_group()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if new.description is distinct from old.description
    or new.visibility is distinct from old.visibility
    or new.suspended_at is distinct from old.suspended_at then
    perform private.recalculate_group_discoverability(new.id);
  end if;

  return new;
end;
$function$;

comment on function private.refresh_group_discoverability_from_group() is
  'Recalculates a discoverable group after description, visibility, or suspension facts change.';

create trigger groups_refresh_discoverability
after update of description, visibility, suspended_at
on public.groups
for each row execute function private.refresh_group_discoverability_from_group();

create or replace function private.refresh_group_discoverability_from_profile()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  affected_group_id uuid;
begin
  if new.suspended_at is not distinct from old.suspended_at then
    return new;
  end if;

  for affected_group_id in
    select affected.group_id
    from (
      select membership.group_id
      from public.group_memberships as membership
      where membership.user_id = new.id
      union
      select event.organizing_group_id
      from public.events as event
      where event.host_user_id = new.id
        and event.organizing_group_id is not null
    ) as affected
    order by affected.group_id
  loop
    perform private.recalculate_group_discoverability(affected_group_id);
  end loop;

  return new;
end;
$function$;

comment on function private.refresh_group_discoverability_from_profile() is
  'Recalculates memberships and hosted-event gates after profile suspension changes.';

create trigger profiles_refresh_group_discoverability
after update of suspended_at
on public.profiles
for each row execute function private.refresh_group_discoverability_from_profile();

do $backfill_group_discovery$
declare
  existing_group_id uuid;
begin
  for existing_group_id in
    select supporter_group.id
    from public.groups as supporter_group
    order by supporter_group.id
  loop
    perform private.recalculate_group_discoverability(existing_group_id);
  end loop;
end;
$backfill_group_discovery$;

create or replace function public.evaluate_group_discoverability(input_group_id uuid)
returns table (
  active_member_count bigint,
  active_moderator_count bigint,
  owner_is_active boolean,
  has_description boolean,
  has_published_rule boolean,
  has_future_event boolean,
  gate_satisfied boolean,
  lifecycle text
)
language plpgsql
security definer
set search_path = ''
as $function$
#variable_conflict use_variable
declare
  actor_id uuid := private.assert_actor(true);
begin
  if not private.actor_is_group_admin(input_group_id, actor_id) then
    raise exception using errcode = 'P0001', message = 'NOT_FOUND';
  end if;

  perform private.recalculate_group_discoverability(input_group_id);

  return query
  select
    gate.active_member_count,
    gate.active_moderator_count,
    gate.owner_is_active,
    gate.has_description,
    gate.has_published_rule,
    gate.has_future_event,
    (
      gate.gate_satisfied
      and supporter_group.visibility = 'discoverable'
      and supporter_group.suspended_at is null
      and supporter_group.lifecycle = 'active'
    ),
    supporter_group.lifecycle::text
  from private.group_discovery_gate(input_group_id) as gate
  join public.groups as supporter_group on supporter_group.id = input_group_id;
end;
$function$;

comment on function public.evaluate_group_discoverability(uuid) is
  'Returns every current discovery-gate fact to an active group administrator and reports satisfied only when the group is currently searchable.';

create or replace function public.update_group_description(
  input_group_id uuid,
  input_description text,
  audit_request_id uuid default null
)
returns table (description text, lifecycle text)
language plpgsql
security definer
set search_path = ''
as $function$
#variable_conflict use_variable
declare
  actor_id uuid := private.assert_actor(true);
  normalized_description text := nullif(btrim(input_description), '');
  target_group public.groups%rowtype;
begin
  if normalized_description is not null
    and char_length(normalized_description) > 2000 then
    raise exception using errcode = 'P0001', message = 'VALIDATION_FAILED';
  end if;

  select supporter_group.*
  into target_group
  from public.groups as supporter_group
  where supporter_group.id = input_group_id
  for update;

  if not found
    or target_group.lifecycle in ('suspended', 'archived')
    or not private.actor_is_group_admin(input_group_id, actor_id) then
    raise exception using errcode = 'P0001', message = 'NOT_ALLOWED';
  end if;

  update public.groups as supporter_group
  set description = normalized_description
  where supporter_group.id = input_group_id;

  perform private.write_security_audit(
    actor_id,
    'group.description.update',
    'group',
    input_group_id,
    'succeeded',
    audit_request_id,
    jsonb_build_object('has_description', normalized_description is not null)
  );

  return query
  select supporter_group.description, supporter_group.lifecycle::text
  from public.groups as supporter_group
  where supporter_group.id = input_group_id;
end;
$function$;

comment on function public.update_group_description(uuid, text, uuid) is
  'Lets an active group administrator update the bounded plain-text description and immediately refreshes discovery state.';

create or replace function public.search_groups(
  input_query text default null,
  input_city_id uuid default null,
  input_team_id uuid default null,
  input_after_name text default null,
  input_after_id uuid default null,
  input_limit integer default 20
)
returns table (
  group_id uuid,
  slug text,
  name text,
  description text,
  city_name text,
  team_name text,
  active_member_count bigint,
  cursor_name text,
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
  normalized_query text := nullif(lower(btrim(input_query)), '');
  normalized_after_name text := nullif(lower(btrim(input_after_name)), '');
  bounded_limit integer := least(greatest(coalesce(input_limit, 20), 1), 50);
begin
  if normalized_query is not null
    and char_length(normalized_query) not between 2 and 80 then
    raise exception using errcode = 'P0001', message = 'VALIDATION_FAILED';
  end if;

  if (normalized_after_name is null) <> (input_after_id is null) then
    raise exception using errcode = 'P0001', message = 'VALIDATION_FAILED';
  end if;

  return query
  with eligible_groups as (
    select
      supporter_group.id as group_id,
      supporter_group.slug,
      supporter_group.name,
      supporter_group.description,
      city.name_en as city_name,
      team.name as team_name,
      (
        select count(*)
        from public.group_memberships as membership
        join public.profiles as profile on profile.id = membership.user_id
        where membership.group_id = supporter_group.id
          and membership.status = 'active'
          and profile.suspended_at is null
          and not exists (
            select 1
            from public.group_bans as ban
            where ban.group_id = membership.group_id
              and ban.user_id = membership.user_id
              and ban.revoked_at is null
          )
      ) as active_member_count,
      lower(supporter_group.name) as cursor_name
    from public.groups as supporter_group
    join public.cities as city on city.id = supporter_group.city_id
    left join public.teams as team on team.id = supporter_group.team_id
    where supporter_group.visibility = 'discoverable'
      and supporter_group.lifecycle = 'active'
      and supporter_group.suspended_at is null
      and exists (
        select 1
        from public.events as future_event
        join public.profiles as future_host on future_host.id = future_event.host_user_id
        where future_event.organizing_group_id = supporter_group.id
          and future_event.status = 'published'
          and future_event.published_at is not null
          and future_event.cancelled_at is null
          and future_event.starts_at > statement_timestamp()
          and future_host.suspended_at is null
      )
      and (input_city_id is null or supporter_group.city_id = input_city_id)
      and (input_team_id is null or supporter_group.team_id = input_team_id)
      and (
        normalized_query is null
        or lower(supporter_group.name) like '%' || normalized_query || '%'
        or extensions.similarity(lower(supporter_group.name), normalized_query) >= 0.2
      )
      and (
        actor_id is null
        or (
          not private.users_are_blocked(actor_id, supporter_group.owner_id)
          and not exists (
            select 1
            from public.group_bans as viewer_ban
            where viewer_ban.group_id = supporter_group.id
              and viewer_ban.user_id = actor_id
              and viewer_ban.revoked_at is null
          )
        )
      )
      and (
        normalized_after_name is null
        or (lower(supporter_group.name), supporter_group.id)
          > (normalized_after_name, input_after_id)
      )
    order by lower(supporter_group.name), supporter_group.id
    limit bounded_limit + 1
  ),
  numbered_page as (
    select
      candidate.*,
      row_number() over (order by candidate.cursor_name, candidate.group_id) as row_number,
      count(*) over () > bounded_limit as has_more
    from eligible_groups as candidate
  )
  select
    page.group_id,
    page.slug,
    page.name,
    page.description,
    page.city_name,
    page.team_name,
    page.active_member_count,
    page.cursor_name,
    page.has_more
  from numbered_page as page
  where page.row_number <= bounded_limit
  order by page.cursor_name, page.group_id;
end;
$function$;

comment on function public.search_groups(text, uuid, uuid, text, uuid, integer) is
  'Returns one deterministic keyset page of active discoverable safe group summaries and excludes viewer blocks and bans.';

create or replace function private.discovery_window_is_valid(
  input_from timestamptz,
  input_to timestamptz,
  reference_at timestamptz default statement_timestamp()
)
returns boolean
language sql
stable
set search_path = ''
as $function$
  select
    input_from is not null
    and input_to is not null
    and reference_at is not null
    and input_to > input_from
    and input_from at time zone 'Asia/Jerusalem'
      >= date_trunc('day', reference_at at time zone 'Asia/Jerusalem')
    and input_to at time zone 'Asia/Jerusalem'
      <= date_trunc('day', reference_at at time zone 'Asia/Jerusalem') + interval '46 days'
    and (
      input_to at time zone 'Asia/Jerusalem'
      - input_from at time zone 'Asia/Jerusalem'
    ) <= interval '45 days';
$function$;

comment on function private.discovery_window_is_valid(timestamptz, timestamptz, timestamptz) is
  'Validates inclusive discovery date boundaries as Jerusalem calendar days so DST transitions do not change the accepted window.';

create or replace function public.discover_events(
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
  viewer_attendance_status text,
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
  bounded_limit integer := least(greatest(coalesce(input_limit, 20), 1), 50);
begin
  if input_city_id is null
    or not exists (
      select 1
      from public.cities as city
      where city.id = input_city_id
        and city.active
    )
    or input_radius_km not in (5, 15, 30, 50)
    or not private.discovery_window_is_valid(input_from, input_to)
    or (input_lat is null) <> (input_lng is null)
    or (input_lat is not null and input_lat not between -90 and 90)
    or (input_lng is not null and input_lng not between -180 and 180)
    or num_nonnulls(
      input_after_interest_score,
      input_after_distance_band,
      input_after_starts_at,
      input_after_event_id
    ) not in (0, 4) then
    raise exception using errcode = 'P0001', message = 'VALIDATION_FAILED';
  end if;

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
      viewer_attendance.status::text as viewer_attendance_status,
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
    left join public.event_attendance as viewer_attendance
      on viewer_attendance.event_id = event.id
      and viewer_attendance.user_id = actor_id
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
      and (input_team_id is null or input_team_id in (match.home_team_id, match.away_team_id))
      and (input_competition_id is null or match.competition_id = input_competition_id)
      and (input_match_id is null or match.id = input_match_id)
      and private.event_is_visible_to_actor(event.id, actor_id)
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
    page.viewer_attendance_status,
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

comment on function public.discover_events(uuid, double precision, double precision, integer, timestamptz, timestamptz, uuid, uuid, uuid, integer, integer, timestamptz, uuid, integer) is
  'Returns one authorization-filtered PostGIS keyset page. Exact private locations are used internally and never returned.';

revoke all on function private.refresh_group_discoverability_from_membership()
  from public, anon, authenticated;
revoke all on function private.refresh_group_discoverability_from_rule()
  from public, anon, authenticated;
revoke all on function private.refresh_group_discoverability_from_ban()
  from public, anon, authenticated;
revoke all on function private.refresh_group_discoverability_from_group()
  from public, anon, authenticated;
revoke all on function private.refresh_group_discoverability_from_profile()
  from public, anon, authenticated;
revoke all on function private.discovery_window_is_valid(timestamptz, timestamptz, timestamptz)
  from public, anon, authenticated;

revoke all on function public.update_group_description(uuid, text, uuid)
  from public, anon;
revoke all on function public.search_groups(text, uuid, uuid, text, uuid, integer)
  from public;
revoke all on function public.discover_events(uuid, double precision, double precision, integer, timestamptz, timestamptz, uuid, uuid, uuid, integer, integer, timestamptz, uuid, integer)
  from public;

grant execute on function public.update_group_description(uuid, text, uuid)
  to authenticated;
grant execute on function public.search_groups(text, uuid, uuid, text, uuid, integer)
  to anon, authenticated;
grant execute on function public.discover_events(uuid, double precision, double precision, integer, timestamptz, timestamptz, uuid, uuid, uuid, integer, integer, timestamptz, uuid, integer)
  to anon, authenticated;

commit;
