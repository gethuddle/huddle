begin;

create type public.event_attendance_mode as enum ('reservations', 'open_door');

alter table public.venues
  add column default_attendance_mode public.event_attendance_mode
    not null default 'reservations';

comment on column public.venues.default_attendance_mode is
  'Default for future Venue events. Open-door events model public availability only; reservations retain registered attendance.';

alter table public.events
  add column attendance_mode public.event_attendance_mode
    not null default 'reservations',
  alter column capacity drop not null,
  drop constraint events_capacity_check,
  add constraint events_attendance_contract_check check (
    (
      attendance_mode = 'reservations'
      and capacity between 1 and 100000
    )
    or (
      attendance_mode = 'open_door'
      and capacity is null
      and not requires_approval
      and host_venue_id is not null
      and audience = 'public'
    )
  );

comment on column public.events.attendance_mode is
  'Immutable event joining contract: reservations use registered attendance and capacity; open-door public Venue events have no Huddle RSVP, invite, queue, roster, or capacity claim.';

create or replace function public.create_venue_workspace_v2(
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
#variable_conflict use_variable
declare
  created record;
  parsed_mode public.event_attendance_mode;
begin
  begin
    parsed_mode := input_default_attendance_mode::public.event_attendance_mode;
  exception when invalid_text_representation then
    raise exception using errcode = 'P0001', message = 'VALIDATION_FAILED';
  end;

  if (parsed_mode = 'reservations' and input_main_space_capacity is null)
    or (parsed_mode = 'open_door' and input_main_space_capacity is not null)
    or (parsed_mode = 'open_door' and input_default_requires_approval is distinct from false) then
    raise exception using errcode = 'P0001', message = 'VALIDATION_FAILED';
  end if;

  select created_venue.venue_id, created_venue.slug, created_venue.verification_status
  into strict created
  from public.create_venue_workspace(
    input_name,
    input_slug,
    input_city_id,
    input_address_text,
    input_longitude,
    input_latitude,
    input_description,
    input_main_space_name,
    coalesce(input_main_space_capacity, 1),
    input_facilities,
    input_house_information,
    case when parsed_mode = 'open_door' then false else input_default_requires_approval end,
    input_adult_attested,
    input_representation_attested,
    input_rules_version,
    audit_request_id
  ) as created_venue;

  update public.venues as venue
  set default_attendance_mode = parsed_mode,
      stated_capacity = case when parsed_mode = 'open_door' then null else input_main_space_capacity end,
      default_requires_approval = case
        when parsed_mode = 'open_door' then false
        else input_default_requires_approval
      end
  where venue.id = created.venue_id;

  if parsed_mode = 'open_door' then
    update public.venue_spaces as space
    set capacity = null
    where space.venue_id = created.venue_id;
  end if;

  return query select created.venue_id, created.slug, created.verification_status;
end;
$function$;

comment on function public.create_venue_workspace_v2(
  text, text, uuid, text, numeric, numeric, text, text, integer, text[], text,
  text, boolean, boolean, boolean, integer, uuid
) is
  'Creates a Venue with an explicit reservations or open-door default; walk-in Venues do not invent a capacity.';

create or replace function public.update_venue_workspace_v2(
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
  input_default_attendance_mode text,
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
  updated record;
  parsed_mode public.event_attendance_mode;
begin
  begin
    parsed_mode := input_default_attendance_mode::public.event_attendance_mode;
  exception when invalid_text_representation then
    raise exception using errcode = 'P0001', message = 'VALIDATION_FAILED';
  end;
  if parsed_mode = 'open_door' and input_default_requires_approval is distinct from false then
    raise exception using errcode = 'P0001', message = 'VALIDATION_FAILED';
  end if;

  select updated_venue.venue_id, updated_venue.slug, updated_venue.verification_status
  into strict updated
  from public.update_venue_workspace(
    input_venue_id,
    input_name,
    input_slug,
    input_city_id,
    input_address_text,
    input_longitude,
    input_latitude,
    input_description,
    input_facilities,
    input_house_information,
    case when parsed_mode = 'open_door' then false else input_default_requires_approval end,
    audit_request_id
  ) as updated_venue;

  update public.venues as venue
  set default_attendance_mode = parsed_mode,
      default_requires_approval = case
        when parsed_mode = 'open_door' then false
        else input_default_requires_approval
      end
  where venue.id = updated.venue_id;

  return query select updated.venue_id, updated.slug, updated.verification_status;
end;
$function$;

comment on function public.update_venue_workspace_v2(
  uuid, text, text, uuid, text, numeric, numeric, text, text[], text, text,
  boolean, uuid
) is
  'Updates reusable Venue profile and explicit future attendance defaults without rewriting existing event snapshots.';

create or replace function private.event_user_is_audience_eligible(
  input_event_id uuid,
  input_user_id uuid,
  input_direct_invite boolean
)
returns boolean
language sql
security definer
stable
set search_path = ''
as $function$
  select input_user_id is not null
    and private.profile_is_community_eligible(input_user_id)
    and exists (
      select 1
      from public.events as event
      left join public.profiles as host_profile on host_profile.id = event.host_user_id
      left join public.venues as host_venue on host_venue.id = event.host_venue_id
      left join public.groups as audience_group on audience_group.id = event.audience_group_id
      where event.id = input_event_id
        and event.attendance_mode = 'reservations'
        and input_user_id is distinct from event.host_user_id
        and (
          (
            event.host_user_id is not null
            and private.profile_is_community_eligible(event.host_user_id)
            and host_profile.suspended_at is null
            and not private.users_are_blocked(input_user_id, event.host_user_id)
          )
          or (
            event.host_venue_id is not null
            and host_venue.verification_status <> 'suspended'
            and host_venue.suspended_at is null
          )
        )
        and (
          event.audience = 'public'
          or (
            event.audience = 'team_followers'
            and (
              input_direct_invite
              or exists (
                select 1
                from public.subscriptions as subscription
                where subscription.user_id = input_user_id
                  and subscription.kind = 'team'
                  and subscription.team_id = event.audience_team_id
              )
            )
          )
          or (
            event.audience = 'group'
            and audience_group.lifecycle in ('forming', 'active')
            and audience_group.suspended_at is null
            and private.actor_is_active_group_member(event.audience_group_id, input_user_id)
          )
          or (
            event.audience = 'friends'
            and private.actor_is_accepted_friend(event.host_user_id, input_user_id)
          )
          or (event.audience = 'invite_only' and input_direct_invite)
        )
    );
$function$;

comment on function private.event_user_is_audience_eligible(uuid, uuid, boolean) is
  'Rechecks account, host, audience, and block eligibility and categorically denies Huddle attendance or invitations for open-door events.';

revoke all on function private.event_user_is_audience_eligible(uuid, uuid, boolean)
  from public, anon, authenticated;

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
    or input_items is null
    or jsonb_typeof(input_items) <> 'array'
    or jsonb_array_length(input_items) not between 1 and 20 then
    raise exception using errcode = 'P0001', message = 'VALIDATION_FAILED';
  end if;

  final_status := case
    when input_intent = 'publish' then 'published'::public.event_status
    else 'draft'::public.event_status
  end;

  for item, item_index in
    select value, ordinality
    from jsonb_array_elements(input_items) with ordinality as planned(value, ordinality)
    order by ordinality
  loop
    if jsonb_typeof(item) <> 'object'
      or exists (
        select 1
        from jsonb_object_keys(item) as supplied(key)
        where supplied.key <> all (array[
          'matchId', 'venueSpaceId', 'attendanceMode', 'title', 'description',
          'capacity', 'requiresApproval'
        ])
      )
      or not (item ? 'matchId')
      or not (item ? 'venueSpaceId')
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
    exception
      when invalid_text_representation or numeric_value_out_of_range then
        raise exception using errcode = 'P0001', message = 'VALIDATION_FAILED';
    end;

    if target_match_id is null or target_space_id is null then
      raise exception using errcode = 'P0001', message = 'VALIDATION_FAILED';
    end if;
    if target_match_id = any(planned_match_ids) then
      raise exception using errcode = 'P0001', message = 'VALIDATION_FAILED';
    end if;
    planned_match_ids := array_append(planned_match_ids, target_match_id);

    select space.venue_id
    into target_venue_id
    from public.venue_spaces as space
    where space.id = target_space_id;

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

    select space.*
    into selected_space
    from public.venue_spaces as space
    where space.id = target_space_id
      and space.venue_id = batch_venue_id
    for share;

    select venue.*
    into selected_venue
    from public.venues as venue
    where venue.id = batch_venue_id
    for share;

    if not found
      or selected_venue.verification_status = 'suspended'
      or selected_venue.suspended_at is not null then
      raise exception using errcode = 'P0001', message = 'NOT_ALLOWED';
    end if;
    if selected_space.id is null or not selected_space.active then
      raise exception using errcode = 'P0001', message = 'VENUE_DEFAULTS_INCOMPLETE';
    end if;

    resolved_attendance_mode := coalesce(
      requested_attendance_mode,
      selected_venue.default_attendance_mode
    );
    if resolved_attendance_mode = 'reservations' and selected_space.capacity is null then
      raise exception using errcode = 'P0001', message = 'VENUE_DEFAULTS_INCOMPLETE';
    end if;
    if resolved_attendance_mode = 'open_door'
      and (requested_capacity is not null or requested_requires_approval is true) then
      raise exception using errcode = 'P0001', message = 'VALIDATION_FAILED';
    end if;

    select match.*
    into selected_match
    from public.matches as match
    join public.competitions as competition on competition.id = match.competition_id
    join public.sports as sport on sport.id = competition.sport_id
    join public.teams as home_team on home_team.id = match.home_team_id
    join public.teams as away_team on away_team.id = match.away_team_id
    where match.id = target_match_id
      and match.starts_at > statement_timestamp()
      and match.status in ('scheduled', 'timed', 'postponed')
      and competition.active
      and sport.active
      and home_team.active
      and away_team.active
    for share of match;

    if not found then
      raise exception using errcode = 'P0001', message = 'NOT_FOUND';
    end if;

    select home_team.name, away_team.name
    into strict home_team_name, away_team_name
    from public.teams as home_team, public.teams as away_team
    where home_team.id = selected_match.home_team_id
      and away_team.id = selected_match.away_team_id;

    resolved_title := coalesce(
      requested_title,
      btrim(left(
        home_team_name || ' vs ' || away_team_name || ' at ' || selected_venue.name,
        120
      ))
    );
    resolved_description := coalesce(requested_description, selected_venue.description);
    if resolved_attendance_mode = 'open_door' then
      resolved_capacity := null;
      resolved_requires_approval := false;
    else
      resolved_capacity := coalesce(requested_capacity, selected_space.capacity);
      resolved_requires_approval := coalesce(
        requested_requires_approval,
        selected_venue.default_requires_approval
      );
    end if;

    if char_length(resolved_title) not between 3 and 120
      or char_length(resolved_description) not between 10 and 2000
      or (
        resolved_attendance_mode = 'reservations'
        and (
          resolved_capacity is null
          or resolved_capacity not between 1 and selected_space.capacity
        )
      ) then
      raise exception using errcode = 'P0001', message = 'VALIDATION_FAILED';
    end if;

    if exists (
      select 1
      from public.events as event
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
        select 1
        from public.events as event
        where event.host_venue_id = selected_venue.id
          and event.match_id = selected_match.id
          and event.status not in ('cancelled', 'completed')
      ) then
        raise exception using errcode = 'P0001', message = 'MATCH_ALREADY_PLANNED';
      end if;
      raise exception using errcode = 'P0001', message = 'VENUE_SPACE_OVERLAP';
    end if;

    insert into public.events (
      created_by,
      host_venue_id,
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
      venue_space_id,
      audience,
      attendance_mode,
      capacity,
      requires_approval,
      status,
      published_at
    )
    values (
      actor_id,
      selected_venue.id,
      selected_match.id,
      resolved_title,
      resolved_description,
      case
        when char_length(btrim(selected_venue.house_information)) >= 3
          then btrim(left(selected_venue.house_information, 500))
        else 'Watch the full match together'
      end,
      'Ask venue staff about current food, drink, and entry costs.',
      'Respect venue staff, other supporters, and every attendee.',
      'Hosted commercially by ' || selected_venue.name,
      statement_timestamp(),
      selected_match.starts_at,
      selected_match.starts_at + interval '3 hours',
      selected_venue.city_id,
      'venue',
      selected_venue.id,
      selected_space.id,
      'public',
      resolved_attendance_mode,
      resolved_capacity,
      resolved_requires_approval,
      final_status,
      case when final_status = 'published' then statement_timestamp() else null end
    )
    returning * into created_event;

    perform private.write_security_audit(
      actor_id,
      'venue.event.plan',
      'event',
      created_event.id,
      'succeeded',
      audit_request_id,
      jsonb_build_object(
        'venue_id', selected_venue.id,
        'venue_space_id', selected_space.id,
        'match_id', selected_match.id,
        'status', created_event.status::text,
        'attendance_mode', created_event.attendance_mode::text,
        'batch_size', jsonb_array_length(input_items),
        'batch_position', item_index
      )
    );

    return query select created_event.id, created_event.status::text;
  end loop;
end;
$function$;

comment on function public.plan_venue_events(jsonb, text, uuid) is
  'Creates a bounded all-or-none Venue fixture batch. Each event snapshots either open-door availability or registered reservation policy.';

drop function public.get_venue_settings(uuid);

create function public.get_venue_settings(input_venue_id uuid)
returns table (
  venue_id uuid,
  slug text,
  name text,
  role text,
  verification_status text,
  city_id uuid,
  city_name text,
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
security definer
volatile
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
    venue.city_id,
    city.name_en,
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
          )
          order by space.active desc, space.sort_order, space.created_at, space.id
        )
        from public.venue_spaces as space
        where space.venue_id = venue.id
      ),
      '[]'::jsonb
    )
  from public.venues as venue
  join public.cities as city on city.id = venue.city_id
  join public.venue_memberships as membership
    on membership.venue_id = venue.id
   and membership.user_id = actor_id
   and membership.status = 'active'
   and membership.revoked_at is null
  where venue.id = input_venue_id;
