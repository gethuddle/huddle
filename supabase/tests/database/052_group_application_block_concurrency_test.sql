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
    format('host=%s port=5432 dbname=postgres user=postgres password=postgres sslmode=disable', host(inet_server_addr()));
begin
  perform extensions.dblink_connect('group_block_setup', connection_text);
  perform extensions.dblink_exec(
    'group_block_setup',
    $remote$
      delete from public.security_audit_events
      where actor_id in (
        '52200000-0000-4000-8000-000000000101',
        '52200000-0000-4000-8000-000000000102',
        '52200000-0000-4000-8000-000000000103',
        '52200000-0000-4000-8000-000000000104'
      );

      delete from public.user_blocks
      where blocker_id in (
        '52200000-0000-4000-8000-000000000101',
        '52200000-0000-4000-8000-000000000102',
        '52200000-0000-4000-8000-000000000103',
        '52200000-0000-4000-8000-000000000104'
      )
      or blocked_id in (
        '52200000-0000-4000-8000-000000000101',
        '52200000-0000-4000-8000-000000000102',
        '52200000-0000-4000-8000-000000000103',
        '52200000-0000-4000-8000-000000000104'
      );

      delete from public.groups
      where id in (
        '52200000-0000-4000-8000-000000000201',
        '52200000-0000-4000-8000-000000000202'
      );

      delete from auth.users
      where id in (
        '52200000-0000-4000-8000-000000000101',
        '52200000-0000-4000-8000-000000000102',
        '52200000-0000-4000-8000-000000000103',
        '52200000-0000-4000-8000-000000000104'
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
          '52200000-0000-4000-8000-000000000101',
          'authenticated',
          'authenticated',
          'b06-block-owner@example.com',
          statement_timestamp(),
          '{}'::jsonb,
          '{}'::jsonb,
          statement_timestamp(),
          statement_timestamp()
        ),
        (
          '00000000-0000-0000-0000-000000000000',
          '52200000-0000-4000-8000-000000000102',
          'authenticated',
          'authenticated',
          'b06-block-creator@example.com',
          statement_timestamp(),
          '{}'::jsonb,
          '{}'::jsonb,
          statement_timestamp(),
          statement_timestamp()
        ),
        (
          '00000000-0000-0000-0000-000000000000',
          '52200000-0000-4000-8000-000000000103',
          'authenticated',
          'authenticated',
          'b06-direct-applicant@example.com',
          statement_timestamp(),
          '{}'::jsonb,
          '{}'::jsonb,
          statement_timestamp(),
          statement_timestamp()
        ),
        (
          '00000000-0000-0000-0000-000000000000',
          '52200000-0000-4000-8000-000000000104',
          'authenticated',
          'authenticated',
          'b06-invite-applicant@example.com',
          statement_timestamp(),
          '{}'::jsonb,
          '{}'::jsonb,
          statement_timestamp(),
          statement_timestamp()
        );

      update public.profiles
      set
        handle = case id
          when '52200000-0000-4000-8000-000000000101' then 'b06_block_owner'
          when '52200000-0000-4000-8000-000000000102' then 'b06_block_creator'
          when '52200000-0000-4000-8000-000000000103' then 'b06_direct_applicant'
          when '52200000-0000-4000-8000-000000000104' then 'b06_invite_applicant'
        end,
        display_name = case id
          when '52200000-0000-4000-8000-000000000101' then 'B06 Block Owner'
          when '52200000-0000-4000-8000-000000000102' then 'B06 Block Creator'
          when '52200000-0000-4000-8000-000000000103' then 'B06 Direct Applicant'
          when '52200000-0000-4000-8000-000000000104' then 'B06 Invite Applicant'
        end,
        adult_attested_at = statement_timestamp(),
        rules_version = 1,
        rules_accepted_at = statement_timestamp(),
        profile_completed_at = statement_timestamp(),
        fan_enabled_at = statement_timestamp()
      where id in (
        '52200000-0000-4000-8000-000000000101',
        '52200000-0000-4000-8000-000000000102',
        '52200000-0000-4000-8000-000000000103',
        '52200000-0000-4000-8000-000000000104'
      );

      insert into public.groups (
        id,
        slug,
        name,
        owner_id,
        visibility,
        lifecycle,
        activated_at
      )
      values
        (
          '52200000-0000-4000-8000-000000000201',
          'b06-block-discoverable',
          'B06 Block Discoverable',
          '52200000-0000-4000-8000-000000000101',
          'discoverable',
          'forming',
          null
        ),
        (
          '52200000-0000-4000-8000-000000000202',
          'b06-block-unlisted',
          'B06 Block Unlisted',
          '52200000-0000-4000-8000-000000000101',
          'unlisted',
          'active',
          statement_timestamp()
        );

      insert into public.group_memberships (group_id, user_id, role, status)
      values
        (
          '52200000-0000-4000-8000-000000000201',
          '52200000-0000-4000-8000-000000000101',
          'owner',
          'active'
        ),
        (
          '52200000-0000-4000-8000-000000000202',
          '52200000-0000-4000-8000-000000000101',
          'owner',
          'active'
        ),
        (
          '52200000-0000-4000-8000-000000000202',
          '52200000-0000-4000-8000-000000000102',
          'admin',
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
        '52200000-0000-4000-8000-000000000301',
        '52200000-0000-4000-8000-000000000202',
        encode(
          sha256(convert_to('HHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHH', 'UTF8')),
          'hex'
        ),
        '52200000-0000-4000-8000-000000000102',
        statement_timestamp() + interval '1 day',
        1
      );
    $remote$
  );
  perform extensions.dblink_disconnect('group_block_setup');
