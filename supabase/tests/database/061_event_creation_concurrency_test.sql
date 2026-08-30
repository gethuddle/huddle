begin;

create extension if not exists pgtap with schema extensions;
create extension if not exists dblink with schema extensions;
set local search_path = extensions, public, pg_catalog;

select no_plan();

-- These deterministic credentials belong only to the disposable Supabase CLI
-- database container. No hosted database or secret is used by this test.
do $setup$
declare
  connection_text constant text :=
    'host=supabase_db_huddle port=5432 dbname=postgres user=postgres password=postgres sslmode=disable';
begin
  perform extensions.dblink_connect('event_concurrency_setup', connection_text);
  perform extensions.dblink_exec(
    'event_concurrency_setup',
    $remote$
      delete from public.security_audit_events
      where actor_id in (
        '62000000-0000-4000-8000-000000000101',
        '62000000-0000-4000-8000-000000000102',
        '62000000-0000-4000-8000-000000000103'
      );

      delete from public.events
      where created_by in (
        '62000000-0000-4000-8000-000000000101',
        '62000000-0000-4000-8000-000000000103'
      );

      delete from public.group_bans
      where group_id = '62000000-0000-4000-8000-000000000205';
      delete from public.groups
      where id = '62000000-0000-4000-8000-000000000205';
      delete from public.matches
      where id = '62000000-0000-4000-8000-000000000204';
      delete from public.teams
      where id in (
        '62000000-0000-4000-8000-000000000202',
        '62000000-0000-4000-8000-000000000203'
      );
      delete from public.competitions
      where id = '62000000-0000-4000-8000-000000000201';
      delete from auth.users
      where id in (
        '62000000-0000-4000-8000-000000000101',
        '62000000-0000-4000-8000-000000000102',
        '62000000-0000-4000-8000-000000000103'
      );

      insert into auth.users (
        instance_id, id, aud, role, email, email_confirmed_at,
        raw_app_meta_data, raw_user_meta_data, created_at, updated_at
      )
      values
        (
          '00000000-0000-0000-0000-000000000000',
          '62000000-0000-4000-8000-000000000101',
          'authenticated', 'authenticated', 'b07-event-race-actor@example.com',
          statement_timestamp(), '{}'::jsonb, '{}'::jsonb,
          statement_timestamp(), statement_timestamp()
        ),
        (
          '00000000-0000-0000-0000-000000000000',
          '62000000-0000-4000-8000-000000000102',
          'authenticated', 'authenticated', 'b07-event-race-owner@example.com',
          statement_timestamp(), '{}'::jsonb, '{}'::jsonb,
          statement_timestamp(), statement_timestamp()
        ),
        (
          '00000000-0000-0000-0000-000000000000',
          '62000000-0000-4000-8000-000000000103',
          'authenticated', 'authenticated', 'b07-event-race-member@example.com',
          statement_timestamp(), '{}'::jsonb, '{}'::jsonb,
          statement_timestamp(), statement_timestamp()
        );

      update public.profiles
      set
        handle = case id
          when '62000000-0000-4000-8000-000000000101' then 'b07_event_race_actor'
          when '62000000-0000-4000-8000-000000000102' then 'b07_event_race_owner'
          when '62000000-0000-4000-8000-000000000103' then 'b07_event_race_member'
        end,
        display_name = case id
          when '62000000-0000-4000-8000-000000000101' then 'B07 Event Race Actor'
          when '62000000-0000-4000-8000-000000000102' then 'B07 Event Race Owner'
          when '62000000-0000-4000-8000-000000000103' then 'B07 Event Race Member'
        end,
        city_id = (select id from public.cities where slug = 'haifa'),
        adult_attested_at = statement_timestamp(),
        rules_version = 1,
        rules_accepted_at = statement_timestamp(),
        profile_completed_at = statement_timestamp(),
        fan_enabled_at = statement_timestamp()
      where id in (
        '62000000-0000-4000-8000-000000000101',
        '62000000-0000-4000-8000-000000000102',
        '62000000-0000-4000-8000-000000000103'
      );

      insert into public.competitions (
        id, sport_id, provider, provider_external_id, code, name,
        country_name, last_synced_at
      )
      values (
        '62000000-0000-4000-8000-000000000201',
        '00000000-0000-4000-8000-000000000020',
        'b07-concurrency-test', 'competition', 'B07C',
        'B07 Concurrency League', 'England', statement_timestamp()
      );

      insert into public.teams (
        id, sport_id, provider, provider_external_id, name, short_name,
        tla, country_name, last_synced_at
      )
      values
        (
          '62000000-0000-4000-8000-000000000202',
          '00000000-0000-4000-8000-000000000020',
          'b07-concurrency-test', 'home-team', 'B07 Concurrency Home FC',
          'B07 Home', 'B7H', 'England', statement_timestamp()
        ),
        (
          '62000000-0000-4000-8000-000000000203',
          '00000000-0000-4000-8000-000000000020',
          'b07-concurrency-test', 'away-team', 'B07 Concurrency Away FC',
          'B07 Away', 'B7A', 'England', statement_timestamp()
        );

      insert into public.matches (
        id, provider, provider_external_id, competition_id, home_team_id,
        away_team_id, starts_at, status, matchday, season_label, last_synced_at
      )
      values (
        '62000000-0000-4000-8000-000000000204',
        'b07-concurrency-test', 'match',
        '62000000-0000-4000-8000-000000000201',
        '62000000-0000-4000-8000-000000000202',
        '62000000-0000-4000-8000-000000000203',
        statement_timestamp() + interval '7 days', 'timed', 1, '2026',
        statement_timestamp()
      );

      insert into public.groups (
        id, slug, name, owner_id, city_id, visibility, lifecycle,
        description, activated_at
      )
      values (
        '62000000-0000-4000-8000-000000000205',
        'b07-event-race-group', 'B07 Event Race Group',
        '62000000-0000-4000-8000-000000000102',
        (select id from public.cities where slug = 'haifa'),
        'unlisted', 'active',
        'A deterministic group for event authorization concurrency tests.',
        statement_timestamp()
      );

      insert into public.group_memberships (
        group_id, user_id, role, status, reviewed_by, reviewed_at
      )
      values
        (
          '62000000-0000-4000-8000-000000000205',
          '62000000-0000-4000-8000-000000000102',
          'owner', 'active', null, null
        ),
        (
          '62000000-0000-4000-8000-000000000205',
          '62000000-0000-4000-8000-000000000103',
          'member', 'active',
          '62000000-0000-4000-8000-000000000102', statement_timestamp()
        );
    $remote$
  );
  perform extensions.dblink_disconnect('event_concurrency_setup');
