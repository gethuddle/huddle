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
  perform extensions.dblink_connect('common_onboarding_setup', connection_text);
  perform extensions.dblink_exec(
    'common_onboarding_setup',
    $remote$
      delete from auth.users
      where id = 'e4010000-0000-4000-8000-000000000101';

      insert into auth.users (
        instance_id, id, aud, role, email, email_confirmed_at,
        raw_app_meta_data, raw_user_meta_data, created_at, updated_at
      )
      values (
        '00000000-0000-0000-0000-000000000000',
        'e4010000-0000-4000-8000-000000000101',
        'authenticated', 'authenticated', 'common-concurrency@example.com',
        statement_timestamp(), '{}'::jsonb, '{}'::jsonb,
        statement_timestamp(), statement_timestamp()
      );
    $remote$
  );
  perform extensions.dblink_disconnect('common_onboarding_setup');
end;
$setup$;

do $connections$
declare
  connection_text constant text :=
    'host=supabase_db_huddle port=5432 dbname=postgres user=postgres password=postgres sslmode=disable';
begin
  perform extensions.dblink_connect('common_onboarding_first', connection_text);
  perform extensions.dblink_connect('common_onboarding_second', connection_text);
  perform extensions.dblink_exec('common_onboarding_first', 'begin');
  perform extensions.dblink_exec('common_onboarding_second', 'begin');

  -- Hold the exact per-actor serialization token that the first submission
  -- acquires. A correct duplicate submission waits before touching the profile.
  perform extensions.dblink_exec(
    'common_onboarding_first',
    $remote$
      do $lock$
      begin
        perform pg_advisory_xact_lock(
          hashtextextended('e4010000-0000-4000-8000-000000000101', 4104)
        );
      end;
      $lock$
    $remote$
  );

  perform extensions.dblink_exec('common_onboarding_first', 'set local role authenticated');
  perform extensions.dblink_exec(
    'common_onboarding_first',
    'set local "request.jwt.claim.sub" = ''e4010000-0000-4000-8000-000000000101'''
  );
  perform extensions.dblink_exec('common_onboarding_second', 'set local role authenticated');
  perform extensions.dblink_exec(
    'common_onboarding_second',
    'set local "request.jwt.claim.sub" = ''e4010000-0000-4000-8000-000000000101'''
  );
end;
$connections$;

select is(
  extensions.dblink_send_query(
    'common_onboarding_second',
    $$select * from public.accept_common_onboarding(true, 1)$$
  ),
  1,
  'a duplicate common-onboarding submission starts concurrently'
);

do $allow_duplicate_to_reach_serialization$
begin
  perform pg_sleep(0.2);
end;
$allow_duplicate_to_reach_serialization$;

select is(
  extensions.dblink_is_busy('common_onboarding_second'),
  1,
  'the duplicate waits on the per-actor serialization token'
);

-- Keep the red test drainable if an implementation ignores the token. This
-- branch is test cleanup only; the assertion above still reports the defect.
do $drain_non_serialized_duplicate$
begin
  if extensions.dblink_is_busy('common_onboarding_second') = 0 then
    perform adult_attested_at, rules_version, rules_accepted_at
    from extensions.dblink_get_result('common_onboarding_second')
      as result(
        adult_attested_at timestamptz,
        rules_version integer,
        rules_accepted_at timestamptz
      );
    perform adult_attested_at, rules_version, rules_accepted_at
    from extensions.dblink_get_result('common_onboarding_second')
      as result(
        adult_attested_at timestamptz,
        rules_version integer,
        rules_accepted_at timestamptz
      );
    perform extensions.dblink_exec('common_onboarding_second', 'commit');
  end if;
end;
$drain_non_serialized_duplicate$;

select lives_ok(
  $$
    select adult_attested_at, rules_version, rules_accepted_at
    from extensions.dblink(
      'common_onboarding_first',
      'select * from public.accept_common_onboarding(true, 1)'
    ) as result(
      adult_attested_at timestamptz,
      rules_version integer,
      rules_accepted_at timestamptz
    )
  $$,
  'the first common-onboarding submission succeeds while owning the token'
);

do $commit_first$
begin
  perform extensions.dblink_exec('common_onboarding_first', 'commit');
end;
$commit_first$;

select lives_ok(
  $$
    select adult_attested_at, rules_version, rules_accepted_at
    from extensions.dblink_get_result('common_onboarding_second')
      as result(
        adult_attested_at timestamptz,
        rules_version integer,
        rules_accepted_at timestamptz
      )
  $$,
  'the serialized duplicate completes without a deadlock'
);

do $commit_and_disconnect$
begin
  perform adult_attested_at, rules_version, rules_accepted_at
  from extensions.dblink_get_result('common_onboarding_second')
    as result(
      adult_attested_at timestamptz,
      rules_version integer,
      rules_accepted_at timestamptz
    );
  perform extensions.dblink_exec('common_onboarding_second', 'commit');
  perform extensions.dblink_disconnect('common_onboarding_first');
  perform extensions.dblink_disconnect('common_onboarding_second');
end;
$commit_and_disconnect$;

select ok(
  private.profile_is_common_eligible('e4010000-0000-4000-8000-000000000101'),
  'duplicate submissions leave one common-eligible account state'
);
select is(
  (
    select count(*)
    from public.venues
    where owner_id = 'e4010000-0000-4000-8000-000000000101'
  ),
  0::bigint,
  'duplicate common acceptance still creates no Venue workspace'
);
select ok(
  (
    select profile.fan_enabled_at is null
      and profile.profile_completed_at is null
      and profile.handle is null
    from public.profiles as profile
    where profile.id = 'e4010000-0000-4000-8000-000000000101'
  ),
  'duplicate common acceptance still does not activate or publish Fan identity'
);

select * from finish();
rollback;
