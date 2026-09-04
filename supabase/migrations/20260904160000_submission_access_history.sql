begin;

-- Submission hardening: retain legitimate participant access and deny erased-host JWTs.
create or replace function private.actor_manages_event(
  input_event_id uuid,
  input_actor_id uuid
)
returns boolean
language sql
security definer
stable
set search_path = ''
as $function$
  select input_actor_id is not null
    and private.profile_is_not_deleted(input_actor_id)
    and exists (
      select 1
      from public.events as event
      where event.id = input_event_id
        and (
          event.host_user_id = input_actor_id
          or private.actor_owns_venue(event.host_venue_id, input_actor_id)
          or (
            event.status in ('pending_group_review', 'published', 'cancelled', 'completed')
            and event.host_user_id is not null
            and not private.users_are_blocked(event.host_user_id, input_actor_id)
            and private.actor_is_group_admin(event.organizing_group_id, input_actor_id)
          )
        )
        and (
          event.organizing_group_id is null
          or (
            private.actor_is_active_group_member(event.organizing_group_id, input_actor_id)
            and exists (
              select 1
              from public.groups as organizing_group
              where organizing_group.id = event.organizing_group_id
                and organizing_group.lifecycle in ('forming', 'active')
                and organizing_group.suspended_at is null
            )
          )
        )
        and (
          event.audience_group_id is null
          or event.audience_group_id = event.organizing_group_id
          or (
            private.actor_is_active_group_member(event.audience_group_id, input_actor_id)
            and exists (
              select 1
              from public.groups as audience_group
              where audience_group.id = event.audience_group_id
                and audience_group.lifecycle in ('forming', 'active')
                and audience_group.suspended_at is null
            )
          )
        )
    );
$function$;

-- Retain the summary of an acquired private event through kickoff and history.
-- This never grants discovery/acquisition or extends protected-address lifetime.
create or replace function private.private_event_participant_retains_summary(input_event_id uuid, input_actor_id uuid)
returns boolean language sql stable security definer set search_path = ''
as $function$
  select input_actor_id is not null
    and private.profile_is_not_deleted(input_actor_id)
    and exists (
      select 1 from public.events event
      join public.event_attendance attendance on attendance.event_id = event.id
        and attendance.user_id = input_actor_id and attendance.status = 'approved'
      where event.id = input_event_id and event.host_user_id is not null
        and event.status in ('published', 'completed', 'cancelled')
        and private.event_user_is_audience_eligible(event.id, input_actor_id,
          attendance.source = 'direct_invite' and exists (
            select 1 from public.event_invitations invitation
            where invitation.event_id = event.id and invitation.invitee_id = input_actor_id
              and invitation.status = 'accepted'
          ))
    );
$function$;
revoke all on function private.private_event_participant_retains_summary(uuid, uuid) from public, anon, authenticated, service_role;

-- A read projection, not a destructive job or a new stored lifecycle.
create or replace function private.event_history_status(input_event public.events, input_now timestamptz)
returns public.event_status language sql stable security definer set search_path = ''
as $function$
  select case when input_event.status = 'published' and input_event.ends_at <= input_now
    then 'completed'::public.event_status
    else private.venue_event_projected_status(input_event, input_now) end;