end;
$setup$;

-- Hold an owner-to-applicant block open after block_user has written it. A
-- direct application must wait on the same canonical pair and observe that
-- block after the blocker commits.
do $direct_connections$
declare
  connection_text constant text :=
    format('host=%s port=5432 dbname=postgres user=postgres password=postgres sslmode=disable', host(inet_server_addr()));
begin
  perform extensions.dblink_connect('direct_block_worker', connection_text);
  perform extensions.dblink_connect('direct_application_worker', connection_text);

  perform extensions.dblink_exec('direct_block_worker', 'begin');
  perform extensions.dblink_exec('direct_block_worker', 'set local role authenticated');
  perform extensions.dblink_exec(
    'direct_block_worker',
    'set local "request.jwt.claim.sub" = ''52200000-0000-4000-8000-000000000101'''
  );

  perform extensions.dblink_exec('direct_application_worker', 'begin');
  perform extensions.dblink_exec('direct_application_worker', 'set local role authenticated');
  perform extensions.dblink_exec(
    'direct_application_worker',
    'set local "request.jwt.claim.sub" = ''52200000-0000-4000-8000-000000000103'''
  );
end;
$direct_connections$;

select is(
  extensions.dblink_send_query(
    'direct_block_worker',
    $$select public.block_user('b06_direct_applicant', null)$$
  ),
  1,
  'an owner block starts in its own transaction'
);

select lives_ok(
  $$
    select block_created
    from extensions.dblink_get_result('direct_block_worker')
      as result(block_created boolean)
  $$,
  'the owner block completes while retaining its transaction lock'
);

do $drain_direct_block$
begin
  perform block_created
  from extensions.dblink_get_result('direct_block_worker')
    as result(block_created boolean);
end;
$drain_direct_block$;

select is(
  extensions.dblink_send_query(
    'direct_application_worker',
    $$select * from public.apply_to_group('52200000-0000-4000-8000-000000000201', '', null)$$
  ),
  1,
  'a direct application starts against the uncommitted owner block'
);

do $allow_direct_application_to_reach_pair_lock$
begin
  perform pg_sleep(0.2);
end;
$allow_direct_application_to_reach_pair_lock$;

select is(
  extensions.dblink_is_busy('direct_application_worker'),
  1,
  'the direct application waits for block_user on the canonical pair'
);

do $commit_direct_block$
begin
  perform extensions.dblink_exec('direct_block_worker', 'commit');
end;
$commit_direct_block$;

select throws_ok(
  $$
    select group_id, status
    from extensions.dblink_get_result('direct_application_worker')
      as result(group_id uuid, status text)
  $$,
  'P0001',
  'BLOCKED_RELATIONSHIP',
  'the direct application rejects the block committed ahead of it'
);

do $disconnect_direct_workers$
begin
  perform extensions.dblink_disconnect('direct_block_worker');
  perform extensions.dblink_disconnect('direct_application_worker');
end;
$disconnect_direct_workers$;

select is(
  (
    select count(*)
    from public.user_blocks
    where blocker_id = '52200000-0000-4000-8000-000000000101'
      and blocked_id = '52200000-0000-4000-8000-000000000103'
  ),
  1::bigint,
  'the owner block is committed'
);
select is(
  (
    select count(*)
    from public.group_memberships
    where group_id = '52200000-0000-4000-8000-000000000201'
      and user_id = '52200000-0000-4000-8000-000000000103'
  ),
  0::bigint,
  'no direct pending membership is written across the committed block'
);
select is(
  (
    select count(*)
    from public.security_audit_events
    where actor_id = '52200000-0000-4000-8000-000000000103'
      and resource_id = '52200000-0000-4000-8000-000000000201'
      and action = 'group.application.submit'
  ),
  0::bigint,
  'the rejected direct application writes no success audit evidence'
);

-- Repeat the race for an invite creator distinct from the group owner. The
-- consumer takes owner and creator pair locks in deterministic target order,
-- waits on the creator's block, then re-checks before consuming the invite.
do $invite_connections$
declare
  connection_text constant text :=
    format('host=%s port=5432 dbname=postgres user=postgres password=postgres sslmode=disable', host(inet_server_addr()));