end;
$setup$;

-- One actor may create only one event inside the durable cooldown window. The
-- transaction-scoped actor lock closes the check/write gap between requests.
do $cooldown_connections$
declare
  connection_text constant text :=
    'host=supabase_db_huddle port=5432 dbname=postgres user=postgres password=postgres sslmode=disable';
begin
  perform extensions.dblink_connect('event_cooldown_a', connection_text);
  perform extensions.dblink_connect('event_cooldown_b', connection_text);
  perform extensions.dblink_exec('event_cooldown_a', 'begin');
  perform extensions.dblink_exec('event_cooldown_a', 'set local role authenticated');
  perform extensions.dblink_exec(
    'event_cooldown_a',
    'set local "request.jwt.claim.sub" = ''62000000-0000-4000-8000-000000000101'''
  );
  perform extensions.dblink_exec('event_cooldown_b', 'begin');
  perform extensions.dblink_exec('event_cooldown_b', 'set local role authenticated');
  perform extensions.dblink_exec(
    'event_cooldown_b',
    'set local "request.jwt.claim.sub" = ''62000000-0000-4000-8000-000000000101'''
  );
end;
$cooldown_connections$;

select is(
  extensions.dblink_send_query(
    'event_cooldown_a',
    $first_event$
      select * from public.create_or_update_event(
        null, null, null, '62000000-0000-4000-8000-000000000204',
        'B07 Concurrent Event One',
        'A deterministic private event created by the first concurrent request.',
        'Watch the full match together', 'Free admission',
        'Respect every registered attendee.', 'No commercial affiliation',
        true, statement_timestamp() + interval '7 days',
        statement_timestamp() + interval '7 days 3 hours',
        (select id from public.cities where slug = 'haifa'),
        'home', null, null, null, null, null,
        'invite_only', null, null, 6, true,
        '91 Protected Event Street, Haifa',
        'Use the private entrance after approval.', 34.998, 32.812,
        'publish', null
      )
    $first_event$
  ),
  1,
  'the first event creation starts in its own transaction'
);

