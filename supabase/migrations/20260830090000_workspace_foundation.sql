begin;

alter table public.profiles
  add column fan_enabled_at timestamptz;

update public.profiles
set fan_enabled_at = profile_completed_at
where profile_completed_at is not null;

alter table public.profiles
  add constraint profiles_fan_enabled_completion_check check (
    fan_enabled_at is null or profile_completed_at is not null
  );

comment on column public.profiles.fan_enabled_at is
  'Explicit Fan workspace activation. Common-eligible Venue operators may leave this null.';

create index profiles_fan_enabled_at_idx
  on public.profiles (fan_enabled_at)
  where fan_enabled_at is not null;

create type public.venue_member_role as enum ('owner', 'admin');
create type public.venue_membership_status as enum ('active', 'revoked');

create table public.venue_memberships (
  venue_id uuid not null references public.venues(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role public.venue_member_role not null,
  status public.venue_membership_status not null default 'active',
  revoked_at timestamptz,
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  primary key (venue_id, user_id),
  constraint venue_memberships_revocation_evidence_check check (
    (status = 'active' and revoked_at is null)
    or (status = 'revoked' and revoked_at is not null)
  ),
  constraint venue_memberships_owner_active_check check (
    role <> 'owner' or status = 'active'
  )
);

comment on table public.venue_memberships is
  'Authorization boundary for one account managing one Venue workspace. Direct client writes are denied.';

create unique index venue_memberships_one_active_owner_uidx
  on public.venue_memberships (venue_id)
  where role = 'owner' and status = 'active';
create index venue_memberships_user_status_idx
  on public.venue_memberships (user_id, status, venue_id);
create index venue_memberships_venue_status_role_idx
  on public.venue_memberships (venue_id, status, role, user_id);

create trigger venue_memberships_set_updated_at
before update on public.venue_memberships
for each row execute function private.set_updated_at();

insert into public.venue_memberships (venue_id, user_id, role, status)
select venue.id, venue.owner_id, 'owner', 'active'
from public.venues as venue
on conflict (venue_id, user_id) do update
set role = 'owner', status = 'active', revoked_at = null;

create or replace function private.protect_active_venue_owner()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  canonical_owner_id uuid;
begin
  if tg_op <> 'INSERT'
    and old.role = 'owner'
    and old.status = 'active'
    and (
      tg_op = 'DELETE'
      or new.venue_id is distinct from old.venue_id
      or new.user_id is distinct from old.user_id
      or new.role <> 'owner'
      or new.status <> 'active'
    )
    and exists (
      select 1 from public.venues as venue where venue.id = old.venue_id
    ) then
    raise exception using
      errcode = '23514',
      message = 'VENUE_ACTIVE_OWNER_REQUIRED';
  end if;

  if tg_op <> 'DELETE' and new.role = 'owner' and new.status = 'active' then
    select venue.owner_id
    into canonical_owner_id
    from public.venues as venue
    where venue.id = new.venue_id;

    if canonical_owner_id is distinct from new.user_id then
      raise exception using
        errcode = '23514',
        message = 'VENUE_OWNER_MISMATCH';
    end if;
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$function$;

comment on function private.protect_active_venue_owner() is
  'Preserves the exact active owner and keeps it synchronized with venues.owner_id.';

create trigger venue_memberships_protect_active_owner
before insert or update or delete on public.venue_memberships
for each row execute function private.protect_active_venue_owner();

create or replace function private.create_primary_venue_membership()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  insert into public.venue_memberships (venue_id, user_id, role, status)
  values (new.id, new.owner_id, 'owner', 'active');
  return new;
end;
$function$;

comment on function private.create_primary_venue_membership() is
  'Creates the canonical active owner membership with every new venue.';

create trigger venues_create_primary_membership
after insert on public.venues
for each row execute function private.create_primary_venue_membership();

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
      and profile.adult_attested_at is not null
      and profile.rules_version = private.current_rules_version()
      and profile.rules_accepted_at is not null
      and profile.suspended_at is null
      and profile.community_restricted_at is null
  );
$function$;

comment on function private.profile_is_common_eligible(uuid) is
  'Checks verified email, current adult/rules acceptance, and active suspension/restriction state without requiring Fan identity.';

create or replace function private.profile_is_fan_eligible(target_profile_id uuid)
returns boolean
language sql
security definer
stable
set search_path = ''
as $function$
  select private.profile_is_common_eligible(target_profile_id)
    and exists (
      select 1
      from public.profiles as profile
      where profile.id = target_profile_id
        and profile.handle is not null
        and profile.display_name is not null
        and profile.city_id is not null
        and profile.profile_completed_at is not null
        and profile.fan_enabled_at is not null
    );
$function$;

comment on function private.profile_is_fan_eligible(uuid) is
  'Adds explicit Fan activation and completed public Fan identity to common eligibility.';

create or replace function private.profile_is_community_eligible(target_profile_id uuid)
returns boolean
language sql
security definer
stable
set search_path = ''
as $function$
  select private.profile_is_fan_eligible(target_profile_id);
$function$;

comment on function private.profile_is_community_eligible(uuid) is
  'Compatibility wrapper for legacy database callers; community now means active Fan.';

