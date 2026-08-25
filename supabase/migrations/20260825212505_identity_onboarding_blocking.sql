begin;

create type public.platform_role as enum ('moderator', 'admin');

create table public.cities (
  id uuid primary key default gen_random_uuid(),
  slug extensions.citext not null unique,
  name_en text not null,
  center extensions.geography(Point, 4326) not null,
  active boolean not null default true,
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  constraint cities_slug_format_check check (
    slug::text = lower(slug::text)
    and slug::text ~ '^[a-z0-9]+(-[a-z0-9]+)*$'
  ),
  constraint cities_name_en_length_check check (
    name_en = btrim(name_en)
    and char_length(name_en) between 2 and 80
  )
);

comment on table public.cities is
  'Reviewed Israel city choices and representative PostGIS centers for onboarding and location fallback.';

create index cities_center_gist_idx on public.cities using gist (center);

create trigger cities_set_updated_at
before update on public.cities
for each row execute function private.set_updated_at();

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  handle text,
  display_name text,
  city_id uuid references public.cities(id) on delete restrict,
  bio text,
  adult_attested_at timestamptz,
  rules_version integer,
  rules_accepted_at timestamptz,
  profile_completed_at timestamptz,
  suspended_at timestamptz,
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  constraint profiles_handle_format_check check (
    handle is null
    or (
      handle = lower(handle)
      and char_length(handle) between 3 and 30
      and handle ~ '^[a-z0-9_]+$'
    )
  ),
  constraint profiles_display_name_length_check check (
    display_name is null
    or (
      display_name = btrim(display_name)
      and char_length(display_name) between 2 and 60
    )
  ),
  constraint profiles_bio_length_check check (
    bio is null
    or (
      bio = btrim(bio)
      and char_length(bio) between 1 and 500
    )
  ),
  constraint profiles_rules_acceptance_pair_check check (
    (rules_version is null and rules_accepted_at is null)
    or (rules_version > 0 and rules_accepted_at is not null)
  ),
  constraint profiles_completion_fields_check check (
    profile_completed_at is null
    or (
      handle is not null
      and display_name is not null
      and city_id is not null
      and adult_attested_at is not null
      and rules_version is not null
      and rules_accepted_at is not null
    )
  )
);

comment on table public.profiles is
  'Huddle-owned profile and trust state linked one-to-one with Supabase Auth.';
comment on column public.profiles.adult_attested_at is
  'User assertion that they are at least 18; this is not identity or age verification.';
comment on column public.profiles.profile_completed_at is
  'Derived by the controlled onboarding function after required fields are valid.';

create unique index profiles_handle_lower_uidx
  on public.profiles (lower(handle))
  where handle is not null;
create index profiles_city_id_idx on public.profiles (city_id);
create index profiles_completed_at_idx on public.profiles (profile_completed_at);
create index profiles_suspended_at_idx on public.profiles (suspended_at);

create trigger profiles_set_updated_at
before update on public.profiles
for each row execute function private.set_updated_at();

create table public.platform_roles (
  profile_id uuid not null references public.profiles(id) on delete cascade,
  role public.platform_role not null,
  created_at timestamptz not null default statement_timestamp(),
  primary key (profile_id, role)
);

comment on table public.platform_roles is
  'Explicit platform moderator/admin grants; never populated from public signup input.';

create table public.user_blocks (
  blocker_id uuid not null references public.profiles(id) on delete cascade,
  blocked_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default statement_timestamp(),
  primary key (blocker_id, blocked_id),
  constraint user_blocks_not_self_check check (blocker_id <> blocked_id)
);

comment on table public.user_blocks is
  'Private directional block records. Only the blocker may enumerate their own rows.';

create index user_blocks_blocked_blocker_idx
  on public.user_blocks (blocked_id, blocker_id);

