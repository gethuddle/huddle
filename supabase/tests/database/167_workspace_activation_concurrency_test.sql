begin;

create extension if not exists pgtap with schema extensions;
create extension if not exists dblink with schema extensions;
set local search_path = extensions, public, pg_catalog;

select no_plan();

select isnt(
  to_regprocedure('private.serialize_actor_transaction()'),
  null::regprocedure,
  'workspace activation has one actor-derived transaction serialization helper'
);
select ok(
  position(
    'actor_id uuid := auth.uid()' in
    coalesce(pg_get_functiondef(to_regprocedure('private.serialize_actor_transaction()')), '')
  ) > 0,
  'the serialization key derives only from the authenticated actor'
);
select ok(
  position(
    'private.serialize_actor_transaction()' in
    pg_get_functiondef(to_regprocedure('private.assert_actor(boolean)'))
  ) > 0,
  'the reusable actor assertion acquires the shared transaction serialization token'
);
select ok(
  position(
    'private.serialize_actor_transaction()' in
    pg_get_functiondef(to_regprocedure('private.assert_common_onboarding_actor()'))
  ) > 0,
  'common onboarding uses the same actor transaction serialization order'
);

-- These credentials belong only to the disposable local Supabase database.
do $setup$
declare
  connection_text constant text :=
    format('host=%s port=5432 dbname=postgres user=postgres password=postgres sslmode=disable', host(inet_server_addr()));
begin
  perform extensions.dblink_connect('workspace_activation_setup', connection_text);
  perform extensions.dblink_exec(
    'workspace_activation_setup',
    $remote$
      delete from private.venue_billing_entitlements as entitlement
      using public.venues as venue
      where entitlement.venue_id = venue.id
        and venue.owner_id in (
          'e4020000-0000-4000-8000-000000000101',
          'e4020000-0000-4000-8000-000000000102',
          'e4020000-0000-4000-8000-000000000103'
        );
      delete from public.venues
      where owner_id in (
        'e4020000-0000-4000-8000-000000000101',
        'e4020000-0000-4000-8000-000000000102',
        'e4020000-0000-4000-8000-000000000103'
      );

      delete from auth.users
      where id in (
        'e4020000-0000-4000-8000-000000000101',
        'e4020000-0000-4000-8000-000000000102',
        'e4020000-0000-4000-8000-000000000103'
      );

      insert into auth.users (
        instance_id, id, aud, role, email, email_confirmed_at,
        raw_app_meta_data, raw_user_meta_data, created_at, updated_at
      )
      select
        '00000000-0000-0000-0000-000000000000',
        fixture.id,
        'authenticated',
        'authenticated',
        fixture.email,
        statement_timestamp(),
        '{}'::jsonb,
        '{}'::jsonb,
        statement_timestamp(),
        statement_timestamp()
      from (
        values
          ('e4020000-0000-4000-8000-000000000101'::uuid, 'fan-activation-concurrency@example.com'),
          ('e4020000-0000-4000-8000-000000000102'::uuid, 'venue-activation-concurrency@example.com'),
          ('e4020000-0000-4000-8000-000000000103'::uuid, 'cross-activation-concurrency@example.com')
      ) as fixture(id, email);
    $remote$
  );
  perform extensions.dblink_disconnect('workspace_activation_setup');
end;
$setup$;

-- Duplicate Fan activations used to deadlock: both sessions held the profile
-- SHARE lock from assert_actor(false), then each upgraded to UPDATE. The first
-- session deliberately retains that assertion lock while the second starts the
-- real RPC, then both submit the same idempotent activation.
do $fan_connections$
declare
  connection_text constant text :=
    format('host=%s port=5432 dbname=postgres user=postgres password=postgres sslmode=disable', host(inet_server_addr()));
begin
  perform extensions.dblink_connect('workspace_fan_first', connection_text);
  perform extensions.dblink_connect('workspace_fan_second', connection_text);
  perform extensions.dblink_exec('workspace_fan_first', 'begin');
  perform extensions.dblink_exec('workspace_fan_second', 'begin');
  perform extensions.dblink_exec(
    'workspace_fan_first',
    'set local "request.jwt.claim.sub" = ''e4020000-0000-4000-8000-000000000101'''
  );
  perform extensions.dblink_exec(
    'workspace_fan_second',
    'set local "request.jwt.claim.sub" = ''e4020000-0000-4000-8000-000000000101'''
  );

  perform actor_id
  from extensions.dblink(
    'workspace_fan_first',
    'select private.assert_actor(false)'
  ) as result(actor_id uuid);

  perform extensions.dblink_exec('workspace_fan_first', 'set local role authenticated');
  perform extensions.dblink_exec('workspace_fan_second', 'set local role authenticated');
