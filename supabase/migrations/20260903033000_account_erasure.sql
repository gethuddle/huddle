begin;

alter table public.profiles add column deleted_at timestamptz;

comment on column public.profiles.deleted_at is
  'Canonical irreversible product-data erasure marker. The row remains only as a pseudonymous history tombstone.';

create index profiles_deleted_at_idx on public.profiles (deleted_at)
  where deleted_at is not null;

create or replace function private.profile_is_not_deleted(target_profile_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select exists (
    select 1
    from public.profiles as profile
    where profile.id = target_profile_id
      and profile.deleted_at is null
  );
$function$;

comment on function private.profile_is_not_deleted(uuid) is
  'RLS-safe stale-session boundary for private retained history. Deleted profiles fail closed.';

revoke all on function private.profile_is_not_deleted(uuid)
  from public, anon, authenticated;
grant execute on function private.profile_is_not_deleted(uuid) to authenticated;

drop policy group_memberships_read_own_or_admin on public.group_memberships;
create policy group_memberships_read_own_or_admin
on public.group_memberships
for select
to authenticated
using (
  private.profile_is_not_deleted(auth.uid())
  and (
    user_id = auth.uid()
    or private.actor_is_group_admin(group_id, auth.uid())
  )
);

drop policy venue_memberships_read_own on public.venue_memberships;
create policy venue_memberships_read_own
on public.venue_memberships
for select
to authenticated
using (
  private.profile_is_not_deleted(auth.uid())
  and user_id = auth.uid()
);

drop policy event_invitations_read_invitee_or_manager on public.event_invitations;
create policy event_invitations_read_invitee_or_manager
on public.event_invitations
for select
to authenticated
using (
  private.profile_is_not_deleted(auth.uid())
  and (
    invitee_id = auth.uid()
    or private.actor_manages_event(event_id, auth.uid())
  )
);

drop policy event_attendance_read_self_or_manager on public.event_attendance;
create policy event_attendance_read_self_or_manager
on public.event_attendance
for select
to authenticated
using (
  private.profile_is_not_deleted(auth.uid())
  and (
    user_id = auth.uid()
    or private.actor_manages_event(event_id, auth.uid())
  )
);

create or replace function private.serialize_direct_follow_mutation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  current_actor_id uuid := auth.uid();
  target_actor_id uuid;
begin
  -- Privileged migration and seed writes have no end-user JWT. Client writes
  -- always carry auth.uid() and therefore enter the shared actor lock.
  if current_actor_id is null then
    if tg_op = 'DELETE' then
      return old;
    end if;
    return new;
  end if;

  if private.serialize_actor_transaction() is distinct from current_actor_id then
    raise exception using errcode = 'P0001', message = 'AUTH_REQUIRED';
  end if;

  target_actor_id := case when tg_op = 'DELETE' then old.user_id else new.user_id end;
  if target_actor_id is distinct from current_actor_id then
    -- Existing RLS remains authoritative for forged cross-actor rows. Falling
    -- through also preserves privileged migration/test fixture behavior when a
    -- connection retains an unrelated JWT setting.
    if tg_op = 'DELETE' then
      return old;
    end if;
    return new;
  end if;

  -- INSERT is the only direction capable of leaving new residue. DELETE still
  -- takes the lock, but remains available to the erasure definer on a retry.
  if tg_op = 'INSERT' and not private.profile_is_not_deleted(current_actor_id) then
    raise exception using errcode = 'P0001', message = 'ACCOUNT_DELETED';
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$function$;

comment on function private.serialize_direct_follow_mutation() is
  'Serializes direct subscription and Venue-follow inserts/deletes with account erasure and rejects post-tombstone inserts.';

revoke all on function private.serialize_direct_follow_mutation()
  from public, anon, authenticated;

create trigger subscriptions_serialize_actor_mutation
before insert or delete on public.subscriptions
for each row execute function private.serialize_direct_follow_mutation();

create trigger venue_follows_serialize_actor_mutation
before insert or delete on public.venue_follows
for each row execute function private.serialize_direct_follow_mutation();

create or replace function private.assert_safety_actor(require_complete boolean)
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  actor_id uuid := auth.uid();
  auth_email_confirmed_at timestamptz;
  actor_profile public.profiles%rowtype;
begin
  if actor_id is null then
    raise exception using errcode = 'P0001', message = 'AUTH_REQUIRED';
  end if;

  select auth_user.email_confirmed_at
  into auth_email_confirmed_at
  from auth.users as auth_user
  where auth_user.id = actor_id;

  if not found or auth_email_confirmed_at is null then
    raise exception using errcode = 'P0001', message = 'EMAIL_NOT_VERIFIED';
  end if;

  select profile.*
  into actor_profile
  from public.profiles as profile
  where profile.id = actor_id;

  if not found then
    raise exception using errcode = 'P0001', message = 'PROFILE_INCOMPLETE';
  end if;
  if actor_profile.deleted_at is not null then
    raise exception using errcode = 'P0001', message = 'AUTH_REQUIRED';
  end if;

  if require_complete then
    if actor_profile.adult_attested_at is null then
      raise exception using errcode = 'P0001', message = 'ADULT_ATTESTATION_REQUIRED';
    end if;
    if actor_profile.rules_version is distinct from private.current_rules_version()
      or actor_profile.rules_accepted_at is null then
      raise exception using errcode = 'P0001', message = 'RULES_ACCEPTANCE_REQUIRED';
    end if;
    if actor_profile.handle is null
      or actor_profile.display_name is null
      or actor_profile.profile_completed_at is null then
      raise exception using errcode = 'P0001', message = 'PROFILE_INCOMPLETE';
    end if;
  end if;

  return actor_id;
end;
$function$;

comment on function private.assert_safety_actor(boolean) is
  'Allows verified non-deleted users to report or appeal even while restricted or suspended, with an optional complete-profile gate.';

create or replace function private.assert_actor(require_complete boolean)
returns uuid
language plpgsql
security definer
volatile
set search_path = ''
as $function$
declare
  actor_id uuid := private.serialize_actor_transaction();
  validated_actor_id uuid := private.assert_safety_actor(require_complete);
  actor_profile public.profiles%rowtype;
begin
  if validated_actor_id is distinct from actor_id then
    raise exception using errcode = 'P0001', message = 'AUTH_REQUIRED';
  end if;

  if current_setting('transaction_read_only') = 'on' then
    select profile.*
    into strict actor_profile
    from public.profiles as profile
    where profile.id = actor_id;
  else
    select profile.*
    into strict actor_profile
    from public.profiles as profile
    where profile.id = actor_id
    for share;
  end if;

  if actor_profile.deleted_at is not null then
    raise exception using errcode = 'P0001', message = 'AUTH_REQUIRED';
  end if;
  if actor_profile.suspended_at is not null then
    raise exception using errcode = 'P0001', message = 'ACCOUNT_SUSPENDED';
  end if;

  if require_complete
    and actor_profile.community_restricted_at is not null then
    raise exception using errcode = 'P0001', message = 'ACCOUNT_RESTRICTED';
  end if;

  return actor_id;
end;
$function$;

comment on function private.assert_actor(boolean) is
  'Serializes same-actor writes before the reusable non-deleted, verified, suspension, restriction, and optional complete-profile gate.';

create or replace function private.assert_common_onboarding_actor()
returns uuid
language plpgsql
security definer
volatile
set search_path = ''
as $function$
declare
  actor_id uuid := private.serialize_actor_transaction();
  auth_email_confirmed_at timestamptz;
  actor_profile public.profiles%rowtype;
begin
  select auth_user.email_confirmed_at
  into auth_email_confirmed_at
  from auth.users as auth_user
  where auth_user.id = actor_id;

  if not found or auth_email_confirmed_at is null then
    raise exception using errcode = 'P0001', message = 'EMAIL_NOT_VERIFIED';
  end if;

  select profile.*
  into actor_profile
  from public.profiles as profile
  where profile.id = actor_id
  for update;

  if not found then
    raise exception using errcode = 'P0001', message = 'PROFILE_INCOMPLETE';
  end if;
  if actor_profile.deleted_at is not null then
    raise exception using errcode = 'P0001', message = 'AUTH_REQUIRED';
  end if;
  if actor_profile.suspended_at is not null then
    raise exception using errcode = 'P0001', message = 'ACCOUNT_SUSPENDED';
  end if;
  if actor_profile.community_restricted_at is not null then
    raise exception using errcode = 'P0001', message = 'ACCOUNT_RESTRICTED';
  end if;

  return actor_id;
end;
$function$;

comment on function private.assert_common_onboarding_actor() is
  'Serializes one verified, non-deleted active actor common-rules write and locks its profile in update mode.';

create or replace function private.profile_is_common_eligible(target_profile_id uuid)
returns boolean
language sql
security definer
stable
set search_path = ''
as $function$
  select exists (
    select 1
    from public.profiles as profile
    join auth.users as auth_user on auth_user.id = profile.id
    where profile.id = target_profile_id
      and auth_user.email_confirmed_at is not null
      and profile.deleted_at is null
      and profile.adult_attested_at is not null
      and profile.rules_version = private.current_rules_version()
      and profile.rules_accepted_at is not null
      and profile.suspended_at is null
      and profile.community_restricted_at is null
  );
$function$;

comment on function private.profile_is_common_eligible(uuid) is
  'Checks non-deleted identity, verified email, current adult/rules acceptance, and active suspension/restriction state.';

create or replace function private.ensure_private_location_event_pair()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  target_event_id uuid;
  target_place public.event_place_kind;
  target_host_is_deleted boolean := false;
begin
  target_event_id := case when tg_op = 'DELETE' then old.event_id else new.event_id end;

  select
    event.place_kind,
    coalesce(host_profile.deleted_at is not null, false)
  into target_place, target_host_is_deleted
  from public.events as event
  left join public.profiles as host_profile on host_profile.id = event.host_user_id
  where event.id = target_event_id;

  if not found then
    return null;
  end if;

  if target_place = 'home' and not exists (
    select 1
    from public.event_private_locations as private_location
    where private_location.event_id = target_event_id
  ) and not (tg_op = 'DELETE' and target_host_is_deleted) then
    raise exception using errcode = '23514', message = 'HOME_EVENT_LOCATION_REQUIRED';
  end if;

  if target_place <> 'home' and exists (
    select 1
    from public.event_private_locations as private_location
    where private_location.event_id = target_event_id
  ) then
    raise exception using errcode = '23514', message = 'PRIVATE_LOCATION_HOME_ONLY';
  end if;

  return null;
end;
$function$;

comment on function private.ensure_private_location_event_pair() is
  'Preserves the home/location pair except for deletion of a tombstoned direct host exact location.';

create or replace function private.protect_private_location_after_approval()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  target_event_id uuid;
  target_host_is_deleted boolean := false;
begin
  target_event_id := case when tg_op = 'DELETE' then old.event_id else new.event_id end;

  if tg_op = 'DELETE' then
    select coalesce(host_profile.deleted_at is not null, false)
    into target_host_is_deleted
    from public.events as event
    left join public.profiles as host_profile on host_profile.id = event.host_user_id
    where event.id = target_event_id;

    if target_host_is_deleted then
      return old;
    end if;
  end if;

  if exists (
    select 1
    from public.event_attendance as attendance
    where attendance.event_id = target_event_id
      and attendance.status = 'approved'
  ) and (
    tg_op = 'DELETE'
    or new.address_text is distinct from old.address_text
    or new.directions is distinct from old.directions
    or new.location is distinct from old.location
  ) then
    raise exception using errcode = 'P0001', message = 'MATERIAL_CHANGE_REQUIRES_NEW_EVENT';
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;

  return new;
end;
$function$;

comment on function private.protect_private_location_after_approval() is
  'Protects approved-event locations except for deletion of a tombstoned direct host exact location.';

create or replace function public.prepare_account_erasure(
  input_confirmation text,
  audit_request_id uuid default null
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $function$
declare
  current_actor_id uuid := auth.uid();
  serialized_actor_id uuid;
  erased_at timestamptz := statement_timestamp();
  cancelled_count bigint := 0;
  first_transition boolean;
begin
  if current_actor_id is null then
    raise exception using errcode = 'P0001', message = 'AUTH_REQUIRED';
  end if;
  if input_confirmation is distinct from 'DELETE' then
    raise exception using errcode = 'P0001', message = 'CONFIRMATION_MISMATCH';
  end if;

  serialized_actor_id := private.serialize_actor_transaction();
  if serialized_actor_id is distinct from current_actor_id then
    raise exception using errcode = 'P0001', message = 'AUTH_REQUIRED';
  end if;

  select profile.deleted_at is null
  into first_transition
  from public.profiles as profile
  where profile.id = current_actor_id
  for update;

  if not found then
    raise exception using errcode = 'P0001', message = 'AUTH_REQUIRED';
  end if;

  update public.events as event
  set
    status = 'cancelled',
    cancelled_at = erased_at,
    cancel_reason = 'Host account deleted.'
  where event.status in ('draft', 'pending_group_review', 'published')
    and event.ends_at > erased_at
    and (
      event.host_user_id = current_actor_id
      or event.organizing_group_id in (
        select supporter_group.id
        from public.groups as supporter_group
        where supporter_group.owner_id = current_actor_id
      )
      or event.audience_group_id in (
        select supporter_group.id
        from public.groups as supporter_group
        where supporter_group.owner_id = current_actor_id
      )
      or event.host_venue_id in (
        select venue.id
        from public.venues as venue
        where venue.owner_id = current_actor_id
      )
    );
  get diagnostics cancelled_count = row_count;

  update public.event_invitations as invitation
  set status = 'revoked', responded_at = erased_at
  where invitation.status = 'pending'
    and (
      invitation.invitee_id = current_actor_id
      or invitation.invited_by = current_actor_id
      or exists (
        select 1
        from public.events as event
        where event.id = invitation.event_id
          and (
            event.host_user_id = current_actor_id
            or event.organizing_group_id in (
              select supporter_group.id
              from public.groups as supporter_group
              where supporter_group.owner_id = current_actor_id
            )
            or event.audience_group_id in (
              select supporter_group.id
              from public.groups as supporter_group
              where supporter_group.owner_id = current_actor_id
            )
            or event.host_venue_id in (
              select venue.id
              from public.venues as venue
              where venue.owner_id = current_actor_id
            )
          )
      )
    );

  update public.group_invitations as invitation
  set status = 'revoked', responded_at = null, revoked_at = erased_at
  where invitation.status = 'pending'
    and (
      invitation.invitee_id = current_actor_id
      or invitation.invited_by = current_actor_id
      or invitation.group_id in (
        select supporter_group.id
        from public.groups as supporter_group
        where supporter_group.owner_id = current_actor_id
      )
    );

  update public.event_invite_tokens as invite
  set revoked_at = erased_at, revoked_by = current_actor_id
  where invite.revoked_at is null
    and invite.expires_at > erased_at
    and invite.use_count < invite.max_uses
    and (
      invite.created_by = current_actor_id
      or exists (
        select 1
        from public.events as event
        where event.id = invite.event_id
          and (
            event.host_user_id = current_actor_id
            or event.organizing_group_id in (
              select supporter_group.id
              from public.groups as supporter_group
              where supporter_group.owner_id = current_actor_id
            )
            or event.audience_group_id in (
              select supporter_group.id
              from public.groups as supporter_group
              where supporter_group.owner_id = current_actor_id
            )
            or event.host_venue_id in (
              select venue.id
              from public.venues as venue
              where venue.owner_id = current_actor_id
            )
          )
      )
    );

  update public.group_invite_tokens as invite
  set revoked_at = erased_at
  where invite.revoked_at is null
    and invite.expires_at > erased_at
    and invite.use_count < invite.max_uses
    and (
      invite.created_by = current_actor_id
      or invite.group_id in (
        select supporter_group.id
        from public.groups as supporter_group
        where supporter_group.owner_id = current_actor_id
      )
    );

  update public.event_attendance as attendance
  set
    status = 'left',
    left_at = erased_at,
    removed_by = null,
    removed_at = null,
    removal_reason = null
  where attendance.user_id = current_actor_id
    and attendance.status in ('requested', 'approved');

  update public.groups as supporter_group
  set lifecycle = 'archived'
  where supporter_group.owner_id = current_actor_id
    and supporter_group.lifecycle <> 'archived';

  update public.venues as venue
  set archived_at = erased_at, archived_by = current_actor_id
  where venue.owner_id = current_actor_id
    and venue.archived_at is null;

  update public.group_memberships as membership
  set
    role = case
      when membership.role <> 'owner'
        and membership.status in ('pending', 'active') then 'member'
      else membership.role
    end,
    status = case
      when membership.role <> 'owner'
        and membership.status in ('pending', 'active') then 'left'
      else membership.status
    end,
    application_message = null
  where membership.user_id = current_actor_id
    and (
      membership.application_message is not null
      or (
        membership.role <> 'owner'
        and membership.status in ('pending', 'active')
      )
    );

  update public.venue_memberships as membership
  set status = 'revoked', revoked_at = erased_at
  where membership.user_id = current_actor_id
    and membership.role <> 'owner'
    and membership.status = 'active';

  delete from public.subscriptions as subscription
  where subscription.user_id = current_actor_id;
  delete from public.venue_follows as follow
  where follow.user_id = current_actor_id;
  delete from public.friendships as friendship
  where friendship.user_low_id = current_actor_id
    or friendship.user_high_id = current_actor_id;
  delete from public.user_blocks as user_block
  where user_block.blocker_id = current_actor_id
    or user_block.blocked_id = current_actor_id;
  delete from public.platform_roles as platform_role
  where platform_role.profile_id = current_actor_id;
  delete from private.location_search_rate_limits as rate_limit
  where rate_limit.actor_id = current_actor_id;
  delete from private.assisted_discovery_actor_rate_limits as rate_limit
  where rate_limit.actor_id = current_actor_id;

  -- The tombstone is visible to the two exact-location guards before deletion.
  update public.profiles as profile
  set
    handle = null,
    display_name = 'Deleted account',
    bio = null,
    adult_attested_at = null,
    rules_version = null,
    rules_accepted_at = null,
    profile_completed_at = null,
    fan_enabled_at = null,
    deleted_at = coalesce(profile.deleted_at, erased_at)
  where profile.id = current_actor_id;

  delete from public.event_private_locations as location
  using public.events as event
  where location.event_id = event.id
    and event.host_user_id = current_actor_id;
  delete from public.event_drafts as draft
  where draft.owner_id = current_actor_id;

  if first_transition then
    perform private.write_security_audit(
      current_actor_id,
      'account.erase.prepare',
      'profile',
      current_actor_id,
      'succeeded',
      audit_request_id,
      pg_catalog.jsonb_build_object('future_events_cancelled', cancelled_count)
    );
  end if;

  return true;
end;
$function$;

comment on function public.prepare_account_erasure(text, uuid) is
  'Immediately and idempotently erases one authenticated account product state while retaining pseudonymous safety history.';

revoke all on function public.prepare_account_erasure(text, uuid)
  from public, anon;
grant execute on function public.prepare_account_erasure(text, uuid)
  to authenticated;

commit;
