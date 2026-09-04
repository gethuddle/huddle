begin;

create extension if not exists pgtap with schema extensions;
create extension if not exists dblink with schema extensions;
set local search_path = extensions, public, pg_catalog;

select no_plan();

-- These credentials belong only to the disposable local Supabase database.
do $setup$
declare
  connection_text constant text :=
    format('host=%s port=5432 dbname=postgres user=postgres password=postgres sslmode=disable', host(inet_server_addr()));
begin
  perform extensions.dblink_connect('b10_attendance_setup', connection_text);
  perform extensions.dblink_exec(
    'b10_attendance_setup',
    $remote$
      delete from public.security_audit_events
      where actor_id in (
        '91000000-0000-4000-8000-000000000101',
        '91000000-0000-4000-8000-000000000102',
        '91000000-0000-4000-8000-000000000103'
      );
      delete from public.user_blocks
      where blocker_id in (
        '91000000-0000-4000-8000-000000000101',
        '91000000-0000-4000-8000-000000000102',
        '91000000-0000-4000-8000-000000000103'
      ) or blocked_id in (
        '91000000-0000-4000-8000-000000000101',
        '91000000-0000-4000-8000-000000000102',
        '91000000-0000-4000-8000-000000000103'
      );
      delete from public.event_attendance
      where event_id in (
        '91000000-0000-4000-8000-000000000401',
        '91000000-0000-4000-8000-000000000402'
      );
      delete from public.event_invitations
      where event_id = '91000000-0000-4000-8000-000000000402';
      delete from public.event_private_locations
      where event_id in (
        '91000000-0000-4000-8000-000000000401',
        '91000000-0000-4000-8000-000000000402'
      );
      delete from public.events
      where id in (
        '91000000-0000-4000-8000-000000000401',
        '91000000-0000-4000-8000-000000000402'
      );
      delete from public.friendships
      where user_low_id = '91000000-0000-4000-8000-000000000101';
      delete from public.matches
      where id = '91000000-0000-4000-8000-000000000204';
      delete from public.teams
      where id in (
        '91000000-0000-4000-8000-000000000202',
        '91000000-0000-4000-8000-000000000203'
      );
      delete from public.competitions
      where id = '91000000-0000-4000-8000-000000000201';
      delete from auth.users
      where id in (
        '91000000-0000-4000-8000-000000000101',
        '91000000-0000-4000-8000-000000000102',
        '91000000-0000-4000-8000-000000000103'
      );

      insert into auth.users (
        instance_id, id, aud, role, email, email_confirmed_at,
        raw_app_meta_data, raw_user_meta_data, created_at, updated_at
      )
      values
        (
          '00000000-0000-0000-0000-000000000000',
          '91000000-0000-4000-8000-000000000101',
          'authenticated', 'authenticated', 'b10-race-host@example.com',
          statement_timestamp(), '{}'::jsonb, '{}'::jsonb,
          statement_timestamp() - interval '30 days', statement_timestamp()
        ),
        (
          '00000000-0000-0000-0000-000000000000',
          '91000000-0000-4000-8000-000000000102',
          'authenticated', 'authenticated', 'b10-race-one@example.com',
          statement_timestamp(), '{}'::jsonb, '{}'::jsonb,
          statement_timestamp() - interval '30 days', statement_timestamp()
        ),
        (
          '00000000-0000-0000-0000-000000000000',
          '91000000-0000-4000-8000-000000000103',
          'authenticated', 'authenticated', 'b10-race-two@example.com',
          statement_timestamp(), '{}'::jsonb, '{}'::jsonb,
          statement_timestamp() - interval '30 days', statement_timestamp()
        );

      update public.profiles
      set
        handle = case id
          when '91000000-0000-4000-8000-000000000101' then 'b10_race_host'
          when '91000000-0000-4000-8000-000000000102' then 'b10_race_one'
          else 'b10_race_two'
        end,
        display_name = case id
          when '91000000-0000-4000-8000-000000000101' then 'B10 Race Host'
          when '91000000-0000-4000-8000-000000000102' then 'B10 Race One'
          else 'B10 Race Two'
        end,
        adult_attested_at = statement_timestamp(),
        rules_version = 1,
        rules_accepted_at = statement_timestamp(),
        profile_completed_at = statement_timestamp(),
        fan_enabled_at = statement_timestamp()
      where id in (
        '91000000-0000-4000-8000-000000000101',
        '91000000-0000-4000-8000-000000000102',
        '91000000-0000-4000-8000-000000000103'
      );

      insert into public.competitions (
        id, sport_id, provider, provider_external_id, code, name,
        country_name, last_synced_at
      )
      values (
        '91000000-0000-4000-8000-000000000201',
        '00000000-0000-4000-8000-000000000020',
        'b10-race', 'competition', 'B10R', 'B10 Race League',
        'England', statement_timestamp()
      );

      insert into public.teams (
        id, sport_id, provider, provider_external_id, name, short_name,
        tla, country_name, last_synced_at
      )
      values
        (
          '91000000-0000-4000-8000-000000000202',
          '00000000-0000-4000-8000-000000000020',
          'b10-race', 'home', 'B10 Race Home', 'Race Home', 'BRH',
          'England', statement_timestamp()
        ),
        (
          '91000000-0000-4000-8000-000000000203',
          '00000000-0000-4000-8000-000000000020',
          'b10-race', 'away', 'B10 Race Away', 'Race Away', 'BRA',
          'England', statement_timestamp()
        );

      insert into public.matches (
        id, provider, provider_external_id, competition_id, home_team_id,
        away_team_id, starts_at, status, matchday, season_label, last_synced_at
      )
      values (
        '91000000-0000-4000-8000-000000000204',
        'b10-race', 'match',
        '91000000-0000-4000-8000-000000000201',
        '91000000-0000-4000-8000-000000000202',
        '91000000-0000-4000-8000-000000000203',
        statement_timestamp() + interval '7 days', 'timed', 1, '2026',
        statement_timestamp()
      );

      insert into public.friendships (
        user_low_id, user_high_id, requested_by, status, responded_at
      )
      values
        (
          '91000000-0000-4000-8000-000000000101',
          '91000000-0000-4000-8000-000000000102',
          '91000000-0000-4000-8000-000000000101', 'accepted', statement_timestamp()
        ),
        (
          '91000000-0000-4000-8000-000000000101',
          '91000000-0000-4000-8000-000000000103',
          '91000000-0000-4000-8000-000000000101', 'accepted', statement_timestamp()
        );

      insert into public.events (
        id, created_by, host_user_id, match_id, title, description,
        expected_activity, cost_description, event_rules, commercial_affiliation,
        host_presence_confirmed_at, starts_at, ends_at, place_kind,
        audience, capacity, requires_approval, status, published_at
      )
      values
        (
          '91000000-0000-4000-8000-000000000401',
          '91000000-0000-4000-8000-000000000101',
          '91000000-0000-4000-8000-000000000101',
          '91000000-0000-4000-8000-000000000204',
          'B10 Approval Capacity Race',
          'A deterministic home event for approval and block serialization.',
          'Watch the full match', 'Free', 'Respect every attendee.', 'None',
          statement_timestamp(), statement_timestamp() + interval '7 days',
          statement_timestamp() + interval '7 days 3 hours',
          'home', 'friends', 1, true, 'published', statement_timestamp()
        ),
        (
          '91000000-0000-4000-8000-000000000402',
          '91000000-0000-4000-8000-000000000101',
          '91000000-0000-4000-8000-000000000101',
          '91000000-0000-4000-8000-000000000204',
          'B10 Invitation Capacity Race',
          'A deterministic invite-only event for atomic acceptance.',
          'Watch the full match', 'Free', 'Respect every attendee.', 'None',
          statement_timestamp(), statement_timestamp() + interval '7 days',
          statement_timestamp() + interval '7 days 3 hours',
          'home', 'invite_only', 1, true, 'published', statement_timestamp()
        );

      insert into public.event_private_locations (event_id, address_text, directions, location)
      values
        (
          '91000000-0000-4000-8000-000000000401',
          '91 Protected Race Street, Haifa', 'Use the private entrance.',
          extensions.st_setsrid(extensions.st_makepoint(34.998, 32.812), 4326)::extensions.geography
        ),
        (
          '91000000-0000-4000-8000-000000000402',
          '92 Protected Race Street, Haifa', 'Use the side entrance.',
          extensions.st_setsrid(extensions.st_makepoint(34.999, 32.813), 4326)::extensions.geography
        );

      insert into public.event_invitations (
        id, event_id, invitee_id, invited_by, status
      )
      values
        (
          '91000000-0000-4000-8000-000000000601',
          '91000000-0000-4000-8000-000000000402',
          '91000000-0000-4000-8000-000000000102',
          '91000000-0000-4000-8000-000000000101',
          'pending'
        ),
        (
          '91000000-0000-4000-8000-000000000602',
          '91000000-0000-4000-8000-000000000402',
          '91000000-0000-4000-8000-000000000103',
          '91000000-0000-4000-8000-000000000101',
          'pending'
        );

      insert into public.event_attendance (id, event_id, user_id, status, source)
      values
        (
          '91000000-0000-4000-8000-000000000501',
          '91000000-0000-4000-8000-000000000401',
          '91000000-0000-4000-8000-000000000102', 'requested', 'self_request'
        ),
        (
          '91000000-0000-4000-8000-000000000502',
          '91000000-0000-4000-8000-000000000401',
          '91000000-0000-4000-8000-000000000103', 'requested', 'self_request'
        );
    $remote$
  );
  perform extensions.dblink_disconnect('b10_attendance_setup');
