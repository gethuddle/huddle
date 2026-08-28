begin;

create index event_attendance_pending_review_idx
  on public.event_attendance (event_id, requested_at, id)
  where status = 'requested';

create index security_audit_event_participation_idx
  on public.security_audit_events (resource_id, created_at desc)
  where action in (
    'event.invitation.create',
    'event.invitation.revoke',
    'event.invitation.respond',
    'event.attendance.request',
    'event.attendance.join',
    'event.attendance.review',
    'event.attendance.leave',
    'event.attendance.remove',
    'event.cancel',
    'event.private_location.read'
  );

create or replace function private.lock_event_interaction_pairs(
  input_user_id uuid,
  first_target_id uuid,
  second_target_id uuid default null
)
returns void
language plpgsql
volatile
set search_path = ''
as $function$
declare
  target_id uuid;
begin
  if input_user_id is null then
    return;
  end if;

  for target_id in
    select distinct_target.target_id
    from (
      select distinct candidate.target_id
      from unnest(array[first_target_id, second_target_id]::uuid[]) as candidate(target_id)
      where candidate.target_id is not null
        and candidate.target_id <> input_user_id
    ) as distinct_target
    order by
      least(input_user_id, distinct_target.target_id)::text,
      greatest(input_user_id, distinct_target.target_id)::text
  loop
    perform private.lock_direct_user_pair(input_user_id, target_id);
  end loop;
end;
$function$;

comment on function private.lock_event_interaction_pairs(uuid, uuid, uuid) is
  'Acquires distinct canonical user-pair locks in deterministic order before block-sensitive event transitions.';

create or replace function private.event_user_is_audience_eligible(
  input_event_id uuid,
  input_user_id uuid,
  input_direct_invite boolean
)
returns boolean
language sql
security definer
stable
set search_path = ''
as $function$
  select input_user_id is not null
    and private.profile_is_community_eligible(input_user_id)
    and exists (
      select 1
      from public.events as event
      left join public.profiles as host_profile on host_profile.id = event.host_user_id
      left join public.venues as host_venue on host_venue.id = event.host_venue_id
      left join public.groups as audience_group on audience_group.id = event.audience_group_id
      where event.id = input_event_id
        and input_user_id is distinct from event.host_user_id
        and (
          (
            event.host_user_id is not null
            and private.profile_is_community_eligible(event.host_user_id)
            and host_profile.suspended_at is null
            and not private.users_are_blocked(input_user_id, event.host_user_id)
          )
          or (
            event.host_venue_id is not null
            and host_venue.verification_status <> 'suspended'
            and host_venue.suspended_at is null
          )
        )
        and (
          event.audience = 'public'
          or (
            event.audience = 'team_followers'
            and (
              input_direct_invite
              or exists (
                select 1
                from public.subscriptions as subscription
                where subscription.user_id = input_user_id
                  and subscription.kind = 'team'
                  and subscription.team_id = event.audience_team_id
              )
            )
          )
          or (
            event.audience = 'group'
            and audience_group.lifecycle in ('forming', 'active')
            and audience_group.suspended_at is null
            and private.actor_is_active_group_member(
              event.audience_group_id,
              input_user_id
            )
          )
          or (
            event.audience = 'friends'
            and private.actor_is_accepted_friend(event.host_user_id, input_user_id)
          )
          or (event.audience = 'invite_only' and input_direct_invite)
        )
    );
$function$;

comment on function private.event_user_is_audience_eligible(uuid, uuid, boolean) is
  'Rechecks complete-account, host, venue, block, group, friendship, and follow eligibility. Direct invitation bypasses only team-follow and supplies invite-only eligibility.';

