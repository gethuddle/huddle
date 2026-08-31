begin;

-- Archived groups retain their relational history, but that history must no
-- longer behave like a live membership capability.
create or replace function private.actor_is_active_group_member(
  input_group_id uuid,
  input_actor_id uuid
)
returns boolean
language sql
security definer
stable
set search_path = ''
as $function$
  select input_actor_id is not null
    and exists (
      select 1
      from public.group_memberships as membership
      join public.groups as supporter_group on supporter_group.id = membership.group_id
      where membership.group_id = input_group_id
        and membership.user_id = input_actor_id
        and membership.status = 'active'
        and supporter_group.lifecycle <> 'archived'
        and private.profile_is_community_eligible(membership.user_id)
    )
    and not exists (
      select 1
      from public.group_bans as ban
      where ban.group_id = input_group_id
        and ban.user_id = input_actor_id
        and ban.revoked_at is null
    );
$function$;

comment on function private.actor_is_active_group_member(uuid, uuid) is
  'Checks live, active, non-banned, eligible group membership; archived rows remain history and grant no capability.';

create or replace function private.group_discovery_gate(input_group_id uuid)
returns table (
  active_member_count bigint,
  active_moderator_count bigint,
  owner_is_active boolean,
  has_description boolean,
  has_published_rule boolean,
  has_future_event boolean,
  gate_satisfied boolean
)
language sql
security definer
stable
set search_path = ''
as $function$
  with target_group as (
    select supporter_group.*
    from public.groups as supporter_group
    where supporter_group.id = input_group_id
  ),
  eligible_members as (
    select membership.user_id, membership.role
    from public.group_memberships as membership
    join public.profiles as profile on profile.id = membership.user_id
    where membership.group_id = input_group_id
      and membership.status = 'active'
      and profile.suspended_at is null
      and not exists (
        select 1
        from public.group_bans as ban
        where ban.group_id = membership.group_id
          and ban.user_id = membership.user_id
          and ban.revoked_at is null
      )
  ),
  facts as (
    select
      (select count(*) from eligible_members) as active_member_count,
      (
        select count(*)
        from eligible_members
        where role in ('owner', 'admin')
      ) as active_moderator_count,
      exists (
        select 1
        from eligible_members
        join target_group on target_group.owner_id = eligible_members.user_id
        where eligible_members.role = 'owner'
      ) as owner_is_active,
      coalesce(
        (select nullif(btrim(target_group.description), '') is not null from target_group),
        false
      ) as has_description,
      exists (
        select 1
        from public.group_rules as rule
        where rule.group_id = input_group_id
          and rule.published_at is not null
      ) as has_published_rule,
      exists (
        select 1
        from public.events as event
        join public.profiles as host_profile on host_profile.id = event.host_user_id
        where event.organizing_group_id = input_group_id
          and event.status = 'published'
          and event.published_at is not null
          and event.cancelled_at is null
          and event.starts_at > statement_timestamp()
          and host_profile.suspended_at is null
      ) as has_future_event
  )
  select
    facts.active_member_count,
    facts.active_moderator_count,
    facts.owner_is_active,
    facts.has_description,
    facts.has_published_rule,
    facts.has_future_event,
    facts.owner_is_active and facts.has_description
  from facts;
$function$;

comment on function private.group_discovery_gate(uuid) is
  'Keeps legacy readiness facts for presentation while making active ownership plus a description the complete discoverability gate.';

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
  'Returns active discoverable groups without requiring a rule or event inventory, while preserving block and ban boundaries.';

