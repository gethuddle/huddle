begin;

create index security_audit_group_application_cooldown_idx
  on public.security_audit_events (actor_id, created_at desc)
  where action = 'group.application.submit';

create index security_audit_group_invite_cooldown_idx
  on public.security_audit_events (actor_id, resource_id, created_at desc)
  where action = 'group.invite.create';

create index group_memberships_pending_queue_idx
  on public.group_memberships (group_id, status, updated_at, user_id)
  where status = 'pending';

alter table public.group_rules
  drop constraint group_rules_group_position_key;

alter table public.group_rules
  add constraint group_rules_group_position_key
  unique (group_id, position)
  deferrable initially immediate;

create or replace function private.lock_group_application_actor(input_actor_id uuid)
returns void
language sql
volatile
set search_path = ''
as $function$
  select pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'huddle:group-application:' || input_actor_id::text,
      0
    )
  );
$function$;

comment on function private.lock_group_application_actor(uuid) is
  'Serializes one actor across discoverable and invite-backed group applications so the durable cooldown cannot race.';

drop function public.get_group_by_slug(text);

create function public.get_group_by_slug(lookup_slug text)
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
        and supporter_group.lifecycle in ('forming', 'active')
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
  where (
      supporter_group.visibility = 'discoverable'
      and supporter_group.lifecycle = 'active'
    )
    or supporter_group.viewer_is_member
    or (
      supporter_group.visibility = 'discoverable'
      and supporter_group.lifecycle = 'forming'
      and supporter_group.viewer_is_eligible
      and not supporter_group.viewer_is_banned
      and not supporter_group.viewer_blocks_owner
    );
$function$;

comment on function public.get_group_by_slug(text) is
  'Returns an active discoverable safe summary publicly, a forming discoverable application summary to eligible direct-link viewers, or protected state to active non-banned members.';

create or replace function public.apply_to_group(
  input_group_id uuid,
  input_message text,
  audit_request_id uuid default null
)
returns table (group_id uuid, status text)
language plpgsql
security definer
set search_path = ''
as $function$
#variable_conflict use_variable
declare
  actor_id uuid := private.assert_actor(true);
  normalized_message text := nullif(btrim(input_message), '');
  target_group public.groups%rowtype;
  existing_membership public.group_memberships%rowtype;
begin
  if normalized_message is not null and char_length(normalized_message) > 1000 then
    raise exception using errcode = 'P0001', message = 'VALIDATION_FAILED';
  end if;

  perform private.lock_group_application_actor(actor_id);

  select supporter_group.*
  into target_group
  from public.groups as supporter_group
  where supporter_group.id = input_group_id
  for share;

  if not found
    or target_group.visibility <> 'discoverable'
    or target_group.lifecycle not in ('forming', 'active') then
    raise exception using errcode = 'P0001', message = 'NOT_FOUND';
  end if;

  if private.users_are_blocked(actor_id, target_group.owner_id) then
    raise exception using errcode = 'P0001', message = 'BLOCKED_RELATIONSHIP';
  end if;

  if exists (
    select 1
    from public.group_bans as ban
    where ban.group_id = input_group_id
      and ban.user_id = actor_id
      and ban.revoked_at is null
  ) then
    raise exception using errcode = 'P0001', message = 'GROUP_BANNED';
  end if;

  select membership.*
  into existing_membership
  from public.group_memberships as membership
  where membership.group_id = input_group_id
    and membership.user_id = actor_id
  for update;

  if found and existing_membership.status in ('pending', 'active') then
    raise exception using errcode = 'P0001', message = 'INVALID_TRANSITION';
  end if;

  if exists (
    select 1
    from public.security_audit_events as audit
    where audit.actor_id = actor_id
      and audit.action = 'group.application.submit'
      and audit.created_at > statement_timestamp() - interval '10 seconds'
  ) then
    raise exception using errcode = 'P0001', message = 'RATE_LIMITED';
  end if;

  if existing_membership.group_id is null then
    insert into public.group_memberships (
      group_id,
      user_id,
      role,
      status,
      application_message,
      invite_id,
      reviewed_by,
      reviewed_at
    )
    values (
      input_group_id,
      actor_id,
      'member',
      'pending',
      normalized_message,
      null,
      null,
      null
    );
  else
    update public.group_memberships as membership
    set
      role = 'member',
      status = 'pending',
      application_message = normalized_message,
      invite_id = null,
      reviewed_by = null,
      reviewed_at = null
    where membership.group_id = input_group_id
      and membership.user_id = actor_id;
  end if;

  perform private.write_security_audit(
    actor_id,
    'group.application.submit',
    'group',
    input_group_id,
    'succeeded',
    audit_request_id,
    jsonb_build_object('source', 'discoverable')
  );

  return query select input_group_id, 'pending'::text;
end;
$function$;

comment on function public.apply_to_group(uuid, text, uuid) is
  'Creates or renews one serialized pending discoverable-group application after complete-account, owner-block, ban, duplicate, and cooldown checks.';

create or replace function public.review_group_membership(
  input_group_id uuid,
  input_user_id uuid,
  input_decision text,
  audit_request_id uuid default null
)
returns table (group_id uuid, user_id uuid, status text)
language plpgsql
security definer
set search_path = ''
as $function$
#variable_conflict use_variable
declare
  actor_id uuid := private.assert_actor(true);
  target_group public.groups%rowtype;
  target_membership public.group_memberships%rowtype;
  next_status public.group_membership_status;