create or replace function private.actor_can_read_private_event_location(
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
    and private.profile_is_community_eligible(input_actor_id)
    and exists (
      select 1
      from public.events as event
      where event.id = input_event_id
        and event.place_kind = 'home'
        and event.status = 'published'
        and event.ends_at > statement_timestamp()
        and private.profile_is_community_eligible(event.host_user_id)
        and (
          event.host_user_id = input_actor_id
          or exists (
            select 1
            from public.event_attendance as attendance
            where attendance.event_id = event.id
              and attendance.user_id = input_actor_id
              and attendance.status = 'approved'
              and private.event_user_is_audience_eligible(
                event.id,
                input_actor_id,
                attendance.source = 'direct_invite'
                and exists (
                  select 1
                  from public.event_invitations as invitation
                  where invitation.event_id = event.id
                    and invitation.invitee_id = input_actor_id
                    and invitation.status = 'accepted'
                )
              )
          )
        )
    );
$function$;

comment on function private.actor_can_read_private_event_location(uuid, uuid) is
  'Returns only current host/approved-attendee authorization after status, time, suspension, block, audience, membership, ban, friendship, and invitation checks.';

create or replace function private.event_request_context(
  input_event_id uuid,
  input_requester_id uuid,
  input_manager_id uuid
)
returns table (
  requester_handle text,
  requester_display_name text,
  requester_city_name text,
  verified_account boolean,
  account_age_days integer,
  mutual_friend_count bigint,
  shared_active_group_count bigint,
  follows_sport boolean,
  follows_competition boolean,
  follows_home_team boolean,
  follows_away_team boolean,
  follows_audience_team boolean
)
language sql
security definer
stable
set search_path = ''
as $function$
  with target_event as (
    select
      event.match_id,
      event.audience_team_id,
      match.competition_id,
      competition.sport_id,
      match.home_team_id,
      match.away_team_id
    from public.events as event
    join public.matches as match on match.id = event.match_id
    join public.competitions as competition on competition.id = match.competition_id
    where event.id = input_event_id
  ),
  manager_friends as (
    select case
      when friendship.user_low_id = input_manager_id then friendship.user_high_id
      else friendship.user_low_id
    end as friend_id
    from public.friendships as friendship
    where friendship.status = 'accepted'
      and input_manager_id in (friendship.user_low_id, friendship.user_high_id)
  ),
  requester_friends as (
    select case
      when friendship.user_low_id = input_requester_id then friendship.user_high_id
      else friendship.user_low_id
    end as friend_id
    from public.friendships as friendship
    where friendship.status = 'accepted'
      and input_requester_id in (friendship.user_low_id, friendship.user_high_id)
  ),
  mutual_friends as (
    select count(*) as total
    from manager_friends
    join requester_friends using (friend_id)
    where not private.users_are_blocked(input_manager_id, manager_friends.friend_id)
      and not private.users_are_blocked(input_requester_id, manager_friends.friend_id)
  ),
  shared_groups as (
    select count(*) as total
    from public.group_memberships as manager_membership
    join public.group_memberships as requester_membership
      on requester_membership.group_id = manager_membership.group_id
    join public.groups as supporter_group on supporter_group.id = manager_membership.group_id
    where manager_membership.user_id = input_manager_id
      and requester_membership.user_id = input_requester_id
      and manager_membership.status = 'active'
      and requester_membership.status = 'active'
      and supporter_group.lifecycle in ('forming', 'active')
      and supporter_group.suspended_at is null
      and not exists (
        select 1
        from public.group_bans as ban
        where ban.group_id = supporter_group.id
          and ban.user_id in (input_manager_id, input_requester_id)
          and ban.revoked_at is null
      )
  )
  select
    profile.handle,
    profile.display_name,
    city.name_en,
    auth_user.email_confirmed_at is not null,
    greatest(
      floor(extract(epoch from statement_timestamp() - auth_user.created_at) / 86400),
      0
    )::integer,
    mutual_friends.total,
    shared_groups.total,
    exists (
      select 1 from public.subscriptions as subscription, target_event
      where subscription.user_id = input_requester_id
        and subscription.kind = 'sport'
        and subscription.sport_id = target_event.sport_id
    ),
    exists (
      select 1 from public.subscriptions as subscription, target_event
      where subscription.user_id = input_requester_id
        and subscription.kind = 'competition'
        and subscription.competition_id = target_event.competition_id
    ),
    exists (
      select 1 from public.subscriptions as subscription, target_event
      where subscription.user_id = input_requester_id
        and subscription.kind = 'team'
        and subscription.team_id = target_event.home_team_id
    ),
    exists (
      select 1 from public.subscriptions as subscription, target_event
      where subscription.user_id = input_requester_id
        and subscription.kind = 'team'
        and subscription.team_id = target_event.away_team_id
    ),
    exists (
      select 1 from public.subscriptions as subscription, target_event
      where subscription.user_id = input_requester_id
        and subscription.kind = 'team'
        and subscription.team_id = target_event.audience_team_id
    )
  from public.profiles as profile
  join auth.users as auth_user on auth_user.id = profile.id
  join public.cities as city on city.id = profile.city_id
  cross join mutual_friends
  cross join shared_groups
  where profile.id = input_requester_id;
$function$;

comment on function private.event_request_context(uuid, uuid, uuid) is
  'Builds bounded factual request context without returning emails, exact relationship graphs, private memberships, or a reputation score.';

create or replace function public.create_event_invitation(
  input_event_id uuid,
  input_invitee_handle text,
  audit_request_id uuid default null
)
returns table (invitation_id uuid, event_id uuid, status text)
language plpgsql
security definer
set search_path = ''
as $function$
#variable_conflict use_variable
declare
  actor_id uuid := private.assert_actor(true);
  invitee_id uuid;
  host_id uuid;
  target_event public.events%rowtype;
  target_invitation public.event_invitations%rowtype;
  approved_count bigint;
begin
  select profile.id
  into invitee_id
  from public.profiles as profile
  where profile.handle = lower(btrim(input_invitee_handle))
    and profile.profile_completed_at is not null;

  if invitee_id is null then
    raise exception using errcode = 'P0001', message = 'NOT_FOUND';
  end if;

  select event.host_user_id
  into host_id
  from public.events as event
  where event.id = input_event_id;

  if not found then
    raise exception using errcode = 'P0001', message = 'NOT_FOUND';
  end if;

  perform private.lock_event_interaction_pairs(invitee_id, actor_id, host_id);

  select event.*
  into target_event
  from public.events as event
  where event.id = input_event_id
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

  if target_event.starts_at <= statement_timestamp() then
    raise exception using errcode = 'P0001', message = 'EVENT_STARTED';
  end if;

  if invitee_id = actor_id or invitee_id = target_event.host_user_id then
    raise exception using errcode = 'P0001', message = 'NOT_ALLOWED';
  end if;

  if private.users_are_blocked(actor_id, invitee_id)
    or (
      target_event.host_user_id is not null
      and private.users_are_blocked(target_event.host_user_id, invitee_id)
    ) then
    raise exception using errcode = 'P0001', message = 'BLOCKED_RELATIONSHIP';
  end if;

  if not private.event_user_is_audience_eligible(
    target_event.id,
    invitee_id,
    true
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

  select invitation.*
  into target_invitation
  from public.event_invitations as invitation
  where invitation.event_id = target_event.id
    and invitation.invitee_id = invitee_id
  for update;

  if found and target_invitation.status in ('pending', 'accepted') then
    raise exception using errcode = 'P0001', message = 'INVITE_INVALID';
  elsif found then
    update public.event_invitations as invitation
    set
      invited_by = actor_id,
      status = 'pending',
      responded_at = null
    where invitation.id = target_invitation.id
    returning * into target_invitation;
  else
    insert into public.event_invitations (event_id, invitee_id, invited_by)
    values (target_event.id, invitee_id, actor_id)
    returning * into target_invitation;
  end if;

  perform private.write_security_audit(
    actor_id,
    'event.invitation.create',
    'event',
    target_event.id,
    'succeeded',
    audit_request_id,
    jsonb_build_object('invitation_id', target_invitation.id)
  );

  return query select
    target_invitation.id,
    target_invitation.event_id,
    target_invitation.status::text;
end;
$function$;

comment on function public.create_event_invitation(uuid, text, uuid) is
  'Lets a current event manager invite one eligible registered account after pair/event locks, audience checks, and a current capacity check.';

create or replace function public.revoke_event_invitation(
  input_invitation_id uuid,
  audit_request_id uuid default null
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $function$
declare
  actor_id uuid := private.assert_actor(true);
  invitee_id uuid;
  host_id uuid;
  target_event public.events%rowtype;
  target_invitation public.event_invitations%rowtype;
begin
  select invitation.invitee_id, event.host_user_id
  into invitee_id, host_id
  from public.event_invitations as invitation
  join public.events as event on event.id = invitation.event_id
  where invitation.id = input_invitation_id;

  if not found then
    raise exception using errcode = 'P0001', message = 'NOT_FOUND';
  end if;

  perform private.lock_event_interaction_pairs(invitee_id, actor_id, host_id);

  select event.*
  into target_event
  from public.events as event
  join public.event_invitations as invitation on invitation.event_id = event.id
  where invitation.id = input_invitation_id
  for update of event;

  select invitation.*
  into target_invitation
  from public.event_invitations as invitation
  where invitation.id = input_invitation_id
  for update;

  if not found or not private.actor_manages_event(target_event.id, actor_id) then
    raise exception using errcode = 'P0001', message = 'NOT_FOUND';
  end if;

  if target_invitation.status <> 'pending' then
    raise exception using errcode = 'P0001', message = 'INVALID_TRANSITION';
  end if;

  update public.event_invitations as invitation
  set status = 'revoked', responded_at = statement_timestamp()
  where invitation.id = target_invitation.id;

  perform private.write_security_audit(
    actor_id,
    'event.invitation.revoke',
    'event',
    target_event.id,
    'succeeded',
    audit_request_id,
    jsonb_build_object('invitation_id', target_invitation.id)
  );

  return true;
end;
$function$;

comment on function public.revoke_event_invitation(uuid, uuid) is
  'Revokes only a pending invitation. Accepted invitations require the distinct retained attendee-removal transition.';

create or replace function public.respond_to_event_invitation(
  input_invitation_id uuid,
  input_decision text,
  audit_request_id uuid default null
)
returns table (
  event_id uuid,
  invitation_status text,
  attendance_id uuid,
  attendance_status text
)
language plpgsql
security definer
set search_path = ''
as $function$
#variable_conflict use_variable
declare
  actor_id uuid := private.assert_actor(true);
  parsed_decision text := lower(btrim(input_decision));
  inviter_id uuid;
  host_id uuid;
  target_event public.events%rowtype;
  target_invitation public.event_invitations%rowtype;
  target_attendance public.event_attendance%rowtype;
  approved_count bigint;
begin
  if parsed_decision not in ('accept', 'decline') then
    raise exception using errcode = 'P0001', message = 'VALIDATION_FAILED';
  end if;

  select invitation.invited_by, event.host_user_id
  into inviter_id, host_id
  from public.event_invitations as invitation
  join public.events as event on event.id = invitation.event_id
  where invitation.id = input_invitation_id
    and invitation.invitee_id = actor_id;

  if not found then
    raise exception using errcode = 'P0001', message = 'NOT_FOUND';
  end if;

  perform private.lock_event_interaction_pairs(actor_id, inviter_id, host_id);

  select event.*
  into target_event
  from public.events as event
  join public.event_invitations as invitation on invitation.event_id = event.id
  where invitation.id = input_invitation_id
  for update of event;

  select invitation.*
  into target_invitation
  from public.event_invitations as invitation
  where invitation.id = input_invitation_id
    and invitation.invitee_id = actor_id
  for update;

  if not found then
    raise exception using errcode = 'P0001', message = 'NOT_FOUND';
  end if;

  if target_invitation.status <> 'pending' then
    raise exception using errcode = 'P0001', message = 'INVITE_INVALID';
  end if;

  if target_event.status = 'cancelled' then
    raise exception using errcode = 'P0001', message = 'EVENT_CANCELLED';
  end if;

  if target_event.status <> 'published' then
    raise exception using errcode = 'P0001', message = 'NOT_ALLOWED';
  end if;

  if target_event.starts_at <= statement_timestamp() then
    raise exception using errcode = 'P0001', message = 'EVENT_STARTED';
  end if;

  if parsed_decision = 'decline' then
    update public.event_invitations as invitation
    set status = 'declined', responded_at = statement_timestamp()
    where invitation.id = target_invitation.id
    returning * into target_invitation;

    perform private.write_security_audit(
      actor_id,
      'event.invitation.respond',
      'event',
      target_event.id,
      'succeeded',
      audit_request_id,
      jsonb_build_object('decision', parsed_decision)
    );

    return query select
      target_event.id,
      target_invitation.status::text,
      null::uuid,
      null::text;
    return;
  end if;

  if private.users_are_blocked(actor_id, target_invitation.invited_by)
    or (
      target_event.host_user_id is not null
      and private.users_are_blocked(actor_id, target_event.host_user_id)
    ) then
    raise exception using errcode = 'P0001', message = 'BLOCKED_RELATIONSHIP';
  end if;

  if not private.event_user_is_audience_eligible(target_event.id, actor_id, true) then
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

  select attendance.*
  into target_attendance
  from public.event_attendance as attendance
  where attendance.event_id = target_event.id
    and attendance.user_id = actor_id
  for update;

  if found and target_attendance.status = 'approved' then
    raise exception using errcode = 'P0001', message = 'ALREADY_ATTENDING';
  elsif found then
    update public.event_attendance as attendance
    set
      status = 'approved',
      source = 'direct_invite',
      reviewed_by = target_invitation.invited_by,
      reviewed_at = statement_timestamp(),
      left_at = null,
      removed_by = null,
      removed_at = null,
      removal_reason = null
    where attendance.id = target_attendance.id
    returning * into target_attendance;
  else
    insert into public.event_attendance (
      event_id,
      user_id,
      status,
      source,
      reviewed_by,
      reviewed_at
    )
    values (
      target_event.id,
      actor_id,
      'approved',
      'direct_invite',
      target_invitation.invited_by,
      statement_timestamp()
    )
    returning * into target_attendance;
  end if;

  update public.event_invitations as invitation
  set status = 'accepted', responded_at = statement_timestamp()
  where invitation.id = target_invitation.id
  returning * into target_invitation;

  perform private.write_security_audit(
    actor_id,
    'event.invitation.respond',
    'event',
    target_event.id,
    'succeeded',
    audit_request_id,
    jsonb_build_object('decision', parsed_decision, 'attendance_status', 'approved')
  );

  return query select
    target_event.id,
    target_invitation.status::text,
    target_attendance.id,
    target_attendance.status::text;
end;
$function$;

comment on function public.respond_to_event_invitation(uuid, text, uuid) is
  'Lets only the invitee decline or atomically accept one pending invitation; acceptance locks the event, rechecks eligibility, and reserves one seat.';

create or replace function public.request_or_join_event(
  input_event_id uuid,
  audit_request_id uuid default null
)
returns table (attendance_id uuid, status text)
language plpgsql
security definer
set search_path = ''
as $function$
#variable_conflict use_variable
declare
  actor_id uuid := private.assert_actor(true);
  host_id uuid;
  target_event public.events%rowtype;
  target_attendance public.event_attendance%rowtype;
  approved_count bigint;
  immediate_approval boolean;
  attendance_exists boolean;
begin
  select event.host_user_id
  into host_id
  from public.events as event
  where event.id = input_event_id;

  if not found then
    raise exception using errcode = 'P0001', message = 'NOT_FOUND';
  end if;

  perform private.lock_event_interaction_pairs(actor_id, host_id, null);

  select event.*
  into target_event
  from public.events as event
  where event.id = input_event_id
  for update;

  if target_event.status = 'cancelled' then
    raise exception using errcode = 'P0001', message = 'EVENT_CANCELLED';
  end if;

  if target_event.status <> 'published' then
    raise exception using errcode = 'P0001', message = 'NOT_FOUND';
  end if;

  if target_event.starts_at <= statement_timestamp() then
    raise exception using errcode = 'P0001', message = 'EVENT_STARTED';
  end if;

  if not private.event_user_is_audience_eligible(target_event.id, actor_id, false) then
    raise exception using errcode = 'P0001', message = 'NOT_ALLOWED';
  end if;

  select attendance.*
  into target_attendance
  from public.event_attendance as attendance
  where attendance.event_id = target_event.id
    and attendance.user_id = actor_id
  for update;

  attendance_exists := found;

  if attendance_exists and target_attendance.status in ('requested', 'approved') then
    raise exception using errcode = 'P0001', message = 'ALREADY_ATTENDING';
  elsif attendance_exists and target_attendance.status in ('declined', 'removed') then
    raise exception using errcode = 'P0001', message = 'INVALID_TRANSITION';
  end if;

  immediate_approval := target_event.host_venue_id is not null
    and not target_event.requires_approval;

  if immediate_approval then
    select count(*)
    into approved_count
    from public.event_attendance as attendance
    where attendance.event_id = target_event.id
      and attendance.status = 'approved';

    if approved_count >= target_event.capacity then
      raise exception using errcode = 'P0001', message = 'EVENT_FULL';
    end if;
  end if;

  if attendance_exists then
    update public.event_attendance as attendance
    set
      status = case
        when immediate_approval then 'approved'::public.attendance_status
        else 'requested'::public.attendance_status
      end,
      source = 'self_request',
      requested_at = statement_timestamp(),
      reviewed_by = null,
      reviewed_at = null,
      left_at = null,
      removed_by = null,
      removed_at = null,
      removal_reason = null
    where attendance.id = target_attendance.id
    returning * into target_attendance;
  else
    insert into public.event_attendance (event_id, user_id, status, source)
    values (
      target_event.id,
      actor_id,
      case
        when immediate_approval then 'approved'::public.attendance_status
        else 'requested'::public.attendance_status
      end,
      'self_request'
    )
    returning * into target_attendance;
  end if;

  perform private.write_security_audit(
    actor_id,
    case
      when immediate_approval then 'event.attendance.join'
      else 'event.attendance.request'
    end,
    'event',
    target_event.id,
    'succeeded',
    audit_request_id,
    jsonb_build_object('attendance_status', target_attendance.status::text)
  );

  return query select target_attendance.id, target_attendance.status::text;
end;
$function$;

comment on function public.request_or_join_event(uuid, uuid) is
  'Creates or reuses one attendance row. Venue immediate joins reserve capacity atomically; private/approval-required requests remain non-capacity-consuming.';

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
  actor_id uuid := private.assert_actor(true);
  parsed_decision text := lower(btrim(input_decision));
  attendee_id uuid;
  host_id uuid;
  target_event public.events%rowtype;
  target_attendance public.event_attendance%rowtype;
  approved_count bigint;
begin
  if parsed_decision not in ('approve', 'decline') then
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

  if target_event.starts_at <= statement_timestamp() then
    raise exception using errcode = 'P0001', message = 'EVENT_STARTED';
  end if;

  if target_attendance.status <> 'requested' then
    raise exception using errcode = 'P0001', message = 'INVALID_TRANSITION';
  end if;

  if parsed_decision = 'approve' then
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
  'Lets a current manager approve or decline one pending request. Approval serializes on the event and rechecks attendee eligibility and capacity.';

create or replace function public.leave_event(
  input_attendance_id uuid,
  audit_request_id uuid default null
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $function$
declare
  actor_id uuid := private.assert_actor(false);
  host_id uuid;
  target_event public.events%rowtype;
  target_attendance public.event_attendance%rowtype;
begin
  select event.host_user_id
  into host_id
  from public.event_attendance as attendance
  join public.events as event on event.id = attendance.event_id
  where attendance.id = input_attendance_id
    and attendance.user_id = actor_id;

  if not found then
    raise exception using errcode = 'P0001', message = 'NOT_FOUND';
  end if;

  perform private.lock_event_interaction_pairs(actor_id, host_id, null);

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
    and attendance.user_id = actor_id
  for update;

  if not found or target_attendance.status not in ('requested', 'approved') then
    raise exception using errcode = 'P0001', message = 'INVALID_TRANSITION';
  end if;

  update public.event_attendance as attendance
  set
    status = 'left',
    left_at = statement_timestamp(),
    removed_by = null,
    removed_at = null,
    removal_reason = null
  where attendance.id = target_attendance.id;

  perform private.write_security_audit(
    actor_id,
    'event.attendance.leave',
    'event',
    target_event.id,
    'succeeded',
    audit_request_id,
    '{}'::jsonb
  );

  return true;
end;
$function$;

comment on function public.leave_event(uuid, uuid) is
  'Lets the attendee retain the one row as left, including after cancellation, and immediately ends private-location eligibility.';

create or replace function public.remove_attendee(
  input_attendance_id uuid,
  input_reason text,
  audit_request_id uuid default null
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $function$
declare
  actor_id uuid := private.assert_actor(true);
  attendee_id uuid;
  host_id uuid;
  target_event public.events%rowtype;
  target_attendance public.event_attendance%rowtype;
  normalized_reason text := nullif(btrim(input_reason), '');
begin
  if normalized_reason is not null
    and char_length(normalized_reason) not between 3 and 500 then
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

  if target_event.status = 'completed'
    or target_event.ends_at <= statement_timestamp() then
    raise exception using errcode = 'P0001', message = 'INVALID_TRANSITION';
  end if;

  if target_attendance.status <> 'approved' then
    raise exception using errcode = 'P0001', message = 'INVALID_TRANSITION';
  end if;

  update public.event_attendance as attendance
  set
    status = 'removed',
    left_at = null,
    removed_by = actor_id,
    removed_at = statement_timestamp(),
    removal_reason = normalized_reason
  where attendance.id = target_attendance.id;

  perform private.write_security_audit(
    actor_id,
    'event.attendance.remove',
    'event',
    target_event.id,
    'succeeded',
    audit_request_id,
    jsonb_build_object('reason_supplied', normalized_reason is not null)
  );

  return true;
end;
$function$;

comment on function public.remove_attendee(uuid, text, uuid) is
  'Lets a current event manager retain an approved row as removed before or during the event and immediately ends private-location eligibility.';

create or replace function public.cancel_event(
  input_event_id uuid,
  input_reason text,
  audit_request_id uuid default null
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $function$
declare
  actor_id uuid := private.assert_actor(true);
  normalized_reason text := btrim(input_reason);
  target_event public.events%rowtype;
begin
  if char_length(normalized_reason) not between 3 and 500 then
    raise exception using errcode = 'P0001', message = 'VALIDATION_FAILED';
  end if;

  select event.*
  into target_event
  from public.events as event
  where event.id = input_event_id
  for update;

  if not found or not private.actor_manages_event(target_event.id, actor_id) then
    raise exception using errcode = 'P0001', message = 'NOT_FOUND';
  end if;

  if target_event.status = 'cancelled' then
    raise exception using errcode = 'P0001', message = 'EVENT_CANCELLED';
  end if;

  if target_event.status = 'completed' then
    raise exception using errcode = 'P0001', message = 'INVALID_TRANSITION';
  end if;

  if target_event.ends_at <= statement_timestamp() then
    raise exception using errcode = 'P0001', message = 'INVALID_TRANSITION';
  end if;

  update public.events as event
  set
    status = 'cancelled',
    cancelled_at = statement_timestamp(),
    cancel_reason = normalized_reason
  where event.id = target_event.id;

  perform private.write_security_audit(
    actor_id,
    'event.cancel',
    'event',
    target_event.id,
    'succeeded',
    audit_request_id,
    '{}'::jsonb
  );

  return true;
end;
$function$;

comment on function public.cancel_event(uuid, text, uuid) is
  'Cancels an upcoming or in-progress managed event while retaining every invitation and attendance row and denying subsequent seat transitions.';

create or replace function public.request_context(
  input_event_id uuid,
  input_requester_id uuid
)
returns table (
  requester_handle text,
  requester_display_name text,
  requester_city_name text,
  verified_account boolean,
  account_age_days integer,
  mutual_friend_count bigint,
  shared_active_group_count bigint,
  follows_sport boolean,
  follows_competition boolean,
  follows_home_team boolean,
  follows_away_team boolean,
  follows_audience_team boolean
)
language plpgsql
security definer
stable
set search_path = ''
as $function$
declare
  actor_id uuid := private.assert_actor(true);
begin
  if not private.actor_manages_event(input_event_id, actor_id)
    or not exists (
      select 1
      from public.event_attendance as attendance
      where attendance.event_id = input_event_id
        and attendance.user_id = input_requester_id
    ) then
    raise exception using errcode = 'P0001', message = 'NOT_FOUND';
  end if;

  return query
  select *
  from private.event_request_context(input_event_id, input_requester_id, actor_id);
end;
$function$;

comment on function public.request_context(uuid, uuid) is
  'Returns a current event manager only bounded factual requester context and never a score or relationship graph.';

create or replace function public.list_event_invitations(
  input_event_id uuid,
  input_limit integer default 20,
  input_offset integer default 0
)
returns table (
  invitation_id uuid,
  invitee_id uuid,
  invitee_handle text,
  invitee_display_name text,
  status text,
  responded_at timestamptz,
  created_at timestamptz,
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
  if not private.actor_manages_event(input_event_id, actor_id) then
    raise exception using errcode = 'P0001', message = 'NOT_FOUND';
  end if;

  return query
  select
    invitation.id,
    invitation.invitee_id,
    profile.handle,
    profile.display_name,
    invitation.status::text,
    invitation.responded_at,
    invitation.created_at,
    count(*) over ()
  from public.event_invitations as invitation
  join public.profiles as profile on profile.id = invitation.invitee_id
  where invitation.event_id = input_event_id
  order by invitation.created_at desc, invitation.id desc
  offset bounded_offset
  limit bounded_limit;
end;
$function$;

comment on function public.list_event_invitations(uuid, integer, integer) is
  'Returns one bounded manager-only invitation page with safe invitee fields and retained response states.';

create or replace function public.list_event_attendance(
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
  if not private.actor_manages_event(input_event_id, actor_id) then
    raise exception using errcode = 'P0001', message = 'NOT_FOUND';
  end if;

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
    count(*) over ()
  from public.event_attendance as attendance
  cross join lateral private.event_request_context(
    input_event_id,
    attendance.user_id,
    actor_id
  ) as context
  where attendance.event_id = input_event_id
  order by
    (attendance.status = 'requested') desc,
    attendance.requested_at desc,
    attendance.id desc
  offset bounded_offset
  limit bounded_limit;
end;
$function$;

comment on function public.list_event_attendance(uuid, integer, integer) is
  'Returns one bounded manager-only attendance page with retained state and minimized factual request context.';

create or replace function public.list_my_event_participation(
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
  host_kind text,
  requires_approval boolean,
  remaining_capacity integer,
  invitation_id uuid,
  invitation_status text,
  attendance_id uuid,
  attendance_status text,
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
    case when event.host_user_id is not null then 'person' else 'venue' end,
    event.requires_approval,
    greatest(event.capacity - attendance_counts.approved_count::integer, 0),
    invitation.id,
    invitation.status::text,
    attendance.id,
    attendance.status::text,
    count(*) over ()
  from public.events as event
  join public.matches as match on match.id = event.match_id
  join public.competitions as competition on competition.id = match.competition_id
  join public.teams as home_team on home_team.id = match.home_team_id
  join public.teams as away_team on away_team.id = match.away_team_id
  join public.cities as city on city.id = event.city_id
  left join public.event_invitations as invitation
    on invitation.event_id = event.id
    and invitation.invitee_id = actor_id
  left join public.event_attendance as attendance
    on attendance.event_id = event.id
    and attendance.user_id = actor_id
  cross join lateral (
    select count(*) as approved_count
    from public.event_attendance as counted_attendance
    where counted_attendance.event_id = event.id
      and counted_attendance.status = 'approved'
  ) as attendance_counts
  where event.status = 'published'
    and event.starts_at > statement_timestamp()
    and (invitation.id is not null or attendance.id is not null)
    and private.event_is_visible_to_actor(event.id, actor_id)
  order by event.starts_at, event.id
  offset bounded_offset
  limit bounded_limit;
end;
$function$;

comment on function public.list_my_event_participation(integer, integer) is
  'Returns one bounded current-user invitation/attendance dashboard page without private location or relationship graphs.';

create or replace function public.list_approved_event_attendees(
  input_event_id uuid,
  input_limit integer default 20,
  input_offset integer default 0
)
returns table (
  profile_handle text,
  display_name text,
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
  if not private.event_is_visible_to_actor(input_event_id, actor_id)
    or not (
      private.actor_manages_event(input_event_id, actor_id)
      or exists (
        select 1
        from public.event_attendance as viewer_attendance
        where viewer_attendance.event_id = input_event_id
          and viewer_attendance.user_id = actor_id
          and viewer_attendance.status = 'approved'
      )
    ) then
    raise exception using errcode = 'P0001', message = 'NOT_FOUND';
  end if;

  return query
  select
    profile.handle,
    profile.display_name,
    count(*) over ()
  from public.event_attendance as attendance
  join public.profiles as profile on profile.id = attendance.user_id
  where attendance.event_id = input_event_id
    and attendance.status = 'approved'
    and private.event_user_is_audience_eligible(
      attendance.event_id,
      attendance.user_id,
      attendance.source = 'direct_invite'
      and exists (
        select 1
        from public.event_invitations as invitation
        where invitation.event_id = attendance.event_id
          and invitation.invitee_id = attendance.user_id
          and invitation.status = 'accepted'
      )
    )
    and not private.users_are_blocked(actor_id, attendance.user_id)
  order by profile.display_name, profile.handle
  offset bounded_offset
  limit bounded_limit;
end;
$function$;

comment on function public.list_approved_event_attendees(uuid, integer, integer) is
  'Returns an approved attendee or manager a bounded, block-filtered list containing only public profile names.';

create or replace function public.get_private_event_location(
  input_event_id uuid,
  audit_request_id uuid default null
)
returns table (address_text text, directions text)
language plpgsql
security definer
set search_path = ''
as $function$
declare
  actor_id uuid := private.assert_actor(true);
  host_id uuid;
  target_event public.events%rowtype;
begin
  select event.host_user_id
  into host_id
  from public.events as event
  where event.id = input_event_id
    and event.place_kind = 'home';

  if not found then
    raise exception using errcode = 'P0001', message = 'LOCATION_NOT_AUTHORIZED';
  end if;

  perform private.lock_event_interaction_pairs(actor_id, host_id, null);

  select event.*
  into target_event
  from public.events as event
  where event.id = input_event_id
  for share;

  if not found
    or not private.actor_can_read_private_event_location(input_event_id, actor_id) then
    raise exception using errcode = 'P0001', message = 'LOCATION_NOT_AUTHORIZED';
  end if;

  perform private.write_security_audit(
    actor_id,
    'event.private_location.read',
    'event',
    input_event_id,
    'succeeded',
    audit_request_id,
    '{}'::jsonb
  );

  return query
  select private_location.address_text, private_location.directions
  from public.event_private_locations as private_location
  where private_location.event_id = input_event_id;
end;
$function$;

comment on function public.get_private_event_location(uuid, uuid) is
  'Returns only address text/directions through a pair/event-serialized current authorization check and writes an address-free audit record.';

create or replace function public.get_calendar_event(
  input_event_id uuid,
  audit_request_id uuid default null
)
returns table (
  event_id uuid,
  title text,
  description text,
  starts_at timestamptz,
  ends_at timestamptz,
  updated_at timestamptz,
  location_text text,
  public_cacheable boolean
)
language plpgsql
security definer
set search_path = ''
as $function$
#variable_conflict use_variable
declare
  actor_id uuid := auth.uid();
  target_event public.events%rowtype;
  venue_address text;
  private_address text;
  private_directions text;
begin
  select event.*
  into target_event
  from public.events as event
  where event.id = input_event_id
  for share;

  if not found or not private.event_is_visible_to_actor(input_event_id, actor_id) then
    raise exception using errcode = 'P0001', message = 'NOT_FOUND';
  end if;

  if target_event.host_user_id is not null and actor_id is null then
    raise exception using errcode = 'P0001', message = 'AUTH_REQUIRED';
  end if;

  if target_event.place_kind = 'home'
    and private.actor_can_read_private_event_location(input_event_id, actor_id) then
    select location.address_text, location.directions
    into private_address, private_directions
    from public.get_private_event_location(input_event_id, audit_request_id) as location;
  elsif target_event.place_kind = 'venue' then
    select venue.address_text
    into venue_address
    from public.venues as venue
    where venue.id = target_event.venue_id;
  end if;

  return query select
    target_event.id,
    target_event.title,
    target_event.description,
    target_event.starts_at,
    target_event.ends_at,
    target_event.updated_at,
    case
      when target_event.place_kind = 'home' and private_address is not null then
        concat_ws(' — ', private_address, private_directions)
      when target_event.place_kind = 'venue' then venue_address
      when target_event.place_kind = 'public_place' then
        concat_ws(' — ', target_event.public_place_name, target_event.public_address_text)
      else null
    end,
    target_event.host_venue_id is not null;
end;
$function$;

comment on function public.get_calendar_event(uuid, uuid) is
  'Returns a calendar-only safe projection. Home location is included only by invoking the audited private-location function in the same transaction.';

create or replace function public.block_user(target_handle text, audit_request_id uuid default null)
returns boolean
language plpgsql
security definer
set search_path = ''
as $function$
declare
  actor_id uuid := private.assert_actor(true);
  target_id uuid;
  inserted_rows integer;
  removed_friendships integer;
  revoked_invitations integer;
  ended_attendance integer;
begin
  select profile.id
  into target_id
  from public.profiles as profile
  where profile.handle = lower(btrim(target_handle))
    and profile.profile_completed_at is not null;

  if target_id is null then
    raise exception using errcode = 'P0001', message = 'NOT_FOUND';
  end if;

  if target_id = actor_id then
    raise exception using errcode = 'P0001', message = 'NOT_ALLOWED';
  end if;

  perform private.lock_direct_user_pair(actor_id, target_id);

  insert into public.user_blocks (blocker_id, blocked_id)
  values (actor_id, target_id)
  on conflict (blocker_id, blocked_id) do nothing;

  get diagnostics inserted_rows = row_count;

  delete from public.friendships as friendship
  where friendship.user_low_id = least(actor_id, target_id)
    and friendship.user_high_id = greatest(actor_id, target_id);

  get diagnostics removed_friendships = row_count;

  update public.event_invitations as invitation
  set status = 'revoked', responded_at = statement_timestamp()
  from public.events as event
  where event.id = invitation.event_id
    and invitation.status = 'pending'
    and event.starts_at > statement_timestamp()
    and (
      (invitation.invited_by = actor_id and invitation.invitee_id = target_id)
      or (invitation.invited_by = target_id and invitation.invitee_id = actor_id)
      or (event.host_user_id = actor_id and invitation.invitee_id = target_id)
      or (event.host_user_id = target_id and invitation.invitee_id = actor_id)
    );

  get diagnostics revoked_invitations = row_count;

  update public.event_attendance as attendance
  set
    status = case
      when event.host_user_id = actor_id then 'removed'::public.attendance_status
      else 'left'::public.attendance_status
    end,
    left_at = case
      when event.host_user_id = target_id then statement_timestamp()
      else null
    end,
    removed_by = case
      when event.host_user_id = actor_id then actor_id
      else null
    end,
    removed_at = case
      when event.host_user_id = actor_id then statement_timestamp()
      else null
    end,
    removal_reason = null
  from public.events as event
  where event.id = attendance.event_id
    and event.place_kind = 'home'
    and event.status = 'published'
    and event.starts_at > statement_timestamp()
    and attendance.status in ('requested', 'approved')
    and (
      (event.host_user_id = actor_id and attendance.user_id = target_id)
      or (event.host_user_id = target_id and attendance.user_id = actor_id)
    );

  get diagnostics ended_attendance = row_count;

  if inserted_rows = 1
    or removed_friendships > 0
    or revoked_invitations > 0
    or ended_attendance > 0 then
    perform private.write_security_audit(
      actor_id,
      'user.block',
      'profile',
      target_id,
      'succeeded',
      audit_request_id,
      jsonb_build_object(
        'friendship_removed', removed_friendships > 0,
        'invitations_revoked', revoked_invitations,
        'attendance_ended', ended_attendance
      )
    );
  end if;

  return inserted_rows = 1;
end;
$function$;

comment on function public.block_user(text, uuid) is
  'Serializes the canonical pair, creates a private block, removes friendship, revokes pending direct invitations, and ends affected future home attendance atomically.';

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
  'Returns one audience-safe event projection with bounded attendance/invitation state and only a private-location authorization boolean.';

revoke select on public.event_invitations from authenticated;
revoke select on public.event_attendance from authenticated;

revoke all on function private.lock_event_interaction_pairs(uuid, uuid, uuid)
  from public, anon, authenticated;
revoke all on function private.event_user_is_audience_eligible(uuid, uuid, boolean)
  from public, anon, authenticated;
revoke all on function private.actor_can_read_private_event_location(uuid, uuid)
  from public, anon, authenticated;
revoke all on function private.event_request_context(uuid, uuid, uuid)
  from public, anon, authenticated;

revoke all on function public.create_event_invitation(uuid, text, uuid)
  from public, anon;
revoke all on function public.revoke_event_invitation(uuid, uuid)
  from public, anon;
revoke all on function public.respond_to_event_invitation(uuid, text, uuid)
  from public, anon;
revoke all on function public.request_or_join_event(uuid, uuid)
  from public, anon;
revoke all on function public.review_attendance(uuid, text, uuid)
  from public, anon;
revoke all on function public.leave_event(uuid, uuid)
  from public, anon;
revoke all on function public.remove_attendee(uuid, text, uuid)
  from public, anon;
revoke all on function public.cancel_event(uuid, text, uuid)
  from public, anon;
revoke all on function public.request_context(uuid, uuid)
  from public, anon;
revoke all on function public.list_event_invitations(uuid, integer, integer)
  from public, anon;
revoke all on function public.list_event_attendance(uuid, integer, integer)
  from public, anon;
revoke all on function public.list_my_event_participation(integer, integer)
  from public, anon;
revoke all on function public.list_approved_event_attendees(uuid, integer, integer)
  from public, anon;
revoke all on function public.get_private_event_location(uuid, uuid)
  from public, anon;
revoke all on function public.get_calendar_event(uuid, uuid) from public;
revoke all on function public.get_event_summary(uuid) from public;

grant execute on function public.create_event_invitation(uuid, text, uuid)
  to authenticated;
grant execute on function public.revoke_event_invitation(uuid, uuid)
  to authenticated;
grant execute on function public.respond_to_event_invitation(uuid, text, uuid)
  to authenticated;
grant execute on function public.request_or_join_event(uuid, uuid)
  to authenticated;
grant execute on function public.review_attendance(uuid, text, uuid)
  to authenticated;
grant execute on function public.leave_event(uuid, uuid)
  to authenticated;
grant execute on function public.remove_attendee(uuid, text, uuid)
  to authenticated;
grant execute on function public.cancel_event(uuid, text, uuid)
  to authenticated;
grant execute on function public.request_context(uuid, uuid)
  to authenticated;
grant execute on function public.list_event_invitations(uuid, integer, integer)
  to authenticated;
grant execute on function public.list_event_attendance(uuid, integer, integer)
  to authenticated;
grant execute on function public.list_my_event_participation(integer, integer)
  to authenticated;
grant execute on function public.list_approved_event_attendees(uuid, integer, integer)
  to authenticated;
grant execute on function public.get_private_event_location(uuid, uuid)
  to authenticated;
grant execute on function public.get_calendar_event(uuid, uuid)
  to anon, authenticated;
grant execute on function public.get_event_summary(uuid)
  to anon, authenticated;

commit;
