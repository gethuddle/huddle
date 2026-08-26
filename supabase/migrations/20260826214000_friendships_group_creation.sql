begin;

create type public.friendship_status as enum ('pending', 'accepted', 'declined');
create type public.group_visibility as enum ('discoverable', 'unlisted');
create type public.group_lifecycle as enum ('forming', 'active', 'suspended', 'archived');
create type public.group_role as enum ('owner', 'admin', 'member');
create type public.group_membership_status as enum (
  'pending',
  'active',
  'rejected',
  'left',
  'banned'
);

create table public.friendships (
  id uuid primary key default gen_random_uuid(),
  user_low_id uuid not null references public.profiles(id) on delete cascade,
  user_high_id uuid not null references public.profiles(id) on delete cascade,
  requested_by uuid not null references public.profiles(id) on delete cascade,
  status public.friendship_status not null default 'pending',
  responded_at timestamptz,
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  constraint friendships_canonical_pair_check check (user_low_id < user_high_id),
  constraint friendships_requester_in_pair_check check (
    requested_by = user_low_id or requested_by = user_high_id
  ),
  constraint friendships_response_state_check check (
    (status = 'pending' and responded_at is null)
    or (status in ('accepted', 'declined') and responded_at is not null)
  ),
  constraint friendships_pair_key unique (user_low_id, user_high_id)
);

comment on table public.friendships is
  'One canonical direct-friendship row per unordered profile pair; no graph expansion is exposed.';

create index friendships_user_low_status_updated_idx
  on public.friendships (user_low_id, status, updated_at desc, id);
create index friendships_user_high_status_updated_idx
  on public.friendships (user_high_id, status, updated_at desc, id);
create index friendships_requester_status_created_idx
  on public.friendships (requested_by, status, created_at desc);
create index security_audit_friendship_request_cooldown_idx
  on public.security_audit_events (actor_id, created_at desc)
  where action = 'friendship.request';

create trigger friendships_set_updated_at
before update on public.friendships
for each row execute function private.set_updated_at();

create table public.groups (
  id uuid primary key default gen_random_uuid(),
  slug text not null,
  name text not null,
  owner_id uuid not null references public.profiles(id) on delete restrict,
  team_id uuid references public.teams(id) on delete restrict,
  city_id uuid not null references public.cities(id) on delete restrict,
  visibility public.group_visibility not null,
  lifecycle public.group_lifecycle not null,
  description text,
  activated_at timestamptz,
  suspended_at timestamptz,
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  constraint groups_slug_format_check check (
    slug = lower(slug)
    and char_length(slug) between 3 and 60
    and slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'
  ),
  constraint groups_name_length_check check (
    name = btrim(name)
    and char_length(name) between 3 and 80
  ),
  constraint groups_description_length_check check (
    description is null
    or (
      description = btrim(description)
      and char_length(description) between 1 and 2000
    )
  ),
  constraint groups_lifecycle_timestamp_check check (
    (lifecycle = 'forming' and activated_at is null and suspended_at is null)
    or (lifecycle = 'active' and activated_at is not null and suspended_at is null)
    or (lifecycle = 'suspended' and suspended_at is not null)
    or lifecycle = 'archived'
  )
);

comment on table public.groups is
  'Supporter-group identity and lifecycle. Discoverable groups remain forming until every later discovery gate passes.';

create unique index groups_slug_lower_uidx on public.groups (lower(slug));
create index groups_visibility_lifecycle_city_idx
  on public.groups (visibility, lifecycle, city_id);
create index groups_team_city_idx on public.groups (team_id, city_id);
create index groups_owner_id_idx on public.groups (owner_id);
create index groups_name_trgm_idx
  on public.groups using gin (lower(name) extensions.gin_trgm_ops);

create trigger groups_set_updated_at
before update on public.groups
for each row execute function private.set_updated_at();

