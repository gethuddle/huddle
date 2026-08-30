begin;

-- Group-governed event authority is current state, not permanent ownership.
-- A personal host, Venue manager, or organizing-group administrator must still
-- be an eligible, unbanned active member of every group governing the event.
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

comment on function private.actor_manages_event(uuid, uuid) is
  'Checks current personal-host, Venue-manager, or group-admin authority and requires active eligible membership in each governing group.';

-- One private current-state decision keeps Attention, event-management DTOs,
-- and the mutation aligned. Audience loss, kickoff, and capacity exhaustion
-- leave a safe decline path; privacy-ending state removes the row entirely.
create or replace function private.attendance_review_state(
  input_event_id uuid,
  input_requester_id uuid,
  input_actor_id uuid
)
returns table (
  visible boolean,
  can_approve boolean,
  review_reason text
)
language plpgsql
security definer
stable
set search_path = ''
as $function$
declare
  target_event public.events%rowtype;
  approved_count bigint;
  audience_eligible boolean;
begin
  select event.*
  into target_event
  from public.events as event
  where event.id = input_event_id;

  if not found
    or input_requester_id is null
    or input_actor_id is null
    or input_requester_id = input_actor_id
    or target_event.status <> 'published'
    or target_event.ends_at <= statement_timestamp()
    or not private.actor_manages_event(target_event.id, input_actor_id)
    or not private.profile_is_fan_eligible(input_requester_id)
    or private.users_are_blocked(input_actor_id, input_requester_id)
    or (
      target_event.host_user_id is not null
      and private.users_are_blocked(target_event.host_user_id, input_requester_id)
    )
    or exists (
      select 1
      from public.group_bans as ban
      where ban.group_id in (
          target_event.organizing_group_id,
          target_event.audience_group_id
        )
        and ban.user_id = input_requester_id
        and ban.revoked_at is null
    )
    or exists (
      select 1
      from public.groups as governing_group
      where governing_group.id in (
          target_event.organizing_group_id,
          target_event.audience_group_id
        )
        and (
          governing_group.lifecycle not in ('forming', 'active')
          or governing_group.suspended_at is not null
        )
    ) then
    return query select false, false, null::text;
    return;
  end if;

  audience_eligible := private.event_user_is_audience_eligible(
    target_event.id,
    input_requester_id,
    false
  );
  select count(*)
  into approved_count
  from public.event_attendance as attendance
  where attendance.event_id = target_event.id
    and attendance.status = 'approved';

  if target_event.starts_at <= statement_timestamp() then
    return query select true, false, 'The event has started. Only decline remains.'::text;
  elsif not audience_eligible then
    return query select true, false,
      'The requester is no longer eligible for this audience. Only decline remains.'::text;
  elsif approved_count >= target_event.capacity then
    return query select true, false, 'The event is full. Only decline remains.'::text;
  else
    return query select true, true, null::text;
  end if;
end;
$function$;

comment on function private.attendance_review_state(uuid, uuid, uuid) is
  'Derives whether a pending attendance request is safely visible, currently approvable, or decline-only.';

-- A pending attendance row still needs a host decision after kickoff. Approval
-- remains time-, audience-, block-, and capacity-gated; decline is the safe
-- closure transition for a request that can no longer be approved.
create or replace function public.review_attendance(
  input_attendance_id uuid,
  input_decision text,
  audit_request_id uuid default null
)
returns table (attendance_id uuid, status text)
language plpgsql
security definer
set search_path = ''
as $function$
#variable_conflict use_variable
declare
  actor_id uuid := private.assert_attendance_context_actor(input_attendance_id);
  parsed_decision text := lower(btrim(input_decision));
  attendee_id uuid;
  host_id uuid;
  target_event public.events%rowtype;
  target_attendance public.event_attendance%rowtype;
  approved_count bigint;
