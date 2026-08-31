alter table public.groups alter column city_id drop not null;

drop index if exists public.groups_visibility_lifecycle_city_idx;
drop index if exists public.groups_team_city_idx;

create index groups_visibility_lifecycle_idx
  on public.groups (visibility, lifecycle, updated_at desc);
create index groups_team_idx
  on public.groups (team_id, updated_at desc)
  where team_id is not null;

comment on column public.groups.city_id is
  'Optional home area for presentation. It is never a membership or discovery eligibility boundary.';

create or replace function public.create_group(
  input_name text,
  input_slug text,
  input_city_id uuid,
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
  actor_id uuid := private.assert_actor(true);
  normalized_name text := btrim(input_name);
  normalized_slug text := lower(btrim(input_slug));
  normalized_description text := nullif(btrim(input_description), '');
  selected_visibility public.group_visibility;
  initial_lifecycle public.group_lifecycle;
  created_group_id uuid;
begin
  if char_length(normalized_name) not between 3 and 80
    or normalized_slug !~ '^[a-z0-9]+(-[a-z0-9]+)*$'
    or char_length(normalized_slug) not between 3 and 60
    or (normalized_description is not null and char_length(normalized_description) > 2000) then
    raise exception using errcode = 'P0001', message = 'VALIDATION_FAILED';
  end if;

  if input_visibility not in ('discoverable', 'unlisted') then
    raise exception using errcode = 'P0001', message = 'VALIDATION_FAILED';
  end if;

  selected_visibility := input_visibility::public.group_visibility;
  initial_lifecycle := case
    when selected_visibility = 'discoverable' then 'forming'::public.group_lifecycle
    else 'active'::public.group_lifecycle
  end;

  if input_city_id is not null and not exists (
    select 1 from public.cities as city where city.id = input_city_id and city.active
  ) then
    raise exception using errcode = 'P0001', message = 'VALIDATION_FAILED';
  end if;

  if input_team_id is not null and not exists (
    select 1 from public.teams as team where team.id = input_team_id and team.active
  ) then
    raise exception using errcode = 'P0001', message = 'VALIDATION_FAILED';
  end if;

  insert into public.groups (
    slug, name, owner_id, team_id, city_id, visibility, lifecycle, description, activated_at
  )
  values (
    normalized_slug,
    normalized_name,
    actor_id,
    input_team_id,
    input_city_id,
    selected_visibility,
    initial_lifecycle,
    normalized_description,
    case when initial_lifecycle = 'active' then statement_timestamp() else null end
  )
  returning id into created_group_id;

  insert into public.group_memberships (
    group_id, user_id, role, status, reviewed_by, reviewed_at
  )
  values (
    created_group_id, actor_id, 'owner', 'active', actor_id, statement_timestamp()
  );

  perform private.write_security_audit(
    actor_id,
    'group.create',
    'group',
    created_group_id,
    'succeeded',
    audit_request_id,
    jsonb_build_object(
      'visibility', selected_visibility::text,
      'has_home_area', input_city_id is not null
    )
  );

  return query select created_group_id, normalized_slug, initial_lifecycle::text;
exception
  when unique_violation then
    raise exception using errcode = 'P0001', message = 'GROUP_SLUG_UNAVAILABLE';
end;
$function$;

comment on function public.create_group(text, text, uuid, uuid, text, text, uuid) is
  'Atomically creates a group with an optional presentation-only home area and exactly one active owner membership.';

create or replace function public.suggest_similar_groups(
  input_name text,
  input_city_id uuid,
  input_team_id uuid,
  input_limit integer default 5
)
returns table (
  group_id uuid,
  slug text,
  name text,
  lifecycle text,
  city_name text,
  team_name text,
  similarity_score real
)
language plpgsql
security definer
volatile
set search_path = ''
as $function$
declare
  actor_id uuid := private.assert_actor(true);
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
    city.name_en,
    team.name,
    extensions.similarity(lower(supporter_group.name), normalized_name)::real
  from public.groups as supporter_group
  left join public.cities as city on city.id = supporter_group.city_id
  left join public.teams as team on team.id = supporter_group.team_id
  where supporter_group.visibility = 'discoverable'
    and supporter_group.lifecycle in ('forming', 'active')
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
    (input_city_id is not null and supporter_group.city_id = input_city_id) desc,
    supporter_group.name,
    supporter_group.id
  limit bounded_limit;
end;
$function$;

comment on function public.suggest_similar_groups(text, uuid, uuid, integer) is
  'Returns bounded global fuzzy suggestions; an optional home area may rank a tie but never excludes a group.';

create or replace function public.search_groups(
  input_query text default null,
  input_city_id uuid default null,
  input_team_id uuid default null,
  input_after_name text default null,
  input_after_id uuid default null,
  input_limit integer default 20
)
returns table (
  group_id uuid,
  slug text,
  name text,
  description text,
  city_name text,
  team_name text,
  active_member_count bigint,
  cursor_name text,
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
  normalized_query text := nullif(lower(btrim(input_query)), '');
  normalized_after_name text := nullif(lower(btrim(input_after_name)), '');
  bounded_limit integer := least(greatest(coalesce(input_limit, 20), 1), 50);
begin
  if normalized_query is not null
    and char_length(normalized_query) not between 2 and 80 then
    raise exception using errcode = 'P0001', message = 'VALIDATION_FAILED';
  end if;

  if (normalized_after_name is null) <> (input_after_id is null) then
    raise exception using errcode = 'P0001', message = 'VALIDATION_FAILED';
  end if;

  return query
  with eligible_groups as (
    select
      supporter_group.id as group_id,
      supporter_group.slug,
      supporter_group.name,
      supporter_group.description,
      city.name_en as city_name,
      team.name as team_name,
      (
        select count(*)
        from public.group_memberships as membership
        join public.profiles as profile on profile.id = membership.user_id
        where membership.group_id = supporter_group.id
          and membership.status = 'active'
          and profile.suspended_at is null
          and not exists (
            select 1
            from public.group_bans as ban
            where ban.group_id = membership.group_id
              and ban.user_id = membership.user_id
              and ban.revoked_at is null
          )
      ) as active_member_count,
      lower(supporter_group.name) as cursor_name
    from public.groups as supporter_group
    left join public.cities as city on city.id = supporter_group.city_id
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
            select 1
            from public.group_bans as viewer_ban
            where viewer_ban.group_id = supporter_group.id
              and viewer_ban.user_id = actor_id
              and viewer_ban.revoked_at is null
          )
        )
      )
      and (
        normalized_after_name is null
        or (lower(supporter_group.name), supporter_group.id)
          > (normalized_after_name, input_after_id)
      )
    order by lower(supporter_group.name), supporter_group.id
    limit bounded_limit + 1
  ),
  numbered_page as (
    select
      candidate.*,
      row_number() over (order by candidate.cursor_name, candidate.group_id) as row_number,
      count(*) over () > bounded_limit as has_more
    from eligible_groups as candidate
  )
  select
    page.group_id,
    page.slug,
    page.name,
    page.description,
    page.city_name,
    page.team_name,
    page.active_member_count,
    page.cursor_name,
    page.has_more
  from numbered_page as page
  where page.row_number <= bounded_limit
  order by page.cursor_name, page.group_id;
