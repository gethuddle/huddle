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
  perform extensions.dblink_connect('group_invite_setup', connection_text);
  perform extensions.dblink_exec(
    'group_invite_setup',
    $remote$
      delete from public.security_audit_events
      where actor_id in (
        '52100000-0000-4000-8000-000000000101',
        '52100000-0000-4000-8000-000000000102',
        '52100000-0000-4000-8000-000000000103'
      );

      delete from public.groups
      where id = '52100000-0000-4000-8000-000000000201';

      delete from auth.users
      where id in (
        '52100000-0000-4000-8000-000000000101',
        '52100000-0000-4000-8000-000000000102',
        '52100000-0000-4000-8000-000000000103'
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
          '52100000-0000-4000-8000-000000000101',
          'authenticated',
          'authenticated',
          'b06-race-owner@example.com',
          statement_timestamp(),
          '{}'::jsonb,
          '{}'::jsonb,
          statement_timestamp(),
          statement_timestamp()
        ),
        (
          '00000000-0000-0000-0000-000000000000',
          '52100000-0000-4000-8000-000000000102',
          'authenticated',
          'authenticated',
          'b06-race-applicant-a@example.com',
          statement_timestamp(),
          '{}'::jsonb,
          '{}'::jsonb,
          statement_timestamp(),
          statement_timestamp()
        ),
        (
          '00000000-0000-0000-0000-000000000000',
          '52100000-0000-4000-8000-000000000103',
          'authenticated',
          'authenticated',
          'b06-race-applicant-b@example.com',
          statement_timestamp(),
          '{}'::jsonb,
          '{}'::jsonb,
          statement_timestamp(),
          statement_timestamp()
        );

      update public.profiles
      set
        handle = case id
          when '52100000-0000-4000-8000-000000000101' then 'b06_race_owner'
          when '52100000-0000-4000-8000-000000000102' then 'b06_race_a'
          when '52100000-0000-4000-8000-000000000103' then 'b06_race_b'
        end,
        display_name = case id
          when '52100000-0000-4000-8000-000000000101' then 'B06 Race Owner'
          when '52100000-0000-4000-8000-000000000102' then 'B06 Race A'
          when '52100000-0000-4000-8000-000000000103' then 'B06 Race B'
        end,
        city_id = (select id from public.cities where slug = 'haifa'),
        adult_attested_at = statement_timestamp(),
        rules_version = 1,
        rules_accepted_at = statement_timestamp(),
        profile_completed_at = statement_timestamp(),
        fan_enabled_at = statement_timestamp()
      where id in (
        '52100000-0000-4000-8000-000000000101',
        '52100000-0000-4000-8000-000000000102',
        '52100000-0000-4000-8000-000000000103'
      );

      insert into public.groups (
        id,
        slug,
        name,
        owner_id,
        city_id,
        visibility,
        lifecycle,
        activated_at
      )
      values (
        '52100000-0000-4000-8000-000000000201',
        'b06-race-unlisted',
        'B06 Race Unlisted',
        '52100000-0000-4000-8000-000000000101',
        (select id from public.cities where slug = 'haifa'),
        'unlisted',
        'active',
        statement_timestamp()
      );

      insert into public.group_memberships (group_id, user_id, role, status)
      values (
        '52100000-0000-4000-8000-000000000201',
        '52100000-0000-4000-8000-000000000101',
        'owner',
        'active'
      );

      insert into public.group_invite_tokens (
        id,
        group_id,
        token_hash,
        created_by,
        expires_at,
        max_uses
      )
      values (
        '52100000-0000-4000-8000-000000000301',
        '52100000-0000-4000-8000-000000000201',
        encode(
          sha256(convert_to('GGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGG', 'UTF8')),
          'hex'
        ),
        '52100000-0000-4000-8000-000000000101',
        statement_timestamp() + interval '1 day',
        1
      );
    $remote$
  );
  perform extensions.dblink_disconnect('group_invite_setup');
end;
$setup$;

do $connections$
declare
  connection_text constant text :=
    'host=supabase_db_huddle port=5432 dbname=postgres user=postgres password=postgres sslmode=disable';