create or replace function public.get_group_by_slug(lookup_slug text)
returns table (
  group_id uuid,
  slug text,
  name text,
  description text,
  visibility text,
  lifecycle text,
  city_name text,
  team_name text,
  owner_handle text,
  active_member_count bigint,
  viewer_role text,
  viewer_membership_status text,
  can_view_member_content boolean,
  can_apply boolean
)
language sql
security definer
stable
set search_path = ''
as $function$
  with candidate as (
    select
      supporter_group.*,
      private.actor_is_active_group_member(supporter_group.id, auth.uid()) as viewer_is_member,
      private.profile_is_community_eligible(auth.uid()) as viewer_is_eligible,
      exists (
        select 1
        from public.group_bans as ban
        where ban.group_id = supporter_group.id
          and ban.user_id = auth.uid()
          and ban.revoked_at is null
      ) as viewer_is_banned,
      private.users_are_blocked(auth.uid(), supporter_group.owner_id) as viewer_blocks_owner
    from public.groups as supporter_group
    where supporter_group.slug = lower(btrim(lookup_slug))
  )
  select
    supporter_group.id,
    supporter_group.slug,
    supporter_group.name,
    supporter_group.description,
    supporter_group.visibility::text,
    supporter_group.lifecycle::text,
    city.name_en,
    team.name,
    owner_profile.handle,
    (
      select count(*)
      from public.group_memberships as active_membership
      where active_membership.group_id = supporter_group.id
        and active_membership.status = 'active'
    ),
    case
      when viewer_membership.status = 'active' then viewer_membership.role::text
      else null
    end,
    viewer_membership.status::text,
    coalesce(
      supporter_group.viewer_is_member
        and supporter_group.lifecycle not in ('suspended', 'archived'),
      false
    ),
    coalesce(
      supporter_group.viewer_is_eligible
        and supporter_group.visibility = 'discoverable'
        and supporter_group.lifecycle = 'active'
        and not supporter_group.viewer_is_banned
        and not supporter_group.viewer_blocks_owner
        and coalesce(viewer_membership.status::text, '') not in ('pending', 'active'),
      false
    )
  from candidate as supporter_group
  join public.cities as city on city.id = supporter_group.city_id
  join public.profiles as owner_profile on owner_profile.id = supporter_group.owner_id
  left join public.teams as team on team.id = supporter_group.team_id
  left join public.group_memberships as viewer_membership
    on viewer_membership.group_id = supporter_group.id
    and viewer_membership.user_id = auth.uid()
  where supporter_group.lifecycle <> 'archived'
    and not supporter_group.viewer_is_banned
    and not supporter_group.viewer_blocks_owner
    and (
      (
        supporter_group.visibility = 'discoverable'
        and supporter_group.lifecycle = 'active'
      )
      or supporter_group.viewer_is_member
    );
$function$;

comment on function public.get_group_by_slug(text) is
  'Returns an active discoverable safe summary or protected active-member state, while signed-in blocks, bans, suspension, and archive remain non-disclosing.';

create or replace function private.event_is_visible_to_actor(
  input_event_id uuid,
  input_actor_id uuid
)
returns boolean
language sql
security definer
stable
set search_path = ''
as $function$
  select exists (
    select 1
    from public.events as event
    left join public.venues as host_venue on host_venue.id = event.host_venue_id
    left join public.profiles as host_profile on host_profile.id = event.host_user_id
    where event.id = input_event_id
      and (
        private.actor_manages_event(event.id, input_actor_id)
        or (
          event.status = 'published'
          and event.starts_at > statement_timestamp()
          and (
            (
              event.host_venue_id is not null
              and host_venue.verification_status <> 'suspended'
              and host_venue.suspended_at is null
            )
            or (
              event.host_user_id is not null
              and input_actor_id is not null
              and private.profile_is_community_eligible(input_actor_id)
              and host_profile.suspended_at is null
              and not private.users_are_blocked(input_actor_id, event.host_user_id)
              and (
                (
                  event.audience = 'group'
                  and exists (
                    select 1
                    from public.groups as audience_group
                    where audience_group.id = event.audience_group_id
                      and audience_group.lifecycle in ('forming', 'active')
                      and audience_group.suspended_at is null
                      and (
                        private.actor_is_active_group_member(
                          event.audience_group_id,
                          input_actor_id
                        )
                        or (
                          event.place_kind = 'public_place'
                          and audience_group.visibility = 'discoverable'
                          and audience_group.lifecycle = 'active'
                          and not private.users_are_blocked(
                            input_actor_id,
                            audience_group.owner_id
                          )
                          and not exists (
                            select 1
                            from public.group_bans as viewer_ban
                            where viewer_ban.group_id = audience_group.id
                              and viewer_ban.user_id = input_actor_id
                              and viewer_ban.revoked_at is null
                          )
                        )
                      )
                  )
                )
                or (
                  event.audience = 'friends'
                  and private.actor_is_accepted_friend(event.host_user_id, input_actor_id)
                )
                or (
                  event.audience = 'invite_only'
                  and exists (
                    select 1
                    from public.event_invitations as invitation
                    where invitation.event_id = event.id
                      and invitation.invitee_id = input_actor_id
                      and invitation.status in ('pending', 'accepted')
                  )
                )
              )
            )
          )
        )
      )
  );
$function$;

comment on function private.event_is_visible_to_actor(uuid, uuid) is
  'Applies manager and current audience visibility; active discoverable-group public-place events are safe acquisition previews, while home events remain member-only.';

