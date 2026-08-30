begin;

create table public.event_drafts (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  step integer not null,
  draft_values jsonb not null default '{}'::jsonb,
  organizing_group_id uuid references public.groups(id) on delete set null,
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  constraint event_drafts_step_check check (step between 1 and 3),
  constraint event_drafts_values_object_check check (jsonb_typeof(draft_values) = 'object')
);

comment on table public.event_drafts is
  'Owner-keyed Fan event wizard state containing only canonical non-sensitive scalar values.';

create index event_drafts_owner_updated_idx
  on public.event_drafts (owner_id, updated_at desc, id);
create index event_drafts_organizing_group_idx
  on public.event_drafts (organizing_group_id, updated_at desc, id)
  where organizing_group_id is not null;

create trigger event_drafts_set_updated_at
before update on public.event_drafts
for each row execute function private.set_updated_at();

create table public.event_draft_private_locations (
  draft_id uuid primary key references public.event_drafts(id) on delete cascade,
  address_text text not null,
  directions_text text,
  location extensions.geography(Point, 4326) not null,
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  constraint event_draft_private_locations_address_check check (
    address_text = btrim(address_text)
    and char_length(address_text) between 5 and 300
  ),
  constraint event_draft_private_locations_directions_check check (
    directions_text is null
    or (
      directions_text = btrim(directions_text)
      and char_length(directions_text) between 1 and 500
    )
  ),
  constraint event_draft_private_locations_israel_bounds_check check (
    extensions.st_x(location::extensions.geometry) between 34.0 and 36.0
    and extensions.st_y(location::extensions.geometry) between 29.0 and 34.0
  )
);

comment on table public.event_draft_private_locations is
  'One protected exact home location per Fan draft; accessible only through owner-authorized definer functions.';

create index event_draft_private_locations_location_gist_idx
  on public.event_draft_private_locations using gist (location);

create trigger event_draft_private_locations_set_updated_at
before update on public.event_draft_private_locations
for each row execute function private.set_updated_at();

alter table public.event_drafts enable row level security;
alter table public.event_drafts force row level security;
alter table public.event_draft_private_locations enable row level security;
alter table public.event_draft_private_locations force row level security;

