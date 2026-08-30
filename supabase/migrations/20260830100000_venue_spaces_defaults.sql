begin;

create type public.venue_facility as enum (
  'wheelchair_accessible',
  'step_free_access',
  'accessible_toilet',
  'hearing_loop',
  'parking',
  'food',
  'drinks'
);

create or replace function private.venue_facilities_are_unique(
  input_facilities public.venue_facility[]
)
returns boolean
language sql
immutable
strict
set search_path = ''
as $function$
  select cardinality(input_facilities) = (
    select count(distinct facility)
    from unnest(input_facilities) as facility
  );
$function$;

alter table public.venues
  add column facilities public.venue_facility[] not null default '{}',
  add column house_information text not null default '',
  add column default_requires_approval boolean not null default true,
  add column business_representation_attested_at timestamptz,
  add column business_representation_attested_by uuid
    references public.profiles(id) on delete restrict,
  add constraint venues_facilities_bounded_unique_check check (
    cardinality(facilities) <= 7
    and array_position(facilities, null) is null
    and private.venue_facilities_are_unique(facilities)
  ),
  add constraint venues_house_information_length_check check (
    house_information = btrim(house_information)
    and char_length(house_information) <= 1000
  ),
  add constraint venues_business_representation_evidence_check check (
    (
      business_representation_attested_at is null
      and business_representation_attested_by is null
    )
    or (
      business_representation_attested_at is not null
      and business_representation_attested_by is not null
    )
  );

comment on column public.venues.facilities is
  'Bounded reusable Venue facility and accessibility defaults; values are not platform verification.';
comment on column public.venues.house_information is
  'Bounded reusable public house information for Venue-hosted events.';
comment on column public.venues.default_requires_approval is
  'Default joining policy for future Venue events; existing event snapshots never change.';
comment on column public.venues.business_representation_attested_at is
  'Self-serve truthful-representation attestation, separate from platform verification.';

create table public.venue_spaces (
  id uuid primary key default gen_random_uuid(),
  venue_id uuid not null references public.venues(id) on delete cascade,
  name text not null,
  capacity integer,
  active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  constraint venue_spaces_name_length_check check (
    name = btrim(name)
    and char_length(name) between 1 and 120
  ),
  constraint venue_spaces_capacity_check check (
    capacity is null or capacity between 1 and 100000
  ),
  constraint venue_spaces_sort_order_check check (sort_order between 0 and 1000)
);

comment on table public.venue_spaces is
  'Named Venue viewing areas. Capacity may remain null only when legacy setup is incomplete.';

create unique index venue_spaces_active_name_uidx
  on public.venue_spaces (venue_id, lower(name))
  where active;
create index venue_spaces_stable_order_idx
  on public.venue_spaces (venue_id, active desc, sort_order, created_at, id);

create trigger venue_spaces_set_updated_at
before update on public.venue_spaces
for each row execute function private.set_updated_at();