begin
  perform extensions.dblink_connect('invite_block_worker', connection_text);
  perform extensions.dblink_connect('invite_application_worker', connection_text);

  perform extensions.dblink_exec('invite_block_worker', 'begin');
  perform extensions.dblink_exec('invite_block_worker', 'set local role authenticated');
  perform extensions.dblink_exec(
    'invite_block_worker',
    'set local "request.jwt.claim.sub" = ''52200000-0000-4000-8000-000000000102'''
  );

  perform extensions.dblink_exec('invite_application_worker', 'begin');
  perform extensions.dblink_exec('invite_application_worker', 'set local role authenticated');
  perform extensions.dblink_exec(
    'invite_application_worker',
    'set local "request.jwt.claim.sub" = ''52200000-0000-4000-8000-000000000104'''
  );
end;
$invite_connections$;

select is(
  extensions.dblink_send_query(
    'invite_block_worker',
    $$select public.block_user('b06_invite_applicant', null)$$
  ),
  1,
  'an invite-creator block starts in its own transaction'
);

select lives_ok(
  $$
    select block_created
    from extensions.dblink_get_result('invite_block_worker')
      as result(block_created boolean)
  $$,
  'the invite-creator block completes while retaining its transaction lock'
);

do $drain_invite_block$
begin
  perform block_created
  from extensions.dblink_get_result('invite_block_worker')
    as result(block_created boolean);
end;
$drain_invite_block$;

select is(
  extensions.dblink_send_query(
    'invite_application_worker',
    $$select * from public.consume_group_invite('HHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHH', '', null)$$
  ),
  1,
  'an invite application starts against the uncommitted creator block'
);

do $allow_invite_application_to_reach_pair_lock$
begin
  perform pg_sleep(0.2);
end;
$allow_invite_application_to_reach_pair_lock$;

select is(
  extensions.dblink_is_busy('invite_application_worker'),
  1,
  'the invite application waits for block_user on the creator pair'
);

do $commit_invite_block$
begin
  perform extensions.dblink_exec('invite_block_worker', 'commit');
end;
$commit_invite_block$;

select throws_ok(
  $$
    select group_id, slug, status
    from extensions.dblink_get_result('invite_application_worker')
      as result(group_id uuid, slug text, status text)
  $$,
  'P0001',
  'BLOCKED_RELATIONSHIP',
  'the invite application rejects the creator block committed ahead of it'
);

do $disconnect_invite_workers$
begin
  perform extensions.dblink_disconnect('invite_block_worker');
  perform extensions.dblink_disconnect('invite_application_worker');
end;
$disconnect_invite_workers$;

select is(
  (
    select count(*)
    from public.user_blocks
    where blocker_id = '52200000-0000-4000-8000-000000000102'
      and blocked_id = '52200000-0000-4000-8000-000000000104'
  ),
  1::bigint,
  'the invite-creator block is committed'
);
select is(
  (
    select count(*)
    from public.group_memberships
    where group_id = '52200000-0000-4000-8000-000000000202'
      and user_id = '52200000-0000-4000-8000-000000000104'
  ),
  0::bigint,
  'no invite-backed pending membership is written across the committed block'
);
select is(
  (
    select use_count
    from public.group_invite_tokens
    where id = '52200000-0000-4000-8000-000000000301'
  ),
  0,
  'the rejected invite application does not consume the token'
);
select is(
  (
    select count(*)
    from public.security_audit_events
    where actor_id = '52200000-0000-4000-8000-000000000104'
      and resource_id = '52200000-0000-4000-8000-000000000202'
      and action = 'group.application.submit'
  ),
  0::bigint,
  'the rejected invite application writes no success audit evidence'
);

do $cleanup$
declare
  connection_text constant text :=
    format('host=%s port=5432 dbname=postgres user=postgres password=postgres sslmode=disable', host(inet_server_addr()));
begin
  perform extensions.dblink_connect('group_block_cleanup', connection_text);
  perform extensions.dblink_exec(
    'group_block_cleanup',
    $remote$
      delete from public.security_audit_events
      where actor_id in (
        '52200000-0000-4000-8000-000000000101',
        '52200000-0000-4000-8000-000000000102',
        '52200000-0000-4000-8000-000000000103',
        '52200000-0000-4000-8000-000000000104'
      );

      delete from public.user_blocks
      where blocker_id in (
        '52200000-0000-4000-8000-000000000101',
        '52200000-0000-4000-8000-000000000102',
        '52200000-0000-4000-8000-000000000103',
        '52200000-0000-4000-8000-000000000104'
      )
      or blocked_id in (
        '52200000-0000-4000-8000-000000000101',
        '52200000-0000-4000-8000-000000000102',
        '52200000-0000-4000-8000-000000000103',
        '52200000-0000-4000-8000-000000000104'
      );

      delete from public.groups
      where id in (
        '52200000-0000-4000-8000-000000000201',
        '52200000-0000-4000-8000-000000000202'
      );

      delete from auth.users
      where id in (
        '52200000-0000-4000-8000-000000000101',
        '52200000-0000-4000-8000-000000000102',
        '52200000-0000-4000-8000-000000000103',
        '52200000-0000-4000-8000-000000000104'
      );
    $remote$
  );
  perform extensions.dblink_disconnect('group_block_cleanup');
end;
$cleanup$;

select * from finish();
rollback;
