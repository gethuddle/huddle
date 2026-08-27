begin;

create type public.venue_verification_status as enum (
  'unverified',
  'verified',
  'suspended'
);

create type public.event_place_kind as enum ('home', 'venue', 'public_place');
create type public.event_audience as enum (
  'public',
  'team_followers',
  'group',
  'friends',
  'invite_only'
);
create type public.event_status as enum (
  'draft',
  'pending_group_review',
  'published',
  'cancelled',
  'completed'
);
create type public.invitation_status as enum ('pending', 'accepted', 'declined', 'revoked');
create type public.attendance_status as enum (
  'requested',
  'approved',
  'declined',
  'left',
  'removed'
);
create type public.attendance_source as enum ('self_request', 'direct_invite');

create table public.venues (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete restrict,
  slug text not null,
  name text not null,
  city_id uuid not null references public.cities(id) on delete restrict,
  address_text text not null,
  location extensions.geography(Point, 4326) not null,
  description text not null,
  screen_count integer,
  stated_capacity integer,
  verification_status public.venue_verification_status not null default 'unverified',
  suspended_at timestamptz,
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  constraint venues_slug_format_check check (
    slug = lower(slug)
    and slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'
    and char_length(slug) between 3 and 60
  ),
  constraint venues_name_length_check check (
    name = btrim(name)
    and char_length(name) between 2 and 120
  ),
  constraint venues_address_length_check check (
    address_text = btrim(address_text)
    and char_length(address_text) between 3 and 300
  ),
  constraint venues_description_length_check check (
    description = btrim(description)
    and char_length(description) between 10 and 2000
  ),
  constraint venues_screen_count_check check (
    screen_count is null or screen_count between 1 and 1000
  ),
  constraint venues_stated_capacity_check check (
    stated_capacity is null or stated_capacity between 1 and 100000
  ),
  constraint venues_location_israel_check check (
    extensions.st_x(location::extensions.geometry) between 34.0 and 36.0
    and extensions.st_y(location::extensions.geometry) between 29.0 and 34.0
  ),
  constraint venues_suspension_state_check check (
    (verification_status = 'suspended' and suspended_at is not null)
    or (verification_status <> 'suspended' and suspended_at is null)
  )
);

comment on table public.venues is
  'Public venue profiles. User-created profiles remain visibly unverified until a platform moderator changes status.';

create unique index venues_slug_lower_uidx on public.venues (lower(slug));
create index venues_location_gist_idx on public.venues using gist (location);
create index venues_city_verification_idx
  on public.venues (city_id, verification_status, name, id);
create index venues_owner_idx on public.venues (owner_id, created_at, id);

create trigger venues_set_updated_at
before update on public.venues
for each row execute function private.set_updated_at();

create table public.venue_follows (
  user_id uuid not null references public.profiles(id) on delete cascade,
  venue_id uuid not null references public.venues(id) on delete cascade,
  created_at timestamptz not null default statement_timestamp(),
  primary key (user_id, venue_id)
);

comment on table public.venue_follows is
  'A completed user own follow relationship to one non-suspended public venue.';

create index venue_follows_venue_created_idx
  on public.venue_follows (venue_id, created_at, user_id);