create or replace function private.actor_manages_venue(
  input_actor_id uuid,
  input_venue_id uuid
)
returns boolean
language sql
security definer
stable
set search_path = ''
as $function$
  select input_actor_id is not null
    and input_venue_id is not null
    and private.profile_is_common_eligible(input_actor_id)
    and exists (
      select 1
      from public.venue_memberships as membership
      join public.venues as venue on venue.id = membership.venue_id
      where membership.venue_id = input_venue_id
        and membership.user_id = input_actor_id
        and membership.status = 'active'
        and membership.revoked_at is null
        and membership.role in ('owner', 'admin')
        and venue.verification_status <> 'suspended'
        and venue.suspended_at is null
    );
$function$;

comment on function private.actor_manages_venue(uuid, uuid) is
  'Authorizes one concrete Venue through active membership plus common eligibility; cookies and owner form fields are irrelevant.';

create or replace function private.actor_owns_venue(
  input_venue_id uuid,
  input_actor_id uuid
)
returns boolean
language sql
security definer
stable
set search_path = ''
as $function$
  select private.actor_manages_venue(input_actor_id, input_venue_id);
$function$;

comment on function private.actor_owns_venue(uuid, uuid) is
  'Compatibility wrapper for membership-aware Venue management authorization.';

create or replace function private.assert_common_actor()
returns uuid
language plpgsql
security definer
volatile
set search_path = ''
as $function$
declare
  actor_id uuid := private.assert_actor(false);
  actor_profile public.profiles%rowtype;
begin
  select profile.*
  into strict actor_profile
  from public.profiles as profile
  where profile.id = actor_id
  for share;

  if actor_profile.adult_attested_at is null then
    raise exception using errcode = 'P0001', message = 'ADULT_ATTESTATION_REQUIRED';
  end if;
  if actor_profile.rules_version is distinct from private.current_rules_version()
    or actor_profile.rules_accepted_at is null then
    raise exception using errcode = 'P0001', message = 'RULES_ACCEPTANCE_REQUIRED';
  end if;
  if actor_profile.community_restricted_at is not null then
    raise exception using errcode = 'P0001', message = 'ACCOUNT_RESTRICTED';
  end if;
  return actor_id;
end;
$function$;

create or replace function public.activate_fan_workspace(
  input_handle text,
  input_display_name text,
  input_city_slug text,
  input_bio text,
  input_adult_attested boolean,
  input_rules_version integer
)
returns table (handle text, profile_completed_at timestamptz, fan_enabled_at timestamptz)
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
  actor_restricted_at timestamptz;
begin
  select profile.community_restricted_at
  into actor_restricted_at
  from public.profiles as profile
  where profile.id = actor_id
  for update;

  if actor_restricted_at is not null then
    raise exception using errcode = 'P0001', message = 'ACCOUNT_RESTRICTED';
  end if;
  if normalized_handle !~ '^[a-z0-9_]{3,30}$' then
    raise exception using errcode = 'P0001', message = 'VALIDATION_FAILED';
  end if;
  if char_length(normalized_display_name) not between 2 and 60 then
    raise exception using errcode = 'P0001', message = 'VALIDATION_FAILED';
  end if;
  if normalized_bio is not null and char_length(normalized_bio) > 500 then
    raise exception using errcode = 'P0001', message = 'VALIDATION_FAILED';
  end if;
  if input_adult_attested is distinct from true then
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
      profile_completed_at = coalesce(profile.profile_completed_at, statement_timestamp()),
      fan_enabled_at = coalesce(profile.fan_enabled_at, statement_timestamp())
  where profile.id = actor_id;

  return query
  select profile.handle, profile.profile_completed_at, profile.fan_enabled_at
  from public.profiles as profile
  where profile.id = actor_id;
exception
  when unique_violation then
    raise exception using errcode = 'P0001', message = 'HANDLE_UNAVAILABLE';
end;
$function$;

comment on function public.activate_fan_workspace(text, text, text, text, boolean, integer) is
  'Validates common trust and Fan identity fields before explicitly enabling the Fan workspace.';

create or replace function public.complete_profile(
  input_handle text,
  input_display_name text,
  input_city_slug text,
  input_bio text,
  input_adult_attested boolean,
  input_rules_version integer
)
returns table (handle text, profile_completed_at timestamptz)
language sql
security definer
set search_path = ''
as $function$
  select activation.handle, activation.profile_completed_at
  from public.activate_fan_workspace(
    input_handle,
    input_display_name,
    input_city_slug,
    input_bio,
    input_adult_attested,
    input_rules_version
  ) as activation;
$function$;

comment on function public.complete_profile(text, text, text, text, boolean, integer) is
  'Compatibility wrapper for explicit Fan workspace activation.';

create or replace function public.list_my_workspaces()
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
  select
    'fan'::text,
    profile.id,
    profile.handle,
    profile.display_name,
    'fan'::text
  from public.profiles as profile
  where profile.id = auth.uid()
    and private.profile_is_fan_eligible(profile.id)

  union all

  select
    'venue'::text,
    venue.id,
    venue.slug,
    venue.name,
    membership.role::text
  from public.venue_memberships as membership
  join public.venues as venue on venue.id = membership.venue_id
  where membership.user_id = auth.uid()
    and membership.status = 'active'
    and membership.revoked_at is null
    and private.actor_manages_venue(auth.uid(), venue.id)
  order by 1, 4, 2;
$function$;