end;
$fan_connections$;

select is(
  extensions.dblink_send_query(
    'workspace_fan_second',
    $remote$
      select * from public.activate_fan_workspace(
        'concurrent_fan', 'Concurrent Fan',
        'One Fan identity activated by duplicate submissions.', true, 1, null
      )
    $remote$
  ),
  1,
  'the duplicate Fan activation starts in a second real transaction'
);

do $allow_fan_to_reach_actor_lock$
begin
  perform pg_sleep(0.2);
end;
$allow_fan_to_reach_actor_lock$;

select is(
  extensions.dblink_is_busy('workspace_fan_second'),
  1,
  'the duplicate Fan activation waits behind the first actor transaction'
);

select lives_ok(
  $assert_fan_first$
    select handle, profile_completed_at, fan_enabled_at
    from extensions.dblink(
      'workspace_fan_first',
      $remote$
        select * from public.activate_fan_workspace(
          'concurrent_fan', 'Concurrent Fan',
          'One Fan identity activated by duplicate submissions.', true, 1, null
        )
      $remote$
    ) as result(
      handle text,
      profile_completed_at timestamptz,
      fan_enabled_at timestamptz
    )
  $assert_fan_first$,
  'the first Fan activation completes without a lock-upgrade deadlock'
);

do $finish_fan_first$
begin
  perform extensions.dblink_exec('workspace_fan_first', 'commit');
end;
$finish_fan_first$;

select lives_ok(
  $assert_fan_second$
    select handle, profile_completed_at, fan_enabled_at
    from extensions.dblink_get_result('workspace_fan_second') as result(
      handle text,
      profile_completed_at timestamptz,
      fan_enabled_at timestamptz
    )
  $assert_fan_second$,
  'the serialized duplicate Fan activation is idempotent and deadlock-free'
);

do $finish_fan_connections$
begin
  perform handle, profile_completed_at, fan_enabled_at
  from extensions.dblink_get_result('workspace_fan_second') as result(
    handle text,
    profile_completed_at timestamptz,
    fan_enabled_at timestamptz
  );
  perform extensions.dblink_exec('workspace_fan_second', 'commit');
  perform extensions.dblink_disconnect('workspace_fan_first');
  perform extensions.dblink_disconnect('workspace_fan_second');
exception when others then
  begin
    perform extensions.dblink_exec('workspace_fan_first', 'rollback');
  exception when others then null;
  end;
  begin
    perform extensions.dblink_exec('workspace_fan_second', 'rollback');
  exception when others then null;
  end;
  begin
    perform extensions.dblink_disconnect('workspace_fan_first');
  exception when others then null;
  end;
  begin
    perform extensions.dblink_disconnect('workspace_fan_second');
  exception when others then null;
  end;
end;
$finish_fan_connections$;

select is(
  (
    select count(*)
    from public.profiles
    where id = 'e4020000-0000-4000-8000-000000000101'
      and handle = 'concurrent_fan'
      and profile_completed_at is not null
      and fan_enabled_at is not null
  ),
  1::bigint,
  'duplicate Fan activation leaves exactly one enabled Fan identity'
);

-- Duplicate Venue activation serializes on the actor before either transaction
-- takes a profile lock. The first creates the business workspace; the second
-- deterministically observes the existing slug rather than deadlocking.
do $venue_connections$
declare
  connection_text constant text :=
    format('host=%s port=5432 dbname=postgres user=postgres password=postgres sslmode=disable', host(inet_server_addr()));
begin
  perform extensions.dblink_connect('workspace_venue_first', connection_text);
  perform extensions.dblink_connect('workspace_venue_second', connection_text);
  perform extensions.dblink_exec('workspace_venue_first', 'begin');
  perform extensions.dblink_exec('workspace_venue_second', 'begin');
  perform extensions.dblink_exec(
    'workspace_venue_first',
    'set local "request.jwt.claim.sub" = ''e4020000-0000-4000-8000-000000000102'''
  );
  perform extensions.dblink_exec(
    'workspace_venue_second',
    'set local "request.jwt.claim.sub" = ''e4020000-0000-4000-8000-000000000102'''
  );

  perform actor_id
  from extensions.dblink(
    'workspace_venue_first',
    'select private.assert_actor(false)'
  ) as result(actor_id uuid);

  perform extensions.dblink_exec('workspace_venue_first', 'set local role authenticated');
  perform extensions.dblink_exec('workspace_venue_second', 'set local role authenticated');
