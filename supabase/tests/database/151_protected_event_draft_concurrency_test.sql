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
  perform extensions.dblink_connect('task7_concurrency_setup', connection_text);
  perform extensions.dblink_exec(
    'task7_concurrency_setup',
    $remote$
      delete from public.security_audit_events
      where actor_id between
        '65100000-0000-4000-8000-000000000101' and
        '65100000-0000-4000-8000-000000000107';
      delete from public.events
      where created_by between
        '65100000-0000-4000-8000-000000000101' and
        '65100000-0000-4000-8000-000000000107';
      delete from public.event_drafts
      where owner_id between
        '65100000-0000-4000-8000-000000000101' and
        '65100000-0000-4000-8000-000000000107';
      delete from public.groups
      where id in (
        '65100000-0000-4000-8000-000000000205',
        '65100000-0000-4000-8000-000000000206'
      );
      delete from public.matches
      where id = '65100000-0000-4000-8000-000000000204';
      delete from public.teams
      where id in (
        '65100000-0000-4000-8000-000000000202',
        '65100000-0000-4000-8000-000000000203'
      );
      delete from public.competitions
      where id = '65100000-0000-4000-8000-000000000201';
      delete from auth.users
      where id between
        '65100000-0000-4000-8000-000000000101' and
        '65100000-0000-4000-8000-000000000107';

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
          ('65100000-0000-4000-8000-000000000101'::uuid, 'task7-double-finalize@example.com'),
          ('65100000-0000-4000-8000-000000000102'::uuid, 'task7-save-finalize@example.com'),
          ('65100000-0000-4000-8000-000000000103'::uuid, 'task7-save-discard@example.com'),
          ('65100000-0000-4000-8000-000000000104'::uuid, 'task7-race-owner@example.com'),
          ('65100000-0000-4000-8000-000000000105'::uuid, 'task7-race-admin@example.com'),
          ('65100000-0000-4000-8000-000000000106'::uuid, 'task7-race-member@example.com'),
          ('65100000-0000-4000-8000-000000000107'::uuid, 'task7-race-submitter@example.com')
      ) as fixture(id, email);

      update public.profiles
      set
        handle = 'task7_race_' || right(id::text, 3),
        display_name = 'Task Seven Race ' || right(id::text, 3),
        adult_attested_at = statement_timestamp(),
        rules_version = 1,
        rules_accepted_at = statement_timestamp(),
        profile_completed_at = statement_timestamp(),
        fan_enabled_at = statement_timestamp()
      where id between
        '65100000-0000-4000-8000-000000000101' and
        '65100000-0000-4000-8000-000000000107';

      insert into public.competitions (
        id, sport_id, provider, provider_external_id, code, name,
        country_name, last_synced_at
      )
      values (
        '65100000-0000-4000-8000-000000000201',
        '00000000-0000-4000-8000-000000000020',
        'task7-concurrency', 'competition', 'T7C',
        'Task Seven Concurrency League', 'England', statement_timestamp()
      );

      insert into public.teams (
        id, sport_id, provider, provider_external_id, name, short_name,
        tla, country_name, last_synced_at
      )
      values
        (
          '65100000-0000-4000-8000-000000000202',
          '00000000-0000-4000-8000-000000000020',
          'task7-concurrency', 'home-team', 'Task Seven Race Home FC',
          'T7 Race Home', 'T7H', 'England', statement_timestamp()
        ),
        (
          '65100000-0000-4000-8000-000000000203',
          '00000000-0000-4000-8000-000000000020',
          'task7-concurrency', 'away-team', 'Task Seven Race Away FC',
          'T7 Race Away', 'T7A', 'England', statement_timestamp()
        );

      insert into public.matches (
        id, provider, provider_external_id, competition_id, home_team_id,
        away_team_id, starts_at, status, matchday, season_label, last_synced_at
      )
      values (
        '65100000-0000-4000-8000-000000000204',
        'task7-concurrency', 'match',
        '65100000-0000-4000-8000-000000000201',
        '65100000-0000-4000-8000-000000000202',
        '65100000-0000-4000-8000-000000000203',
        statement_timestamp() + interval '7 days', 'timed', 1, '2026',
        statement_timestamp()
      );

      insert into public.groups (
        id, slug, name, owner_id, visibility, lifecycle, description
      )
      values
        (
          '65100000-0000-4000-8000-000000000205',
          'task-seven-race-group', 'Task Seven Race Group',
          '65100000-0000-4000-8000-000000000104',
          'unlisted', 'forming',
          'A deterministic group for publication role serialization.'
        ),
        (
          '65100000-0000-4000-8000-000000000206',
          'task-seven-reverse-group', 'Task Seven Reverse Group',
          '65100000-0000-4000-8000-000000000105',
          'unlisted', 'forming',
          'A second group for canonical multi-group lock ordering.'
        );

      insert into public.group_memberships (
        group_id, user_id, role, status, reviewed_by, reviewed_at
      )
      values
        (
          '65100000-0000-4000-8000-000000000205',
          '65100000-0000-4000-8000-000000000104',
          'owner', 'active', null, null
        ),
        (
          '65100000-0000-4000-8000-000000000205',
          '65100000-0000-4000-8000-000000000105',
          'admin', 'active',
          '65100000-0000-4000-8000-000000000104', statement_timestamp()
        ),
        (
          '65100000-0000-4000-8000-000000000205',
          '65100000-0000-4000-8000-000000000106',
          'member', 'active',
          '65100000-0000-4000-8000-000000000104', statement_timestamp()
        ),
        (
          '65100000-0000-4000-8000-000000000205',
          '65100000-0000-4000-8000-000000000107',
          'member', 'active',
          '65100000-0000-4000-8000-000000000104', statement_timestamp()
        ),
        (
          '65100000-0000-4000-8000-000000000206',
          '65100000-0000-4000-8000-000000000105',
          'owner', 'active', null, null
        ),
        (
          '65100000-0000-4000-8000-000000000206',
          '65100000-0000-4000-8000-000000000104',
          'admin', 'active',
          '65100000-0000-4000-8000-000000000105', statement_timestamp()
        );

      insert into public.event_drafts (
        id, owner_id, step, draft_values
      )
      values
        (
          '65100000-0000-4000-8000-000000000301',
          '65100000-0000-4000-8000-000000000101',
          3,
          jsonb_build_object(
            'matchId', '65100000-0000-4000-8000-000000000204',
            'title', 'Double-finalize draft',
            'description', 'Only one event may survive two concurrent finalizers.',
            'expectedActivity', 'Watch the full match.',
            'costDescription', 'Free.',
            'eventRules', 'Respect every attendee.',
            'commercialAffiliation', 'None.',
            'hostPresenceConfirmed', true,
            'placeKind', 'home',
            'audience', 'invite_only',
            'capacity', 6
          )
        ),
        (
          '65100000-0000-4000-8000-000000000302',
          '65100000-0000-4000-8000-000000000102',
          3,
          jsonb_build_object(
            'matchId', '65100000-0000-4000-8000-000000000204',
            'title', 'Before concurrent save',
            'description', 'Finalization must observe the committed save that held its row lock.',
            'expectedActivity', 'Watch the full match.',
            'costDescription', 'Free.',
            'eventRules', 'Respect every attendee.',
            'commercialAffiliation', 'None.',
            'hostPresenceConfirmed', true,
            'placeKind', 'home',
            'audience', 'invite_only',
            'capacity', 6
          )
        ),
        (
          '65100000-0000-4000-8000-000000000303',
          '65100000-0000-4000-8000-000000000103',
          3,
          jsonb_build_object(
            'matchId', '65100000-0000-4000-8000-000000000204',
            'title', 'Save then discard draft',
            'description', 'Discard must serialize behind a save and remove one whole aggregate.',
            'expectedActivity', 'Watch the full match.',
            'costDescription', 'Free.',
            'eventRules', 'Respect every attendee.',
            'commercialAffiliation', 'None.',
            'hostPresenceConfirmed', true,
            'placeKind', 'home',
            'audience', 'invite_only',
            'capacity', 6
          )
        );

      insert into public.event_draft_private_locations (
        draft_id, address_text, directions_text, location
      )
      values
        (
          '65100000-0000-4000-8000-000000000301',
          '31 Protected Race Lane, Haifa', null,
          extensions.st_setsrid(extensions.st_makepoint(34.9981, 32.8121), 4326)::extensions.geography
        ),
        (
          '65100000-0000-4000-8000-000000000302',
          '32 Protected Race Lane, Haifa', null,
          extensions.st_setsrid(extensions.st_makepoint(34.9982, 32.8122), 4326)::extensions.geography
        ),
        (
          '65100000-0000-4000-8000-000000000303',
          '33 Protected Race Lane, Haifa', null,
          extensions.st_setsrid(extensions.st_makepoint(34.9983, 32.8123), 4326)::extensions.geography
        );

      insert into public.events (
        id, created_by, host_user_id, organizing_group_id, match_id,
        title, description, expected_activity, cost_description,
        event_rules, commercial_affiliation, host_presence_confirmed_at,
        starts_at, ends_at, place_kind, public_place_name,
        public_address_text, public_location, audience, audience_group_id,
        capacity, requires_approval, status
      )
      values (
        '65100000-0000-4000-8000-000000000401',
        '65100000-0000-4000-8000-000000000107',
        '65100000-0000-4000-8000-000000000107',
        '65100000-0000-4000-8000-000000000205',
        '65100000-0000-4000-8000-000000000204',
        'Reviewer demotion race',
        'A pending event used to prove review checks current membership role.',
        'Watch the full match.', 'Free.', 'Respect every attendee.', 'None.',
        statement_timestamp(), statement_timestamp() + interval '7 days',
        statement_timestamp() + interval '7 days 3 hours',
        'public_place', 'Task Seven Race Square', '41 Race Square, Haifa',
        extensions.st_setsrid(extensions.st_makepoint(34.999, 32.813), 4326)::extensions.geography,
        'group', '65100000-0000-4000-8000-000000000205',
        20, true, 'pending_group_review'
      );
    $remote$
  );
  perform extensions.dblink_disconnect('task7_concurrency_setup');