$function$;
revoke all on function private.event_history_status(public.events, timestamptz) from public, anon, authenticated, service_role;

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
        or private.venue_event_participant_visibility(event.id,input_actor_id,statement_timestamp())
        or private.private_event_participant_retains_summary(event.id, input_actor_id)
        or (
          event.status = 'published'
          and event.starts_at > statement_timestamp()
          and (
            (
              event.host_venue_id is not null
              and host_venue.verification_status <> 'suspended'
              and host_venue.suspended_at is null
              and private.venue_allows_event_acquisition(event.id,statement_timestamp())
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

create or replace function public.list_my_events(
  input_bucket text,
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
  place_kind text,
  audience text,
  status text,
  bucket text,
  relationship_label text,
  can_manage boolean,
  total_count bigint
)
language plpgsql
security definer
volatile
set search_path = ''
as $function$
declare
  actor_id uuid := private.assert_fan_actor();
  bounded_limit integer;
  bounded_offset integer;
begin
  if input_bucket is null
    or input_bucket not in ('upcoming', 'hosting', 'pending', 'history')
    or input_limit is null
    or input_limit not between 1 and 50
    or input_offset is null
    or input_offset not between 0 and 10000
    or input_offset + input_limit > 10020 then
    raise exception using errcode = 'P0001', message = 'VALIDATION_FAILED';
  end if;
  bounded_limit := input_limit;
  bounded_offset := input_offset;

  return query
  with relationships as (
    select
      event.id as event_id,
      event.title,
      home_team.name as home_team_name,
      away_team.name as away_team_name,
      competition.name as competition_name,
      event.starts_at,
      event.place_kind::text as place_kind,
      event.audience::text as audience,
      private.event_history_status(event, statement_timestamp())::text as status,
      input_bucket as bucket,
      case input_bucket
        when 'upcoming' then case
          when event.host_venue_id is null
            and (event.host_user_id = actor_id or event.created_by = actor_id)
            then 'You are hosting'
          else 'You are going'
        end
        when 'hosting' then case when private.event_history_status(event, statement_timestamp()) = 'draft' then 'Draft' else 'You are hosting' end
        when 'pending' then case
          when attendance.status = 'requested' then 'Waiting for host'
          else 'Waiting for group review'
        end
        else case
          when event.host_venue_id is null
            and (event.host_user_id = actor_id or event.created_by = actor_id)
            then 'You hosted'
          else 'You attended'
        end
      end as relationship_label,
      case
        when event.host_venue_id is not null then false
        else private.actor_manages_event(event.id, actor_id)
      end as can_manage
    from public.events as event
    join public.matches as match on match.id = event.match_id
    join public.competitions as competition on competition.id = match.competition_id
    join public.teams as home_team on home_team.id = match.home_team_id
    join public.teams as away_team on away_team.id = match.away_team_id
    left join public.event_attendance as attendance
      on attendance.event_id = event.id
      and attendance.user_id = actor_id
    where (
        (
          input_bucket = 'upcoming'
          and private.event_history_status(event, statement_timestamp()) = 'published'
          and event.ends_at > statement_timestamp()
          and (
            (
              event.host_venue_id is null
              and (event.host_user_id = actor_id or event.created_by = actor_id)
            )
            or (
              attendance.status = 'approved'
              and (
                event.host_venue_id is not null
                or (
                  event.host_user_id is distinct from actor_id
                  and event.created_by <> actor_id
                )
              )
            )
          )
          and private.event_is_visible_to_actor(event.id, actor_id)
        )
        or (
          input_bucket = 'hosting'
          and private.event_history_status(event, statement_timestamp()) in ('draft', 'published')
          and event.ends_at > statement_timestamp()
          and event.host_venue_id is null
          and (event.host_user_id = actor_id or event.created_by = actor_id)
        )
        or (
          input_bucket = 'pending'
          and event.starts_at > statement_timestamp()
          and (
            (
              private.event_history_status(event, statement_timestamp()) = 'pending_group_review'
              and event.host_venue_id is null
              and event.created_by = actor_id
            )
            or (
              private.event_history_status(event, statement_timestamp()) = 'published'
              and attendance.status = 'requested'
              and private.event_is_visible_to_actor(event.id, actor_id)
            )
          )
        )
        or (
          input_bucket = 'history'
          and private.event_history_status(event, statement_timestamp()) in ('completed', 'cancelled')
          and (
            (
              event.host_venue_id is null
              and (event.host_user_id = actor_id or event.created_by = actor_id)
            )
            or (attendance.status = 'approved' and private.event_is_visible_to_actor(event.id,actor_id))
            or (event.host_venue_id is not null and private.event_history_status(event, statement_timestamp())='cancelled'
              and attendance.status in ('requested','approved') and private.event_is_visible_to_actor(event.id,actor_id))
          )
        )
      )
      and (
        coalesce(event.organizing_group_id, event.audience_group_id) is null
        or (
          private.actor_is_active_group_member(
            coalesce(event.organizing_group_id, event.audience_group_id), actor_id
          )
          and exists (
            select 1
            from public.groups as governing_group
            where governing_group.id = coalesce(event.organizing_group_id, event.audience_group_id)
              and governing_group.lifecycle in ('forming', 'active')
              and governing_group.suspended_at is null
          )
        )
      )
  )
  select
    relationship.event_id,
    relationship.title,
    relationship.home_team_name,
    relationship.away_team_name,
    relationship.competition_name,
    relationship.starts_at,
    relationship.place_kind,
    relationship.audience,
    relationship.status,
    relationship.bucket,
    relationship.relationship_label,
    relationship.can_manage,
    count(*) over ()
  from relationships as relationship
  order by
    case when input_bucket = 'history' then relationship.starts_at end desc,
    case when input_bucket <> 'history' then relationship.starts_at end,
    relationship.event_id
  offset bounded_offset
  limit bounded_limit;
end;
$function$;

create or replace function public.get_event_summary(input_event_id uuid)
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
  host_venue_is_public boolean,
  venue_verification_status text,
  match_id uuid,
  competition_name text,
  home_team_name text,
  away_team_name text,
  starts_at timestamptz,
  ends_at timestamptz,
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
    private.event_history_status(event,statement_timestamp())::text,
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
    coalesce(private.venue_allows_public_presence(host_venue.id,statement_timestamp()),false),
    host_venue.verification_status::text,
    event.match_id,
    competition.name,
    home_team.name,
    away_team.name,
    event.starts_at,
    event.ends_at,
    event.place_kind::text,
    event.public_place_name,
    event.public_address_text,
    case
      when event.place_kind = 'public_place' then event.public_place_name
      when event.place_kind = 'venue' then host_venue.address_text
      when private.actor_manages_event(event.id, auth.uid()) then 'Private meeting point saved'
      else 'Private meeting place'
    end,
    event.audience::text,
    audience_group.name,
    audience_team.name,
    event.capacity,
    attendance_counts.approved_count,
    case when event.capacity is null then 0
      else greatest(event.capacity - attendance_counts.approved_count::integer, 0) end,
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
  left join public.profiles as host_profile on host_profile.id = event.host_user_id
  left join public.venues as host_venue on host_venue.id = event.host_venue_id
  left join public.groups as audience_group on audience_group.id = event.audience_group_id
  left join public.teams as audience_team on audience_team.id = event.audience_team_id
  left join public.groups as organizing_group on organizing_group.id = event.organizing_group_id
  left join public.event_attendance as viewer_attendance
    on viewer_attendance.event_id = event.id and viewer_attendance.user_id = auth.uid()
  left join public.event_invitations as viewer_invitation
    on viewer_invitation.event_id = event.id and viewer_invitation.invitee_id = auth.uid()
  cross join lateral (
    select count(*) as approved_count
    from public.event_attendance as attendance
    where attendance.event_id = event.id and attendance.status = 'approved'
  ) as attendance_counts
  where event.id = input_event_id
    and private.event_is_visible_to_actor(event.id, auth.uid());
$function$;

commit;
