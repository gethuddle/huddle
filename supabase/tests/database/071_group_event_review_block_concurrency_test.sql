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
  perform extensions.dblink_connect('group_event_review_setup', connection_text);
  perform extensions.dblink_exec(
    'group_event_review_setup',
    $remote$
      delete from public.security_audit_events
      where actor_id in (
        '62100000-0000-4000-8000-000000000101',
        '62100000-0000-4000-8000-000000000102'
      );

      delete from public.user_blocks
      where blocker_id in (
        '62100000-0000-4000-8000-000000000101',
        '62100000-0000-4000-8000-000000000102'
      )
      or blocked_id in (
        '62100000-0000-4000-8000-000000000101',
        '62100000-0000-4000-8000-000000000102'
      );

      delete from public.event_private_locations
      where event_id = '62100000-0000-4000-8000-000000000301';
      delete from public.events
      where id = '62100000-0000-4000-8000-000000000301';
      delete from public.groups
      where id = '62100000-0000-4000-8000-000000000205';
      delete from public.matches
      where id = '62100000-0000-4000-8000-000000000204';
      delete from public.teams
      where id in (
        '62100000-0000-4000-8000-000000000202',
        '62100000-0000-4000-8000-000000000203'
      );
      delete from public.competitions
      where id = '62100000-0000-4000-8000-000000000201';
      delete from auth.users
      where id in (
        '62100000-0000-4000-8000-000000000101',
        '62100000-0000-4000-8000-000000000102'
      );

      insert into auth.users (
        instance_id, id, aud, role, email, email_confirmed_at,
        raw_app_meta_data, raw_user_meta_data, created_at, updated_at
      )
      values
        (
          '00000000-0000-0000-0000-000000000000',
          '62100000-0000-4000-8000-000000000101',
          'authenticated', 'authenticated', 'b08-review-host@example.com',
          statement_timestamp(), '{}'::jsonb, '{}'::jsonb,
          statement_timestamp(), statement_timestamp()
        ),
        (
          '00000000-0000-0000-0000-000000000000',
          '62100000-0000-4000-8000-000000000102',
          'authenticated', 'authenticated', 'b08-review-admin@example.com',
          statement_timestamp(), '{}'::jsonb, '{}'::jsonb,
          statement_timestamp(), statement_timestamp()
        );

      update public.profiles
      set
        handle = case id
          when '62100000-0000-4000-8000-000000000101' then 'b08_review_host'
          else 'b08_review_admin'
        end,
        display_name = case id
          when '62100000-0000-4000-8000-000000000101' then 'B08 Review Host'
          else 'B08 Review Admin'
        end,
        city_id = (select id from public.cities where slug = 'haifa'),
        adult_attested_at = statement_timestamp(),
        rules_version = 1,
        rules_accepted_at = statement_timestamp(),
        profile_completed_at = statement_timestamp(),
        fan_enabled_at = statement_timestamp()
      where id in (
        '62100000-0000-4000-8000-000000000101',
        '62100000-0000-4000-8000-000000000102'
      );

      insert into public.competitions (
        id, sport_id, provider, provider_external_id, code, name,
        country_name, last_synced_at
      )
      values (
        '62100000-0000-4000-8000-000000000201',
        '00000000-0000-4000-8000-000000000020',
        'b08-review-race', 'competition', 'B08R',
        'B08 Review Race League', 'England', statement_timestamp()
      );

      insert into public.teams (
        id, sport_id, provider, provider_external_id, name, short_name,
        tla, country_name, last_synced_at
      )
      values
        (
          '62100000-0000-4000-8000-000000000202',
          '00000000-0000-4000-8000-000000000020',
          'b08-review-race', 'home-team', 'B08 Review Home FC',
          'B08 Home', 'BRH', 'England', statement_timestamp()
        ),
        (
          '62100000-0000-4000-8000-000000000203',
          '00000000-0000-4000-8000-000000000020',
          'b08-review-race', 'away-team', 'B08 Review Away FC',
          'B08 Away', 'BRA', 'England', statement_timestamp()
        );

      insert into public.matches (
        id, provider, provider_external_id, competition_id, home_team_id,
        away_team_id, starts_at, status, matchday, season_label, last_synced_at
      )
      values (
        '62100000-0000-4000-8000-000000000204',
        'b08-review-race', 'match',
        '62100000-0000-4000-8000-000000000201',
        '62100000-0000-4000-8000-000000000202',
        '62100000-0000-4000-8000-000000000203',
        statement_timestamp() + interval '7 days', 'timed', 1, '2026',
        statement_timestamp()
      );

      insert into public.groups (
        id, slug, name, owner_id, city_id, visibility, lifecycle,
        description, activated_at
      )
      values (
        '62100000-0000-4000-8000-000000000205',
        'b08-review-race-group', 'B08 Review Race Group',
        '62100000-0000-4000-8000-000000000102',
        (select id from public.cities where slug = 'haifa'),
        'unlisted', 'active',
        'A deterministic group for event review and block serialization.',
        statement_timestamp()
      );

      insert into public.group_memberships (
        group_id, user_id, role, status, reviewed_by, reviewed_at
      )
      values
        (
          '62100000-0000-4000-8000-000000000205',
          '62100000-0000-4000-8000-000000000102',
          'owner', 'active', null, null
        ),
        (
          '62100000-0000-4000-8000-000000000205',
          '62100000-0000-4000-8000-000000000101',
          'member', 'active',
          '62100000-0000-4000-8000-000000000102', statement_timestamp()
        );

      insert into public.events (
        id, created_by, host_user_id, organizing_group_id, match_id,
        title, description, expected_activity, cost_description,
        event_rules, commercial_affiliation, host_presence_confirmed_at,
        starts_at, ends_at, city_id, place_kind, audience,
        audience_group_id, capacity, requires_approval, status
      )
      values (
        '62100000-0000-4000-8000-000000000301',
        '62100000-0000-4000-8000-000000000101',
        '62100000-0000-4000-8000-000000000101',
        '62100000-0000-4000-8000-000000000205',
        '62100000-0000-4000-8000-000000000204',
        'B08 concurrent review event',
        'A pending private event used to serialize blocking and group review.',
        'Watch the full match together', 'Free admission',
        'Respect the host and every attendee.', 'No commercial affiliation',
        statement_timestamp(), statement_timestamp() + interval '7 days',
        statement_timestamp() + interval '7 days 3 hours',
        (select id from public.cities where slug = 'haifa'),
        'home', 'group', '62100000-0000-4000-8000-000000000205',
        6, true, 'pending_group_review'
      );

      insert into public.event_private_locations (
        event_id, address_text, directions, location
      )
      values (
        '62100000-0000-4000-8000-000000000301',
        '91 Protected Review Street, Haifa',
        'Use the private entrance after approval.',
        extensions.st_setsrid(
          extensions.st_makepoint(34.998, 32.812),
          4326
        )::extensions.geography
      );
    $remote$
  );
  perform extensions.dblink_disconnect('group_event_review_setup');