end;
$setup$;

-- Both finalizers target one locked draft. The first keeps the deletion and
-- event uncommitted; the second must wait and then observe NOT_FOUND.
do $double_connections$
declare
  connection_text constant text :=
    format('host=%s port=5432 dbname=postgres user=postgres password=postgres sslmode=disable', host(inet_server_addr()));
begin
  perform extensions.dblink_connect('task7_finalize_first', connection_text);
  perform extensions.dblink_connect('task7_finalize_second', connection_text);
  perform extensions.dblink_exec('task7_finalize_first', 'begin');
  perform extensions.dblink_exec('task7_finalize_second', 'begin');
  perform extensions.dblink_exec('task7_finalize_first', 'set local role authenticated');
  perform extensions.dblink_exec('task7_finalize_second', 'set local role authenticated');
  perform extensions.dblink_exec(
    'task7_finalize_first',
    'set local "request.jwt.claim.sub" = ''65100000-0000-4000-8000-000000000101'''
  );
  perform extensions.dblink_exec(
    'task7_finalize_second',
    'set local "request.jwt.claim.sub" = ''65100000-0000-4000-8000-000000000101'''
  );
end;
$double_connections$;

select is(
  extensions.dblink_send_query(
    'task7_finalize_first',
    $$select * from public.finalize_event_draft('65100000-0000-4000-8000-000000000301', null)$$
  ),
  1,
  'the first finalizer starts in an independent transaction'
);
select lives_ok(
  $$
    select event_id, status
    from extensions.dblink_get_result('task7_finalize_first')
      as result(event_id uuid, status text)
  $$,
  'the first finalizer creates its event while retaining the draft row lock'
);
do $drain_first_finalize$
begin
  perform event_id, status
  from extensions.dblink_get_result('task7_finalize_first')
    as result(event_id uuid, status text);
