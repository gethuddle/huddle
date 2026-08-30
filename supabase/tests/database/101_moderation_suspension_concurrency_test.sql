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
  perform extensions.dblink_connect('b11_suspension_setup', connection_text);
  perform extensions.dblink_exec(
    'b11_suspension_setup',
    $remote$
      delete from public.moderation_appeals
      where appellant_id in (
        'b1110000-0000-4000-8000-000000000111',
        'b1110000-0000-4000-8000-000000000112',
        'b1110000-0000-4000-8000-000000000113'
      );
      delete from public.moderation_actions
      where moderator_id in (
        'b1110000-0000-4000-8000-000000000111',
        'b1110000-0000-4000-8000-000000000112',
        'b1110000-0000-4000-8000-000000000113'
      );
      delete from public.reports
      where reporter_id in (
        'b1110000-0000-4000-8000-000000000111',
        'b1110000-0000-4000-8000-000000000112',
        'b1110000-0000-4000-8000-000000000113'
      )
      or profile_id in (
        'b1110000-0000-4000-8000-000000000111',
        'b1110000-0000-4000-8000-000000000112',
        'b1110000-0000-4000-8000-000000000113'
      );
      delete from public.security_audit_events
      where actor_id in (
        'b1110000-0000-4000-8000-000000000111',
        'b1110000-0000-4000-8000-000000000112',
        'b1110000-0000-4000-8000-000000000113'
      );
      delete from public.friendships
      where user_low_id in (
        'b1110000-0000-4000-8000-000000000111',
        'b1110000-0000-4000-8000-000000000112',
        'b1110000-0000-4000-8000-000000000113'
      )
      or user_high_id in (
        'b1110000-0000-4000-8000-000000000111',
        'b1110000-0000-4000-8000-000000000112',
        'b1110000-0000-4000-8000-000000000113'
      );
      delete from public.platform_roles
      where profile_id in (
        'b1110000-0000-4000-8000-000000000111',
        'b1110000-0000-4000-8000-000000000112',
        'b1110000-0000-4000-8000-000000000113'
      );
      delete from auth.users
      where id in (
        'b1110000-0000-4000-8000-000000000111',
        'b1110000-0000-4000-8000-000000000112',
        'b1110000-0000-4000-8000-000000000113'
      );

      insert into auth.users (
        instance_id, id, aud, role, email, email_confirmed_at,
        raw_app_meta_data, raw_user_meta_data, created_at, updated_at
      )
      values
        (
          '00000000-0000-0000-0000-000000000000',
          'b1110000-0000-4000-8000-000000000111',
          'authenticated', 'authenticated', 'b11-race-actor@example.com',
          statement_timestamp(), '{}'::jsonb, '{}'::jsonb,
          statement_timestamp(), statement_timestamp()
        ),
        (
          '00000000-0000-0000-0000-000000000000',
          'b1110000-0000-4000-8000-000000000112',
          'authenticated', 'authenticated', 'b11-race-target@example.com',
          statement_timestamp(), '{}'::jsonb, '{}'::jsonb,
          statement_timestamp(), statement_timestamp()
        ),
        (
          '00000000-0000-0000-0000-000000000000',
          'b1110000-0000-4000-8000-000000000113',
          'authenticated', 'authenticated', 'b11-race-moderator@example.com',
          statement_timestamp(), '{}'::jsonb, '{}'::jsonb,
          statement_timestamp(), statement_timestamp()
        );

      update public.profiles
      set
        handle = case id
          when 'b1110000-0000-4000-8000-000000000111' then 'b11_race_actor'
          when 'b1110000-0000-4000-8000-000000000112' then 'b11_race_target'
          when 'b1110000-0000-4000-8000-000000000113' then 'b11_race_moderator'
        end,
        display_name = case id
          when 'b1110000-0000-4000-8000-000000000111' then 'B11 Race Actor'
          when 'b1110000-0000-4000-8000-000000000112' then 'B11 Race Target'
          when 'b1110000-0000-4000-8000-000000000113' then 'B11 Race Moderator'
        end,
        city_id = (select id from public.cities where slug = 'tel-aviv-yafo'),
        adult_attested_at = statement_timestamp(),
        rules_version = 1,
        rules_accepted_at = statement_timestamp(),
        profile_completed_at = statement_timestamp(),
        fan_enabled_at = statement_timestamp()
      where id in (
        'b1110000-0000-4000-8000-000000000111',
        'b1110000-0000-4000-8000-000000000112',
        'b1110000-0000-4000-8000-000000000113'
      );

      insert into public.platform_roles (profile_id, role)
      values ('b1110000-0000-4000-8000-000000000113', 'moderator');

      insert into public.reports (
        id, reporter_id, target_type, profile_id, category, details,
        status, assigned_to
      )
      values (
        'b1110000-0000-4000-8000-000000000401',
        'b1110000-0000-4000-8000-000000000112',
        'profile',
        'b1110000-0000-4000-8000-000000000111',
        'harassment_stalking_sexual_misconduct',
        'A deterministic local report used only to verify suspension serialization.',
        'reviewing',
        'b1110000-0000-4000-8000-000000000113'
      );
    $remote$
  );
  perform extensions.dblink_disconnect('b11_suspension_setup');