comment on function public.list_my_workspaces() is
  'Returns only the current actor authorized Fan and active Venue workspaces for presentation recovery.';

create or replace function public.create_venue(
  input_name text,
  input_slug text,
  input_city_id uuid,
  input_address_text text,
  input_longitude double precision,
  input_latitude double precision,
  input_description text,
  input_screen_count integer,
  input_stated_capacity integer,
  audit_request_id uuid default null
)
returns table (venue_id uuid, slug text, verification_status text)
language plpgsql
security definer
set search_path = ''
as $function$
#variable_conflict use_variable
declare
  actor_id uuid := private.assert_common_actor();
  created_venue public.venues%rowtype;
begin
  if input_longitude is null
    or input_latitude is null
    or input_longitude not between 34.0 and 36.0
    or input_latitude not between 29.0 and 34.0
    or not exists (
      select 1 from public.cities as city
      where city.id = input_city_id and city.active
    ) then
    raise exception using errcode = 'P0001', message = 'VALIDATION_FAILED';
  end if;

  insert into public.venues (
    owner_id, slug, name, city_id, address_text, location,
    description, screen_count, stated_capacity
  )
  values (
    actor_id,
    lower(btrim(input_slug)),
    btrim(input_name),
    input_city_id,
    btrim(input_address_text),
    extensions.st_setsrid(
      extensions.st_makepoint(input_longitude, input_latitude), 4326
    )::extensions.geography,
    btrim(input_description),
    input_screen_count,
    input_stated_capacity
  )
  returning * into created_venue;

  perform private.write_security_audit(
    actor_id, 'venue.create', 'venue', created_venue.id,
    'succeeded', audit_request_id,
    jsonb_build_object('verification_status', created_venue.verification_status::text)
  );

  return query select
    created_venue.id, created_venue.slug, created_venue.verification_status::text;
exception
  when unique_violation then
    raise exception using errcode = 'P0001', message = 'VENUE_SLUG_UNAVAILABLE';
end;
$function$;

create or replace function public.update_venue(
  input_venue_id uuid,
  input_name text,
  input_slug text,
  input_city_id uuid,
  input_address_text text,
  input_longitude double precision,
  input_latitude double precision,
  input_description text,
  input_screen_count integer,
  input_stated_capacity integer,
  audit_request_id uuid default null
)
returns table (venue_id uuid, slug text, verification_status text)
language plpgsql
security definer
set search_path = ''
as $function$
#variable_conflict use_variable
declare
  actor_id uuid := private.assert_common_actor();
  target_venue public.venues%rowtype;
begin
  select venue.*
  into target_venue
  from public.venues as venue
  where venue.id = input_venue_id
  for update;

  if not found or not private.actor_manages_venue(actor_id, input_venue_id) then
    raise exception using errcode = 'P0001', message = 'NOT_ALLOWED';
  end if;
  if target_venue.verification_status = 'suspended'
    or input_longitude is null
    or input_latitude is null
    or input_longitude not between 34.0 and 36.0
    or input_latitude not between 29.0 and 34.0
    or not exists (
      select 1 from public.cities as city
      where city.id = input_city_id and city.active
    ) then
    raise exception using errcode = 'P0001', message = 'NOT_ALLOWED';
  end if;

  update public.venues as venue
  set slug = lower(btrim(input_slug)),
      name = btrim(input_name),
      city_id = input_city_id,
      address_text = btrim(input_address_text),
      location = extensions.st_setsrid(
        extensions.st_makepoint(input_longitude, input_latitude), 4326
      )::extensions.geography,
      description = btrim(input_description),
      screen_count = input_screen_count,
      stated_capacity = input_stated_capacity
  where venue.id = input_venue_id
  returning * into target_venue;

  perform private.write_security_audit(
    actor_id, 'venue.update', 'venue', target_venue.id,
    'succeeded', audit_request_id,
    jsonb_build_object('verification_status', target_venue.verification_status::text)
  );

  return query select
    target_venue.id, target_venue.slug, target_venue.verification_status::text;
exception
  when unique_violation then
    raise exception using errcode = 'P0001', message = 'VENUE_SLUG_UNAVAILABLE';
end;
$function$;

create or replace function public.get_venue_for_management(lookup_slug text)
returns table (
  venue_id uuid,
  slug text,
  name text,
  city_id uuid,
  city_name text,
  address_text text,
  longitude double precision,
  latitude double precision,
  description text,
  screen_count integer,
  stated_capacity integer,
  verification_status text,
  suspended_at timestamptz
)
language plpgsql
security definer
stable
set search_path = ''
as $function$
declare
  actor_id uuid := private.assert_common_actor();
begin
  return query
  select
    venue.id,
    venue.slug,
    venue.name,
    venue.city_id,
    city.name_en,
    venue.address_text,
    extensions.st_x(venue.location::extensions.geometry),
    extensions.st_y(venue.location::extensions.geometry),
    venue.description,
    venue.screen_count,
    venue.stated_capacity,
    venue.verification_status::text,
    venue.suspended_at
  from public.venues as venue
  join public.cities as city on city.id = venue.city_id
  where venue.slug = lower(btrim(lookup_slug))
    and private.actor_manages_venue(actor_id, venue.id);
end;
$function$;

comment on function public.get_venue_for_management(text) is
  'Returns one concrete Venue management projection through active owner/admin membership.';