end;
$drain_first_finalize$;

select is(
  extensions.dblink_send_query(
    'task7_finalize_second',
    $$select * from public.finalize_event_draft('65100000-0000-4000-8000-000000000301', null)$$
  ),
  1,
  'the duplicate finalizer starts in a second independent transaction'
);
do $allow_duplicate_to_wait$ begin perform pg_sleep(0.2); end; $allow_duplicate_to_wait$;
select is(
  extensions.dblink_is_busy('task7_finalize_second'),
  1,
  'the duplicate finalizer waits on the same draft row lock'
);
do $commit_first_finalize$
begin
  perform extensions.dblink_exec('task7_finalize_first', 'commit');
end;
$commit_first_finalize$;
select throws_ok(
  $$
    select event_id, status
    from extensions.dblink_get_result('task7_finalize_second')
      as result(event_id uuid, status text)
  $$,
  'P0001',
  'NOT_FOUND',
  'the duplicate finalizer fails closed after the winner deletes the draft'
);
do $close_double_connections$
begin
  begin perform extensions.dblink_exec('task7_finalize_second', 'rollback'); exception when others then null; end;
  perform extensions.dblink_disconnect('task7_finalize_first');
  perform extensions.dblink_disconnect('task7_finalize_second');
end;
$close_double_connections$;
select is(
  (
    select count(*)
    from public.events
    where created_by = '65100000-0000-4000-8000-000000000101'
      and title = 'Double-finalize draft'
  ),
  1::bigint,
  'two finalizers create exactly one event'
);
select is(
  (
    select count(*)
    from public.event_drafts
    where id = '65100000-0000-4000-8000-000000000301'
  ),
  0::bigint,
  'double finalization leaves no generic draft residue'
);

-- A completed save keeps the draft row locked. Finalization waits, then must
-- consume the newly committed canonical title rather than stale state.
do $save_finalize_connections$
declare
  connection_text constant text :=
    format('host=%s port=5432 dbname=postgres user=postgres password=postgres sslmode=disable', host(inet_server_addr()));
begin
  perform extensions.dblink_connect('task7_save_before_finalize', connection_text);
  perform extensions.dblink_connect('task7_finalize_after_save', connection_text);
  perform extensions.dblink_exec('task7_save_before_finalize', 'begin');
  perform extensions.dblink_exec('task7_finalize_after_save', 'begin');
  perform extensions.dblink_exec('task7_save_before_finalize', 'set local role authenticated');
  perform extensions.dblink_exec('task7_finalize_after_save', 'set local role authenticated');
  perform extensions.dblink_exec(
    'task7_save_before_finalize',
    'set local "request.jwt.claim.sub" = ''65100000-0000-4000-8000-000000000102'''
  );
  perform extensions.dblink_exec(
    'task7_finalize_after_save',
    'set local "request.jwt.claim.sub" = ''65100000-0000-4000-8000-000000000102'''
  );

  perform draft_id
  from extensions.dblink(
    'task7_save_before_finalize',
    $$
      select * from public.save_event_draft(
        '65100000-0000-4000-8000-000000000302', 3,
        '{"title":"Committed concurrent save"}'::jsonb,
        null, 'preserve', null, null, null, null
      )
    $$
  ) as saved(
    draft_id uuid, step integer, draft_values jsonb, organizing_group_id uuid,
    private_address_text text, private_directions_text text,
    private_longitude double precision, private_latitude double precision,
    updated_at timestamptz
  );
