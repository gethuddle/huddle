begin;

create extension if not exists pgtap with schema extensions;
create extension if not exists dblink with schema extensions;
set local search_path = extensions, public, pg_catalog;

select no_plan();

-- These credentials belong only to the disposable local Supabase database.
do $setup$
declare
  connection_text constant text :=
    'host=supabase_db_huddle port=5432 dbname=postgres user=postgres password=postgres sslmode=disable';
begin
  perform extensions.dblink_connect('account_erasure_setup', connection_text);
  perform extensions.dblink_exec(
    'account_erasure_setup',
    $remote$
      delete from public.security_audit_events
      where actor_id in (
        'e4010000-0000-4000-8000-000000000291',
        'e4010000-0000-4000-8000-000000000292'
      );
      delete from public.venue_follows
      where user_id in (
        'e4010000-0000-4000-8000-000000000291',
        'e4010000-0000-4000-8000-000000000292'
      );
      delete from public.subscriptions
      where user_id in (
        'e4010000-0000-4000-8000-000000000291',
        'e4010000-0000-4000-8000-000000000292'
      );
      delete from public.venues
      where id in (
        'e4010000-0000-4000-8000-000000000391',
        'e4010000-0000-4000-8000-000000000392'
      );
      delete from auth.users
      where id in (
        'e4010000-0000-4000-8000-000000000291',
        'e4010000-0000-4000-8000-000000000292'
      );

      insert into auth.users (
        instance_id, id, aud, role, email, email_confirmed_at,
        raw_app_meta_data, raw_user_meta_data, created_at, updated_at
      )
      values
        (
          '00000000-0000-0000-0000-000000000000',
          'e4010000-0000-4000-8000-000000000291',
          'authenticated', 'authenticated',
          'account-erasure-write-first@example.test', statement_timestamp(),
          '{}'::jsonb, '{}'::jsonb, statement_timestamp(), statement_timestamp()
        ),
        (
          '00000000-0000-0000-0000-000000000000',
          'e4010000-0000-4000-8000-000000000292',
          'authenticated', 'authenticated',
          'account-erasure-erase-first@example.test', statement_timestamp(),
          '{}'::jsonb, '{}'::jsonb, statement_timestamp(), statement_timestamp()
        );

      update public.profiles as profile
      set
        handle = case profile.id
          when 'e4010000-0000-4000-8000-000000000291'
            then 'erasure_write_first'
          else 'erasure_erase_first'
        end,
        display_name = case profile.id
          when 'e4010000-0000-4000-8000-000000000291'
            then 'Erasure Write First'
          else 'Erasure Erase First'
        end,
        adult_attested_at = statement_timestamp(),
        rules_version = private.current_rules_version(),
        rules_accepted_at = statement_timestamp(),
        profile_completed_at = statement_timestamp(),
        fan_enabled_at = statement_timestamp()
      where profile.id in (
        'e4010000-0000-4000-8000-000000000291',
        'e4010000-0000-4000-8000-000000000292'
      );

      insert into public.venues (
        id, owner_id, slug, name, address_text, location, description,
        stated_capacity, verification_status
      )
      values
        (
          'e4010000-0000-4000-8000-000000000391',
          'e4010000-0000-4000-8000-000000000291',
          'erasure-write-first-venue', 'Erasure Write First Venue',
          '21 Concurrency Street, Haifa',
          extensions.st_setsrid(
            extensions.st_makepoint(34.998, 32.812), 4326
          )::extensions.geography,
          'A Venue used for the write-before-erasure ordering.',
          50, 'unverified'
        ),
        (
          'e4010000-0000-4000-8000-000000000392',
          'e4010000-0000-4000-8000-000000000292',
          'erasure-erase-first-venue', 'Erasure Erase First Venue',
          '22 Concurrency Street, Haifa',
          extensions.st_setsrid(
            extensions.st_makepoint(34.999, 32.813), 4326
          )::extensions.geography,
          'A Venue used for the erasure-before-write ordering.',
          50, 'unverified'
        );
    $remote$
  );
  perform extensions.dblink_disconnect('account_erasure_setup');
end;
$setup$;