end;
$setup$;

-- Hold the host-to-reviewer block open after block_user has written it. The
-- review must wait on the same canonical pair, then deny the transition after
-- the block commits.
do $connections$
declare
  connection_text constant text :=
    'host=supabase_db_huddle port=5432 dbname=postgres user=postgres password=postgres sslmode=disable';
begin
  perform extensions.dblink_connect('group_event_block_worker', connection_text);
  perform extensions.dblink_connect('group_event_review_worker', connection_text);

  perform extensions.dblink_exec('group_event_block_worker', 'begin');
  perform extensions.dblink_exec('group_event_block_worker', 'set local role authenticated');
  perform extensions.dblink_exec(
    'group_event_block_worker',
    'set local "request.jwt.claim.sub" = ''62100000-0000-4000-8000-000000000101'''
  );

  perform extensions.dblink_exec('group_event_review_worker', 'begin');
  perform extensions.dblink_exec('group_event_review_worker', 'set local role authenticated');
  perform extensions.dblink_exec(
    'group_event_review_worker',
    'set local "request.jwt.claim.sub" = ''62100000-0000-4000-8000-000000000102'''
  );
end;
$connections$;

select is(
  extensions.dblink_send_query(
    'group_event_block_worker',
    $$select public.block_user('b08_review_admin', null)$$
  ),
  1,
  'the private host block starts in its own transaction'
);

