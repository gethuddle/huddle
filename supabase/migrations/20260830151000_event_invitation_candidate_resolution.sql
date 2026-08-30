begin;

create or replace function public.resolve_event_invitation_candidate_handles(
  input_event_id uuid,
  input_profile_ids uuid[]
)
returns table (profile_id uuid, handle text)
language plpgsql
security definer
volatile
set search_path = ''
as $function$
declare
  actor_id uuid := private.assert_event_context_actor(input_event_id);
begin
  if coalesce(cardinality(input_profile_ids), 0) not between 1 and 50
    or exists (
      select 1
      from unnest(input_profile_ids) as selected(profile_id)
      where selected.profile_id is null
    )
    or (
      select count(distinct selected.profile_id)
      from unnest(input_profile_ids) as selected(profile_id)
    ) <> cardinality(input_profile_ids) then
    raise exception using errcode = 'P0001', message = 'VALIDATION_FAILED';
  end if;

  if not exists (
    select 1
    from public.events as event
    where event.id = input_event_id
      and private.actor_manages_event(event.id, actor_id)
  ) then
    raise exception using errcode = 'P0001', message = 'NOT_FOUND';
  end if;

  return query
  select profile.id, profile.handle
  from unnest(input_profile_ids) with ordinality as selected(profile_id, position)
  join public.profiles as profile on profile.id = selected.profile_id
  where profile.handle is not null
    and profile.profile_completed_at is not null
    and profile.suspended_at is null
  order by selected.position;
end;
$function$;

comment on function public.resolve_event_invitation_candidate_handles(uuid, uuid[]) is
  'Lets a current event manager resolve at most 50 selected profile ids to current handles before the existing controlled invitation transition rechecks eligibility.';

revoke all on function public.resolve_event_invitation_candidate_handles(uuid, uuid[])
  from public, anon, authenticated;
grant execute on function public.resolve_event_invitation_candidate_handles(uuid, uuid[])
  to authenticated;

commit;