select lives_ok(
  $assert_first_event$
    select event_id, status
    from extensions.dblink_get_result('event_cooldown_a')
      as result(event_id uuid, status text)
  $assert_first_event$,
  'the first concurrent event creation succeeds'
);

do $drain_first_event$
begin
  perform event_id, status
  from extensions.dblink_get_result('event_cooldown_a')
    as result(event_id uuid, status text);
end;
$drain_first_event$;

select is(
  extensions.dblink_send_query(
    'event_cooldown_b',
    $second_event$
      select * from public.create_or_update_event(
        null, null, null, '62000000-0000-4000-8000-000000000204',
        'B07 Concurrent Event Two',
        'A deterministic private event created by the second concurrent request.',
        'Watch the full match together', 'Free admission',
        'Respect every registered attendee.', 'No commercial affiliation',
        true, statement_timestamp() + interval '7 days',
        statement_timestamp() + interval '7 days 3 hours',
        (select id from public.cities where slug = 'haifa'),
        'home', null, null, null, null, null,
        'invite_only', null, null, 6, true,
        '92 Protected Event Street, Haifa',
        'Use the private entrance after approval.', 34.999, 32.813,
        'publish', null
      )
    $second_event$
  ),
  1,
  'a second event creation starts concurrently for the same actor'
);

do $allow_second_event_to_reach_actor_lock$
begin
  perform pg_sleep(0.2);
end;
$allow_second_event_to_reach_actor_lock$;

select is(
  extensions.dblink_is_busy('event_cooldown_b'),
  1,
  'the second same-actor event waits for the first transaction'
);

do $commit_first_event$
begin
  perform extensions.dblink_exec('event_cooldown_a', 'commit');
end;
$commit_first_event$;

select throws_ok(
  $assert_second_event$
    select event_id, status
    from extensions.dblink_get_result('event_cooldown_b')
      as result(event_id uuid, status text)
  $assert_second_event$,
  'P0001', 'RATE_LIMITED',
  'the serialized second event observes committed cooldown evidence'
);

do $disconnect_cooldown_workers$
begin
  perform extensions.dblink_disconnect('event_cooldown_a');
  perform extensions.dblink_disconnect('event_cooldown_b');
end;
$disconnect_cooldown_workers$;

select is(
  (select count(*) from public.events
   where created_by = '62000000-0000-4000-8000-000000000101'),
  1::bigint,
  'only one concurrent event creation is persisted'
);
select is(
  (select count(*) from public.security_audit_events
   where actor_id = '62000000-0000-4000-8000-000000000101'
     and action = 'event.create'),
  1::bigint,
  'only one event cooldown audit record is persisted'
);

-- Hold a group-member ban open after it updates the membership row. Event
-- creation must wait on that same row and re-check eligibility after commit.
do $ban_connections$
declare
  connection_text constant text :=
    'host=supabase_db_huddle port=5432 dbname=postgres user=postgres password=postgres sslmode=disable';
begin
  perform extensions.dblink_connect('event_ban_worker', connection_text);
  perform extensions.dblink_connect('group_event_worker', connection_text);
  perform extensions.dblink_exec('event_ban_worker', 'begin');
  perform extensions.dblink_exec('event_ban_worker', 'set local role authenticated');
  perform extensions.dblink_exec(
    'event_ban_worker',
    'set local "request.jwt.claim.sub" = ''62000000-0000-4000-8000-000000000102'''
  );
  perform extensions.dblink_exec('group_event_worker', 'begin');
  perform extensions.dblink_exec('group_event_worker', 'set local role authenticated');
  perform extensions.dblink_exec(
    'group_event_worker',
    'set local "request.jwt.claim.sub" = ''62000000-0000-4000-8000-000000000103'''
  );
end;
$ban_connections$;

select is(
  extensions.dblink_send_query(
    'event_ban_worker',
    $ban_member$
      select * from public.ban_group_member(
        '62000000-0000-4000-8000-000000000205',
        '62000000-0000-4000-8000-000000000103',
        'Concurrent event safety test', null
      )
    $ban_member$
  ),
  1,
  'the member ban starts in its own transaction'
);

select lives_ok(
  $assert_member_ban$
    select group_id, user_id, status
    from extensions.dblink_get_result('event_ban_worker')
      as result(group_id uuid, user_id uuid, status text)
  $assert_member_ban$,
  'the member ban completes while retaining its membership-row lock'
);