create table public.events (
  id uuid primary key default gen_random_uuid(),
  created_by uuid not null references public.profiles(id) on delete restrict,
  host_user_id uuid references public.profiles(id) on delete restrict,
  host_venue_id uuid references public.venues(id) on delete restrict,
  organizing_group_id uuid references public.groups(id) on delete restrict,
  match_id uuid not null references public.matches(id) on delete restrict,
  title text not null,
  description text not null,
  expected_activity text not null,
  cost_description text not null,
  event_rules text not null,
  commercial_affiliation text not null,
  host_presence_confirmed_at timestamptz not null,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  city_id uuid not null references public.cities(id) on delete restrict,
  place_kind public.event_place_kind not null,
  venue_id uuid references public.venues(id) on delete restrict,
  public_place_name text,
  public_address_text text,
  public_location extensions.geography(Point, 4326),
  audience public.event_audience not null,
  audience_team_id uuid references public.teams(id) on delete restrict,
  audience_group_id uuid references public.groups(id) on delete restrict,
  capacity integer not null,
  requires_approval boolean not null,
  status public.event_status not null default 'draft',
  published_at timestamptz,
  cancelled_at timestamptz,
  cancel_reason text,
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  constraint events_exactly_one_host_check check (
    (host_user_id is not null)::integer + (host_venue_id is not null)::integer = 1
  ),
  constraint events_title_length_check check (
    title = btrim(title)
    and char_length(title) between 3 and 120
  ),
  constraint events_description_length_check check (
    description = btrim(description)
    and char_length(description) between 10 and 2000
  ),
  constraint events_expected_activity_length_check check (
    expected_activity = btrim(expected_activity)
    and char_length(expected_activity) between 3 and 500
  ),
  constraint events_cost_description_length_check check (
    cost_description = btrim(cost_description)
    and char_length(cost_description) between 2 and 300
  ),
  constraint events_rules_length_check check (
    event_rules = btrim(event_rules)
    and char_length(event_rules) between 3 and 1000
  ),
  constraint events_commercial_affiliation_length_check check (
    commercial_affiliation = btrim(commercial_affiliation)
    and char_length(commercial_affiliation) between 2 and 300
  ),
  constraint events_time_order_check check (ends_at > starts_at),
  constraint events_capacity_check check (capacity between 1 and 100000),
  constraint events_private_host_contract_check check (
    host_user_id is null
    or (
      host_venue_id is null
      and place_kind in ('home', 'public_place')
      and audience in ('group', 'friends', 'invite_only')
      and requires_approval
    )
  ),
  constraint events_venue_host_contract_check check (
    host_venue_id is null
    or (
      host_user_id is null
      and place_kind = 'venue'
      and venue_id = host_venue_id
      and audience in ('public', 'team_followers')
      and organizing_group_id is null
    )
  ),
  constraint events_place_fields_check check (
    (
      place_kind = 'home'
      and venue_id is null
      and public_place_name is null
      and public_address_text is null
      and public_location is null
    )
    or (
      place_kind = 'venue'
      and venue_id is not null
      and public_place_name is null
      and public_address_text is null
      and public_location is null
    )
    or (
      place_kind = 'public_place'
      and venue_id is null
      and public_place_name is not null
      and public_address_text is not null
      and public_location is not null
    )
  ),
  constraint events_public_place_name_length_check check (
    public_place_name is null
    or (
      public_place_name = btrim(public_place_name)
      and char_length(public_place_name) between 2 and 120
    )
  ),
  constraint events_public_address_length_check check (
    public_address_text is null
    or (
      public_address_text = btrim(public_address_text)
      and char_length(public_address_text) between 3 and 300
    )
  ),
  constraint events_public_location_israel_check check (
    public_location is null
    or (
      extensions.st_x(public_location::extensions.geometry) between 34.0 and 36.0
      and extensions.st_y(public_location::extensions.geometry) between 29.0 and 34.0
    )
  ),
  constraint events_audience_targets_check check (
    (
      audience = 'group'
      and audience_group_id is not null
      and audience_team_id is null
    )
    or (
      audience = 'team_followers'
      and audience_team_id is not null
      and audience_group_id is null
    )
    or (
      audience in ('public', 'friends', 'invite_only')
      and audience_group_id is null
      and audience_team_id is null
    )
  ),
  constraint events_home_capacity_check check (
    place_kind <> 'home' or capacity between 1 and 12
  ),
  constraint events_lifecycle_evidence_check check (
    (
      status in ('draft', 'pending_group_review')
      and published_at is null
      and cancelled_at is null
      and cancel_reason is null
    )
    or (
      status = 'published'
      and published_at is not null
      and cancelled_at is null
      and cancel_reason is null
    )
    or (
      status = 'cancelled'
      and cancelled_at is not null
      and cancel_reason is not null
      and cancel_reason = btrim(cancel_reason)
      and char_length(cancel_reason) between 3 and 500
    )
    or (
      status = 'completed'
      and published_at is not null
      and cancelled_at is null
      and cancel_reason is null
    )
  )
);

comment on table public.events is
  'Provider-independent watch events. Host, audience, place, lifecycle, and one-account-per-seat constraints are enforced before later attendance flows.';