end;
$save_finalize_connections$;
select is(
  extensions.dblink_send_query(
    'task7_finalize_after_save',
    $$select * from public.finalize_event_draft('65100000-0000-4000-8000-000000000302', null)$$
  ),
  1,
  'finalization starts while a separate save transaction holds the draft lock'
);
do $allow_finalize_to_wait$ begin perform pg_sleep(0.2); end; $allow_finalize_to_wait$;
select is(
  extensions.dblink_is_busy('task7_finalize_after_save'),
  1,
  'finalization waits for the in-flight save'
);
do $commit_save_before_finalize$
begin
  perform extensions.dblink_exec('task7_save_before_finalize', 'commit');
end;
$commit_save_before_finalize$;
select lives_ok(
  $$
    select event_id, status
    from extensions.dblink_get_result('task7_finalize_after_save')
      as result(event_id uuid, status text)
  $$,
  'finalization succeeds against the committed saved state'
);
do $finish_save_finalize$
begin
  perform event_id, status
  from extensions.dblink_get_result('task7_finalize_after_save')
    as result(event_id uuid, status text);
  perform extensions.dblink_exec('task7_finalize_after_save', 'commit');
  perform extensions.dblink_disconnect('task7_save_before_finalize');
  perform extensions.dblink_disconnect('task7_finalize_after_save');
end;
$finish_save_finalize$;
select is(
  (
    select count(*)
    from public.events
    where created_by = '65100000-0000-4000-8000-000000000102'
      and title = 'Committed concurrent save'
  ),
  1::bigint,
  'the save/finalize race creates one event from the latest committed safe state'
);

-- Discard uses the same row lock. It waits for an in-flight save, then removes
-- the generic and protected rows as one terminal aggregate without an event.
do $save_discard_connections$
declare
  connection_text constant text :=
    format('host=%s port=5432 dbname=postgres user=postgres password=postgres sslmode=disable', host(inet_server_addr()));
begin
  perform extensions.dblink_connect('task7_save_before_discard', connection_text);
  perform extensions.dblink_connect('task7_discard_after_save', connection_text);
  perform extensions.dblink_exec('task7_save_before_discard', 'begin');
  perform extensions.dblink_exec('task7_discard_after_save', 'begin');
  perform extensions.dblink_exec('task7_save_before_discard', 'set local role authenticated');
  perform extensions.dblink_exec('task7_discard_after_save', 'set local role authenticated');
  perform extensions.dblink_exec(
    'task7_save_before_discard',
    'set local "request.jwt.claim.sub" = ''65100000-0000-4000-8000-000000000103'''
  );
  perform extensions.dblink_exec(
    'task7_discard_after_save',
    'set local "request.jwt.claim.sub" = ''65100000-0000-4000-8000-000000000103'''
  );
  perform draft_id
  from extensions.dblink(
    'task7_save_before_discard',
    $$
      select * from public.save_event_draft(
        '65100000-0000-4000-8000-000000000303', 3,
        '{"title":"Saved immediately before discard"}'::jsonb,
        null, 'preserve', null, null, null, null
      )
    $$
  ) as saved(
    draft_id uuid, step integer, draft_values jsonb, organizing_group_id uuid,
    private_address_text text, private_directions_text text,
    private_longitude double precision, private_latitude double precision,
    updated_at timestamptz
  );
end;
$save_discard_connections$;
select is(
  extensions.dblink_send_query(
    'task7_discard_after_save',
    $$select public.discard_event_draft('65100000-0000-4000-8000-000000000303')$$
  ),
  1,
  'discard starts while a separate save transaction holds the draft lock'
);
do $allow_discard_to_wait$ begin perform pg_sleep(0.2); end; $allow_discard_to_wait$;
select is(
  extensions.dblink_is_busy('task7_discard_after_save'),
  1,
  'discard waits for the in-flight save'
);
do $commit_save_before_discard$
begin
  perform extensions.dblink_exec('task7_save_before_discard', 'commit');
end;
$commit_save_before_discard$;
select lives_ok(
  $$
    select discarded
    from extensions.dblink_get_result('task7_discard_after_save')
      as result(discarded boolean)
  $$,
  'discard succeeds after the save commits'
);
do $finish_save_discard$
begin
  perform discarded
  from extensions.dblink_get_result('task7_discard_after_save')
    as result(discarded boolean);
  perform extensions.dblink_exec('task7_discard_after_save', 'commit');
  perform extensions.dblink_disconnect('task7_save_before_discard');
  perform extensions.dblink_disconnect('task7_discard_after_save');