create or replace function public.list_owned_venues(
  input_offset integer default 0,
  input_limit integer default 50
)
returns table (
  venue_id uuid,
  slug text,
  name text,
  verification_status text,
  city_name text,
  total_count bigint
)
language plpgsql
security definer
stable
set search_path = ''
as $function$
declare
  actor_id uuid := private.assert_common_actor();
  bounded_offset integer := greatest(coalesce(input_offset, 0), 0);
  bounded_limit integer := least(greatest(coalesce(input_limit, 50), 1), 100);
begin
  return query
  select
    venue.id,
    venue.slug,
    venue.name,
    venue.verification_status::text,
    city.name_en,
    count(*) over ()
  from public.venue_memberships as membership
  join public.venues as venue on venue.id = membership.venue_id
  join public.cities as city on city.id = venue.city_id
  where membership.user_id = actor_id
    and membership.status = 'active'
    and membership.revoked_at is null
    and private.actor_manages_venue(actor_id, venue.id)
  order by venue.created_at desc, venue.id
  offset bounded_offset
  limit bounded_limit;
end;
$function$;

comment on function public.list_owned_venues(integer, integer) is
  'Compatibility projection listing the current actor active owner/admin Venue memberships.';

create or replace function private.assert_fan_actor()
returns uuid
language plpgsql
security definer
volatile
set search_path = ''
as $function$
declare
  actor_id uuid := private.assert_common_actor();
begin
  if not private.profile_is_fan_eligible(actor_id) then
    raise exception using errcode = 'P0001', message = 'PROFILE_INCOMPLETE';
  end if;
  return actor_id;
end;
$function$;

comment on function private.assert_fan_actor() is
  'Requires the current actor to satisfy common eligibility and explicit Fan activation.';

create or replace function private.assert_event_context_actor(input_event_id uuid)
returns uuid
language plpgsql
security definer
volatile
set search_path = ''
as $function$
declare
  actor_id uuid := private.assert_actor(false);
  target_host_venue_id uuid;
begin
  select event.host_venue_id
  into target_host_venue_id
  from public.events as event
  where event.id = input_event_id;

  if not found then
    raise exception using errcode = 'P0001', message = 'NOT_FOUND';
  end if;

  if target_host_venue_id is null then
    return private.assert_fan_actor();
  end if;
  return private.assert_common_actor();
end;
$function$;

create or replace function private.assert_invitation_context_actor(input_invitation_id uuid)
returns uuid
language plpgsql
security definer
volatile
set search_path = ''
as $function$
declare
  target_event_id uuid;
begin
  select invitation.event_id
  into target_event_id
  from public.event_invitations as invitation
  where invitation.id = input_invitation_id;

  if not found then
    raise exception using errcode = 'P0001', message = 'NOT_FOUND';
  end if;
  return private.assert_event_context_actor(target_event_id);
end;
$function$;

create or replace function private.assert_attendance_context_actor(input_attendance_id uuid)
returns uuid
language plpgsql
security definer
volatile
set search_path = ''
as $function$
declare
  target_event_id uuid;
begin
  select attendance.event_id
  into target_event_id
  from public.event_attendance as attendance
  where attendance.id = input_attendance_id;

  if not found then
    raise exception using errcode = 'P0001', message = 'NOT_FOUND';
  end if;
  return private.assert_event_context_actor(target_event_id);
end;
$function$;

create or replace function private.assert_event_manager_or_fan_actor(input_event_id uuid)
returns uuid
language plpgsql
security definer
volatile
set search_path = ''
as $function$
declare
  actor_id uuid := private.assert_actor(false);
  target_host_venue_id uuid;
begin
  select event.host_venue_id
  into target_host_venue_id
  from public.events as event
  where event.id = input_event_id;

  if not found then
    raise exception using errcode = 'P0001', message = 'NOT_FOUND';
  end if;

  if target_host_venue_id is not null
    and private.actor_manages_venue(actor_id, target_host_venue_id) then
    return private.assert_common_actor();
  end if;
  return private.assert_fan_actor();
end;
$function$;

create or replace function private.reject_venue_owner_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  raise exception using
    errcode = '23514',
    message = 'VENUE_OWNER_CHANGE_NOT_ALLOWED';
end;
$function$;

create trigger venues_reject_owner_change
after update of owner_id on public.venues
for each row
when (old.owner_id is distinct from new.owner_id)
execute function private.reject_venue_owner_change();

create or replace function public.create_or_update_event(
  input_event_id uuid,
  input_host_venue_id uuid,
  input_organizing_group_id uuid,
  input_match_id uuid,
  input_title text,
  input_description text,
  input_expected_activity text,
  input_cost_description text,
  input_event_rules text,
  input_commercial_affiliation text,
  input_host_presence_confirmed boolean,
  input_starts_at timestamptz,
  input_ends_at timestamptz,
  input_city_id uuid,
  input_place_kind text,
  input_venue_id uuid,
  input_public_place_name text,
  input_public_address_text text,
  input_public_longitude double precision,
  input_public_latitude double precision,
  input_audience text,
  input_audience_team_id uuid,
  input_audience_group_id uuid,
  input_capacity integer,
  input_requires_approval boolean,
  input_private_address_text text,
  input_private_directions text,
  input_private_longitude double precision,
  input_private_latitude double precision,
  input_intent text,
  audit_request_id uuid default null
)
returns table (event_id uuid, status text)
language plpgsql
security definer
set search_path = ''
as $function$
#variable_conflict use_variable
declare
  actor_id uuid := private.assert_actor(false);
  parsed_place public.event_place_kind;
  parsed_audience public.event_audience;
  target_status public.event_status;
  target_event public.events%rowtype;
  host_venue public.venues%rowtype;
  resolved_host_user_id uuid;
  resolved_organizing_group_id uuid := input_organizing_group_id;
  public_point extensions.geography(Point, 4326);
  private_point extensions.geography(Point, 4326);
  is_create boolean := input_event_id is null;
