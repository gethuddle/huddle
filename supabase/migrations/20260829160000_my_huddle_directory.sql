create or replace function public.list_my_groups(
  input_limit integer default 20,
  input_offset integer default 0
)
returns table (
  group_id uuid,
  slug text,
  name text,
  description text,
  visibility text,
  lifecycle text,
  city_name text,
  team_name text,
  member_role text,
  membership_status text,
  active_member_count integer,
  can_manage boolean,
  total_count bigint
)
language plpgsql
security definer
stable
set search_path = ''
as $function$
declare
  actor_id uuid := private.assert_actor(true);
  bounded_limit integer := least(greatest(coalesce(input_limit, 20), 1), 50);
  bounded_offset integer := greatest(coalesce(input_offset, 0), 0);
begin
  return query
  select
    supporter_group.id,
    supporter_group.slug,
    supporter_group.name,
    supporter_group.description,
    supporter_group.visibility::text,
    supporter_group.lifecycle::text,
    city.name_en,
    team.name,
    membership.role::text,
    membership.status::text,
    (
      select count(*)::integer
      from public.group_memberships as active_membership
      where active_membership.group_id = supporter_group.id
        and active_membership.status = 'active'
    ),
    membership.status = 'active' and membership.role in ('owner', 'admin'),
    count(*) over ()
  from public.group_memberships as membership
  join public.groups as supporter_group on supporter_group.id = membership.group_id
  join public.cities as city on city.id = supporter_group.city_id
  left join public.teams as team on team.id = supporter_group.team_id
  where membership.user_id = actor_id
    and membership.status in ('pending', 'active')
    and supporter_group.lifecycle <> 'archived'
  order by
    case membership.status when 'active' then 0 else 1 end,
    case membership.role when 'owner' then 0 when 'admin' then 1 else 2 end,
    supporter_group.updated_at desc,
    supporter_group.id
  offset bounded_offset
  limit bounded_limit;
end;
$function$;

comment on function public.list_my_groups(integer, integer) is
  'Returns only the signed-in actor own active or pending group relationships, including unlisted and forming groups.';

create or replace function public.list_my_huddle_events(
  input_limit integer default 20,
  input_offset integer default 0
)
returns table (
  event_id uuid,
  title text,
  home_team_name text,
  away_team_name text,
  competition_name text,
  starts_at timestamptz,
  city_name text,
  place_kind text,
  audience text,
  status text,
  involvement text,
  invitation_status text,
  attendance_status text,
  can_manage boolean,
  total_count bigint
)
language plpgsql
security definer
stable
set search_path = ''
as $function$
declare
  actor_id uuid := private.assert_actor(true);
  bounded_limit integer := least(greatest(coalesce(input_limit, 20), 1), 50);
  bounded_offset integer := greatest(coalesce(input_offset, 0), 0);
begin
  return query
  select
    event.id,
    event.title,
    home_team.name,
    away_team.name,
    competition.name,
    event.starts_at,
    city.name_en,
    event.place_kind::text,
    event.audience::text,
    event.status::text,
    case
      when event.starts_at < statement_timestamp()
        or event.status in ('cancelled', 'completed') then 'history'
      when event.created_by = actor_id
        and event.organizing_group_id is not null
        and event.status = 'pending_group_review' then 'submitted'
      when event.created_by = actor_id
        or event.host_user_id = actor_id
        or host_venue.owner_id = actor_id then 'hosting'
      when attendance.status = 'requested' then 'requested'
      when attendance.status = 'approved' then 'attending'
      when invitation.status = 'pending' then 'invited'
      else 'history'
    end,
    invitation.status::text,
    attendance.status::text,
    event.created_by = actor_id
      or event.host_user_id = actor_id
      or coalesce(host_venue.owner_id = actor_id, false),
    count(*) over ()
  from public.events as event
  join public.matches as match on match.id = event.match_id
  join public.competitions as competition on competition.id = match.competition_id
  join public.teams as home_team on home_team.id = match.home_team_id
  join public.teams as away_team on away_team.id = match.away_team_id
  join public.cities as city on city.id = event.city_id
  left join public.venues as host_venue on host_venue.id = event.host_venue_id
  left join public.event_invitations as invitation
    on invitation.event_id = event.id
    and invitation.invitee_id = actor_id
  left join public.event_attendance as attendance
    on attendance.event_id = event.id
    and attendance.user_id = actor_id
  where event.created_by = actor_id
    or event.host_user_id = actor_id
    or host_venue.owner_id = actor_id
    or (
      (invitation.id is not null or attendance.id is not null)
      and (
        event.starts_at < statement_timestamp()
        or private.event_is_visible_to_actor(event.id, actor_id)
      )
    )
  order by
    case when event.starts_at >= statement_timestamp() then 0 else 1 end,
    case when event.starts_at >= statement_timestamp() then event.starts_at end,
    case when event.starts_at < statement_timestamp() then event.starts_at end desc,
    event.id
  offset bounded_offset
  limit bounded_limit;