end;
$finish_save_discard$;
select is(
  (
    select count(*)
    from public.event_drafts
    where id = '65100000-0000-4000-8000-000000000303'
  ) + (
    select count(*)
    from public.event_draft_private_locations
    where draft_id = '65100000-0000-4000-8000-000000000303'
  ) + (
    select count(*)
    from public.events
    where created_by = '65100000-0000-4000-8000-000000000103'
  ),
  0::bigint,
  'the save/discard race leaves one coherent no-draft, no-private-row, no-event terminal state'
);

-- Two direct publications govern the same pair of groups in reverse semantic
-- order. The lower publisher starts alone and is positively observed waiting
-- on its membership row after it has locked the first canonical group. Only
-- then may the reverse publisher start, where it must wait behind that proven
-- first winner. Every observation and remote statement has a bounded timeout.
set local statement_timeout = '25s';

create or replace function pg_temp.task7_wait_until_blocked_by(
  input_blocked_pid integer,
  input_blocker_pid integer,
  input_timeout interval default interval '5 seconds'
)
returns boolean
language plpgsql
volatile
set search_path = ''
as $wait$
declare
  deadline timestamp with time zone := pg_catalog.clock_timestamp() + input_timeout;
  blocked_state text;
  blocked_wait_type text;
  blocked_wait_event text;
  blocker_pids integer[];
begin
  loop
    -- PostgreSQL caches cumulative-statistics snapshots inside a transaction.
    -- Refresh before every observation so state/wait metadata describes this
    -- synchronization point rather than the connection's earlier idle state.
    perform pg_catalog.pg_stat_clear_snapshot();

    select activity.state, activity.wait_event_type, activity.wait_event
    into blocked_state, blocked_wait_type, blocked_wait_event
    from pg_catalog.pg_stat_activity as activity
    where activity.pid = input_blocked_pid;

    blocker_pids := pg_catalog.pg_blocking_pids(input_blocked_pid);

    if blocked_state = 'active'
      and blocked_wait_type = 'Lock'
      and input_blocker_pid = any(blocker_pids)
    then
      return true;
    end if;

    if pg_catalog.clock_timestamp() >= deadline then
      raise exception using
        errcode = '57014',
        message = pg_catalog.format(
          'Timed out waiting for backend %s to be blocked by %s (state=%s, wait=%s/%s, blockers=%s)',
          input_blocked_pid,
          input_blocker_pid,
          coalesce(blocked_state, '<missing>'),
          coalesce(blocked_wait_type, '<none>'),
          coalesce(blocked_wait_event, '<none>'),
          coalesce(blocker_pids::text, '{}')
        );
    end if;

    perform pg_catalog.pg_sleep(0.01);
  end loop;
end;
$wait$;

create temporary table task7_pair_backend_pids (
  connection_name text primary key,
  backend_pid integer not null
) on commit drop;

do $reverse_pair_connections$
declare
  connection_text constant text :=
    format('host=%s port=5432 dbname=postgres user=postgres password=postgres sslmode=disable', host(inet_server_addr()));
begin
  perform extensions.dblink_connect('task7_pair_block_low', connection_text);
  perform extensions.dblink_connect('task7_pair_block_high', connection_text);
  perform extensions.dblink_connect('task7_pair_publish_low', connection_text);
  perform extensions.dblink_connect('task7_pair_publish_high', connection_text);

  perform extensions.dblink_exec('task7_pair_block_low', 'begin');
  perform extensions.dblink_exec('task7_pair_block_high', 'begin');
  perform extensions.dblink_exec('task7_pair_publish_low', 'begin');
  perform extensions.dblink_exec('task7_pair_publish_high', 'begin');

  perform extensions.dblink_exec(
    'task7_pair_publish_low',
    'set local statement_timeout = ''20s'''
  );
  perform extensions.dblink_exec(
    'task7_pair_publish_high',
    'set local statement_timeout = ''20s'''
  );

  perform extensions.dblink_exec(
    'task7_pair_block_low',
    $remote$
      do $block$
      declare
        locked_membership record;
      begin
        select membership.*
        into strict locked_membership
        from public.group_memberships as membership
        where membership.group_id = '65100000-0000-4000-8000-000000000205'
          and membership.user_id = '65100000-0000-4000-8000-000000000104'
        for update;
      end;
      $block$
    $remote$
  );
  perform extensions.dblink_exec(
    'task7_pair_block_high',
    $remote$
      do $block$
      declare
        locked_membership record;
      begin
        select membership.*
        into strict locked_membership
        from public.group_memberships as membership
        where membership.group_id = '65100000-0000-4000-8000-000000000206'
          and membership.user_id = '65100000-0000-4000-8000-000000000105'
        for update;
      end;
      $block$
    $remote$
  );

  perform extensions.dblink_exec('task7_pair_publish_low', 'set local role authenticated');
  perform extensions.dblink_exec('task7_pair_publish_high', 'set local role authenticated');
  perform extensions.dblink_exec(
    'task7_pair_publish_low',
    'set local "request.jwt.claim.sub" = ''65100000-0000-4000-8000-000000000104'''
  );
  perform extensions.dblink_exec(
    'task7_pair_publish_high',
    'set local "request.jwt.claim.sub" = ''65100000-0000-4000-8000-000000000105'''
  );