select lives_ok(
  $$
    select block_created
    from extensions.dblink_get_result('group_event_block_worker')
      as result(block_created boolean)
  $$,
  'the private host block completes while retaining its pair lock'
);

do $drain_block$
begin
  perform block_created
  from extensions.dblink_get_result('group_event_block_worker')
    as result(block_created boolean);
end;
$drain_block$;

select is(
  extensions.dblink_send_query(
    'group_event_review_worker',
    $$
      select *
      from public.publish_group_event(
        '62100000-0000-4000-8000-000000000301',
        'approve',
        null
      )
    $$
  ),
  1,
  'the group review starts against the uncommitted host block'
);

do $allow_review_to_reach_pair_lock$
begin
  perform pg_sleep(0.2);
end;
$allow_review_to_reach_pair_lock$;

select is(
  extensions.dblink_is_busy('group_event_review_worker'),
  1,
  'the group review waits for block_user on the canonical host-reviewer pair'
);

do $commit_block$
begin
  perform extensions.dblink_exec('group_event_block_worker', 'commit');
end;
$commit_block$;

select throws_ok(
  $$
    select event_id, status, decision
    from extensions.dblink_get_result('group_event_review_worker')
      as result(event_id uuid, status text, decision text)
  $$,
  'P0001',
  'NOT_FOUND',
  'the group review denies the block committed ahead of it'
);

do $disconnect_workers$
begin
  perform extensions.dblink_disconnect('group_event_block_worker');
  perform extensions.dblink_disconnect('group_event_review_worker');
end;
$disconnect_workers$;

select is(
  (
    select count(*)
    from public.user_blocks
    where blocker_id = '62100000-0000-4000-8000-000000000101'
      and blocked_id = '62100000-0000-4000-8000-000000000102'
  ),
  1::bigint,
  'the private host block is committed'
);
select is(
  (
    select status::text
    from public.events
    where id = '62100000-0000-4000-8000-000000000301'
  ),
  'pending_group_review',
  'the rejected concurrent review leaves the event pending'
);
select is(
  (
    select count(*)
    from public.security_audit_events
    where actor_id = '62100000-0000-4000-8000-000000000102'
      and resource_id = '62100000-0000-4000-8000-000000000301'
      and action = 'event.group_review.approve'
  ),
  0::bigint,
  'the rejected concurrent review writes no success audit evidence'
);

do $cleanup$
declare
  connection_text constant text :=
    'host=supabase_db_huddle port=5432 dbname=postgres user=postgres password=postgres sslmode=disable';
begin
  perform extensions.dblink_connect('group_event_review_cleanup', connection_text);
  perform extensions.dblink_exec(
    'group_event_review_cleanup',
    $remote$
      delete from public.security_audit_events
      where actor_id in (
        '62100000-0000-4000-8000-000000000101',
        '62100000-0000-4000-8000-000000000102'
      );
      delete from public.user_blocks
      where blocker_id in (
        '62100000-0000-4000-8000-000000000101',
        '62100000-0000-4000-8000-000000000102'
      )
      or blocked_id in (
        '62100000-0000-4000-8000-000000000101',
        '62100000-0000-4000-8000-000000000102'
      );
      delete from public.event_private_locations
      where event_id = '62100000-0000-4000-8000-000000000301';
      delete from public.events
      where id = '62100000-0000-4000-8000-000000000301';
      delete from public.groups
      where id = '62100000-0000-4000-8000-000000000205';
      delete from public.matches
      where id = '62100000-0000-4000-8000-000000000204';
      delete from public.teams
      where id in (
        '62100000-0000-4000-8000-000000000202',
        '62100000-0000-4000-8000-000000000203'
      );
      delete from public.competitions
      where id = '62100000-0000-4000-8000-000000000201';
      delete from auth.users
      where id in (
        '62100000-0000-4000-8000-000000000101',
        '62100000-0000-4000-8000-000000000102'
      );
    $remote$
  );
  perform extensions.dblink_disconnect('group_event_review_cleanup');
end;
$cleanup$;

select * from finish();
rollback;