begin
  if input_host_venue_id is null then
    actor_id := private.assert_fan_actor();
  else
    actor_id := private.assert_common_actor();
  end if;

  begin
    parsed_place := input_place_kind::public.event_place_kind;
    parsed_audience := input_audience::public.event_audience;
  exception when invalid_text_representation then
    raise exception using errcode = 'P0001', message = 'VALIDATION_FAILED';
  end;

  if input_intent is null
    or input_intent not in ('draft', 'publish')
    or input_host_presence_confirmed is distinct from true
    or input_starts_at is null
    or input_ends_at is null
    or input_city_id is null
    or input_match_id is null
    or input_capacity is null
    or input_requires_approval is null
    or input_starts_at <= statement_timestamp()
    or input_ends_at <= input_starts_at
    or not exists (
      select 1 from public.cities as city
      where city.id = input_city_id and city.active
    ) then
    raise exception using errcode = 'P0001', message = 'VALIDATION_FAILED';
  end if;

  perform 1
  from public.matches as match
  where match.id = input_match_id
    and match.starts_at > statement_timestamp()
    and match.status in ('scheduled', 'timed', 'postponed')
  for share;

  if not found then
    raise exception using errcode = 'P0001', message = 'NOT_FOUND';
  end if;

  if parsed_place = 'public_place' then
    if input_public_longitude is null
      or input_public_latitude is null
      or input_public_longitude not between 34.0 and 36.0
      or input_public_latitude not between 29.0 and 34.0
      or nullif(btrim(input_public_place_name), '') is null
      or nullif(btrim(input_public_address_text), '') is null then
      raise exception using errcode = 'P0001', message = 'VALIDATION_FAILED';
    end if;

    public_point := extensions.st_setsrid(
      extensions.st_makepoint(input_public_longitude, input_public_latitude),
      4326
    )::extensions.geography;
  elsif input_public_place_name is not null
    or input_public_address_text is not null
    or input_public_longitude is not null
    or input_public_latitude is not null then
    raise exception using errcode = 'P0001', message = 'VALIDATION_FAILED';
  end if;

  if parsed_place = 'home' then
    if input_private_longitude is null
      or input_private_latitude is null
      or input_private_longitude not between 34.0 and 36.0
      or input_private_latitude not between 29.0 and 34.0
      or nullif(btrim(input_private_address_text), '') is null then
      raise exception using errcode = 'P0001', message = 'VALIDATION_FAILED';
    end if;

    private_point := extensions.st_setsrid(
      extensions.st_makepoint(input_private_longitude, input_private_latitude),
      4326
    )::extensions.geography;
  elsif input_private_address_text is not null
    or input_private_directions is not null
    or input_private_longitude is not null
    or input_private_latitude is not null then
    raise exception using errcode = 'P0001', message = 'VALIDATION_FAILED';
  end if;

  if input_host_venue_id is null then
    resolved_host_user_id := actor_id;

    if parsed_place not in ('home', 'public_place')
      or input_venue_id is not null
      or parsed_audience not in ('group', 'friends', 'invite_only')
      or not input_requires_approval then
      raise exception using errcode = 'P0001', message = 'NOT_ALLOWED';
    end if;

    if parsed_place = 'home' and input_capacity not between 1 and 12 then
      raise exception using errcode = 'P0001', message = 'VALIDATION_FAILED';
    end if;

    if parsed_audience = 'group' then
      if input_audience_group_id is null or (
        input_organizing_group_id is not null
        and input_organizing_group_id <> input_audience_group_id
      ) then
        raise exception using errcode = 'P0001', message = 'NOT_ALLOWED';
      end if;

      perform 1
      from public.group_memberships as membership
      join public.groups as supporter_group
        on supporter_group.id = membership.group_id
      where membership.group_id = input_audience_group_id
        and membership.user_id = actor_id
        and membership.status = 'active'
        and supporter_group.lifecycle in ('forming', 'active')
        and not exists (
          select 1
          from public.group_bans as ban
          where ban.group_id = membership.group_id
            and ban.user_id = membership.user_id
            and ban.revoked_at is null
        )
      for share of membership, supporter_group;

      if not found then
        raise exception using errcode = 'P0001', message = 'NOT_ALLOWED';
      end if;

      resolved_organizing_group_id := input_audience_group_id;
    elsif parsed_audience = 'friends' then
      if input_audience_group_id is not null
        or input_organizing_group_id is not null
        or not exists (
          select 1
          from public.friendships as friendship
          where friendship.status = 'accepted'
            and actor_id in (friendship.user_low_id, friendship.user_high_id)
            and not private.users_are_blocked(
              actor_id,
              case
                when friendship.user_low_id = actor_id then friendship.user_high_id
                else friendship.user_low_id
              end
            )
        ) then
        raise exception using errcode = 'P0001', message = 'NOT_ALLOWED';
      end if;
    elsif input_audience_group_id is not null or input_organizing_group_id is not null then
      raise exception using errcode = 'P0001', message = 'NOT_ALLOWED';
    end if;

    if input_audience_team_id is not null then
      raise exception using errcode = 'P0001', message = 'NOT_ALLOWED';
    end if;

    target_status := case
      when input_intent = 'draft' then 'draft'::public.event_status
      when resolved_organizing_group_id is not null
        then 'pending_group_review'::public.event_status
      else 'published'::public.event_status
    end;
  else
    select venue.*
    into host_venue
    from public.venues as venue
    where venue.id = input_host_venue_id
    for share;

    if not found
      or not private.actor_manages_venue(actor_id, input_host_venue_id)
      or host_venue.verification_status = 'suspended'
      or host_venue.suspended_at is not null
      or parsed_place <> 'venue'
      or input_venue_id is distinct from input_host_venue_id
      or input_city_id <> host_venue.city_id
      or parsed_audience not in ('public', 'team_followers')
      or input_organizing_group_id is not null
      or input_audience_group_id is not null then
      raise exception using errcode = 'P0001', message = 'NOT_ALLOWED';
    end if;

    if parsed_audience = 'team_followers' then
      if input_audience_team_id is null or not exists (
        select 1 from public.teams as team
        where team.id = input_audience_team_id and team.active
      ) then
        raise exception using errcode = 'P0001', message = 'VALIDATION_FAILED';
      end if;
    elsif input_audience_team_id is not null then
      raise exception using errcode = 'P0001', message = 'VALIDATION_FAILED';
    end if;

    target_status := case
      when input_intent = 'draft' then 'draft'::public.event_status
      else 'published'::public.event_status
    end;
  end if;

  if is_create then
    perform pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended('huddle:event-create:' || actor_id::text, 0)
    );

    if exists (
      select 1
      from public.security_audit_events as recent_event
      where recent_event.actor_id = actor_id
        and recent_event.action = 'event.create'
        and recent_event.created_at > statement_timestamp() - interval '10 seconds'
    ) then
      raise exception using errcode = 'P0001', message = 'RATE_LIMITED';
    end if;

    insert into public.events (
      created_by,
      host_user_id,
      host_venue_id,
      organizing_group_id,
      match_id,
      title,
      description,
      expected_activity,
      cost_description,
      event_rules,
      commercial_affiliation,
      host_presence_confirmed_at,
      starts_at,
      ends_at,
      city_id,
      place_kind,
      venue_id,
      public_place_name,
      public_address_text,
      public_location,
      audience,
      audience_team_id,
      audience_group_id,
      capacity,
      requires_approval,
      status,
      published_at
    )
    values (
      actor_id,
      resolved_host_user_id,
      input_host_venue_id,
      resolved_organizing_group_id,
      input_match_id,
      btrim(input_title),
      btrim(input_description),
      btrim(input_expected_activity),
      btrim(input_cost_description),
      btrim(input_event_rules),
      btrim(input_commercial_affiliation),
      statement_timestamp(),
      input_starts_at,
      input_ends_at,
      input_city_id,
      parsed_place,
      input_venue_id,
      case when parsed_place = 'public_place' then btrim(input_public_place_name) else null end,
      case when parsed_place = 'public_place' then btrim(input_public_address_text) else null end,
      public_point,
      parsed_audience,
      input_audience_team_id,
      input_audience_group_id,
      input_capacity,
      input_requires_approval,
      target_status,
      case when target_status = 'published' then statement_timestamp() else null end
    )
    returning * into target_event;
  else
    select event.*
    into target_event
    from public.events as event
    where event.id = input_event_id
    for update;

    if not found
      or target_event.status in ('cancelled', 'completed')
      or (
        target_event.host_user_id <> actor_id
        and not private.actor_owns_venue(target_event.host_venue_id, actor_id)
      )
      or target_event.host_user_id is distinct from resolved_host_user_id
      or target_event.host_venue_id is distinct from input_host_venue_id then
      raise exception using errcode = 'P0001', message = 'NOT_ALLOWED';
    end if;

    if target_event.status = 'published' and target_status <> 'published' then
      raise exception using errcode = 'P0001', message = 'INVALID_TRANSITION';
    end if;

    update public.events as event
    set
      organizing_group_id = resolved_organizing_group_id,
      match_id = input_match_id,
      title = btrim(input_title),
      description = btrim(input_description),
      expected_activity = btrim(input_expected_activity),
      cost_description = btrim(input_cost_description),
      event_rules = btrim(input_event_rules),
      commercial_affiliation = btrim(input_commercial_affiliation),
      host_presence_confirmed_at = statement_timestamp(),
      starts_at = input_starts_at,
      ends_at = input_ends_at,
      city_id = input_city_id,
      place_kind = parsed_place,
      venue_id = input_venue_id,
      public_place_name = case
        when parsed_place = 'public_place' then btrim(input_public_place_name)
        else null
      end,
      public_address_text = case
        when parsed_place = 'public_place' then btrim(input_public_address_text)
        else null
      end,
      public_location = public_point,
      audience = parsed_audience,
      audience_team_id = input_audience_team_id,
      audience_group_id = input_audience_group_id,
      capacity = input_capacity,
      requires_approval = input_requires_approval,
      status = target_status,
      published_at = case
        when event.published_at is not null then event.published_at
        when target_status = 'published' then statement_timestamp()
        else null
      end
    where event.id = input_event_id
    returning * into target_event;
  end if;

  if parsed_place = 'home' then
    insert into public.event_private_locations (
      event_id,
      address_text,
      directions,
      location
    )
    values (
      target_event.id,
      btrim(input_private_address_text),
      nullif(btrim(input_private_directions), ''),
      private_point
    )
    on conflict on constraint event_private_locations_pkey do update
    set
      address_text = excluded.address_text,
      directions = excluded.directions,
      location = excluded.location;
  else
    delete from public.event_private_locations as private_location
    where private_location.event_id = target_event.id;
  end if;

  perform private.write_security_audit(
    actor_id,
    case when is_create then 'event.create' else 'event.update' end,
    'event',
    target_event.id,
    'succeeded',
    audit_request_id,
    jsonb_build_object(
      'status', target_event.status::text,
      'audience', target_event.audience::text,
      'place_kind', target_event.place_kind::text
    )
  );

  return query select target_event.id, target_event.status::text;