-- Ordering one: the follow writes own the canonical actor token first. Erasure
-- waits, then removes both committed rows before it returns.
do $write_first_connections$
declare
  connection_text constant text :=
    'host=supabase_db_huddle port=5432 dbname=postgres user=postgres password=postgres sslmode=disable';
begin
  perform extensions.dblink_connect('account_write_first', connection_text);
  perform extensions.dblink_connect('account_erase_second', connection_text);
  perform extensions.dblink_exec('account_write_first', 'begin');
  perform extensions.dblink_exec('account_erase_second', 'begin');
  perform extensions.dblink_exec('account_write_first', 'set local role authenticated');
  perform extensions.dblink_exec('account_erase_second', 'set local role authenticated');
  perform extensions.dblink_exec(
    'account_write_first',
    'set local "request.jwt.claim.sub" = ''e4010000-0000-4000-8000-000000000291'''
  );
  perform extensions.dblink_exec(
    'account_erase_second',
    'set local "request.jwt.claim.sub" = ''e4010000-0000-4000-8000-000000000291'''
  );
  perform extensions.dblink_exec(
    'account_write_first',
    $remote$
      insert into public.subscriptions (user_id, kind, sport_id)
      values (
        'e4010000-0000-4000-8000-000000000291',
        'sport', '00000000-0000-4000-8000-000000000020'
      );
      insert into public.venue_follows (user_id, venue_id)
      values (
        'e4010000-0000-4000-8000-000000000291',
        'e4010000-0000-4000-8000-000000000391'
      );
    $remote$
  );
end;
$write_first_connections$;

select is(
  extensions.dblink_send_query(
    'account_erase_second',
    $$select public.prepare_account_erasure('DELETE', null)$$
  ),
  1,
  'erasure starts while direct follow writes retain the actor token'
);

do $allow_erasure_to_wait$
begin
  perform pg_catalog.pg_sleep(0.2);
end;
$allow_erasure_to_wait$;

select is(
  extensions.dblink_is_busy('account_erase_second'),
  1,
  'erasure waits for the earlier direct follow transaction'
);

do $commit_write_first$
begin
  perform extensions.dblink_exec('account_write_first', 'commit');
end;
$commit_write_first$;

select lives_ok(
  $$
    select erased
    from extensions.dblink_get_result('account_erase_second')
      as result(erased boolean)
  $$,
  'erasure completes after the earlier writes commit'
);

do $finish_write_first_ordering$
begin
  perform erased
  from extensions.dblink_get_result('account_erase_second')
    as result(erased boolean);
  perform extensions.dblink_exec('account_erase_second', 'commit');
  perform extensions.dblink_disconnect('account_write_first');
  perform extensions.dblink_disconnect('account_erase_second');
end;
$finish_write_first_ordering$;

select is(
  (
    select
      (select count(*) from public.subscriptions
        where user_id = 'e4010000-0000-4000-8000-000000000291')
      + (select count(*) from public.venue_follows
        where user_id = 'e4010000-0000-4000-8000-000000000291')
  ),
  0::bigint,
  'writes committed before erasure leave no subscription or Venue-follow residue'
);

-- Ordering two: erasure performs cleanup and tombstoning while retaining the
-- actor token. Both direct inserts wait, then reject the committed tombstone.
do $erase_first_connections$
declare
  connection_text constant text :=
    'host=supabase_db_huddle port=5432 dbname=postgres user=postgres password=postgres sslmode=disable';
begin
  perform extensions.dblink_connect('account_erase_first', connection_text);
  perform extensions.dblink_connect('account_subscribe_after', connection_text);
  perform extensions.dblink_connect('account_follow_after', connection_text);
  perform extensions.dblink_exec('account_erase_first', 'begin');
  perform extensions.dblink_exec('account_subscribe_after', 'begin');
  perform extensions.dblink_exec('account_follow_after', 'begin');
  perform extensions.dblink_exec('account_erase_first', 'set local role authenticated');
  perform extensions.dblink_exec('account_subscribe_after', 'set local role authenticated');
  perform extensions.dblink_exec('account_follow_after', 'set local role authenticated');
  perform extensions.dblink_exec(
    'account_erase_first',
    'set local "request.jwt.claim.sub" = ''e4010000-0000-4000-8000-000000000292'''
  );
  perform extensions.dblink_exec(
    'account_subscribe_after',
    'set local "request.jwt.claim.sub" = ''e4010000-0000-4000-8000-000000000292'''
  );
  perform extensions.dblink_exec(
    'account_follow_after',
    'set local "request.jwt.claim.sub" = ''e4010000-0000-4000-8000-000000000292'''
  );
