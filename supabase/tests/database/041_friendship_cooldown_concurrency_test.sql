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
  perform extensions.dblink_connect('friendship_cooldown_setup', connection_text);
  perform extensions.dblink_exec(
    'friendship_cooldown_setup',
    $remote$
      delete from public.security_audit_events
      where actor_id in (
        '51000000-0000-4000-8000-000000000101',
        '51000000-0000-4000-8000-000000000102',
        '51000000-0000-4000-8000-000000000103'
      );

      delete from public.user_blocks
      where blocker_id in (
        '51000000-0000-4000-8000-000000000101',
        '51000000-0000-4000-8000-000000000102',
        '51000000-0000-4000-8000-000000000103'
      )
      or blocked_id in (
        '51000000-0000-4000-8000-000000000101',
        '51000000-0000-4000-8000-000000000102',
        '51000000-0000-4000-8000-000000000103'
      );

      delete from public.friendships
      where user_low_id in (
        '51000000-0000-4000-8000-000000000101',
        '51000000-0000-4000-8000-000000000102',
        '51000000-0000-4000-8000-000000000103'
      )
      or user_high_id in (
        '51000000-0000-4000-8000-000000000101',
        '51000000-0000-4000-8000-000000000102',
        '51000000-0000-4000-8000-000000000103'
      );

      delete from auth.users
      where id in (
        '51000000-0000-4000-8000-000000000101',
        '51000000-0000-4000-8000-000000000102',
        '51000000-0000-4000-8000-000000000103'
      );

      insert into auth.users (
        instance_id,
        id,
        aud,
        role,
        email,
        email_confirmed_at,
        raw_app_meta_data,
        raw_user_meta_data,
        created_at,
        updated_at
      )
      values
        (
          '00000000-0000-0000-0000-000000000000',
          '51000000-0000-4000-8000-000000000101',
          'authenticated',
          'authenticated',
          'b05-concurrency-actor@example.com',
          statement_timestamp(),
          '{}'::jsonb,
          '{}'::jsonb,
          statement_timestamp(),
          statement_timestamp()
        ),
        (
          '00000000-0000-0000-0000-000000000000',
          '51000000-0000-4000-8000-000000000102',
          'authenticated',
          'authenticated',
          'b05-concurrency-target-a@example.com',
          statement_timestamp(),
          '{}'::jsonb,
          '{}'::jsonb,
          statement_timestamp(),
          statement_timestamp()
        ),
        (
          '00000000-0000-0000-0000-000000000000',
          '51000000-0000-4000-8000-000000000103',
          'authenticated',
          'authenticated',
          'b05-concurrency-target-b@example.com',
          statement_timestamp(),
          '{}'::jsonb,
          '{}'::jsonb,
          statement_timestamp(),
          statement_timestamp()
        );

      update public.profiles
      set handle = case id
            when '51000000-0000-4000-8000-000000000101' then 'b05_race_actor'
            when '51000000-0000-4000-8000-000000000102' then 'b05_race_target_a'
            when '51000000-0000-4000-8000-000000000103' then 'b05_race_target_b'
          end,
          display_name = case id
            when '51000000-0000-4000-8000-000000000101' then 'Race Actor'
            when '51000000-0000-4000-8000-000000000102' then 'Race Target A'
            when '51000000-0000-4000-8000-000000000103' then 'Race Target B'
          end,
          adult_attested_at = statement_timestamp(),
          rules_version = 1,
          rules_accepted_at = statement_timestamp(),
          profile_completed_at = statement_timestamp(),
          fan_enabled_at = statement_timestamp()
      where id in (
        '51000000-0000-4000-8000-000000000101',
        '51000000-0000-4000-8000-000000000102',
        '51000000-0000-4000-8000-000000000103'
      );
    $remote$
  );
  perform extensions.dblink_disconnect('friendship_cooldown_setup');
end;
$setup$;

do $connections$
declare
  connection_text constant text :=
    'host=supabase_db_huddle port=5432 dbname=postgres user=postgres password=postgres sslmode=disable';