end;
$reverse_pair_connections$;

insert into task7_pair_backend_pids (connection_name, backend_pid)
select connection.connection_name, backend.backend_pid
from (
  values
    ('block_low', 'task7_pair_block_low'),
    ('block_high', 'task7_pair_block_high'),
    ('publish_low', 'task7_pair_publish_low'),
    ('publish_high', 'task7_pair_publish_high')
) as connection(connection_name, dblink_name)
cross join lateral extensions.dblink(
  connection.dblink_name,
  'select pg_backend_pid()'
) as backend(backend_pid integer);

select is(
  extensions.dblink_send_query(
    'task7_pair_publish_low',
    $remote$
      select * from public.create_or_update_event(
        null, null, '65100000-0000-4000-8000-000000000205',
        '65100000-0000-4000-8000-000000000204',
        'Canonical pair publication low',
        'The lower organizer and higher audience must use canonical locks.',
        'Watch the full match.', 'Free.', 'Respect every attendee.', 'None.', true,
        (select starts_at from public.matches where id = '65100000-0000-4000-8000-000000000204'),
        (select starts_at + interval '3 hours' from public.matches where id = '65100000-0000-4000-8000-000000000204'),
        'public_place', null, 'Task Seven Pair Square', '51 Pair Square, Haifa',
        34.999, 32.813, 'group', null,
        '65100000-0000-4000-8000-000000000206', 20, true,
        null, null, null, null, 'publish',
        '65100000-0000-4000-8000-000000000502'
      )
    $remote$
  ),
  1,
  'the lower-organizer publication starts in its own transaction'
);
select ok(
  pg_temp.task7_wait_until_blocked_by(
    (
      select backend_pid
      from task7_pair_backend_pids
      where connection_name = 'publish_low'
    ),
    (
      select backend_pid
      from task7_pair_backend_pids
      where connection_name = 'block_low'
    )
  ),
  'the lower publisher is proven to hold the first canonical group lock before the reverse publisher starts'
);
select is(
  extensions.dblink_send_query(
    'task7_pair_publish_high',
    $remote$
      select * from public.create_or_update_event(
        null, null, '65100000-0000-4000-8000-000000000206',
        '65100000-0000-4000-8000-000000000204',
        'Canonical pair publication high',
        'The higher organizer and lower audience must use canonical locks.',
        'Watch the full match.', 'Free.', 'Respect every attendee.', 'None.', true,
        (select starts_at from public.matches where id = '65100000-0000-4000-8000-000000000204'),
        (select starts_at + interval '3 hours' from public.matches where id = '65100000-0000-4000-8000-000000000204'),
        'public_place', null, 'Task Seven Reverse Square', '52 Pair Square, Haifa',
        34.999, 32.813, 'group', null,
        '65100000-0000-4000-8000-000000000205', 20, true,
        null, null, null, null, 'publish',
        '65100000-0000-4000-8000-000000000503'
      )
    $remote$
  ),
  1,
  'the reverse group-pair publication starts independently'
);
select ok(
  pg_temp.task7_wait_until_blocked_by(
    (
      select backend_pid
      from task7_pair_backend_pids
      where connection_name = 'publish_high'
    ),
    (
      select backend_pid
      from task7_pair_backend_pids
      where connection_name = 'publish_low'
    )
  ),
  'the reverse publisher is proven to wait behind the established canonical lock winner'
);

do $release_low_pair_blocker$
begin
  perform extensions.dblink_exec('task7_pair_block_low', 'commit');
end;
$release_low_pair_blocker$;

select lives_ok(
  $$
    select event_id, status
    from extensions.dblink_get_result('task7_pair_publish_low')
      as result(event_id uuid, status text)
    where status = 'published'
  $$,
  'the canonical lower-group publication completes without deadlock'
);
do $commit_low_pair_publication$
begin
  perform event_id, status
  from extensions.dblink_get_result('task7_pair_publish_low')
    as result(event_id uuid, status text);
  perform extensions.dblink_exec('task7_pair_publish_low', 'commit');
end;
$commit_low_pair_publication$;

select ok(
  pg_temp.task7_wait_until_blocked_by(
    (
      select backend_pid
      from task7_pair_backend_pids
      where connection_name = 'publish_high'
    ),
    (
      select backend_pid
      from task7_pair_backend_pids
      where connection_name = 'block_high'
    )
  ),
  'after the winner commits, the reverse publisher reaches its own higher-group membership blocker'
);
do $release_high_pair_blocker$
begin
  perform extensions.dblink_exec('task7_pair_block_high', 'commit');