create index events_status_starts_idx on public.events (status, starts_at, id);
create index events_match_status_idx on public.events (match_id, status);
create index events_city_status_starts_idx on public.events (city_id, status, starts_at);
create index events_created_by_status_idx on public.events (created_by, status, id);
create index events_host_user_status_idx on public.events (host_user_id, status, id);
create index events_host_venue_status_idx on public.events (host_venue_id, status, id);
create index events_organizing_group_status_idx
  on public.events (organizing_group_id, status, id);
create index events_audience_group_status_idx
  on public.events (audience_group_id, status, id);
create index events_audience_team_status_idx
  on public.events (audience_team_id, status, id);
create index events_public_location_gist_idx
  on public.events using gist (public_location)
  where public_location is not null;

create trigger events_set_updated_at
before update on public.events
for each row execute function private.set_updated_at();

create table public.event_private_locations (
  event_id uuid primary key references public.events(id) on delete cascade,
  address_text text not null,
  directions text,
  location extensions.geography(Point, 4326) not null,
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  constraint event_private_locations_address_length_check check (
    address_text = btrim(address_text)
    and char_length(address_text) between 3 and 300
  ),
  constraint event_private_locations_directions_length_check check (
    directions is null
    or (
      directions = btrim(directions)
      and char_length(directions) between 3 and 500
    )
  ),
  constraint event_private_locations_israel_check check (
    extensions.st_x(location::extensions.geometry) between 34.0 and 36.0
    and extensions.st_y(location::extensions.geometry) between 29.0 and 34.0
  )
);

comment on table public.event_private_locations is
  'Exact home-event address and coordinate. Direct client reads and writes are denied; ordinary event projections never include these columns.';

create index event_private_locations_location_gist_idx
  on public.event_private_locations using gist (location);

create trigger event_private_locations_set_updated_at
before update on public.event_private_locations
for each row execute function private.set_updated_at();

create table public.event_invitations (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete restrict,
  invitee_id uuid not null references public.profiles(id) on delete restrict,
  invited_by uuid not null references public.profiles(id) on delete restrict,
  status public.invitation_status not null default 'pending',
  responded_at timestamptz,
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  constraint event_invitations_response_state_check check (
    (status = 'pending' and responded_at is null)
    or (status <> 'pending' and responded_at is not null)
  ),
  unique (event_id, invitee_id)
);

comment on table public.event_invitations is
  'One registered invitee per event. Invitation response flows arrive later and never contain a plus-one count.';

create index event_invitations_event_status_idx
  on public.event_invitations (event_id, status, created_at, id);
create index event_invitations_invitee_status_idx
  on public.event_invitations (invitee_id, status, created_at, id);

create trigger event_invitations_set_updated_at
before update on public.event_invitations
for each row execute function private.set_updated_at();

create table public.event_attendance (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete restrict,
  user_id uuid not null references public.profiles(id) on delete restrict,
  status public.attendance_status not null,
  source public.attendance_source not null,
  requested_at timestamptz not null default statement_timestamp(),
  reviewed_by uuid references public.profiles(id) on delete set null,
  reviewed_at timestamptz,
  left_at timestamptz,
  removed_by uuid references public.profiles(id) on delete set null,
  removed_at timestamptz,
  removal_reason text,
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  constraint event_attendance_review_pair_check check (
    (reviewed_by is null and reviewed_at is null)
    or (reviewed_by is not null and reviewed_at is not null)
  ),
  constraint event_attendance_left_state_check check (
    (status = 'left' and left_at is not null and removed_by is null and removed_at is null)
    or (status <> 'left' and left_at is null)
  ),
  constraint event_attendance_removed_state_check check (
    (
      status = 'removed'
      and removed_by is not null
      and removed_at is not null
      and left_at is null
    )
    or (
      status <> 'removed'
      and removed_by is null
      and removed_at is null
    )
  ),
  constraint event_attendance_removal_reason_check check (
    removal_reason is null
    or (
      status = 'removed'
      and
      removal_reason = btrim(removal_reason)
      and char_length(removal_reason) between 3 and 500
    )
  ),
  unique (event_id, user_id)
);