create function public.discover_owned_venue_events(
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
      select 1 from public.cities as city
      where city.id = input_city_id and city.active
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

  if actor_id is null or not private.profile_is_fan_eligible(actor_id) then
    return;
  end if;

  if input_lat is null then
    select city.center into origin
    from public.cities as city
    where city.id = input_city_id and city.active;
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
  with ranked_events as (
    select
      event.id as event_id,
      event.title,
      'venue'::text as host_kind,
      venue.name as host_display_name,
      venue.slug as host_venue_slug,
      venue.verification_status::text as venue_verification_status,
      event.match_id,
      competition.name as competition_name,
      home_team.name as home_team_name,
      away_team.name as away_team_name,
      event.starts_at,
      event.ends_at,
      city.name_en as city_name,
      event.place_kind::text as place_kind,
      case
        when extensions.st_distance(origin, venue.location) < 1000 then 'Within 1 km'
        when extensions.st_distance(origin, venue.location) < 5000 then '1–5 km away'
        when extensions.st_distance(origin, venue.location) < 15000 then '5–15 km away'
        when extensions.st_distance(origin, venue.location) < 50000 then '15–50 km away'
        else '50+ km away'
      end as location_summary,
      event.audience::text as audience,
      null::text as audience_group_name,
      audience_team.name as audience_team_name,
      event.capacity,
      attendance_counts.approved_count as approved_attendee_count,
      case
        when event.attendance_mode = 'open_door' then null
        else greatest(event.capacity - attendance_counts.approved_count::integer, 0)
      end as remaining_capacity,
      event.requires_approval,
      case
        when exists (
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
        ) then 1 else 0 end as interest_score,
      case
        when extensions.st_distance(origin, venue.location) < 1000 then 0
        when extensions.st_distance(origin, venue.location) < 5000 then 1
        when extensions.st_distance(origin, venue.location) < 15000 then 2
        when extensions.st_distance(origin, venue.location) < 50000 then 3
        else 4
      end as distance_band
    from public.events as event
    join public.venues as venue on venue.id = event.host_venue_id
    join public.venue_memberships as membership
      on membership.venue_id = venue.id
      and membership.user_id = actor_id
      and membership.status = 'active'
      and membership.revoked_at is null
    join public.matches as match on match.id = event.match_id
    join public.competitions as competition on competition.id = match.competition_id
    join public.teams as home_team on home_team.id = match.home_team_id
    join public.teams as away_team on away_team.id = match.away_team_id
    join public.cities as city on city.id = event.city_id
    left join public.teams as audience_team on audience_team.id = event.audience_team_id
    cross join lateral (
      select count(*) as approved_count
      from public.event_attendance as attendance
      where attendance.event_id = event.id
        and attendance.status = 'approved'
    ) as attendance_counts
    where event.place_kind = 'venue'
      and event.audience in ('public', 'team_followers')
      and event.status = 'published'
      and event.starts_at > statement_timestamp()
      and event.starts_at >= input_from
      and event.starts_at < input_to
      and venue.verification_status <> 'suspended'
      and venue.suspended_at is null
      and extensions.st_dwithin(venue.location, origin, input_radius_km * 1000.0)
      and (input_team_id is null or input_team_id in (match.home_team_id, match.away_team_id))
      and (input_competition_id is null or match.competition_id = input_competition_id)
      and (input_match_id is null or match.id = input_match_id)
      and (
        event.attendance_mode = 'open_door'
        or attendance_counts.approved_count < event.capacity
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
  order by page.interest_score desc, page.distance_band, page.starts_at, page.event_id;
end;
$function$;

comment on function public.discover_owned_venue_events(
  uuid, double precision, double precision, integer, timestamptz, timestamptz,
  uuid, uuid, uuid, integer, integer, timestamptz, uuid, integer
) is
  'Returns safe public and team-follower events from active Venues managed by the current eligible Fan for merged Fan discovery.';

create function public.list_match_events(
  input_match_id uuid,
  input_limit integer default 20
)
returns table (
  event_id uuid,
  title text,
  home_team_name text,
  away_team_name text,
  competition_name text,
  starts_at timestamptz,
  audience text,
  audience_team_name text,
  capacity integer,
  approved_attendee_count bigint,
  requires_approval boolean
)
language plpgsql
security definer
stable
set search_path = ''
as $function$
#variable_conflict use_variable
declare
  actor_id uuid := auth.uid();
  bounded_limit integer;
begin
  if input_match_id is null or input_limit is null or input_limit not between 1 and 50 then
    raise exception using errcode = 'P0001', message = 'VALIDATION_FAILED';
  end if;
  bounded_limit := input_limit;

  return query
  select
    event.id,
    event.title,
    home_team.name,
    away_team.name,
    competition.name,
    event.starts_at,
    event.audience::text,
    audience_team.name,
    event.capacity,
    (
      select count(*)
      from public.event_attendance as attendance
      where attendance.event_id = event.id
        and attendance.status = 'approved'
    ),
    event.requires_approval
  from public.events as event
  join public.matches as match on match.id = event.match_id
  join public.teams as home_team on home_team.id = match.home_team_id
  join public.teams as away_team on away_team.id = match.away_team_id
  join public.competitions as competition on competition.id = match.competition_id
  left join public.teams as audience_team on audience_team.id = event.audience_team_id
  where event.match_id = input_match_id
    and event.status = 'published'
    and event.starts_at > statement_timestamp()
    and private.event_is_visible_to_actor(event.id, actor_id)
  order by event.starts_at, event.title, event.id
  limit bounded_limit;
end;
$function$;

comment on function public.list_match_events(uuid, integer) is
  'Lists bounded, address-free, currently visible published events linked to one future fixture.';

create function public.archive_group(
  input_group_id uuid,
  audit_request_id uuid default null
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $function$
#variable_conflict use_variable
declare
  actor_id uuid := private.assert_fan_actor();
  target_group public.groups%rowtype;
  cancelled_event_count bigint;
  revoked_invite_count bigint;
begin
  select supporter_group.*
  into target_group
  from public.groups as supporter_group
  where supporter_group.id = input_group_id
    and supporter_group.owner_id = actor_id
    and supporter_group.lifecycle <> 'archived'
    and exists (
      select 1
      from public.group_memberships as owner_membership
      where owner_membership.group_id = supporter_group.id
        and owner_membership.user_id = actor_id
        and owner_membership.role = 'owner'
        and owner_membership.status = 'active'
    )
  for update;

  if not found then
    raise exception using errcode = 'P0001', message = 'NOT_FOUND';
  end if;

  update public.events as event
  set
    status = 'cancelled',
    cancelled_at = statement_timestamp(),
    cancel_reason = 'Group archived by its owner.'
  where (
      event.organizing_group_id = target_group.id
      or event.audience_group_id = target_group.id
    )
    and event.status in ('draft', 'pending_group_review', 'published')
    and event.ends_at > statement_timestamp();
  get diagnostics cancelled_event_count = row_count;

  update public.group_invite_tokens as invite
  set revoked_at = statement_timestamp()
  where invite.group_id = target_group.id
    and invite.revoked_at is null
    and invite.expires_at > statement_timestamp()
    and invite.use_count < invite.max_uses;
  get diagnostics revoked_invite_count = row_count;

  update public.groups as supporter_group
  set lifecycle = 'archived'
  where supporter_group.id = target_group.id;

  perform private.write_security_audit(
    actor_id,
    'group.archive',
    'group',
    target_group.id,
    'succeeded',
    audit_request_id,
    jsonb_build_object(
      'cancelled_event_count', cancelled_event_count,
      'revoked_invite_count', revoked_invite_count
    )
  );

  return true;
end;
$function$;

comment on function public.archive_group(uuid, uuid) is
  'Lets the active owner archive a group, revoke usable invite links, cancel live group events, retain relational history, and record the transition.';

do $backfill$
declare
  target_group_id uuid;
begin
  for target_group_id in
    select supporter_group.id
    from public.groups as supporter_group
    where supporter_group.visibility = 'discoverable'
      and supporter_group.lifecycle <> 'archived'
    order by supporter_group.id
  loop
    perform private.recalculate_group_discoverability(target_group_id);
  end loop;
end;
$backfill$;

revoke all on function public.discover_owned_venue_events(
  uuid, double precision, double precision, integer, timestamptz, timestamptz,
  uuid, uuid, uuid, integer, integer, timestamptz, uuid, integer
) from public, anon;
revoke all on function public.list_match_events(uuid, integer) from public;
revoke all on function public.archive_group(uuid, uuid) from public, anon;

grant execute on function public.discover_owned_venue_events(
  uuid, double precision, double precision, integer, timestamptz, timestamptz,
  uuid, uuid, uuid, integer, integer, timestamptz, uuid, integer
) to authenticated;
grant execute on function public.list_match_events(uuid, integer) to anon, authenticated;
grant execute on function public.archive_group(uuid, uuid) to authenticated;

commit;