begin
  if input_decision is null
    or parsed_decision is null
    or parsed_decision not in ('approve', 'decline') then
    raise exception using errcode = 'P0001', message = 'VALIDATION_FAILED';
  end if;

  select attendance.user_id, event.host_user_id
  into attendee_id, host_id
  from public.event_attendance as attendance
  join public.events as event on event.id = attendance.event_id
  where attendance.id = input_attendance_id;

  if not found then
    raise exception using errcode = 'P0001', message = 'NOT_FOUND';
  end if;

  perform private.lock_event_interaction_pairs(attendee_id, actor_id, host_id);

  select event.*
  into target_event
  from public.events as event
  join public.event_attendance as attendance on attendance.event_id = event.id
  where attendance.id = input_attendance_id
  for update of event;

  select attendance.*
  into target_attendance
  from public.event_attendance as attendance
  where attendance.id = input_attendance_id
  for update;

  if not found or not private.actor_manages_event(target_event.id, actor_id) then
    raise exception using errcode = 'P0001', message = 'NOT_FOUND';
  end if;

  if target_event.status = 'cancelled' then
    raise exception using errcode = 'P0001', message = 'EVENT_CANCELLED';
  end if;

  if target_event.status <> 'published' then
    raise exception using errcode = 'P0001', message = 'NOT_ALLOWED';
  end if;

  if target_attendance.status <> 'requested' then
    raise exception using errcode = 'P0001', message = 'INVALID_TRANSITION';
  end if;

  if target_attendance.user_id = actor_id then
    raise exception using errcode = 'P0001', message = 'NOT_ALLOWED';
  end if;

  if not (
    select review_state.visible
    from private.attendance_review_state(
      target_event.id,
      target_attendance.user_id,
      actor_id
    ) as review_state
  ) then
    raise exception using errcode = 'P0001', message = 'NOT_FOUND';
  end if;

  if parsed_decision = 'approve' then
    if target_event.starts_at <= statement_timestamp() then
      raise exception using errcode = 'P0001', message = 'EVENT_STARTED';
    end if;

    if private.users_are_blocked(actor_id, target_attendance.user_id)
      or not private.event_user_is_audience_eligible(
        target_event.id,
        target_attendance.user_id,
        false
      ) then
      raise exception using errcode = 'P0001', message = 'NOT_ALLOWED';
    end if;

    select count(*)
    into approved_count
    from public.event_attendance as attendance
    where attendance.event_id = target_event.id
      and attendance.status = 'approved';

    if approved_count >= target_event.capacity then
      raise exception using errcode = 'P0001', message = 'EVENT_FULL';
    end if;
  end if;

  update public.event_attendance as attendance
  set
    status = case
      when parsed_decision = 'approve' then 'approved'::public.attendance_status
      else 'declined'::public.attendance_status
    end,
    reviewed_by = actor_id,
    reviewed_at = statement_timestamp()
  where attendance.id = target_attendance.id
  returning * into target_attendance;

  perform private.write_security_audit(
    actor_id,
    'event.attendance.review',
    'event',
    target_event.id,
    'succeeded',
    audit_request_id,
    jsonb_build_object('decision', parsed_decision)
  );

  return query select target_attendance.id, target_attendance.status::text;
end;
$function$;

comment on function public.review_attendance(uuid, text, uuid) is
  'Atomically approves an eligible future request or safely declines any current published request; retained attendance rows are never deleted.';

drop function public.list_event_attendance(uuid, integer, integer);

create function public.list_event_attendance(
  input_event_id uuid,
  input_limit integer default 20,
  input_offset integer default 0
)
returns table (
  attendance_id uuid,
  user_id uuid,
  requester_handle text,
  requester_display_name text,
  requester_city_name text,
  status text,
  source text,
  requested_at timestamptz,
  removal_reason text,
  verified_account boolean,
  account_age_days integer,
  mutual_friend_count bigint,
  shared_active_group_count bigint,
  follows_sport boolean,
  follows_competition boolean,
  follows_home_team boolean,
  follows_away_team boolean,
  follows_audience_team boolean,
  review_mode text,
  review_reason text,
  can_approve boolean,
  total_count bigint
)
language plpgsql
security definer
stable
set search_path = ''
as $function$
declare
  actor_id uuid := private.assert_event_context_actor(input_event_id);
  bounded_limit integer;
  bounded_offset integer;