end;
$venue_connections$;

select is(
  extensions.dblink_send_query(
    'workspace_venue_second',
    $remote$
      select * from public.create_venue_workspace(
        'Concurrent Venue', 'concurrent-venue',
        '42 Concurrent Street, Haifa', 34.999, 32.813,
        'One business workspace activated by duplicate submissions.',
        'Main room', 60, array[]::text[], '', false, true, true, 1, null
      )
    $remote$
  ),
  1,
  'the duplicate Venue activation starts in a second real transaction'
);

do $allow_venue_to_reach_actor_lock$
begin
  perform pg_sleep(0.2);
end;
$allow_venue_to_reach_actor_lock$;

select is(
  extensions.dblink_is_busy('workspace_venue_second'),
  1,
  'the duplicate Venue activation waits behind the first actor transaction'
);

select lives_ok(
  $assert_venue_first$
    select venue_id, slug, verification_status
    from extensions.dblink(
      'workspace_venue_first',
      $remote$
        select * from public.create_venue_workspace(
          'Concurrent Venue', 'concurrent-venue',
          '42 Concurrent Street, Haifa', 34.999, 32.813,
          'One business workspace activated by duplicate submissions.',
          'Main room', 60, array[]::text[], '', false, true, true, 1, null
        )
      $remote$
    ) as result(venue_id uuid, slug text, verification_status text)
  $assert_venue_first$,
  'the first Venue activation completes without a lock-upgrade deadlock'
);

do $finish_venue_first$
begin
  perform extensions.dblink_exec('workspace_venue_first', 'commit');
end;
$finish_venue_first$;

select throws_ok(
  $assert_venue_second$
    select venue_id, slug, verification_status
    from extensions.dblink_get_result('workspace_venue_second') as result(
      venue_id uuid,
      slug text,
      verification_status text
    )
  $assert_venue_second$,
  'P0001',
  'VENUE_SLUG_UNAVAILABLE',
  'the serialized duplicate Venue activation returns the stable idempotency conflict'
);

do $finish_venue_connections$
begin
  begin
    perform venue_id, slug, verification_status
    from extensions.dblink_get_result('workspace_venue_second') as result(
      venue_id uuid,
      slug text,
      verification_status text
    );
  exception when others then null;
  end;
  perform extensions.dblink_exec('workspace_venue_second', 'rollback');
  perform extensions.dblink_disconnect('workspace_venue_first');
  perform extensions.dblink_disconnect('workspace_venue_second');
exception when others then
  begin
    perform extensions.dblink_exec('workspace_venue_first', 'rollback');
  exception when others then null;
  end;
  begin
    perform extensions.dblink_exec('workspace_venue_second', 'rollback');
  exception when others then null;
  end;
  begin
    perform extensions.dblink_disconnect('workspace_venue_first');
  exception when others then null;
  end;
  begin
    perform extensions.dblink_disconnect('workspace_venue_second');
  exception when others then null;
  end;
end;
$finish_venue_connections$;

select is(
  (
    select count(*)
    from public.venues
    where owner_id = 'e4020000-0000-4000-8000-000000000102'
      and slug = 'concurrent-venue'
  ),
  1::bigint,
  'duplicate Venue activation persists exactly one Venue workspace'
);
select is(
  (
    select count(*)
    from public.venue_spaces as space
    join public.venues as venue on venue.id = space.venue_id
    where venue.owner_id = 'e4020000-0000-4000-8000-000000000102'
  ),
  1::bigint,
  'duplicate Venue activation persists exactly one initial area'
);

-- Fan and Venue activation are different workflows, but they mutate the same
-- actor profile. They therefore use the same actor token and cannot recreate
-- the cross-flow SHARE-to-UPDATE deadlock.
do $cross_connections$
declare
  connection_text constant text :=
    format('host=%s port=5432 dbname=postgres user=postgres password=postgres sslmode=disable', host(inet_server_addr()));