end;
$function$;

comment on function public.search_groups(text, uuid, uuid, text, uuid, integer) is
  'Returns global active discoverable group summaries; the retained city argument is ignored for backward-compatible clients.';

create or replace function public.get_group_by_slug(lookup_slug text)
returns table (
  group_id uuid,
  slug text,
  name text,
  description text,
  visibility text,
  lifecycle text,
  city_name text,
  team_name text,
  owner_handle text,
  active_member_count bigint,
  viewer_role text,
  viewer_membership_status text,
  can_view_member_content boolean,
  can_apply boolean
)
language sql
security definer
stable
set search_path = ''
as $function$
  with candidate as (
    select
      supporter_group.*,
      private.actor_is_active_group_member(supporter_group.id, auth.uid()) as viewer_is_member,
      private.profile_is_community_eligible(auth.uid()) as viewer_is_eligible,
      exists (
        select 1
        from public.group_bans as ban
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
    city.name_en,
    team.name,
    owner_profile.handle,
    (
      select count(*)
      from public.group_memberships as active_membership
      where active_membership.group_id = supporter_group.id
        and active_membership.status = 'active'
    ),
    case when viewer_membership.status = 'active' then viewer_membership.role::text else null end,
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
  left join public.cities as city on city.id = supporter_group.city_id
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
  city_name text,
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
  actor_id uuid := private.assert_actor(true);
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
    city.name_en,
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
  left join public.cities as city on city.id = supporter_group.city_id
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
  city_name text,
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
      city.name_en as city_name,
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
    left join public.cities as city on city.id = supporter_group.city_id
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
    relationship.city_name,
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

comment on function public.list_my_group_relationships(text, integer, integer) is
  'Returns all active group roles by default plus a minimal pending-application envelope; role filters remain available.';

create or replace function private.discovery_window_is_valid(
  input_from timestamptz,
  input_to timestamptz,
  reference_at timestamptz default statement_timestamp()
)
returns boolean
language sql
stable
set search_path = ''
as $function$
  with boundary as (
    select
      date_trunc('day', reference_at at time zone 'Asia/Jerusalem') as today,
      make_timestamp(
        (
          extract(year from reference_at at time zone 'Asia/Jerusalem')
          + case
              when extract(month from reference_at at time zone 'Asia/Jerusalem') > 5
                then 1
              else 0
            end
        )::integer,
        6,
        1,
        0,
        0,
        0
      ) as season_end_exclusive
  )
  select
    input_from is not null
    and input_to is not null
    and reference_at is not null
    and input_to > input_from
    and input_from at time zone 'Asia/Jerusalem' >= boundary.today
    and input_to at time zone 'Asia/Jerusalem' <= boundary.season_end_exclusive
  from boundary;
$function$;

comment on function private.discovery_window_is_valid(timestamptz, timestamptz, timestamptz) is
  'Accepts future Israel-calendar discovery windows through May 31 of the active football season.';