end;
$function$;

create or replace function public.list_managed_venue_events(
  input_venue_id uuid,
  input_limit integer default 20
)
returns table (
  event_id uuid,
  title text,
  status text,
  home_team_name text,
  away_team_name text,
  competition_name text,
  starts_at timestamptz,
  audience text,
  audience_team_name text,
  capacity integer,
  approved_attendee_count bigint,
  requires_approval boolean
)
language plpgsql
security definer
stable
set search_path = ''
as $function$
#variable_conflict use_variable
declare
  actor_id uuid := private.assert_common_actor();
begin
  if not private.actor_manages_venue(actor_id, input_venue_id) then
    raise exception using errcode = 'P0001', message = 'NOT_FOUND';
  end if;

  return query
  select
    event.id,
    event.title,
    event.status::text,
    home_team.name,
    away_team.name,
    competition.name,
    event.starts_at,
    event.audience::text,
    audience_team.name,
    event.capacity,
    (
      select count(*)
      from public.event_attendance as attendance
      where attendance.event_id = event.id
        and attendance.status = 'approved'
    ),
    event.requires_approval
  from public.events as event
  join public.matches as match on match.id = event.match_id
  join public.teams as home_team on home_team.id = match.home_team_id
  join public.teams as away_team on away_team.id = match.away_team_id
  join public.competitions as competition on competition.id = match.competition_id
  left join public.teams as audience_team on audience_team.id = event.audience_team_id
  where event.host_venue_id = input_venue_id
  order by event.starts_at desc, event.id
  limit least(greatest(coalesce(input_limit, 20), 1), 50);