end;
$setup$;

do $read_only_connection$
declare
  connection_text constant text :=
    'host=supabase_db_huddle port=5432 dbname=postgres user=postgres password=postgres sslmode=disable';
begin
  perform extensions.dblink_connect('b11_read_only_actor', connection_text);
  perform extensions.dblink_exec('b11_read_only_actor', 'begin read only');
  perform extensions.dblink_exec('b11_read_only_actor', 'set local role authenticated');
  perform extensions.dblink_exec(
    'b11_read_only_actor',
    'set local "request.jwt.claim.sub" = ''b1110000-0000-4000-8000-000000000111'''
  );
end;
$read_only_connection$;

select lives_ok(
  $$
    select visible_count
    from extensions.dblink(
      'b11_read_only_actor',
      'select count(*) from public.list_friendships(''accepted'',0,20)'
    ) as result(visible_count bigint)
  $$,
  'stable actor projections remain usable inside a read-only transaction'
);

do $disconnect_read_only$
begin
  perform extensions.dblink_disconnect('b11_read_only_actor');
end;
$disconnect_read_only$;

do $connections$
declare
  connection_text constant text :=
    'host=supabase_db_huddle port=5432 dbname=postgres user=postgres password=postgres sslmode=disable';
begin
  perform extensions.dblink_connect('b11_suspension_moderator', connection_text);
  perform extensions.dblink_connect('b11_suspension_actor', connection_text);
  perform extensions.dblink_exec('b11_suspension_moderator', 'begin');
  perform extensions.dblink_exec('b11_suspension_actor', 'begin');
  perform extensions.dblink_exec('b11_suspension_moderator', 'set local role authenticated');
  perform extensions.dblink_exec('b11_suspension_actor', 'set local role authenticated');
  perform extensions.dblink_exec(
    'b11_suspension_moderator',
    'set local "request.jwt.claim.sub" = ''b1110000-0000-4000-8000-000000000113'''
  );
  perform extensions.dblink_exec(
    'b11_suspension_actor',
    'set local "request.jwt.claim.sub" = ''b1110000-0000-4000-8000-000000000111'''
  );
end;
$connections$;

select is(
  extensions.dblink_send_query(
    'b11_suspension_moderator',
    $$
      select moderation_action_id, action
      from public.apply_moderation_action(
        'b1110000-0000-4000-8000-000000000401',
        'temporary_suspension',
        'The deterministic race fixture requires a temporary suspension.',
        24,
        null
      )
    $$
  ),
  1,
  'the moderator starts a transactional suspension'
);
select lives_ok(
  $$
    select moderation_action_id, action
    from extensions.dblink_get_result('b11_suspension_moderator')
      as result(moderation_action_id uuid, action text)
  $$,
  'the suspension updates product state while retaining its transaction lock'
);
do $drain_moderator$
begin
  perform moderation_action_id, action
  from extensions.dblink_get_result('b11_suspension_moderator')
    as result(moderation_action_id uuid, action text);