end;
$setup$;

do $invitation_connections$
declare
  connection_text constant text :=
    format('host=%s port=5432 dbname=postgres user=postgres password=postgres sslmode=disable', host(inet_server_addr()));
begin
  perform extensions.dblink_connect('b10_invite_a', connection_text);
  perform extensions.dblink_connect('b10_invite_b', connection_text);
  perform extensions.dblink_exec('b10_invite_a', 'begin');
  perform extensions.dblink_exec('b10_invite_b', 'begin');
  perform extensions.dblink_exec('b10_invite_a', 'set local role authenticated');
  perform extensions.dblink_exec('b10_invite_b', 'set local role authenticated');
  perform extensions.dblink_exec(
    'b10_invite_a',
    'set local "request.jwt.claim.sub" = ''91000000-0000-4000-8000-000000000102'''
  );
  perform extensions.dblink_exec(
    'b10_invite_b',
    'set local "request.jwt.claim.sub" = ''91000000-0000-4000-8000-000000000103'''
  );
end;
$invitation_connections$;

select is(
  extensions.dblink_send_query(
    'b10_invite_a',
    $$
      select * from public.respond_to_event_invitation(
        '91000000-0000-4000-8000-000000000601',
        'accept', null
      )
    $$
  ),
  1,
  'the first invitation acceptance starts in its own transaction'
);
select lives_ok(
  $$
    select event_id, invitation_status, attendance_id, attendance_status
    from extensions.dblink_get_result('b10_invite_a') as result(
      event_id uuid,
      invitation_status text,
      attendance_id uuid,
      attendance_status text
    )
  $$,
  'the first invitation acceptance reserves the final place'
);
do $drain_first_invitation$
begin
  perform event_id, invitation_status, attendance_id, attendance_status
  from extensions.dblink_get_result('b10_invite_a') as result(
    event_id uuid,
    invitation_status text,
    attendance_id uuid,
    attendance_status text
  );
