begin;

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
    coalesce(venue.owner_id = auth.uid(), false)
  from public.venues as venue
  join public.cities as city on city.id = venue.city_id
  join public.profiles as owner_profile on owner_profile.id = venue.owner_id
  where venue.slug = lower(btrim(lookup_slug))
    and venue.verification_status <> 'suspended'
    and venue.suspended_at is null;
$function$;

comment on function public.get_venue_by_slug(text) is
  'Returns a narrow non-suspended public venue summary with explicit false viewer state for anonymous callers.';

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
          or (
            private.actor_is_group_admin(event.organizing_group_id, input_actor_id)
            and exists (
              select 1
              from public.groups as organizing_group
              where organizing_group.id = event.organizing_group_id
                and organizing_group.lifecycle in ('forming', 'active')
                and organizing_group.suspended_at is null
            )
          )
        )
    );
$function$;

comment on function private.actor_manages_event(uuid, uuid) is
  'Checks personal-host, venue-owner, or active organizing-group administrator management authority.';

create or replace function private.group_discovery_gate(input_group_id uuid)
returns table (
  active_member_count bigint,
  active_moderator_count bigint,
  owner_is_active boolean,
  has_description boolean,
  has_published_rule boolean,
  has_future_event boolean,
  gate_satisfied boolean
)
language sql
security definer
stable
set search_path = ''
as $function$
  with target_group as (
    select supporter_group.*
    from public.groups as supporter_group
    where supporter_group.id = input_group_id
  ),
  eligible_members as (
    select membership.user_id, membership.role
    from public.group_memberships as membership
    join public.profiles as profile on profile.id = membership.user_id
    where membership.group_id = input_group_id
      and membership.status = 'active'
      and profile.suspended_at is null
      and not exists (
        select 1
        from public.group_bans as ban
        where ban.group_id = membership.group_id
          and ban.user_id = membership.user_id
          and ban.revoked_at is null
      )
  ),
  facts as (
    select
      (select count(*) from eligible_members) as active_member_count,
      (
        select count(*)
        from eligible_members
        where role in ('owner', 'admin')
      ) as active_moderator_count,
      exists (
        select 1
        from eligible_members
        join target_group on target_group.owner_id = eligible_members.user_id
        where eligible_members.role = 'owner'
      ) as owner_is_active,
      coalesce(
        (select nullif(btrim(target_group.description), '') is not null from target_group),
        false
      ) as has_description,
      exists (
        select 1
        from public.group_rules as rule
        where rule.group_id = input_group_id
          and rule.published_at is not null
      ) as has_published_rule,
      exists (
        select 1
        from public.events as event
        join public.profiles as host_profile on host_profile.id = event.host_user_id
        where event.organizing_group_id = input_group_id
          and event.status = 'published'
          and event.published_at is not null
          and event.cancelled_at is null
          and event.starts_at > statement_timestamp()
          and host_profile.suspended_at is null
      ) as has_future_event
  )
  select
    facts.active_member_count,
    facts.active_moderator_count,
    facts.owner_is_active,
    facts.has_description,
    facts.has_published_rule,
    facts.has_future_event,
    facts.active_member_count >= 5
      and facts.active_moderator_count >= 2
      and facts.owner_is_active
      and facts.has_description
      and facts.has_published_rule
      and facts.has_future_event
  from facts;
$function$;

comment on function private.group_discovery_gate(uuid) is
  'Computes the complete discoverable-group gate without exposing memberships, bans, rules, or event rows.';