end;
$drain_moderator$;

select is(
  extensions.dblink_send_query(
    'b11_suspension_actor',
    $$select public.request_friendship('b1110000-0000-4000-8000-000000000112', null)$$
  ),
  1,
  'the affected user concurrently starts a community mutation'
);
do $allow_actor_to_reach_profile_lock$
begin
  perform pg_sleep(0.2);
end;
$allow_actor_to_reach_profile_lock$;
select is(
  extensions.dblink_is_busy('b11_suspension_actor'),
  1,
  'the community mutation waits for the uncommitted suspension state'
);

do $commit_suspension$
begin
  perform extensions.dblink_exec('b11_suspension_moderator', 'commit');
end;
$commit_suspension$;

select throws_ok(
  $$
    select friendship_id
    from extensions.dblink_get_result('b11_suspension_actor')
      as result(friendship_id uuid)
  $$,
  'P0001',
  'ACCOUNT_SUSPENDED',
  'the waiting mutation observes the committed suspension and fails closed'
);

do $disconnect_workers$
begin
  perform extensions.dblink_disconnect('b11_suspension_moderator');
  perform extensions.dblink_disconnect('b11_suspension_actor');
end;
$disconnect_workers$;

select ok(
  (
    select suspended_at is not null and suspension_expires_at is not null
    from public.profiles
    where id = 'b1110000-0000-4000-8000-000000000111'
  ),
  'the moderation action remains committed'
);
select is(
  (
    select count(*)
    from public.friendships
    where user_low_id = 'b1110000-0000-4000-8000-000000000111'
      and user_high_id = 'b1110000-0000-4000-8000-000000000112'
  ),
  0::bigint,
  'no post-suspension community mutation is persisted'
);

do $cleanup$
declare
  connection_text constant text :=
    'host=supabase_db_huddle port=5432 dbname=postgres user=postgres password=postgres sslmode=disable';
begin
  perform extensions.dblink_connect('b11_suspension_cleanup', connection_text);
  perform extensions.dblink_exec(
    'b11_suspension_cleanup',
    $remote$
      delete from public.moderation_appeals
      where appellant_id in (
        'b1110000-0000-4000-8000-000000000111',
        'b1110000-0000-4000-8000-000000000112',
        'b1110000-0000-4000-8000-000000000113'
      );
      delete from public.moderation_actions
      where moderator_id = 'b1110000-0000-4000-8000-000000000113';
      delete from public.reports
      where id = 'b1110000-0000-4000-8000-000000000401';
      delete from public.security_audit_events
      where actor_id in (
        'b1110000-0000-4000-8000-000000000111',
        'b1110000-0000-4000-8000-000000000112',
        'b1110000-0000-4000-8000-000000000113'
      );
      delete from public.friendships
      where user_low_id in (
        'b1110000-0000-4000-8000-000000000111',
        'b1110000-0000-4000-8000-000000000112',
        'b1110000-0000-4000-8000-000000000113'
      )
      or user_high_id in (
        'b1110000-0000-4000-8000-000000000111',
        'b1110000-0000-4000-8000-000000000112',
        'b1110000-0000-4000-8000-000000000113'
      );
      delete from public.platform_roles
      where profile_id = 'b1110000-0000-4000-8000-000000000113';
      delete from auth.users
      where id in (
        'b1110000-0000-4000-8000-000000000111',
        'b1110000-0000-4000-8000-000000000112',
        'b1110000-0000-4000-8000-000000000113'
      );
    $remote$
  );
  perform extensions.dblink_disconnect('b11_suspension_cleanup');
end;
$cleanup$;

select * from finish();
rollback;