revoke all on table public.event_drafts from public, anon, authenticated;
revoke all on table public.event_draft_private_locations from public, anon, authenticated;

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
    'matchId',
    'title',
    'description',
    'expectedActivity',
    'costDescription',
    'eventRules',
    'commercialAffiliation',
    'hostPresenceConfirmed',
    'cityId',
    'placeKind',
    'publicPlaceName',
    'publicAddressText',
    'publicLongitude',
    'publicLatitude',
    'audience',
    'audienceGroupId',
    'capacity'
  ]
  loop
    if not input_values ? field_name then
      continue;
    end if;

    raw_value := input_values -> field_name;
    if jsonb_typeof(raw_value) = 'null' then
      canonical := canonical || jsonb_build_object(field_name, null);
      continue;
    end if;

    if field_name in ('matchId', 'cityId', 'audienceGroupId') then
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
      'title',
      'description',
      'expectedActivity',
      'costDescription',
      'eventRules',
      'commercialAffiliation',
      'publicPlaceName',
      'publicAddressText'
    ) then
      if jsonb_typeof(raw_value) <> 'string' then
        raise exception using errcode = 'P0001', message = 'VALIDATION_FAILED';
      end if;
      normalized_text := btrim(raw_value #>> '{}');
      minimum_length := case field_name
        when 'title' then 3
        when 'description' then 10
        when 'expectedActivity' then 3
        when 'costDescription' then 2
        when 'eventRules' then 3
        when 'commercialAffiliation' then 2
        else 1
      end;
      maximum_length := case field_name
        when 'title' then 120
        when 'description' then 2000
        when 'expectedActivity' then 500
        when 'costDescription' then 300
        when 'eventRules' then 1000
        when 'commercialAffiliation' then 300
        when 'publicPlaceName' then 120
        else 300
      end;
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
        or (field_name = 'audience' and normalized_text not in ('group', 'friends', 'invite_only')) then
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
      if (field_name = 'publicLongitude' and normalized_number not between 34.0 and 36.0)
        or (field_name = 'publicLatitude' and normalized_number not between 29.0 and 34.0)
        or (
          field_name = 'capacity'
          and (
            normalized_number <> trunc(normalized_number)
            or normalized_number not between 1 and 1000
          )
        ) then
        raise exception using errcode = 'P0001', message = 'VALIDATION_FAILED';
      end if;
      canonical := canonical || jsonb_build_object(field_name, normalized_number);
      continue;
    end if;
  end loop;

  return canonical;
end;
$function$;

comment on function private.canonicalize_event_draft_values(jsonb) is
  'Validates supplied safe scalar fields, strips unknown/protected keys, and retains explicit nulls for merge-time clearing.';

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
  old_city_id text;
  next_city_id text;
  next_place_kind text;
  resolved_group_id uuid;
  audience_group_id uuid;
  protected_point extensions.geography(Point, 4326);
begin
  if input_step is null
    or input_step not between 1 and 3
    or input_private_mode is null
    or input_private_mode not in ('preserve', 'replace', 'clear') then
    raise exception using errcode = 'P0001', message = 'VALIDATION_FAILED';
  end if;

  if input_private_mode = 'preserve' and (
    input_private_address_text is not null
    or input_private_directions_text is not null
    or input_private_longitude is not null
    or input_private_latitude is not null
  ) then
    raise exception using errcode = 'P0001', message = 'VALIDATION_FAILED';
  end if;
  if input_private_mode = 'clear' and (
    input_private_address_text is not null
    or input_private_directions_text is not null
    or input_private_longitude is not null
    or input_private_latitude is not null
  ) then
    raise exception using errcode = 'P0001', message = 'VALIDATION_FAILED';
  end if;

  safe_patch := private.canonicalize_event_draft_values(input_values);

  if input_draft_id is null then
    insert into public.event_drafts (owner_id, step, draft_values, organizing_group_id)
    values (actor_id, input_step, '{}'::jsonb, null)
    returning * into target_draft;
  else
    select draft.*
    into target_draft
    from public.event_drafts as draft
    where draft.id = input_draft_id
      and draft.owner_id = actor_id
    for update;

    if not found then
      raise exception using errcode = 'P0001', message = 'NOT_FOUND';
    end if;
  end if;

  old_city_id := target_draft.draft_values ->> 'cityId';
  merged_values := jsonb_strip_nulls(target_draft.draft_values || safe_patch);
  next_city_id := merged_values ->> 'cityId';
  next_place_kind := merged_values ->> 'placeKind';

  resolved_group_id := input_organizing_group_id;

  if merged_values ->> 'audience' is distinct from 'group' then
    merged_values := merged_values - 'audienceGroupId';
    audience_group_id := null;
  else
    audience_group_id := case
      when merged_values ? 'audienceGroupId'
        then (merged_values ->> 'audienceGroupId')::uuid
      else null
    end;
  end if;

  if next_place_kind = 'home' then
    merged_values := merged_values
      - 'publicPlaceName'
      - 'publicAddressText'
      - 'publicLongitude'
      - 'publicLatitude';
  end if;

  if resolved_group_id is not null and not exists (
    select 1
    from public.groups as supporter_group
    join public.group_memberships as membership
      on membership.group_id = supporter_group.id
    where supporter_group.id = resolved_group_id
      and supporter_group.lifecycle in ('forming', 'active')
      and supporter_group.suspended_at is null
      and membership.user_id = actor_id
      and membership.status = 'active'
      and not exists (
        select 1
        from public.group_bans as ban
        where ban.group_id = supporter_group.id
          and ban.user_id = actor_id
          and ban.revoked_at is null
      )
  ) then
    raise exception using errcode = 'P0001', message = 'NOT_ALLOWED';
  end if;

  if audience_group_id is not null and not exists (
    select 1
    from public.groups as supporter_group
    join public.group_memberships as membership
      on membership.group_id = supporter_group.id
    where supporter_group.id = audience_group_id
      and supporter_group.lifecycle in ('forming', 'active')
      and supporter_group.suspended_at is null
      and membership.user_id = actor_id
      and membership.status = 'active'
      and not exists (
        select 1
        from public.group_bans as ban
        where ban.group_id = supporter_group.id
          and ban.user_id = actor_id
          and ban.revoked_at is null
      )
  ) then
    raise exception using errcode = 'P0001', message = 'NOT_ALLOWED';
  end if;

  if input_private_mode = 'replace' then
    if next_place_kind is distinct from 'home'
      or next_city_id is null
      or nullif(btrim(input_private_address_text), '') is null
      or char_length(btrim(input_private_address_text)) not between 5 and 300
      or (
        input_private_directions_text is not null
        and char_length(btrim(input_private_directions_text)) not between 1 and 500
      )
      or input_private_longitude is null
      or input_private_latitude is null
      or input_private_longitude not between 34.0 and 36.0
      or input_private_latitude not between 29.0 and 34.0 then
      raise exception using errcode = 'P0001', message = 'VALIDATION_FAILED';
    end if;

    protected_point := extensions.st_setsrid(
      extensions.st_makepoint(input_private_longitude, input_private_latitude),
      4326
    )::extensions.geography;

    if not exists (
      select 1
      from public.cities as city
      where city.id = next_city_id::uuid
        and city.active
        and extensions.st_dwithin(city.center, protected_point, 10000)
    ) then
      raise exception using errcode = 'P0001', message = 'VALIDATION_FAILED';
    end if;
  end if;

  update public.event_drafts as draft
  set
    step = input_step,
    draft_values = merged_values,
    organizing_group_id = resolved_group_id
  where draft.id = target_draft.id
  returning * into target_draft;

  if input_private_mode = 'clear'
    or next_place_kind is distinct from 'home'
    or next_city_id is distinct from old_city_id then
    delete from public.event_draft_private_locations as private_location
    where private_location.draft_id = target_draft.id;
  end if;

  if input_private_mode = 'replace' then
    insert into public.event_draft_private_locations (
      draft_id,
      address_text,
      directions_text,
      location
    )
    values (
      target_draft.id,
      btrim(input_private_address_text),
      nullif(btrim(input_private_directions_text), ''),
      protected_point
    )
    on conflict on constraint event_draft_private_locations_pkey do update
    set
      address_text = excluded.address_text,
      directions_text = excluded.directions_text,
      location = excluded.location;
  end if;

  return query
  select
    target_draft.id,
    target_draft.step,
    target_draft.draft_values,
    target_draft.organizing_group_id,
    private_location.address_text,
    private_location.directions_text,
    extensions.st_x(private_location.location::extensions.geometry),
    extensions.st_y(private_location.location::extensions.geometry),
    target_draft.updated_at
  from (select 1) as singleton
  left join public.event_draft_private_locations as private_location
    on private_location.draft_id = target_draft.id;
end;
$function$;

comment on function public.save_event_draft(uuid, integer, jsonb, uuid, text, text, text, double precision, double precision) is
  'Creates or row-locks one owner draft, merges canonical safe scalar values, and applies explicit preserve/replace/clear semantics to protected home data.';

create or replace function private.assert_event_draft_owner(input_draft_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $function$
declare
  actor_id uuid := auth.uid();
begin
  if actor_id is null
    or not exists (
      select 1
      from auth.users as account
      where account.id = actor_id
    ) then
    raise exception using errcode = 'P0001', message = 'AUTH_REQUIRED';
  end if;

  if not exists (
    select 1
    from public.event_drafts as draft
    where draft.id = input_draft_id
      and draft.owner_id = actor_id
  ) then
    raise exception using errcode = 'P0001', message = 'NOT_FOUND';
  end if;

  return actor_id;
end;
$function$;

comment on function private.assert_event_draft_owner(uuid) is
  'Authorizes recovery-only draft reads and deletion by authenticated row ownership without applying active Fan eligibility.';

create or replace function public.get_event_draft(input_draft_id uuid)
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
declare
  actor_id uuid := private.assert_event_draft_owner(input_draft_id);
begin
  return query
  select
    draft.id,
    draft.step,
    draft.draft_values,
    draft.organizing_group_id,
    private_location.address_text,
    private_location.directions_text,
    extensions.st_x(private_location.location::extensions.geometry),
    extensions.st_y(private_location.location::extensions.geometry),
    draft.updated_at
  from public.event_drafts as draft
  left join public.event_draft_private_locations as private_location
    on private_location.draft_id = draft.id
  where draft.id = input_draft_id
    and draft.owner_id = actor_id;

  if not found then
    raise exception using errcode = 'P0001', message = 'NOT_FOUND';
  end if;
end;
$function$;

comment on function public.get_event_draft(uuid) is
  'Returns one authenticated owner draft with protected home fields separated from the safe JSON payload.';

create or replace function public.discard_event_draft(input_draft_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $function$
declare
  actor_id uuid := private.assert_event_draft_owner(input_draft_id);
  deleted_id uuid;
begin
  delete from public.event_drafts as draft
  where draft.id = input_draft_id
    and draft.owner_id = actor_id
  returning draft.id into deleted_id;

  if deleted_id is null then
    raise exception using errcode = 'P0001', message = 'NOT_FOUND';
  end if;

  return true;
end;
$function$;

comment on function public.discard_event_draft(uuid) is
  'Deletes only the authenticated owner draft and cascades its protected location without requiring current Fan activation.';

alter function public.create_or_update_event(
  uuid, uuid, uuid, uuid, text, text, text, text, text, text, boolean,
  timestamptz, timestamptz, uuid, text, uuid, text, text, double precision,
  double precision, text, uuid, uuid, integer, boolean, text, text,
  double precision, double precision, text, uuid
) set schema private;

alter function private.create_or_update_event(
  uuid, uuid, uuid, uuid, text, text, text, text, text, text, boolean,
  timestamptz, timestamptz, uuid, text, uuid, text, text, double precision,
  double precision, text, uuid, uuid, integer, boolean, text, text,
  double precision, double precision, text, uuid
) rename to create_or_update_event_core;

revoke all on function private.create_or_update_event_core(
  uuid, uuid, uuid, uuid, text, text, text, text, text, text, boolean,
  timestamptz, timestamptz, uuid, text, uuid, text, text, double precision,
  double precision, text, uuid, uuid, integer, boolean, text, text,
  double precision, double precision, text, uuid
) from public, anon, authenticated;

create or replace function private.lock_active_group_author_role(
  input_group_id uuid,
  input_actor_id uuid
)
returns public.group_role
language plpgsql
security definer
set search_path = ''
as $function$
declare
  target_group public.groups%rowtype;
  target_membership public.group_memberships%rowtype;
begin
  if input_group_id is null or input_actor_id is null then
    raise exception using errcode = 'P0001', message = 'NOT_ALLOWED';
  end if;

  select supporter_group.*
  into target_group
  from public.groups as supporter_group
  where supporter_group.id = input_group_id
  for update;

  if not found
    or target_group.lifecycle not in ('forming', 'active')
    or target_group.suspended_at is not null then
    raise exception using errcode = 'P0001', message = 'NOT_ALLOWED';
  end if;

  select membership.*
  into target_membership
  from public.group_memberships as membership
  where membership.group_id = input_group_id
    and membership.user_id = input_actor_id
  for update;

  if not found
    or target_membership.status <> 'active'
    or exists (
      select 1
      from public.group_bans as ban
      where ban.group_id = input_group_id
        and ban.user_id = input_actor_id
        and ban.revoked_at is null
    ) then
    raise exception using errcode = 'P0001', message = 'NOT_ALLOWED';
  end if;

  return target_membership.role;
end;
$function$;

comment on function private.lock_active_group_author_role(uuid, uuid) is
  'Locks one eligible group and the current active author membership, then returns the authoritative role.';

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

    if input_audience = 'group' then
      if input_audience_group_id is null then
        raise exception using errcode = 'P0001', message = 'NOT_ALLOWED';
      end if;
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

    foreach locked_group_id in array group_ids
    loop
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
    input_city_id,
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

  if created_event_id is null then
    raise exception using errcode = 'P0001', message = 'INTERNAL_ERROR';
  end if;

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
  set
    organizing_group_id = governing_group_id,
    status = final_status,
    published_at = case
      when final_status = 'published' then coalesce(event.published_at, statement_timestamp())
      else null
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

comment on function public.create_or_update_event(
  uuid, uuid, uuid, uuid, text, text, text, text, text, text, boolean,
  timestamptz, timestamptz, uuid, text, uuid, text, text, double precision,
  double precision, text, uuid, uuid, integer, boolean, text, text,
  double precision, double precision, text, uuid
) is
  'Preserves the private and venue event API while enforcing group author role, publication status, and audit rules at the direct RPC boundary.';

revoke all on function private.lock_active_group_author_role(uuid, uuid)
  from public, anon, authenticated;
revoke all on function public.create_or_update_event(
  uuid, uuid, uuid, uuid, text, text, text, text, text, text, boolean,
  timestamptz, timestamptz, uuid, text, uuid, text, text, double precision,
  double precision, text, uuid, uuid, integer, boolean, text, text,
  double precision, double precision, text, uuid
) from public, anon;
grant execute on function public.create_or_update_event(
  uuid, uuid, uuid, uuid, text, text, text, text, text, text, boolean,
  timestamptz, timestamptz, uuid, text, uuid, text, text, double precision,
  double precision, text, uuid, uuid, integer, boolean, text, text,
  double precision, double precision, text, uuid
) to authenticated;

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
  input_city_id uuid,
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
language plpgsql
security definer
set search_path = ''
as $function$
#variable_conflict use_variable
begin
  if input_organizing_group_id is null
    or input_intent is null
    or input_intent not in ('draft', 'publish') then
    raise exception using errcode = 'P0001', message = 'VALIDATION_FAILED';
  end if;

  return query
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
    input_city_id,
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
end;
$function$;

comment on function public.create_group_event(uuid, uuid, text, text, text, text, text, text, boolean, timestamptz, timestamptz, uuid, text, text, text, double precision, double precision, text, uuid, integer, text, text, double precision, double precision, text, uuid) is
  'Delegates group creation to the canonical direct event boundary so role, status, audit, and multi-group lock ordering are enforced exactly once.';

create or replace function public.publish_group_event(
  input_event_id uuid,
  input_decision text,
  audit_request_id uuid default null
)
returns table (event_id uuid, status text, decision text)
language plpgsql
security definer
set search_path = ''
as $function$
#variable_conflict use_variable
declare
  actor_id uuid := private.assert_fan_actor();
  initial_host_user_id uuid;
  initial_created_by uuid;
  target_event public.events%rowtype;
  target_group public.groups%rowtype;
  target_membership public.group_memberships%rowtype;
  next_status public.event_status;
begin
  if input_decision is null or input_decision not in ('approve', 'reject') then
    raise exception using errcode = 'P0001', message = 'VALIDATION_FAILED';
  end if;

  select event.host_user_id, event.created_by
  into initial_host_user_id, initial_created_by
  from public.events as event
  where event.id = input_event_id
    and event.organizing_group_id is not null
    and event.status = 'pending_group_review';

  if not found or initial_host_user_id is null then
    raise exception using errcode = 'P0001', message = 'INVALID_TRANSITION';
  end if;

  if initial_created_by = actor_id then
    raise exception using errcode = 'P0001', message = 'NOT_ALLOWED';
  end if;

  perform private.lock_direct_user_pair(initial_host_user_id, actor_id);

  select event.*
  into target_event
  from public.events as event
  where event.id = input_event_id
  for update;

  if not found
    or target_event.organizing_group_id is null
    or target_event.status <> 'pending_group_review'
    or target_event.host_user_id is distinct from initial_host_user_id
    or target_event.created_by is distinct from initial_created_by then
    raise exception using errcode = 'P0001', message = 'INVALID_TRANSITION';
  end if;

  if target_event.created_by = actor_id then
    raise exception using errcode = 'P0001', message = 'NOT_ALLOWED';
  end if;

  select supporter_group.*
  into target_group
  from public.groups as supporter_group
  where supporter_group.id = target_event.organizing_group_id
  for update;

  if not found
    or target_group.lifecycle not in ('forming', 'active')
    or target_group.suspended_at is not null then
    raise exception using errcode = 'P0001', message = 'NOT_FOUND';
  end if;

  select membership.*
  into target_membership
  from public.group_memberships as membership
  where membership.group_id = target_group.id
    and membership.user_id = actor_id
  for update;

  if not found
    or target_membership.status <> 'active'
    or target_membership.role not in ('owner', 'admin')
    or exists (
      select 1
      from public.group_bans as ban
      where ban.group_id = target_group.id
        and ban.user_id = actor_id
        and ban.revoked_at is null
    )
    or private.users_are_blocked(target_event.host_user_id, actor_id) then
    raise exception using errcode = 'P0001', message = 'NOT_FOUND';
  end if;

  if input_decision = 'approve' then
    if target_event.starts_at <= statement_timestamp() then
      raise exception using errcode = 'P0001', message = 'EVENT_STARTED';
    end if;

    if not private.actor_is_active_group_member(target_group.id, target_event.created_by) then
      raise exception using errcode = 'P0001', message = 'NOT_ALLOWED';
    end if;

    next_status := 'published'::public.event_status;
    update public.events as event
    set
      status = next_status,
      published_at = statement_timestamp(),
      cancelled_at = null,
      cancel_reason = null
    where event.id = input_event_id;
  else
    next_status := 'cancelled'::public.event_status;
    update public.events as event
    set
      status = next_status,
      published_at = null,
      cancelled_at = statement_timestamp(),
      cancel_reason = 'Rejected by organizing group.'
    where event.id = input_event_id;
  end if;

  perform private.write_security_audit(
    actor_id,
    'event.group_review.' || input_decision,
    'event',
    input_event_id,
    'succeeded',
    audit_request_id,
    jsonb_build_object(
      'organizing_group_id', target_group.id,
      'decision', input_decision,
      'reviewer_role', target_membership.role::text,
      'status', next_status::text
    )
  );

  return query select input_event_id, next_status::text, input_decision;
end;
$function$;

comment on function public.publish_group_event(uuid, text, uuid) is
  'Lets a different current owner/admin decide a pending member submission under event, group, and membership row locks.';

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
  target_city public.cities%rowtype;
  safe_values jsonb;
  parsed_match_id uuid;
  parsed_city_id uuid;
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
  select draft.*
  into target_draft
  from public.event_drafts as draft
  where draft.id = input_draft_id
    and draft.owner_id = actor_id
  for update;

  if not found then
    raise exception using errcode = 'P0001', message = 'NOT_FOUND';
  end if;

  safe_values := target_draft.draft_values;
  if target_draft.step <> 3
    or not safe_values ?& array[
      'matchId',
      'title',
      'description',
      'expectedActivity',
      'costDescription',
      'eventRules',
      'commercialAffiliation',
      'hostPresenceConfirmed',
      'cityId',
      'placeKind',
      'audience',
      'capacity'
    ]
    or (safe_values ->> 'hostPresenceConfirmed')::boolean is distinct from true then
    raise exception using errcode = 'P0001', message = 'VALIDATION_FAILED';
  end if;

  begin
    parsed_match_id := (safe_values ->> 'matchId')::uuid;
    parsed_city_id := (safe_values ->> 'cityId')::uuid;
    parsed_place_kind := safe_values ->> 'placeKind';
    parsed_audience := safe_values ->> 'audience';
    parsed_capacity := (safe_values ->> 'capacity')::integer;
    parsed_audience_group_id := case
      when safe_values ? 'audienceGroupId'
        then (safe_values ->> 'audienceGroupId')::uuid
      else null
    end;
  exception
    when invalid_text_representation or numeric_value_out_of_range then
      raise exception using errcode = 'P0001', message = 'VALIDATION_FAILED';
  end;

  select match.*
  into target_match
  from public.matches as match
  where match.id = parsed_match_id
    and match.starts_at > statement_timestamp()
    and match.status in ('scheduled', 'timed', 'postponed')
  for share;

  if not found then
    raise exception using errcode = 'P0001', message = 'NOT_FOUND';
  end if;

  select city.*
  into target_city
  from public.cities as city
  where city.id = parsed_city_id
    and city.active
  for share;

  if not found then
    raise exception using errcode = 'P0001', message = 'VALIDATION_FAILED';
  end if;

  select private_location.*
  into target_private
  from public.event_draft_private_locations as private_location
  where private_location.draft_id = target_draft.id
  for update;
  has_private_location := found;

  if parsed_place_kind = 'home' then
    if not has_private_location
      or parsed_capacity not between 1 and 12
      or safe_values ?| array[
        'publicPlaceName',
        'publicAddressText',
        'publicLongitude',
        'publicLatitude'
      ]
      or not extensions.st_dwithin(target_city.center, target_private.location, 10000) then
      raise exception using errcode = 'P0001', message = 'VALIDATION_FAILED';
    end if;
  elsif parsed_place_kind = 'public_place' then
    if has_private_location
      or not safe_values ?& array[
        'publicPlaceName',
        'publicAddressText',
        'publicLongitude',
        'publicLatitude'
      ] then
      raise exception using errcode = 'P0001', message = 'VALIDATION_FAILED';
    end if;

    begin
      public_longitude := (safe_values ->> 'publicLongitude')::double precision;
      public_latitude := (safe_values ->> 'publicLatitude')::double precision;
    exception
      when invalid_text_representation or numeric_value_out_of_range then
        raise exception using errcode = 'P0001', message = 'VALIDATION_FAILED';
    end;

    if not extensions.st_dwithin(
      target_city.center,
      extensions.st_setsrid(
        extensions.st_makepoint(public_longitude, public_latitude),
        4326
      )::extensions.geography,
      10000
    ) then
      raise exception using errcode = 'P0001', message = 'VALIDATION_FAILED';
    end if;
  else
    raise exception using errcode = 'P0001', message = 'VALIDATION_FAILED';
  end if;

  if target_draft.organizing_group_id is not null
    and not exists (
      select 1
      from public.groups as supporter_group
      join public.group_memberships as membership
        on membership.group_id = supporter_group.id
      where supporter_group.id = target_draft.organizing_group_id
        and supporter_group.lifecycle in ('forming', 'active')
        and supporter_group.suspended_at is null
        and membership.user_id = actor_id
        and membership.status = 'active'
        and not exists (
          select 1
          from public.group_bans as ban
          where ban.group_id = supporter_group.id
            and ban.user_id = actor_id
            and ban.revoked_at is null
        )
    ) then
    raise exception using errcode = 'P0001', message = 'NOT_ALLOWED';
  end if;

  if parsed_audience = 'group' then
    if parsed_audience_group_id is null
      or not exists (
        select 1
        from public.groups as supporter_group
        join public.group_memberships as membership
          on membership.group_id = supporter_group.id
        where supporter_group.id = parsed_audience_group_id
          and supporter_group.lifecycle in ('forming', 'active')
          and supporter_group.suspended_at is null
          and membership.user_id = actor_id
          and membership.status = 'active'
          and not exists (
            select 1
            from public.group_bans as ban
            where ban.group_id = supporter_group.id
              and ban.user_id = actor_id
              and ban.revoked_at is null
          )
      ) then
      raise exception using errcode = 'P0001', message = 'NOT_ALLOWED';
    end if;
  elsif parsed_audience = 'friends' then
    if parsed_audience_group_id is not null
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
    select created.event_id, created.status
    into created_event_id, created_status
    from public.create_group_event(
      governing_group_id,
      parsed_match_id,
      safe_values ->> 'title',
      safe_values ->> 'description',
      safe_values ->> 'expectedActivity',
      safe_values ->> 'costDescription',
      safe_values ->> 'eventRules',
      safe_values ->> 'commercialAffiliation',
      true,
      target_match.starts_at,
      target_match.starts_at + interval '3 hours',
      parsed_city_id,
      parsed_place_kind,
      safe_values ->> 'publicPlaceName',
      safe_values ->> 'publicAddressText',
      public_longitude,
      public_latitude,
      parsed_audience,
      parsed_audience_group_id,
      parsed_capacity,
      target_private.address_text,
      target_private.directions_text,
      case
        when has_private_location
          then extensions.st_x(target_private.location::extensions.geometry)
        else null
      end,
      case
        when has_private_location
          then extensions.st_y(target_private.location::extensions.geometry)
        else null
      end,
      'publish',
      audit_request_id
    ) as created;
  else
    select created.event_id, created.status
    into created_event_id, created_status
    from public.create_or_update_event(
      null,
      null,
      null,
      parsed_match_id,
      safe_values ->> 'title',
      safe_values ->> 'description',
      safe_values ->> 'expectedActivity',
      safe_values ->> 'costDescription',
      safe_values ->> 'eventRules',
      safe_values ->> 'commercialAffiliation',
      true,
      target_match.starts_at,
      target_match.starts_at + interval '3 hours',
      parsed_city_id,
      parsed_place_kind,
      null,
      safe_values ->> 'publicPlaceName',
      safe_values ->> 'publicAddressText',
      public_longitude,
      public_latitude,
      parsed_audience,
      null,
      null,
      parsed_capacity,
      true,
      target_private.address_text,
      target_private.directions_text,
      case
        when has_private_location
          then extensions.st_x(target_private.location::extensions.geometry)
        else null
      end,
      case
        when has_private_location
          then extensions.st_y(target_private.location::extensions.geometry)
        else null
      end,
      'publish',
      audit_request_id
    ) as created;
  end if;

  if created_event_id is null then
    raise exception using errcode = 'P0001', message = 'INTERNAL_ERROR';
  end if;

  delete from public.event_drafts as draft
  where draft.id = target_draft.id;

  return query select created_event_id, created_status;
end;
$function$;

comment on function public.finalize_event_draft(uuid, uuid) is
  'Locks and revalidates one complete owner Fan draft, creates one event through the controlled transaction, then atomically removes the draft aggregate.';

revoke all on function private.canonicalize_event_draft_values(jsonb)
  from public, anon, authenticated;
revoke all on function private.assert_event_draft_owner(uuid)
  from public, anon, authenticated;
revoke all on function public.save_event_draft(uuid, integer, jsonb, uuid, text, text, text, double precision, double precision)
  from public, anon;
revoke all on function public.get_event_draft(uuid)
  from public, anon;
revoke all on function public.discard_event_draft(uuid)
  from public, anon;
revoke all on function public.finalize_event_draft(uuid, uuid)
  from public, anon;

grant execute on function public.save_event_draft(uuid, integer, jsonb, uuid, text, text, text, double precision, double precision)
  to authenticated;
grant execute on function public.get_event_draft(uuid)
  to authenticated;
grant execute on function public.discard_event_draft(uuid)
  to authenticated;
grant execute on function public.finalize_event_draft(uuid, uuid)
  to authenticated;

commit;
