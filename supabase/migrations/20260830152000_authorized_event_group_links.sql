begin;

drop function public.get_event_summary(uuid);

create function public.get_event_summary(input_event_id uuid)
returns table (
  event_id uuid,
  status text,
  title text,
  description text,
  expected_activity text,
  cost_description text,
  event_rules text,
  commercial_affiliation text,
  host_kind text,
  host_display_name text,
  host_handle text,
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
  public_place_name text,
  public_address_text text,
  location_summary text,
  audience text,
  audience_group_name text,
  audience_team_name text,
  capacity integer,
  approved_attendee_count bigint,
  remaining_capacity integer,
  viewer_attendance_id uuid,
  viewer_attendance_status text,
  viewer_invitation_id uuid,
  viewer_invitation_status text,
  viewer_is_authenticated boolean,
  viewer_can_read_private_location boolean,
  requires_approval boolean,
  organizing_group_name text,
  organizing_group_slug text,
  can_manage boolean
)
language sql
security definer
stable
set search_path = ''
as $function$
  select
    event.id,
    event.status::text,
    event.title,
    event.description,
    event.expected_activity,
    event.cost_description,
    event.event_rules,
    event.commercial_affiliation,
    case when event.host_user_id is not null then 'person' else 'venue' end,
    coalesce(host_profile.display_name, host_venue.name),
    host_profile.handle,
    host_venue.slug,
    host_venue.verification_status::text,
    event.match_id,
    competition.name,
    home_team.name,
    away_team.name,
    event.starts_at,
    event.ends_at,
    city.name_en,
    event.place_kind::text,
    event.public_place_name,
    event.public_address_text,
    case
      when event.place_kind = 'public_place' then event.public_place_name
      when event.place_kind = 'venue' then host_venue.address_text
      when event.host_user_id = auth.uid() then 'Protected home location saved'
      when viewer_city.center is null or private_location.location is null then city.name_en
      when extensions.st_distance(viewer_city.center, private_location.location) < 5000
        then 'Within 5 km of your profile city center'
      when extensions.st_distance(viewer_city.center, private_location.location) < 15000
        then '5–15 km from your profile city center'
      when extensions.st_distance(viewer_city.center, private_location.location) < 50000
        then '15–50 km from your profile city center'
      else '50+ km from your profile city center'
    end,
    event.audience::text,
    audience_group.name,
    audience_team.name,
    event.capacity,
    attendance_counts.approved_count,
    greatest(event.capacity - attendance_counts.approved_count::integer, 0),
    viewer_attendance.id,
    viewer_attendance.status::text,
    viewer_invitation.id,
    viewer_invitation.status::text,
    auth.uid() is not null,
    private.actor_can_read_private_event_location(event.id, auth.uid()),
    event.requires_approval,
    organizing_group.name,
    case
      when organizing_group.id is null then null
      when (
        organizing_group.visibility = 'discoverable'
        and organizing_group.lifecycle = 'active'
      ) or private.actor_is_active_group_member(organizing_group.id, auth.uid())
        then organizing_group.slug
      else null
    end,
    private.actor_manages_event(event.id, auth.uid())
  from public.events as event
  join public.matches as match on match.id = event.match_id
  join public.competitions as competition on competition.id = match.competition_id
  join public.teams as home_team on home_team.id = match.home_team_id
  join public.teams as away_team on away_team.id = match.away_team_id
  join public.cities as city on city.id = event.city_id
  left join public.profiles as host_profile on host_profile.id = event.host_user_id
  left join public.venues as host_venue on host_venue.id = event.host_venue_id
  left join public.groups as audience_group on audience_group.id = event.audience_group_id
  left join public.teams as audience_team on audience_team.id = event.audience_team_id
  left join public.groups as organizing_group on organizing_group.id = event.organizing_group_id
  left join public.profiles as viewer_profile on viewer_profile.id = auth.uid()
  left join public.cities as viewer_city on viewer_city.id = viewer_profile.city_id
  left join public.event_private_locations as private_location
    on private_location.event_id = event.id
  left join public.event_attendance as viewer_attendance
    on viewer_attendance.event_id = event.id
    and viewer_attendance.user_id = auth.uid()
  left join public.event_invitations as viewer_invitation
    on viewer_invitation.event_id = event.id
    and viewer_invitation.invitee_id = auth.uid()
  cross join lateral (
    select count(*) as approved_count
    from public.event_attendance as attendance
    where attendance.event_id = event.id
      and attendance.status = 'approved'
  ) as attendance_counts
  where event.id = input_event_id
    and private.event_is_visible_to_actor(event.id, auth.uid());
$function$;

comment on function public.get_event_summary(uuid) is
  'Returns one audience-safe event projection; an organizing-group slug is supplied only for a visible discoverable group or an active member.';

revoke all on function public.get_event_summary(uuid) from public;
grant execute on function public.get_event_summary(uuid) to anon, authenticated;

commit;