begin
  if input_decision not in ('approve', 'reject') then
    raise exception using errcode = 'P0001', message = 'VALIDATION_FAILED';
  end if;

  select supporter_group.*
  into target_group
  from public.groups as supporter_group
  where supporter_group.id = input_group_id
  for share;

  if not found or target_group.lifecycle in ('suspended', 'archived') then
    raise exception using errcode = 'P0001', message = 'NOT_FOUND';
  end if;

  if not private.actor_is_group_admin(input_group_id, actor_id) then
    raise exception using errcode = 'P0001', message = 'NOT_ALLOWED';
  end if;

  select membership.*
  into target_membership
  from public.group_memberships as membership
  where membership.group_id = input_group_id
    and membership.user_id = input_user_id
  for update;

  if not found or target_membership.status <> 'pending' then
    raise exception using errcode = 'P0001', message = 'INVALID_TRANSITION';
  end if;

  if input_decision = 'approve' then
    if not private.profile_is_community_eligible(input_user_id) then
      raise exception using errcode = 'P0001', message = 'NOT_ALLOWED';
    end if;

    if private.users_are_blocked(input_user_id, target_group.owner_id) then
      raise exception using errcode = 'P0001', message = 'BLOCKED_RELATIONSHIP';
    end if;

    if exists (
      select 1
      from public.group_bans as ban
      where ban.group_id = input_group_id
        and ban.user_id = input_user_id
        and ban.revoked_at is null
    ) then
      raise exception using errcode = 'P0001', message = 'GROUP_BANNED';
    end if;
  end if;

  next_status := case
    when input_decision = 'approve' then 'active'::public.group_membership_status
    else 'rejected'::public.group_membership_status
  end;

  update public.group_memberships as membership
  set
    role = 'member',
    status = next_status,
    reviewed_by = actor_id,
    reviewed_at = statement_timestamp()
  where membership.group_id = input_group_id
    and membership.user_id = input_user_id;

  perform private.write_security_audit(
    actor_id,
    'group.membership.' || input_decision,
    'group',
    input_group_id,
    'succeeded',
    audit_request_id,
    jsonb_build_object('subject_id', input_user_id, 'status', next_status::text)
  );

  return query select input_group_id, input_user_id, next_status::text;
end;
$function$;

comment on function public.review_group_membership(uuid, uuid, text, uuid) is
  'Lets an active owner/admin approve or reject only a pending application, with current eligibility and ban checks on approval.';

create or replace function public.leave_group(
  input_group_id uuid,
  audit_request_id uuid default null
)
returns table (group_id uuid, status text)
language plpgsql
security definer
set search_path = ''
as $function$
#variable_conflict use_variable
declare
  actor_id uuid := private.assert_actor(false);
  actor_membership public.group_memberships%rowtype;
begin
  select membership.*
  into actor_membership
  from public.group_memberships as membership
  where membership.group_id = input_group_id
    and membership.user_id = actor_id
  for update;

  if not found or actor_membership.status <> 'active' then
    raise exception using errcode = 'P0001', message = 'INVALID_TRANSITION';
  end if;

  if actor_membership.role = 'owner' then
    raise exception using errcode = 'P0001', message = 'GROUP_OWNER_REQUIRED';
  end if;

  update public.group_memberships as membership
  set role = 'member', status = 'left'
  where membership.group_id = input_group_id
    and membership.user_id = actor_id;

  perform private.write_security_audit(
    actor_id,
    'group.membership.leave',
    'group',
    input_group_id,
    'succeeded',
    audit_request_id,
    '{}'::jsonb
  );

  return query select input_group_id, 'left'::text;
end;
$function$;

comment on function public.leave_group(uuid, uuid) is
  'Transitions a non-owner active membership to durable left state without deleting its history.';

create or replace function public.list_group_applications(
  input_group_id uuid,
  input_offset integer default 0,
  input_limit integer default 20
)
returns table (
  user_id uuid,
  handle text,
  display_name text,
  application_message text,
  application_source text,
  applied_at timestamptz,
  total_count bigint
)
language plpgsql
security definer
stable
set search_path = ''
as $function$
#variable_conflict use_variable
declare
  actor_id uuid := private.assert_actor(true);
  bounded_offset integer := greatest(coalesce(input_offset, 0), 0);
  bounded_limit integer := least(greatest(coalesce(input_limit, 20), 1), 50);
begin
  if not private.actor_is_group_admin(input_group_id, actor_id) then
    raise exception using errcode = 'P0001', message = 'NOT_FOUND';
  end if;

  return query
  select
    membership.user_id,
    profile.handle,
    profile.display_name,
    membership.application_message,
    case when membership.invite_id is null then 'discoverable' else 'invite' end,
    membership.updated_at,
    count(*) over ()
  from public.group_memberships as membership
  join public.profiles as profile on profile.id = membership.user_id
  where membership.group_id = input_group_id
    and membership.status = 'pending'
  order by membership.updated_at, membership.user_id
  offset bounded_offset
  limit bounded_limit;
end;
$function$;

comment on function public.list_group_applications(uuid, integer, integer) is
  'Returns a bounded admin-only application queue with safe profile identity and private application text.';

create or replace function private.hash_group_invite_token(input_token text)
returns text
language sql
immutable
strict
set search_path = ''
as $function$
  select pg_catalog.encode(
    pg_catalog.sha256(pg_catalog.convert_to(input_token, 'UTF8')),
    'hex'
  );
$function$;

comment on function private.hash_group_invite_token(text) is
  'Hashes a transient high-entropy group invite token with SHA-256; only the digest is persisted.';