begin
  perform extensions.dblink_connect('friendship_cooldown_a', connection_text);
  perform extensions.dblink_connect('friendship_cooldown_b', connection_text);

  perform extensions.dblink_exec('friendship_cooldown_a', 'begin');
  perform extensions.dblink_exec('friendship_cooldown_a', 'set local role authenticated');
  perform extensions.dblink_exec(
    'friendship_cooldown_a',
    'set local "request.jwt.claim.sub" = ''51000000-0000-4000-8000-000000000101'''
  );

  perform extensions.dblink_exec('friendship_cooldown_b', 'begin');
  perform extensions.dblink_exec('friendship_cooldown_b', 'set local role authenticated');
  perform extensions.dblink_exec(
    'friendship_cooldown_b',
    'set local "request.jwt.claim.sub" = ''51000000-0000-4000-8000-000000000101'''
  );
end;
$connections$;

select is(
  extensions.dblink_send_query(
    'friendship_cooldown_a',
    $$select public.request_friendship('51000000-0000-4000-8000-000000000102', null)$$
  ),
  1,
  'the first friendship request starts in its own transaction'
);

select lives_ok(
  $$
    select friendship_id
    from extensions.dblink_get_result('friendship_cooldown_a')
      as result(friendship_id uuid)
  $$,
  'the first concurrent friendship request succeeds'
);

-- Drain the asynchronous connection before issuing COMMIT while deliberately
-- retaining its transaction-scoped actor lock.
do $drain_first$
begin
  perform friendship_id
  from extensions.dblink_get_result('friendship_cooldown_a')
    as result(friendship_id uuid);
end;
$drain_first$;

select is(
  extensions.dblink_send_query(
    'friendship_cooldown_b',
    $$select public.request_friendship('51000000-0000-4000-8000-000000000103', null)$$
  ),
  1,
  'a second target request starts concurrently for the same actor'
);

do $allow_second_to_reach_lock$
begin
  perform pg_sleep(0.2);
end;
$allow_second_to_reach_lock$;

select is(
  extensions.dblink_is_busy('friendship_cooldown_b'),
  1,
  'the second same-actor request waits for the first transaction'
);

do $commit_first$
begin
  perform extensions.dblink_exec('friendship_cooldown_a', 'commit');
end;
$commit_first$;

select throws_ok(
  $$
    select friendship_id
    from extensions.dblink_get_result('friendship_cooldown_b')
      as result(friendship_id uuid)
  $$,
  'P0001',
  'RATE_LIMITED',
  'the serialized second request observes committed cooldown evidence'
);

do $disconnect_workers$
begin
  perform extensions.dblink_disconnect('friendship_cooldown_a');
  perform extensions.dblink_disconnect('friendship_cooldown_b');
end;
$disconnect_workers$;

select is(
  (
    select count(*)
    from public.friendships
    where requested_by = '51000000-0000-4000-8000-000000000101'
  ),
  1::bigint,
  'only one concurrent friendship request is persisted'
);

select is(
  (
    select count(*)
    from public.security_audit_events
    where actor_id = '51000000-0000-4000-8000-000000000101'
      and action = 'friendship.request'
  ),
  1::bigint,
  'only one cooldown audit record is persisted'
);

-- Hold a committed-direction block open in one transaction. The friendship
-- request in the other transaction must wait for the same canonical-pair lock,
-- then re-check the now-committed block before attempting an insert.
do $block_connections$
declare
  connection_text constant text :=
    'host=supabase_db_huddle port=5432 dbname=postgres user=postgres password=postgres sslmode=disable';
begin
  perform extensions.dblink_connect('friendship_block_worker', connection_text);
  perform extensions.dblink_connect('friendship_request_worker', connection_text);

  perform extensions.dblink_exec('friendship_block_worker', 'begin');
  perform extensions.dblink_exec('friendship_block_worker', 'set local role authenticated');
  perform extensions.dblink_exec(
    'friendship_block_worker',
    'set local "request.jwt.claim.sub" = ''51000000-0000-4000-8000-000000000103'''
  );

  perform extensions.dblink_exec('friendship_request_worker', 'begin');
  perform extensions.dblink_exec('friendship_request_worker', 'set local role authenticated');
  perform extensions.dblink_exec(
    'friendship_request_worker',
    'set local "request.jwt.claim.sub" = ''51000000-0000-4000-8000-000000000102'''
  );