end;
$function$;

comment on function public.get_venue_settings(uuid) is
  'Returns one active operator Venue profile and explicit future attendance defaults.';

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
    venue.default_attendance_mode = 'reservations'
      and exists (
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

drop function public.list_venue_calendar(uuid, integer);

create function public.list_venue_calendar(
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
  attendance_mode text,
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
    event.attendance_mode::text,
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
  'Returns bounded Venue event snapshots with explicit open-door or reservations behavior.';

create or replace function public.get_venue_today(
  input_venue_id uuid,
  input_limit integer default 12
)
returns table (
  next_event jsonb,
  today_events jsonb,
  attention jsonb,
  setup_tasks jsonb
)
language plpgsql
security definer
volatile
set search_path = ''
as $function$
declare
  actor_id uuid := private.assert_common_actor();
  bounded_limit integer := least(greatest(coalesce(input_limit, 12), 1), 30);
  israel_today date := timezone('Asia/Jerusalem', statement_timestamp())::date;
  today_start timestamptz;
  tomorrow_start timestamptz;
begin
  if not private.actor_manages_venue(actor_id, input_venue_id) then
    raise exception using errcode = 'P0001', message = 'NOT_FOUND';
  end if;

  today_start := israel_today::timestamp at time zone 'Asia/Jerusalem';
  tomorrow_start := (israel_today + 1)::timestamp at time zone 'Asia/Jerusalem';

  return query
  with event_rows as (
    select
      event.id,
      event.title,
      event.status::text as status,
      event.starts_at,
      event.ends_at,
      event.venue_space_id,
      space.name as venue_space_name,
      event.attendance_mode::text as attendance_mode,
      event.capacity,
      count(attendance.id) filter (where attendance.status = 'approved') as approved_count,
      count(attendance.id) filter (where attendance.status = 'requested') as waiting_count,
      event.requires_approval
    from public.events as event
    left join public.venue_spaces as space on space.id = event.venue_space_id
    left join public.event_attendance as attendance on attendance.event_id = event.id
    where event.host_venue_id = input_venue_id
    group by event.id, space.name
  ),
  next_row as (
    select *
    from event_rows
    where ends_at >= statement_timestamp()
      and status not in ('cancelled', 'completed')
    order by starts_at, id
    limit 1
  ),
  today_rows as (
    select *
    from event_rows
    where ends_at >= statement_timestamp()
      and starts_at < tomorrow_start
      and ends_at >= today_start
      and status not in ('cancelled', 'completed')
    order by starts_at, id
    limit bounded_limit
  ),
  attention_rows as (
    select *
    from event_rows
    where ends_at >= statement_timestamp()
      and status not in ('cancelled', 'completed')
      and attendance_mode = 'reservations'
      and waiting_count > 0
    order by starts_at, id
    limit bounded_limit
  )
  select
    (
      select jsonb_build_object(
        'event_id', next_row.id,
        'title', next_row.title,
        'status', next_row.status,
        'starts_at', next_row.starts_at,
        'ends_at', next_row.ends_at,
        'venue_space_id', next_row.venue_space_id,
        'venue_space_name', next_row.venue_space_name,
        'attendance_mode', next_row.attendance_mode,
        'capacity', next_row.capacity,
        'approved_attendee_count', next_row.approved_count,
        'waiting_attendee_count', next_row.waiting_count,
        'requires_approval', next_row.requires_approval
      )
      from next_row
    ),
    coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'event_id', today_row.id,
            'title', today_row.title,
            'status', today_row.status,
            'starts_at', today_row.starts_at,
            'ends_at', today_row.ends_at,
            'venue_space_id', today_row.venue_space_id,
            'venue_space_name', today_row.venue_space_name,
            'attendance_mode', today_row.attendance_mode,
            'capacity', today_row.capacity,
            'approved_attendee_count', today_row.approved_count,
            'waiting_attendee_count', today_row.waiting_count,
            'requires_approval', today_row.requires_approval
          )
          order by today_row.starts_at, today_row.id
        )
        from today_rows as today_row
      ),
      '[]'::jsonb
    ),
    coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'event_id', attention_row.id,
            'title', attention_row.title,
            'waiting_count', attention_row.waiting_count
          )
          order by attention_row.starts_at, attention_row.id
        )
        from attention_rows as attention_row
      ),
      '[]'::jsonb
    ),
    coalesce(
      (
        select jsonb_agg(task.message order by task.position)
        from (
          select 1 as position, 'Add an active viewing area before planning events.'::text as message
          where not exists (
            select 1 from public.venue_spaces as space
            where space.venue_id = input_venue_id and space.active
          )
          union all
          select 2, 'Add a capacity for every active viewing area.'
          where exists (
            select 1
            from public.venues as venue
            join public.venue_spaces as space on space.venue_id = venue.id
            where venue.id = input_venue_id
              and venue.default_attendance_mode = 'reservations'
              and space.active
              and space.capacity is null
          )
          union all
          select 3, 'Name each real viewing area.'
          from public.venues as venue
          where venue.id = input_venue_id
            and coalesce(venue.screen_count, 1) > (
              select count(*)
              from public.venue_spaces as space
              where space.venue_id = input_venue_id and space.active
            )
        ) as task
      ),
      '[]'::jsonb
    );
