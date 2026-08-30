begin;

drop index if exists public.profiles_display_name_search_idx;

create index profiles_display_name_search_idx
  on public.profiles using gin (
    to_tsvector(
      'simple'::regconfig,
      lower(pg_catalog.normalize(display_name, 'NFC'))
    )
  )
  where display_name is not null;

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
  city_name text,
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
    if left(normalized_query, 1) = '@' then
      normalized_query := substr(normalized_query, 2);
    end if;
    if char_length(normalized_query) not between 2 and 50 then
      raise exception using errcode = 'P0001', message = 'VALIDATION_FAILED';
    end if;
    escaped_query := replace(
      replace(replace(normalized_query, '\', '\\'), '%', '\%'),
      '_',
      '\_'
    );
    select count(*) > 0
      and coalesce(bool_and(char_length(word_fragment) >= 3), false)
    into display_query_is_eligible
    from unnest(
      regexp_split_to_array(normalized_query, '[^[:alnum:]]+')
    ) as query_fragments(word_fragment)
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
  with viewer as (
    select profile.id, profile.city_id
    from public.profiles as profile
    where profile.id = actor_id
  ),
  candidate_ids as (
    select profile.id as profile_id
    from public.profiles as profile
    where input_bucket = 'search'
      and lower(profile.handle) like escaped_query || '%' escape '\'

    union

    select profile.id as profile_id
    from public.profiles as profile
    where input_bucket = 'search'
      and display_query_is_eligible
      and to_tsvector(
        'simple'::regconfig,
        lower(pg_catalog.normalize(profile.display_name, 'NFC'))
      )
        @@ plainto_tsquery('simple'::regconfig, normalized_query)

    union

    select case
      when friendship.user_low_id = actor_id then friendship.user_high_id
      else friendship.user_low_id
    end
    from public.friendships as friendship
    where input_bucket in ('accepted', 'incoming', 'sent')
      and actor_id in (friendship.user_low_id, friendship.user_high_id)
      and (
        (input_bucket = 'accepted' and friendship.status = 'accepted')
        or (
          input_bucket = 'incoming'
          and friendship.status = 'pending'
          and friendship.requested_by <> actor_id
        )
        or (
          input_bucket = 'sent'
          and friendship.status = 'pending'
          and friendship.requested_by = actor_id
        )
      )

    union

    select profile.id
    from viewer
    join public.profiles as profile on profile.city_id = viewer.city_id
    where input_bucket = 'suggested'

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
        select 1
        from public.group_bans as ban
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
      city.name_en as city_name,
      case
        when shared_team.name is not null then 'You both follow ' || shared_team.name
        when shared_group.name is not null then 'You are both in ' || shared_group.name
        when profile.city_id = viewer.city_id then 'Also in ' || city.name_en
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
    join viewer on true
    join public.cities as city on city.id = profile.city_id and city.active
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
      where viewer_follow.user_id = actor_id
        and viewer_follow.kind = 'team'
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
          select 1
          from public.group_bans as ban
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
    where
      (
        input_bucket = 'suggested'
        and candidates.friendship_id is null
        and candidates.reason is not null
      )
      or (
        input_bucket = 'search'
      )
      or (
        input_bucket = 'accepted'
        and candidates.friendship_status = 'accepted'
      )
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
    filtered.city_name,
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

comment on function public.list_people_hub(text, text, integer, integer) is
  'Returns one safe People bucket with at most one authorization-safe suggestion reason and the current direct-friendship state.';

revoke all on function public.list_people_hub(text, text, integer, integer)
  from public, anon;
grant execute on function public.list_people_hub(text, text, integer, integer)
  to authenticated;

commit;