end;
$block_connections$;

select is(
  extensions.dblink_send_query(
    'friendship_block_worker',
    $$select public.block_user('b05_race_target_a', null)$$
  ),
  1,
  'a directional block starts in its own transaction'
);

select lives_ok(
  $$
    select block_created
    from extensions.dblink_get_result('friendship_block_worker')
      as result(block_created boolean)
  $$,
  'the block mutation completes while retaining its transaction lock'
);

do $drain_block$
begin
  perform block_created
  from extensions.dblink_get_result('friendship_block_worker')
    as result(block_created boolean);
end;
$drain_block$;

select is(
  extensions.dblink_send_query(
    'friendship_request_worker',
    $$select public.request_friendship('51000000-0000-4000-8000-000000000103', null)$$
  ),
  1,
  'a friendship request starts concurrently against the uncommitted blocker'
);

do $allow_request_to_reach_pair_lock$
begin
  perform pg_sleep(0.2);
end;
$allow_request_to_reach_pair_lock$;

select is(
  extensions.dblink_is_busy('friendship_request_worker'),
  1,
  'the request waits for the block transaction on the shared canonical pair'
);

do $commit_block$
begin
  perform extensions.dblink_exec('friendship_block_worker', 'commit');
end;
$commit_block$;

select throws_ok(
  $$
    select friendship_id
    from extensions.dblink_get_result('friendship_request_worker')
      as result(friendship_id uuid)
  $$,
  'P0001',
  'BLOCKED_RELATIONSHIP',
  'the request re-checks and rejects the block committed ahead of it'
);

do $disconnect_block_workers$
begin
  perform extensions.dblink_disconnect('friendship_block_worker');
  perform extensions.dblink_disconnect('friendship_request_worker');
end;
$disconnect_block_workers$;

select is(
  (
    select count(*)
    from public.user_blocks
    where blocker_id = '51000000-0000-4000-8000-000000000103'
      and blocked_id = '51000000-0000-4000-8000-000000000102'
  ),
  1::bigint,
  'the directional block is persisted'
);

select is(
  (
    select count(*)
    from public.friendships
    where user_low_id = '51000000-0000-4000-8000-000000000102'
      and user_high_id = '51000000-0000-4000-8000-000000000103'
  ),
  0::bigint,
  'no friendship can coexist with the concurrently committed block'
);

do $cleanup$
declare
  connection_text constant text :=
    'host=supabase_db_huddle port=5432 dbname=postgres user=postgres password=postgres sslmode=disable';
begin
  perform extensions.dblink_connect('friendship_cooldown_cleanup', connection_text);
  perform extensions.dblink_exec(
    'friendship_cooldown_cleanup',
    $remote$
      delete from public.security_audit_events
      where actor_id in (
        '51000000-0000-4000-8000-000000000101',
        '51000000-0000-4000-8000-000000000102',
        '51000000-0000-4000-8000-000000000103'
      );

      delete from public.user_blocks
      where blocker_id in (
        '51000000-0000-4000-8000-000000000101',
        '51000000-0000-4000-8000-000000000102',
        '51000000-0000-4000-8000-000000000103'
      )
      or blocked_id in (
        '51000000-0000-4000-8000-000000000101',
        '51000000-0000-4000-8000-000000000102',
        '51000000-0000-4000-8000-000000000103'
      );

      delete from public.friendships
      where user_low_id in (
        '51000000-0000-4000-8000-000000000101',
        '51000000-0000-4000-8000-000000000102',
        '51000000-0000-4000-8000-000000000103'
      )
      or user_high_id in (
        '51000000-0000-4000-8000-000000000101',
        '51000000-0000-4000-8000-000000000102',
        '51000000-0000-4000-8000-000000000103'
      );

      delete from auth.users
      where id in (
        '51000000-0000-4000-8000-000000000101',
        '51000000-0000-4000-8000-000000000102',
        '51000000-0000-4000-8000-000000000103'
      );
    $remote$
  );
  perform extensions.dblink_disconnect('friendship_cooldown_cleanup');
end;
$cleanup$;

select * from finish();
rollback;