create or replace function private.recalculate_group_discoverability(input_group_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $function$
#variable_conflict use_variable
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

  if not found then
    return false;
  end if;

  if target_group.visibility <> 'discoverable'
    or target_group.lifecycle in ('suspended', 'archived') then
    return target_group.lifecycle = 'active';
  end if;

  select gate.gate_satisfied
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
  where supporter_group.id = input_group_id
    and (
      supporter_group.lifecycle is distinct from case
        when gate_passes then 'active'::public.group_lifecycle
        else 'forming'::public.group_lifecycle
      end
      or (
        gate_passes
        and supporter_group.activated_at is null
      )
      or (
        not gate_passes
        and supporter_group.activated_at is not null
      )
    );

  return gate_passes;
end;
$function$;

comment on function private.recalculate_group_discoverability(uuid) is
  'Serializes one discoverable group and keeps forming/active lifecycle aligned with all current gate facts.';

create or replace function private.refresh_group_discoverability_from_event()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if tg_op <> 'INSERT' and old.organizing_group_id is not null then
    perform private.recalculate_group_discoverability(old.organizing_group_id);
  end if;

  if tg_op <> 'DELETE'
    and new.organizing_group_id is not null
    and (
      tg_op = 'INSERT'
      or new.organizing_group_id is distinct from old.organizing_group_id
      or new.status is distinct from old.status
      or new.starts_at is distinct from old.starts_at
      or new.published_at is distinct from old.published_at
      or new.cancelled_at is distinct from old.cancelled_at
    ) then
    perform private.recalculate_group_discoverability(new.organizing_group_id);
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$function$;

create trigger events_refresh_group_discoverability
after insert or update of organizing_group_id, status, starts_at, published_at, cancelled_at or delete
on public.events
for each row execute function private.refresh_group_discoverability_from_event();

create or replace function public.evaluate_group_discoverability(input_group_id uuid)
returns table (
  active_member_count bigint,
  active_moderator_count bigint,
  owner_is_active boolean,
  has_description boolean,
  has_published_rule boolean,
  has_future_event boolean,
  gate_satisfied boolean,
  lifecycle text
)
language plpgsql
security definer
set search_path = ''
as $function$
#variable_conflict use_variable
declare
  actor_id uuid := private.assert_actor(true);
begin
  if not private.actor_is_group_admin(input_group_id, actor_id) then
    raise exception using errcode = 'P0001', message = 'NOT_FOUND';
  end if;

  perform private.recalculate_group_discoverability(input_group_id);

  return query
  select
    gate.active_member_count,
    gate.active_moderator_count,
    gate.owner_is_active,
    gate.has_description,
    gate.has_published_rule,
    gate.has_future_event,
    gate.gate_satisfied,
    supporter_group.lifecycle::text
  from private.group_discovery_gate(input_group_id) as gate
  join public.groups as supporter_group on supporter_group.id = input_group_id;
end;
$function$;

comment on function public.evaluate_group_discoverability(uuid) is
  'Returns every current discovery-gate fact to an active group administrator and aligns the group lifecycle.';

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
  actor_id uuid := private.assert_actor(true);
  target_event public.events%rowtype;
  target_group public.groups%rowtype;
  next_status public.event_status;
begin
  if input_decision not in ('approve', 'reject') then
    raise exception using errcode = 'P0001', message = 'VALIDATION_FAILED';
  end if;

  select event.*
  into target_event
  from public.events as event
  where event.id = input_event_id
  for update;

  if not found
    or target_event.organizing_group_id is null
    or target_event.status <> 'pending_group_review' then
    raise exception using errcode = 'P0001', message = 'INVALID_TRANSITION';
  end if;

  select supporter_group.*
  into target_group
  from public.groups as supporter_group
  where supporter_group.id = target_event.organizing_group_id
  for share;

  if not found
    or target_group.lifecycle not in ('forming', 'active')
    or target_group.suspended_at is not null
    or not private.actor_is_group_admin(target_group.id, actor_id) then
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
      'status', next_status::text
    )
  );

  return query select input_event_id, next_status::text, input_decision;
end;
$function$;

comment on function public.publish_group_event(uuid, text, uuid) is
  'Lets an active organizing-group owner/admin approve or reject one pending member submission with current eligibility checks and audit evidence.';

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
declare
  actor_id uuid := private.assert_actor(true);
  target_group public.groups%rowtype;
  created_event_id uuid;
  base_intent text;
  final_status public.event_status;
begin
  if input_organizing_group_id is null
    or input_intent not in ('draft', 'publish') then
    raise exception using errcode = 'P0001', message = 'VALIDATION_FAILED';
  end if;

  select supporter_group.*
  into target_group
  from public.groups as supporter_group
  where supporter_group.id = input_organizing_group_id
  for share;

  if not found
    or target_group.lifecycle not in ('forming', 'active')
    or target_group.suspended_at is not null
    or not private.actor_is_active_group_member(input_organizing_group_id, actor_id) then
    raise exception using errcode = 'P0001', message = 'NOT_ALLOWED';
  end if;

  -- Friends and invite-only events must never become visible between creation
  -- and group submission. They begin as drafts and transition before commit.
  base_intent := case
    when input_audience = 'group' then input_intent
    else 'draft'
  end;

  select created.event_id
  into created_event_id
  from public.create_or_update_event(
    null,
    null,
    null,
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
    base_intent,
    audit_request_id
  ) as created;

  if created_event_id is null then
    raise exception using errcode = 'P0001', message = 'INTERNAL_ERROR';
  end if;

  final_status := case
    when input_intent = 'publish' then 'pending_group_review'::public.event_status
    else 'draft'::public.event_status
  end;

  update public.events as event
  set
    organizing_group_id = input_organizing_group_id,
    status = final_status,
    published_at = null,
    cancelled_at = null,
    cancel_reason = null
  where event.id = created_event_id;

  perform private.write_security_audit(
    actor_id,
    'event.group_submit',
    'event',
    created_event_id,
    'succeeded',
    audit_request_id,
    jsonb_build_object(
      'organizing_group_id', input_organizing_group_id,
      'audience_group_id', input_audience_group_id,
      'audience', input_audience,
      'status', final_status::text
    )
  );

  return query select created_event_id, final_status::text;