end;
$drain_first_invitation$;

select is(
  extensions.dblink_send_query(
    'b10_invite_b',
    $$
      select * from public.respond_to_event_invitation(
        '91000000-0000-4000-8000-000000000602',
        'accept', null
      )
    $$
  ),
  1,
  'the competing invitation acceptance starts against the held event lock'
);
do $wait_for_invitation_lock$
begin
  perform pg_sleep(0.2);
end;
$wait_for_invitation_lock$;
select is(
  extensions.dblink_is_busy('b10_invite_b'),
  1,
  'the competing invitation acceptance waits for the capacity transaction'
);
do $commit_first_invitation$
begin
  perform extensions.dblink_exec('b10_invite_a', 'commit');
end;
$commit_first_invitation$;
select throws_ok(
  $$
    select event_id, invitation_status, attendance_id, attendance_status
    from extensions.dblink_get_result('b10_invite_b') as result(
      event_id uuid,
      invitation_status text,
      attendance_id uuid,
      attendance_status text
    )
  $$,
  'P0001', 'EVENT_FULL',
  'the serialized competing acceptance observes the reserved final place'
);
do $disconnect_invitations$
begin
  perform extensions.dblink_disconnect('b10_invite_a');
  perform extensions.dblink_disconnect('b10_invite_b');
end;
$disconnect_invitations$;

select is(
  (
    select count(*) from public.event_attendance
    where event_id = '91000000-0000-4000-8000-000000000402'
      and status = 'approved'
  ),
  1::bigint,
  'only one direct invitation acceptance consumes the final place'
);
select is(
  (
    select count(*) from public.event_invitations
    where event_id = '91000000-0000-4000-8000-000000000402'
      and status = 'accepted'
  ),
  1::bigint,
  'only the capacity-winning invitation is retained as accepted'
);

