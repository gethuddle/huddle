create table public.group_invitations (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups(id) on delete cascade,
  invitee_id uuid not null references public.profiles(id) on delete cascade,
  invited_by uuid not null references public.profiles(id) on delete restrict,
  status text not null default 'pending',
  responded_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  constraint group_invitations_status_check check (
    status in ('pending', 'accepted', 'declined', 'revoked')
  ),
  constraint group_invitations_actor_check check (invitee_id <> invited_by),
  constraint group_invitations_transition_check check (
    (status = 'pending' and responded_at is null and revoked_at is null)
    or (status in ('accepted', 'declined') and responded_at is not null and revoked_at is null)
    or (status = 'revoked' and responded_at is null and revoked_at is not null)
  )
);

comment on table public.group_invitations is
  'Recipient-bound group invitations. Safe projections expose only the intended recipient or current group administrators.';

create unique index group_invitations_one_pending_recipient_uidx
  on public.group_invitations (group_id, invitee_id)
  where status = 'pending';
create index group_invitations_invitee_status_created_idx
  on public.group_invitations (invitee_id, status, created_at desc, id);
create index group_invitations_group_status_created_idx
  on public.group_invitations (group_id, status, created_at desc, id);

create trigger group_invitations_set_updated_at
before update on public.group_invitations
for each row execute function private.set_updated_at();

alter table public.group_invitations enable row level security;
alter table public.group_invitations force row level security;
revoke all on public.group_invitations from public, anon, authenticated;