end;
$function$;

comment on function public.create_group_event(uuid, uuid, text, text, text, text, text, text, boolean, timestamptz, timestamptz, uuid, text, text, text, double precision, double precision, text, uuid, integer, text, text, double precision, double precision, text, uuid) is
  'Creates a private-person event and assigns a separately authorized organizing group in one transaction; publication always waits for group review.';

create or replace function public.list_group_event_submissions(
  input_group_id uuid,
  input_offset integer default 0,
  input_limit integer default 20
)
returns table (
  event_id uuid,
  title text,
  status text,
  submitter_handle text,
  submitter_display_name text,
  audience text,
  audience_group_name text,
  place_kind text,
  home_team_name text,
  away_team_name text,
  competition_name text,
  starts_at timestamptz,
  submitted_at timestamptz,
  total_count bigint
)
language plpgsql
security definer
stable
set search_path = ''
as $function$
#variable_conflict use_variable
declare
  actor_id uuid := private.assert_actor(true);
  bounded_offset integer := greatest(coalesce(input_offset, 0), 0);
  bounded_limit integer := least(greatest(coalesce(input_limit, 20), 1), 50);
begin
  if not private.actor_is_group_admin(input_group_id, actor_id)
    or not exists (
      select 1
      from public.groups as supporter_group
      where supporter_group.id = input_group_id
        and supporter_group.lifecycle in ('forming', 'active')
        and supporter_group.suspended_at is null
    ) then
    raise exception using errcode = 'P0001', message = 'NOT_FOUND';
  end if;

  return query
  select
    event.id,
    event.title,
    event.status::text,
    submitter.handle,
    submitter.display_name,
    event.audience::text,
    audience_group.name,
    event.place_kind::text,
    home_team.name,
    away_team.name,
    competition.name,
    event.starts_at,
    event.created_at,
    count(*) over ()
  from public.events as event
  join public.profiles as submitter on submitter.id = event.created_by
  join public.matches as match on match.id = event.match_id
  join public.teams as home_team on home_team.id = match.home_team_id
  join public.teams as away_team on away_team.id = match.away_team_id
  join public.competitions as competition on competition.id = match.competition_id
  left join public.groups as audience_group on audience_group.id = event.audience_group_id
  where event.organizing_group_id = input_group_id
  order by
    case when event.status = 'pending_group_review' then 0 else 1 end,
    event.created_at desc,
    event.id
  offset bounded_offset
  limit bounded_limit;
end;
$function$;

comment on function public.list_group_event_submissions(uuid, integer, integer) is
  'Returns a bounded, address-free event review queue only to current active organizing-group administrators.';