do $capacity_connections$
declare
  connection_text constant text :=
    format('host=%s port=5432 dbname=postgres user=postgres password=postgres sslmode=disable', host(inet_server_addr()));
begin
  perform extensions.dblink_connect('b10_approve_a', connection_text);
  perform extensions.dblink_connect('b10_approve_b', connection_text);
  perform extensions.dblink_exec('b10_approve_a', 'begin');
  perform extensions.dblink_exec('b10_approve_b', 'begin');
  perform extensions.dblink_exec('b10_approve_a', 'set local role authenticated');
  perform extensions.dblink_exec('b10_approve_b', 'set local role authenticated');
  perform extensions.dblink_exec(
    'b10_approve_a',
    'set local "request.jwt.claim.sub" = ''91000000-0000-4000-8000-000000000101'''
  );
  perform extensions.dblink_exec(
    'b10_approve_b',
    'set local "request.jwt.claim.sub" = ''91000000-0000-4000-8000-000000000101'''
  );
end;
$capacity_connections$;

select is(
  extensions.dblink_send_query(
    'b10_approve_a',
    $$
      select * from public.review_attendance(
        '91000000-0000-4000-8000-000000000501',
        'approve', null
      )
    $$
  ),
  1,
  'the first capacity approval starts in its own transaction'
);
select lives_ok(
  $$
    select attendance_id, status
    from extensions.dblink_get_result('b10_approve_a')
      as result(attendance_id uuid, status text)
  $$,
  'the first approval succeeds while retaining the event lock'
);
do $drain_first_approval$
begin
  perform attendance_id, status
  from extensions.dblink_get_result('b10_approve_a')
    as result(attendance_id uuid, status text);
end;
$drain_first_approval$;

select is(
  extensions.dblink_send_query(
    'b10_approve_b',
    $$
      select * from public.review_attendance(
        '91000000-0000-4000-8000-000000000502',
        'approve', null
      )
    $$
  ),
  1,
  'the competing approval starts against the held event lock'
);
do $wait_for_event_lock$
begin
  perform pg_sleep(0.2);
end;
$wait_for_event_lock$;
select is(
  extensions.dblink_is_busy('b10_approve_b'),
  1,
  'the competing approval waits for the capacity transaction'
);
do $commit_first_approval$
begin
  perform extensions.dblink_exec('b10_approve_a', 'commit');
end;
$commit_first_approval$;
select throws_ok(
  $$
    select attendance_id, status
    from extensions.dblink_get_result('b10_approve_b')
      as result(attendance_id uuid, status text)
  $$,
  'P0001', 'EVENT_FULL',
  'the serialized second approval observes the committed approved row'
);
do $disconnect_capacity$
begin
  perform extensions.dblink_disconnect('b10_approve_a');
  perform extensions.dblink_disconnect('b10_approve_b');
end;
$disconnect_capacity$;

select is(
  (
    select count(*) from public.event_attendance
    where event_id = '91000000-0000-4000-8000-000000000401'
      and status = 'approved'
  ),
  1::bigint,
  'only one place is approved after the capacity race'
);

do $prepare_block_race$
declare
  connection_text constant text :=
    format('host=%s port=5432 dbname=postgres user=postgres password=postgres sslmode=disable', host(inet_server_addr()));
begin
  perform extensions.dblink_connect('b10_prepare_block_race', connection_text);
  perform extensions.dblink_exec(
    'b10_prepare_block_race',
    $$update public.events set capacity = 2 where id = '91000000-0000-4000-8000-000000000401'$$
  );
  perform extensions.dblink_disconnect('b10_prepare_block_race');
end;
$prepare_block_race$;

do $block_connections$
declare
  connection_text constant text :=
    format('host=%s port=5432 dbname=postgres user=postgres password=postgres sslmode=disable', host(inet_server_addr()));
begin
  perform extensions.dblink_connect('b10_block_worker', connection_text);
  perform extensions.dblink_connect('b10_review_worker', connection_text);
  perform extensions.dblink_exec('b10_block_worker', 'begin');
  perform extensions.dblink_exec('b10_review_worker', 'begin');
  perform extensions.dblink_exec('b10_block_worker', 'set local role authenticated');
  perform extensions.dblink_exec('b10_review_worker', 'set local role authenticated');
  perform extensions.dblink_exec(
    'b10_block_worker',
    'set local "request.jwt.claim.sub" = ''91000000-0000-4000-8000-000000000101'''
  );
  perform extensions.dblink_exec(
    'b10_review_worker',
    'set local "request.jwt.claim.sub" = ''91000000-0000-4000-8000-000000000101'''
  );