create table public.group_invite_tokens (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups(id) on delete cascade,
  token_hash text not null unique,
  created_by uuid not null references public.profiles(id) on delete restrict,
  expires_at timestamptz not null,
  max_uses integer not null,
  use_count integer not null default 0,
  revoked_at timestamptz,
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  constraint group_invite_tokens_id_group_key unique (id, group_id),
  constraint group_invite_tokens_hash_check check (token_hash ~ '^[0-9a-f]{64}$'),
  constraint group_invite_tokens_expiry_check check (expires_at > created_at),
  constraint group_invite_tokens_use_limit_check check (
    max_uses between 1 and 1000
    and use_count between 0 and max_uses
  ),
  constraint group_invite_tokens_revocation_check check (
    revoked_at is null or revoked_at >= created_at
  )
);

comment on table public.group_invite_tokens is
  'Invite metadata stores only a SHA-256 token digest; raw invite tokens are never recoverable.';

create index group_invite_tokens_group_created_idx
  on public.group_invite_tokens (group_id, created_at desc);
create index group_invite_tokens_active_expiry_idx
  on public.group_invite_tokens (group_id, expires_at)
  where revoked_at is null;

create trigger group_invite_tokens_set_updated_at
before update on public.group_invite_tokens
for each row execute function private.set_updated_at();