end;
$erase_first_connections$;

select lives_ok(
  $$
    select erased
    from extensions.dblink(
      'account_erase_first',
      'select public.prepare_account_erasure(''DELETE'', null)'
    ) as result(erased boolean)
  $$,
  'erasure performs cleanup while retaining its transaction actor token'
);

select is(
  extensions.dblink_send_query(
    'account_subscribe_after',
    $remote$
      insert into public.subscriptions (user_id, kind, sport_id)
      values (
        'e4010000-0000-4000-8000-000000000292',
        'sport', '00000000-0000-4000-8000-000000000020'
      )
      returning true
    $remote$
  ),
  1,
  'a concurrent subscription insert starts after erasure cleanup'
);
select is(
  extensions.dblink_send_query(
    'account_follow_after',
    $remote$
      insert into public.venue_follows (user_id, venue_id)
      values (
        'e4010000-0000-4000-8000-000000000292',
        'e4010000-0000-4000-8000-000000000392'
      )
      returning true
    $remote$
  ),
  1,
  'a concurrent Venue-follow insert starts after erasure cleanup'
);

do $allow_follow_writes_to_wait$
begin
  perform pg_catalog.pg_sleep(0.2);
end;
$allow_follow_writes_to_wait$;

select is(
  extensions.dblink_is_busy('account_subscribe_after'),
  1,
  'the subscription insert waits for the erasure actor token'
);
select is(
  extensions.dblink_is_busy('account_follow_after'),
  1,
  'the Venue-follow insert waits for the erasure actor token'
);

do $commit_erasure_first$
begin
  perform extensions.dblink_exec('account_erase_first', 'commit');
end;
$commit_erasure_first$;

select throws_ok(
  $$
    select inserted
    from extensions.dblink_get_result('account_subscribe_after')
      as result(inserted boolean)
  $$,
  'P0001', 'ACCOUNT_DELETED',
  'the serialized subscription insert rejects the committed tombstone'
);
select throws_ok(
  $$
    select inserted
    from extensions.dblink_get_result('account_follow_after')
      as result(inserted boolean)
  $$,
  'P0001', 'ACCOUNT_DELETED',
  'the serialized Venue-follow insert rejects the committed tombstone'
);

do $disconnect_erase_first_ordering$
begin
  perform extensions.dblink_disconnect('account_erase_first');
  perform extensions.dblink_disconnect('account_subscribe_after');
  perform extensions.dblink_disconnect('account_follow_after');
end;
$disconnect_erase_first_ordering$;

select is(
  (
    select
      (select count(*) from public.subscriptions
        where user_id = 'e4010000-0000-4000-8000-000000000292')
      + (select count(*) from public.venue_follows
        where user_id = 'e4010000-0000-4000-8000-000000000292')
  ),
  0::bigint,
  'writes attempted after erasure leave no subscription or Venue-follow residue'
);

do $cleanup$
declare
  connection_text constant text :=
    'host=supabase_db_huddle port=5432 dbname=postgres user=postgres password=postgres sslmode=disable';
begin
  perform extensions.dblink_connect('account_erasure_cleanup', connection_text);
  perform extensions.dblink_exec(
    'account_erasure_cleanup',
    $remote$
      delete from public.security_audit_events
      where actor_id in (
        'e4010000-0000-4000-8000-000000000291',
        'e4010000-0000-4000-8000-000000000292'
      );
      delete from public.venues
      where id in (
        'e4010000-0000-4000-8000-000000000391',
        'e4010000-0000-4000-8000-000000000392'
      );
      delete from auth.users
      where id in (
        'e4010000-0000-4000-8000-000000000291',
        'e4010000-0000-4000-8000-000000000292'
      );
    $remote$
  );
  perform extensions.dblink_disconnect('account_erasure_cleanup');
end;
$cleanup$;

select * from finish();
rollback;
