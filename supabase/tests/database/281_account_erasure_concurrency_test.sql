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
      delete from private.venue_billing_entitlements
      where venue_id in (
        'e4010000-0000-4000-8000-000000000391',
        'e4010000-0000-4000-8000-000000000392',
        'e4010000-0000-4000-8000-000000000393'
      );
      delete from public.venues
      where id in (
        'e4010000-0000-4000-8000-000000000391',
        'e4010000-0000-4000-8000-000000000392',
        'e4010000-0000-4000-8000-000000000393'
      );
      delete from private.polar_account_erasure_cleanup where actor_id in ('e4010000-0000-4000-8000-000000000291','e4010000-0000-4000-8000-000000000292');
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

-- These exact synthetic venues exercise public or publishing behavior.
update private.venue_billing_entitlements set status='active',interval='month',interval_count=1,
  polar_customer_id='fixture-customer',polar_subscription_id='fixture-'||venue_id::text,
  polar_product_id='fixture-product',polar_product_price_id='fixture-price',amount=1500,currency='ils',
  paid_through_at=statement_timestamp()+interval '365 days',first_activated_at=statement_timestamp()
where venue_id in ('e4010000-0000-4000-8000-000000000391','e4010000-0000-4000-8000-000000000392');
      insert into public.venues(id,owner_id,slug,name,address_text,location,description)
      values('e4010000-0000-4000-8000-000000000393','e4010000-0000-4000-8000-000000000291',
        'erasure-second-owned-venue','Second Owned Venue','23 Concurrency Street, Haifa',
        extensions.st_setsrid(extensions.st_makepoint(34.998,32.812),4326)::extensions.geography,
        'A second private venue proves sorted multi-venue erasure locking.');
    $remote$
  );
  perform extensions.dblink_disconnect('account_erasure_setup');
end;
$setup$;

-- Hold the venue token on a separate connection. A waiting actor RPC must
-- hold its actor token, but must not yet hold profile/product row locks.
create temporary table billing_lock_evidence(label text,waiting boolean,profile_unlocked boolean,actor_locked boolean,sorted_venues boolean,completed boolean);
do $lock_order$
declare
  connection_text text := 'host=supabase_db_huddle port=5432 dbname=postgres user=postgres password=postgres sslmode=disable';
  scenario record;
  worker_pid integer;
  actor_key bigint;
  first_venue_key bigint:=pg_catalog.hashtextextended('e4010000-0000-4000-8000-000000000391',4105);
  saw_wait boolean;
  row_free boolean;
  actor_held boolean;
  sorted_held boolean;
  finished boolean;