do $drain_member_ban$
begin
  perform group_id, user_id, status
  from extensions.dblink_get_result('event_ban_worker')
    as result(group_id uuid, user_id uuid, status text);
end;
$drain_member_ban$;

select is(
  extensions.dblink_send_query(
    'group_event_worker',
    $group_event$
      select * from public.create_or_update_event(
        null, null, '62000000-0000-4000-8000-000000000205',
        '62000000-0000-4000-8000-000000000204',
        'B07 Concurrent Group Event',
        'A deterministic group event attempted across a concurrent member ban.',
        'Watch the full match together', 'Free admission',
        'Respect every registered attendee.', 'No commercial affiliation',
        true, statement_timestamp() + interval '7 days',
        statement_timestamp() + interval '7 days 3 hours',
        (select id from public.cities where slug = 'haifa'),
        'home', null, null, null, null, null,
        'group', null, '62000000-0000-4000-8000-000000000205', 6, true,
        '93 Protected Event Street, Haifa',
        'Use the private entrance after approval.', 35.000, 32.814,
        'publish', null
      )
    $group_event$
  ),
  1,
  'group event creation starts against the uncommitted member ban'
);

do $allow_group_event_to_reach_membership_lock$
begin
  perform pg_sleep(0.2);
end;
$allow_group_event_to_reach_membership_lock$;

select is(
  extensions.dblink_is_busy('group_event_worker'),
  1,
  'group event creation waits for the membership transition'
);

do $commit_member_ban$
begin
  perform extensions.dblink_exec('event_ban_worker', 'commit');
end;
$commit_member_ban$;

select throws_ok(
  $assert_group_event$
    select event_id, status
    from extensions.dblink_get_result('group_event_worker')
      as result(event_id uuid, status text)
  $assert_group_event$,
  'P0001', 'NOT_ALLOWED',
  'the group event rejects the ban committed ahead of it'
);

do $disconnect_ban_workers$
begin
  perform extensions.dblink_disconnect('event_ban_worker');
  perform extensions.dblink_disconnect('group_event_worker');
end;
$disconnect_ban_workers$;

select is(
  (select status::text from public.group_memberships
   where group_id = '62000000-0000-4000-8000-000000000205'
     and user_id = '62000000-0000-4000-8000-000000000103'),
  'banned',
  'the member ban is committed'
);
select is(
  (select count(*) from public.events
   where created_by = '62000000-0000-4000-8000-000000000103'),
  0::bigint,
  'no group event is persisted across the committed ban'
);
select is(
  (select count(*) from public.security_audit_events
   where actor_id = '62000000-0000-4000-8000-000000000103'
     and action = 'event.create'),
  0::bigint,
  'the rejected group event writes no success audit evidence'
);

do $cleanup$
declare
  connection_text constant text :=
    'host=supabase_db_huddle port=5432 dbname=postgres user=postgres password=postgres sslmode=disable';
begin
  perform extensions.dblink_connect('event_concurrency_cleanup', connection_text);
  perform extensions.dblink_exec(
    'event_concurrency_cleanup',
    $remote$
      delete from public.security_audit_events
      where actor_id in (
        '62000000-0000-4000-8000-000000000101',
        '62000000-0000-4000-8000-000000000102',
        '62000000-0000-4000-8000-000000000103'
      );
      delete from public.events
      where created_by in (
        '62000000-0000-4000-8000-000000000101',
        '62000000-0000-4000-8000-000000000103'
      );
      delete from public.group_bans
      where group_id = '62000000-0000-4000-8000-000000000205';
      delete from public.groups
      where id = '62000000-0000-4000-8000-000000000205';
      delete from public.matches
      where id = '62000000-0000-4000-8000-000000000204';
      delete from public.teams
      where id in (
        '62000000-0000-4000-8000-000000000202',
        '62000000-0000-4000-8000-000000000203'
      );
      delete from public.competitions
      where id = '62000000-0000-4000-8000-000000000201';
      delete from auth.users
      where id in (
        '62000000-0000-4000-8000-000000000101',
        '62000000-0000-4000-8000-000000000102',
        '62000000-0000-4000-8000-000000000103'
      );
    $remote$
  );
  perform extensions.dblink_disconnect('event_concurrency_cleanup');
end;
$cleanup$;

select * from finish();
rollback;
