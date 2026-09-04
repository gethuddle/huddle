begin;

create or replace function public.get_fan_home()
returns jsonb
language plpgsql
security definer
stable
set search_path = ''
as $function$
declare
  actor_id uuid := private.assert_fan_actor();
  next_event jsonb;
  attention jsonb;
  suggestion jsonb;
begin
  select to_jsonb(event_row) - 'ordinality'
  into next_event
  from public.list_my_events('upcoming', 1, 0) with ordinality as event_row
  order by event_row.ordinality
  limit 1;

  select coalesce(
    jsonb_agg(
      to_jsonb(attention_row) - 'ordinality'
      order by attention_row.ordinality
    ),
    '[]'::jsonb
  )
  into attention
  from public.list_attention_items(5) with ordinality as attention_row;

  with followed_teams as materialized (
    select subscription.team_id
    from public.subscriptions as subscription
    join public.teams as team
      on team.id = subscription.team_id
      and team.active
    where subscription.user_id = actor_id
      and subscription.kind = 'team'
    order by subscription.created_at desc, subscription.team_id
    limit 50
  ),
  followed_competitions as materialized (
    select subscription.competition_id
    from public.subscriptions as subscription
    join public.competitions as competition
      on competition.id = subscription.competition_id
      and competition.active
    where subscription.user_id = actor_id
      and subscription.kind = 'competition'
    order by subscription.created_at desc, subscription.competition_id
    limit 50
  )
  select to_jsonb(fixture)
  into suggestion
  from public.public_future_matches as fixture
  where exists (
      select 1
      from followed_teams as followed
      where followed.team_id in (fixture.home_team_id, fixture.away_team_id)
    )
    or exists (
      select 1
      from followed_competitions as followed
      where followed.competition_id = fixture.competition_id
    )
  order by fixture.starts_at, fixture.id
  limit 1;

  return jsonb_build_object(
    'next_event', next_event,
    'attention', attention,
    'suggestion', suggestion
  );
end;
$function$;

comment on function public.get_fan_home() is
  'Returns the current Fan Home event, attention and followed-fixture projection in one bounded read round trip.';

revoke all on function public.get_fan_home() from public, anon, authenticated, service_role;
grant execute on function public.get_fan_home() to authenticated;

commit;