begin
  perform extensions.dblink_connect('billing_holder',connection_text);
  perform extensions.dblink_connect('billing_worker',connection_text);
  perform extensions.dblink_connect('billing_probe',connection_text);
  select pid into worker_pid from extensions.dblink('billing_worker','select pg_backend_pid()') as t(pid integer);
  for scenario in select * from (values
    ('billing context','e4010000-0000-4000-8000-000000000291','e4010000-0000-4000-8000-000000000391',
      $$select true from public.get_venue_billing_context('e4010000-0000-4000-8000-000000000391')$$),
    ('checkout reservation','e4010000-0000-4000-8000-000000000291','e4010000-0000-4000-8000-000000000393',
      $$select true from public.reserve_venue_billing_checkout('e4010000-0000-4000-8000-000000000393','month',null)$$),
    ('venue follow','e4010000-0000-4000-8000-000000000292','e4010000-0000-4000-8000-000000000391',
      $$select public.follow_venue('e4010000-0000-4000-8000-000000000391',null)$$),
    ('multi-venue erasure','e4010000-0000-4000-8000-000000000291','e4010000-0000-4000-8000-000000000393',
      $$select prepared from public.prepare_account_erasure_v2('DELETE',null)$$)
  ) as cases(label,actor_id,venue_id,query_text) loop
    perform extensions.dblink_exec('billing_holder','begin');
    perform extensions.dblink_exec('billing_holder',format('do $hold$ begin perform private.lock_venue_billing(%L); end; $hold$',scenario.venue_id));
    perform extensions.dblink_exec('billing_worker','begin');
    perform extensions.dblink_exec('billing_worker','set local statement_timeout=''5s''');
    perform extensions.dblink_exec('billing_worker','set local role authenticated');
    perform extensions.dblink_exec('billing_worker',format('set local "request.jwt.claim.sub"=%L',scenario.actor_id));
    perform extensions.dblink_send_query('billing_worker',scenario.query_text);
    for attempt in 1..100 loop
      exit when exists(select 1 from pg_catalog.pg_locks where pid=worker_pid and locktype='advisory' and not granted);
      perform pg_catalog.pg_sleep(0.01);
    end loop;
    saw_wait:=extensions.dblink_is_busy('billing_worker')=1;
    begin
      select result into row_free from extensions.dblink('billing_probe',format('select true from public.profiles where id=%L for update nowait',scenario.actor_id)) as t(result boolean);
    exception when others then row_free:=false;
    end;
    actor_key:=pg_catalog.hashtextextended(scenario.actor_id,4104);
    actor_held:=exists(select 1 from pg_catalog.pg_locks where pid=worker_pid and locktype='advisory' and granted and classid=((actor_key>>32) & 4294967295)::oid and objid=(actor_key & 4294967295)::oid);
    sorted_held:=scenario.label<>'multi-venue erasure' or exists(select 1 from pg_catalog.pg_locks where pid=worker_pid and locktype='advisory' and granted and classid=((first_venue_key>>32) & 4294967295)::oid and objid=(first_venue_key & 4294967295)::oid);
    perform extensions.dblink_exec('billing_holder','rollback');
    select result into finished from extensions.dblink_get_result('billing_worker') as t(result boolean);
    perform result from extensions.dblink_get_result('billing_worker') as t(result boolean);
    perform extensions.dblink_exec('billing_worker','rollback');
    insert into billing_lock_evidence values(scenario.label,saw_wait,row_free,actor_held,sorted_held,finished);
  end loop;
  perform extensions.dblink_disconnect('billing_holder');
  perform extensions.dblink_disconnect('billing_worker');
  perform extensions.dblink_disconnect('billing_probe');
end;
$lock_order$;
select ok(waiting,label||' waits for the common venue token') from billing_lock_evidence;
select ok(profile_unlocked,label||' acquires venue token before profile rows') from billing_lock_evidence;
select ok(actor_locked,label||' holds actor serializer before waiting for venue') from billing_lock_evidence;
select ok(sorted_venues,'erasure holds the lower UUID venue before waiting on the higher UUID') from billing_lock_evidence where label='multi-venue erasure';
select ok(completed,label||' completes after release without a deadlock') from billing_lock_evidence;

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
      do $follow$ begin perform public.follow_venue('e4010000-0000-4000-8000-000000000391',null); end; $follow$;
    $remote$
  );
end;
$write_first_connections$;

select is(
  extensions.dblink_send_query(
    'account_erase_second',
    $$select prepared from public.prepare_account_erasure_v2('DELETE', null)$$
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
      'select prepared from public.prepare_account_erasure_v2(''DELETE'', null)'
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
      select public.follow_venue('e4010000-0000-4000-8000-000000000392',null)
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
  'P0001', 'AUTH_REQUIRED',
  'the serialized Venue-follow RPC rejects the committed tombstone'
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
      delete from private.venue_billing_entitlements
      where venue_id in (
        'e4010000-0000-4000-8000-000000000391',
        'e4010000-0000-4000-8000-000000000392',
        'e4010000-0000-4000-8000-000000000393'
      );
      delete from public.venues
      where id in (
        'e4010000-0000-4000-8000-000000000391',
        'e4010000-0000-4000-8000-000000000392',
        'e4010000-0000-4000-8000-000000000393'
      );
      delete from private.polar_account_erasure_cleanup where actor_id in ('e4010000-0000-4000-8000-000000000291','e4010000-0000-4000-8000-000000000292');
      delete from auth.users where id in ('e4010000-0000-4000-8000-000000000291','e4010000-0000-4000-8000-000000000292');
    $remote$
  );
  perform extensions.dblink_disconnect('account_erasure_cleanup');
end;
$cleanup$;

select * from finish();
rollback;