end;
$function$;

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
  actor_id uuid := private.assert_event_context_actor(input_event_id);
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
  actor_id uuid := private.assert_invitation_context_actor(input_invitation_id);
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
  actor_id uuid := private.assert_safety_actor(false);
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

  if parsed_decision = 'accept' then
    actor_id := private.assert_fan_actor();
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

  if target_attendance.user_id = actor_id then
    raise exception using errcode = 'P0001', message = 'NOT_ALLOWED';
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
  actor_id uuid := private.assert_safety_actor(false);
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
  actor_id uuid := private.assert_attendance_context_actor(input_attendance_id);
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
  actor_id uuid := private.assert_event_context_actor(input_event_id);
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
  actor_id uuid := private.assert_event_context_actor(input_event_id);
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
  actor_id uuid := private.assert_event_context_actor(input_event_id);
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
  actor_id uuid := private.assert_event_context_actor(input_event_id);
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
  actor_id uuid := private.assert_event_manager_or_fan_actor(input_event_id);
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
  actor_id uuid := private.assert_safety_actor(false);
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

create or replace function public.block_user(
  target_handle text,
  audit_request_id uuid default null
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $function$
declare
  actor_id uuid := private.assert_common_actor();
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

create or replace function public.unblock_user(
  target_handle text,
  audit_request_id uuid default null
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $function$
declare
  actor_id uuid := private.assert_common_actor();
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

create or replace function public.list_my_huddle_events(
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
  involvement text,
  invitation_status text,
  attendance_status text,
  can_manage boolean,
  total_count bigint
)
language plpgsql
security definer
stable
set search_path = ''
as $function$
declare
  actor_id uuid := private.assert_actor(false);
  bounded_limit integer := least(greatest(coalesce(input_limit, 20), 1), 50);
  bounded_offset integer := greatest(coalesce(input_offset, 0), 0);
begin
  if not private.profile_is_fan_eligible(actor_id) then
    actor_id := private.assert_common_actor();
  end if;

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
    event.audience::text,
    event.status::text,
    case
      when event.starts_at < statement_timestamp()
        or event.status in ('cancelled', 'completed') then 'history'
      when event.host_venue_id is null
        and event.created_by = actor_id
        and event.organizing_group_id is not null
        and event.status = 'pending_group_review' then 'submitted'
      when event.host_venue_id is not null
        and private.actor_manages_venue(actor_id, event.host_venue_id) then 'hosting'
      when event.host_venue_id is null
        and (
          event.created_by = actor_id
          or event.host_user_id = actor_id
        ) then 'hosting'
      when attendance.status = 'requested' then 'requested'
      when attendance.status = 'approved' then 'attending'
      when invitation.status = 'pending' then 'invited'
      else 'history'
    end,
    invitation.status::text,
    attendance.status::text,
    case
      when event.host_venue_id is not null then
        private.actor_manages_venue(actor_id, event.host_venue_id)
      else event.created_by = actor_id or event.host_user_id = actor_id
    end,
    count(*) over ()
  from public.events as event
  join public.matches as match on match.id = event.match_id
  join public.competitions as competition on competition.id = match.competition_id
  join public.teams as home_team on home_team.id = match.home_team_id
  join public.teams as away_team on away_team.id = match.away_team_id
  join public.cities as city on city.id = event.city_id
  left join public.venues as host_venue on host_venue.id = event.host_venue_id
  left join public.event_invitations as invitation
    on invitation.event_id = event.id
    and invitation.invitee_id = actor_id
  left join public.event_attendance as attendance
    on attendance.event_id = event.id
    and attendance.user_id = actor_id
  where (
      event.host_venue_id is not null
      and private.actor_manages_venue(actor_id, event.host_venue_id)
    )
    or (
      event.host_venue_id is null
      and private.profile_is_fan_eligible(actor_id)
      and (
        event.created_by = actor_id
        or event.host_user_id = actor_id
        or (
          (invitation.id is not null or attendance.id is not null)
          and (
            event.starts_at < statement_timestamp()
            or private.event_is_visible_to_actor(event.id, actor_id)
          )
        )
      )
    )
    or (
      event.host_venue_id is not null
      and private.profile_is_fan_eligible(actor_id)
      and (
        invitation.status in ('pending', 'accepted')
        or attendance.status in ('requested', 'approved')
      )
      and (
        event.starts_at < statement_timestamp()
        or private.event_is_visible_to_actor(event.id, actor_id)
      )
    )
  order by
    case when event.starts_at >= statement_timestamp() then 0 else 1 end,
    case when event.starts_at >= statement_timestamp() then event.starts_at end,
    case when event.starts_at < statement_timestamp() then event.starts_at end desc,
    event.id
  offset bounded_offset
  limit bounded_limit;
end;
$function$;

create or replace function public.get_venue_by_slug(lookup_slug text)
returns table (
  venue_id uuid,
  slug text,
  name text,
  city_id uuid,
  city_name text,
  address_text text,
  description text,
  screen_count integer,
  stated_capacity integer,
  verification_status text,
  owner_handle text,
  follower_count bigint,
  viewer_follows boolean,
  viewer_is_owner boolean
)
language sql
security definer
stable
set search_path = ''
as $function$
  select
    venue.id,
    venue.slug,
    venue.name,
    venue.city_id,
    city.name_en,
    venue.address_text,
    venue.description,
    venue.screen_count,
    venue.stated_capacity,
    venue.verification_status::text,
    owner_profile.handle,
    (
      select count(*)
      from public.venue_follows as follow
      where follow.venue_id = venue.id
    ),
    exists (
      select 1
      from public.venue_follows as own_follow
      where own_follow.venue_id = venue.id
        and own_follow.user_id = auth.uid()
    ),
    private.actor_manages_venue(auth.uid(), venue.id)
  from public.venues as venue
  join public.cities as city on city.id = venue.city_id
  join public.profiles as owner_profile on owner_profile.id = venue.owner_id
  where venue.slug = lower(btrim(lookup_slug))
    and venue.verification_status <> 'suspended'
    and venue.suspended_at is null;
$function$;

alter table public.venue_memberships enable row level security;
alter table public.venue_memberships force row level security;

create policy venue_memberships_read_own
on public.venue_memberships
for select
to authenticated
using (user_id = auth.uid());

revoke all on public.venue_memberships from anon, authenticated;
grant select on public.venue_memberships to authenticated;

revoke all on function private.protect_active_venue_owner()
  from public, anon, authenticated;
revoke all on function private.create_primary_venue_membership()
  from public, anon, authenticated;
revoke all on function private.profile_is_common_eligible(uuid)
  from public, anon, authenticated;
revoke all on function private.profile_is_fan_eligible(uuid)
  from public, anon, authenticated;
revoke all on function private.actor_manages_venue(uuid, uuid)
  from public, anon, authenticated;
revoke all on function private.assert_common_actor()
  from public, anon, authenticated;
revoke all on function private.assert_fan_actor()
  from public, anon, authenticated;
revoke all on function private.assert_event_context_actor(uuid)
  from public, anon, authenticated;
revoke all on function private.assert_invitation_context_actor(uuid)
  from public, anon, authenticated;
revoke all on function private.assert_attendance_context_actor(uuid)
  from public, anon, authenticated;
revoke all on function private.assert_event_manager_or_fan_actor(uuid)
  from public, anon, authenticated;
revoke all on function private.reject_venue_owner_change()
  from public, anon, authenticated;

revoke all on function public.activate_fan_workspace(text, text, text, text, boolean, integer)
  from public, anon;
grant execute on function public.activate_fan_workspace(text, text, text, text, boolean, integer)
  to authenticated;

revoke all on function public.list_my_workspaces() from public, anon;
grant execute on function public.list_my_workspaces() to authenticated;

commit;