end;
$release_high_pair_blocker$;

select lives_ok(
  $$
    select event_id, status
    from extensions.dblink_get_result('task7_pair_publish_high')
      as result(event_id uuid, status text)
    where status = 'published'
  $$,
  'the reverse pair publication proceeds after the canonical lock winner commits'
);
do $finish_reverse_pair_connections$
begin
  perform event_id, status
  from extensions.dblink_get_result('task7_pair_publish_high')
    as result(event_id uuid, status text);
  perform extensions.dblink_exec('task7_pair_publish_high', 'commit');
  perform extensions.dblink_disconnect('task7_pair_block_low');
  perform extensions.dblink_disconnect('task7_pair_block_high');
  perform extensions.dblink_disconnect('task7_pair_publish_low');
  perform extensions.dblink_disconnect('task7_pair_publish_high');
end;
$finish_reverse_pair_connections$;
set local statement_timeout = '0';
select is(
  (
    select count(*)
    from public.events
    where id in (
      select audit.resource_id
      from public.security_audit_events as audit
      where audit.request_id in (
        '65100000-0000-4000-8000-000000000502',
        '65100000-0000-4000-8000-000000000503'
      )
        and audit.action = 'event.group_publish.author'
    )
      and status = 'published'
  ),
  2::bigint,
  'both reverse-pair publications commit exactly one governed event'
);

-- A role mutation that commits first is authoritative. Creation waits on the
-- locked membership row, then observes the promoted admin role and publishes.
do $promotion_connections$
declare
  connection_text constant text :=
    format('host=%s port=5432 dbname=postgres user=postgres password=postgres sslmode=disable', host(inet_server_addr()));
begin
  perform extensions.dblink_connect('task7_role_promoter', connection_text);
  perform extensions.dblink_connect('task7_group_publisher', connection_text);
  perform extensions.dblink_exec('task7_role_promoter', 'begin');
  perform extensions.dblink_exec('task7_group_publisher', 'begin');
  perform extensions.dblink_exec(
    'task7_role_promoter',
    $$
      update public.group_memberships
      set role = 'admin'
      where group_id = '65100000-0000-4000-8000-000000000205'
        and user_id = '65100000-0000-4000-8000-000000000106'
    $$
  );
  perform extensions.dblink_exec('task7_group_publisher', 'set local role authenticated');
  perform extensions.dblink_exec(
    'task7_group_publisher',
    'set local "request.jwt.claim.sub" = ''65100000-0000-4000-8000-000000000106'''
  );
end;
$promotion_connections$;
select is(
  extensions.dblink_send_query(
    'task7_group_publisher',
    $remote$
      select * from public.create_group_event(
        '65100000-0000-4000-8000-000000000205',
        '65100000-0000-4000-8000-000000000204',
        'Promoted author publication',
        'A role-change race must publish only after observing current membership.',
        'Watch the full match.', 'Free.', 'Respect every attendee.', 'None.', true,
        (select starts_at from public.matches where id = '65100000-0000-4000-8000-000000000204'),
        (select starts_at + interval '3 hours' from public.matches where id = '65100000-0000-4000-8000-000000000204'),
        'public_place', 'Task Seven Race Square', '42 Race Square, Haifa',
        34.999, 32.813, 'group', '65100000-0000-4000-8000-000000000205',
        20, null, null, null, null, 'publish',
        '65100000-0000-4000-8000-000000000501'
      )
    $remote$
  ),
  1,
  'group publication starts while a separate role transaction holds membership'
);
do $allow_publication_to_wait$ begin perform pg_sleep(0.2); end; $allow_publication_to_wait$;
select is(
  extensions.dblink_is_busy('task7_group_publisher'),
  1,
  'group publication waits on the current membership row'
);
do $commit_promotion$
begin
  perform extensions.dblink_exec('task7_role_promoter', 'commit');
end;
$commit_promotion$;
select lives_ok(
  $$
    select event_id, status
    from extensions.dblink_get_result('task7_group_publisher')
      as result(event_id uuid, status text)
    where status = 'published'
  $$,
  'publication observes the committed admin promotion and publishes atomically'
);
do $finish_promotion_connections$
begin
  perform event_id, status
  from extensions.dblink_get_result('task7_group_publisher')
    as result(event_id uuid, status text);
  perform extensions.dblink_exec('task7_group_publisher', 'commit');
  perform extensions.dblink_disconnect('task7_role_promoter');
  perform extensions.dblink_disconnect('task7_group_publisher');
end;
$finish_promotion_connections$;
select is(
  (
    select count(*)
    from public.security_audit_events
    where request_id = '65100000-0000-4000-8000-000000000501'
      and action = 'event.group_publish.author'
      and metadata ->> 'author_role' = 'admin'
      and metadata ->> 'status' = 'published'
  ),
  1::bigint,
  'the role-change winner is reflected truthfully in author-publication audit evidence'
);