begin
  if input_limit is null
    or input_limit not between 1 and 50
    or input_offset is null
    or input_offset not between 0 and 10000
    or input_offset + input_limit > 10020 then
    raise exception using errcode = 'P0001', message = 'VALIDATION_FAILED';
  end if;
  if not private.actor_manages_event(input_event_id, actor_id) then
    raise exception using errcode = 'P0001', message = 'NOT_FOUND';
  end if;
  bounded_limit := input_limit;
  bounded_offset := input_offset;

  return query
  select
    attendance.id,
    attendance.user_id,
    context.requester_handle,
    context.requester_display_name,
    context.requester_city_name,
    attendance.status::text,
    attendance.source::text,
    attendance.requested_at,
    attendance.removal_reason,
    context.verified_account,
    context.account_age_days,
    context.mutual_friend_count,
    context.shared_active_group_count,
    context.follows_sport,
    context.follows_competition,
    context.follows_home_team,
    context.follows_away_team,
    context.follows_audience_team,
    case
      when attendance.status = 'requested' and review_state.can_approve
        then 'approve_or_decline'
      when attendance.status = 'requested' and review_state.visible
        then 'decline_only'
      else 'none'
    end::text,
    case
      when attendance.status = 'requested' and review_state.visible
        then review_state.review_reason
      else null
    end::text,
    attendance.status = 'requested'
      and review_state.visible
      and review_state.can_approve,
    count(*) over ()
  from public.event_attendance as attendance
  cross join lateral private.event_request_context(
    input_event_id,
    attendance.user_id,
    actor_id
  ) as context
  cross join lateral private.attendance_review_state(
    input_event_id,
    attendance.user_id,
    actor_id
  ) as review_state
  where attendance.event_id = input_event_id
    and (
      attendance.status <> 'requested'
      or review_state.visible
    )
  order by
    (attendance.status = 'requested') desc,
    attendance.requested_at desc,
    attendance.id desc
  offset bounded_offset
  limit bounded_limit;
end;
$function$;

comment on function public.list_event_attendance(uuid, integer, integer) is
  'Returns a bounded event-management queue with server-derived approval capability; privacy-ending pending requests are omitted.';

create or replace function public.list_attention_items(input_limit integer default 10)
returns table (
  key text,
  kind text,
  resource_id uuid,
  href text,
  title text,
  description text,
  created_at timestamptz
)
language plpgsql
security definer
volatile
set search_path = ''
as $function$
declare
  actor_id uuid := private.assert_fan_actor();
  bounded_limit integer;