create or replace function private.ensure_venue_main_space(input_venue_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
begin
  insert into public.venue_spaces (venue_id, name, capacity, active, sort_order)
  select venue.id, 'Main screen', venue.stated_capacity, true, 0
  from public.venues as venue
  where venue.id = input_venue_id
    and not exists (
      select 1
      from public.venue_spaces as existing_space
      where existing_space.venue_id = venue.id
    );
end;
$function$;

comment on function private.ensure_venue_main_space(uuid) is
  'Idempotently applies the honest one-area legacy backfill without fabricating screen details.';

select private.ensure_venue_main_space(venue.id)
from public.venues as venue;

alter table public.events
  add column venue_space_id uuid references public.venue_spaces(id) on delete restrict;

create index events_venue_space_status_starts_idx
  on public.events (venue_space_id, status, starts_at, id)
  where venue_space_id is not null;

create or replace function private.validate_event_venue_space()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  space_venue_id uuid;
begin
  if new.venue_space_id is null then
    return new;
  end if;

  select space.venue_id
  into space_venue_id
  from public.venue_spaces as space
  where space.id = new.venue_space_id;

  if space_venue_id is null
    or new.place_kind <> 'venue'
    or new.host_venue_id is distinct from space_venue_id
    or new.venue_id is distinct from space_venue_id then
    raise exception using errcode = '23514', message = 'VENUE_SPACE_MISMATCH';
  end if;

  return new;
end;
$function$;

comment on function private.validate_event_venue_space() is
  'Prevents an event from attaching an area owned by a different Venue.';

create trigger events_validate_venue_space
before insert or update of venue_space_id, host_venue_id, venue_id, place_kind
on public.events
for each row execute function private.validate_event_venue_space();

create or replace function public.create_venue_workspace(
  input_name text,
  input_slug text,
  input_city_id uuid,
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
language plpgsql
security definer
set search_path = ''
as $function$
#variable_conflict use_variable
declare
  actor_id uuid := private.assert_actor(false);
  actor_profile public.profiles%rowtype;
  created_venue public.venues%rowtype;
  parsed_facilities public.venue_facility[];
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
    select coalesce(array_agg(facility::public.venue_facility order by ordinal), '{}')
    into parsed_facilities
    from unnest(coalesce(input_facilities, '{}')) with ordinality as item(facility, ordinal);
  exception when invalid_text_representation then
    raise exception using errcode = 'P0001', message = 'VALIDATION_FAILED';
  end;

  if input_longitude is null
    or input_latitude is null
    or input_longitude not between 34.0 and 36.0
    or input_latitude not between 29.0 and 34.0
    or input_main_space_capacity is null
    or input_main_space_capacity not between 1 and 100000
    or nullif(btrim(input_main_space_name), '') is null
    or char_length(btrim(input_main_space_name)) > 120
    or char_length(normalized_house_information) > 1000
    or input_default_requires_approval is null
    or cardinality(parsed_facilities) > 7
    or not private.venue_facilities_are_unique(parsed_facilities)
    or not exists (
      select 1 from public.cities as city
      where city.id = input_city_id and city.active
    ) then
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
    owner_id, slug, name, city_id, address_text, location, description,
    screen_count, stated_capacity, facilities, house_information,
    default_requires_approval, business_representation_attested_at,
    business_representation_attested_by
  )
  values (
    actor_id,
    lower(btrim(input_slug)),
    btrim(input_name),
    input_city_id,
    btrim(input_address_text),
    extensions.st_setsrid(
      extensions.st_makepoint(input_longitude::double precision, input_latitude::double precision),
      4326
    )::extensions.geography,
    btrim(input_description),
    1,
    input_main_space_capacity,
    parsed_facilities,
    normalized_house_information,
    input_default_requires_approval,
    statement_timestamp(),
    actor_id
  )
  returning * into created_venue;

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
      'space_count', 1
    )
  );

  return query select
    created_venue.id,
    created_venue.slug,
    created_venue.verification_status::text;
exception
  when unique_violation then
    raise exception using errcode = 'P0001', message = 'VENUE_SLUG_UNAVAILABLE';
end;
$function$;

comment on function public.create_venue_workspace(
  text, text, uuid, text, numeric, numeric, text, text, integer, text[], text,
  boolean, boolean, boolean, integer, uuid
) is
  'Atomically records common trust and representation attestations, creates an Unverified Venue, active owner membership, and one explicitly named positive-capacity area.';

create or replace function public.get_venue_workspace(input_venue_id uuid)
returns table (
  venue_id uuid,
  slug text,
  name text,
  role text,
  verification_status text,
  needs_area_setup boolean,
  needs_capacity boolean,
  spaces jsonb
)
language plpgsql
security definer
stable
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
    coalesce(venue.screen_count, 1) > (
      select count(*)
      from public.venue_spaces as active_space
      where active_space.venue_id = venue.id and active_space.active
    ),
    exists (
      select 1 from public.venue_spaces as incomplete_space
      where incomplete_space.venue_id = venue.id
        and incomplete_space.active
        and incomplete_space.capacity is null
    ),
    coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'id', space.id,
            'name', space.name,
            'capacity', space.capacity,
            'active', space.active
          )
          order by space.active desc, space.sort_order, space.created_at, space.id
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
  where venue.id = input_venue_id;