-- Review locks the same membership row. A demotion that commits first makes
-- the waiting reviewer ineligible; the pending event remains unchanged.
do $demotion_connections$
declare
  connection_text constant text :=
    format('host=%s port=5432 dbname=postgres user=postgres password=postgres sslmode=disable', host(inet_server_addr()));
begin
  perform extensions.dblink_connect('task7_role_demoter', connection_text);
  perform extensions.dblink_connect('task7_group_reviewer', connection_text);
  perform extensions.dblink_exec('task7_role_demoter', 'begin');
  perform extensions.dblink_exec('task7_group_reviewer', 'begin');
  perform extensions.dblink_exec(
    'task7_role_demoter',
    $$
      update public.group_memberships
      set role = 'member'
      where group_id = '65100000-0000-4000-8000-000000000205'
        and user_id = '65100000-0000-4000-8000-000000000105'
    $$
  );
  perform extensions.dblink_exec('task7_group_reviewer', 'set local role authenticated');
  perform extensions.dblink_exec(
    'task7_group_reviewer',
    'set local "request.jwt.claim.sub" = ''65100000-0000-4000-8000-000000000105'''
  );
end;
$demotion_connections$;
select is(
  extensions.dblink_send_query(
    'task7_group_reviewer',
    $$
      select * from public.publish_group_event(
        '65100000-0000-4000-8000-000000000401', 'approve', null
      )
    $$
  ),
  1,
  'review starts while a separate role transaction holds reviewer membership'
);
do $allow_review_to_wait$ begin perform pg_sleep(0.2); end; $allow_review_to_wait$;
select is(
  extensions.dblink_is_busy('task7_group_reviewer'),
  1,
  'review waits on the current reviewer membership row'
);
do $commit_demotion$
begin
  perform extensions.dblink_exec('task7_role_demoter', 'commit');
end;
$commit_demotion$;
select throws_ok(
  $$
    select event_id, status, decision
    from extensions.dblink_get_result('task7_group_reviewer')
      as result(event_id uuid, status text, decision text)
  $$,
  'P0001',
  'NOT_FOUND',
  'review observes the committed demotion and fails closed'
);
do $finish_demotion_connections$
begin
  begin perform extensions.dblink_exec('task7_group_reviewer', 'rollback'); exception when others then null; end;
  perform extensions.dblink_disconnect('task7_role_demoter');
  perform extensions.dblink_disconnect('task7_group_reviewer');
end;
$finish_demotion_connections$;
select is(
  (
    select status::text
    from public.events
    where id = '65100000-0000-4000-8000-000000000401'
  ),
  'pending_group_review',
  'a demotion racing review preserves the pending event without an unauthorized decision'
);

select is(
  (
    select count(*)
    from public.security_audit_events
    where metadata::text ilike any(array[
      '%Protected Race Lane%',
      '%privateAddress%',
      '%privateLongitude%',
      '%privateLatitude%'
    ])
  ),
  0::bigint,
  'concurrent transitions never copy protected draft values into audit metadata'
);

do $cleanup$
declare
  connection_text constant text :=
    format('host=%s port=5432 dbname=postgres user=postgres password=postgres sslmode=disable', host(inet_server_addr()));
begin
  perform extensions.dblink_connect('task7_concurrency_cleanup', connection_text);
  perform extensions.dblink_exec(
    'task7_concurrency_cleanup',
    $remote$
      delete from public.security_audit_events
      where actor_id between
        '65100000-0000-4000-8000-000000000101' and
        '65100000-0000-4000-8000-000000000107';
      delete from public.events
      where created_by between
        '65100000-0000-4000-8000-000000000101' and
        '65100000-0000-4000-8000-000000000107';
      delete from public.event_drafts
      where owner_id between
        '65100000-0000-4000-8000-000000000101' and
        '65100000-0000-4000-8000-000000000107';
      delete from public.groups
      where id in (
        '65100000-0000-4000-8000-000000000205',
        '65100000-0000-4000-8000-000000000206'
      );
      delete from public.matches
      where id = '65100000-0000-4000-8000-000000000204';
      delete from public.teams
      where id in (
        '65100000-0000-4000-8000-000000000202',
        '65100000-0000-4000-8000-000000000203'
      );
      delete from public.competitions
      where id = '65100000-0000-4000-8000-000000000201';
      delete from auth.users
      where id between
        '65100000-0000-4000-8000-000000000101' and
        '65100000-0000-4000-8000-000000000107';
    $remote$
  );
  perform extensions.dblink_disconnect('task7_concurrency_cleanup');
end;
$cleanup$;

select is(
  (
    select count(*)
    from auth.users
    where id between
      '65100000-0000-4000-8000-000000000101' and
      '65100000-0000-4000-8000-000000000107'
  ),
  0::bigint,
  'independent-session concurrency users are removed after the race matrix'
);

select is(
  (
    select count(*)
    from public.competitions
    where id = '65100000-0000-4000-8000-000000000201'
  ),
  0::bigint,
  'independent-session concurrency catalog and dependent rows leave no committed residue'
);

select * from finish();
rollback;
