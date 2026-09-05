begin;

-- F01/F04: restore explicit social retries while retaining canonical rows,
-- actor/pair locks, cooldowns, active-ban checks, RLS grants and audit history.
create or replace function public.request_friendship(
  target_user_id uuid,
  audit_request_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $function$
declare
  requester_id uuid := private.assert_actor(true);
  pair_low_id uuid;
  pair_high_id uuid;
  friendship_id uuid;
  existing_friendship public.friendships%rowtype;
begin
  if target_user_id is null or target_user_id = requester_id then
    raise exception using errcode = 'P0001', message = 'NOT_ALLOWED';
  end if;

  if not private.profile_is_community_eligible(target_user_id) then
    raise exception using errcode = 'P0001', message = 'NOT_FOUND';
  end if;

  pair_low_id := least(requester_id, target_user_id);
  pair_high_id := greatest(requester_id, target_user_id);

  -- Serialize all outgoing requests by this actor for the durable cooldown,
  -- then serialize direct-interaction mutations for this canonical pair. This
  -- order cannot cycle with block_user, which takes only the pair lock.
  perform pg_advisory_xact_lock(
    hashtextextended('huddle:friendship-request:' || requester_id::text, 0)
  );
  perform private.lock_direct_user_pair(requester_id, target_user_id);

  -- This check must run while the pair lock is held. A concurrently committed
  -- block therefore becomes visible before any friendship row can be inserted.
  if private.users_are_blocked(requester_id, target_user_id) then
    raise exception using errcode = 'P0001', message = 'BLOCKED_RELATIONSHIP';
  end if;

  select relation.*
  into existing_friendship
  from public.friendships as relation
  where relation.user_low_id = pair_low_id
    and relation.user_high_id = pair_high_id
  for update;

  if found and existing_friendship.status <> 'declined' then
    raise exception using errcode = 'P0001', message = 'FRIENDSHIP_EXISTS';
  end if;

  if exists (
    select 1
    from public.security_audit_events as recent_request
    where recent_request.actor_id = requester_id
      and recent_request.action = 'friendship.request'
      and recent_request.created_at > statement_timestamp() - interval '10 seconds'
  ) then
    raise exception using errcode = 'P0001', message = 'RATE_LIMITED';
  end if;

  if existing_friendship.id is not null then
    -- Decline closes a request, not the ability to request again. Keep the
    -- canonical row and its audit history; only the recipient may respond anew.
    update public.friendships as relation
    set requested_by = requester_id,
        status = 'pending',
        responded_at = null
    where relation.id = existing_friendship.id
    returning relation.id into friendship_id;
  else
    insert into public.friendships (
      user_low_id,
      user_high_id,
      requested_by,
      status
    )
    values (
      pair_low_id,
      pair_high_id,
      requester_id,
      'pending'
    )
    returning id into friendship_id;
  end if;

  perform private.write_security_audit(
    requester_id,
    'friendship.request',
    'friendship',
    friendship_id,
    'succeeded',
    audit_request_id,
    '{}'::jsonb
  );

  return friendship_id;
exception
  when unique_violation then
    raise exception using errcode = 'P0001', message = 'FRIENDSHIP_EXISTS';
end;
$function$;

comment on function public.request_friendship(uuid, uuid) is
  'Serializes per requester and canonical pair, then inserts or renews only a declined direct friendship after complete-account, block, duplicate, and cooldown checks.';

create or replace function public.create_group_invitation(
  input_group_id uuid,
  input_invitee_id uuid,
  audit_request_id uuid default null
)
returns table (invitation_id uuid, group_id uuid, invitee_id uuid, status text)
language plpgsql
security definer
set search_path = ''
as $function$
#variable_conflict use_variable
declare
  actor_id uuid := private.assert_fan_actor();
  target_group public.groups%rowtype;
  existing_membership public.group_memberships%rowtype;
  created_id uuid;
begin
  if actor_id = input_invitee_id then
    raise exception using errcode = 'P0001', message = 'NOT_ALLOWED';
  end if;

  select supporter_group.*
  into target_group
  from public.groups as supporter_group
  where supporter_group.id = input_group_id
  for update;

  if not found
    or target_group.lifecycle not in ('forming', 'active')
    or target_group.suspended_at is not null
    or not private.actor_is_group_admin(input_group_id, actor_id) then
    raise exception using errcode = 'P0001', message = 'NOT_ALLOWED';
  end if;

  perform private.lock_direct_user_pair(actor_id, input_invitee_id);

  if not private.profile_is_fan_eligible(input_invitee_id)
    or private.users_are_blocked(actor_id, input_invitee_id)
    or private.users_are_blocked(target_group.owner_id, input_invitee_id)
    or exists (
      select 1
      from public.group_bans as ban
      where ban.group_id = input_group_id
        and ban.user_id = input_invitee_id
        and ban.revoked_at is null
    ) then
    raise exception using errcode = 'P0001', message = 'NOT_ALLOWED';
  end if;

  select membership.*
  into existing_membership
  from public.group_memberships as membership
  where membership.group_id = input_group_id
    and membership.user_id = input_invitee_id
  for update;

  -- An active ban was rejected above. A historical banned row remains inert
  -- until the recipient explicitly accepts this new invitation.
  if found and existing_membership.status in ('pending', 'active') then
    raise exception using errcode = 'P0001', message = 'INVALID_TRANSITION';
  end if;

  if exists (
    select 1
    from public.group_invitations as invitation
    where invitation.group_id = input_group_id
      and invitation.invitee_id = input_invitee_id
      and invitation.status = 'pending'
  ) then
    raise exception using errcode = 'P0001', message = 'INVALID_TRANSITION';
  end if;

  insert into public.group_invitations (group_id, invitee_id, invited_by)
  values (input_group_id, input_invitee_id, actor_id)
  returning id into created_id;

  perform private.write_security_audit(
    actor_id,
    'group.invitation.create',
    'group',
    input_group_id,
    'succeeded',
    audit_request_id,
    jsonb_build_object('subject_id', input_invitee_id, 'invitation_id', created_id)
  );

  return query select created_id, input_group_id, input_invitee_id, 'pending'::text;
end;
$function$;

comment on function public.create_group_invitation(uuid, uuid, uuid) is
  'Lets an active owner/admin send one audited, recipient-bound invitation to an eligible non-member.';

create or replace function public.respond_group_invitation(
  input_invitation_id uuid,
  input_decision text,
  audit_request_id uuid default null
)
returns table (invitation_id uuid, group_id uuid, group_slug text, status text)
language plpgsql
security definer
set search_path = ''
as $function$
#variable_conflict use_variable
declare
  actor_id uuid := private.assert_fan_actor();
  target_invitation public.group_invitations%rowtype;
  target_group public.groups%rowtype;
  existing_membership public.group_memberships%rowtype;
  next_status text;
begin
  if input_decision not in ('accept', 'decline') then
    raise exception using errcode = 'P0001', message = 'VALIDATION_FAILED';
  end if;

  select invitation.*
  into target_invitation
  from public.group_invitations as invitation
  where invitation.id = input_invitation_id
  for update;

  if not found
    or target_invitation.invitee_id <> actor_id
    or target_invitation.status <> 'pending' then
    raise exception using errcode = 'P0001', message = 'INVALID_TRANSITION';
  end if;

  select supporter_group.*
  into target_group
  from public.groups as supporter_group
  where supporter_group.id = target_invitation.group_id
  for share;

  if not found
    or target_group.lifecycle not in ('forming', 'active')
    or target_group.suspended_at is not null then
    raise exception using errcode = 'P0001', message = 'NOT_FOUND';
  end if;

  perform private.lock_direct_user_pair(actor_id, target_invitation.invited_by);

  if input_decision = 'accept' then
    if not private.profile_is_fan_eligible(actor_id)
      or private.users_are_blocked(actor_id, target_invitation.invited_by)
      or private.users_are_blocked(actor_id, target_group.owner_id)
      or exists (
        select 1
        from public.group_bans as ban
        where ban.group_id = target_group.id
          and ban.user_id = actor_id
          and ban.revoked_at is null
      ) then
      raise exception using errcode = 'P0001', message = 'NOT_ALLOWED';
    end if;

    select membership.*
    into existing_membership
    from public.group_memberships as membership
    where membership.group_id = target_group.id
      and membership.user_id = actor_id
    for update;

    -- The current ban check above is authoritative; an explicitly unbanned
    -- recipient may now reactivate their retained historical membership.
    if found and existing_membership.status in ('pending', 'active') then
      raise exception using errcode = 'P0001', message = 'INVALID_TRANSITION';
    end if;

    if existing_membership.group_id is null then
      insert into public.group_memberships (
        group_id, user_id, role, status, application_message, invite_id, reviewed_by, reviewed_at
      )
      values (
        target_group.id, actor_id, 'member', 'active', null, null,
        target_invitation.invited_by, statement_timestamp()
      );
    else
      update public.group_memberships as membership
      set
        role = 'member',
        status = 'active',
        application_message = null,
        invite_id = null,
        reviewed_by = target_invitation.invited_by,
        reviewed_at = statement_timestamp()
      where membership.group_id = target_group.id
        and membership.user_id = actor_id;
    end if;
    next_status := 'accepted';
  else
    next_status := 'declined';
  end if;

  update public.group_invitations as invitation
  set status = next_status, responded_at = statement_timestamp()
  where invitation.id = input_invitation_id;

  perform private.write_security_audit(
    actor_id,
    'group.invitation.' || next_status,
    'group',
    target_group.id,
    'succeeded',
    audit_request_id,
    jsonb_build_object('invitation_id', input_invitation_id)
  );

  return query select input_invitation_id, target_group.id, target_group.slug, next_status;
end;
$function$;

comment on function public.respond_group_invitation(uuid, text, uuid) is
  'Lets only the intended eligible recipient accept into active membership or decline a pending direct invitation.';

commit;
