begin;

-- City is no longer an account, group, Venue, event, discovery, or authorization
-- concept. Keep the existing safety requirements while removing the former
-- profile-completion dependency before the columns are dropped.
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

create or replace function private.profile_is_fan_eligible(target_profile_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select private.profile_is_common_eligible(target_profile_id)
    and exists (
      select 1
      from public.profiles as profile
      where profile.id = target_profile_id
        and profile.handle is not null
        and profile.display_name is not null
        and profile.profile_completed_at is not null
        and profile.fan_enabled_at is not null
    );
$function$;

create or replace function public.current_actor_is_community_eligible()
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select exists (
    select 1
    from auth.users as auth_user
    join public.profiles as profile on profile.id = auth_user.id
    where auth_user.id = auth.uid()
      and auth_user.email_confirmed_at is not null
      and profile.adult_attested_at is not null
      and profile.rules_version = private.current_rules_version()
      and profile.rules_accepted_at is not null
      and profile.handle is not null
      and profile.display_name is not null
      and profile.profile_completed_at is not null
      and profile.suspended_at is null
  );
$function$;

-- Remove each superseded RPC whose signature, return projection, or body still
-- contains the old city contract. Policy-bound eligibility helpers above keep
-- their OIDs and are deliberately excluded.
do $drop_city_functions$
declare
  target record;
begin
  for target in
    select
      namespace.nspname,
      procedure.proname,
      pg_get_function_identity_arguments(procedure.oid) as identity_arguments
    from pg_proc as procedure
    join pg_namespace as namespace on namespace.oid = procedure.pronamespace
    where namespace.nspname in ('public', 'private')
      and procedure.prokind = 'f'
      and pg_get_functiondef(procedure.oid)
        ~* 'city_id|city_name|public\.cities|input_city|selected_city|''city'''
      and not (
        namespace.nspname = 'private'
        and procedure.proname in ('assert_safety_actor', 'profile_is_fan_eligible')
      )
      and not (
        namespace.nspname = 'public'
        and procedure.proname = 'current_actor_is_community_eligible'
      )
    order by namespace.nspname, procedure.proname, procedure.oid
  loop
    execute format(
      'drop function %I.%I(%s) cascade',
      target.nspname,
      target.proname,
      target.identity_arguments
    );
  end loop;
end;
$drop_city_functions$;

drop index if exists public.profiles_city_id_idx;
drop index if exists public.venues_city_verification_idx;
drop index if exists public.events_city_status_starts_idx;

alter table public.profiles
  drop constraint if exists profiles_completion_fields_check;
alter table public.profiles drop column city_id;
alter table public.groups drop column city_id;
alter table public.venues drop column city_id;
alter table public.events drop column city_id;

alter table public.profiles
  add constraint profiles_completion_fields_check check (
    profile_completed_at is null
    or (
      handle is not null
      and display_name is not null
      and adult_attested_at is not null
      and rules_version is not null
      and rules_accepted_at is not null
    )
  );

drop table public.cities;

-- Common and Fan assertions are also reused by read projections. Preserve the
-- row lock for writable transactions while allowing those projections to run
-- inside PostgREST or explicit read-only transactions.
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

update public.groups as supporter_group
set
  lifecycle = 'active',
  activated_at = coalesce(supporter_group.activated_at, statement_timestamp())
where supporter_group.visibility = 'discoverable'
  and supporter_group.lifecycle = 'forming'
  and supporter_group.suspended_at is null;

create or replace function private.recalculate_group_discoverability(input_group_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $function$
declare
  target_group public.groups%rowtype;
  gate_passes boolean;
begin
  if input_group_id is null then
    return false;
  end if;

  select supporter_group.*
  into target_group
  from public.groups as supporter_group
  where supporter_group.id = input_group_id
  for update;

  if not found or target_group.lifecycle = 'archived' then
    return false;
  end if;

  if target_group.suspended_at is not null then
    update public.groups as supporter_group
    set lifecycle = 'suspended', activated_at = null
    where supporter_group.id = input_group_id
      and (
        supporter_group.lifecycle <> 'suspended'
        or supporter_group.activated_at is not null
      );
    return false;
  end if;

  select case
    when target_group.visibility = 'discoverable' then gate.gate_satisfied
    else gate.owner_is_active
  end
  into gate_passes
  from private.group_discovery_gate(input_group_id) as gate;

  update public.groups as supporter_group
  set
    lifecycle = case
      when gate_passes then 'active'::public.group_lifecycle
      else 'forming'::public.group_lifecycle
    end,
    activated_at = case
      when gate_passes then coalesce(supporter_group.activated_at, statement_timestamp())
      else null
    end
  where supporter_group.id = input_group_id;

  return gate_passes;
end;
$function$;

comment on function private.recalculate_group_discoverability(uuid) is
  'Preserves archive and suspension boundaries; unlisted groups require an active owner, while discoverable groups additionally require a public description. Neither path uses locality.';

-- Origin and private-home suggestions retain only an actor-scoped rolling
-- request count. Queries, labels, addresses, and coordinates are never stored.
create table private.location_search_rate_limits (
  actor_id uuid not null references public.profiles(id) on delete cascade,
  purpose text not null check (purpose in ('origin', 'private_home')),
  window_started_at timestamptz not null,
  request_count integer not null check (request_count between 0 and 30),
  primary key (actor_id, purpose)
);

comment on table private.location_search_rate_limits is
  'Server-controlled per-actor request counters for ephemeral geocoder purposes; no query or result data is retained.';

alter table private.location_search_rate_limits enable row level security;
alter table private.location_search_rate_limits force row level security;
revoke all on table private.location_search_rate_limits
  from public, anon, authenticated, service_role;

create or replace function public.claim_ephemeral_location_search(input_purpose text)
returns table (claim_granted boolean)
language plpgsql
security definer
set search_path = ''
as $function$
declare
  caller_id uuid := private.assert_common_actor();
  normalized_purpose text := lower(btrim(coalesce(input_purpose, '')));
  claim_time timestamptz := clock_timestamp();
  current_count integer;
begin
  if normalized_purpose not in ('origin', 'private_home') then
    raise exception using errcode = 'P0001', message = 'VALIDATION_FAILED';
  end if;

  insert into private.location_search_rate_limits (
    actor_id, purpose, window_started_at, request_count
  ) values (
    caller_id, normalized_purpose, claim_time, 1
  )
  on conflict (actor_id, purpose) do update
  set
    window_started_at = case
      when private.location_search_rate_limits.window_started_at
        <= claim_time - interval '1 minute' then claim_time
      else private.location_search_rate_limits.window_started_at
    end,
    request_count = case
      when private.location_search_rate_limits.window_started_at
        <= claim_time - interval '1 minute' then 1
      else least(private.location_search_rate_limits.request_count + 1, 30)
    end
  returning request_count into current_count;

  return query select current_count <= 20;
end;
$function$;

revoke all on function public.claim_ephemeral_location_search(text)
  from public, anon, service_role;
grant execute on function public.claim_ephemeral_location_search(text) to authenticated;

create or replace function public.claim_public_address_search(
  input_query text,
  input_country_code text,
  input_location_kind text
)
returns table (
  query_digest text,
  result_payload jsonb,
  cache_hit boolean,
  claim_granted boolean,
  retry_after_ms integer
)
language plpgsql
security definer
set search_path = ''
as $function$
declare
  normalized_query text;
  normalized_country text;
  normalized_kind text;
  target_digest text;
  cached_payload jsonb;
  allowed_at timestamptz;
  claimed_at timestamptz;
begin
  normalized_kind := lower(btrim(coalesce(input_location_kind, '')));
  if normalized_kind <> 'public_address' then
    raise exception using errcode = 'P0001', message = 'VALIDATION_FAILED';
  end if;

  normalized_query := private.normalize_public_address_term(input_query);
  normalized_country := private.normalize_public_address_term(input_country_code);
  if char_length(normalized_query) not between 3 and 160
    or normalized_country <> 'il' then
    raise exception using errcode = 'P0001', message = 'VALIDATION_FAILED';
  end if;

  target_digest := encode(
    extensions.digest(
      convert_to(normalized_query || chr(31) || normalized_country, 'UTF8'),
      'sha256'
    ),
    'hex'
  );

  select cache.result_payload
  into cached_payload
  from private.public_address_cache as cache
  where cache.query_digest = target_digest
    and cache.expires_at > clock_timestamp();

  if found then
    return query select target_digest, cached_payload, true, false, 0;
    return;
  end if;

  delete from private.public_address_cache as cache
  where cache.query_digest = target_digest
    and cache.expires_at <= clock_timestamp();

  select rate.next_allowed_at
  into allowed_at
  from private.public_geocoder_rate_limit as rate
  where rate.singleton
  for update;

  claimed_at := clock_timestamp();
  if allowed_at > claimed_at then
    return query select
      target_digest,
      null::jsonb,
      false,
      false,
      greatest(1, ceil(date_part('epoch', allowed_at - claimed_at) * 1000)::integer);
    return;
  end if;

  update private.public_geocoder_rate_limit
  set next_allowed_at = claimed_at + interval '1 second'
  where singleton;

  return query select target_digest, null::jsonb, false, true, 0;
end;
$function$;

create or replace function public.store_public_address_search(
  input_query_digest text,
  input_results jsonb,
  input_ttl_seconds integer
)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if input_query_digest is null
    or input_query_digest !~ '^[0-9a-f]{64}$'
    or jsonb_typeof(input_results) <> 'array'
    or jsonb_array_length(input_results) > 5
    or input_ttl_seconds not between 60 and 604800 then
    raise exception using errcode = 'P0001', message = 'VALIDATION_FAILED';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(input_results) as result(value)
    where jsonb_typeof(result.value) <> 'object'
      or not (result.value ?& array['id', 'label', 'latitude', 'longitude'])
      or (select count(*) from jsonb_object_keys(result.value)) <> 4
      or jsonb_typeof(result.value -> 'id') <> 'string'
      or jsonb_typeof(result.value -> 'label') <> 'string'
      or jsonb_typeof(result.value -> 'latitude') <> 'number'
      or jsonb_typeof(result.value -> 'longitude') <> 'number'
      or char_length(result.value ->> 'id') not between 1 and 120
      or char_length(result.value ->> 'label') not between 1 and 500
      or (result.value ->> 'latitude')::numeric not between 29 and 34
      or (result.value ->> 'longitude')::numeric not between 34 and 36
  ) then
    raise exception using errcode = 'P0001', message = 'VALIDATION_FAILED';
  end if;

  insert into private.public_address_cache (query_digest, result_payload, expires_at)
  values (
    input_query_digest,
    input_results,
    clock_timestamp() + make_interval(secs => input_ttl_seconds)
  )
  on conflict (query_digest) do update
  set result_payload = excluded.result_payload,
      expires_at = excluded.expires_at;
end;
$function$;

revoke all on function public.claim_public_address_search(text, text, text)
  from public, anon, authenticated;
revoke all on function public.store_public_address_search(text, jsonb, integer)
  from public, anon, authenticated;
grant execute on function public.claim_public_address_search(text, text, text)
  to service_role;
grant execute on function public.store_public_address_search(text, jsonb, integer)
  to service_role;

create or replace function public.activate_fan_workspace(
  input_handle text,
  input_display_name text,
  input_bio text,
  input_adult_attested boolean,
  input_rules_version integer,
  audit_request_id uuid default null
)
returns table (
  handle text,
  profile_completed_at timestamptz,
  fan_enabled_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $function$
declare
  actor_id uuid := private.assert_actor(false);
  normalized_handle text := lower(btrim(input_handle));
  normalized_display_name text := btrim(input_display_name);
  normalized_bio text := nullif(btrim(input_bio), '');
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
  if normalized_handle !~ '^[a-z0-9_]{3,30}$'
    or char_length(normalized_display_name) not between 2 and 60
    or (normalized_bio is not null and char_length(normalized_bio) > 500) then
    raise exception using errcode = 'P0001', message = 'VALIDATION_FAILED';
  end if;
  if input_adult_attested is distinct from true then
    raise exception using errcode = 'P0001', message = 'ADULT_ATTESTATION_REQUIRED';
  end if;
  if input_rules_version is distinct from current_version then
    raise exception using errcode = 'P0001', message = 'RULES_ACCEPTANCE_REQUIRED';
  end if;

  update public.profiles as profile
  set handle = normalized_handle,
      display_name = normalized_display_name,
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

  perform private.write_security_audit(
    actor_id,
    'workspace.fan.activate',
    'profile',
    actor_id,
    'succeeded',
    audit_request_id,
    '{}'::jsonb
  );

  return query
  select profile.handle, profile.profile_completed_at, profile.fan_enabled_at
  from public.profiles as profile
  where profile.id = actor_id;
exception
  when unique_violation then
    raise exception using errcode = 'P0001', message = 'HANDLE_UNAVAILABLE';
end;
$function$;

create or replace function public.complete_profile(
  input_handle text,
  input_display_name text,
  input_bio text,
  input_adult_attested boolean,
  input_rules_version integer
)
returns table (handle text, profile_completed_at timestamptz)
language sql
security definer
set search_path = ''
as $function$
  select activated.handle, activated.profile_completed_at
  from public.activate_fan_workspace(
    input_handle,
    input_display_name,
    input_bio,
    input_adult_attested,
    input_rules_version,
    null
  ) as activated;
$function$;

create or replace function public.create_group(
  input_name text,
  input_slug text,
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
  actor_id uuid := private.assert_fan_actor();
  normalized_name text := btrim(input_name);
  normalized_slug text := lower(btrim(input_slug));
  normalized_description text := nullif(btrim(input_description), '');
  selected_visibility public.group_visibility;
  created_group_id uuid;
begin
  if char_length(normalized_name) not between 3 and 80
    or normalized_slug !~ '^[a-z0-9]+(-[a-z0-9]+)*$'
    or char_length(normalized_slug) not between 3 and 60
    or (normalized_description is not null and char_length(normalized_description) > 2000)
    or input_visibility not in ('discoverable', 'unlisted') then
    raise exception using errcode = 'P0001', message = 'VALIDATION_FAILED';
  end if;
  if input_team_id is not null and not exists (
    select 1 from public.teams as team
    where team.id = input_team_id and team.active
  ) then
    raise exception using errcode = 'P0001', message = 'VALIDATION_FAILED';
  end if;

  selected_visibility := input_visibility::public.group_visibility;
  insert into public.groups (
    slug, name, owner_id, team_id, visibility, lifecycle, description, activated_at
  ) values (
    normalized_slug,
    normalized_name,
    actor_id,
    input_team_id,
    selected_visibility,
    'active',
    normalized_description,
    statement_timestamp()
  ) returning id into created_group_id;

  insert into public.group_memberships (
    group_id, user_id, role, status, reviewed_by, reviewed_at
  ) values (
    created_group_id, actor_id, 'owner', 'active', actor_id, statement_timestamp()
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

  return query select created_group_id, normalized_slug, 'active'::text;
exception
  when unique_violation then
    raise exception using errcode = 'P0001', message = 'GROUP_SLUG_UNAVAILABLE';
end;
$function$;

create or replace function public.suggest_similar_groups(
  input_name text,
  input_team_id uuid,
  input_limit integer default 5
)
returns table (
  group_id uuid,
  slug text,
  name text,
  lifecycle text,
  team_name text,
  similarity_score real
)
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  actor_id uuid := private.assert_fan_actor();
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
    team.name,
    extensions.similarity(lower(supporter_group.name), normalized_name)::real
  from public.groups as supporter_group
  left join public.teams as team on team.id = supporter_group.team_id
  where supporter_group.visibility = 'discoverable'
    and supporter_group.lifecycle = 'active'
    and supporter_group.suspended_at is null
    and (input_team_id is null or supporter_group.team_id = input_team_id)
    and extensions.similarity(lower(supporter_group.name), normalized_name) >= 0.25
    and not exists (
      select 1
      from public.group_bans as ban
      where ban.group_id = supporter_group.id
        and ban.user_id = actor_id
        and ban.revoked_at is null
    )
  order by
    extensions.similarity(lower(supporter_group.name), normalized_name) desc,
    lower(supporter_group.name),
    supporter_group.id
  limit bounded_limit;
end;
$function$;

create or replace function public.search_groups(
  input_query text default null,
  input_team_id uuid default null,
  input_after_member_count bigint default null,
  input_after_name text default null,
  input_after_id uuid default null,
  input_limit integer default 20
)
returns table (
  group_id uuid,
  slug text,
  name text,
  description text,
  team_name text,
  active_member_count bigint,
  cursor_member_count bigint,
  cursor_name text,
  has_more boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  actor_id uuid := auth.uid();
  normalized_query text := nullif(lower(btrim(input_query)), '');
  normalized_after_name text := nullif(lower(btrim(input_after_name)), '');
  bounded_limit integer := least(greatest(coalesce(input_limit, 20), 1), 50);
begin
  if normalized_query is not null and char_length(normalized_query) not between 2 and 80 then
    raise exception using errcode = 'P0001', message = 'VALIDATION_FAILED';
  end if;
  if num_nonnulls(input_after_member_count, normalized_after_name, input_after_id) not in (0, 3)
    or input_after_member_count < 0 then
    raise exception using errcode = 'P0001', message = 'VALIDATION_FAILED';
  end if;

  return query
  with eligible_groups as (
    select
      supporter_group.id as group_id,
      supporter_group.slug,
      supporter_group.name,
      supporter_group.description,
      team.name as team_name,
      (
        select count(*)
        from public.group_memberships as membership
        join public.profiles as profile on profile.id = membership.user_id
        where membership.group_id = supporter_group.id
          and membership.status = 'active'
          and private.profile_is_fan_eligible(profile.id)
          and not exists (
            select 1 from public.group_bans as ban
            where ban.group_id = membership.group_id
              and ban.user_id = membership.user_id
              and ban.revoked_at is null
          )
      ) as member_count,
      lower(supporter_group.name) as normalized_name
    from public.groups as supporter_group
    left join public.teams as team on team.id = supporter_group.team_id
    where supporter_group.visibility = 'discoverable'
      and supporter_group.lifecycle = 'active'
      and supporter_group.suspended_at is null
      and (input_team_id is null or supporter_group.team_id = input_team_id)
      and (
        normalized_query is null
        or lower(supporter_group.name) like '%' || normalized_query || '%'
        or extensions.similarity(lower(supporter_group.name), normalized_query) >= 0.2
      )
      and (
        actor_id is null
        or (
          not private.users_are_blocked(actor_id, supporter_group.owner_id)
          and not exists (
            select 1 from public.group_bans as viewer_ban
            where viewer_ban.group_id = supporter_group.id
              and viewer_ban.user_id = actor_id
              and viewer_ban.revoked_at is null
          )
        )
      )
  ), cursor_page as (
    select candidate.*
    from eligible_groups as candidate
    where input_after_member_count is null
      or candidate.member_count < input_after_member_count
      or (
        candidate.member_count = input_after_member_count
        and candidate.normalized_name > normalized_after_name
      )
      or (
        candidate.member_count = input_after_member_count
        and candidate.normalized_name = normalized_after_name
        and candidate.group_id > input_after_id
      )
    order by candidate.member_count desc, candidate.normalized_name, candidate.group_id
    limit bounded_limit + 1
  ), numbered_page as (
    select
      page.*,
      row_number() over (
        order by page.member_count desc, page.normalized_name, page.group_id
      ) as row_number,
      count(*) over () > bounded_limit as has_more
    from cursor_page as page
  )
  select
    page.group_id,
    page.slug,
    page.name,
    coalesce(page.description, ''),
    page.team_name,
    page.member_count,
    page.member_count,
    page.normalized_name,
    page.has_more
  from numbered_page as page
  where page.row_number <= bounded_limit
  order by page.member_count desc, page.normalized_name, page.group_id;
end;
$function$;

comment on function public.search_groups(text, uuid, bigint, text, uuid, integer) is
  'Returns globally discoverable groups ordered by active membership, normalized name, and stable ID with a matching keyset cursor.';

create or replace function public.create_venue(
  input_name text,
  input_slug text,
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
declare
  actor_id uuid := private.assert_common_actor();
  created_venue public.venues%rowtype;
begin
  if input_longitude is null
    or input_latitude is null
    or input_longitude not between 34 and 36
    or input_latitude not between 29 and 34 then
    raise exception using errcode = 'P0001', message = 'VALIDATION_FAILED';
  end if;

  insert into public.venues (
    owner_id, slug, name, address_text, location,
    description, screen_count, stated_capacity
  ) values (
    actor_id,
    lower(btrim(input_slug)),
    btrim(input_name),
    btrim(input_address_text),
    extensions.st_setsrid(
      extensions.st_makepoint(input_longitude, input_latitude), 4326
    )::extensions.geography,
    btrim(input_description),
    input_screen_count,
    input_stated_capacity
  ) returning * into created_venue;

  perform private.write_security_audit(
    actor_id,
    'venue.create',
    'venue',
    created_venue.id,
    'succeeded',
    audit_request_id,
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
declare
  actor_id uuid := private.assert_common_actor();
  target_venue public.venues%rowtype;
begin
  select venue.*
  into target_venue
  from public.venues as venue
  where venue.id = input_venue_id
  for update;

  if not found
    or not private.actor_manages_venue(actor_id, input_venue_id)
    or target_venue.verification_status = 'suspended'
    or input_longitude is null
    or input_latitude is null
    or input_longitude not between 34 and 36
    or input_latitude not between 29 and 34 then
    raise exception using errcode = 'P0001', message = 'NOT_ALLOWED';
  end if;

  update public.venues as venue
  set slug = lower(btrim(input_slug)),
      name = btrim(input_name),
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
    actor_id,
    'venue.update',
    'venue',
    target_venue.id,
    'succeeded',
    audit_request_id,
    jsonb_build_object('verification_status', target_venue.verification_status::text)
  );

  return query select
    target_venue.id, target_venue.slug, target_venue.verification_status::text;
exception
  when unique_violation then
    raise exception using errcode = 'P0001', message = 'VENUE_SLUG_UNAVAILABLE';
end;
$function$;

create or replace function public.create_venue_workspace_v2(
  input_name text,
  input_slug text,
  input_address_text text,
  input_longitude numeric,
  input_latitude numeric,
  input_description text,
  input_main_space_name text,
  input_main_space_capacity integer,
  input_facilities text[],
  input_house_information text,
  input_default_attendance_mode text,
  input_default_requires_approval boolean,
  input_adult_attested boolean,
  input_representation_attested boolean,
  input_rules_version integer,
  audit_request_id uuid default null
)
returns table (venue_id uuid, slug text, verification_status text)
language plpgsql
security definer
set search_path = ''
as $function$
declare
  actor_id uuid := private.assert_actor(false);
  actor_profile public.profiles%rowtype;
  created_venue public.venues%rowtype;
  parsed_facilities public.venue_facility[];
  parsed_mode public.event_attendance_mode;
  current_version integer := private.current_rules_version();
  normalized_house_information text := coalesce(btrim(input_house_information), '');
begin
  select profile.*
  into strict actor_profile
  from public.profiles as profile
  where profile.id = actor_id
  for update;

  if actor_profile.community_restricted_at is not null then
    raise exception using errcode = 'P0001', message = 'ACCOUNT_RESTRICTED';
  end if;
  if input_adult_attested is distinct from true then
    raise exception using errcode = 'P0001', message = 'ADULT_ATTESTATION_REQUIRED';
  end if;
  if input_representation_attested is distinct from true then
    raise exception using errcode = 'P0001', message = 'REPRESENTATION_ATTESTATION_REQUIRED';
  end if;
  if input_rules_version is distinct from current_version then
    raise exception using errcode = 'P0001', message = 'RULES_ACCEPTANCE_REQUIRED';
  end if;

  begin
    parsed_mode := input_default_attendance_mode::public.event_attendance_mode;
    select coalesce(array_agg(facility::public.venue_facility order by ordinal), '{}')
    into parsed_facilities
    from unnest(coalesce(input_facilities, '{}'))
      with ordinality as item(facility, ordinal);
  exception when invalid_text_representation then
    raise exception using errcode = 'P0001', message = 'VALIDATION_FAILED';
  end;

  if input_longitude is null
    or input_latitude is null
    or input_longitude not between 34 and 36
    or input_latitude not between 29 and 34
    or (parsed_mode = 'reservations' and input_main_space_capacity is null)
    or (parsed_mode = 'open_door' and input_main_space_capacity is not null)
    or (parsed_mode = 'open_door' and input_default_requires_approval is distinct from false)
    or (
      input_main_space_capacity is not null
      and input_main_space_capacity not between 1 and 100000
    )
    or nullif(btrim(input_main_space_name), '') is null
    or char_length(btrim(input_main_space_name)) > 120
    or char_length(normalized_house_information) > 1000
    or input_default_requires_approval is null
    or cardinality(parsed_facilities) > 7
    or not private.venue_facilities_are_unique(parsed_facilities) then
    raise exception using errcode = 'P0001', message = 'VALIDATION_FAILED';
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

  insert into public.venues (
    owner_id, slug, name, address_text, location, description,
    screen_count, stated_capacity, facilities, house_information,
    default_attendance_mode, default_requires_approval,
    business_representation_attested_at, business_representation_attested_by
  ) values (
    actor_id,
    lower(btrim(input_slug)),
    btrim(input_name),
    btrim(input_address_text),
    extensions.st_setsrid(
      extensions.st_makepoint(
        input_longitude::double precision,
        input_latitude::double precision
      ),
      4326
    )::extensions.geography,
    btrim(input_description),
    1,
    input_main_space_capacity,
    parsed_facilities,
    normalized_house_information,
    parsed_mode,
    case when parsed_mode = 'open_door' then false else input_default_requires_approval end,
    statement_timestamp(),
    actor_id
  ) returning * into created_venue;

  insert into public.venue_spaces (venue_id, name, capacity, active, sort_order)
  values (
    created_venue.id,
    btrim(input_main_space_name),
    input_main_space_capacity,
    true,
    0
  );

  perform private.write_security_audit(
    actor_id,
    'venue.workspace.activate',
    'venue',
    created_venue.id,
    'succeeded',
    audit_request_id,
    jsonb_build_object(
      'verification_status', created_venue.verification_status::text,
      'space_count', 1,
      'attendance_mode', parsed_mode::text
    )
  );

  return query select
    created_venue.id, created_venue.slug, created_venue.verification_status::text;
exception
  when unique_violation then
    raise exception using errcode = 'P0001', message = 'VENUE_SLUG_UNAVAILABLE';
end;
$function$;

create or replace function public.create_venue_workspace(
  input_name text,
  input_slug text,
  input_address_text text,
  input_longitude numeric,
  input_latitude numeric,
  input_description text,
  input_main_space_name text,
  input_main_space_capacity integer,
  input_facilities text[],
  input_house_information text,
  input_default_requires_approval boolean,
  input_adult_attested boolean,
  input_representation_attested boolean,
  input_rules_version integer,
  audit_request_id uuid default null
)
returns table (venue_id uuid, slug text, verification_status text)
language sql
security definer
set search_path = ''
as $function$
  select activated.venue_id, activated.slug, activated.verification_status
  from public.create_venue_workspace_v2(
    input_name,
    input_slug,
    input_address_text,
    input_longitude,
    input_latitude,
    input_description,
    input_main_space_name,
    input_main_space_capacity,
    input_facilities,
    input_house_information,
    'reservations',
    input_default_requires_approval,
    input_adult_attested,
    input_representation_attested,
    input_rules_version,
    audit_request_id
  ) as activated;
$function$;

create or replace function public.update_venue_workspace_v2(
  input_venue_id uuid,
  input_name text,
  input_slug text,
  input_address_text text,
  input_longitude numeric,
  input_latitude numeric,
  input_description text,
  input_facilities text[],
  input_house_information text,
  input_default_attendance_mode text,
  input_default_requires_approval boolean,
  audit_request_id uuid default null
)
returns table (venue_id uuid, slug text, verification_status text)
language plpgsql
security definer
set search_path = ''
as $function$
declare
  actor_id uuid := private.assert_common_actor();
  target_venue public.venues%rowtype;
  parsed_facilities public.venue_facility[];
  parsed_mode public.event_attendance_mode;
  normalized_house_information text := coalesce(btrim(input_house_information), '');
begin
  if not private.actor_manages_venue(actor_id, input_venue_id) then
    raise exception using errcode = 'P0001', message = 'NOT_ALLOWED';
  end if;

  begin
    parsed_mode := input_default_attendance_mode::public.event_attendance_mode;
    select coalesce(array_agg(facility::public.venue_facility order by ordinal), '{}')
    into parsed_facilities
    from unnest(coalesce(input_facilities, '{}'))
      with ordinality as item(facility, ordinal);
  exception when invalid_text_representation then
    raise exception using errcode = 'P0001', message = 'VALIDATION_FAILED';
  end;

  if input_longitude is null
    or input_latitude is null
    or input_longitude not between 34 and 36
    or input_latitude not between 29 and 34
    or char_length(normalized_house_information) > 1000
    or input_default_requires_approval is null
    or (parsed_mode = 'open_door' and input_default_requires_approval)
    or cardinality(parsed_facilities) > 7
    or not private.venue_facilities_are_unique(parsed_facilities) then
    raise exception using errcode = 'P0001', message = 'VALIDATION_FAILED';
  end if;

  update public.venues as venue
  set slug = lower(btrim(input_slug)),
      name = btrim(input_name),
      address_text = btrim(input_address_text),
      location = extensions.st_setsrid(
        extensions.st_makepoint(
          input_longitude::double precision,
          input_latitude::double precision
        ),
        4326
      )::extensions.geography,
      description = btrim(input_description),
      facilities = parsed_facilities,
      house_information = normalized_house_information,
      default_attendance_mode = parsed_mode,
      default_requires_approval = case
        when parsed_mode = 'open_door' then false
        else input_default_requires_approval
      end
  where venue.id = input_venue_id
  returning * into target_venue;

  if parsed_mode = 'open_door' then
    update public.venue_spaces as space
    set capacity = null
    where space.venue_id = input_venue_id;
  end if;

  perform private.write_security_audit(
    actor_id,
    'venue.workspace.update',
    'venue',
    target_venue.id,
    'succeeded',
    audit_request_id,
    jsonb_build_object(
      'verification_status', target_venue.verification_status::text,
      'attendance_mode', parsed_mode::text
    )
  );

  return query select
    target_venue.id, target_venue.slug, target_venue.verification_status::text;
exception
  when unique_violation then
    raise exception using errcode = 'P0001', message = 'VENUE_SLUG_UNAVAILABLE';
end;
$function$;

create or replace function public.update_venue_workspace(
  input_venue_id uuid,
  input_name text,
  input_slug text,
  input_address_text text,
  input_longitude numeric,
  input_latitude numeric,
  input_description text,
  input_facilities text[],
  input_house_information text,
  input_default_requires_approval boolean,
  audit_request_id uuid default null
)
returns table (venue_id uuid, slug text, verification_status text)
language sql
security definer
set search_path = ''
as $function$
  select updated.venue_id, updated.slug, updated.verification_status
  from public.update_venue_workspace_v2(
    input_venue_id,
    input_name,
    input_slug,
    input_address_text,
    input_longitude,
    input_latitude,
    input_description,
    input_facilities,
    input_house_information,
    'reservations',
    input_default_requires_approval,
    audit_request_id
  ) as updated;
$function$;

create or replace function private.create_or_update_event_core(
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
    or input_match_id is null
    or input_capacity is null
    or input_requires_approval is null
    or input_starts_at <= statement_timestamp()
    or input_ends_at <= input_starts_at then
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
      or input_public_longitude not between 34 and 36
      or input_public_latitude not between 29 and 34
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
      or input_private_longitude not between 34 and 36
      or input_private_latitude not between 29 and 34
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
      join public.groups as supporter_group on supporter_group.id = membership.group_id
      where membership.group_id = input_audience_group_id
        and membership.user_id = actor_id
        and membership.status = 'active'
        and supporter_group.lifecycle = 'active'
        and supporter_group.suspended_at is null
        and not exists (
          select 1 from public.group_bans as ban
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
          select 1 from public.friendships as friendship
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
      created_by, host_user_id, host_venue_id, organizing_group_id,
      match_id, title, description, expected_activity, cost_description,
      event_rules, commercial_affiliation, host_presence_confirmed_at,
      starts_at, ends_at, place_kind, venue_id, public_place_name,
      public_address_text, public_location, audience, audience_team_id,
      audience_group_id, capacity, requires_approval, status, published_at
    ) values (
      actor_id, resolved_host_user_id, input_host_venue_id,
      resolved_organizing_group_id, input_match_id, btrim(input_title),
      btrim(input_description), btrim(input_expected_activity),
      btrim(input_cost_description), btrim(input_event_rules),
      btrim(input_commercial_affiliation), statement_timestamp(),
      input_starts_at, input_ends_at, parsed_place, input_venue_id,
      case when parsed_place = 'public_place' then btrim(input_public_place_name) end,
      case when parsed_place = 'public_place' then btrim(input_public_address_text) end,
      public_point, parsed_audience, input_audience_team_id,
      input_audience_group_id, input_capacity, input_requires_approval,
      target_status,
      case when target_status = 'published' then statement_timestamp() end
    ) returning * into target_event;
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
    set organizing_group_id = resolved_organizing_group_id,
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
        place_kind = parsed_place,
        venue_id = input_venue_id,
        public_place_name = case
          when parsed_place = 'public_place' then btrim(input_public_place_name)
        end,
        public_address_text = case
          when parsed_place = 'public_place' then btrim(input_public_address_text)
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
        end
    where event.id = input_event_id
    returning * into target_event;
  end if;

  if parsed_place = 'home' then
    insert into public.event_private_locations (event_id, address_text, directions, location)
    values (
      target_event.id,
      btrim(input_private_address_text),
      nullif(btrim(input_private_directions), ''),
      private_point
    )
    on conflict on constraint event_private_locations_pkey do update
    set address_text = excluded.address_text,
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
  actor_id uuid;
  organizer_role public.group_role;
  audience_role public.group_role;
  governing_group_id uuid;
  governing_role public.group_role;
  existing_organizing_group_id uuid;
  locked_group_id uuid;
  locked_role public.group_role;
  group_ids uuid[];
  created_event_id uuid;
  core_status text;
  final_status public.event_status;
  group_governed boolean := false;
begin
  if input_intent is null or input_intent not in ('draft', 'publish') then
    raise exception using errcode = 'P0001', message = 'VALIDATION_FAILED';
  end if;

  group_governed := input_host_venue_id is null
    and (input_organizing_group_id is not null or input_audience = 'group');

  if input_event_id is not null then
    actor_id := private.assert_actor(false);
    select event.organizing_group_id
    into existing_organizing_group_id
    from public.events as event
    where event.id = input_event_id;
    if group_governed or existing_organizing_group_id is not null then
      raise exception using errcode = 'P0001', message = 'NOT_ALLOWED';
    end if;
  end if;

  if group_governed then
    actor_id := private.assert_fan_actor();
    if input_audience = 'group' and input_audience_group_id is null then
      raise exception using errcode = 'P0001', message = 'NOT_ALLOWED';
    end if;

    group_ids := array(
      select candidate.group_id
      from unnest(array[
        input_organizing_group_id,
        case when input_audience = 'group' then input_audience_group_id end
      ]) as candidate(group_id)
      where candidate.group_id is not null
      group by candidate.group_id
      order by candidate.group_id
    );

    foreach locked_group_id in array group_ids loop
      locked_role := private.lock_active_group_author_role(locked_group_id, actor_id);
      if locked_group_id = input_organizing_group_id then
        organizer_role := locked_role;
      end if;
      if input_audience = 'group' and locked_group_id = input_audience_group_id then
        audience_role := locked_role;
      end if;
    end loop;

    governing_group_id := coalesce(
      input_organizing_group_id,
      case when input_audience = 'group' then input_audience_group_id end
    );
    governing_role := case
      when input_organizing_group_id is not null then organizer_role
      else audience_role
    end;
  end if;

  select created.event_id, created.status
  into created_event_id, core_status
  from private.create_or_update_event_core(
    input_event_id,
    input_host_venue_id,
    case when group_governed then null else input_organizing_group_id end,
    input_match_id,
    input_title,
    input_description,
    input_expected_activity,
    input_cost_description,
    input_event_rules,
    input_commercial_affiliation,
    input_host_presence_confirmed,
    input_starts_at,
    input_ends_at,
    input_place_kind,
    input_venue_id,
    input_public_place_name,
    input_public_address_text,
    input_public_longitude,
    input_public_latitude,
    input_audience,
    input_audience_team_id,
    input_audience_group_id,
    input_capacity,
    input_requires_approval,
    input_private_address_text,
    input_private_directions,
    input_private_longitude,
    input_private_latitude,
    case when group_governed then 'draft' else input_intent end,
    audit_request_id
  ) as created;

  if not group_governed then
    return query select created_event_id, core_status;
    return;
  end if;

  final_status := case
    when input_intent = 'draft' then 'draft'::public.event_status
    when governing_role in ('owner', 'admin') then 'published'::public.event_status
    else 'pending_group_review'::public.event_status
  end;

  update public.events as event
  set organizing_group_id = governing_group_id,
      status = final_status,
      published_at = case
        when final_status = 'published' then coalesce(event.published_at, statement_timestamp())
      end,
      cancelled_at = null,
      cancel_reason = null
  where event.id = created_event_id;

  perform private.write_security_audit(
    actor_id,
    case
      when input_intent = 'draft' then 'event.group_draft'
      when final_status = 'published' then 'event.group_publish.author'
      else 'event.group_submit'
    end,
    'event',
    created_event_id,
    'succeeded',
    audit_request_id,
    jsonb_build_object(
      'organizing_group_id', governing_group_id,
      'audience_group_id', input_audience_group_id,
      'audience', input_audience,
      'author_role', governing_role::text,
      'status', final_status::text
    )
  );

  return query select created_event_id, final_status::text;
end;
$function$;

create or replace function public.create_group_event(
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
  input_place_kind text,
  input_public_place_name text,
  input_public_address_text text,
  input_public_longitude double precision,
  input_public_latitude double precision,
  input_audience text,
  input_audience_group_id uuid,
  input_capacity integer,
  input_private_address_text text,
  input_private_directions text,
  input_private_longitude double precision,
  input_private_latitude double precision,
  input_intent text,
  audit_request_id uuid default null
)
returns table (event_id uuid, status text)
language sql
security definer
set search_path = ''
as $function$
  select created.event_id, created.status
  from public.create_or_update_event(
    null,
    null,
    input_organizing_group_id,
    input_match_id,
    input_title,
    input_description,
    input_expected_activity,
    input_cost_description,
    input_event_rules,
    input_commercial_affiliation,
    input_host_presence_confirmed,
    input_starts_at,
    input_ends_at,
    input_place_kind,
    null,
    input_public_place_name,
    input_public_address_text,
    input_public_longitude,
    input_public_latitude,
    input_audience,
    null,
    input_audience_group_id,
    input_capacity,
    true,
    input_private_address_text,
    input_private_directions,
    input_private_longitude,
    input_private_latitude,
    input_intent,
    audit_request_id
  ) as created;
$function$;

create or replace function private.discover_event_page(
  input_mode text,
  input_lat double precision,
  input_lng double precision,
  input_radius_km integer,
  input_from timestamptz,
  input_to timestamptz,
  input_team_id uuid,
  input_competition_id uuid,
  input_match_id uuid,
  input_after_interest_score integer,
  input_after_distance_band integer,
  input_after_starts_at timestamptz,
  input_after_event_id uuid,
  input_limit integer
)
returns table (
  event_id uuid,
  title text,
  host_kind text,
  host_display_name text,
  host_venue_slug text,
  venue_verification_status text,
  match_id uuid,
  competition_name text,
  home_team_name text,
  away_team_name text,
  starts_at timestamptz,
  ends_at timestamptz,
  place_kind text,
  location_summary text,
  audience text,
  audience_group_name text,
  audience_team_name text,
  capacity integer,
  approved_attendee_count bigint,
  remaining_capacity integer,
  requires_approval boolean,
  interest_score integer,
  cursor_distance_band integer,
  has_more boolean
)
language plpgsql
security definer
stable
set search_path = ''
as $function$
#variable_conflict use_variable
declare
  actor_id uuid := auth.uid();
  origin extensions.geography(Point, 4326);
  bounded_limit integer;
begin
  if input_mode not in ('reservations', 'open_door', 'owned')
    or input_lat is null or input_lng is null
    or input_lat not between -90 and 90 or input_lng not between -180 and 180
    or input_radius_km is null or input_radius_km not in (5, 15, 30, 50)
    or not private.discovery_window_is_valid(input_from, input_to)
    or input_limit is null or input_limit not between 1 and 50
    or num_nonnulls(
      input_after_interest_score, input_after_distance_band,
      input_after_starts_at, input_after_event_id
    ) not in (0, 4)
    or (
      input_after_interest_score is not null
      and input_after_interest_score not between 0 and 15
    )
    or (
      input_after_distance_band is not null
      and input_after_distance_band not between 0 and 4
    )
    or (
      input_after_starts_at is not null
      and (input_after_starts_at < input_from or input_after_starts_at >= input_to)
    ) then
    raise exception using errcode = 'P0001', message = 'VALIDATION_FAILED';
  end if;
  bounded_limit := input_limit;
  origin := extensions.st_setsrid(
    extensions.st_makepoint(input_lng, input_lat), 4326
  )::extensions.geography;

  return query
  with spatial_candidates as (
    select
      public_event.id as event_id,
      round(extensions.st_distance(origin, public_event.public_location))::bigint
        as distance_meters
    from public.events as public_event
    where public_event.place_kind = 'public_place'
      and public_event.public_location is not null
      and extensions.st_dwithin(
        public_event.public_location, origin, input_radius_km * 1000.0
      )

    union all

    select
      venue_event.id,
      round(extensions.st_distance(origin, nearby_venue.location))::bigint
    from public.venues as nearby_venue
    join public.events as venue_event on venue_event.host_venue_id = nearby_venue.id
    where venue_event.place_kind = 'venue'
      and nearby_venue.archived_at is null
      and extensions.st_dwithin(
        nearby_venue.location, origin, input_radius_km * 1000.0
      )

    union all

    select
      private_location.event_id,
      round(extensions.st_distance(origin, private_location.location))::bigint
    from public.event_private_locations as private_location
    join public.events as home_event on home_event.id = private_location.event_id
    where home_event.place_kind = 'home'
      and extensions.st_dwithin(
        private_location.location, origin, input_radius_km * 1000.0
      )
  ),
  ranked_events as (
    select
      event.id as event_id,
      event.title,
      case when event.host_user_id is not null then 'person' else 'venue' end as host_kind,
      coalesce(host_profile.display_name, host_venue.name) as host_display_name,
      host_venue.slug as host_venue_slug,
      host_venue.verification_status::text as venue_verification_status,
      event.match_id,
      competition.name as competition_name,
      home_team.name as home_team_name,
      away_team.name as away_team_name,
      event.starts_at,
      event.ends_at,
      event.place_kind::text as place_kind,
      case
        when event.place_kind = 'home' and distance.distance_meters < 5000 then 'Within 5 km'
        when event.place_kind = 'home' and distance.distance_meters < 15000 then '5–15 km away'
        when event.place_kind = 'home' and distance.distance_meters < 50000 then '15–50 km away'
        when event.place_kind = 'home' then '50+ km away'
        when distance.distance_meters < 1000 then 'Within 1 km'
        when distance.distance_meters < 5000 then '1–5 km away'
        when distance.distance_meters < 15000 then '5–15 km away'
        when distance.distance_meters < 50000 then '15–50 km away'
        else '50+ km away'
      end as location_summary,
      event.audience::text as audience,
      audience_group.name as audience_group_name,
      audience_team.name as audience_team_name,
      event.capacity,
      attendance_counts.approved_count as approved_attendee_count,
      case when event.capacity is null then null
        else greatest(event.capacity - attendance_counts.approved_count::integer, 0) end
        as remaining_capacity,
      event.requires_approval,
      case when actor_id is null then 0 else
        case when exists (
          select 1 from public.subscriptions as subscription
          where subscription.user_id = actor_id and subscription.kind = 'team'
            and subscription.team_id in (
              match.home_team_id, match.away_team_id, event.audience_team_id
            )
        ) then 8 else 0 end
        + case when exists (
          select 1 from public.subscriptions as subscription
          where subscription.user_id = actor_id and subscription.kind = 'competition'
            and subscription.competition_id = match.competition_id
        ) then 4 else 0 end
        + case when exists (
          select 1 from public.subscriptions as subscription
          where subscription.user_id = actor_id and subscription.kind = 'sport'
            and subscription.sport_id = competition.sport_id
        ) then 2 else 0 end
        + case when exists (
          select 1 from public.venue_follows as venue_follow
          where venue_follow.user_id = actor_id
            and venue_follow.venue_id = event.host_venue_id
        ) then 1 else 0 end
      end as interest_score,
      case
        when event.place_kind = 'home' and distance.distance_meters < 5000 then 0
        when event.place_kind = 'home' and distance.distance_meters < 15000 then 1
        when event.place_kind = 'home' and distance.distance_meters < 50000 then 2
        when event.place_kind = 'home' then 3
        when distance.distance_meters < 1000 then 0
        when distance.distance_meters < 5000 then 1
        when distance.distance_meters < 15000 then 2
        when distance.distance_meters < 50000 then 3
        else 4
      end as distance_band
    from public.events as event
    join public.matches as match on match.id = event.match_id
    join public.competitions as competition on competition.id = match.competition_id
    join public.teams as home_team on home_team.id = match.home_team_id
    join public.teams as away_team on away_team.id = match.away_team_id
    join spatial_candidates as distance on distance.event_id = event.id
    left join public.profiles as host_profile on host_profile.id = event.host_user_id
    left join public.venues as host_venue on host_venue.id = event.host_venue_id
    left join public.groups as audience_group on audience_group.id = event.audience_group_id
    left join public.teams as audience_team on audience_team.id = event.audience_team_id
    cross join lateral (
      select count(*) as approved_count
      from public.event_attendance as attendance
      where attendance.event_id = event.id and attendance.status = 'approved'
    ) as attendance_counts
    where event.status = 'published'
      and event.starts_at > statement_timestamp()
      and event.starts_at >= input_from and event.starts_at < input_to
      and event.audience <> 'invite_only'
      and (input_team_id is null or input_team_id in (match.home_team_id, match.away_team_id))
      and (input_competition_id is null or match.competition_id = input_competition_id)
      and (input_match_id is null or match.id = input_match_id)
      and (
        private.event_is_visible_to_actor(event.id, actor_id)
        or private.actor_manages_event(event.id, actor_id)
      )
      and (
        actor_id is null
        or event.created_by = actor_id
        or private.actor_manages_event(event.id, actor_id)
        or (
          not exists (
            select 1
            from public.event_attendance as existing_attendance
            where existing_attendance.event_id = event.id
              and existing_attendance.user_id = actor_id
          )
          and not exists (
            select 1
            from public.event_invitations as existing_invitation
            where existing_invitation.event_id = event.id
              and existing_invitation.invitee_id = actor_id
          )
        )
      )
      and (event.host_venue_id is not null or private.profile_is_fan_eligible(actor_id))
      and (
        (input_mode = 'reservations' and event.attendance_mode = 'reservations')
        or (input_mode = 'open_door' and event.attendance_mode = 'open_door')
        or (
          input_mode = 'owned'
          and actor_id is not null
          and exists (
            select 1 from public.venue_memberships as membership
            where membership.user_id = actor_id
              and membership.venue_id = event.host_venue_id
              and membership.status = 'active'
              and membership.revoked_at is null
          )
        )
      )
      and (
        event.capacity is null
        or attendance_counts.approved_count < event.capacity
        or private.actor_manages_event(event.id, actor_id)
      )
      and (
        host_venue.id is null
        or (
          host_venue.verification_status <> 'suspended'
          and host_venue.suspended_at is null
          and host_venue.archived_at is null
        )
      )
  ),
  cursor_page as (
    select ranked.*
    from ranked_events as ranked
    where input_after_interest_score is null
      or ranked.interest_score < input_after_interest_score
      or (
        ranked.interest_score = input_after_interest_score
        and ranked.distance_band > input_after_distance_band
      )
      or (
        ranked.interest_score = input_after_interest_score
        and ranked.distance_band = input_after_distance_band
        and ranked.starts_at > input_after_starts_at
      )
      or (
        ranked.interest_score = input_after_interest_score
        and ranked.distance_band = input_after_distance_band
        and ranked.starts_at = input_after_starts_at
        and ranked.event_id > input_after_event_id
      )
    order by ranked.interest_score desc, ranked.distance_band, ranked.starts_at, ranked.event_id
    limit bounded_limit + 1
  ),
  numbered_page as (
    select
      page.*,
      row_number() over (
        order by page.interest_score desc, page.distance_band, page.starts_at, page.event_id
      ) as row_number,
      count(*) over () > bounded_limit as has_more
    from cursor_page as page
  )
  select
    page.event_id,
    page.title,
    page.host_kind,
    page.host_display_name,
    page.host_venue_slug,
    page.venue_verification_status,
    page.match_id,
    page.competition_name,
    page.home_team_name,
    page.away_team_name,
    page.starts_at,
    page.ends_at,
    page.place_kind,
    page.location_summary,
    page.audience,
    page.audience_group_name,
    page.audience_team_name,
    page.capacity,
    page.approved_attendee_count,
    page.remaining_capacity,
    page.requires_approval,
    page.interest_score,
    page.distance_band,
    page.has_more
  from numbered_page as page
  where page.row_number <= bounded_limit
  order by page.interest_score desc, page.distance_band, page.starts_at, page.event_id;
end;
$function$;

create or replace function public.discover_events(
  input_lat double precision,
  input_lng double precision,
  input_radius_km integer,
  input_from timestamptz,
  input_to timestamptz,
  input_team_id uuid default null,
  input_competition_id uuid default null,
  input_match_id uuid default null,
  input_after_interest_score integer default null,
  input_after_distance_band integer default null,
  input_after_starts_at timestamptz default null,
  input_after_event_id uuid default null,
  input_limit integer default 20
)
returns table (
  event_id uuid, title text, host_kind text, host_display_name text,
  host_venue_slug text, venue_verification_status text, match_id uuid,
  competition_name text, home_team_name text, away_team_name text,
  starts_at timestamptz, ends_at timestamptz, place_kind text,
  location_summary text, audience text, audience_group_name text,
  audience_team_name text, capacity integer, approved_attendee_count bigint,
  remaining_capacity integer, requires_approval boolean, interest_score integer,
  cursor_distance_band integer, has_more boolean
)
language sql security definer stable set search_path = ''
as $function$
  select * from private.discover_event_page(
    'reservations', input_lat, input_lng, input_radius_km, input_from, input_to,
    input_team_id, input_competition_id, input_match_id, input_after_interest_score,
    input_after_distance_band, input_after_starts_at, input_after_event_id, input_limit
  );
$function$;

create or replace function public.discover_open_door_events(
  input_lat double precision,
  input_lng double precision,
  input_radius_km integer,
  input_from timestamptz,
  input_to timestamptz,
  input_team_id uuid default null,
  input_competition_id uuid default null,
  input_match_id uuid default null,
  input_after_interest_score integer default null,
  input_after_distance_band integer default null,
  input_after_starts_at timestamptz default null,
  input_after_event_id uuid default null,
  input_limit integer default 20
)
returns table (
  event_id uuid, title text, host_kind text, host_display_name text,
  host_venue_slug text, venue_verification_status text, match_id uuid,
  competition_name text, home_team_name text, away_team_name text,
  starts_at timestamptz, ends_at timestamptz, place_kind text,
  location_summary text, audience text, audience_group_name text,
  audience_team_name text, capacity integer, approved_attendee_count bigint,
  remaining_capacity integer, requires_approval boolean, interest_score integer,
  cursor_distance_band integer, has_more boolean
)
language sql security definer stable set search_path = ''
as $function$
  select * from private.discover_event_page(
    'open_door', input_lat, input_lng, input_radius_km, input_from, input_to,
    input_team_id, input_competition_id, input_match_id, input_after_interest_score,
    input_after_distance_band, input_after_starts_at, input_after_event_id, input_limit
  );
$function$;

create or replace function public.discover_owned_venue_events(
  input_lat double precision,
  input_lng double precision,
  input_radius_km integer,
  input_from timestamptz,
  input_to timestamptz,
  input_team_id uuid default null,
  input_competition_id uuid default null,
  input_match_id uuid default null,
  input_after_interest_score integer default null,
  input_after_distance_band integer default null,
  input_after_starts_at timestamptz default null,
  input_after_event_id uuid default null,
  input_limit integer default 20
)
returns table (
  event_id uuid, title text, host_kind text, host_display_name text,
  host_venue_slug text, venue_verification_status text, match_id uuid,
  competition_name text, home_team_name text, away_team_name text,
  starts_at timestamptz, ends_at timestamptz, place_kind text,
  location_summary text, audience text, audience_group_name text,
  audience_team_name text, capacity integer, approved_attendee_count bigint,
  remaining_capacity integer, requires_approval boolean, interest_score integer,
  cursor_distance_band integer, has_more boolean
)
language sql security definer stable set search_path = ''
as $function$
  select * from private.discover_event_page(
    'owned', input_lat, input_lng, input_radius_km, input_from, input_to,
    input_team_id, input_competition_id, input_match_id, input_after_interest_score,
    input_after_distance_band, input_after_starts_at, input_after_event_id, input_limit
  );
$function$;

create or replace function public.plan_venue_events(
  input_items jsonb,
  input_intent text,
  audit_request_id uuid default null
)
returns table (event_id uuid, status text)
language plpgsql
security definer
volatile
set search_path = ''
as $function$
#variable_conflict use_variable
declare
  actor_id uuid := private.assert_common_actor();
  item jsonb;
  item_index bigint;
  target_match_id uuid;
  target_space_id uuid;
  target_venue_id uuid;
  batch_venue_id uuid;
  requested_attendance_mode public.event_attendance_mode;
  requested_title text;
  requested_description text;
  requested_capacity integer;
  requested_requires_approval boolean;
  resolved_attendance_mode public.event_attendance_mode;
  resolved_title text;
  resolved_description text;
  resolved_capacity integer;
  resolved_requires_approval boolean;
  selected_space public.venue_spaces%rowtype;
  selected_venue public.venues%rowtype;
  selected_match public.matches%rowtype;
  home_team_name text;
  away_team_name text;
  created_event public.events%rowtype;
  final_status public.event_status;
  planned_match_ids uuid[] := '{}';
begin
  if input_intent is null or input_intent not in ('draft', 'publish')
    or input_items is null or jsonb_typeof(input_items) <> 'array'
    or jsonb_array_length(input_items) not between 1 and 20 then
    raise exception using errcode = 'P0001', message = 'VALIDATION_FAILED';
  end if;
  final_status := case when input_intent = 'publish'
    then 'published'::public.event_status else 'draft'::public.event_status end;

  for item, item_index in
    select value, ordinality
    from jsonb_array_elements(input_items) with ordinality as planned(value, ordinality)
    order by ordinality
  loop
    if jsonb_typeof(item) <> 'object'
      or exists (
        select 1 from jsonb_object_keys(item) as supplied(key)
        where supplied.key <> all (array[
          'matchId', 'venueSpaceId', 'attendanceMode', 'title', 'description',
          'capacity', 'requiresApproval'
        ])
      )
      or not (item ? 'matchId') or not (item ? 'venueSpaceId')
      or (
        item ? 'attendanceMode'
        and jsonb_typeof(item -> 'attendanceMode') not in ('string', 'null')
      )
      or (item ? 'title' and jsonb_typeof(item -> 'title') not in ('string', 'null'))
      or (item ? 'description' and jsonb_typeof(item -> 'description') not in ('string', 'null'))
      or (item ? 'capacity' and jsonb_typeof(item -> 'capacity') not in ('number', 'null'))
      or (
        item ? 'requiresApproval'
        and jsonb_typeof(item -> 'requiresApproval') not in ('boolean', 'null')
      ) then
      raise exception using errcode = 'P0001', message = 'VALIDATION_FAILED';
    end if;

    begin
      target_match_id := nullif(item ->> 'matchId', '')::uuid;
      target_space_id := nullif(item ->> 'venueSpaceId', '')::uuid;
      requested_attendance_mode := nullif(item ->> 'attendanceMode', '')::public.event_attendance_mode;
      requested_title := nullif(btrim(item ->> 'title'), '');
      requested_description := nullif(btrim(item ->> 'description'), '');
      requested_capacity := nullif(item ->> 'capacity', '')::integer;
      requested_requires_approval := nullif(item ->> 'requiresApproval', '')::boolean;
    exception when invalid_text_representation or numeric_value_out_of_range then
      raise exception using errcode = 'P0001', message = 'VALIDATION_FAILED';
    end;
    if target_match_id is null or target_space_id is null
      or target_match_id = any(planned_match_ids) then
      raise exception using errcode = 'P0001', message = 'VALIDATION_FAILED';
    end if;
    planned_match_ids := array_append(planned_match_ids, target_match_id);

    select space.venue_id into target_venue_id
    from public.venue_spaces as space where space.id = target_space_id;
    if target_venue_id is null then
      raise exception using errcode = 'P0001', message = 'NOT_FOUND';
    end if;

    if batch_venue_id is null then
      batch_venue_id := target_venue_id;
      if not private.actor_manages_venue(actor_id, batch_venue_id) then
        raise exception using errcode = 'P0001', message = 'NOT_ALLOWED';
      end if;
      perform pg_catalog.pg_advisory_xact_lock(
        pg_catalog.hashtextextended('huddle:venue-plan:' || batch_venue_id::text, 0)
      );
    elsif target_venue_id <> batch_venue_id then
      raise exception using errcode = 'P0001', message = 'VALIDATION_FAILED';
    end if;

    select space.* into selected_space
    from public.venue_spaces as space
    where space.id = target_space_id and space.venue_id = batch_venue_id
    for share;
    select venue.* into selected_venue
    from public.venues as venue where venue.id = batch_venue_id
    for share;
    if not found or selected_venue.verification_status = 'suspended'
      or selected_venue.suspended_at is not null or selected_venue.archived_at is not null then
      raise exception using errcode = 'P0001', message = 'NOT_ALLOWED';
    end if;
    if selected_space.id is null or not selected_space.active then
      raise exception using errcode = 'P0001', message = 'VENUE_DEFAULTS_INCOMPLETE';
    end if;

    resolved_attendance_mode := coalesce(
      requested_attendance_mode, selected_venue.default_attendance_mode
    );
    if resolved_attendance_mode = 'reservations' and selected_space.capacity is null then
      raise exception using errcode = 'P0001', message = 'VENUE_DEFAULTS_INCOMPLETE';
    end if;
    if resolved_attendance_mode = 'open_door'
      and (requested_capacity is not null or requested_requires_approval is true) then
      raise exception using errcode = 'P0001', message = 'VALIDATION_FAILED';
    end if;

    select match.* into selected_match
    from public.matches as match
    join public.competitions as competition on competition.id = match.competition_id
    join public.sports as sport on sport.id = competition.sport_id
    join public.teams as home_team on home_team.id = match.home_team_id
    join public.teams as away_team on away_team.id = match.away_team_id
    where match.id = target_match_id
      and match.starts_at > statement_timestamp()
      and match.status in ('scheduled', 'timed', 'postponed')
      and competition.active and sport.active and home_team.active and away_team.active
    for share of match;
    if not found then raise exception using errcode = 'P0001', message = 'NOT_FOUND'; end if;

    select home_team.name, away_team.name into strict home_team_name, away_team_name
    from public.teams as home_team, public.teams as away_team
    where home_team.id = selected_match.home_team_id
      and away_team.id = selected_match.away_team_id;
    resolved_title := coalesce(
      requested_title,
      btrim(left(home_team_name || ' vs ' || away_team_name || ' at ' || selected_venue.name, 120))
    );
    resolved_description := coalesce(requested_description, selected_venue.description);
    if resolved_attendance_mode = 'open_door' then
      resolved_capacity := null;
      resolved_requires_approval := false;
    else
      resolved_capacity := coalesce(requested_capacity, selected_space.capacity);
      resolved_requires_approval := coalesce(
        requested_requires_approval, selected_venue.default_requires_approval
      );
    end if;
    if char_length(resolved_title) not between 3 and 120
      or char_length(resolved_description) not between 10 and 2000
      or (
        resolved_attendance_mode = 'reservations'
        and (
          resolved_capacity is null or resolved_capacity not between 1 and selected_space.capacity
        )
      ) then
      raise exception using errcode = 'P0001', message = 'VALIDATION_FAILED';
    end if;

    if exists (
      select 1 from public.events as event
      where event.host_venue_id = selected_venue.id
        and event.status not in ('cancelled', 'completed')
        and (
          event.match_id = selected_match.id
          or (
            event.venue_space_id = selected_space.id
            and event.starts_at < selected_match.starts_at + interval '3 hours'
            and event.ends_at > selected_match.starts_at
          )
        )
    ) then
      if exists (
        select 1 from public.events as event
        where event.host_venue_id = selected_venue.id
          and event.match_id = selected_match.id
          and event.status not in ('cancelled', 'completed')
      ) then
        raise exception using errcode = 'P0001', message = 'MATCH_ALREADY_PLANNED';
      end if;
      raise exception using errcode = 'P0001', message = 'VENUE_SPACE_OVERLAP';
    end if;

    insert into public.events (
      created_by, host_venue_id, match_id, title, description, expected_activity,
      cost_description, event_rules, commercial_affiliation, host_presence_confirmed_at,
      starts_at, ends_at, place_kind, venue_id, venue_space_id, audience,
      attendance_mode, capacity, requires_approval, status, published_at
    ) values (
      actor_id, selected_venue.id, selected_match.id, resolved_title, resolved_description,
      case when char_length(btrim(selected_venue.house_information)) >= 3
        then btrim(left(selected_venue.house_information, 500))
        else 'Watch the full match together' end,
      'Ask venue staff about current food, drink, and entry costs.',
      'Respect venue staff, other supporters, and every attendee.',
      'Hosted commercially by ' || selected_venue.name,
      statement_timestamp(), selected_match.starts_at,
      selected_match.starts_at + interval '3 hours', 'venue', selected_venue.id,
      selected_space.id, 'public', resolved_attendance_mode, resolved_capacity,
      resolved_requires_approval, final_status,
      case when final_status = 'published' then statement_timestamp() end
    ) returning * into created_event;

    perform private.write_security_audit(
      actor_id, 'venue.event.plan', 'event', created_event.id, 'succeeded', audit_request_id,
      jsonb_build_object(
        'venue_id', selected_venue.id, 'venue_space_id', selected_space.id,
        'match_id', selected_match.id, 'status', created_event.status::text,
        'attendance_mode', created_event.attendance_mode::text,
        'batch_size', jsonb_array_length(input_items), 'batch_position', item_index
      )
    );
    return query select created_event.id, created_event.status::text;
  end loop;
end;
$function$;

update public.event_drafts
set draft_values = draft_values - 'cityId'
where draft_values ? 'cityId';

create or replace function private.canonicalize_event_draft_values(input_values jsonb)
returns jsonb
language plpgsql
immutable
set search_path = ''
as $function$
#variable_conflict use_variable
declare
  canonical jsonb := '{}'::jsonb;
  field_name text;
  raw_value jsonb;
  normalized_text text;
  normalized_number numeric;
  normalized_uuid uuid;
  minimum_length integer;
  maximum_length integer;
begin
  if input_values is null or jsonb_typeof(input_values) <> 'object' then
    raise exception using errcode = 'P0001', message = 'VALIDATION_FAILED';
  end if;

  foreach field_name in array array[
    'matchId', 'title', 'description', 'expectedActivity', 'costDescription',
    'eventRules', 'commercialAffiliation', 'hostPresenceConfirmed', 'placeKind',
    'publicPlaceName', 'publicAddressText', 'publicLongitude', 'publicLatitude',
    'audience', 'audienceGroupId', 'capacity'
  ] loop
    if not input_values ? field_name then continue; end if;
    raw_value := input_values -> field_name;
    if jsonb_typeof(raw_value) = 'null' then
      canonical := canonical || jsonb_build_object(field_name, null);
      continue;
    end if;

    if field_name in ('matchId', 'audienceGroupId') then
      if jsonb_typeof(raw_value) <> 'string' then
        raise exception using errcode = 'P0001', message = 'VALIDATION_FAILED';
      end if;
      begin
        normalized_uuid := (raw_value #>> '{}')::uuid;
      exception when invalid_text_representation then
        raise exception using errcode = 'P0001', message = 'VALIDATION_FAILED';
      end;
      canonical := canonical || jsonb_build_object(field_name, normalized_uuid::text);
      continue;
    end if;

    if field_name in (
      'title', 'description', 'expectedActivity', 'costDescription', 'eventRules',
      'commercialAffiliation', 'publicPlaceName', 'publicAddressText'
    ) then
      if jsonb_typeof(raw_value) <> 'string' then
        raise exception using errcode = 'P0001', message = 'VALIDATION_FAILED';
      end if;
      normalized_text := btrim(raw_value #>> '{}');
      minimum_length := case field_name
        when 'title' then 3 when 'description' then 10 when 'expectedActivity' then 3
        when 'costDescription' then 2 when 'eventRules' then 3
        when 'commercialAffiliation' then 2 else 1 end;
      maximum_length := case field_name
        when 'title' then 120 when 'description' then 2000 when 'expectedActivity' then 500
        when 'costDescription' then 300 when 'eventRules' then 1000
        when 'commercialAffiliation' then 300 when 'publicPlaceName' then 120 else 300 end;
      if char_length(normalized_text) not between minimum_length and maximum_length then
        raise exception using errcode = 'P0001', message = 'VALIDATION_FAILED';
      end if;
      canonical := canonical || jsonb_build_object(field_name, normalized_text);
      continue;
    end if;

    if field_name = 'hostPresenceConfirmed' then
      if jsonb_typeof(raw_value) <> 'boolean' then
        raise exception using errcode = 'P0001', message = 'VALIDATION_FAILED';
      end if;
      canonical := canonical || jsonb_build_object(field_name, (raw_value #>> '{}')::boolean);
      continue;
    end if;

    if field_name in ('placeKind', 'audience') then
      if jsonb_typeof(raw_value) <> 'string' then
        raise exception using errcode = 'P0001', message = 'VALIDATION_FAILED';
      end if;
      normalized_text := raw_value #>> '{}';
      if (field_name = 'placeKind' and normalized_text not in ('home', 'public_place'))
        or (field_name = 'audience' and normalized_text not in ('group', 'friends', 'invite_only'))
      then
        raise exception using errcode = 'P0001', message = 'VALIDATION_FAILED';
      end if;
      canonical := canonical || jsonb_build_object(field_name, normalized_text);
      continue;
    end if;

    if field_name in ('publicLongitude', 'publicLatitude', 'capacity') then
      if jsonb_typeof(raw_value) <> 'number' then
        raise exception using errcode = 'P0001', message = 'VALIDATION_FAILED';
      end if;
      normalized_number := (raw_value #>> '{}')::numeric;
      if (field_name = 'publicLongitude' and normalized_number not between 34 and 36)
        or (field_name = 'publicLatitude' and normalized_number not between 29 and 34)
        or (
          field_name = 'capacity'
          and (normalized_number <> trunc(normalized_number) or normalized_number not between 1 and 1000)
        )
      then
        raise exception using errcode = 'P0001', message = 'VALIDATION_FAILED';
      end if;
      canonical := canonical || jsonb_build_object(field_name, normalized_number);
    end if;
  end loop;
  return canonical;
end;
$function$;

create or replace function public.save_event_draft(
  input_draft_id uuid,
  input_step integer,
  input_values jsonb,
  input_organizing_group_id uuid,
  input_private_mode text,
  input_private_address_text text,
  input_private_directions_text text,
  input_private_longitude double precision,
  input_private_latitude double precision
)
returns table (
  draft_id uuid,
  step integer,
  draft_values jsonb,
  organizing_group_id uuid,
  private_address_text text,
  private_directions_text text,
  private_longitude double precision,
  private_latitude double precision,
  updated_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $function$
#variable_conflict use_variable
declare
  actor_id uuid := private.assert_fan_actor();
  target_draft public.event_drafts%rowtype;
  safe_patch jsonb;
  merged_values jsonb;
  next_place_kind text;
  resolved_group_id uuid;
  audience_group_id uuid;
  protected_point extensions.geography(Point, 4326);
begin
  if input_step is null or input_step not between 1 and 3
    or input_private_mode is null
    or input_private_mode not in ('preserve', 'replace', 'clear') then
    raise exception using errcode = 'P0001', message = 'VALIDATION_FAILED';
  end if;
  if input_private_mode in ('preserve', 'clear') and (
    input_private_address_text is not null or input_private_directions_text is not null
    or input_private_longitude is not null or input_private_latitude is not null
  ) then
    raise exception using errcode = 'P0001', message = 'VALIDATION_FAILED';
  end if;

  safe_patch := private.canonicalize_event_draft_values(input_values);
  if input_draft_id is null then
    insert into public.event_drafts (owner_id, step, draft_values, organizing_group_id)
    values (actor_id, input_step, '{}'::jsonb, null)
    returning * into target_draft;
  else
    select draft.* into target_draft
    from public.event_drafts as draft
    where draft.id = input_draft_id and draft.owner_id = actor_id
    for update;
    if not found then raise exception using errcode = 'P0001', message = 'NOT_FOUND'; end if;
  end if;

  merged_values := jsonb_strip_nulls((target_draft.draft_values - 'cityId') || safe_patch);
  next_place_kind := merged_values ->> 'placeKind';
  resolved_group_id := input_organizing_group_id;

  if merged_values ->> 'audience' is distinct from 'group' then
    merged_values := merged_values - 'audienceGroupId';
    audience_group_id := null;
  else
    begin
      audience_group_id := case when merged_values ? 'audienceGroupId'
        then (merged_values ->> 'audienceGroupId')::uuid else null end;
    exception when invalid_text_representation then
      raise exception using errcode = 'P0001', message = 'VALIDATION_FAILED';
    end;
  end if;

  if next_place_kind = 'home' then
    merged_values := merged_values - 'publicPlaceName' - 'publicAddressText'
      - 'publicLongitude' - 'publicLatitude';
  end if;

  if resolved_group_id is not null and not exists (
    select 1
    from public.groups as supporter_group
    join public.group_memberships as membership on membership.group_id = supporter_group.id
    where supporter_group.id = resolved_group_id
      and supporter_group.lifecycle = 'active'
      and supporter_group.suspended_at is null
      and membership.user_id = actor_id
      and membership.status = 'active'
      and not exists (
        select 1 from public.group_bans as ban
        where ban.group_id = supporter_group.id and ban.user_id = actor_id and ban.revoked_at is null
      )
  ) then
    raise exception using errcode = 'P0001', message = 'NOT_ALLOWED';
  end if;
  if audience_group_id is not null and not exists (
    select 1
    from public.groups as supporter_group
    join public.group_memberships as membership on membership.group_id = supporter_group.id
    where supporter_group.id = audience_group_id
      and supporter_group.lifecycle = 'active'
      and supporter_group.suspended_at is null
      and membership.user_id = actor_id
      and membership.status = 'active'
      and not exists (
        select 1 from public.group_bans as ban
        where ban.group_id = supporter_group.id and ban.user_id = actor_id and ban.revoked_at is null
      )
  ) then
    raise exception using errcode = 'P0001', message = 'NOT_ALLOWED';
  end if;

  if input_private_mode = 'replace' then
    if next_place_kind is distinct from 'home'
      or nullif(btrim(input_private_address_text), '') is null
      or char_length(btrim(input_private_address_text)) not between 5 and 300
      or (
        input_private_directions_text is not null
        and char_length(btrim(input_private_directions_text)) not between 1 and 500
      )
      or input_private_longitude is null or input_private_latitude is null
      or input_private_longitude not between 34 and 36
      or input_private_latitude not between 29 and 34 then
      raise exception using errcode = 'P0001', message = 'VALIDATION_FAILED';
    end if;
    protected_point := extensions.st_setsrid(
      extensions.st_makepoint(input_private_longitude, input_private_latitude), 4326
    )::extensions.geography;
  end if;

  update public.event_drafts as draft
  set step = input_step, draft_values = merged_values, organizing_group_id = resolved_group_id
  where draft.id = target_draft.id
  returning * into target_draft;

  if input_private_mode = 'clear' or next_place_kind is distinct from 'home' then
    delete from public.event_draft_private_locations as private_location
    where private_location.draft_id = target_draft.id;
  end if;
  if input_private_mode = 'replace' then
    insert into public.event_draft_private_locations (draft_id, address_text, directions_text, location)
    values (
      target_draft.id, btrim(input_private_address_text),
      nullif(btrim(input_private_directions_text), ''), protected_point
    )
    on conflict on constraint event_draft_private_locations_pkey do update
    set address_text = excluded.address_text,
        directions_text = excluded.directions_text,
        location = excluded.location;
  end if;

  return query
  select
    target_draft.id, target_draft.step, target_draft.draft_values,
    target_draft.organizing_group_id, private_location.address_text,
    private_location.directions_text,
    extensions.st_x(private_location.location::extensions.geometry),
    extensions.st_y(private_location.location::extensions.geometry),
    target_draft.updated_at
  from (select 1) as singleton
  left join public.event_draft_private_locations as private_location
    on private_location.draft_id = target_draft.id;
end;
$function$;

create or replace function public.finalize_event_draft(
  input_draft_id uuid,
  audit_request_id uuid default null
)
returns table (event_id uuid, status text)
language plpgsql
security definer
set search_path = ''
as $function$
#variable_conflict use_variable
declare
  actor_id uuid := private.assert_fan_actor();
  target_draft public.event_drafts%rowtype;
  target_private public.event_draft_private_locations%rowtype;
  target_match public.matches%rowtype;
  safe_values jsonb;
  parsed_match_id uuid;
  parsed_place_kind text;
  parsed_audience text;
  parsed_audience_group_id uuid;
  parsed_capacity integer;
  governing_group_id uuid;
  public_longitude double precision;
  public_latitude double precision;
  created_event_id uuid;
  created_status text;
  has_private_location boolean := false;
begin
  select draft.* into target_draft
  from public.event_drafts as draft
  where draft.id = input_draft_id and draft.owner_id = actor_id
  for update;
  if not found then raise exception using errcode = 'P0001', message = 'NOT_FOUND'; end if;

  safe_values := target_draft.draft_values - 'cityId';
  if target_draft.step <> 3
    or not safe_values ?& array[
      'matchId', 'title', 'description', 'expectedActivity', 'costDescription',
      'eventRules', 'commercialAffiliation', 'hostPresenceConfirmed', 'placeKind',
      'audience', 'capacity'
    ]
    or (safe_values ->> 'hostPresenceConfirmed')::boolean is distinct from true then
    raise exception using errcode = 'P0001', message = 'VALIDATION_FAILED';
  end if;

  begin
    parsed_match_id := (safe_values ->> 'matchId')::uuid;
    parsed_place_kind := safe_values ->> 'placeKind';
    parsed_audience := safe_values ->> 'audience';
    parsed_capacity := (safe_values ->> 'capacity')::integer;
    parsed_audience_group_id := case when safe_values ? 'audienceGroupId'
      then (safe_values ->> 'audienceGroupId')::uuid else null end;
  exception when invalid_text_representation or numeric_value_out_of_range then
    raise exception using errcode = 'P0001', message = 'VALIDATION_FAILED';
  end;

  select match.* into target_match
  from public.matches as match
  where match.id = parsed_match_id
    and match.starts_at > statement_timestamp()
    and match.status in ('scheduled', 'timed', 'postponed')
  for share;
  if not found then raise exception using errcode = 'P0001', message = 'NOT_FOUND'; end if;

  select private_location.* into target_private
  from public.event_draft_private_locations as private_location
  where private_location.draft_id = target_draft.id
  for update;
  has_private_location := found;

  if parsed_place_kind = 'home' then
    if not has_private_location or parsed_capacity not between 1 and 12
      or safe_values ?| array[
        'publicPlaceName', 'publicAddressText', 'publicLongitude', 'publicLatitude'
      ] then
      raise exception using errcode = 'P0001', message = 'VALIDATION_FAILED';
    end if;
  elsif parsed_place_kind = 'public_place' then
    if has_private_location or not safe_values ?& array[
      'publicPlaceName', 'publicAddressText', 'publicLongitude', 'publicLatitude'
    ] then
      raise exception using errcode = 'P0001', message = 'VALIDATION_FAILED';
    end if;
    begin
      public_longitude := (safe_values ->> 'publicLongitude')::double precision;
      public_latitude := (safe_values ->> 'publicLatitude')::double precision;
    exception when invalid_text_representation or numeric_value_out_of_range then
      raise exception using errcode = 'P0001', message = 'VALIDATION_FAILED';
    end;
    if public_longitude not between 34 and 36 or public_latitude not between 29 and 34 then
      raise exception using errcode = 'P0001', message = 'VALIDATION_FAILED';
    end if;
  else
    raise exception using errcode = 'P0001', message = 'VALIDATION_FAILED';
  end if;

  if target_draft.organizing_group_id is not null and not exists (
    select 1
    from public.groups as supporter_group
    join public.group_memberships as membership on membership.group_id = supporter_group.id
    where supporter_group.id = target_draft.organizing_group_id
      and supporter_group.lifecycle = 'active'
      and supporter_group.suspended_at is null
      and membership.user_id = actor_id and membership.status = 'active'
      and not exists (
        select 1 from public.group_bans as ban
        where ban.group_id = supporter_group.id and ban.user_id = actor_id and ban.revoked_at is null
      )
  ) then
    raise exception using errcode = 'P0001', message = 'NOT_ALLOWED';
  end if;

  if parsed_audience = 'group' then
    if parsed_audience_group_id is null or not exists (
      select 1
      from public.groups as supporter_group
      join public.group_memberships as membership on membership.group_id = supporter_group.id
      where supporter_group.id = parsed_audience_group_id
        and supporter_group.lifecycle = 'active'
        and supporter_group.suspended_at is null
        and membership.user_id = actor_id and membership.status = 'active'
        and not exists (
          select 1 from public.group_bans as ban
          where ban.group_id = supporter_group.id and ban.user_id = actor_id and ban.revoked_at is null
        )
    ) then
      raise exception using errcode = 'P0001', message = 'NOT_ALLOWED';
    end if;
  elsif parsed_audience = 'friends' then
    if parsed_audience_group_id is not null or not exists (
      select 1 from public.friendships as friendship
      where friendship.status = 'accepted'
        and actor_id in (friendship.user_low_id, friendship.user_high_id)
        and not private.users_are_blocked(
          actor_id,
          case when friendship.user_low_id = actor_id
            then friendship.user_high_id else friendship.user_low_id end
        )
    ) then
      raise exception using errcode = 'P0001', message = 'NOT_ALLOWED';
    end if;
  elsif parsed_audience = 'invite_only' then
    if parsed_audience_group_id is not null then
      raise exception using errcode = 'P0001', message = 'NOT_ALLOWED';
    end if;
  else
    raise exception using errcode = 'P0001', message = 'VALIDATION_FAILED';
  end if;

  governing_group_id := coalesce(
    target_draft.organizing_group_id,
    case when parsed_audience = 'group' then parsed_audience_group_id end
  );
  if governing_group_id is not null then
    select created.event_id, created.status into created_event_id, created_status
    from public.create_group_event(
      governing_group_id, parsed_match_id, safe_values ->> 'title',
      safe_values ->> 'description', safe_values ->> 'expectedActivity',
      safe_values ->> 'costDescription', safe_values ->> 'eventRules',
      safe_values ->> 'commercialAffiliation', true, target_match.starts_at,
      target_match.starts_at + interval '3 hours', parsed_place_kind,
      safe_values ->> 'publicPlaceName', safe_values ->> 'publicAddressText',
      public_longitude, public_latitude, parsed_audience, parsed_audience_group_id,
      parsed_capacity, target_private.address_text, target_private.directions_text,
      case when has_private_location
        then extensions.st_x(target_private.location::extensions.geometry) end,
      case when has_private_location
        then extensions.st_y(target_private.location::extensions.geometry) end,
      'publish', audit_request_id
    ) as created;
  else
    select created.event_id, created.status into created_event_id, created_status
    from public.create_or_update_event(
      null, null, null, parsed_match_id, safe_values ->> 'title',
      safe_values ->> 'description', safe_values ->> 'expectedActivity',
      safe_values ->> 'costDescription', safe_values ->> 'eventRules',
      safe_values ->> 'commercialAffiliation', true, target_match.starts_at,
      target_match.starts_at + interval '3 hours', parsed_place_kind, null,
      safe_values ->> 'publicPlaceName', safe_values ->> 'publicAddressText',
      public_longitude, public_latitude, parsed_audience, null, null,
      parsed_capacity, true, target_private.address_text, target_private.directions_text,
      case when has_private_location
        then extensions.st_x(target_private.location::extensions.geometry) end,
      case when has_private_location
        then extensions.st_y(target_private.location::extensions.geometry) end,
      'publish', audit_request_id
    ) as created;
  end if;

  if created_event_id is null then
    raise exception using errcode = 'P0001', message = 'INTERNAL_ERROR';
  end if;
  delete from public.event_drafts as draft where draft.id = target_draft.id;
  return query select created_event_id, created_status;
end;
$function$;

create or replace function private.event_request_context(
  input_event_id uuid,
  input_requester_id uuid,
  input_manager_id uuid
)
returns table (
  requester_handle text,
  requester_display_name text,
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
    select case when friendship.user_low_id = input_manager_id
      then friendship.user_high_id else friendship.user_low_id end as friend_id
    from public.friendships as friendship
    where friendship.status = 'accepted'
      and input_manager_id in (friendship.user_low_id, friendship.user_high_id)
  ),
  requester_friends as (
    select case when friendship.user_low_id = input_requester_id
      then friendship.user_high_id else friendship.user_low_id end as friend_id
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
      and supporter_group.lifecycle = 'active'
      and supporter_group.suspended_at is null
      and not exists (
        select 1 from public.group_bans as ban
        where ban.group_id = supporter_group.id
          and ban.user_id in (input_manager_id, input_requester_id)
          and ban.revoked_at is null
      )
  )
  select
    profile.handle,
    profile.display_name,
    auth_user.email_confirmed_at is not null,
    greatest(
      floor(extract(epoch from statement_timestamp() - auth_user.created_at) / 86400), 0
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
  cross join mutual_friends
  cross join shared_groups
  where profile.id = input_requester_id;
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
  if input_limit is null or input_limit not between 1 and 50
    or input_offset is null or input_offset not between 0 and 10000
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
    case when attendance.status = 'requested' and review_state.visible
      then review_state.review_reason else null end::text,
    attendance.status = 'requested' and review_state.visible and review_state.can_approve,
    count(*) over ()
  from public.event_attendance as attendance
  cross join lateral private.event_request_context(
    input_event_id, attendance.user_id, actor_id
  ) as context
  cross join lateral private.attendance_review_state(
    input_event_id, attendance.user_id, actor_id
  ) as review_state
  where attendance.event_id = input_event_id
    and (attendance.status <> 'requested' or review_state.visible)
  order by
    (attendance.status = 'requested') desc,
    attendance.requested_at desc,
    attendance.id desc
  offset bounded_offset
  limit bounded_limit;
end;
$function$;

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
  actor_id uuid := private.assert_fan_actor();
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
    event.place_kind::text,
    case when event.host_user_id is not null then 'person' else 'venue' end,
    event.requires_approval,
    case when event.capacity is null then 0
      else greatest(event.capacity - attendance_counts.approved_count::integer, 0) end,
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
  left join public.event_invitations as invitation
    on invitation.event_id = event.id and invitation.invitee_id = actor_id
  left join public.event_attendance as attendance
    on attendance.event_id = event.id and attendance.user_id = actor_id
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

create or replace function public.get_event_summary(input_event_id uuid)
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
  organizing_group_slug text,
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
    event.place_kind::text,
    event.public_place_name,
    event.public_address_text,
    case
      when event.place_kind = 'public_place' then event.public_place_name
      when event.place_kind = 'venue' then host_venue.address_text
      when private.actor_manages_event(event.id, auth.uid()) then 'Private meeting point saved'
      else 'Private meeting place'
    end,
    event.audience::text,
    audience_group.name,
    audience_team.name,
    event.capacity,
    attendance_counts.approved_count,
    case when event.capacity is null then 0
      else greatest(event.capacity - attendance_counts.approved_count::integer, 0) end,
    viewer_attendance.id,
    viewer_attendance.status::text,
    viewer_invitation.id,
    viewer_invitation.status::text,
    auth.uid() is not null,
    private.actor_can_read_private_event_location(event.id, auth.uid()),
    event.requires_approval,
    organizing_group.name,
    case
      when organizing_group.id is null then null
      when (
        organizing_group.visibility = 'discoverable'
        and organizing_group.lifecycle = 'active'
      ) or private.actor_is_active_group_member(organizing_group.id, auth.uid())
        then organizing_group.slug
      else null
    end,
    private.actor_manages_event(event.id, auth.uid())
  from public.events as event
  join public.matches as match on match.id = event.match_id
  join public.competitions as competition on competition.id = match.competition_id
  join public.teams as home_team on home_team.id = match.home_team_id
  join public.teams as away_team on away_team.id = match.away_team_id
  left join public.profiles as host_profile on host_profile.id = event.host_user_id
  left join public.venues as host_venue on host_venue.id = event.host_venue_id
  left join public.groups as audience_group on audience_group.id = event.audience_group_id
  left join public.teams as audience_team on audience_team.id = event.audience_team_id
  left join public.groups as organizing_group on organizing_group.id = event.organizing_group_id
  left join public.event_attendance as viewer_attendance
    on viewer_attendance.event_id = event.id and viewer_attendance.user_id = auth.uid()
  left join public.event_invitations as viewer_invitation
    on viewer_invitation.event_id = event.id and viewer_invitation.invitee_id = auth.uid()
  cross join lateral (
    select count(*) as approved_count
    from public.event_attendance as attendance
    where attendance.event_id = event.id and attendance.status = 'approved'
  ) as attendance_counts
  where event.id = input_event_id
    and private.event_is_visible_to_actor(event.id, auth.uid());
$function$;

create or replace function public.list_my_groups(
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
  bounded_limit integer := least(greatest(coalesce(input_limit, 20), 1), 50);
  bounded_offset integer := greatest(coalesce(input_offset, 0), 0);
begin
  return query
  select
    supporter_group.id,
    supporter_group.slug,
    supporter_group.name,
    supporter_group.description,
    supporter_group.visibility::text,
    supporter_group.lifecycle::text,
    team.name,
    membership.role::text,
    membership.status::text,
    (
      select count(*)::integer
      from public.group_memberships as active_membership
      where active_membership.group_id = supporter_group.id
        and active_membership.status = 'active'
    ),
    membership.role in ('owner', 'admin'),
    count(*) over ()
  from public.group_memberships as membership
  join public.groups as supporter_group on supporter_group.id = membership.group_id
  left join public.teams as team on team.id = supporter_group.team_id
  where membership.user_id = actor_id
    and membership.status = 'active'
    and supporter_group.lifecycle <> 'archived'
  order by
    case membership.role when 'owner' then 0 when 'admin' then 1 else 2 end,
    supporter_group.updated_at desc,
    supporter_group.id
  offset bounded_offset
  limit bounded_limit;
end;
$function$;

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
    or input_bucket not in ('all', 'owner', 'admin', 'member', 'applying')
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
      case when membership.status = 'pending' then null else supporter_group.description end
        as description,
      supporter_group.visibility::text as visibility,
      supporter_group.lifecycle::text as lifecycle,
      team.name as team_name,
      case when membership.status = 'active' then membership.role::text else null end
        as member_role,
      membership.status::text as membership_status,
      case
        when membership.status = 'pending' then null
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
      membership.status = 'active' and membership.role in ('owner', 'admin') as can_manage,
      membership.updated_at
    from public.group_memberships as membership
    join public.groups as supporter_group on supporter_group.id = membership.group_id
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
          input_bucket = 'all'
          and (
            membership.status = 'active'
            or (
              membership.status = 'pending'
              and membership.role = 'member'
              and supporter_group.visibility = 'discoverable'
            )
          )
        )
        or (
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
        when 'hosting' then case when event.status = 'draft' then 'Draft' else 'You are hosting' end
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
            or (event.status = 'completed' and attendance.status = 'approved')
          )
        )
      )
      and (
        coalesce(event.organizing_group_id, event.audience_group_id) is null
        or (
          private.actor_is_active_group_member(
            coalesce(event.organizing_group_id, event.audience_group_id), actor_id
          )
          and exists (
            select 1
            from public.groups as governing_group
            where governing_group.id = coalesce(event.organizing_group_id, event.audience_group_id)
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
    select sport.id as item_id, 'sport'::text as kind, sport.name as label,
      null::text as detail, '/settings/interests'::text as href, subscription.created_at
    from public.subscriptions as subscription
    join public.sports as sport
      on subscription.kind = 'sport' and sport.id = subscription.sport_id and sport.active
    where subscription.user_id = actor_id

    union all

    select competition.id, 'competition'::text, competition.name, competition.country_name,
      '/matches?competition=' || competition.id::text, subscription.created_at
    from public.subscriptions as subscription
    join public.competitions as competition
      on subscription.kind = 'competition'
      and competition.id = subscription.competition_id
      and competition.active
    where subscription.user_id = actor_id

    union all

    select team.id, 'team'::text, team.name, team.country_name,
      '/matches?team=' || team.id::text, subscription.created_at
    from public.subscriptions as subscription
    join public.teams as team
      on subscription.kind = 'team' and team.id = subscription.team_id and team.active
    where subscription.user_id = actor_id

    union all

    select venue.id, 'venue'::text, venue.name, venue.address_text,
      '/venues/' || venue.slug, follow.created_at
    from public.venue_follows as follow
    join public.venues as venue
      on venue.id = follow.venue_id
      and venue.verification_status <> 'suspended'
      and venue.suspended_at is null
      and venue.archived_at is null
    where follow.user_id = actor_id
  ),
  filtered as (
    select * from saved where input_bucket = 'all' or saved.kind = input_bucket
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
  actor_id uuid := private.assert_fan_actor();
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
      case when friendship.user_low_id = actor_id
        then friendship.user_high_id else friendship.user_low_id end as other_user_id,
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
          input_bucket = 'incoming' and friendship.status = 'pending'
          and friendship.requested_by <> actor_id
        )
        or (
          input_bucket = 'outgoing' and friendship.status = 'pending'
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
    relation.created_at,
    relation.responded_at,
    count(*) over ()
  from visible_relations as relation
  join public.profiles as profile on profile.id = relation.other_user_id
  where not private.users_are_blocked(actor_id, relation.other_user_id)
  order by relation.updated_at desc, relation.id desc
  offset bounded_offset
  limit bounded_limit;
end;
$function$;

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
    normalized_query := lower(pg_catalog.normalize(btrim(input_query), 'NFC'));
    if left(normalized_query, 1) = '@' then normalized_query := substr(normalized_query, 2); end if;
    if char_length(normalized_query) not between 2 and 50 then
      raise exception using errcode = 'P0001', message = 'VALIDATION_FAILED';
    end if;
    escaped_query := replace(replace(replace(normalized_query, '\', '\\'), '%', '\%'), '_', '\_');
    select count(*) > 0 and coalesce(bool_and(char_length(word_fragment) >= 3), false)
      into display_query_is_eligible
    from unnest(regexp_split_to_array(normalized_query, '[^[:alnum:]]+'))
      as query_fragments(word_fragment)
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
  with candidate_ids as (
    select profile.id as profile_id
    from public.profiles as profile
    where input_bucket = 'search'
      and lower(profile.handle) like escaped_query || '%' escape '\'

    union

    select profile.id
    from public.profiles as profile
    where input_bucket = 'search'
      and display_query_is_eligible
      and to_tsvector(
        'simple'::regconfig,
        lower(pg_catalog.normalize(profile.display_name, 'NFC'))
      ) @@ plainto_tsquery('simple'::regconfig, normalized_query)

    union

    select case when friendship.user_low_id = actor_id
      then friendship.user_high_id else friendship.user_low_id end
    from public.friendships as friendship
    where input_bucket in ('accepted', 'incoming', 'sent')
      and actor_id in (friendship.user_low_id, friendship.user_high_id)
      and (
        (input_bucket = 'accepted' and friendship.status = 'accepted')
        or (
          input_bucket = 'incoming' and friendship.status = 'pending'
          and friendship.requested_by <> actor_id
        )
        or (
          input_bucket = 'sent' and friendship.status = 'pending'
          and friendship.requested_by = actor_id
        )
      )

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
        select 1 from public.group_bans as ban
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
      case
        when shared_team.name is not null then 'You both follow ' || shared_team.name
        when shared_group.name is not null then 'You are both in ' || shared_group.name
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
      where viewer_follow.user_id = actor_id and viewer_follow.kind = 'team'
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
          select 1 from public.group_bans as ban
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
    where (
      input_bucket = 'suggested'
      and candidates.friendship_id is null
      and candidates.reason is not null
    ) or input_bucket = 'search'
      or (input_bucket = 'accepted' and candidates.friendship_status = 'accepted')
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

create or replace function public.get_public_profile_by_handle(lookup_handle text)
returns table (
  handle text,
  display_name text,
  bio text,
  member_since timestamptz,
  viewer_has_blocked boolean,
  friendship_id uuid,
  friendship_status text,
  friendship_direction text
)
language sql
stable
security definer
set search_path = ''
as $function$
  select
    profile.handle,
    profile.display_name,
    profile.bio,
    profile.created_at,
    coalesce(
      exists (
        select 1 from public.user_blocks as block
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
    end
  from public.profiles as profile
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
    and profile.suspended_at is null;
$function$;

create or replace function public.get_group_by_slug(lookup_slug text)
returns table (
  group_id uuid,
  slug text,
  name text,
  description text,
  visibility text,
  lifecycle text,
  team_name text,
  owner_handle text,
  active_member_count bigint,
  viewer_role text,
  viewer_membership_status text,
  can_view_member_content boolean,
  can_apply boolean
)
language sql
stable
security definer
set search_path = ''
as $function$
  with candidate as (
    select
      supporter_group.*,
      private.actor_is_active_group_member(supporter_group.id, auth.uid()) as viewer_is_member,
      private.profile_is_community_eligible(auth.uid()) as viewer_is_eligible,
      exists (
        select 1 from public.group_bans as ban
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
    team.name,
    owner_profile.handle,
    (
      select count(*)
      from public.group_memberships as active_membership
      where active_membership.group_id = supporter_group.id
        and active_membership.status = 'active'
    ),
    case when viewer_membership.status = 'active' then viewer_membership.role::text end,
    viewer_membership.status::text,
    coalesce(
      supporter_group.viewer_is_member
        and supporter_group.lifecycle not in ('suspended', 'archived'),
      false
    ),
    coalesce(
      supporter_group.viewer_is_eligible
        and supporter_group.visibility = 'discoverable'
        and supporter_group.lifecycle = 'active'
        and not supporter_group.viewer_is_banned
        and not supporter_group.viewer_blocks_owner
        and coalesce(viewer_membership.status::text, '') not in ('pending', 'active'),
      false
    )
  from candidate as supporter_group
  join public.profiles as owner_profile on owner_profile.id = supporter_group.owner_id
  left join public.teams as team on team.id = supporter_group.team_id
  left join public.group_memberships as viewer_membership
    on viewer_membership.group_id = supporter_group.id
    and viewer_membership.user_id = auth.uid()
  where supporter_group.lifecycle <> 'archived'
    and not supporter_group.viewer_is_banned
    and not supporter_group.viewer_blocks_owner
    and (
      (supporter_group.visibility = 'discoverable' and supporter_group.lifecycle = 'active')
      or supporter_group.viewer_is_member
    );
$function$;

create or replace function public.get_venue_by_slug(lookup_slug text)
returns table (
  venue_id uuid,
  slug text,
  name text,
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
stable
security definer
set search_path = ''
as $function$
  select
    venue.id,
    venue.slug,
    venue.name,
    venue.address_text,
    venue.description,
    venue.screen_count,
    venue.stated_capacity,
    venue.verification_status::text,
    owner_profile.handle,
    (select count(*) from public.venue_follows as follow where follow.venue_id = venue.id),
    exists (
      select 1 from public.venue_follows as own_follow
      where own_follow.venue_id = venue.id
        and own_follow.user_id = auth.uid()
    ),
    private.actor_manages_venue(auth.uid(), venue.id)
  from public.venues as venue
  join public.profiles as owner_profile on owner_profile.id = venue.owner_id
  where venue.slug = lower(btrim(lookup_slug))
    and venue.verification_status <> 'suspended'
    and venue.suspended_at is null
    and venue.archived_at is null;
$function$;

create or replace function public.get_venue_for_management(lookup_slug text)
returns table (
  venue_id uuid,
  slug text,
  name text,
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
volatile
security definer
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
    venue.address_text,
    extensions.st_x(venue.location::extensions.geometry),
    extensions.st_y(venue.location::extensions.geometry),
    venue.description,
    venue.screen_count,
    venue.stated_capacity,
    venue.verification_status::text,
    venue.suspended_at
  from public.venues as venue
  where venue.slug = lower(btrim(lookup_slug))
    and venue.archived_at is null
    and private.actor_manages_venue(actor_id, venue.id);
end;
$function$;

create or replace function public.get_venue_settings(input_venue_id uuid)
returns table (
  venue_id uuid,
  slug text,
  name text,
  role text,
  verification_status text,
  address_text text,
  longitude double precision,
  latitude double precision,
  description text,
  facilities text[],
  house_information text,
  default_attendance_mode text,
  default_requires_approval boolean,
  spaces jsonb
)
language plpgsql
volatile
security definer
set search_path = ''
as $function$
declare
  actor_id uuid := private.assert_common_actor();
begin
  if not private.actor_manages_venue(actor_id, input_venue_id) then
    raise exception using errcode = 'P0001', message = 'NOT_FOUND';
  end if;

  return query
  select
    venue.id,
    venue.slug,
    venue.name,
    membership.role::text,
    venue.verification_status::text,
    venue.address_text,
    extensions.st_x(venue.location::extensions.geometry),
    extensions.st_y(venue.location::extensions.geometry),
    venue.description,
    venue.facilities::text[],
    venue.house_information,
    venue.default_attendance_mode::text,
    venue.default_requires_approval,
    coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'id', space.id,
            'name', space.name,
            'capacity', space.capacity,
            'active', space.active
          ) order by space.active desc, space.sort_order, space.created_at, space.id
        )
        from public.venue_spaces as space
        where space.venue_id = venue.id
      ),
      '[]'::jsonb
    )
  from public.venues as venue
  join public.venue_memberships as membership
    on membership.venue_id = venue.id
    and membership.user_id = actor_id
    and membership.status = 'active'
    and membership.revoked_at is null
  where venue.id = input_venue_id
    and venue.archived_at is null;
end;
$function$;

create or replace function public.list_my_workspace_recovery()
returns table (
  workspace_kind text,
  workspace_id uuid,
  slug text,
  name text,
  role text
)
language sql
stable
security definer
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
    and venue.archived_at is null
  order by 1, 4, 2;
$function$;

-- Every function recreated above loses its prior ACL with the old signature.
-- Deny first, then grant only the intended Data API callers.
do $function_acl$
declare
  target record;
begin
  for target in
    select
      namespace.nspname,
      procedure.proname,
      pg_get_function_identity_arguments(procedure.oid) as identity_arguments
    from pg_proc as procedure
    join pg_namespace as namespace on namespace.oid = procedure.pronamespace
    where (
      namespace.nspname = 'private'
      and procedure.proname = any (array[
        'canonicalize_event_draft_values', 'create_or_update_event_core',
        'discover_event_page', 'event_request_context',
        'recalculate_group_discoverability'
      ])
    ) or (
      namespace.nspname = 'public'
      and procedure.proname = any (array[
        'activate_fan_workspace', 'complete_profile', 'create_group',
        'create_group_event', 'create_or_update_event', 'create_venue',
        'create_venue_workspace', 'create_venue_workspace_v2', 'discover_events',
        'discover_open_door_events', 'discover_owned_venue_events',
        'finalize_event_draft', 'get_event_summary', 'get_group_by_slug',
        'get_public_profile_by_handle', 'get_venue_by_slug',
        'get_venue_for_management', 'get_venue_settings', 'list_event_attendance',
        'list_friendships', 'list_my_event_participation', 'list_my_events',
        'list_my_group_relationships', 'list_my_groups', 'list_my_saved_items',
        'list_my_workspace_recovery', 'list_people_hub', 'plan_venue_events',
        'save_event_draft', 'search_groups', 'suggest_similar_groups',
        'update_venue', 'update_venue_workspace', 'update_venue_workspace_v2'
      ])
    )
  loop
    execute format(
      'revoke all on function %I.%I(%s) from public, anon, authenticated, service_role',
      target.nspname,
      target.proname,
      target.identity_arguments
    );
  end loop;

  for target in
    select procedure.proname,
      pg_get_function_identity_arguments(procedure.oid) as identity_arguments
    from pg_proc as procedure
    join pg_namespace as namespace on namespace.oid = procedure.pronamespace
    where namespace.nspname = 'public'
      and procedure.proname = any (array[
        'discover_events', 'discover_open_door_events', 'get_event_summary',
        'get_group_by_slug', 'get_public_profile_by_handle', 'get_venue_by_slug',
        'search_groups'
      ])
  loop
    execute format(
      'grant execute on function public.%I(%s) to anon, authenticated',
      target.proname,
      target.identity_arguments
    );
  end loop;

  for target in
    select procedure.proname,
      pg_get_function_identity_arguments(procedure.oid) as identity_arguments
    from pg_proc as procedure
    join pg_namespace as namespace on namespace.oid = procedure.pronamespace
    where namespace.nspname = 'public'
      and procedure.proname = any (array[
        'activate_fan_workspace', 'complete_profile', 'create_group',
        'create_group_event', 'create_or_update_event',
        'create_venue_workspace', 'create_venue_workspace_v2',
        'discover_owned_venue_events', 'finalize_event_draft',
        'get_venue_for_management', 'get_venue_settings', 'list_event_attendance',
        'list_friendships', 'list_my_event_participation', 'list_my_events',
        'list_my_group_relationships', 'list_my_groups', 'list_my_saved_items',
        'list_my_workspace_recovery', 'list_people_hub', 'plan_venue_events',
        'save_event_draft', 'suggest_similar_groups',
        'update_venue', 'update_venue_workspace', 'update_venue_workspace_v2'
      ])
  loop
    execute format(
      'grant execute on function public.%I(%s) to authenticated',
      target.proname,
      target.identity_arguments
    );
  end loop;
end;
$function_acl$;

commit;