begin
  perform extensions.dblink_connect('workspace_cross_fan', connection_text);
  perform extensions.dblink_connect('workspace_cross_venue', connection_text);
  perform extensions.dblink_exec('workspace_cross_fan', 'begin');
  perform extensions.dblink_exec('workspace_cross_venue', 'begin');
  perform extensions.dblink_exec(
    'workspace_cross_fan',
    'set local "request.jwt.claim.sub" = ''e4020000-0000-4000-8000-000000000103'''
  );
  perform extensions.dblink_exec(
    'workspace_cross_venue',
    'set local "request.jwt.claim.sub" = ''e4020000-0000-4000-8000-000000000103'''
  );

  perform actor_id
  from extensions.dblink(
    'workspace_cross_fan',
    'select private.assert_actor(false)'
  ) as result(actor_id uuid);

  perform extensions.dblink_exec('workspace_cross_fan', 'set local role authenticated');
  perform extensions.dblink_exec('workspace_cross_venue', 'set local role authenticated');
end;
$cross_connections$;

select is(
  extensions.dblink_send_query(
    'workspace_cross_venue',
    $remote$
      select * from public.create_venue_workspace(
        'Cross Flow Venue', 'cross-flow-venue',
        '43 Concurrent Street, Haifa', 34.998, 32.812,
        'A business workspace activated alongside the actor Fan identity.',
        'Main room', 80, array[]::text[], '', true, true, true, 1, null
      )
    $remote$
  ),
  1,
  'Venue activation starts while the same actor begins Fan activation'
);

do $allow_cross_flow_to_reach_actor_lock$
begin
  perform pg_sleep(0.2);
end;
$allow_cross_flow_to_reach_actor_lock$;

select is(
  extensions.dblink_is_busy('workspace_cross_venue'),
  1,
  'cross-flow Venue activation waits behind the same actor transaction'
);

select lives_ok(
  $assert_cross_fan$
    select handle, profile_completed_at, fan_enabled_at
    from extensions.dblink(
      'workspace_cross_fan',
      $remote$
        select * from public.activate_fan_workspace(
          'cross_flow_fan', 'Cross Flow Fan',
          'A Fan identity activated alongside a Venue workspace.', true, 1, null
        )
      $remote$
    ) as result(
      handle text,
      profile_completed_at timestamptz,
      fan_enabled_at timestamptz
    )
  $assert_cross_fan$,
  'same-actor Fan activation completes without a cross-flow deadlock'
);

do $finish_cross_fan$
begin
  perform extensions.dblink_exec('workspace_cross_fan', 'commit');
end;
$finish_cross_fan$;

select lives_ok(
  $assert_cross_venue$
    select venue_id, slug, verification_status
    from extensions.dblink_get_result('workspace_cross_venue') as result(
      venue_id uuid,
      slug text,
      verification_status text
    )
  $assert_cross_venue$,
  'same-actor Venue activation completes after Fan activation without deadlock'
);

do $finish_cross_connections$
begin
  perform venue_id, slug, verification_status
  from extensions.dblink_get_result('workspace_cross_venue') as result(
    venue_id uuid,
    slug text,
    verification_status text
  );
  perform extensions.dblink_exec('workspace_cross_venue', 'commit');
  perform extensions.dblink_disconnect('workspace_cross_fan');
  perform extensions.dblink_disconnect('workspace_cross_venue');
exception when others then
  begin
    perform extensions.dblink_exec('workspace_cross_fan', 'rollback');
  exception when others then null;
  end;
  begin
    perform extensions.dblink_exec('workspace_cross_venue', 'rollback');
  exception when others then null;
  end;
  begin
    perform extensions.dblink_disconnect('workspace_cross_fan');
  exception when others then null;
  end;
  begin
    perform extensions.dblink_disconnect('workspace_cross_venue');
  exception when others then null;
  end;
end;
$finish_cross_connections$;

select ok(
  (
    select profile.fan_enabled_at is not null
      and profile.profile_completed_at is not null
      and profile.handle = 'cross_flow_fan'
    from public.profiles as profile
    where profile.id = 'e4020000-0000-4000-8000-000000000103'
  ),
  'cross-flow activation leaves the one enabled Fan identity intact'
);
select is(
  (
    select count(*)
    from public.venues
    where owner_id = 'e4020000-0000-4000-8000-000000000103'
      and slug = 'cross-flow-venue'
  ),
  1::bigint,
  'cross-flow activation leaves the one Venue workspace intact'
);

select * from finish();
rollback;
