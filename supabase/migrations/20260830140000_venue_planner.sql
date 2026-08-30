begin;

create or replace function public.get_venue_settings(input_venue_id uuid)
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
  'Returns one active operator Venue profile/default projection. Exact public coordinates remain server-only adapter data and are never rendered as controls.';

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
            select 1 from public.venue_spaces as space
            where space.venue_id = input_venue_id and space.active and space.capacity is null
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
  'Returns bounded next, Israel-day remainder, attendance attention, and setup work for one active Venue workspace.';

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
  requested_title text;
  requested_description text;
  requested_capacity integer;
  requested_requires_approval boolean;
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
          'matchId', 'venueSpaceId', 'title', 'description', 'capacity',
          'requiresApproval'
        ])
      )
      or not (item ? 'matchId')
      or not (item ? 'venueSpaceId')
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
    if selected_space.id is null
      or not selected_space.active
      or selected_space.capacity is null then
      raise exception using errcode = 'P0001', message = 'VENUE_DEFAULTS_INCOMPLETE';
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
    resolved_capacity := coalesce(requested_capacity, selected_space.capacity);
    resolved_requires_approval := coalesce(
      requested_requires_approval,
      selected_venue.default_requires_approval
    );

    if char_length(resolved_title) not between 3 and 120
      or char_length(resolved_description) not between 10 and 2000
      or resolved_capacity not between 1 and selected_space.capacity then
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
        'batch_size', jsonb_array_length(input_items),
        'batch_position', item_index
      )
    );

    return query select created_event.id, created_event.status::text;
  end loop;
end;
$function$;

comment on function public.plan_venue_events(jsonb, text, uuid) is
  'Creates a bounded all-or-none Venue batch from current fixtures and active areas with historical capacity and joining-policy snapshots.';

revoke all on function public.get_venue_settings(uuid) from public, anon;
grant execute on function public.get_venue_settings(uuid) to authenticated;

revoke all on function public.get_venue_today(uuid, integer) from public, anon;
grant execute on function public.get_venue_today(uuid, integer) to authenticated;

revoke all on function public.plan_venue_events(jsonb, text, uuid) from public, anon;
grant execute on function public.plan_venue_events(jsonb, text, uuid) to authenticated;

commit;
