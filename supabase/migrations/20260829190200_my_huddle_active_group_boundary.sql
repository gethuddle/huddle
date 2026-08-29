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
stable
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
  join public.cities as city on city.id = supporter_group.city_id
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

comment on function public.list_my_groups(integer, integer) is
  'Returns only the signed-in actor active group memberships, including unlisted and forming groups, while excluding pending applications.';

revoke all on function public.list_my_groups(integer, integer) from public, anon;
grant execute on function public.list_my_groups(integer, integer) to authenticated;