end;
$function$;

comment on function public.list_my_huddle_events(integer, integer) is
  'Returns one safe bounded dashboard of events the actor hosts, submitted, was invited to, requested, or attends; private locations are structurally omitted.';

create or replace function public.search_people(
  input_query text,
  input_limit integer default 20,
  input_offset integer default 0
)
returns table (
  handle text,
  display_name text,
  city_name text,
  friendship_id uuid,
  friendship_status text,
  friendship_direction text,
  total_count bigint
)
language plpgsql
security definer
stable
set search_path = ''
as $function$
declare
  actor_id uuid := private.assert_actor(true);
  normalized_query text := lower(btrim(coalesce(input_query, '')));
  bounded_limit integer := least(greatest(coalesce(input_limit, 20), 1), 20);
  bounded_offset integer := greatest(coalesce(input_offset, 0), 0);
begin
  if left(normalized_query, 1) = '@' then
    normalized_query := substr(normalized_query, 2);
  end if;

  if char_length(normalized_query) < 2 or char_length(normalized_query) > 50 then
    raise exception using errcode = 'P0001', message = 'VALIDATION_FAILED';
  end if;

  return query
  select
    profile.handle,
    profile.display_name,
    city.name_en,
    friendship.id,
    friendship.status::text,
    case
      when friendship.status = 'accepted' then 'accepted'
      when friendship.requested_by = actor_id then 'outgoing'
      when friendship.id is not null then 'incoming'
      else null
    end,
    count(*) over ()
  from public.profiles as profile
  join public.cities as city on city.id = profile.city_id and city.active
  left join lateral (
    select relation.id, relation.status, relation.requested_by
    from public.friendships as relation
    where relation.status in ('pending', 'accepted')
      and relation.user_low_id = least(actor_id, profile.id)
      and relation.user_high_id = greatest(actor_id, profile.id)
    limit 1
  ) as friendship on true
  where profile.id <> actor_id
    and profile.profile_completed_at is not null
    and profile.suspended_at is null
    and not private.users_are_blocked(actor_id, profile.id)
    and (
      left(lower(profile.handle), char_length(normalized_query)) = normalized_query
      or position(normalized_query in lower(profile.display_name)) > 0
    )
  order by
    case when lower(profile.handle) = normalized_query then 0 else 1 end,
    case when left(lower(profile.handle), char_length(normalized_query)) = normalized_query then 0 else 1 end,
    lower(profile.display_name),
    profile.handle
  offset bounded_offset
  limit bounded_limit;
end;
$function$;

comment on function public.search_people(text, integer, integer) is
  'Returns a bounded safe directory for complete signed-in accounts; self, suspended profiles, and either direction of a block are excluded.';

revoke all on function public.list_my_groups(integer, integer) from public, anon;
revoke all on function public.list_my_huddle_events(integer, integer) from public, anon;
revoke all on function public.search_people(text, integer, integer) from public, anon;

grant execute on function public.list_my_groups(integer, integer) to authenticated;
grant execute on function public.list_my_huddle_events(integer, integer) to authenticated;
grant execute on function public.search_people(text, integer, integer) to authenticated;