begin
  if input_limit is null or input_limit not between 1 and 50 then
    raise exception using errcode = 'P0001', message = 'VALIDATION_FAILED';
  end if;
  bounded_limit := input_limit;

  return query
  with actionable as (
    select
      'event_invitation:' || invitation.id::text as key,
      'event_invitation'::text as kind,
      event.id as resource_id,
      '/events/' || event.id::text as href,
      'Event invitation'::text as title,
      'Respond to your invitation for ' || event.title || '.' as description,
      invitation.created_at
    from public.event_invitations as invitation
    join public.events as event on event.id = invitation.event_id
    where invitation.invitee_id = actor_id
      and invitation.status = 'pending'
      and event.status = 'published'
      and event.ends_at > statement_timestamp()
      and private.event_is_visible_to_actor(event.id, actor_id)
      and private.profile_is_fan_eligible(invitation.invitee_id)
      and not private.users_are_blocked(actor_id, invitation.invited_by)
      and (
        event.host_user_id is null
        or not private.users_are_blocked(actor_id, event.host_user_id)
      )

    union all

    select
      'attendance_request:' || attendance.id::text,
      'attendance_request'::text,
      event.id,
      '/events/' || event.id::text || '/manage',
      case
        when review_state.can_approve then 'Attendance request'
        else 'Attendance request needs closure'
      end::text,
      case
        when review_state.can_approve
          then requester.display_name || ' asked to join ' || event.title || '.'
        else requester.display_name || ' can no longer be approved for ' || event.title || '. '
          || review_state.review_reason
      end::text,
      attendance.requested_at
    from public.event_attendance as attendance
    join public.events as event on event.id = attendance.event_id
    join public.profiles as requester on requester.id = attendance.user_id
    cross join lateral private.attendance_review_state(
      event.id,
      attendance.user_id,
      actor_id
    ) as review_state
    where attendance.status = 'requested'
      and event.host_venue_id is null
      and review_state.visible

    union all

    select
      'friend_request:' || friendship.id::text,
      'friend_request'::text,
      requester.id,
      '/people#people-incoming',
      'Friend request'::text,
      requester.display_name || ' sent you a friend request.',
      friendship.created_at
    from public.friendships as friendship
    join public.profiles as requester on requester.id = friendship.requested_by
    where friendship.status = 'pending'
      and actor_id in (friendship.user_low_id, friendship.user_high_id)
      and friendship.requested_by <> actor_id
      and private.profile_is_fan_eligible(requester.id)
      and not private.users_are_blocked(actor_id, requester.id)

    union all

    select
      'group_application:' || membership.group_id::text || ':' || membership.user_id::text,
      'group_application'::text,
      supporter_group.id,
      '/groups/' || supporter_group.slug || '/manage?section=applications',
      'Group application'::text,
      applicant.display_name || ' applied to ' || supporter_group.name || '.',
      membership.created_at
    from public.group_memberships as membership
    join public.groups as supporter_group on supporter_group.id = membership.group_id
    join public.profiles as applicant on applicant.id = membership.user_id
    join public.group_memberships as manager
      on manager.group_id = membership.group_id
      and manager.user_id = actor_id
      and manager.status = 'active'
      and manager.role in ('owner', 'admin')
    where membership.status = 'pending'
      and supporter_group.lifecycle in ('forming', 'active')
      and supporter_group.suspended_at is null
      and private.profile_is_fan_eligible(membership.user_id)
      and not private.users_are_blocked(actor_id, membership.user_id)
      and not exists (
        select 1
        from public.group_bans as ban
        where ban.group_id = membership.group_id
          and ban.user_id = membership.user_id
          and ban.revoked_at is null
      )

    union all

    select
      'group_event_submission:' || event.id::text,
      'group_event_submission'::text,
      event.id,
      '/events/' || event.id::text || '/manage',
      'Group event to review'::text,
      event.title || ' is ready for group review.',
      event.created_at
    from public.events as event
    join public.groups as supporter_group on supporter_group.id = event.organizing_group_id
    join public.group_memberships as manager
      on manager.group_id = event.organizing_group_id
      and manager.user_id = actor_id
      and manager.status = 'active'
      and manager.role in ('owner', 'admin')
    join public.group_memberships as creator_membership
      on creator_membership.group_id = event.organizing_group_id
      and creator_membership.user_id = event.created_by
      and creator_membership.status = 'active'
    where event.status = 'pending_group_review'
      and event.host_venue_id is null
      and event.starts_at > statement_timestamp()
      and event.created_by <> actor_id
      and supporter_group.lifecycle in ('forming', 'active')
      and supporter_group.suspended_at is null
      and private.profile_is_fan_eligible(event.created_by)
      and not private.users_are_blocked(actor_id, event.created_by)
      and not exists (
        select 1
        from public.group_bans as ban
        where ban.group_id = event.organizing_group_id
          and ban.user_id = event.created_by
          and ban.revoked_at is null
      )

    union all

    select
      'workspace_setup:' || profile.id::text,
      'workspace_setup'::text,
      profile.id,
      '/settings/interests',
      'Choose your teams'::text,
      'Follow a team or competition to make Home more useful.'::text,
      coalesce(profile.fan_enabled_at, profile.updated_at)
    from public.profiles as profile
    where profile.id = actor_id
      and private.profile_is_fan_eligible(profile.id)
      and not exists (
        select 1
        from public.subscriptions as subscription
        left join public.teams as followed_team
          on subscription.kind = 'team'
          and followed_team.id = subscription.team_id
          and followed_team.active
        left join public.competitions as followed_competition
          on subscription.kind = 'competition'
          and followed_competition.id = subscription.competition_id
          and followed_competition.active
        where subscription.user_id = actor_id
          and (
            followed_team.id is not null
            or followed_competition.id is not null
          )
      )
  )
  select
    actionable.key,
    actionable.kind,
    actionable.resource_id,
    actionable.href,
    actionable.title,
    actionable.description,
    actionable.created_at
  from actionable
  order by actionable.created_at desc, actionable.kind, actionable.key
  limit bounded_limit;
end;
$function$;