comment on table public.event_attendance is
  'One registered account per event response. Approved capacity is derived from rows; no guest or mutable attendee-counter field exists.';

create index event_attendance_event_status_created_idx
  on public.event_attendance (event_id, status, created_at, id);
create index event_attendance_user_status_event_idx
  on public.event_attendance (user_id, status, event_id);

create trigger event_attendance_set_updated_at
before update on public.event_attendance
for each row execute function private.set_updated_at();

create index security_audit_event_creation_cooldown_idx
  on public.security_audit_events (actor_id, created_at desc)
  where action = 'event.create';

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
  select input_actor_id is not null
    and exists (
      select 1
      from public.venues as venue
      where venue.id = input_venue_id
        and venue.owner_id = input_actor_id
    );
$function$;

comment on function private.actor_owns_venue(uuid, uuid) is
  'Checks venue ownership without exposing the venue base table to the client.';

create or replace function private.venue_follow_is_allowed(
  input_venue_id uuid,
  input_actor_id uuid
)
returns boolean
language sql
security definer
stable
set search_path = ''
as $function$
  select input_actor_id is not null
    and private.profile_is_community_eligible(input_actor_id)
    and exists (
    select 1
    from public.venues as venue
    where venue.id = input_venue_id
      and venue.verification_status <> 'suspended'
      and venue.suspended_at is null
  );
$function$;

comment on function private.venue_follow_is_allowed(uuid, uuid) is
  'Checks actor eligibility and venue followability without granting direct base-table reads.';

create or replace function private.actor_is_accepted_friend(
  first_user_id uuid,
  second_user_id uuid
)
returns boolean
language sql
security definer
stable
set search_path = ''
as $function$
  select first_user_id is not null
    and second_user_id is not null
    and exists (
      select 1
      from public.friendships as friendship
      where friendship.user_low_id = least(first_user_id, second_user_id)
        and friendship.user_high_id = greatest(first_user_id, second_user_id)
        and friendship.status = 'accepted'
    )
    and not private.users_are_blocked(first_user_id, second_user_id);
$function$;

comment on function private.actor_is_accepted_friend(uuid, uuid) is
  'Checks one accepted direct friendship and rejects either-direction blocks.';

create or replace function private.actor_manages_event(
  input_event_id uuid,
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
      from public.events as event
      where event.id = input_event_id
        and (
          event.host_user_id = input_actor_id
          or private.actor_owns_venue(event.host_venue_id, input_actor_id)
          or private.actor_is_group_admin(event.organizing_group_id, input_actor_id)
        )
    );
$function$;

comment on function private.actor_manages_event(uuid, uuid) is
  'Checks personal-host, venue-owner, or organizing-group administrator management authority.';

create or replace function private.enforce_private_location_parent()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if not exists (
    select 1
    from public.events as event
    where event.id = new.event_id
      and event.place_kind = 'home'
      and event.host_user_id is not null
  ) then
    raise exception using errcode = '23514', message = 'EVENT_PRIVATE_LOCATION_REQUIRES_HOME';
  end if;

  return new;
end;
$function$;

create trigger event_private_locations_parent_guard
before insert or update on public.event_private_locations
for each row execute function private.enforce_private_location_parent();

create or replace function private.ensure_event_private_location_pair()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  target_event_id uuid := new.id;
  target_place public.event_place_kind;
begin
  select event.place_kind
  into target_place
  from public.events as event
  where event.id = target_event_id;

  if not found then
    return null;
  end if;

  if target_place = 'home' and not exists (
    select 1
    from public.event_private_locations as private_location
    where private_location.event_id = target_event_id
  ) then
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

create constraint trigger events_private_location_pair_guard
after insert or update of place_kind on public.events
deferrable initially deferred
for each row execute function private.ensure_event_private_location_pair();

create or replace function private.ensure_private_location_event_pair()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  target_event_id uuid;
  target_place public.event_place_kind;
begin
  target_event_id := case when tg_op = 'DELETE' then old.event_id else new.event_id end;

  select event.place_kind
  into target_place
  from public.events as event
  where event.id = target_event_id;

  if not found then
    return null;
  end if;

  if target_place = 'home' and not exists (
    select 1
    from public.event_private_locations as private_location
    where private_location.event_id = target_event_id
  ) then
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