create function public.create_group_invitation(
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

  if found and existing_membership.status in ('pending', 'active', 'banned') then
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

create function public.list_my_group_invitations()
returns table (
  invitation_id uuid,
  group_id uuid,
  group_slug text,
  group_name text,
  inviter_handle text,
  invited_at timestamptz
)
language plpgsql
security definer
volatile
set search_path = ''
as $function$
declare
  actor_id uuid := private.assert_fan_actor();
begin
  return query
  select
    invitation.id,
    supporter_group.id,
    supporter_group.slug,
    supporter_group.name,
    inviter.handle,
    invitation.created_at
  from public.group_invitations as invitation
  join public.groups as supporter_group on supporter_group.id = invitation.group_id
  join public.profiles as inviter on inviter.id = invitation.invited_by
  where invitation.invitee_id = actor_id
    and invitation.status = 'pending'
    and supporter_group.lifecycle in ('forming', 'active')
    and supporter_group.suspended_at is null
    and private.profile_is_fan_eligible(actor_id)
    and not private.users_are_blocked(actor_id, invitation.invited_by)
    and not private.users_are_blocked(actor_id, supporter_group.owner_id)
    and not exists (
      select 1
      from public.group_bans as ban
      where ban.group_id = invitation.group_id
        and ban.user_id = actor_id
        and ban.revoked_at is null
    )
  order by invitation.created_at desc, invitation.id;
end;
$function$;

comment on function public.list_my_group_invitations() is
  'Returns only the current Fan recipient pending group invitations with safe group and inviter identity.';

create function public.list_group_direct_invitations(
  input_group_id uuid,
  input_offset integer default 0,
  input_limit integer default 20
)
returns table (
  invitation_id uuid,
  invitee_id uuid,
  invitee_handle text,
  invitee_display_name text,
  inviter_handle text,
  invitation_status text,
  created_at timestamptz,
  responded_at timestamptz,
  revoked_at timestamptz,
  total_count bigint
)
language plpgsql
security definer
volatile
set search_path = ''
as $function$
declare
  actor_id uuid := private.assert_fan_actor();
  bounded_offset integer := greatest(coalesce(input_offset, 0), 0);
  bounded_limit integer := least(greatest(coalesce(input_limit, 20), 1), 50);
begin
  if not private.actor_is_group_admin(input_group_id, actor_id) then
    raise exception using errcode = 'P0001', message = 'NOT_FOUND';
  end if;

  return query
  select
    invitation.id,
    invitee.id,
    invitee.handle,
    invitee.display_name,
    inviter.handle,
    invitation.status,
    invitation.created_at,
    invitation.responded_at,
    invitation.revoked_at,
    count(*) over ()
  from public.group_invitations as invitation
  join public.profiles as invitee on invitee.id = invitation.invitee_id
  join public.profiles as inviter on inviter.id = invitation.invited_by
  where invitation.group_id = input_group_id
  order by
    case when invitation.status = 'pending' then 0 else 1 end,
    invitation.created_at desc,
    invitation.id
  offset bounded_offset
  limit bounded_limit;
end;
$function$;

comment on function public.list_group_direct_invitations(uuid, integer, integer) is
  'Returns a bounded safe direct-invitation lifecycle to current group administrators.';

create function public.respond_group_invitation(
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

    if found and existing_membership.status in ('pending', 'active', 'banned') then
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

create function public.revoke_group_invitation(
  input_invitation_id uuid,
  audit_request_id uuid default null
)
returns table (invitation_id uuid, group_id uuid, status text)
language plpgsql
security definer
set search_path = ''
as $function$
#variable_conflict use_variable
declare
  actor_id uuid := private.assert_fan_actor();
  target_invitation public.group_invitations%rowtype;
begin
  select invitation.*
  into target_invitation
  from public.group_invitations as invitation
  where invitation.id = input_invitation_id
  for update;

  if not found
    or target_invitation.status <> 'pending'
    or not private.actor_is_group_admin(target_invitation.group_id, actor_id) then
    raise exception using errcode = 'P0001', message = 'NOT_ALLOWED';
  end if;

  update public.group_invitations as invitation
  set status = 'revoked', revoked_at = statement_timestamp()
  where invitation.id = input_invitation_id;

  perform private.write_security_audit(
    actor_id,
    'group.invitation.revoke',
    'group',
    target_invitation.group_id,
    'succeeded',
    audit_request_id,
    jsonb_build_object('subject_id', target_invitation.invitee_id, 'invitation_id', input_invitation_id)
  );

  return query select input_invitation_id, target_invitation.group_id, 'revoked'::text;
end;
$function$;

comment on function public.revoke_group_invitation(uuid, uuid) is
  'Lets a current group owner/admin revoke one still-pending recipient-bound invitation.';

create function public.remove_group_member(
  input_group_id uuid,
  input_user_id uuid,
  audit_request_id uuid default null
)
returns table (group_id uuid, user_id uuid, status text)
language plpgsql
security definer
set search_path = ''
as $function$
#variable_conflict use_variable
declare
  actor_id uuid := private.assert_fan_actor();
  actor_role public.group_role;
  target_membership public.group_memberships%rowtype;
begin
  if actor_id = input_user_id then
    raise exception using errcode = 'P0001', message = 'NOT_ALLOWED';
  end if;

  select membership.role
  into actor_role
  from public.group_memberships as membership
  join public.groups as supporter_group on supporter_group.id = membership.group_id
  where membership.group_id = input_group_id
    and membership.user_id = actor_id
    and membership.status = 'active'
    and membership.role in ('owner', 'admin')
    and supporter_group.lifecycle not in ('suspended', 'archived');

  if not found then
    raise exception using errcode = 'P0001', message = 'NOT_ALLOWED';
  end if;

  select membership.*
  into target_membership
  from public.group_memberships as membership
  where membership.group_id = input_group_id
    and membership.user_id = input_user_id
  for update;

  if not found
    or target_membership.status <> 'active'
    or target_membership.role = 'owner'
    or (actor_role = 'admin' and target_membership.role <> 'member') then
    raise exception using errcode = 'P0001', message = 'NOT_ALLOWED';
  end if;

  update public.group_memberships as membership
  set
    role = 'member',
    status = 'left',
    reviewed_by = actor_id,
    reviewed_at = statement_timestamp()
  where membership.group_id = input_group_id
    and membership.user_id = input_user_id;

  perform private.write_security_audit(
    actor_id,
    'group.membership.remove',
    'group',
    input_group_id,
    'succeeded',
    audit_request_id,
    jsonb_build_object('subject_id', input_user_id)
  );

  return query select input_group_id, input_user_id, 'left'::text;
end;
$function$;

comment on function public.remove_group_member(uuid, uuid, uuid) is
  'Ends a non-owner active membership without creating a ban; retained state may later be renewed by application.';

alter function public.list_attention_items(integer) rename to list_attention_items_without_group_invitations;
alter function public.list_attention_items_without_group_invitations(integer) set schema private;
revoke all on function private.list_attention_items_without_group_invitations(integer)
from public, anon, authenticated;

create function public.list_attention_items(input_limit integer default 10)
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
    select existing.*
    from private.list_attention_items_without_group_invitations(50) as existing

    union all

    select
      'group_invitation:' || invitation.id::text,
      'group_invitation'::text,
      supporter_group.id,
      '/dashboard#group-invitations',
      'Group invitation'::text,
      inviter.display_name || ' invited you to ' || supporter_group.name || '.',
      invitation.created_at
    from public.group_invitations as invitation
    join public.groups as supporter_group on supporter_group.id = invitation.group_id
    join public.profiles as inviter on inviter.id = invitation.invited_by
    where invitation.invitee_id = actor_id
      and invitation.status = 'pending'
      and supporter_group.lifecycle in ('forming', 'active')
      and supporter_group.suspended_at is null
      and private.profile_is_fan_eligible(actor_id)
      and not private.users_are_blocked(actor_id, invitation.invited_by)
      and not private.users_are_blocked(actor_id, supporter_group.owner_id)
      and not exists (
        select 1
        from public.group_bans as ban
        where ban.group_id = invitation.group_id
          and ban.user_id = actor_id
          and ban.revoked_at is null
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
  'Returns the current bounded action queue, including recipient-bound group invitations, without exposing private messages, tokens, or locations.';

revoke all on function public.create_group_invitation(uuid, uuid, uuid) from public, anon;
revoke all on function public.list_my_group_invitations() from public, anon;
revoke all on function public.list_group_direct_invitations(uuid, integer, integer) from public, anon;
revoke all on function public.respond_group_invitation(uuid, text, uuid) from public, anon;
revoke all on function public.revoke_group_invitation(uuid, uuid) from public, anon;
revoke all on function public.remove_group_member(uuid, uuid, uuid) from public, anon;
revoke all on function public.list_attention_items(integer) from public, anon;

grant execute on function public.create_group_invitation(uuid, uuid, uuid) to authenticated;
grant execute on function public.list_my_group_invitations() to authenticated;
grant execute on function public.list_group_direct_invitations(uuid, integer, integer) to authenticated;
grant execute on function public.respond_group_invitation(uuid, text, uuid) to authenticated;
grant execute on function public.revoke_group_invitation(uuid, uuid) to authenticated;
grant execute on function public.remove_group_member(uuid, uuid, uuid) to authenticated;
grant execute on function public.list_attention_items(integer) to authenticated;