comment on function public.list_attention_items(integer) is
  'Returns a bounded current-action projection. It stores no notification ledger and exposes no private message, location, token, email, or safety detail.';

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
  city_name text,
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
      city.name_en as city_name,
      event.place_kind::text as place_kind,
      event.audience::text as audience,
      event.status::text as status,
      input_bucket as bucket,
      case input_bucket
        when 'upcoming' then case
          when event.host_venue_id is null
            and (event.host_user_id = actor_id or event.created_by = actor_id)
            then 'You are hosting'
          else 'You are going'
        end
        when 'hosting' then case
          when event.status = 'draft' then 'Draft'
          else 'You are hosting'
        end
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
    join public.cities as city on city.id = event.city_id
    left join public.event_attendance as attendance
      on attendance.event_id = event.id
      and attendance.user_id = actor_id
    where (
        (
          input_bucket = 'upcoming'
          and event.status = 'published'
          and event.starts_at > statement_timestamp()
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
          and event.status in ('draft', 'published')
          and event.ends_at > statement_timestamp()
          and event.host_venue_id is null
          and (event.host_user_id = actor_id or event.created_by = actor_id)
        )
        or (
          input_bucket = 'pending'
          and event.starts_at > statement_timestamp()
          and (
            (
              event.status = 'pending_group_review'
              and event.host_venue_id is null
              and event.created_by = actor_id
            )
            or (
              event.status = 'published'
              and attendance.status = 'requested'
              and private.event_is_visible_to_actor(event.id, actor_id)
            )
          )
        )
        or (
          input_bucket = 'history'
          and event.status in ('completed', 'cancelled')
          and (
            (
              event.host_venue_id is null
              and (event.host_user_id = actor_id or event.created_by = actor_id)
            )
            or (
              event.status = 'completed'
              and attendance.status = 'approved'
            )
          )
        )
      )
      and (
        coalesce(event.organizing_group_id, event.audience_group_id) is null
        or (
          private.actor_is_active_group_member(
            coalesce(event.organizing_group_id, event.audience_group_id),
            actor_id
          )
          and exists (
            select 1
            from public.groups as governing_group
            where governing_group.id = coalesce(
                event.organizing_group_id,
                event.audience_group_id
              )
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
    relationship.city_name,
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

comment on function public.list_my_events(text, integer, integer) is
  'Returns one effective Fan event bucket. Retained closed rows qualify only for attended or personally hosted History. Venue-managed work is excluded while the same person''s Fan attendance relationship remains visible.';

create or replace function public.list_my_group_relationships(
  input_bucket text,
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
volatile
set search_path = ''
as $function$
declare
  actor_id uuid := private.assert_fan_actor();
  bounded_limit integer;
  bounded_offset integer;
begin
  if input_bucket is null
    or input_bucket not in ('owner', 'admin', 'member', 'applying')
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
      supporter_group.id as group_id,
      supporter_group.slug,
      supporter_group.name,
      case when input_bucket = 'applying' then null else supporter_group.description end
        as description,
      supporter_group.visibility::text as visibility,
      supporter_group.lifecycle::text as lifecycle,
      city.name_en as city_name,
      team.name as team_name,
      case when input_bucket = 'applying' then null else membership.role::text end
        as member_role,
      membership.status::text as membership_status,
      case
        when input_bucket = 'applying' then null
        else (
          select count(*)::integer
          from public.group_memberships as active_membership
          join public.profiles as active_profile on active_profile.id = active_membership.user_id
          where active_membership.group_id = supporter_group.id
            and active_membership.status = 'active'
            and private.profile_is_fan_eligible(active_profile.id)
            and not exists (
              select 1
              from public.group_bans as ban
              where ban.group_id = active_membership.group_id
                and ban.user_id = active_membership.user_id
                and ban.revoked_at is null
            )
        )
      end as active_member_count,
      input_bucket in ('owner', 'admin') as can_manage,
      membership.updated_at
    from public.group_memberships as membership
    join public.groups as supporter_group on supporter_group.id = membership.group_id
    join public.cities as city on city.id = supporter_group.city_id
    left join public.teams as team on team.id = supporter_group.team_id
    where membership.user_id = actor_id
      and supporter_group.lifecycle in ('forming', 'active')
      and supporter_group.suspended_at is null
      and not exists (
        select 1
        from public.group_bans as ban
        where ban.group_id = membership.group_id
          and ban.user_id = actor_id
          and ban.revoked_at is null
      )
      and (
        (
          input_bucket in ('owner', 'admin', 'member')
          and membership.status = 'active'
          and membership.role::text = input_bucket
        )
        or (
          input_bucket = 'applying'
          and membership.status = 'pending'
          and membership.role = 'member'
          and supporter_group.visibility = 'discoverable'
        )
      )
  )
  select
    relationship.group_id,
    relationship.slug,
    relationship.name,
    relationship.description,
    relationship.visibility,
    relationship.lifecycle,
    relationship.city_name,
    relationship.team_name,
    relationship.member_role,
    relationship.membership_status,
    relationship.active_member_count,
    relationship.can_manage,
    count(*) over ()
  from relationships as relationship
  order by relationship.updated_at desc, relationship.group_id
  offset bounded_offset
  limit bounded_limit;
end;
$function$;

comment on function public.list_my_group_relationships(text, integer, integer) is
  'Returns active role buckets plus a deliberately minimal discoverable pending-application envelope; unlisted pending applicants receive no projection.';

create or replace function public.list_my_saved_items(
  input_bucket text,
  input_limit integer default 20,
  input_offset integer default 0
)
returns table (
  item_id uuid,
  kind text,
  label text,
  detail text,
  href text,
  created_at timestamptz,
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
    or input_bucket not in ('all', 'sport', 'competition', 'team', 'venue')
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
  with saved as (
    select
      sport.id as item_id,
      'sport'::text as kind,
      sport.name as label,
      null::text as detail,
      '/settings/interests'::text as href,
      subscription.created_at
    from public.subscriptions as subscription
    join public.sports as sport
      on subscription.kind = 'sport'
      and sport.id = subscription.sport_id
      and sport.active
    where subscription.user_id = actor_id

    union all

    select
      competition.id,
      'competition'::text,
      competition.name,
      competition.country_name,
      '/matches?competition=' || competition.id::text,
      subscription.created_at
    from public.subscriptions as subscription
    join public.competitions as competition
      on subscription.kind = 'competition'
      and competition.id = subscription.competition_id
      and competition.active
    where subscription.user_id = actor_id

    union all

    select
      team.id,
      'team'::text,
      team.name,
      team.country_name,
      '/matches?team=' || team.id::text,
      subscription.created_at
    from public.subscriptions as subscription
    join public.teams as team
      on subscription.kind = 'team'
      and team.id = subscription.team_id
      and team.active
    where subscription.user_id = actor_id

    union all

    select
      venue.id,
      'venue'::text,
      venue.name,
      city.name_en,
      '/venues/' || venue.slug,
      follow.created_at
    from public.venue_follows as follow
    join public.venues as venue
      on venue.id = follow.venue_id
      and venue.verification_status <> 'suspended'
      and venue.suspended_at is null
    join public.cities as city on city.id = venue.city_id
    where follow.user_id = actor_id
  ),
  filtered as (
    select *
    from saved
    where input_bucket = 'all' or saved.kind = input_bucket
  )
  select
    filtered.item_id,
    filtered.kind,
    filtered.label,
    filtered.detail,
    filtered.href,
    filtered.created_at,
    count(*) over ()
  from filtered
  order by filtered.created_at desc, filtered.kind, filtered.item_id
  offset bounded_offset
  limit bounded_limit;
end;
$function$;

comment on function public.list_my_saved_items(text, integer, integer) is
  'Returns a bounded, stable union of the current Fan catalog subscriptions and Venue follows.';

create index profiles_display_name_search_idx
  on public.profiles using gin (
    to_tsvector('simple'::regconfig, lower(display_name))
  )
  where display_name is not null;

create index profiles_handle_lower_pattern_idx
  on public.profiles (lower(handle) text_pattern_ops)
  where handle is not null;

create or replace function public.list_people_hub(
  input_query text,
  input_bucket text,
  input_limit integer default 20,
  input_offset integer default 0
)
returns table (
  profile_id uuid,
  handle text,
  display_name text,
  city_name text,
  reason text,
  friendship_id uuid,
  friendship_status text,
  friendship_direction text,
  relationship_created_at timestamptz,
  total_count bigint
)
language plpgsql
security definer
volatile
set search_path = ''
as $function$
declare
  actor_id uuid := private.assert_fan_actor();
  normalized_query text;
  escaped_query text;
  display_query_is_eligible boolean := false;
  bounded_limit integer;
  bounded_offset integer;
begin
  if input_bucket is null
    or input_bucket not in ('suggested', 'search', 'accepted', 'incoming', 'sent')
    or input_limit is null
    or input_limit not between 1 and 50
    or input_offset is null
    or input_offset not between 0 and 10000
    or input_offset + input_limit > 10020 then
    raise exception using errcode = 'P0001', message = 'VALIDATION_FAILED';
  end if;

  if input_bucket = 'search' then
    if input_query is null then
      raise exception using errcode = 'P0001', message = 'VALIDATION_FAILED';
    end if;
    normalized_query := lower(btrim(input_query));
    if left(normalized_query, 1) = '@' then
      normalized_query := substr(normalized_query, 2);
    end if;
    if char_length(normalized_query) not between 2 and 50 then
      raise exception using errcode = 'P0001', message = 'VALIDATION_FAILED';
    end if;
    escaped_query := replace(
      replace(replace(normalized_query, '\', '\\'), '%', '\%'),
      '_',
      '\_'
    );
    select count(*) > 0
      and coalesce(bool_and(char_length(word_fragment) >= 3), false)
    into display_query_is_eligible
    from unnest(
      regexp_split_to_array(normalized_query, '[^[:alnum:]]+')
    ) as query_fragments(word_fragment)
    where word_fragment <> '';
  else
    if input_query is not null and btrim(input_query) <> '' then
      raise exception using errcode = 'P0001', message = 'VALIDATION_FAILED';
    end if;
    normalized_query := '';
    escaped_query := '';
  end if;

  bounded_limit := input_limit;
  bounded_offset := input_offset;

  return query
  with viewer as (
    select profile.id, profile.city_id
    from public.profiles as profile
    where profile.id = actor_id
  ),
  candidate_ids as (
    select profile.id as profile_id
    from public.profiles as profile
    where input_bucket = 'search'
      and lower(profile.handle) like escaped_query || '%' escape '\'

    union

    select profile.id as profile_id
    from public.profiles as profile
    where input_bucket = 'search'
      and display_query_is_eligible
      and to_tsvector('simple'::regconfig, lower(profile.display_name))
        @@ plainto_tsquery('simple'::regconfig, normalized_query)

    union

    select case
      when friendship.user_low_id = actor_id then friendship.user_high_id
      else friendship.user_low_id
    end
    from public.friendships as friendship
    where input_bucket in ('accepted', 'incoming', 'sent')
      and actor_id in (friendship.user_low_id, friendship.user_high_id)
      and (
        (input_bucket = 'accepted' and friendship.status = 'accepted')
        or (
          input_bucket = 'incoming'
          and friendship.status = 'pending'
          and friendship.requested_by <> actor_id
        )
        or (
          input_bucket = 'sent'
          and friendship.status = 'pending'
          and friendship.requested_by = actor_id
        )
      )

    union

    select profile.id
    from viewer
    join public.profiles as profile on profile.city_id = viewer.city_id
    where input_bucket = 'suggested'

    union

    select target_follow.user_id
    from public.subscriptions as viewer_follow
    join public.subscriptions as target_follow
      on target_follow.kind = 'team'
      and target_follow.team_id = viewer_follow.team_id
      and target_follow.user_id <> actor_id
    join public.teams as team on team.id = viewer_follow.team_id and team.active
    where input_bucket = 'suggested'
      and viewer_follow.user_id = actor_id
      and viewer_follow.kind = 'team'

    union

    select target_membership.user_id
    from public.group_memberships as viewer_membership
    join public.group_memberships as target_membership
      on target_membership.group_id = viewer_membership.group_id
      and target_membership.status = 'active'
      and target_membership.user_id <> actor_id
    join public.groups as supporter_group
      on supporter_group.id = viewer_membership.group_id
      and supporter_group.lifecycle in ('forming', 'active')
      and supporter_group.suspended_at is null
    where input_bucket = 'suggested'
      and viewer_membership.user_id = actor_id
      and viewer_membership.status = 'active'
      and not exists (
        select 1
        from public.group_bans as ban
        where ban.group_id = viewer_membership.group_id
          and ban.user_id in (actor_id, target_membership.user_id)
          and ban.revoked_at is null
      )
  ),
  candidates as (
    select
      profile.id as profile_id,
      profile.handle,
      profile.display_name,
      city.name_en as city_name,
      case
        when shared_team.name is not null then 'You both follow ' || shared_team.name
        when shared_group.name is not null then 'You are both in ' || shared_group.name
        when profile.city_id = viewer.city_id then 'Also in ' || city.name_en
        else null
      end as reason,
      relation.id as friendship_id,
      relation.status::text as friendship_status,
      case
        when relation.status = 'accepted' then 'accepted'
        when relation.requested_by = actor_id then 'sent'
        when relation.id is not null then 'incoming'
        else null
      end as friendship_direction,
      relation.created_at as relationship_created_at,
      relation.updated_at as relationship_updated_at,
      case
        when lower(profile.handle) = normalized_query then 0
        when left(lower(profile.handle), char_length(normalized_query)) = normalized_query then 1
        else 2
      end as search_rank
    from candidate_ids
    join public.profiles as profile on profile.id = candidate_ids.profile_id
    join viewer on true
    join public.cities as city on city.id = profile.city_id and city.active
    left join lateral (
      select friendship.*
      from public.friendships as friendship
      where friendship.user_low_id = least(actor_id, profile.id)
        and friendship.user_high_id = greatest(actor_id, profile.id)
        and friendship.status in ('pending', 'accepted')
      limit 1
    ) as relation on true
    left join lateral (
      select team.name
      from public.subscriptions as viewer_follow
      join public.subscriptions as target_follow
        on target_follow.user_id = profile.id
        and target_follow.kind = 'team'
        and target_follow.team_id = viewer_follow.team_id
      join public.teams as team on team.id = viewer_follow.team_id and team.active
      where viewer_follow.user_id = actor_id
        and viewer_follow.kind = 'team'
      order by lower(team.name), team.id
      limit 1
    ) as shared_team on true
    left join lateral (
      select supporter_group.name
      from public.group_memberships as viewer_membership
      join public.group_memberships as target_membership
        on target_membership.group_id = viewer_membership.group_id
        and target_membership.user_id = profile.id
        and target_membership.status = 'active'
      join public.groups as supporter_group
        on supporter_group.id = viewer_membership.group_id
        and supporter_group.lifecycle in ('forming', 'active')
        and supporter_group.suspended_at is null
      where viewer_membership.user_id = actor_id
        and viewer_membership.status = 'active'
        and not exists (
          select 1
          from public.group_bans as ban
          where ban.group_id = viewer_membership.group_id
            and ban.user_id in (actor_id, profile.id)
            and ban.revoked_at is null
        )
      order by lower(supporter_group.name), supporter_group.id
      limit 1
    ) as shared_group on true
    where profile.id <> actor_id
      and private.profile_is_fan_eligible(profile.id)
      and not private.users_are_blocked(actor_id, profile.id)
  ),
  filtered as (
    select candidates.*
    from candidates
    where
      (
        input_bucket = 'suggested'
        and candidates.friendship_id is null
        and candidates.reason is not null
      )
      or (
        input_bucket = 'search'
      )
      or (
        input_bucket = 'accepted'
        and candidates.friendship_status = 'accepted'
      )
      or (
        input_bucket = 'incoming'
        and candidates.friendship_status = 'pending'
        and candidates.friendship_direction = 'incoming'
      )
      or (
        input_bucket = 'sent'
        and candidates.friendship_status = 'pending'
        and candidates.friendship_direction = 'sent'
      )
  )
  select
    filtered.profile_id,
    filtered.handle,
    filtered.display_name,
    filtered.city_name,
    filtered.reason,
    filtered.friendship_id,
    filtered.friendship_status,
    filtered.friendship_direction,
    filtered.relationship_created_at,
    count(*) over ()
  from filtered
  order by
    case when input_bucket = 'search' then filtered.search_rank end,
    case when input_bucket in ('accepted', 'incoming', 'sent')
      then filtered.relationship_updated_at end desc,
    lower(filtered.display_name),
    filtered.handle
  offset bounded_offset
  limit bounded_limit;
end;
$function$;

comment on function public.list_people_hub(text, text, integer, integer) is
  'Returns one safe People bucket with at most one authorization-safe suggestion reason and the current direct-friendship state.';

revoke all on function public.list_attention_items(integer) from public, anon;
revoke all on function public.list_my_events(text, integer, integer) from public, anon;
revoke all on function public.list_my_group_relationships(text, integer, integer)
  from public, anon;
revoke all on function public.list_my_saved_items(text, integer, integer)
  from public, anon;
revoke all on function public.list_people_hub(text, text, integer, integer)
  from public, anon;
revoke all on function public.list_event_attendance(uuid, integer, integer)
  from public, anon;
revoke all on function private.attendance_review_state(uuid, uuid, uuid)
  from public, anon, authenticated;

grant execute on function public.list_attention_items(integer) to authenticated;
grant execute on function public.list_my_events(text, integer, integer) to authenticated;
grant execute on function public.list_my_group_relationships(text, integer, integer)
  to authenticated;
grant execute on function public.list_my_saved_items(text, integer, integer)
  to authenticated;
grant execute on function public.list_people_hub(text, text, integer, integer)
  to authenticated;
grant execute on function public.list_event_attendance(uuid, integer, integer)
  to authenticated;

commit;
