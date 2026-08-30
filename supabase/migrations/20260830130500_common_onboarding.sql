begin;

create or replace function private.serialize_actor_transaction()
returns uuid
language plpgsql
security definer
volatile
set search_path = ''
as $function$
declare
  actor_id uuid := auth.uid();
begin
  if actor_id is null then
    raise exception using errcode = 'P0001', message = 'AUTH_REQUIRED';
  end if;

  -- Every write that can transition this actor's profile begins with the same
  -- transaction-scoped token. The key comes only from the authenticated JWT;
  -- callers cannot choose another profile to lock. Hash collisions merely
  -- serialize unrelated actors briefly and cannot grant authority.
  if current_setting('transaction_read_only') <> 'on' then
    perform pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended(actor_id::text, 4104)
    );
  end if;

  return actor_id;
end;
$function$;

comment on function private.serialize_actor_transaction() is
  'Acquires the shared transaction-scoped serialization token derived only from the authenticated actor id.';

revoke all on function private.serialize_actor_transaction()
  from public, anon, authenticated;

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
  'Serializes same-actor write transactions before the reusable verified, suspension, restriction, and optional complete-profile gate.';

-- These authenticated projections invoke lock-capable actor assertions.
-- Mark their public wrappers volatile so PostgREST does not place RPC calls
-- in a read-only transaction.
alter function public.get_venue_workspace(uuid) volatile;
alter function public.list_venue_calendar(uuid, integer) volatile;
alter function public.get_venue_for_management(text) volatile;
alter function public.list_owned_venues(integer, integer) volatile;
alter function public.list_managed_venue_events(uuid, integer) volatile;
alter function public.list_my_huddle_events(integer, integer) volatile;
alter function public.suggest_similar_groups(text, uuid, uuid, integer) volatile;
alter function public.list_friendships(text, integer, integer) volatile;
alter function public.list_safe_group_members(uuid, integer, integer) volatile;
alter function public.get_group_invite_preview(text) volatile;
alter function public.list_group_applications(uuid, integer, integer) volatile;
alter function public.list_group_invites(uuid, integer, integer) volatile;
alter function public.list_group_admin_members(uuid, integer, integer) volatile;
alter function public.list_group_bans(uuid, integer, integer) volatile;
alter function public.list_group_event_submissions(uuid, integer, integer) volatile;
alter function public.list_my_event_participation(integer, integer) volatile;
alter function public.search_people(text, integer, integer) volatile;
alter function public.list_my_groups(integer, integer) volatile;
alter function public.request_context(uuid, uuid) volatile;
alter function public.list_event_invitations(uuid, integer, integer) volatile;
alter function public.list_event_attendance(uuid, integer, integer) volatile;
alter function public.list_approved_event_attendees(uuid, integer, integer) volatile;

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

  -- Common onboarding is the only writer in this path, so it acquires UPDATE
  -- mode directly rather than upgrading assert_actor's shared lock.
  select profile.*
  into actor_profile
  from public.profiles as profile
  where profile.id = actor_id
  for update;

  if not found then
    raise exception using errcode = 'P0001', message = 'PROFILE_INCOMPLETE';
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
  'Serializes one verified active actor common-rules write and locks its profile directly in update mode.';

revoke all on function private.assert_common_onboarding_actor()
  from public, anon, authenticated;

create or replace function public.accept_common_onboarding(
  input_adult_attested boolean,
  input_rules_version integer
)
returns table (
  adult_attested_at timestamptz,
  rules_version integer,
  rules_accepted_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $function$
declare
  actor_id uuid := private.assert_common_onboarding_actor();
  current_version integer := private.current_rules_version();
begin
  if input_adult_attested is distinct from true then
    raise exception using errcode = 'P0001', message = 'ADULT_ATTESTATION_REQUIRED';
  end if;
  if input_rules_version is distinct from current_version then
    raise exception using errcode = 'P0001', message = 'RULES_ACCEPTANCE_REQUIRED';
  end if;

  update public.profiles as profile
  set adult_attested_at = coalesce(profile.adult_attested_at, statement_timestamp()),
      rules_version = current_version,
      rules_accepted_at = case
        when profile.rules_version = current_version and profile.rules_accepted_at is not null
          then profile.rules_accepted_at
        else statement_timestamp()
      end
  where profile.id = actor_id;

  return query
  select profile.adult_attested_at, profile.rules_version, profile.rules_accepted_at
  from public.profiles as profile
  where profile.id = actor_id;
end;
$function$;

comment on function public.accept_common_onboarding(boolean, integer) is
  'Records only verified adult/current-rules common safety acceptance. It does not publish Fan identity or create a Venue workspace.';

revoke all on function public.accept_common_onboarding(boolean, integer)
  from public, anon;
grant execute on function public.accept_common_onboarding(boolean, integer)
  to authenticated;

create or replace function public.list_my_workspace_recovery()
returns table (
  workspace_kind text,
  workspace_id uuid,
  slug text,
  name text,
  role text
)
language sql
security definer
stable
set search_path = ''
as $function$
  with recoverable_actor as (
    select profile.id
    from public.profiles as profile
    join auth.users as auth_user on auth_user.id = profile.id
    where profile.id = auth.uid()
      and auth_user.email_confirmed_at is not null
      and profile.suspended_at is null
      and profile.community_restricted_at is null
  )
  select
    'fan'::text,
    profile.id,
    profile.handle,
    profile.display_name,
    'fan'::text
  from recoverable_actor as actor
  join public.profiles as profile on profile.id = actor.id
  where profile.fan_enabled_at is not null
    and profile.profile_completed_at is not null
    and profile.handle is not null
    and profile.display_name is not null
    and profile.city_id is not null

  union all

  select
    'venue'::text,
    venue.id,
    venue.slug,
    venue.name,
    membership.role::text
  from recoverable_actor as actor
  join public.venue_memberships as membership on membership.user_id = actor.id
  join public.venues as venue on venue.id = membership.venue_id
  where membership.status = 'active'
    and membership.revoked_at is null
    and membership.role in ('owner', 'admin')
    and venue.verification_status <> 'suspended'
    and venue.suspended_at is null
  order by 1, 4, 2;
$function$;

comment on function public.list_my_workspace_recovery() is
  'Returns only the verified active actor existing Fan identity and active Venue memberships while common rules are stale; it grants no workspace authority.';

revoke all on function public.list_my_workspace_recovery()
  from public, anon;
grant execute on function public.list_my_workspace_recovery()
  to authenticated;

commit;