create or replace function public.list_venue_events(
  lookup_slug text,
  input_limit integer default 12
)
returns table (
  event_id uuid,
  title text,
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
language sql
security definer
stable
set search_path = ''
as $function$
  select
    event.id,
    event.title,
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
  from public.venues as venue
  join public.events as event on event.host_venue_id = venue.id
  join public.matches as match on match.id = event.match_id
  join public.teams as home_team on home_team.id = match.home_team_id
  join public.teams as away_team on away_team.id = match.away_team_id
  join public.competitions as competition on competition.id = match.competition_id
  left join public.teams as audience_team on audience_team.id = event.audience_team_id
  where lower(venue.slug) = lower(btrim(lookup_slug))
    and venue.verification_status <> 'suspended'
    and venue.suspended_at is null
    and event.status = 'published'
    and event.starts_at > statement_timestamp()
    and event.audience in ('public', 'team_followers')
    and private.event_is_visible_to_actor(event.id, auth.uid())
  order by event.starts_at, event.id
  limit least(greatest(coalesce(input_limit, 12), 1), 50);
$function$;

comment on function public.list_venue_events(text, integer) is
  'Returns bounded future public/team-follower venue event cards without private or management data.';

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
  actor_id uuid := private.assert_actor(true);
begin
  if not private.actor_owns_venue(input_venue_id, actor_id) then
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

comment on function public.list_managed_venue_events(uuid, integer) is
  'Returns a bounded address-free venue event list only to the current eligible venue owner.';

create or replace function public.list_group_events(
  input_group_id uuid,
  input_limit integer default 12
)
returns table (
  event_id uuid,
  title text,
  home_team_name text,
  away_team_name text,
  competition_name text,
  starts_at timestamptz,
  audience text,
  capacity integer,
  approved_attendee_count bigint,
  requires_approval boolean
)
language sql
security definer
stable
set search_path = ''
as $function$
  select
    event.id,
    event.title,
    home_team.name,
    away_team.name,
    competition.name,
    event.starts_at,
    event.audience::text,
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
  where event.organizing_group_id = input_group_id
    and event.status = 'published'
    and event.starts_at > statement_timestamp()
    and private.event_is_visible_to_actor(event.id, auth.uid())
  order by event.starts_at, event.id
  limit least(greatest(coalesce(input_limit, 12), 1), 50);
$function$;

comment on function public.list_group_events(uuid, integer) is
  'Returns bounded future organizing-group event cards only when the caller can see each event under its current audience.';

drop function public.get_event_summary(uuid);

create function public.get_event_summary(input_event_id uuid)
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
  approved_attendee_count bigint,
  remaining_capacity integer,
  viewer_attendance_status text,
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
    attendance_counts.approved_count,
    greatest(event.capacity - attendance_counts.approved_count::integer, 0),
    viewer_attendance.status::text,
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
  left join public.event_attendance as viewer_attendance
    on viewer_attendance.event_id = event.id
    and viewer_attendance.user_id = auth.uid()
  cross join lateral (
    select count(*) as approved_count
    from public.event_attendance as attendance
    where attendance.event_id = event.id
      and attendance.status = 'approved'
  ) as attendance_counts
  where event.id = input_event_id
    and private.event_is_visible_to_actor(event.id, auth.uid());
$function$;

comment on function public.get_event_summary(uuid) is
  'Returns one audience-safe event projection with bounded attendance facts. Home address and exact coordinates are structurally absent.';

revoke all on function private.group_discovery_gate(uuid)
  from public, anon, authenticated;
revoke all on function private.recalculate_group_discoverability(uuid)
  from public, anon, authenticated;
revoke all on function private.refresh_group_discoverability_from_event()
  from public, anon, authenticated;

revoke all on function public.evaluate_group_discoverability(uuid) from public, anon;
revoke all on function public.publish_group_event(uuid, text, uuid) from public, anon;
revoke all on function public.create_group_event(
  uuid, uuid, text, text, text, text, text, text, boolean,
  timestamptz, timestamptz, uuid, text, text, text, double precision,
  double precision, text, uuid, integer, text, text, double precision,
  double precision, text, uuid
) from public, anon;
revoke all on function public.list_group_event_submissions(uuid, integer, integer)
  from public, anon;
revoke all on function public.list_venue_events(text, integer) from public;
revoke all on function public.list_managed_venue_events(uuid, integer) from public, anon;
revoke all on function public.list_group_events(uuid, integer) from public;
revoke all on function public.get_event_summary(uuid) from public;

grant execute on function public.evaluate_group_discoverability(uuid) to authenticated;
grant execute on function public.publish_group_event(uuid, text, uuid) to authenticated;
grant execute on function public.create_group_event(
  uuid, uuid, text, text, text, text, text, text, boolean,
  timestamptz, timestamptz, uuid, text, text, text, double precision,
  double precision, text, uuid, integer, text, text, double precision,
  double precision, text, uuid
) to authenticated;
grant execute on function public.list_group_event_submissions(uuid, integer, integer)
  to authenticated;
grant execute on function public.list_venue_events(text, integer) to anon, authenticated;
grant execute on function public.list_managed_venue_events(uuid, integer) to authenticated;
grant execute on function public.list_group_events(uuid, integer) to anon, authenticated;
grant execute on function public.get_event_summary(uuid) to anon, authenticated;

commit;