end;
$block_connections$;

select is(
  extensions.dblink_send_query(
    'b10_block_worker',
    $$select public.block_user('b10_race_two', null)$$
  ),
  1,
  'the host block starts in its own transaction'
);
select lives_ok(
  $$
    select created
    from extensions.dblink_get_result('b10_block_worker') as result(created boolean)
  $$,
  'the host block writes its state while retaining the canonical pair lock'
);
do $drain_block$
begin
  perform created
  from extensions.dblink_get_result('b10_block_worker') as result(created boolean);
end;
$drain_block$;

select is(
  extensions.dblink_send_query(
    'b10_review_worker',
    $$
      select * from public.review_attendance(
        '91000000-0000-4000-8000-000000000502',
        'approve', null
      )
    $$
  ),
  1,
  'attendance review starts against the uncommitted block'
);
do $wait_for_pair_lock$
begin
  perform pg_sleep(0.2);
end;
$wait_for_pair_lock$;
select is(
  extensions.dblink_is_busy('b10_review_worker'),
  1,
  'attendance review waits for the shared canonical pair lock'
);
do $commit_block$
begin
  perform extensions.dblink_exec('b10_block_worker', 'commit');
end;
$commit_block$;
select throws_ok(
  $$
    select attendance_id, status
    from extensions.dblink_get_result('b10_review_worker')
      as result(attendance_id uuid, status text)
  $$,
  'P0001', 'INVALID_TRANSITION',
  'the serialized review cannot approve the attendance ended by the committed block'
);
do $disconnect_block$
begin
  perform extensions.dblink_disconnect('b10_block_worker');
  perform extensions.dblink_disconnect('b10_review_worker');
end;
$disconnect_block$;

select is(
  (
    select status::text from public.event_attendance
    where event_id = '91000000-0000-4000-8000-000000000401'
      and user_id = '91000000-0000-4000-8000-000000000103'
  ),
  'removed',
  'the blocked attendee remains removed rather than approved'
);

set local role authenticated;
set local "request.jwt.claim.sub" = '91000000-0000-4000-8000-000000000103';
select throws_ok(
  $$select * from public.get_private_event_location('91000000-0000-4000-8000-000000000401',null)$$,
  'P0001', 'LOCATION_NOT_AUTHORIZED',
  'the committed block and retained removal immediately deny private-location access'
);
reset role;

do $cleanup$
declare
  connection_text constant text :=
    format('host=%s port=5432 dbname=postgres user=postgres password=postgres sslmode=disable', host(inet_server_addr()));
begin
  perform extensions.dblink_connect('b10_attendance_cleanup', connection_text);
  perform extensions.dblink_exec(
    'b10_attendance_cleanup',
    $remote$
      delete from public.security_audit_events
      where actor_id in (
        '91000000-0000-4000-8000-000000000101',
        '91000000-0000-4000-8000-000000000102',
        '91000000-0000-4000-8000-000000000103'
      );
      delete from public.user_blocks
      where blocker_id = '91000000-0000-4000-8000-000000000101';
      delete from public.event_attendance
      where event_id in (
        '91000000-0000-4000-8000-000000000401',
        '91000000-0000-4000-8000-000000000402'
      );
      delete from public.event_invitations
      where event_id = '91000000-0000-4000-8000-000000000402';
      delete from public.event_private_locations
      where event_id in (
        '91000000-0000-4000-8000-000000000401',
        '91000000-0000-4000-8000-000000000402'
      );
      delete from public.events
      where id in (
        '91000000-0000-4000-8000-000000000401',
        '91000000-0000-4000-8000-000000000402'
      );
      delete from public.friendships
      where user_low_id = '91000000-0000-4000-8000-000000000101';
      delete from public.matches
      where id = '91000000-0000-4000-8000-000000000204';
      delete from public.teams
      where id in (
        '91000000-0000-4000-8000-000000000202',
        '91000000-0000-4000-8000-000000000203'
      );
      delete from public.competitions
      where id = '91000000-0000-4000-8000-000000000201';
      delete from auth.users
      where id in (
        '91000000-0000-4000-8000-000000000101',
        '91000000-0000-4000-8000-000000000102',
        '91000000-0000-4000-8000-000000000103'
      );
    $remote$
  );
  perform extensions.dblink_disconnect('b10_attendance_cleanup');
end;
$cleanup$;

select * from finish();
rollback;
