begin;

create type public.subscription_kind as enum ('sport', 'competition', 'team');

create table public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  kind public.subscription_kind not null,
  sport_id uuid references public.sports(id) on delete cascade,
  competition_id uuid references public.competitions(id) on delete cascade,
  team_id uuid references public.teams(id) on delete cascade,
  created_at timestamptz not null default statement_timestamp(),
  constraint subscriptions_kind_target_check check (
    (
      kind = 'sport'
      and sport_id is not null
      and competition_id is null
      and team_id is null
    )
    or (
      kind = 'competition'
      and sport_id is null
      and competition_id is not null
      and team_id is null
    )
    or (
      kind = 'team'
      and sport_id is null
      and competition_id is null
      and team_id is not null
    )
  )
);

comment on table public.subscriptions is
  'A completed user owns provider-neutral sport, competition, and team follows.';
comment on column public.subscriptions.kind is
  'Discriminator that must agree with the one populated catalog target column.';

create unique index subscriptions_user_sport_uidx
  on public.subscriptions (user_id, sport_id)
  where kind = 'sport';
create unique index subscriptions_user_competition_uidx
  on public.subscriptions (user_id, competition_id)
  where kind = 'competition';
create unique index subscriptions_user_team_uidx
  on public.subscriptions (user_id, team_id)
  where kind = 'team';

create index subscriptions_user_created_idx
  on public.subscriptions (user_id, created_at desc);
create index subscriptions_sport_user_idx
  on public.subscriptions (sport_id, user_id)
  where kind = 'sport';
create index subscriptions_competition_user_idx
  on public.subscriptions (competition_id, user_id)
  where kind = 'competition';
create index subscriptions_team_user_idx
  on public.subscriptions (team_id, user_id)
  where kind = 'team';

create or replace function public.current_actor_is_community_eligible()
returns boolean
language sql
security definer
stable
set search_path = ''
as $function$
  select exists (
    select 1
    from auth.users as auth_user
    join public.profiles as profile on profile.id = auth_user.id
    where auth_user.id = auth.uid()
      and auth_user.email_confirmed_at is not null
      and profile.adult_attested_at is not null
      and profile.rules_version = private.current_rules_version()
      and profile.rules_accepted_at is not null
      and profile.handle is not null
      and profile.display_name is not null
      and profile.city_id is not null
      and profile.profile_completed_at is not null
      and profile.suspended_at is null
  );
$function$;

comment on function public.current_actor_is_community_eligible() is
  'Returns only whether the current session satisfies the shared community mutation gate.';

alter table public.subscriptions enable row level security;
alter table public.subscriptions force row level security;

create policy subscriptions_read_own
on public.subscriptions
for select
to authenticated
using (user_id = auth.uid());

create policy subscriptions_insert_own_eligible
on public.subscriptions
for insert
to authenticated
with check (
  user_id = auth.uid()
  and public.current_actor_is_community_eligible()
  and (
    (
      kind = 'sport'
      and exists (
        select 1
        from public.sports as sport
        where sport.id = subscriptions.sport_id
          and sport.active
      )
    )
    or (
      kind = 'competition'
      and exists (
        select 1
        from public.competitions as competition
        where competition.id = subscriptions.competition_id
          and competition.active
      )
    )
    or (
      kind = 'team'
      and exists (
        select 1
        from public.teams as team
        where team.id = subscriptions.team_id
          and team.active
      )
    )
  )
);

create policy subscriptions_delete_own_eligible
on public.subscriptions
for delete
to authenticated
using (
  user_id = auth.uid()
  and public.current_actor_is_community_eligible()
);

revoke all on public.subscriptions from anon, authenticated;
grant select, insert, delete on public.subscriptions to authenticated;

revoke all on function public.current_actor_is_community_eligible() from public, anon;
grant execute on function public.current_actor_is_community_eligible() to authenticated;

commit;