create constraint trigger event_private_locations_event_pair_guard
after insert or update or delete on public.event_private_locations
deferrable initially deferred
for each row execute function private.ensure_private_location_event_pair();

create or replace function private.protect_event_after_approval()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  approved_count integer;
begin
  select count(*)
  into approved_count
  from public.event_attendance as attendance
  where attendance.event_id = old.id
    and attendance.status = 'approved';

  if approved_count > 0 and (
    new.host_user_id is distinct from old.host_user_id
    or new.host_venue_id is distinct from old.host_venue_id
    or new.audience is distinct from old.audience
    or new.audience_group_id is distinct from old.audience_group_id
    or new.audience_team_id is distinct from old.audience_team_id
    or new.place_kind is distinct from old.place_kind
    or new.venue_id is distinct from old.venue_id
    or new.public_place_name is distinct from old.public_place_name
    or new.public_address_text is distinct from old.public_address_text
    or new.public_location is distinct from old.public_location
  ) then
    raise exception using errcode = 'P0001', message = 'MATERIAL_CHANGE_REQUIRES_NEW_EVENT';
  end if;

  if new.capacity < approved_count then
    raise exception using errcode = 'P0001', message = 'EVENT_FULL';
  end if;

  if old.status = 'draft' and new.status not in (
    'draft', 'pending_group_review', 'published', 'cancelled'
  ) then
    raise exception using errcode = 'P0001', message = 'INVALID_TRANSITION';
  elsif old.status = 'pending_group_review'
    and new.status not in ('pending_group_review', 'published', 'cancelled') then
    raise exception using errcode = 'P0001', message = 'INVALID_TRANSITION';
  elsif old.status = 'published'
    and new.status not in ('published', 'cancelled', 'completed') then
    raise exception using errcode = 'P0001', message = 'INVALID_TRANSITION';
  elsif old.status in ('cancelled', 'completed') and new.status <> old.status then
    raise exception using errcode = 'P0001', message = 'INVALID_TRANSITION';
  end if;

  return new;
end;
$function$;

create trigger events_approval_and_transition_guard
before update on public.events
for each row execute function private.protect_event_after_approval();

create or replace function private.protect_private_location_after_approval()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  target_event_id uuid;
begin
  target_event_id := case when tg_op = 'DELETE' then old.event_id else new.event_id end;

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

create trigger event_private_locations_approval_guard
before update or delete on public.event_private_locations
for each row execute function private.protect_private_location_after_approval();

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
  actor_id uuid := private.assert_actor(true);
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
    owner_id,
    slug,
    name,
    city_id,
    address_text,
    location,
    description,
    screen_count,
    stated_capacity
  )
  values (
    actor_id,
    lower(btrim(input_slug)),
    btrim(input_name),
    input_city_id,
    btrim(input_address_text),
    extensions.st_setsrid(
      extensions.st_makepoint(input_longitude, input_latitude),
      4326
    )::extensions.geography,
    btrim(input_description),
    input_screen_count,
    input_stated_capacity
  )
  returning * into created_venue;

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
    created_venue.id,
    created_venue.slug,
    created_venue.verification_status::text;
exception
  when unique_violation then
    raise exception using errcode = 'P0001', message = 'VENUE_SLUG_UNAVAILABLE';
end;
$function$;

comment on function public.create_venue(text, text, uuid, text, double precision, double precision, text, integer, integer, uuid) is
  'Creates one visibly unverified public venue for a completed user without granting verification authority.';

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
  actor_id uuid := private.assert_actor(true);
  target_venue public.venues%rowtype;