end;
$function$;

comment on function public.get_venue_workspace(uuid) is
  'Returns a strict one-Venue workspace projection with areas but no membership records.';

create or replace function public.list_venue_calendar(
  input_venue_id uuid,
  input_limit integer default 100
)
returns table (
  event_id uuid,
  title text,
  status text,
  starts_at timestamptz,
  ends_at timestamptz,
  venue_space_id uuid,
  venue_space_name text,
  capacity integer,
  approved_attendee_count bigint,
  requires_approval boolean
)
language plpgsql
security definer
stable
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
    event.id,
    event.title,
    event.status::text,
    event.starts_at,
    event.ends_at,
    event.venue_space_id,
    space.name,
    event.capacity,
    (
      select count(*)
      from public.event_attendance as attendance
      where attendance.event_id = event.id
        and attendance.status = 'approved'
    ),
    event.requires_approval
  from public.events as event
  left join public.venue_spaces as space on space.id = event.venue_space_id
  where event.host_venue_id = input_venue_id
  order by event.starts_at, event.id
  limit least(greatest(coalesce(input_limit, 100), 1), 250);
end;
$function$;

comment on function public.list_venue_calendar(uuid, integer) is
  'Returns bounded event snapshots for one actively managed Venue workspace.';

create or replace function public.update_venue_workspace(
  input_venue_id uuid,
  input_name text,
  input_slug text,
  input_city_id uuid,
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
language plpgsql
security definer
set search_path = ''
as $function$
#variable_conflict use_variable
declare
  actor_id uuid := private.assert_common_actor();
  target_venue public.venues%rowtype;
  parsed_facilities public.venue_facility[];
  normalized_house_information text := coalesce(btrim(input_house_information), '');
begin
  if not private.actor_manages_venue(actor_id, input_venue_id) then
    raise exception using errcode = 'P0001', message = 'NOT_ALLOWED';
  end if;

  begin
    select coalesce(array_agg(facility::public.venue_facility order by ordinal), '{}')
    into parsed_facilities
    from unnest(coalesce(input_facilities, '{}')) with ordinality as item(facility, ordinal);
  exception when invalid_text_representation then
    raise exception using errcode = 'P0001', message = 'VALIDATION_FAILED';
  end;

  if input_longitude is null
    or input_latitude is null
    or input_longitude not between 34.0 and 36.0
    or input_latitude not between 29.0 and 34.0
    or char_length(normalized_house_information) > 1000
    or input_default_requires_approval is null
    or cardinality(parsed_facilities) > 7
    or not private.venue_facilities_are_unique(parsed_facilities)
    or not exists (
      select 1 from public.cities as city
      where city.id = input_city_id and city.active
    ) then
    raise exception using errcode = 'P0001', message = 'VALIDATION_FAILED';
  end if;

  update public.venues as venue
  set slug = lower(btrim(input_slug)),
      name = btrim(input_name),
      city_id = input_city_id,
      address_text = btrim(input_address_text),
      location = extensions.st_setsrid(
        extensions.st_makepoint(input_longitude::double precision, input_latitude::double precision),
        4326
      )::extensions.geography,
      description = btrim(input_description),
      facilities = parsed_facilities,
      house_information = normalized_house_information,
      default_requires_approval = input_default_requires_approval
  where venue.id = input_venue_id
  returning * into target_venue;

  perform private.write_security_audit(
    actor_id,
    'venue.workspace.update',
    'venue',
    target_venue.id,
    'succeeded',
    audit_request_id,
    jsonb_build_object('verification_status', target_venue.verification_status::text)
  );

  return query select
    target_venue.id,
    target_venue.slug,
    target_venue.verification_status::text;
exception
  when unique_violation then
    raise exception using errcode = 'P0001', message = 'VENUE_SLUG_UNAVAILABLE';
end;
$function$;

create or replace function public.save_venue_space(
  input_venue_id uuid,
  input_space_id uuid,
  input_name text,
  input_capacity integer,
  input_active boolean,
  input_sort_order integer,
  audit_request_id uuid default null
)
returns table (space_id uuid, name text, capacity integer, active boolean)
language plpgsql
security definer
set search_path = ''
as $function$
#variable_conflict use_variable
declare
  actor_id uuid := private.assert_common_actor();
  target_space public.venue_spaces%rowtype;
begin
  if not private.actor_manages_venue(actor_id, input_venue_id) then
    raise exception using errcode = 'P0001', message = 'NOT_ALLOWED';
  end if;
  if nullif(btrim(input_name), '') is null
    or char_length(btrim(input_name)) > 120
    or (input_capacity is not null and input_capacity not between 1 and 100000)
    or input_active is null
    or input_sort_order is null
    or input_sort_order not between 0 and 1000 then
    raise exception using errcode = 'P0001', message = 'VALIDATION_FAILED';
  end if;

  if input_space_id is null then
    insert into public.venue_spaces (venue_id, name, capacity, active, sort_order)
    values (
      input_venue_id,
      btrim(input_name),
      input_capacity,
      input_active,
      input_sort_order
    )
    returning * into target_space;
  else
    select space.*
    into target_space
    from public.venue_spaces as space
    where space.id = input_space_id
      and space.venue_id = input_venue_id
    for update;

    if not found then
      raise exception using errcode = 'P0001', message = 'NOT_FOUND';
    end if;

    update public.venue_spaces as space
    set name = btrim(input_name),
        capacity = input_capacity,
        active = input_active,
        sort_order = input_sort_order
    where space.id = input_space_id
    returning * into target_space;
  end if;

  perform private.write_security_audit(
    actor_id,
    'venue.space.save',
    'venue',
    input_venue_id,
    'succeeded',
    audit_request_id,
    jsonb_build_object('space_id', target_space.id, 'active', target_space.active)
  );

  return query select
    target_space.id,
    target_space.name,
    target_space.capacity,
    target_space.active;
exception
  when unique_violation then
    raise exception using errcode = 'P0001', message = 'VENUE_SPACE_NAME_UNAVAILABLE';
end;
$function$;

alter table public.venue_spaces enable row level security;
alter table public.venue_spaces force row level security;

revoke all on public.venue_spaces from anon, authenticated;

revoke all on function private.venue_facilities_are_unique(public.venue_facility[])
  from public, anon, authenticated;
revoke all on function private.ensure_venue_main_space(uuid)
  from public, anon, authenticated;
revoke all on function private.validate_event_venue_space()
  from public, anon, authenticated;

revoke all on function public.create_venue_workspace(
  text, text, uuid, text, numeric, numeric, text, text, integer, text[], text,
  boolean, boolean, boolean, integer, uuid
) from public, anon;
grant execute on function public.create_venue_workspace(
  text, text, uuid, text, numeric, numeric, text, text, integer, text[], text,
  boolean, boolean, boolean, integer, uuid
) to authenticated;

revoke all on function public.create_venue(
  text, text, uuid, text, double precision, double precision, text, integer, integer, uuid
) from public, anon, authenticated;
comment on function public.create_venue(
  text, text, uuid, text, double precision, double precision, text, integer, integer, uuid
) is
  'Legacy creation boundary retained for catalog compatibility but not executable; use attested create_venue_workspace.';

revoke all on function public.get_venue_workspace(uuid) from public, anon;
grant execute on function public.get_venue_workspace(uuid) to authenticated;

revoke all on function public.list_venue_calendar(uuid, integer) from public, anon;
grant execute on function public.list_venue_calendar(uuid, integer) to authenticated;

revoke all on function public.update_venue_workspace(
  uuid, text, text, uuid, text, numeric, numeric, text, text[], text, boolean, uuid
) from public, anon;
grant execute on function public.update_venue_workspace(
  uuid, text, text, uuid, text, numeric, numeric, text, text[], text, boolean, uuid
) to authenticated;

revoke all on function public.save_venue_space(uuid, uuid, text, integer, boolean, integer, uuid)
  from public, anon;
grant execute on function public.save_venue_space(
  uuid, uuid, text, integer, boolean, integer, uuid
) to authenticated;

commit;