end;
$function$;

comment on function public.get_venue_today(uuid, integer) is
  'Returns next and current Venue operations. Only reservation events can produce attendance attention.';

create function public.discover_open_door_events(
  input_city_id uuid,
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
  city_name text,
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
  if input_city_id is null
    or not exists (
      select 1 from public.cities as city
      where city.id = input_city_id and city.active
    )
    or input_radius_km is null
    or input_radius_km not in (5, 15, 30, 50)
    or not private.discovery_window_is_valid(input_from, input_to)
    or (input_lat is null) <> (input_lng is null)
    or (input_lat is not null and input_lat not between -90 and 90)
    or (input_lng is not null and input_lng not between -180 and 180)
    or input_limit is null
    or input_limit not between 1 and 50
    or num_nonnulls(
      input_after_interest_score,
      input_after_distance_band,
      input_after_starts_at,
      input_after_event_id
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
      and (
        input_after_starts_at < input_from
        or input_after_starts_at >= input_to
      )
    ) then
    raise exception using errcode = 'P0001', message = 'VALIDATION_FAILED';
  end if;
  bounded_limit := input_limit;

  if input_lat is null then
    select city.center into origin
    from public.cities as city
    where city.id = input_city_id and city.active;
  else
    origin := extensions.st_setsrid(
      extensions.st_makepoint(input_lng, input_lat),
      4326
    )::extensions.geography;
  end if;

  if origin is null then
    raise exception using errcode = 'P0001', message = 'VALIDATION_FAILED';
  end if;

  return query
  with ranked_events as (
    select
      event.id as event_id,
      event.title,
      'venue'::text as host_kind,
      venue.name as host_display_name,
      venue.slug as host_venue_slug,
      venue.verification_status::text as venue_verification_status,
      event.match_id,
      competition.name as competition_name,
      home_team.name as home_team_name,
      away_team.name as away_team_name,
      event.starts_at,
      event.ends_at,
      city.name_en as city_name,
      event.place_kind::text as place_kind,
      case
        when extensions.st_distance(origin, venue.location) < 1000 then 'Within 1 km'
        when extensions.st_distance(origin, venue.location) < 5000 then '1–5 km away'
        when extensions.st_distance(origin, venue.location) < 15000 then '5–15 km away'
        when extensions.st_distance(origin, venue.location) < 50000 then '15–50 km away'
        else '50+ km away'
      end as location_summary,
      event.audience::text as audience,
      null::text as audience_group_name,
      null::text as audience_team_name,
      null::integer as capacity,
      0::bigint as approved_attendee_count,
      null::integer as remaining_capacity,
      false as requires_approval,
      case
        when actor_id is null then 0
        else
          case when exists (
            select 1
            from public.subscriptions as subscription
            where subscription.user_id = actor_id
              and subscription.kind = 'team'
              and subscription.team_id in (match.home_team_id, match.away_team_id)
          ) then 8 else 0 end
          + case when exists (
            select 1
            from public.subscriptions as subscription
            where subscription.user_id = actor_id
              and subscription.kind = 'competition'
              and subscription.competition_id = match.competition_id
          ) then 4 else 0 end
          + case when exists (
            select 1
            from public.subscriptions as subscription
            where subscription.user_id = actor_id
              and subscription.kind = 'sport'
              and subscription.sport_id = competition.sport_id
          ) then 2 else 0 end
          + case when exists (
            select 1
            from public.venue_follows as venue_follow
            where venue_follow.user_id = actor_id
              and venue_follow.venue_id = event.host_venue_id
          ) then 1 else 0 end
      end as interest_score,
      case
        when extensions.st_distance(origin, venue.location) < 1000 then 0
        when extensions.st_distance(origin, venue.location) < 5000 then 1
        when extensions.st_distance(origin, venue.location) < 15000 then 2
        when extensions.st_distance(origin, venue.location) < 50000 then 3
        else 4
      end as distance_band
    from public.events as event
    join public.venues as venue on venue.id = event.host_venue_id
    join public.matches as match on match.id = event.match_id
    join public.competitions as competition on competition.id = match.competition_id
    join public.teams as home_team on home_team.id = match.home_team_id
    join public.teams as away_team on away_team.id = match.away_team_id
    join public.cities as city on city.id = event.city_id
    where event.attendance_mode = 'open_door'
      and event.place_kind = 'venue'
      and event.audience = 'public'
      and event.status = 'published'
      and event.starts_at > statement_timestamp()
      and event.starts_at >= input_from
      and event.starts_at < input_to
      and extensions.st_dwithin(venue.location, origin, input_radius_km * 1000.0)
      and (input_team_id is null or input_team_id in (match.home_team_id, match.away_team_id))
      and (input_competition_id is null or match.competition_id = input_competition_id)
      and (input_match_id is null or match.id = input_match_id)
      and private.event_is_visible_to_actor(event.id, actor_id)
      and not exists (
        select 1
        from public.venue_memberships as membership
        where membership.user_id = actor_id
          and membership.venue_id = event.host_venue_id
          and membership.status = 'active'
          and membership.revoked_at is null
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
    page.city_name,
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

comment on function public.discover_open_door_events(
  uuid, double precision, double precision, integer, timestamptz, timestamptz,
  uuid, uuid, uuid, integer, integer, timestamptz, uuid, integer
) is
  'Returns one keyset page of public walk-in Venue events without fabricating Huddle attendance or capacity.';

-- Both wrappers call private.assert_common_actor(), which may acquire the
-- actor serialization lock. Keep them volatile so PostgREST does not execute
-- them in a read-only transaction after this migration replaces their shape.
alter function public.get_venue_workspace(uuid) volatile;
alter function public.list_venue_calendar(uuid, integer) volatile;

revoke all on function public.create_venue_workspace_v2(
  text, text, uuid, text, numeric, numeric, text, text, integer, text[], text,
  text, boolean, boolean, boolean, integer, uuid
) from public, anon;
grant execute on function public.create_venue_workspace_v2(
  text, text, uuid, text, numeric, numeric, text, text, integer, text[], text,
  text, boolean, boolean, boolean, integer, uuid
) to authenticated;

revoke all on function public.update_venue_workspace_v2(
  uuid, text, text, uuid, text, numeric, numeric, text, text[], text, text,
  boolean, uuid
) from public, anon;
grant execute on function public.update_venue_workspace_v2(
  uuid, text, text, uuid, text, numeric, numeric, text, text[], text, text,
  boolean, uuid
) to authenticated;

revoke all on function public.get_venue_settings(uuid) from public, anon;
grant execute on function public.get_venue_settings(uuid) to authenticated;

revoke all on function public.list_venue_calendar(uuid, integer) from public, anon;
grant execute on function public.list_venue_calendar(uuid, integer) to authenticated;

revoke all on function public.discover_open_door_events(
  uuid, double precision, double precision, integer, timestamptz, timestamptz,
  uuid, uuid, uuid, integer, integer, timestamptz, uuid, integer
) from public;
grant execute on function public.discover_open_door_events(
  uuid, double precision, double precision, integer, timestamptz, timestamptz,
  uuid, uuid, uuid, integer, integer, timestamptz, uuid, integer
) to anon, authenticated;

commit;