begin
  perform extensions.dblink_connect('group_invite_a', connection_text);
  perform extensions.dblink_connect('group_invite_b', connection_text);

  perform extensions.dblink_exec('group_invite_a', 'begin');
  perform extensions.dblink_exec('group_invite_a', 'set local role authenticated');
  perform extensions.dblink_exec(
    'group_invite_a',
    'set local "request.jwt.claim.sub" = ''52100000-0000-4000-8000-000000000102'''
  );

  perform extensions.dblink_exec('group_invite_b', 'begin');
  perform extensions.dblink_exec('group_invite_b', 'set local role authenticated');
  perform extensions.dblink_exec(
    'group_invite_b',
    'set local "request.jwt.claim.sub" = ''52100000-0000-4000-8000-000000000103'''
  );
end;
$connections$;

select is(
  extensions.dblink_send_query(
    'group_invite_a',
    $$select * from public.consume_group_invite('GGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGG', '', null)$$
  ),
  1,
  'the first one-use invitation consumption starts in its own transaction'
);

select lives_ok(
  $$
    select group_id, slug, status
    from extensions.dblink_get_result('group_invite_a')
      as result(group_id uuid, slug text, status text)
  $$,
  'the first concurrent invitation consumption succeeds'
);

do $drain_first$
begin
  perform group_id, slug, status
  from extensions.dblink_get_result('group_invite_a')
    as result(group_id uuid, slug text, status text);
end;
$drain_first$;

select is(
  extensions.dblink_send_query(
    'group_invite_b',
    $$select * from public.consume_group_invite('GGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGG', '', null)$$
  ),
  1,
  'a second account concurrently attempts the same final invitation use'
);

do $allow_second_to_reach_invite_lock$
begin
  perform pg_sleep(0.2);
end;
$allow_second_to_reach_invite_lock$;

select is(
  extensions.dblink_is_busy('group_invite_b'),
  1,
  'the second consumer waits on the locked invitation row'
);

do $commit_first$
begin
  perform extensions.dblink_exec('group_invite_a', 'commit');
end;
$commit_first$;

select throws_ok(
  $$
    select group_id, slug, status
    from extensions.dblink_get_result('group_invite_b')
      as result(group_id uuid, slug text, status text)
  $$,
  'P0001',
  'INVITE_INVALID',
  'the serialized second consumer observes the committed exhausted state'
);

do $disconnect_workers$
begin
  perform extensions.dblink_disconnect('group_invite_a');
  perform extensions.dblink_disconnect('group_invite_b');
end;
$disconnect_workers$;

select is(
  (
    select use_count
    from public.group_invite_tokens
    where id = '52100000-0000-4000-8000-000000000301'
  ),
  1,
  'the final invitation use is consumed exactly once'
);
select is(
  (
    select count(*)
    from public.group_memberships
    where group_id = '52100000-0000-4000-8000-000000000201'
      and status = 'pending'
  ),
  1::bigint,
  'only one pending application is created by concurrent consumers'
);
select is(
  (
    select count(*)
    from public.security_audit_events
    where resource_id = '52100000-0000-4000-8000-000000000201'
      and action = 'group.application.submit'
  ),
  1::bigint,
  'only the successful consumption writes application audit evidence'
);

do $cleanup$
declare
  connection_text constant text :=
    'host=supabase_db_huddle port=5432 dbname=postgres user=postgres password=postgres sslmode=disable';
begin
  perform extensions.dblink_connect('group_invite_cleanup', connection_text);
  perform extensions.dblink_exec(
    'group_invite_cleanup',
    $remote$
      delete from public.security_audit_events
      where actor_id in (
        '52100000-0000-4000-8000-000000000101',
        '52100000-0000-4000-8000-000000000102',
        '52100000-0000-4000-8000-000000000103'
      );

      delete from public.groups
      where id = '52100000-0000-4000-8000-000000000201';

      delete from auth.users
      where id in (
        '52100000-0000-4000-8000-000000000101',
        '52100000-0000-4000-8000-000000000102',
        '52100000-0000-4000-8000-000000000103'
      );
    $remote$
  );
  perform extensions.dblink_disconnect('group_invite_cleanup');
end;
$cleanup$;

select * from finish();
rollback;