begin
  select venue.*
  into target_venue
  from public.venues as venue
  where venue.id = input_venue_id
  for update;

  if not found or target_venue.owner_id <> actor_id then
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
  set
    slug = lower(btrim(input_slug)),
    name = btrim(input_name),
    city_id = input_city_id,
    address_text = btrim(input_address_text),
    location = extensions.st_setsrid(
      extensions.st_makepoint(input_longitude, input_latitude),
      4326
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
    target_venue.id,
    target_venue.slug,
    target_venue.verification_status::text;
exception
  when unique_violation then
    raise exception using errcode = 'P0001', message = 'VENUE_SLUG_UNAVAILABLE';
end;
$function$;

comment on function public.update_venue(uuid, text, text, uuid, text, double precision, double precision, text, integer, integer, uuid) is
  'Updates public content for the owning user while preserving platform-controlled verification status.';

create or replace function public.set_venue_verification_status(
  input_venue_id uuid,
  input_status text,
  audit_request_id uuid default null
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $function$
declare
  actor_id uuid := private.assert_actor(true);
  parsed_status public.venue_verification_status;
begin
  if not private.has_platform_role(
    actor_id,
    array['moderator', 'admin']::public.platform_role[]
  ) then
    raise exception using errcode = 'P0001', message = 'NOT_ALLOWED';
  end if;

  begin
    parsed_status := input_status::public.venue_verification_status;
  exception when invalid_text_representation then
    raise exception using errcode = 'P0001', message = 'VALIDATION_FAILED';
  end;

  update public.venues as venue
  set
    verification_status = parsed_status,
    suspended_at = case
      when parsed_status = 'suspended' then statement_timestamp()
      else null
    end
  where venue.id = input_venue_id;

  if not found then
    raise exception using errcode = 'P0001', message = 'NOT_FOUND';
  end if;

  perform private.write_security_audit(
    actor_id,
    'venue.status',
    'venue',
    input_venue_id,
    'succeeded',
    audit_request_id,
    jsonb_build_object('status', parsed_status::text)
  );

  return true;
end;
$function$;

comment on function public.set_venue_verification_status(uuid, text, uuid) is
  'Restricts venue verification and suspension status to platform moderators and administrators.';

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
    venue.owner_id = auth.uid()
  from public.venues as venue
  join public.cities as city on city.id = venue.city_id
  join public.profiles as owner_profile on owner_profile.id = venue.owner_id
  where venue.slug = lower(btrim(lookup_slug))
    and venue.verification_status <> 'suspended'
    and venue.suspended_at is null;
$function$;

comment on function public.get_venue_by_slug(text) is
  'Returns a narrow non-suspended public venue summary with an explicit verification label and only the caller own follow state.';

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
  actor_id uuid := private.assert_actor(true);
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
    and venue.owner_id = actor_id;
end;
$function$;

comment on function public.get_venue_for_management(text) is
  'Returns owner-only venue editing fields, including the venue public coordinate, without granting base-table access.';

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
  actor_id uuid := private.assert_actor(true);
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
  from public.venues as venue
  join public.cities as city on city.id = venue.city_id
  where venue.owner_id = actor_id
  order by venue.created_at desc, venue.id
  offset bounded_offset
  limit bounded_limit;
end;
$function$;

comment on function public.list_owned_venues(integer, integer) is
  'Returns a bounded owner-only venue list for future venue-host event creation.';

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
  actor_id uuid := private.assert_actor(true);
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
      or host_venue.owner_id <> actor_id
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

comment on function public.create_or_update_event(uuid, uuid, uuid, uuid, text, text, text, text, text, text, boolean, timestamptz, timestamptz, uuid, text, uuid, text, text, double precision, double precision, text, uuid, uuid, integer, boolean, text, text, double precision, double precision, text, uuid) is
  'Creates or updates a fully validated event and its protected home location in one transaction. Private hosts cannot manufacture public visibility.';

create or replace function private.event_is_visible_to_actor(
  input_event_id uuid,
  input_actor_id uuid
)
returns boolean
language sql
security definer
stable
set search_path = ''
as $function$
  select exists (
    select 1
    from public.events as event
    left join public.venues as host_venue on host_venue.id = event.host_venue_id
    left join public.profiles as host_profile on host_profile.id = event.host_user_id
    where event.id = input_event_id
      and (
        private.actor_manages_event(event.id, input_actor_id)
        or (
          event.status = 'published'
          and event.starts_at > statement_timestamp()
          and (
            (
              event.host_venue_id is not null
              and host_venue.verification_status <> 'suspended'
              and host_venue.suspended_at is null
            )
            or (
              event.host_user_id is not null
              and input_actor_id is not null
              and private.profile_is_community_eligible(input_actor_id)
              and host_profile.suspended_at is null
              and not private.users_are_blocked(input_actor_id, event.host_user_id)
              and (
                (
                  event.audience = 'group'
                  and exists (
                    select 1
                    from public.groups as audience_group
                    where audience_group.id = event.audience_group_id
                      and audience_group.lifecycle in ('forming', 'active')
                  )
                  and private.actor_is_active_group_member(
                    event.audience_group_id,
                    input_actor_id
                  )
                )
                or (
                  event.audience = 'friends'
                  and private.actor_is_accepted_friend(event.host_user_id, input_actor_id)
                )
                or (
                  event.audience = 'invite_only'
                  and exists (
                    select 1
                    from public.event_invitations as invitation
                    where invitation.event_id = event.id
                      and invitation.invitee_id = input_actor_id
                      and invitation.status in ('pending', 'accepted')
                  )
                )
              )
            )
          )
        )
      )
  );
$function$;

comment on function private.event_is_visible_to_actor(uuid, uuid) is
  'Applies manager and current audience visibility without returning private-location data.';

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
  city_name text,
  place_kind text,
  public_place_name text,
  public_address_text text,
  location_summary text,
  audience text,
  audience_group_name text,
  audience_team_name text,
  capacity integer,
  requires_approval boolean,
  organizing_group_name text,
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
    city.name_en,
    event.place_kind::text,
    event.public_place_name,
    event.public_address_text,
    case
      when event.place_kind = 'public_place' then event.public_place_name
      when event.place_kind = 'venue' then host_venue.address_text
      when event.host_user_id = auth.uid() then 'Protected home location saved'
      when viewer_city.center is null or private_location.location is null then city.name_en
      when extensions.st_distance(viewer_city.center, private_location.location) < 5000
        then 'Within 5 km of your profile city center'
      when extensions.st_distance(viewer_city.center, private_location.location) < 15000
        then '5–15 km from your profile city center'
      when extensions.st_distance(viewer_city.center, private_location.location) < 50000
        then '15–50 km from your profile city center'
      else '50+ km from your profile city center'
    end,
    event.audience::text,
    audience_group.name,
    audience_team.name,
    event.capacity,
    event.requires_approval,
    organizing_group.name,
    private.actor_manages_event(event.id, auth.uid())
  from public.events as event
  join public.matches as match on match.id = event.match_id
  join public.competitions as competition on competition.id = match.competition_id
  join public.teams as home_team on home_team.id = match.home_team_id
  join public.teams as away_team on away_team.id = match.away_team_id
  join public.cities as city on city.id = event.city_id
  left join public.profiles as host_profile on host_profile.id = event.host_user_id
  left join public.venues as host_venue on host_venue.id = event.host_venue_id
  left join public.groups as audience_group on audience_group.id = event.audience_group_id
  left join public.teams as audience_team on audience_team.id = event.audience_team_id
  left join public.groups as organizing_group on organizing_group.id = event.organizing_group_id
  left join public.profiles as viewer_profile on viewer_profile.id = auth.uid()
  left join public.cities as viewer_city on viewer_city.id = viewer_profile.city_id
  left join public.event_private_locations as private_location
    on private_location.event_id = event.id
  where event.id = input_event_id
    and private.event_is_visible_to_actor(event.id, auth.uid());
$function$;

comment on function public.get_event_summary(uuid) is
  'Returns one audience-safe event projection. Home address and exact coordinates are structurally absent.';


alter table public.venues enable row level security;
alter table public.venues force row level security;
alter table public.venue_follows enable row level security;
alter table public.venue_follows force row level security;
alter table public.events enable row level security;
alter table public.events force row level security;
alter table public.event_private_locations enable row level security;
alter table public.event_private_locations force row level security;
alter table public.event_invitations enable row level security;
alter table public.event_invitations force row level security;
alter table public.event_attendance enable row level security;
alter table public.event_attendance force row level security;

create policy venue_follows_read_own
on public.venue_follows
for select
to authenticated
using (user_id = auth.uid());

create policy venue_follows_insert_own
on public.venue_follows
for insert
to authenticated
with check (
  user_id = auth.uid()
  and private.venue_follow_is_allowed(venue_id, auth.uid())
);

create policy venue_follows_delete_own
on public.venue_follows
for delete
to authenticated
using (
  user_id = auth.uid()
  and public.current_actor_is_community_eligible()
);

create policy event_invitations_read_invitee_or_manager
on public.event_invitations
for select
to authenticated
using (
  invitee_id = auth.uid()
  or private.actor_manages_event(event_id, auth.uid())
);

create policy event_attendance_read_self_or_manager
on public.event_attendance
for select
to authenticated
using (
  user_id = auth.uid()
  or private.actor_manages_event(event_id, auth.uid())
);

revoke all on public.venues from anon, authenticated;
revoke all on public.venue_follows from anon, authenticated;
revoke all on public.events from anon, authenticated;
revoke all on public.event_private_locations from anon, authenticated;
revoke all on public.event_invitations from anon, authenticated;
revoke all on public.event_attendance from anon, authenticated;

grant select, insert, delete on public.venue_follows to authenticated;
grant select on public.event_invitations to authenticated;
grant select on public.event_attendance to authenticated;

revoke all on function private.actor_owns_venue(uuid, uuid)
  from public, anon, authenticated;
revoke all on function private.venue_follow_is_allowed(uuid, uuid)
  from public, anon, authenticated;
revoke all on function private.actor_is_accepted_friend(uuid, uuid)
  from public, anon, authenticated;
revoke all on function private.actor_manages_event(uuid, uuid)
  from public, anon, authenticated;
revoke all on function private.enforce_private_location_parent()
  from public, anon, authenticated;
revoke all on function private.ensure_event_private_location_pair()
  from public, anon, authenticated;
revoke all on function private.ensure_private_location_event_pair()
  from public, anon, authenticated;
revoke all on function private.protect_event_after_approval()
  from public, anon, authenticated;
revoke all on function private.protect_private_location_after_approval()
  from public, anon, authenticated;
revoke all on function private.event_is_visible_to_actor(uuid, uuid)
  from public, anon, authenticated;

-- RLS expressions execute these bounded predicates while the private schema
-- remains unavailable through the Data API.
grant execute on function private.actor_owns_venue(uuid, uuid) to authenticated;
grant execute on function private.venue_follow_is_allowed(uuid, uuid) to authenticated;
grant execute on function private.actor_manages_event(uuid, uuid) to authenticated;

revoke all on function public.create_venue(
  text, text, uuid, text, double precision, double precision, text, integer, integer, uuid
) from public, anon;
revoke all on function public.update_venue(
  uuid, text, text, uuid, text, double precision, double precision, text, integer, integer, uuid
) from public, anon;
revoke all on function public.set_venue_verification_status(uuid, text, uuid)
  from public, anon;
revoke all on function public.get_venue_by_slug(text) from public;
revoke all on function public.get_venue_for_management(text) from public, anon;
revoke all on function public.list_owned_venues(integer, integer) from public, anon;
revoke all on function public.create_or_update_event(
  uuid, uuid, uuid, uuid, text, text, text, text, text, text, boolean,
  timestamptz, timestamptz, uuid, text, uuid, text, text, double precision,
  double precision, text, uuid, uuid, integer, boolean, text, text,
  double precision, double precision, text, uuid
) from public, anon;
revoke all on function public.get_event_summary(uuid) from public;

grant execute on function public.create_venue(
  text, text, uuid, text, double precision, double precision, text, integer, integer, uuid
) to authenticated;
grant execute on function public.update_venue(
  uuid, text, text, uuid, text, double precision, double precision, text, integer, integer, uuid
) to authenticated;
grant execute on function public.set_venue_verification_status(uuid, text, uuid)
  to authenticated;
grant execute on function public.get_venue_by_slug(text) to anon, authenticated;
grant execute on function public.get_venue_for_management(text) to authenticated;
grant execute on function public.list_owned_venues(integer, integer) to authenticated;
grant execute on function public.create_or_update_event(
  uuid, uuid, uuid, uuid, text, text, text, text, text, text, boolean,
  timestamptz, timestamptz, uuid, text, uuid, text, text, double precision,
  double precision, text, uuid, uuid, integer, boolean, text, text,
  double precision, double precision, text, uuid
) to authenticated;
grant execute on function public.get_event_summary(uuid) to anon, authenticated;


commit;