create or replace function private.lock_group_invite_creator(
  input_actor_id uuid,
  input_group_id uuid
)
returns void
language sql
volatile
set search_path = ''
as $function$
  select pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'huddle:group-invite:' || input_actor_id::text || ':' || input_group_id::text,
      0
    )
  );
$function$;

comment on function private.lock_group_invite_creator(uuid, uuid) is
  'Serializes invite creation per actor and group so the durable abuse cooldown cannot race.';

create or replace function public.create_group_invite(
  input_group_id uuid,
  input_token_hash text,
  input_expires_at timestamptz,
  input_max_uses integer,
  audit_request_id uuid default null
)
returns table (
  invite_id uuid,
  expires_at timestamptz,
  max_uses integer,
  use_count integer,
  revoked_at timestamptz,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $function$
#variable_conflict use_variable
declare
  actor_id uuid := private.assert_actor(true);
  target_group public.groups%rowtype;
  created_invite public.group_invite_tokens%rowtype;
begin
  if input_token_hash !~ '^[0-9a-f]{64}$'
    or input_expires_at < statement_timestamp() + interval '5 minutes'
    or input_expires_at > statement_timestamp() + interval '30 days'
    or input_max_uses not between 1 and 100 then
    raise exception using errcode = 'P0001', message = 'VALIDATION_FAILED';
  end if;

  perform private.lock_group_invite_creator(actor_id, input_group_id);

  select supporter_group.*
  into target_group
  from public.groups as supporter_group
  where supporter_group.id = input_group_id
  for share;

  if not found
    or target_group.visibility <> 'unlisted'
    or target_group.lifecycle <> 'active' then
    raise exception using errcode = 'P0001', message = 'NOT_FOUND';
  end if;

  if not private.actor_is_group_admin(input_group_id, actor_id) then
    raise exception using errcode = 'P0001', message = 'NOT_ALLOWED';
  end if;

  if exists (
    select 1
    from public.security_audit_events as audit
    where audit.actor_id = actor_id
      and audit.action = 'group.invite.create'
      and audit.resource_id = input_group_id
      and audit.created_at > statement_timestamp() - interval '10 seconds'
  ) then
    raise exception using errcode = 'P0001', message = 'RATE_LIMITED';
  end if;

  insert into public.group_invite_tokens (
    group_id,
    token_hash,
    created_by,
    expires_at,
    max_uses
  )
  values (
    input_group_id,
    input_token_hash,
    actor_id,
    input_expires_at,
    input_max_uses
  )
  returning * into created_invite;

  perform private.write_security_audit(
    actor_id,
    'group.invite.create',
    'group',
    input_group_id,
    'succeeded',
    audit_request_id,
    jsonb_build_object('max_uses', input_max_uses, 'expires_at', input_expires_at)
  );

  return query
  select
    created_invite.id,
    created_invite.expires_at,
    created_invite.max_uses,
    created_invite.use_count,
    created_invite.revoked_at,
    created_invite.created_at;
end;
$function$;

comment on function public.create_group_invite(uuid, text, timestamptz, integer, uuid) is
  'Stores only a server-generated token digest for an active unlisted group and returns bounded non-secret metadata.';

create or replace function public.get_group_invite_preview(input_token text)
returns table (
  group_id uuid,
  slug text,
  name text,
  viewer_membership_status text
)
language plpgsql
security definer
stable
set search_path = ''
as $function$
#variable_conflict use_variable
declare
  actor_id uuid := private.assert_actor(true);
  invite_row record;
  current_membership_status public.group_membership_status;
begin
  if input_token !~ '^[A-Za-z0-9_-]{43}$' then
    raise exception using errcode = 'P0001', message = 'INVITE_INVALID';
  end if;

  select
    invite.id,
    invite.group_id,
    invite.created_by,
    invite.expires_at,
    invite.max_uses,
    invite.use_count,
    invite.revoked_at,
    supporter_group.slug,
    supporter_group.name,
    supporter_group.owner_id,
    supporter_group.visibility,
    supporter_group.lifecycle
  into invite_row
  from public.group_invite_tokens as invite
  join public.groups as supporter_group on supporter_group.id = invite.group_id
  where invite.token_hash = private.hash_group_invite_token(input_token);

  if not found
    or invite_row.revoked_at is not null
    or invite_row.use_count >= invite_row.max_uses
    or invite_row.visibility <> 'unlisted'
    or invite_row.lifecycle <> 'active' then
    raise exception using errcode = 'P0001', message = 'INVITE_INVALID';
  end if;

  if invite_row.expires_at <= statement_timestamp() then
    raise exception using errcode = 'P0001', message = 'INVITE_EXPIRED';
  end if;

  if private.users_are_blocked(actor_id, invite_row.owner_id)
    or private.users_are_blocked(actor_id, invite_row.created_by) then
    raise exception using errcode = 'P0001', message = 'BLOCKED_RELATIONSHIP';
  end if;

  if exists (
    select 1
    from public.group_bans as ban
    where ban.group_id = invite_row.group_id
      and ban.user_id = actor_id
      and ban.revoked_at is null
  ) then
    raise exception using errcode = 'P0001', message = 'GROUP_BANNED';
  end if;

  select membership.status
  into current_membership_status
  from public.group_memberships as membership
  where membership.group_id = invite_row.group_id
    and membership.user_id = actor_id;

  return query
  select
    invite_row.group_id,
    invite_row.slug,
    invite_row.name,
    current_membership_status::text;
end;
$function$;

comment on function public.get_group_invite_preview(text) is
  'Validates an unlisted invite for a complete viewer and returns only the minimum safe group identity and current own status.';

create or replace function public.consume_group_invite(
  input_token text,
  input_message text,
  audit_request_id uuid default null
)
returns table (group_id uuid, slug text, status text)
language plpgsql
security definer
set search_path = ''
as $function$
#variable_conflict use_variable
declare
  actor_id uuid := private.assert_actor(true);
  normalized_message text := nullif(btrim(input_message), '');
  invite_row record;
  existing_membership public.group_memberships%rowtype;
begin
  if input_token !~ '^[A-Za-z0-9_-]{43}$' then
    raise exception using errcode = 'P0001', message = 'INVITE_INVALID';
  end if;

  if normalized_message is not null and char_length(normalized_message) > 1000 then
    raise exception using errcode = 'P0001', message = 'VALIDATION_FAILED';
  end if;

  perform private.lock_group_application_actor(actor_id);

  select
    invite.id,
    invite.group_id,
    invite.created_by,
    invite.expires_at,
    invite.max_uses,
    invite.use_count,
    invite.revoked_at,
    supporter_group.slug,
    supporter_group.owner_id,
    supporter_group.visibility,
    supporter_group.lifecycle
  into invite_row
  from public.group_invite_tokens as invite
  join public.groups as supporter_group on supporter_group.id = invite.group_id
  where invite.token_hash = private.hash_group_invite_token(input_token)
  for update of invite;

  if not found
    or invite_row.revoked_at is not null
    or invite_row.use_count >= invite_row.max_uses
    or invite_row.visibility <> 'unlisted'
    or invite_row.lifecycle <> 'active' then
    raise exception using errcode = 'P0001', message = 'INVITE_INVALID';
  end if;

  if invite_row.expires_at <= statement_timestamp() then
    raise exception using errcode = 'P0001', message = 'INVITE_EXPIRED';
  end if;

  if private.users_are_blocked(actor_id, invite_row.owner_id)
    or private.users_are_blocked(actor_id, invite_row.created_by) then
    raise exception using errcode = 'P0001', message = 'BLOCKED_RELATIONSHIP';
  end if;

  if exists (
    select 1
    from public.group_bans as ban
    where ban.group_id = invite_row.group_id
      and ban.user_id = actor_id
      and ban.revoked_at is null
  ) then
    raise exception using errcode = 'P0001', message = 'GROUP_BANNED';
  end if;

  select membership.*
  into existing_membership
  from public.group_memberships as membership
  where membership.group_id = invite_row.group_id
    and membership.user_id = actor_id
  for update;

  if found and existing_membership.status in ('pending', 'active') then
    raise exception using errcode = 'P0001', message = 'INVALID_TRANSITION';
  end if;

  if exists (
    select 1
    from public.security_audit_events as audit
    where audit.actor_id = actor_id
      and audit.action = 'group.application.submit'
      and audit.created_at > statement_timestamp() - interval '10 seconds'
  ) then
    raise exception using errcode = 'P0001', message = 'RATE_LIMITED';
  end if;

  if existing_membership.group_id is null then
    insert into public.group_memberships (
      group_id,
      user_id,
      role,
      status,
      application_message,
      invite_id,
      reviewed_by,
      reviewed_at
    )
    values (
      invite_row.group_id,
      actor_id,
      'member',
      'pending',
      normalized_message,
      invite_row.id,
      null,
      null
    );
  else
    update public.group_memberships as membership
    set
      role = 'member',
      status = 'pending',
      application_message = normalized_message,
      invite_id = invite_row.id,
      reviewed_by = null,
      reviewed_at = null
    where membership.group_id = invite_row.group_id
      and membership.user_id = actor_id;
  end if;

  update public.group_invite_tokens as invite
  set use_count = invite.use_count + 1
  where invite.id = invite_row.id;

  perform private.write_security_audit(
    actor_id,
    'group.application.submit',
    'group',
    invite_row.group_id,
    'succeeded',
    audit_request_id,
    jsonb_build_object('source', 'invite')
  );

  return query select invite_row.group_id, invite_row.slug, 'pending'::text;
end;
$function$;

comment on function public.consume_group_invite(text, text, uuid) is
  'Atomically locks and consumes one valid invite use into pending membership; it never activates the applicant.';

create or replace function public.revoke_group_invite(
  input_invite_id uuid,
  audit_request_id uuid default null
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $function$
#variable_conflict use_variable
declare
  actor_id uuid := private.assert_actor(true);
  invite_row public.group_invite_tokens%rowtype;
begin
  select invite.*
  into invite_row
  from public.group_invite_tokens as invite
  where invite.id = input_invite_id
  for update;

  if not found or not private.actor_is_group_admin(invite_row.group_id, actor_id) then
    raise exception using errcode = 'P0001', message = 'NOT_FOUND';
  end if;

  if invite_row.revoked_at is not null then
    return false;
  end if;

  update public.group_invite_tokens as invite
  set revoked_at = statement_timestamp()
  where invite.id = input_invite_id;

  perform private.write_security_audit(
    actor_id,
    'group.invite.revoke',
    'group',
    invite_row.group_id,
    'succeeded',
    audit_request_id,
    '{}'::jsonb
  );

  return true;
end;
$function$;

comment on function public.revoke_group_invite(uuid, uuid) is
  'Revokes invite metadata without deleting it or ever returning its digest.';

create or replace function public.list_group_invites(
  input_group_id uuid,
  input_offset integer default 0,
  input_limit integer default 20
)
returns table (
  invite_id uuid,
  creator_handle text,
  expires_at timestamptz,
  max_uses integer,
  use_count integer,
  revoked_at timestamptz,
  invite_status text,
  created_at timestamptz,
  total_count bigint
)
language plpgsql
security definer
stable
set search_path = ''
as $function$
#variable_conflict use_variable
declare
  actor_id uuid := private.assert_actor(true);
  bounded_offset integer := greatest(coalesce(input_offset, 0), 0);
  bounded_limit integer := least(greatest(coalesce(input_limit, 20), 1), 50);
begin
  if not private.actor_is_group_admin(input_group_id, actor_id) then
    raise exception using errcode = 'P0001', message = 'NOT_FOUND';
  end if;

  return query
  select
    invite.id,
    profile.handle,
    invite.expires_at,
    invite.max_uses,
    invite.use_count,
    invite.revoked_at,
    case
      when invite.revoked_at is not null then 'revoked'
      when invite.expires_at <= statement_timestamp() then 'expired'
      when invite.use_count >= invite.max_uses then 'exhausted'
      else 'active'
    end,
    invite.created_at,
    count(*) over ()
  from public.group_invite_tokens as invite
  join public.profiles as profile on profile.id = invite.created_by
  where invite.group_id = input_group_id
  order by invite.created_at desc, invite.id
  offset bounded_offset
  limit bounded_limit;
end;
$function$;

comment on function public.list_group_invites(uuid, integer, integer) is
  'Returns bounded admin-only invite metadata without token digests or recoverable plaintext.';

create or replace function public.list_group_admin_members(
  input_group_id uuid,
  input_offset integer default 0,
  input_limit integer default 20
)
returns table (
  user_id uuid,
  handle text,
  display_name text,
  role text,
  member_since timestamptz,
  total_count bigint
)
language plpgsql
security definer
stable
set search_path = ''
as $function$
#variable_conflict use_variable
declare
  actor_id uuid := private.assert_actor(true);
  bounded_offset integer := greatest(coalesce(input_offset, 0), 0);
  bounded_limit integer := least(greatest(coalesce(input_limit, 20), 1), 50);
begin
  if not private.actor_is_group_admin(input_group_id, actor_id) then
    raise exception using errcode = 'P0001', message = 'NOT_FOUND';
  end if;

  return query
  select
    membership.user_id,
    profile.handle,
    profile.display_name,
    membership.role::text,
    coalesce(membership.reviewed_at, membership.created_at),
    count(*) over ()
  from public.group_memberships as membership
  join public.profiles as profile on profile.id = membership.user_id
  where membership.group_id = input_group_id
    and membership.status = 'active'
  order by
    case membership.role when 'owner' then 0 when 'admin' then 1 else 2 end,
    membership.updated_at,
    membership.user_id
  offset bounded_offset
  limit bounded_limit;
end;
$function$;

comment on function public.list_group_admin_members(uuid, integer, integer) is
  'Returns a bounded safe active-member roster to current group administrators for role and ban controls.';

create or replace function public.change_group_member_role(
  input_group_id uuid,
  input_user_id uuid,
  input_role text,
  audit_request_id uuid default null
)
returns table (group_id uuid, user_id uuid, role text)
language plpgsql
security definer
set search_path = ''
as $function$
#variable_conflict use_variable
declare
  actor_id uuid := private.assert_actor(true);
  actor_role public.group_role;
  target_membership public.group_memberships%rowtype;
  next_role public.group_role;
begin
  if input_role not in ('admin', 'member') then
    raise exception using errcode = 'P0001', message = 'VALIDATION_FAILED';
  end if;

  select membership.role
  into actor_role
  from public.group_memberships as membership
  join public.groups as supporter_group on supporter_group.id = membership.group_id
  where membership.group_id = input_group_id
    and membership.user_id = actor_id
    and membership.status = 'active'
    and supporter_group.lifecycle not in ('suspended', 'archived');

  if not found or actor_role <> 'owner' then
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
    or target_membership.role = 'owner' then
    raise exception using errcode = 'P0001', message = 'INVALID_TRANSITION';
  end if;

  next_role := input_role::public.group_role;
  if target_membership.role = next_role then
    raise exception using errcode = 'P0001', message = 'INVALID_TRANSITION';
  end if;

  update public.group_memberships as membership
  set role = next_role
  where membership.group_id = input_group_id
    and membership.user_id = input_user_id;

  perform private.write_security_audit(
    actor_id,
    'group.membership.role_change',
    'group',
    input_group_id,
    'succeeded',
    audit_request_id,
    jsonb_build_object('subject_id', input_user_id, 'role', next_role::text)
  );

  return query select input_group_id, input_user_id, next_role::text;
end;
$function$;

comment on function public.change_group_member_role(uuid, uuid, text, uuid) is
  'Lets only the active owner promote or demote a non-owner active member while preserving the sole-owner invariant.';

create or replace function public.ban_group_member(
  input_group_id uuid,
  input_user_id uuid,
  input_reason text,
  audit_request_id uuid default null
)
returns table (group_id uuid, user_id uuid, status text)
language plpgsql
security definer
set search_path = ''
as $function$
#variable_conflict use_variable
declare
  actor_id uuid := private.assert_actor(true);
  actor_role public.group_role;
  target_membership public.group_memberships%rowtype;
  normalized_reason text := btrim(input_reason);
begin
  if char_length(normalized_reason) not between 3 and 500 then
    raise exception using errcode = 'P0001', message = 'VALIDATION_FAILED';
  end if;

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
    or target_membership.status not in ('pending', 'active')
    or target_membership.role = 'owner'
    or (actor_role = 'admin' and target_membership.role <> 'member') then
    raise exception using errcode = 'P0001', message = 'NOT_ALLOWED';
  end if;

  insert into public.group_bans (
    group_id,
    user_id,
    banned_by,
    reason,
    created_at,
    revoked_by,
    revoked_at
  )
  values (
    input_group_id,
    input_user_id,
    actor_id,
    normalized_reason,
    statement_timestamp(),
    null,
    null
  )
  on conflict on constraint group_bans_pkey do update
  set
    banned_by = excluded.banned_by,
    reason = excluded.reason,
    created_at = excluded.created_at,
    revoked_by = null,
    revoked_at = null;

  update public.group_memberships as membership
  set
    role = 'member',
    status = 'banned',
    reviewed_by = actor_id,
    reviewed_at = statement_timestamp()
  where membership.group_id = input_group_id
    and membership.user_id = input_user_id;

  perform private.write_security_audit(
    actor_id,
    'group.membership.ban',
    'group',
    input_group_id,
    'succeeded',
    audit_request_id,
    jsonb_build_object('subject_id', input_user_id)
  );

  return query select input_group_id, input_user_id, 'banned'::text;
end;
$function$;

comment on function public.ban_group_member(uuid, uuid, text, uuid) is
  'Bans a pending applicant or active member under the owner/admin hierarchy and atomically removes protected group access.';

create or replace function public.unban_group_member(
  input_group_id uuid,
  input_user_id uuid,
  audit_request_id uuid default null
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $function$
#variable_conflict use_variable
declare
  actor_id uuid := private.assert_actor(true);
  active_ban public.group_bans%rowtype;
begin
  if not private.actor_is_group_admin(input_group_id, actor_id) then
    raise exception using errcode = 'P0001', message = 'NOT_ALLOWED';
  end if;

  select ban.*
  into active_ban
  from public.group_bans as ban
  where ban.group_id = input_group_id
    and ban.user_id = input_user_id
  for update;

  if not found or active_ban.revoked_at is not null then
    raise exception using errcode = 'P0001', message = 'INVALID_TRANSITION';
  end if;

  update public.group_bans as ban
  set revoked_by = actor_id, revoked_at = statement_timestamp()
  where ban.group_id = input_group_id
    and ban.user_id = input_user_id;

  perform private.write_security_audit(
    actor_id,
    'group.membership.unban',
    'group',
    input_group_id,
    'succeeded',
    audit_request_id,
    jsonb_build_object('subject_id', input_user_id)
  );

  return true;
end;
$function$;

comment on function public.unban_group_member(uuid, uuid, uuid) is
  'Revokes a durable group ban without restoring membership; the user must submit a fresh pending application.';

create or replace function public.list_group_bans(
  input_group_id uuid,
  input_offset integer default 0,
  input_limit integer default 20
)
returns table (
  user_id uuid,
  handle text,
  display_name text,
  reason text,
  banned_by_handle text,
  banned_at timestamptz,
  total_count bigint
)
language plpgsql
security definer
stable
set search_path = ''
as $function$
#variable_conflict use_variable
declare
  actor_id uuid := private.assert_actor(true);
  bounded_offset integer := greatest(coalesce(input_offset, 0), 0);
  bounded_limit integer := least(greatest(coalesce(input_limit, 20), 1), 50);
begin
  if not private.actor_is_group_admin(input_group_id, actor_id) then
    raise exception using errcode = 'P0001', message = 'NOT_FOUND';
  end if;

  return query
  select
    ban.user_id,
    target.handle,
    target.display_name,
    ban.reason,
    banning_actor.handle,
    ban.created_at,
    count(*) over ()
  from public.group_bans as ban
  join public.profiles as target on target.id = ban.user_id
  join public.profiles as banning_actor on banning_actor.id = ban.banned_by
  where ban.group_id = input_group_id
    and ban.revoked_at is null
  order by ban.created_at desc, ban.user_id
  offset bounded_offset
  limit bounded_limit;
end;
$function$;

comment on function public.list_group_bans(uuid, integer, integer) is
  'Returns bounded active-ban metadata only to current group administrators.';

create or replace function public.create_group_rule(
  input_group_id uuid,
  input_text text,
  input_publish boolean default false,
  audit_request_id uuid default null
)
returns table (
  rule_id uuid,
  rule_position integer,
  rule_text text,
  published_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $function$
#variable_conflict use_variable
declare
  actor_id uuid := private.assert_actor(true);
  normalized_text text := btrim(input_text);
  next_position integer;
  created_rule public.group_rules%rowtype;
begin
  if char_length(normalized_text) not between 1 and 500 then
    raise exception using errcode = 'P0001', message = 'VALIDATION_FAILED';
  end if;

  if not private.actor_is_group_admin(input_group_id, actor_id)
    or not exists (
      select 1 from public.groups as supporter_group
      where supporter_group.id = input_group_id
        and supporter_group.lifecycle not in ('suspended', 'archived')
    ) then
    raise exception using errcode = 'P0001', message = 'NOT_ALLOWED';
  end if;

  perform 1
  from public.groups as supporter_group
  where supporter_group.id = input_group_id
  for update;

  select coalesce(max(rule.position), 0) + 1
  into next_position
  from public.group_rules as rule
  where rule.group_id = input_group_id;

  if next_position > 100 then
    raise exception using errcode = 'P0001', message = 'VALIDATION_FAILED';
  end if;

  insert into public.group_rules (group_id, position, text, published_at)
  values (
    input_group_id,
    next_position,
    normalized_text,
    case when input_publish then statement_timestamp() else null end
  )
  returning * into created_rule;

  perform private.write_security_audit(
    actor_id,
    'group.rule.create',
    'group',
    input_group_id,
    'succeeded',
    audit_request_id,
    jsonb_build_object('rule_id', created_rule.id, 'published', input_publish)
  );

  return query
  select created_rule.id, created_rule.position, created_rule.text, created_rule.published_at;
end;
$function$;

comment on function public.create_group_rule(uuid, text, boolean, uuid) is
  'Creates one bounded plain-text rule at the end of the ordered admin-managed list.';

create or replace function public.update_group_rule(
  input_rule_id uuid,
  input_text text,
  input_published boolean,
  audit_request_id uuid default null
)
returns table (
  rule_id uuid,
  rule_position integer,
  rule_text text,
  published_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $function$
#variable_conflict use_variable
declare
  actor_id uuid := private.assert_actor(true);
  normalized_text text := btrim(input_text);
  target_rule public.group_rules%rowtype;
begin
  if char_length(normalized_text) not between 1 and 500 then
    raise exception using errcode = 'P0001', message = 'VALIDATION_FAILED';
  end if;

  select rule.*
  into target_rule
  from public.group_rules as rule
  where rule.id = input_rule_id
  for update;

  if not found
    or not private.actor_is_group_admin(target_rule.group_id, actor_id)
    or not exists (
      select 1 from public.groups as supporter_group
      where supporter_group.id = target_rule.group_id
        and supporter_group.lifecycle not in ('suspended', 'archived')
    ) then
    raise exception using errcode = 'P0001', message = 'NOT_ALLOWED';
  end if;

  update public.group_rules as rule
  set
    text = normalized_text,
    published_at = case
      when input_published then coalesce(rule.published_at, statement_timestamp())
      else null
    end
  where rule.id = input_rule_id
  returning * into target_rule;

  perform private.write_security_audit(
    actor_id,
    'group.rule.update',
    'group',
    target_rule.group_id,
    'succeeded',
    audit_request_id,
    jsonb_build_object('rule_id', target_rule.id, 'published', input_published)
  );

  return query
  select target_rule.id, target_rule.position, target_rule.text, target_rule.published_at;
end;
$function$;

comment on function public.update_group_rule(uuid, text, boolean, uuid) is
  'Updates bounded rule text and its explicit publication state through an admin-only transition.';

create or replace function public.reorder_group_rules(
  input_group_id uuid,
  input_rule_ids uuid[],
  audit_request_id uuid default null
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $function$
#variable_conflict use_variable
declare
  actor_id uuid := private.assert_actor(true);
  supplied_count integer := coalesce(cardinality(input_rule_ids), 0);
  distinct_count integer;
  stored_count integer;
begin
  if supplied_count not between 1 and 100
    or array_position(input_rule_ids, null) is not null then
    raise exception using errcode = 'P0001', message = 'VALIDATION_FAILED';
  end if;

  if not private.actor_is_group_admin(input_group_id, actor_id) then
    raise exception using errcode = 'P0001', message = 'NOT_ALLOWED';
  end if;

  perform 1
  from public.groups as supporter_group
  where supporter_group.id = input_group_id
    and supporter_group.lifecycle not in ('suspended', 'archived')
  for update;

  if not found then
    raise exception using errcode = 'P0001', message = 'NOT_ALLOWED';
  end if;

  select count(distinct supplied.rule_id)
  into distinct_count
  from unnest(input_rule_ids) as supplied(rule_id);

  select count(*)
  into stored_count
  from public.group_rules as rule
  where rule.group_id = input_group_id;

  if distinct_count <> supplied_count
    or stored_count <> supplied_count
    or exists (
      select 1
      from unnest(input_rule_ids) as supplied(rule_id)
      where not exists (
        select 1
        from public.group_rules as rule
        where rule.group_id = input_group_id
          and rule.id = supplied.rule_id
      )
    ) then
    raise exception using errcode = 'P0001', message = 'VALIDATION_FAILED';
  end if;

  set constraints public.group_rules_group_position_key deferred;

  update public.group_rules as rule
  set position = supplied.rule_position::integer
  from unnest(input_rule_ids) with ordinality as supplied(rule_id, rule_position)
  where rule.group_id = input_group_id
    and rule.id = supplied.rule_id;

  set constraints public.group_rules_group_position_key immediate;

  perform private.write_security_audit(
    actor_id,
    'group.rule.reorder',
    'group',
    input_group_id,
    'succeeded',
    audit_request_id,
    jsonb_build_object('rule_count', supplied_count)
  );

  return true;
end;
$function$;

comment on function public.reorder_group_rules(uuid, uuid[], uuid) is
  'Atomically reorders the exact current rule set under a deferred per-group position constraint.';

create or replace function public.list_group_rules(
  input_group_id uuid,
  input_offset integer default 0,
  input_limit integer default 20
)
returns table (
  rule_id uuid,
  rule_position integer,
  rule_text text,
  published_at timestamptz,
  total_count bigint
)
language plpgsql
security definer
stable
set search_path = ''
as $function$
#variable_conflict use_variable
declare
  actor_id uuid := auth.uid();
  target_group public.groups%rowtype;
  viewer_is_admin boolean;
  viewer_can_read boolean;
  bounded_offset integer := greatest(coalesce(input_offset, 0), 0);
  bounded_limit integer := least(greatest(coalesce(input_limit, 20), 1), 100);
begin
  select supporter_group.*
  into target_group
  from public.groups as supporter_group
  where supporter_group.id = input_group_id;

  if not found then
    raise exception using errcode = 'P0001', message = 'NOT_FOUND';
  end if;

  viewer_is_admin := private.actor_is_group_admin(input_group_id, actor_id);
  viewer_can_read :=
    (target_group.visibility = 'discoverable' and target_group.lifecycle = 'active')
    or private.actor_is_active_group_member(input_group_id, actor_id)
    or (
      target_group.visibility = 'discoverable'
      and target_group.lifecycle = 'forming'
      and private.profile_is_community_eligible(actor_id)
      and not private.users_are_blocked(actor_id, target_group.owner_id)
      and not exists (
        select 1 from public.group_bans as ban
        where ban.group_id = input_group_id
          and ban.user_id = actor_id
          and ban.revoked_at is null
      )
    );

  if not viewer_can_read then
    raise exception using errcode = 'P0001', message = 'NOT_FOUND';
  end if;

  return query
  select
    rule.id,
    rule.position,
    rule.text,
    rule.published_at,
    count(*) over ()
  from public.group_rules as rule
  where rule.group_id = input_group_id
    and (viewer_is_admin or rule.published_at is not null)
  order by rule.position, rule.id
  offset bounded_offset
  limit bounded_limit;
end;
$function$;

comment on function public.list_group_rules(uuid, integer, integer) is
  'Returns published rules to visible viewers and includes drafts only for active group administrators.';

drop policy group_rules_read_visible on public.group_rules;

create policy group_rules_read_visible
on public.group_rules
for select
to anon, authenticated
using (
  private.actor_is_group_admin(group_id, auth.uid())
  or (
    published_at is not null
    and exists (
      select 1
      from public.groups as supporter_group
      where supporter_group.id = group_rules.group_id
        and (
          (supporter_group.visibility = 'discoverable' and supporter_group.lifecycle = 'active')
          or private.actor_is_active_group_member(supporter_group.id, auth.uid())
        )
    )
  )
);

revoke all on function private.lock_group_application_actor(uuid) from public, anon, authenticated;
revoke all on function private.hash_group_invite_token(text) from public, anon, authenticated;
revoke all on function private.lock_group_invite_creator(uuid, uuid) from public, anon, authenticated;
revoke all on function public.get_group_by_slug(text) from public;
revoke all on function public.apply_to_group(uuid, text, uuid) from public, anon;
revoke all on function public.review_group_membership(uuid, uuid, text, uuid) from public, anon;
revoke all on function public.leave_group(uuid, uuid) from public, anon;
revoke all on function public.list_group_applications(uuid, integer, integer) from public, anon;
revoke all on function public.create_group_invite(uuid, text, timestamptz, integer, uuid) from public, anon;
revoke all on function public.get_group_invite_preview(text) from public, anon;
revoke all on function public.consume_group_invite(text, text, uuid) from public, anon;
revoke all on function public.revoke_group_invite(uuid, uuid) from public, anon;
revoke all on function public.list_group_invites(uuid, integer, integer) from public, anon;
revoke all on function public.list_group_admin_members(uuid, integer, integer) from public, anon;
revoke all on function public.change_group_member_role(uuid, uuid, text, uuid) from public, anon;
revoke all on function public.ban_group_member(uuid, uuid, text, uuid) from public, anon;
revoke all on function public.unban_group_member(uuid, uuid, uuid) from public, anon;
revoke all on function public.list_group_bans(uuid, integer, integer) from public, anon;
revoke all on function public.create_group_rule(uuid, text, boolean, uuid) from public, anon;
revoke all on function public.update_group_rule(uuid, text, boolean, uuid) from public, anon;
revoke all on function public.reorder_group_rules(uuid, uuid[], uuid) from public, anon;
revoke all on function public.list_group_rules(uuid, integer, integer) from public;

grant execute on function public.get_group_by_slug(text) to anon, authenticated;
grant execute on function public.apply_to_group(uuid, text, uuid) to authenticated;
grant execute on function public.review_group_membership(uuid, uuid, text, uuid) to authenticated;
grant execute on function public.leave_group(uuid, uuid) to authenticated;
grant execute on function public.list_group_applications(uuid, integer, integer) to authenticated;
grant execute on function public.create_group_invite(uuid, text, timestamptz, integer, uuid) to authenticated;
grant execute on function public.get_group_invite_preview(text) to authenticated;
grant execute on function public.consume_group_invite(text, text, uuid) to authenticated;
grant execute on function public.revoke_group_invite(uuid, uuid) to authenticated;
grant execute on function public.list_group_invites(uuid, integer, integer) to authenticated;
grant execute on function public.list_group_admin_members(uuid, integer, integer) to authenticated;
grant execute on function public.change_group_member_role(uuid, uuid, text, uuid) to authenticated;
grant execute on function public.ban_group_member(uuid, uuid, text, uuid) to authenticated;
grant execute on function public.unban_group_member(uuid, uuid, uuid) to authenticated;
grant execute on function public.list_group_bans(uuid, integer, integer) to authenticated;
grant execute on function public.create_group_rule(uuid, text, boolean, uuid) to authenticated;
grant execute on function public.update_group_rule(uuid, text, boolean, uuid) to authenticated;
grant execute on function public.reorder_group_rules(uuid, uuid[], uuid) to authenticated;
grant execute on function public.list_group_rules(uuid, integer, integer) to anon, authenticated;

commit;