create table public.security_audit_events (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references public.profiles(id) on delete set null,
  action text not null,
  resource_type text not null,
  resource_id uuid,
  outcome text not null,
  request_id uuid,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default statement_timestamp(),
  constraint security_audit_action_format_check check (
    char_length(action) between 3 and 80
    and action ~ '^[a-z0-9_.]+$'
  ),
  constraint security_audit_resource_type_format_check check (
    char_length(resource_type) between 3 and 80
    and resource_type ~ '^[a-z0-9_]+$'
  ),
  constraint security_audit_outcome_check check (
    outcome in ('succeeded', 'denied', 'no_change')
  ),
  constraint security_audit_metadata_object_check check (
    jsonb_typeof(metadata) = 'object'
  ),
  constraint security_audit_metadata_size_check check (
    octet_length(metadata::text) <= 2048
  ),
  constraint security_audit_metadata_safe_keys_check check (
    not (
      metadata ?| array[
        'password',
        'session',
        'cookie',
        'token',
        'invite_token',
        'provider_token',
        'address',
        'coordinates',
        'latitude',
        'longitude'
      ]
    )
  )
);

comment on table public.security_audit_events is
  'Minimal security transition evidence. Secrets, session data, and precise locations are forbidden.';

create index security_audit_actor_created_idx
  on public.security_audit_events (actor_id, created_at desc);
create index security_audit_resource_created_idx
  on public.security_audit_events (resource_type, resource_id, created_at desc);
create index security_audit_action_created_idx
  on public.security_audit_events (action, created_at desc);

create or replace function private.current_rules_version()
returns integer
language sql
immutable
set search_path = ''
as $function$
  select 1;
$function$;

comment on function private.current_rules_version() is
  'Database-side community-rules version. Update in the same migration as repository-owned rules content.';

create or replace function private.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  insert into public.profiles (id)
  values (new.id)
  on conflict (id) do nothing;

  return new;
end;
$function$;

comment on function private.handle_new_auth_user() is
  'Creates the empty Huddle profile paired with a newly inserted Supabase Auth user.';

drop trigger if exists huddle_auth_user_profile on auth.users;
create trigger huddle_auth_user_profile
after insert on auth.users
for each row execute function private.handle_new_auth_user();

insert into public.profiles (id)
select auth_user.id
from auth.users as auth_user
on conflict (id) do nothing;

create or replace function private.assert_actor(require_complete boolean)
returns uuid
language plpgsql
security definer
stable
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

  if not found then
    raise exception using errcode = 'P0001', message = 'AUTH_REQUIRED';
  end if;

  if auth_email_confirmed_at is null then
    raise exception using errcode = 'P0001', message = 'EMAIL_NOT_VERIFIED';
  end if;

  select profile.*
  into actor_profile
  from public.profiles as profile
  where profile.id = actor_id;

  if not found then
    raise exception using errcode = 'P0001', message = 'PROFILE_INCOMPLETE';
  end if;

  if actor_profile.suspended_at is not null then
    raise exception using errcode = 'P0001', message = 'ACCOUNT_SUSPENDED';
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
      or actor_profile.city_id is null
      or actor_profile.profile_completed_at is null then
      raise exception using errcode = 'P0001', message = 'PROFILE_INCOMPLETE';
    end if;
  end if;

  return actor_id;
end;
$function$;

comment on function private.assert_actor(boolean) is
  'Reusable database gate for verified, non-suspended actors and optional current profile completion.';

create or replace function private.users_are_blocked(first_user_id uuid, second_user_id uuid)
returns boolean
language sql
security definer
stable
set search_path = ''
as $function$
  select exists (
    select 1
    from public.user_blocks as block
    where (block.blocker_id = first_user_id and block.blocked_id = second_user_id)
       or (block.blocker_id = second_user_id and block.blocked_id = first_user_id)
  );
$function$;

comment on function private.users_are_blocked(uuid, uuid) is
  'Canonical bidirectional block check for future private-interaction policies and functions.';

create or replace function private.has_platform_role(
  actor_id uuid,
  accepted_roles public.platform_role[]
)
returns boolean
language sql
security definer
stable
set search_path = ''
as $function$
  select exists (
    select 1
    from public.platform_roles as platform_role
    where platform_role.profile_id = actor_id
      and platform_role.role = any (accepted_roles)
  );
$function$;