create table public.group_memberships (
  group_id uuid not null references public.groups(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role public.group_role not null default 'member',
  status public.group_membership_status not null default 'pending',
  application_message text,
  invite_id uuid,
  reviewed_by uuid references public.profiles(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  primary key (group_id, user_id),
  constraint group_memberships_invite_group_fkey
    foreign key (invite_id, group_id)
    references public.group_invite_tokens(id, group_id)
    on delete set null (invite_id),
  constraint group_memberships_application_length_check check (
    application_message is null
    or (
      application_message = btrim(application_message)
      and char_length(application_message) between 1 and 1000
    )
  ),
  constraint group_memberships_review_pair_check check (
    (reviewed_by is null and reviewed_at is null)
    or (reviewed_by is not null and reviewed_at is not null)
  ),
  constraint group_memberships_role_status_check check (
    status = 'active' or role = 'member'
  )
);

comment on table public.group_memberships is
  'Durable group applications and memberships. Direct reads never expose another applicant message to ordinary members.';

create unique index group_memberships_one_active_owner_uidx
  on public.group_memberships (group_id)
  where role = 'owner' and status = 'active';
create index group_memberships_group_status_role_idx
  on public.group_memberships (group_id, status, role);
create index group_memberships_user_status_idx
  on public.group_memberships (user_id, status, updated_at desc);
create index group_memberships_reviewer_reviewed_idx
  on public.group_memberships (reviewed_by, reviewed_at desc)
  where reviewed_by is not null;

create trigger group_memberships_set_updated_at
before update on public.group_memberships
for each row execute function private.set_updated_at();

create table public.group_rules (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups(id) on delete cascade,
  position integer not null,
  text text not null,
  published_at timestamptz,
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  constraint group_rules_position_check check (position between 1 and 100),
  constraint group_rules_text_length_check check (
    text = btrim(text)
    and char_length(text) between 1 and 500
  ),
  constraint group_rules_group_position_key unique (group_id, position)
);

comment on table public.group_rules is
  'Ordered plain-text supporter-group rules; publication is controlled by later group-administration functions.';

create index group_rules_group_published_idx
  on public.group_rules (group_id, published_at, position);

create trigger group_rules_set_updated_at
before update on public.group_rules
for each row execute function private.set_updated_at();

create table public.group_bans (
  group_id uuid not null references public.groups(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  banned_by uuid not null references public.profiles(id) on delete restrict,
  reason text not null,
  created_at timestamptz not null default statement_timestamp(),
  revoked_by uuid references public.profiles(id) on delete set null,
  revoked_at timestamptz,
  primary key (group_id, user_id),
  constraint group_bans_reason_length_check check (
    reason = btrim(reason)
    and char_length(reason) between 3 and 500
  ),
  constraint group_bans_revocation_pair_check check (
    (revoked_by is null and revoked_at is null)
    or (revoked_by is not null and revoked_at is not null)
  )
);

comment on table public.group_bans is
  'Durable group ban state. Active bans have no revocation timestamp and deny content and applications.';

create index group_bans_active_group_idx
  on public.group_bans (group_id, created_at desc)
  where revoked_at is null;

create or replace function private.profile_is_community_eligible(target_profile_id uuid)
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
      and profile.handle is not null
      and profile.display_name is not null
      and profile.city_id is not null
      and profile.adult_attested_at is not null
      and profile.rules_version = private.current_rules_version()
      and profile.rules_accepted_at is not null
      and profile.profile_completed_at is not null
      and profile.suspended_at is null
  );
$function$;

comment on function private.profile_is_community_eligible(uuid) is
  'Checks the complete current-rules community gate for a target profile without exposing profile or Auth rows.';

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
      join public.profiles as profile on profile.id = membership.user_id
      where membership.group_id = input_group_id
        and membership.user_id = input_actor_id
        and membership.status = 'active'
        and profile.suspended_at is null
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
  'Checks active, non-banned, non-suspended group membership for policies and projections.';

create or replace function private.actor_is_group_admin(
  input_group_id uuid,
  input_actor_id uuid
)
returns boolean
language sql
security definer
stable
set search_path = ''
as $function$
  select private.actor_is_active_group_member(input_group_id, input_actor_id)
    and exists (
      select 1
      from public.group_memberships as membership
      where membership.group_id = input_group_id
        and membership.user_id = input_actor_id
        and membership.status = 'active'
        and membership.role in ('owner', 'admin')
    );
$function$;

comment on function private.actor_is_group_admin(uuid, uuid) is
  'Checks the bounded owner/admin relationship without recursive membership-table policies.';

create or replace function private.enforce_group_owner_invariant()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  target_group_id uuid;
  expected_owner_id uuid;
  active_owner_count bigint;
  matching_owner_count bigint;
begin
  target_group_id := coalesce(
    (to_jsonb(new) ->> 'group_id')::uuid,
    (to_jsonb(old) ->> 'group_id')::uuid,
    (to_jsonb(new) ->> 'id')::uuid,
    (to_jsonb(old) ->> 'id')::uuid
  );

  select supporter_group.owner_id
  into expected_owner_id
  from public.groups as supporter_group
  where supporter_group.id = target_group_id;

  if not found then
    return null;
  end if;

  select
    count(*) filter (where membership.role = 'owner' and membership.status = 'active'),
    count(*) filter (
      where membership.role = 'owner'
        and membership.status = 'active'
        and membership.user_id = expected_owner_id
    )
  into active_owner_count, matching_owner_count
  from public.group_memberships as membership
  where membership.group_id = target_group_id;

  if active_owner_count <> 1 or matching_owner_count <> 1 then
    raise exception using errcode = 'P0001', message = 'GROUP_OWNER_REQUIRED';
  end if;

  return null;
end;
$function$;

comment on function private.enforce_group_owner_invariant() is
  'Deferred invariant: every persisted group has exactly one active owner matching groups.owner_id.';

create constraint trigger group_memberships_owner_invariant
after insert or update or delete on public.group_memberships
deferrable initially deferred
for each row execute function private.enforce_group_owner_invariant();

create constraint trigger groups_owner_invariant
after insert or update on public.groups
deferrable initially deferred
for each row execute function private.enforce_group_owner_invariant();

drop function public.get_public_profile_by_handle(text);

create or replace function public.get_public_profile_by_handle(lookup_handle text)
returns table (
  handle text,
  display_name text,
  city_name text,
  bio text,
  member_since timestamptz,
  viewer_has_blocked boolean,
  friendship_id uuid,
  friendship_status text,
  friendship_direction text
)
language sql
security definer
stable
set search_path = ''
as $function$
  select
    profile.handle,
    profile.display_name,
    city.name_en,
    profile.bio,
    profile.created_at,
    coalesce(
      exists (
        select 1
        from public.user_blocks as block
        where block.blocker_id = auth.uid()
          and block.blocked_id = profile.id
      ),
      false
    ),
    friendship.id,
    friendship.status::text,
    case
      when friendship.status = 'accepted' then 'accepted'
      when friendship.requested_by = auth.uid() then 'outgoing'
      when friendship.id is not null then 'incoming'
      else null
    end
  from public.profiles as profile
  join public.cities as city on city.id = profile.city_id
  left join lateral (
    select relation.id, relation.status, relation.requested_by
    from public.friendships as relation
    where auth.uid() is not null
      and relation.status in ('pending', 'accepted')
      and relation.user_low_id = least(auth.uid(), profile.id)
      and relation.user_high_id = greatest(auth.uid(), profile.id)
    limit 1
  ) as friendship on true
  where profile.handle = lower(btrim(lookup_handle))
    and profile.profile_completed_at is not null
    and profile.suspended_at is null
    and city.active;
$function$;

comment on function public.get_public_profile_by_handle(text) is
  'Returns the safe public profile DTO plus only the current viewer own block and direct friendship state.';

create or replace function private.lock_direct_user_pair(
  first_user_id uuid,
  second_user_id uuid
)
returns void
language sql
volatile
set search_path = ''
as $function$
  select pg_advisory_xact_lock(
    hashtextextended(
      'huddle:direct-user-pair:'
        || least(first_user_id, second_user_id)::text
        || ':'
        || greatest(first_user_id, second_user_id)::text,
      0
    )
  );
$function$;

comment on function private.lock_direct_user_pair(uuid, uuid) is
  'Serializes block and friendship mutations for one canonical unordered user pair until transaction end.';

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

  if exists (
    select 1
    from public.friendships as relation
    where relation.user_low_id = pair_low_id
      and relation.user_high_id = pair_high_id
  ) then
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
  'Serializes per requester and canonical pair, then inserts one pending direct friendship after complete-account, block, duplicate, and cooldown checks.';

create or replace function public.request_friendship_by_handle(
  target_handle text,
  audit_request_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $function$
declare
  target_user_id uuid;
begin
  select profile.id
  into target_user_id
  from public.profiles as profile
  where profile.handle = lower(btrim(target_handle))
    and profile.profile_completed_at is not null
    and profile.suspended_at is null;

  if target_user_id is null then
    raise exception using errcode = 'P0001', message = 'NOT_FOUND';
  end if;

  return public.request_friendship(target_user_id, audit_request_id);
end;
$function$;

comment on function public.request_friendship_by_handle(text, uuid) is
  'Resolves a safe public handle inside the database before invoking the canonical friendship request function.';

create or replace function public.respond_to_friendship(
  input_friendship_id uuid,
  input_decision text,
  audit_request_id uuid default null
)
returns text
language plpgsql
security definer
set search_path = ''
as $function$
declare
  actor_id uuid := private.assert_actor(true);
  relation public.friendships%rowtype;
  other_user_id uuid;
  next_status public.friendship_status;
begin
  if input_decision not in ('accept', 'decline') then
    raise exception using errcode = 'P0001', message = 'VALIDATION_FAILED';
  end if;

  select friendship.*
  into relation
  from public.friendships as friendship
  where friendship.id = input_friendship_id
    and actor_id in (friendship.user_low_id, friendship.user_high_id)
  for update;

  if not found then
    raise exception using errcode = 'P0001', message = 'NOT_FOUND';
  end if;

  if relation.status <> 'pending' then
    raise exception using errcode = 'P0001', message = 'INVALID_TRANSITION';
  end if;

  if relation.requested_by = actor_id then
    raise exception using errcode = 'P0001', message = 'NOT_ALLOWED';
  end if;

  other_user_id := case
    when relation.user_low_id = actor_id then relation.user_high_id
    else relation.user_low_id
  end;

  if input_decision = 'accept' then
    if not private.profile_is_community_eligible(other_user_id) then
      raise exception using errcode = 'P0001', message = 'INVALID_TRANSITION';
    end if;

    if private.users_are_blocked(actor_id, other_user_id) then
      raise exception using errcode = 'P0001', message = 'BLOCKED_RELATIONSHIP';
    end if;

    next_status := 'accepted';
  else
    next_status := 'declined';
  end if;

  update public.friendships as friendship
  set status = next_status,
      responded_at = statement_timestamp()
  where friendship.id = relation.id;

  perform private.write_security_audit(
    actor_id,
    'friendship.respond',
    'friendship',
    relation.id,
    'succeeded',
    audit_request_id,
    jsonb_build_object('decision', input_decision)
  );

  return next_status::text;
end;
$function$;

comment on function public.respond_to_friendship(uuid, text, uuid) is
  'Allows only the pending-request recipient to accept or decline one direct friendship.';

create or replace function public.remove_friendship(
  input_friendship_id uuid,
  audit_request_id uuid default null
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $function$
declare
  actor_id uuid := private.assert_actor(true);
  removed_id uuid;
begin
  delete from public.friendships as friendship
  where friendship.id = input_friendship_id
    and actor_id in (friendship.user_low_id, friendship.user_high_id)
  returning friendship.id into removed_id;

  if removed_id is null then
    raise exception using errcode = 'P0001', message = 'NOT_FOUND';
  end if;

  perform private.write_security_audit(
    actor_id,
    'friendship.remove',
    'friendship',
    removed_id,
    'succeeded',
    audit_request_id,
    '{}'::jsonb
  );

  return true;
end;
$function$;

comment on function public.remove_friendship(uuid, uuid) is
  'Allows either direct participant to remove a pending, declined, or accepted pair without graph side effects.';

create or replace function public.list_friendships(
  input_bucket text,
  input_offset integer default 0,
  input_limit integer default 20
)
returns table (
  friendship_id uuid,
  status text,
  direction text,
  other_handle text,
  other_display_name text,
  other_city_name text,
  requested_at timestamptz,
  responded_at timestamptz,
  total_count bigint
)
language plpgsql
security definer
stable
set search_path = ''
as $function$
declare
  actor_id uuid := private.assert_actor(true);
  bounded_offset integer := greatest(coalesce(input_offset, 0), 0);
  bounded_limit integer := least(greatest(coalesce(input_limit, 20), 1), 50);
begin
  if input_bucket not in ('incoming', 'outgoing', 'accepted') then
    raise exception using errcode = 'P0001', message = 'VALIDATION_FAILED';
  end if;

  return query
  with visible_relations as (
    select
      friendship.*,
      case
        when friendship.user_low_id = actor_id then friendship.user_high_id
        else friendship.user_low_id
      end as other_user_id,
      case
        when friendship.status = 'accepted' then 'accepted'
        when friendship.requested_by = actor_id then 'outgoing'
        else 'incoming'
      end as relation_direction
    from public.friendships as friendship
    where actor_id in (friendship.user_low_id, friendship.user_high_id)
      and (
        (input_bucket = 'accepted' and friendship.status = 'accepted')
        or (
          input_bucket = 'incoming'
          and friendship.status = 'pending'
          and friendship.requested_by <> actor_id
        )
        or (
          input_bucket = 'outgoing'
          and friendship.status = 'pending'
          and friendship.requested_by = actor_id
        )
      )
  )
  select
    relation.id,
    relation.status::text,
    relation.relation_direction,
    profile.handle,
    profile.display_name,
    city.name_en,
    relation.created_at,
    relation.responded_at,
    count(*) over ()
  from visible_relations as relation
  join public.profiles as profile on profile.id = relation.other_user_id
  join public.cities as city on city.id = profile.city_id
  where not private.users_are_blocked(actor_id, relation.other_user_id)
  order by relation.updated_at desc, relation.id desc
  offset bounded_offset
  limit bounded_limit;
end;
$function$;

comment on function public.list_friendships(text, integer, integer) is
  'Returns one bounded incoming, outgoing, or accepted direct-friendship page with safe counterpart fields only.';

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

  if inserted_rows = 1 or removed_friendships > 0 then
    perform private.write_security_audit(
      actor_id,
      'user.block',
      'profile',
      target_id,
      'succeeded',
      audit_request_id,
      jsonb_build_object('friendship_removed', removed_friendships > 0)
    );
  end if;

  -- Future home-event attendance and private-location revocation extend this
  -- same transaction when those tables arrive in their owning milestone.
  return inserted_rows = 1;
end;
$function$;

comment on function public.block_user(text, uuid) is
  'Serializes the canonical pair, creates a private directional block, atomically removes the direct friendship, and writes minimal audit evidence.';

create or replace function public.create_group(
  input_name text,
  input_slug text,
  input_city_id uuid,
  input_team_id uuid,
  input_visibility text,
  input_description text,
  audit_request_id uuid default null
)
returns table (group_id uuid, slug text, lifecycle text)
language plpgsql
security definer
set search_path = ''
as $function$
declare
  actor_id uuid := private.assert_actor(true);
  normalized_name text := btrim(input_name);
  normalized_slug text := lower(btrim(input_slug));
  normalized_description text := nullif(btrim(input_description), '');
  selected_visibility public.group_visibility;
  initial_lifecycle public.group_lifecycle;
  created_group_id uuid;
begin
  if char_length(normalized_name) not between 3 and 80
    or normalized_slug !~ '^[a-z0-9]+(-[a-z0-9]+)*$'
    or char_length(normalized_slug) not between 3 and 60
    or (normalized_description is not null and char_length(normalized_description) > 2000) then
    raise exception using errcode = 'P0001', message = 'VALIDATION_FAILED';
  end if;

  if input_visibility not in ('discoverable', 'unlisted') then
    raise exception using errcode = 'P0001', message = 'VALIDATION_FAILED';
  end if;

  selected_visibility := input_visibility::public.group_visibility;
  initial_lifecycle := case
    when selected_visibility = 'discoverable' then 'forming'::public.group_lifecycle
    else 'active'::public.group_lifecycle
  end;

  if not exists (
    select 1 from public.cities as city where city.id = input_city_id and city.active
  ) then
    raise exception using errcode = 'P0001', message = 'VALIDATION_FAILED';
  end if;

  if input_team_id is not null and not exists (
    select 1 from public.teams as team where team.id = input_team_id and team.active
  ) then
    raise exception using errcode = 'P0001', message = 'VALIDATION_FAILED';
  end if;

  insert into public.groups (
    slug,
    name,
    owner_id,
    team_id,
    city_id,
    visibility,
    lifecycle,
    description,
    activated_at
  )
  values (
    normalized_slug,
    normalized_name,
    actor_id,
    input_team_id,
    input_city_id,
    selected_visibility,
    initial_lifecycle,
    normalized_description,
    case when initial_lifecycle = 'active' then statement_timestamp() else null end
  )
  returning id into created_group_id;

  insert into public.group_memberships (
    group_id,
    user_id,
    role,
    status,
    reviewed_by,
    reviewed_at
  )
  values (
    created_group_id,
    actor_id,
    'owner',
    'active',
    actor_id,
    statement_timestamp()
  );

  perform private.write_security_audit(
    actor_id,
    'group.create',
    'group',
    created_group_id,
    'succeeded',
    audit_request_id,
    jsonb_build_object('visibility', selected_visibility::text)
  );

  return query
  select created_group_id, normalized_slug, initial_lifecycle::text;
exception
  when unique_violation then
    raise exception using errcode = 'P0001', message = 'GROUP_SLUG_UNAVAILABLE';
end;
$function$;

comment on function public.create_group(text, text, uuid, uuid, text, text, uuid) is
  'Atomically creates a forming discoverable or active unlisted group and exactly one active owner membership.';

create or replace function public.suggest_similar_groups(
  input_name text,
  input_city_id uuid,
  input_team_id uuid,
  input_limit integer default 5
)
returns table (
  group_id uuid,
  slug text,
  name text,
  lifecycle text,
  city_name text,
  team_name text,
  similarity_score real
)
language plpgsql
security definer
stable
set search_path = ''
as $function$
declare
  actor_id uuid := private.assert_actor(true);
  normalized_name text := lower(btrim(input_name));
  bounded_limit integer := least(greatest(coalesce(input_limit, 5), 1), 10);
begin
  if char_length(normalized_name) not between 3 and 80 then
    raise exception using errcode = 'P0001', message = 'VALIDATION_FAILED';
  end if;

  return query
  select
    supporter_group.id,
    supporter_group.slug,
    supporter_group.name,
    supporter_group.lifecycle::text,
    city.name_en,
    team.name,
    extensions.similarity(lower(supporter_group.name), normalized_name)::real
  from public.groups as supporter_group
  join public.cities as city on city.id = supporter_group.city_id
  left join public.teams as team on team.id = supporter_group.team_id
  where supporter_group.visibility = 'discoverable'
    and supporter_group.lifecycle in ('forming', 'active')
    and supporter_group.city_id = input_city_id
    and (
      input_team_id is null
      or supporter_group.team_id = input_team_id
    )
    and extensions.similarity(lower(supporter_group.name), normalized_name) >= 0.25
    and not exists (
      select 1
      from public.group_bans as ban
      where ban.group_id = supporter_group.id
        and ban.user_id = actor_id
        and ban.revoked_at is null
    )
  order by similarity_score desc, supporter_group.name, supporter_group.id
  limit bounded_limit;
end;
$function$;

comment on function public.suggest_similar_groups(text, uuid, uuid, integer) is
  'Returns bounded same-city/team fuzzy suggestions while never exposing another unlisted group.';

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
  can_view_member_content boolean
)
language sql
security definer
stable
set search_path = ''
as $function$
  with candidate as (
    select
      supporter_group.*,
      private.actor_is_active_group_member(supporter_group.id, auth.uid()) as viewer_is_member
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
    viewer_membership.role::text,
    coalesce(
      supporter_group.viewer_is_member
        and supporter_group.lifecycle not in ('suspended', 'archived'),
      false
    )
  from candidate as supporter_group
  join public.cities as city on city.id = supporter_group.city_id
  join public.profiles as owner_profile on owner_profile.id = supporter_group.owner_id
  left join public.teams as team on team.id = supporter_group.team_id
  left join public.group_memberships as viewer_membership
    on viewer_membership.group_id = supporter_group.id
    and viewer_membership.user_id = auth.uid()
    and viewer_membership.status = 'active'
  where (
      supporter_group.visibility = 'discoverable'
      and supporter_group.lifecycle = 'active'
    )
    or supporter_group.viewer_is_member;
$function$;

comment on function public.get_group_by_slug(text) is
  'Returns an active discoverable safe summary publicly or a forming/unlisted summary only to an active non-banned member.';

create or replace function public.list_safe_group_members(
  input_group_id uuid,
  input_offset integer default 0,
  input_limit integer default 20
)
returns table (
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
declare
  actor_id uuid := private.assert_actor(true);
  bounded_offset integer := greatest(coalesce(input_offset, 0), 0);
  bounded_limit integer := least(greatest(coalesce(input_limit, 20), 1), 50);
begin
  if not private.actor_is_active_group_member(input_group_id, actor_id) then
    raise exception using errcode = 'P0001', message = 'NOT_FOUND';
  end if;

  return query
  select
    profile.handle,
    profile.display_name,
    membership.role::text,
    membership.updated_at,
    count(*) over ()
  from public.group_memberships as membership
  join public.profiles as profile on profile.id = membership.user_id
  where membership.group_id = input_group_id
    and membership.status = 'active'
    and profile.suspended_at is null
    and not exists (
      select 1
      from public.group_bans as ban
      where ban.group_id = input_group_id
        and ban.user_id = membership.user_id
        and ban.revoked_at is null
    )
  order by
    case membership.role when 'owner' then 0 when 'admin' then 1 else 2 end,
    membership.updated_at,
    membership.user_id
  offset bounded_offset
  limit bounded_limit;
end;
$function$;

comment on function public.list_safe_group_members(uuid, integer, integer) is
  'Returns only safe active-roster fields to an active, non-banned group member; application text remains private.';

alter table public.friendships enable row level security;
alter table public.friendships force row level security;
alter table public.groups enable row level security;
alter table public.groups force row level security;
alter table public.group_rules enable row level security;
alter table public.group_rules force row level security;
alter table public.group_memberships enable row level security;
alter table public.group_memberships force row level security;
alter table public.group_invite_tokens enable row level security;
alter table public.group_invite_tokens force row level security;
alter table public.group_bans enable row level security;
alter table public.group_bans force row level security;

create policy friendships_read_pair
on public.friendships
for select
to authenticated
using (auth.uid() in (user_low_id, user_high_id));

create policy groups_read_visible
on public.groups
for select
to anon, authenticated
using (
  (visibility = 'discoverable' and lifecycle = 'active')
  or private.actor_is_active_group_member(id, auth.uid())
);

create policy group_rules_read_visible
on public.group_rules
for select
to anon, authenticated
using (
  exists (
    select 1
    from public.groups as supporter_group
    where supporter_group.id = group_rules.group_id
      and (
        (supporter_group.visibility = 'discoverable' and supporter_group.lifecycle = 'active')
        or private.actor_is_active_group_member(supporter_group.id, auth.uid())
      )
  )
);

create policy group_memberships_read_own_or_admin
on public.group_memberships
for select
to authenticated
using (
  user_id = auth.uid()
  or private.actor_is_group_admin(group_id, auth.uid())
);

revoke all on public.friendships from anon, authenticated;
revoke all on public.groups from anon, authenticated;
revoke all on public.group_rules from anon, authenticated;
revoke all on public.group_memberships from anon, authenticated;
revoke all on public.group_invite_tokens from anon, authenticated;
revoke all on public.group_bans from anon, authenticated;

grant select on public.friendships to authenticated;
grant select on public.groups to anon, authenticated;
grant select on public.group_rules to anon, authenticated;
grant select on public.group_memberships to authenticated;

revoke all on function private.profile_is_community_eligible(uuid) from public, anon, authenticated;
revoke all on function private.actor_is_active_group_member(uuid, uuid) from public, anon, authenticated;
revoke all on function private.actor_is_group_admin(uuid, uuid) from public, anon, authenticated;
revoke all on function private.enforce_group_owner_invariant() from public, anon, authenticated;

-- RLS expressions execute these SECURITY DEFINER predicates. The private schema
-- itself remains unavailable, so callers cannot invoke them through the Data API.
grant execute on function private.actor_is_active_group_member(uuid, uuid) to anon, authenticated;
grant execute on function private.actor_is_group_admin(uuid, uuid) to authenticated;

revoke all on function public.get_public_profile_by_handle(text) from public;
revoke all on function public.request_friendship(uuid, uuid) from public, anon;
revoke all on function public.request_friendship_by_handle(text, uuid) from public, anon;
revoke all on function public.respond_to_friendship(uuid, text, uuid) from public, anon;
revoke all on function public.remove_friendship(uuid, uuid) from public, anon;
revoke all on function public.list_friendships(text, integer, integer) from public, anon;
revoke all on function public.create_group(text, text, uuid, uuid, text, text, uuid) from public, anon;
revoke all on function public.suggest_similar_groups(text, uuid, uuid, integer) from public, anon;
revoke all on function public.get_group_by_slug(text) from public;
revoke all on function public.list_safe_group_members(uuid, integer, integer) from public, anon;
revoke all on function private.lock_direct_user_pair(uuid, uuid) from public, anon, authenticated;

grant execute on function public.get_public_profile_by_handle(text) to anon, authenticated;
grant execute on function public.request_friendship(uuid, uuid) to authenticated;
grant execute on function public.request_friendship_by_handle(text, uuid) to authenticated;
grant execute on function public.respond_to_friendship(uuid, text, uuid) to authenticated;
grant execute on function public.remove_friendship(uuid, uuid) to authenticated;
grant execute on function public.list_friendships(text, integer, integer) to authenticated;
grant execute on function public.create_group(text, text, uuid, uuid, text, text, uuid) to authenticated;
grant execute on function public.suggest_similar_groups(text, uuid, uuid, integer) to authenticated;
grant execute on function public.get_group_by_slug(text) to anon, authenticated;
grant execute on function public.list_safe_group_members(uuid, integer, integer) to authenticated;

commit;