comment on function private.has_platform_role(uuid, public.platform_role[]) is
  'Answers a bounded platform-role authorization question without exposing the role table.';

create or replace function private.write_security_audit(
  audit_actor_id uuid,
  audit_action text,
  audit_resource_type text,
  audit_resource_id uuid,
  audit_outcome text,
  audit_request_id uuid,
  audit_metadata jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
begin
  insert into public.security_audit_events (
    actor_id,
    action,
    resource_type,
    resource_id,
    outcome,
    request_id,
    metadata
  )
  values (
    audit_actor_id,
    audit_action,
    audit_resource_type,
    audit_resource_id,
    audit_outcome,
    audit_request_id,
    coalesce(audit_metadata, '{}'::jsonb)
  );
end;
$function$;

comment on function private.write_security_audit(uuid, text, text, uuid, text, uuid, jsonb) is
  'Writes schema-constrained minimal security evidence from controlled functions.';

create or replace function public.complete_profile(
  input_handle text,
  input_display_name text,
  input_city_slug text,
  input_bio text,
  input_adult_attested boolean,
  input_rules_version integer
)
returns table (handle text, profile_completed_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $function$
declare
  actor_id uuid := private.assert_actor(false);
  normalized_handle text := lower(btrim(input_handle));
  normalized_display_name text := btrim(input_display_name);
  normalized_bio text := nullif(btrim(input_bio), '');
  selected_city_id uuid;
  current_version integer := private.current_rules_version();
begin
  if normalized_handle !~ '^[a-z0-9_]{3,30}$' then
    raise exception using errcode = 'P0001', message = 'VALIDATION_FAILED';
  end if;

  if char_length(normalized_display_name) not between 2 and 60 then
    raise exception using errcode = 'P0001', message = 'VALIDATION_FAILED';
  end if;

  if normalized_bio is not null and char_length(normalized_bio) > 500 then
    raise exception using errcode = 'P0001', message = 'VALIDATION_FAILED';
  end if;

  if not input_adult_attested then
    raise exception using errcode = 'P0001', message = 'ADULT_ATTESTATION_REQUIRED';
  end if;

  if input_rules_version is distinct from current_version then
    raise exception using errcode = 'P0001', message = 'RULES_ACCEPTANCE_REQUIRED';
  end if;

  select city.id
  into selected_city_id
  from public.cities as city
  where city.slug = lower(btrim(input_city_slug))::extensions.citext
    and city.active;

  if selected_city_id is null then
    raise exception using errcode = 'P0001', message = 'VALIDATION_FAILED';
  end if;

  update public.profiles as profile
  set handle = normalized_handle,
      display_name = normalized_display_name,
      city_id = selected_city_id,
      bio = normalized_bio,
      adult_attested_at = coalesce(profile.adult_attested_at, statement_timestamp()),
      rules_version = current_version,
      rules_accepted_at = case
        when profile.rules_version = current_version and profile.rules_accepted_at is not null
          then profile.rules_accepted_at
        else statement_timestamp()
      end,
      profile_completed_at = coalesce(profile.profile_completed_at, statement_timestamp())
  where profile.id = actor_id;

  return query
  select profile.handle, profile.profile_completed_at
  from public.profiles as profile
  where profile.id = actor_id;
exception
  when unique_violation then
    raise exception using errcode = 'P0001', message = 'HANDLE_UNAVAILABLE';
end;
$function$;

comment on function public.complete_profile(text, text, text, text, boolean, integer) is
  'Validates and atomically completes or updates the signed-in user profile; protected fields cannot be updated directly.';

create or replace function public.get_public_profile_by_handle(lookup_handle text)
returns table (
  handle text,
  display_name text,
  city_name text,
  bio text,
  member_since timestamptz,
  viewer_has_blocked boolean
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
    )
  from public.profiles as profile
  join public.cities as city on city.id = profile.city_id
  where profile.handle = lower(btrim(lookup_handle))
    and profile.profile_completed_at is not null
    and profile.suspended_at is null
    and city.active;
$function$;

comment on function public.get_public_profile_by_handle(text) is
  'Returns only the safe public profile DTO plus the viewer own outgoing-block state.';

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

  insert into public.user_blocks (blocker_id, blocked_id)
  values (actor_id, target_id)
  on conflict (blocker_id, blocked_id) do nothing;

  get diagnostics inserted_rows = row_count;

  if inserted_rows = 1 then
    -- Friendships and future home-event attendance do not exist yet. Their
    -- transactional side effects extend this function in the owning modules.
    perform private.write_security_audit(
      actor_id,
      'user.block',
      'profile',
      target_id,
      'succeeded',
      audit_request_id,
      '{}'::jsonb
    );
  end if;

  return inserted_rows = 1;
end;
$function$;

comment on function public.block_user(text, uuid) is
  'Creates a private directional block and minimal audit event without notifying or exposing it to the target.';

create or replace function public.unblock_user(target_handle text, audit_request_id uuid default null)
returns boolean
language plpgsql
security definer
set search_path = ''
as $function$
declare
  actor_id uuid := private.assert_actor(true);
  target_id uuid;
  deleted_rows integer;
begin
  select profile.id
  into target_id
  from public.profiles as profile
  where profile.handle = lower(btrim(target_handle));

  if target_id is null or target_id = actor_id then
    raise exception using errcode = 'P0001', message = 'NOT_ALLOWED';
  end if;

  delete from public.user_blocks as block
  where block.blocker_id = actor_id
    and block.blocked_id = target_id;

  get diagnostics deleted_rows = row_count;

  if deleted_rows = 1 then
    perform private.write_security_audit(
      actor_id,
      'user.unblock',
      'profile',
      target_id,
      'succeeded',
      audit_request_id,
      '{}'::jsonb
    );
  end if;

  return deleted_rows = 1;
end;
$function$;

comment on function public.unblock_user(text, uuid) is
  'Removes only the signed-in user own outgoing block and writes minimal audit evidence.';

alter table public.cities enable row level security;
alter table public.cities force row level security;
alter table public.profiles enable row level security;
alter table public.profiles force row level security;
alter table public.platform_roles enable row level security;
alter table public.platform_roles force row level security;
alter table public.user_blocks enable row level security;
alter table public.user_blocks force row level security;
alter table public.security_audit_events enable row level security;
alter table public.security_audit_events force row level security;

create policy cities_read_active
on public.cities
for select
to anon, authenticated
using (active);

create policy profiles_read_own
on public.profiles
for select
to authenticated
using (id = auth.uid());

create policy user_blocks_read_own
on public.user_blocks
for select
to authenticated
using (blocker_id = auth.uid());

revoke all on public.cities from anon, authenticated;
revoke all on public.profiles from anon, authenticated;
revoke all on public.platform_roles from anon, authenticated;
revoke all on public.user_blocks from anon, authenticated;
revoke all on public.security_audit_events from anon, authenticated;

grant select on public.cities to anon, authenticated;
grant select on public.profiles to authenticated;
grant select on public.user_blocks to authenticated;

revoke all on function private.current_rules_version() from public, anon, authenticated;
revoke all on function private.handle_new_auth_user() from public, anon, authenticated;
revoke all on function private.assert_actor(boolean) from public, anon, authenticated;
revoke all on function private.users_are_blocked(uuid, uuid) from public, anon, authenticated;
revoke all on function private.has_platform_role(uuid, public.platform_role[]) from public, anon, authenticated;
revoke all on function private.write_security_audit(uuid, text, text, uuid, text, uuid, jsonb) from public, anon, authenticated;

revoke all on function public.complete_profile(text, text, text, text, boolean, integer) from public, anon;
revoke all on function public.get_public_profile_by_handle(text) from public;
revoke all on function public.block_user(text, uuid) from public, anon;
revoke all on function public.unblock_user(text, uuid) from public, anon;

grant execute on function public.complete_profile(text, text, text, text, boolean, integer) to authenticated;
grant execute on function public.get_public_profile_by_handle(text) to anon, authenticated;
grant execute on function public.block_user(text, uuid) to authenticated;
grant execute on function public.unblock_user(text, uuid) to authenticated;

commit;
