begin;

create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public, pg_catalog;

select no_plan();

select has_table(
  'public',
  'event_drafts',
  'Fan creation starts in a persisted draft domain rather than an event row'
);
select has_table(
  'public',
  'event_draft_private_locations',
  'draft home details live in a separate protected relation'
);

select is(
  (
    select relation.relrowsecurity and relation.relforcerowsecurity
    from pg_class as relation
    join pg_namespace as namespace on namespace.oid = relation.relnamespace
    where namespace.nspname = 'public'
      and relation.relname = 'event_drafts'
  ),
  true,
  'generic draft rows enable and force RLS'
);
select is(
  (
    select relation.relrowsecurity and relation.relforcerowsecurity
    from pg_class as relation
    join pg_namespace as namespace on namespace.oid = relation.relnamespace
    where namespace.nspname = 'public'
      and relation.relname = 'event_draft_private_locations'
  ),
  true,
  'protected draft locations enable and force RLS'
);

select has_column('public', 'event_drafts', 'owner_id', 'draft ownership is explicit');
select has_column('public', 'event_drafts', 'step', 'draft progress is persisted');
select has_column('public', 'event_drafts', 'draft_values', 'safe draft values use one canonical JSON payload');
select has_column('public', 'event_drafts', 'organizing_group_id', 'group authorship is explicit');
select hasnt_column('public', 'event_drafts', 'address_text', 'generic drafts never store an exact address');
select hasnt_column('public', 'event_drafts', 'location', 'generic drafts never store exact coordinates');
select has_column('public', 'event_draft_private_locations', 'address_text', 'exact address stays in the protected relation');
select has_column('public', 'event_draft_private_locations', 'location', 'exact coordinates stay in the protected relation');
select col_is_fk('public', 'event_drafts', 'owner_id', 'draft owners reference profiles');
select col_is_fk('public', 'event_draft_private_locations', 'draft_id', 'protected locations cascade from their draft');
select has_index('public', 'event_drafts', 'event_drafts_owner_updated_idx', 'owner recovery is indexed');
select has_index('public', 'event_drafts', 'event_drafts_organizing_group_idx', 'group draft lookup is indexed');
select has_index(
  'public',
  'event_draft_private_locations',
  'event_draft_private_locations_location_gist_idx',
  'protected draft distance checks are spatially indexed'
);

select is(
  (
    select count(*)
    from information_schema.role_table_grants
    where table_schema = 'public'
      and table_name in ('event_drafts', 'event_draft_private_locations')
      and grantee in ('PUBLIC', 'anon', 'authenticated')
  ),
  0::bigint,
  'clients receive no direct draft-table grants'
);
select is(
  (
    select count(*)
    from pg_policies
    where schemaname = 'public'
      and tablename in ('event_drafts', 'event_draft_private_locations')
  ),
  0::bigint,
  'draft relations expose no direct RLS policy path'
);

select isnt(
  to_regprocedure(
    'public.save_event_draft(uuid,integer,jsonb,uuid,text,text,text,double precision,double precision)'
  ),
  null::regprocedure,
  'draft saves use one controlled function with explicit protected-location semantics'
);
select isnt(
  to_regprocedure('public.get_event_draft(uuid)'),
  null::regprocedure,
  'draft recovery uses one owner-authorized projection'
);
select isnt(
  to_regprocedure('public.discard_event_draft(uuid)'),
  null::regprocedure,
  'draft discard uses one owner-authorized transition'
);
select isnt(
  to_regprocedure('public.finalize_event_draft(uuid,uuid)'),
  null::regprocedure,
  'draft finalization uses one row-locking transaction'
);

select ok(
  coalesce((
    select pg_catalog.has_function_privilege('authenticated', procedure.oid, 'execute')
    from pg_proc as procedure
    join pg_namespace as namespace on namespace.oid = procedure.pronamespace
    where namespace.nspname = 'public'
      and procedure.oid = to_regprocedure(
        'public.save_event_draft(uuid,integer,jsonb,uuid,text,text,text,double precision,double precision)'
      )
  ), false),
  'authenticated Fans may save through the controlled draft transition'
);
select ok(
  coalesce((
    select not pg_catalog.has_function_privilege('anon', procedure.oid, 'execute')
    from pg_proc as procedure
    join pg_namespace as namespace on namespace.oid = procedure.pronamespace
    where namespace.nspname = 'public'
      and procedure.oid = to_regprocedure('public.get_event_draft(uuid)')
  ), false),
  'anonymous callers cannot recover drafts'
);
select is(
  (
    select procedure.proconfig
    from pg_proc as procedure
    where procedure.oid = to_regprocedure('public.finalize_event_draft(uuid,uuid)')
  ),
  array['search_path=""']::text[],
  'draft finalization pins an empty search path'
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
    '65000000-0000-4000-8000-000000000101',
    'authenticated',
    'authenticated',
    'task7-owner@example.com',
    statement_timestamp(),
    '{}'::jsonb,
    '{}'::jsonb,
    statement_timestamp(),
    statement_timestamp()
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    '65000000-0000-4000-8000-000000000102',
    'authenticated',
    'authenticated',
    'task7-other@example.com',
    statement_timestamp(),
    '{}'::jsonb,
    '{}'::jsonb,
    statement_timestamp(),
    statement_timestamp()
  );

update public.profiles
set
  handle = case id
    when '65000000-0000-4000-8000-000000000101' then 'task7_owner'
    else 'task7_other'
  end,
  display_name = case id
    when '65000000-0000-4000-8000-000000000101' then 'Task Seven Owner'
    else 'Task Seven Other'
  end,
  city_id = (select id from public.cities where slug = 'haifa'),
  adult_attested_at = statement_timestamp(),
  rules_version = 1,
  rules_accepted_at = statement_timestamp(),
  profile_completed_at = statement_timestamp(),
  fan_enabled_at = statement_timestamp()
where id in (
  '65000000-0000-4000-8000-000000000101',
  '65000000-0000-4000-8000-000000000102'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '65000000-0000-4000-8000-000000000101', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

select lives_ok(
  $test$
  do $body$
  declare
    saved record;
  begin
    select *
    into saved
    from public.save_event_draft(
      null,
      2,
      jsonb_build_object(
        'matchId', '65000000-0000-4000-8000-000000000204',
        'cityId', (select id::text from public.cities where slug = 'haifa'),
        'placeKind', 'home',
        'audience', 'friends',
        'title', 'Protected draft',
        'capacity', 6,
        'unknown', 'discard me',
        'privateAddressText', 'must never persist in generic JSON',
        'privateLongitude', 34.998
      ),
      null,
      'replace',
      '17 Protected Lane, Haifa',
      'Ring apartment 4 only after approval.',
      34.998,
      32.812
    );

    if saved.draft_id is null or saved.step <> 2 then
      raise exception 'save did not return the persisted draft identity and step';
    end if;

    perform set_config('test.task7_owner_draft', saved.draft_id::text, true);
  end;
  $body$
  $test$,
  'an active Fan can create a protected draft without creating an event'
);

select lives_ok(
  $test$
  do $body$
  declare
    recovered record;
  begin
    select *
    into recovered
    from public.get_event_draft(current_setting('test.task7_owner_draft')::uuid);

    if recovered.step <> 2
       or recovered.draft_values ->> 'title' <> 'Protected draft'
       or recovered.draft_values ? 'unknown'
       or recovered.draft_values ? 'privateAddressText'
       or recovered.draft_values ? 'privateLongitude'
       or recovered.private_address_text <> '17 Protected Lane, Haifa'
       or recovered.private_directions_text <> 'Ring apartment 4 only after approval.'
       or abs(recovered.private_longitude - 34.998) > 0.000001
       or abs(recovered.private_latitude - 32.812) > 0.000001 then
      raise exception 'owner projection did not preserve safe/protected separation';
    end if;
  end;
  $body$
  $test$,
  'owner recovery returns canonical safe values and separately named protected fields'
);

select throws_ok(
  $$ select count(*) from public.event_drafts $$,
  '42501',
  null,
  'authenticated clients cannot select generic draft rows directly'
);
select throws_ok(
  $$ select count(*) from public.event_draft_private_locations $$,
  '42501',
  null,
  'authenticated clients cannot select protected draft rows directly'
);

select lives_ok(
  $test$
  do $body$
  declare
    saved record;
    recovered record;
  begin
    select *
    into saved
    from public.save_event_draft(
      current_setting('test.task7_owner_draft')::uuid,
      3,
      '{"title":"Protected draft renamed"}'::jsonb,
      null,
      'preserve',
      null,
      null,
      null,
      null
    );

    select *
    into recovered
    from public.get_event_draft(saved.draft_id);

    if recovered.draft_values ->> 'title' <> 'Protected draft renamed'
       or recovered.draft_values ->> 'audience' <> 'friends'
       or recovered.private_address_text <> '17 Protected Lane, Haifa' then
      raise exception 'partial save did not merge safe values or preserve protected values';
    end if;
  end;
  $body$
  $test$,
  'partial safe saves merge canonically and preserve protected values explicitly'
);

select lives_ok(
  $test$
  do $body$
  declare
    recovered record;
  begin
    perform public.save_event_draft(
      current_setting('test.task7_owner_draft')::uuid,
      3,
      '{}'::jsonb,
      null,
      'replace',
      '99 Replacement Road, Haifa',
      'Use the blue entrance.',
      34.999,
      32.813
    );
    select * into recovered
    from public.get_event_draft(current_setting('test.task7_owner_draft')::uuid);
    if recovered.private_address_text <> '99 Replacement Road, Haifa'
       or recovered.private_directions_text <> 'Use the blue entrance.' then
      raise exception 'replacement did not replace the protected row';
    end if;

    perform public.save_event_draft(
      current_setting('test.task7_owner_draft')::uuid,
      3,
      '{}'::jsonb,
      null,
      'clear',
      null,
      null,
      null,
      null
    );
    select * into recovered
    from public.get_event_draft(current_setting('test.task7_owner_draft')::uuid);
    if recovered.private_address_text is not null
       or recovered.private_longitude is not null then
      raise exception 'clear did not remove the protected row';
    end if;
  end;
  $body$
  $test$,
  'protected location updates have deterministic replace and clear semantics'
);

select set_config('request.jwt.claim.sub', '65000000-0000-4000-8000-000000000102', true);
select throws_ok(
  format(
    'select * from public.get_event_draft(%L::uuid)',
    coalesce(
      nullif(current_setting('test.task7_owner_draft', true), ''),
      '65000000-0000-4000-8000-000000000901'
    )
  ),
  'P0001',
  'NOT_FOUND',
  'another Fan cannot recover an owner draft'
);
select throws_ok(
  format(
    'select public.discard_event_draft(%L::uuid)',
    coalesce(
      nullif(current_setting('test.task7_owner_draft', true), ''),
      '65000000-0000-4000-8000-000000000901'
    )
  ),
  'P0001',
  'NOT_FOUND',
  'another Fan cannot discard an owner draft'
);

reset role;

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
    ('65000000-0000-4000-8000-000000000104'::uuid, 'task7-group-owner@example.com'),
    ('65000000-0000-4000-8000-000000000105'::uuid, 'task7-group-admin@example.com'),
    ('65000000-0000-4000-8000-000000000106'::uuid, 'task7-group-member@example.com'),
    ('65000000-0000-4000-8000-000000000107'::uuid, 'task7-friend@example.com'),
    ('65000000-0000-4000-8000-000000000108'::uuid, 'task7-second-member@example.com'),
    ('65000000-0000-4000-8000-000000000109'::uuid, 'task7-group-finalizer@example.com')
) as fixture(id, email);

update public.profiles
set
  handle = case id
    when '65000000-0000-4000-8000-000000000104' then 'task7_group_owner'
    when '65000000-0000-4000-8000-000000000105' then 'task7_group_admin'
    when '65000000-0000-4000-8000-000000000106' then 'task7_group_member'
    when '65000000-0000-4000-8000-000000000107' then 'task7_friend'
    when '65000000-0000-4000-8000-000000000108' then 'task7_second_member'
    else 'task7_group_finalizer'
  end,
  display_name = 'Task Seven Fan ' || right(id::text, 3),
  city_id = (select id from public.cities where slug = 'haifa'),
  adult_attested_at = statement_timestamp(),
  rules_version = 1,
  rules_accepted_at = statement_timestamp(),
  profile_completed_at = statement_timestamp(),
  fan_enabled_at = statement_timestamp()
where id between
  '65000000-0000-4000-8000-000000000104' and
  '65000000-0000-4000-8000-000000000109';

insert into public.competitions (
  id, sport_id, provider, provider_external_id, code, name, country_name, last_synced_at
)
values (
  '65000000-0000-4000-8000-000000000201',
  '00000000-0000-4000-8000-000000000020',
  'task7-test',
  'competition',
  'T7',
  'Task Seven Premier League',
  'England',
  statement_timestamp()
);

insert into public.teams (
  id, sport_id, provider, provider_external_id, name, short_name, tla, country_name, last_synced_at
)
values
  (
    '65000000-0000-4000-8000-000000000202',
    '00000000-0000-4000-8000-000000000020',
    'task7-test',
    'home-team',
    'Task Seven Arsenal FC',
    'Task Seven Arsenal',
    'T7A',
    'England',
    statement_timestamp()
  ),
  (
    '65000000-0000-4000-8000-000000000203',
    '00000000-0000-4000-8000-000000000020',
    'task7-test',
    'away-team',
    'Task Seven Chelsea FC',
    'Task Seven Chelsea',
    'T7C',
    'England',
    statement_timestamp()
  );

insert into public.matches (
  id,
  provider,
  provider_external_id,
  competition_id,
  home_team_id,
  away_team_id,
  starts_at,
  status,
  matchday,
  season_label,
  last_synced_at
)
values
  (
    '65000000-0000-4000-8000-000000000204',
    'task7-test',
    'match',
    '65000000-0000-4000-8000-000000000201',
    '65000000-0000-4000-8000-000000000202',
    '65000000-0000-4000-8000-000000000203',
    statement_timestamp() + interval '7 days',
    'timed',
    1,
    '2026',
    statement_timestamp()
  ),
  (
    '65000000-0000-4000-8000-000000000206',
    'task7-test',
    'match-failure',
    '65000000-0000-4000-8000-000000000201',
    '65000000-0000-4000-8000-000000000202',
    '65000000-0000-4000-8000-000000000203',
    statement_timestamp() + interval '8 days',
    'timed',
    2,
    '2026',
    statement_timestamp()
  );

insert into public.friendships (
  user_low_id, user_high_id, requested_by, status, responded_at
)
values (
  '65000000-0000-4000-8000-000000000101',
  '65000000-0000-4000-8000-000000000107',
  '65000000-0000-4000-8000-000000000101',
  'accepted',
  statement_timestamp()
);

insert into public.groups (
  id, slug, name, owner_id, city_id, visibility, lifecycle, description
)
values
  (
    '65000000-0000-4000-8000-000000000205',
    'task-seven-supporters',
    'Task Seven Supporters',
    '65000000-0000-4000-8000-000000000104',
    (select id from public.cities where slug = 'haifa'),
    'unlisted',
    'forming',
    'A private supporter group for atomic publication tests.'
  ),
  (
    '65000000-0000-4000-8000-000000000207',
    'task-seven-audience',
    'Task Seven Audience',
    '65000000-0000-4000-8000-000000000104',
    (select id from public.cities where slug = 'haifa'),
    'unlisted',
    'forming',
    'A distinct audience group for organizer independence tests.'
  );

insert into public.group_memberships (
  group_id, user_id, role, status, reviewed_by, reviewed_at
)
values
  (
    '65000000-0000-4000-8000-000000000205',
    '65000000-0000-4000-8000-000000000104',
    'owner',
    'active',
    null,
    null
  ),
  (
    '65000000-0000-4000-8000-000000000205',
    '65000000-0000-4000-8000-000000000105',
    'admin',
    'active',
    '65000000-0000-4000-8000-000000000104',
    statement_timestamp()
  ),
  (
    '65000000-0000-4000-8000-000000000205',
    '65000000-0000-4000-8000-000000000106',
    'member',
    'active',
    '65000000-0000-4000-8000-000000000104',
    statement_timestamp()
  ),
  (
    '65000000-0000-4000-8000-000000000205',
    '65000000-0000-4000-8000-000000000108',
    'member',
    'active',
    '65000000-0000-4000-8000-000000000104',
    statement_timestamp()
  ),
  (
    '65000000-0000-4000-8000-000000000205',
    '65000000-0000-4000-8000-000000000109',
    'member',
    'active',
    '65000000-0000-4000-8000-000000000104',
    statement_timestamp()
  ),
  (
    '65000000-0000-4000-8000-000000000205',
    '65000000-0000-4000-8000-000000000101',
    'member',
    'active',
    '65000000-0000-4000-8000-000000000104',
    statement_timestamp()
  ),
  (
    '65000000-0000-4000-8000-000000000205',
    '65000000-0000-4000-8000-000000000102',
    'member',
    'active',
    '65000000-0000-4000-8000-000000000104',
    statement_timestamp()
  ),
  (
    '65000000-0000-4000-8000-000000000205',
    '65000000-0000-4000-8000-000000000107',
    'admin',
    'active',
    '65000000-0000-4000-8000-000000000104',
    statement_timestamp()
  ),
  (
    '65000000-0000-4000-8000-000000000207',
    '65000000-0000-4000-8000-000000000104',
    'owner',
    'active',
    null,
    null
  ),
  (
    '65000000-0000-4000-8000-000000000207',
    '65000000-0000-4000-8000-000000000105',
    'member',
    'active',
    '65000000-0000-4000-8000-000000000104',
    statement_timestamp()
  ),
  (
    '65000000-0000-4000-8000-000000000207',
    '65000000-0000-4000-8000-000000000106',
    'admin',
    'active',
    '65000000-0000-4000-8000-000000000104',
    statement_timestamp()
  ),
  (
    '65000000-0000-4000-8000-000000000207',
    '65000000-0000-4000-8000-000000000109',
    'member',
    'active',
    '65000000-0000-4000-8000-000000000104',
    statement_timestamp()
  );

select throws_ok(
  $test$
    select *
    from public.save_event_draft(
      null,
      0,
      '{}'::jsonb,
      null,
      'preserve',
      null,
      null,
      null,
      null
    )
  $test$,
  'P0001',
  'VALIDATION_FAILED',
  'draft steps below the supported wizard range are rejected'
);
select throws_ok(
  $test$
    select *
    from public.save_event_draft(
      null,
      null,
      '{}'::jsonb,
      null,
      'preserve',
      null,
      null,
      null,
      null
    )
  $test$,
  'P0001',
  'VALIDATION_FAILED',
  'a null draft step is rejected explicitly'
);
select throws_ok(
  $test$
    select *
    from public.save_event_draft(
      null,
      1,
      '{}'::jsonb,
      null,
      null,
      null,
      null,
      null,
      null
    )
  $test$,
  'P0001',
  'VALIDATION_FAILED',
  'a null protected-location mode is rejected explicitly'
);
select throws_ok(
  $test$
    select *
    from public.save_event_draft(
      null,
      4,
      '{}'::jsonb,
      null,
      'preserve',
      null,
      null,
      null,
      null
    )
  $test$,
  'P0001',
  'VALIDATION_FAILED',
  'draft steps above the supported wizard range are rejected'
);
select throws_ok(
  $test$
    select *
    from public.save_event_draft(
      null,
      1,
      '[]'::jsonb,
      null,
      'preserve',
      null,
      null,
      null,
      null
    )
  $test$,
  'P0001',
  'VALIDATION_FAILED',
  'draft values must be a JSON object'
);
select throws_ok(
  $test$
    select *
    from public.save_event_draft(
      null,
      1,
      '{"title":{"nested":"not scalar"}}'::jsonb,
      null,
      'preserve',
      null,
      null,
      null,
      null
    )
  $test$,
  'P0001',
  'VALIDATION_FAILED',
  'allowed draft keys reject nested values'
);
select throws_ok(
  $test$
    select *
    from public.save_event_draft(
      null,
      1,
      '{}'::jsonb,
      null,
      'replace',
      'Incomplete protected address',
      null,
      null,
      null
    )
  $test$,
  'P0001',
  'VALIDATION_FAILED',
  'protected replacement requires a complete bounded point and address'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '65000000-0000-4000-8000-000000000105', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

select lives_ok(
  $test$
  do $body$
  declare
    saved record;
    recovered record;
  begin
    select * into saved
    from public.save_event_draft(
      null,
      2,
      jsonb_build_object(
        'audience', 'group',
        'audienceGroupId', '65000000-0000-4000-8000-000000000207',
        'title', 'Independent organizer draft'
      ),
      '65000000-0000-4000-8000-000000000205',
      'preserve',
      null,
      null,
      null,
      null
    );

    select * into recovered from public.get_event_draft(saved.draft_id);
    if recovered.organizing_group_id <> '65000000-0000-4000-8000-000000000205'
       or recovered.draft_values ->> 'audienceGroupId'
          <> '65000000-0000-4000-8000-000000000207' then
      raise exception 'organizer and audience group were coupled';
    end if;

    perform public.save_event_draft(
      saved.draft_id,
      2,
      '{"audience":"friends","audienceGroupId":null}'::jsonb,
      '65000000-0000-4000-8000-000000000205',
      'preserve',
      null,
      null,
      null,
      null
    );
    select * into recovered from public.get_event_draft(saved.draft_id);
    if recovered.organizing_group_id <> '65000000-0000-4000-8000-000000000205'
       or recovered.draft_values ? 'audienceGroupId' then
      raise exception 'friends audience erased its independent organizer';
    end if;

    perform public.save_event_draft(
      saved.draft_id,
      2,
      '{}'::jsonb,
      null,
      'preserve',
      null,
      null,
      null,
      null
    );
    select * into recovered from public.get_event_draft(saved.draft_id);
    if recovered.organizing_group_id is not null then
      raise exception 'authoritative null organizer did not clear storage';
    end if;

    perform public.discard_event_draft(saved.draft_id);
  end;
  $body$
  $test$,
  'draft organizer storage is independent from audience targeting and explicit null clears it'
);

reset role;

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
values (
  '00000000-0000-0000-0000-000000000000',
  '65000000-0000-4000-8000-000000000103',
  'authenticated',
  'authenticated',
  'task7-recovery@example.com',
  statement_timestamp(),
  '{}'::jsonb,
  '{}'::jsonb,
  statement_timestamp(),
  statement_timestamp()
);

update public.profiles
set
  handle = 'task7_recovery',
  display_name = 'Task Seven Recovery',
  city_id = (select id from public.cities where slug = 'haifa'),
  adult_attested_at = statement_timestamp(),
  rules_version = 1,
  rules_accepted_at = statement_timestamp(),
  profile_completed_at = statement_timestamp(),
  fan_enabled_at = statement_timestamp()
where id = '65000000-0000-4000-8000-000000000103';

set local role authenticated;
select set_config('request.jwt.claim.sub', '65000000-0000-4000-8000-000000000103', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

select lives_ok(
  $test$
  do $body$
  declare
    saved record;
  begin
    select * into saved
    from public.save_event_draft(
      null,
      1,
      '{"title":"Recoverable partial draft"}'::jsonb,
      null,
      'preserve',
      null,
      null,
      null,
      null
    );
    perform set_config('test.task7_recovery_draft', saved.draft_id::text, true);
  end;
  $body$
  $test$,
  'an eligible Fan can persist an incomplete draft before eligibility changes'
);

reset role;
update public.profiles
set fan_enabled_at = null
where id = '65000000-0000-4000-8000-000000000103';

set local role authenticated;
select set_config('request.jwt.claim.sub', '65000000-0000-4000-8000-000000000103', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

select throws_ok(
  format(
    $sql$
      select *
      from public.save_event_draft(
        %L::uuid,
        2,
        '{"title":"must not mutate"}'::jsonb,
        null,
        'preserve',
        null,
        null,
        null,
        null
      )
    $sql$,
    coalesce(
      nullif(current_setting('test.task7_recovery_draft', true), ''),
      '65000000-0000-4000-8000-000000000902'
    )
  ),
  'P0001',
  'PROFILE_INCOMPLETE',
  'an actor who no longer has Fan capability cannot mutate a draft'
);
select throws_ok(
  format(
    'select * from public.finalize_event_draft(%L::uuid, null)',
    coalesce(
      nullif(current_setting('test.task7_recovery_draft', true), ''),
      '65000000-0000-4000-8000-000000000902'
    )
  ),
  'P0001',
  'PROFILE_INCOMPLETE',
  'an actor who no longer has Fan capability cannot finalize a draft'
);
select lives_ok(
  format(
    'select * from public.get_event_draft(%L::uuid)',
    coalesce(
      nullif(current_setting('test.task7_recovery_draft', true), ''),
      '65000000-0000-4000-8000-000000000902'
    )
  ),
  'owner recovery remains available when Fan capability becomes stale'
);

reset role;
update public.profiles
set suspended_at = statement_timestamp()
where id = '65000000-0000-4000-8000-000000000103';

set local role authenticated;
select set_config('request.jwt.claim.sub', '65000000-0000-4000-8000-000000000103', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select lives_ok(
  format(
    'select * from public.get_event_draft(%L::uuid)',
    coalesce(
      nullif(current_setting('test.task7_recovery_draft', true), ''),
      '65000000-0000-4000-8000-000000000902'
    )
  ),
  'a suspended authenticated owner can still recover their own draft'
);
select lives_ok(
  format(
    $sql$
      do $body$
      begin
        if not public.discard_event_draft(%L::uuid) then
          raise exception 'discard did not confirm deletion';
        end if;
      end;
      $body$
    $sql$,
    coalesce(
      nullif(current_setting('test.task7_recovery_draft', true), ''),
      '65000000-0000-4000-8000-000000000902'
    )
  ),
  'a suspended authenticated owner can discard their own recoverable draft'
);

reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub', '65000000-0000-4000-8000-000000000101', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

select lives_ok(
  $test$
  do $body$
  declare
    recovered record;
  begin
    perform public.save_event_draft(
      current_setting('test.task7_owner_draft')::uuid,
      3,
      jsonb_build_object(
        'matchId', '65000000-0000-4000-8000-000000000204',
        'title', 'Friends at the public square',
        'description', 'Meet direct friends at a reviewed public place.',
        'expectedActivity', 'Watch the match together.',
        'costDescription', 'Free.',
        'eventRules', 'Respect the host and one another.',
        'commercialAffiliation', 'None.',
        'hostPresenceConfirmed', true,
        'cityId', (select id::text from public.cities where slug = 'haifa'),
        'placeKind', 'public_place',
        'publicPlaceName', 'Task Seven Public Square',
        'publicAddressText', '1 Public Square, Haifa',
        'publicLongitude', 34.999,
        'publicLatitude', 32.813,
        'audience', 'friends',
        'capacity', 6
      ),
      '65000000-0000-4000-8000-000000000205',
      'preserve',
      null,
      null,
      null,
      null
    );

    select * into recovered
    from public.get_event_draft(current_setting('test.task7_owner_draft')::uuid);
    if recovered.private_address_text is not null
       or recovered.private_longitude is not null then
      raise exception 'home to public-place transition retained protected data';
    end if;
  end;
  $body$
  $test$,
  'changing a home draft to a public place clears its protected row automatically'
);

select lives_ok(
  $test$
  do $body$
  declare
    recovered record;
  begin
    perform public.save_event_draft(
      current_setting('test.task7_owner_draft')::uuid,
      3,
      '{"placeKind":"home"}'::jsonb,
      '65000000-0000-4000-8000-000000000205',
      'replace',
      '14 Roundtrip Home Lane, Haifa',
      'Use the north entrance after approval.',
      34.9988,
      32.8128
    );

    select * into recovered
    from public.get_event_draft(current_setting('test.task7_owner_draft')::uuid);
    if recovered.draft_values ?| array[
         'publicPlaceName',
         'publicAddressText',
         'publicLongitude',
         'publicLatitude'
       ]
       or recovered.private_address_text <> '14 Roundtrip Home Lane, Haifa' then
      raise exception 'public-to-home transition retained stale public fields';
    end if;
  end;
  $body$
  $test$,
  'changing a public-place draft back to home strips every public location key'
);

select lives_ok(
  $test$
  do $body$
  declare
    finalized record;
  begin
    select * into finalized
    from public.finalize_event_draft(
      current_setting('test.task7_owner_draft')::uuid,
      '65000000-0000-4000-8000-000000000301'
    );
    if finalized.event_id is null or finalized.status <> 'pending_group_review' then
      raise exception 'group-organized friends draft finalized as %', finalized.status;
    end if;
    perform set_config('test.task7_friends_event', finalized.event_id::text, true);
  end;
  $body$
  $test$,
  'a group-organized friends draft finalizes through the group publication transaction'
);

reset role;
select lives_ok(
  $test$
  do $body$
  declare
    target_event public.events%rowtype;
    target_match public.matches%rowtype;
  begin
    select * into target_event
    from public.events
    where id = coalesce(
      nullif(current_setting('test.task7_friends_event', true), '')::uuid,
      '65000000-0000-4000-8000-000000000903'::uuid
    );
    select * into target_match
    from public.matches
    where id = '65000000-0000-4000-8000-000000000204';

    if target_event.id is null
       or target_event.starts_at <> target_match.starts_at
       or target_event.ends_at <> target_match.starts_at + interval '3 hours'
       or target_event.audience <> 'friends'
       or target_event.organizing_group_id <> '65000000-0000-4000-8000-000000000205'
       or target_event.place_kind <> 'home'
       or target_event.capacity <> 6
       or not exists (
         select 1
         from public.event_private_locations as private_location
         where private_location.event_id = target_event.id
           and private_location.address_text = '14 Roundtrip Home Lane, Haifa'
       )
       or exists (
         select 1 from public.event_drafts
         where id = nullif(current_setting('test.task7_owner_draft', true), '')::uuid
       )
       or exists (
         select 1 from public.event_draft_private_locations
         where draft_id = nullif(current_setting('test.task7_owner_draft', true), '')::uuid
       ) then
      raise exception 'finalization did not derive fixture time or clean the draft aggregate';
    end if;
  end;
  $body$
  $test$,
  'public-to-home finalization derives fixture time and atomically moves protected data'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '65000000-0000-4000-8000-000000000107', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

select lives_ok(
  $test$
  do $body$
  declare
    saved record;
    finalized record;
  begin
    select * into saved
    from public.save_event_draft(
      null,
      3,
      jsonb_build_object(
        'matchId', '65000000-0000-4000-8000-000000000204',
        'title', 'Invite-only home watch',
        'description', 'A small private watch event for invited supporters.',
        'expectedActivity', 'Watch and discuss the fixture.',
        'costDescription', 'Free.',
        'eventRules', 'Only accepted registered invitees attend.',
        'commercialAffiliation', 'None.',
        'hostPresenceConfirmed', true,
        'cityId', (select id::text from public.cities where slug = 'haifa'),
        'placeKind', 'home',
        'audience', 'invite_only',
        'capacity', 5
      ),
      '65000000-0000-4000-8000-000000000205',
      'replace',
      '5 Private Test Lane, Haifa',
      'Directions appear only after authorization.',
      34.9985,
      32.8125
    );

    select * into finalized
    from public.finalize_event_draft(
      saved.draft_id,
      '65000000-0000-4000-8000-000000000302'
    );
    if finalized.status <> 'published' then
      raise exception 'invite-only draft was not published';
    end if;
    perform set_config('test.task7_invite_event', finalized.event_id::text, true);
  end;
  $body$
  $test$,
  'an admin-authored group-organized invite-only draft publishes and cleans up atomically'
);

reset role;
select lives_ok(
  $test$
  do $body$
  begin
    if not exists (
      select 1
      from public.events as event
      join public.event_private_locations as private_location
        on private_location.event_id = event.id
      where event.id = coalesce(
        nullif(current_setting('test.task7_invite_event', true), '')::uuid,
        '65000000-0000-4000-8000-000000000904'::uuid
      )
        and event.audience = 'invite_only'
        and private_location.address_text = '5 Private Test Lane, Haifa'
    ) then
      raise exception 'protected draft values did not reach the protected event relation';
    end if;
  end;
  $body$
  $test$,
  'invite-only finalization moves exact home data only into the protected event relation'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '65000000-0000-4000-8000-000000000102', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

select lives_ok(
  $test$
  do $body$
  declare
    saved record;
  begin
    select * into saved
    from public.save_event_draft(
      null,
      3,
      jsonb_build_object(
        'matchId', '65000000-0000-4000-8000-000000000206',
        'title', 'Current fact failure',
        'description', 'A complete draft whose fixture later becomes unavailable.',
        'expectedActivity', 'Watch the match.',
        'costDescription', 'Free.',
        'eventRules', 'Respect everyone.',
        'commercialAffiliation', 'None.',
        'hostPresenceConfirmed', true,
        'cityId', (select id::text from public.cities where slug = 'haifa'),
        'placeKind', 'home',
        'audience', 'invite_only',
        'capacity', 5
      ),
      null,
      'replace',
      '8 Retained Draft Street, Haifa',
      null,
      34.9986,
      32.8126
    );
    perform set_config('test.task7_failed_draft', saved.draft_id::text, true);
  end;
  $body$
  $test$,
  'a complete draft can be saved before a catalog fact changes'
);

reset role;
update public.matches
set status = 'cancelled'
where id = '65000000-0000-4000-8000-000000000206';

set local role authenticated;
select set_config('request.jwt.claim.sub', '65000000-0000-4000-8000-000000000102', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select throws_ok(
  format(
    'select * from public.finalize_event_draft(%L::uuid, null)',
    coalesce(
      nullif(current_setting('test.task7_failed_draft', true), ''),
      '65000000-0000-4000-8000-000000000905'
    )
  ),
  'P0001',
  'NOT_FOUND',
  'finalization revalidates the current local fixture state'
);

reset role;
select lives_ok(
  $test$
  do $body$
  begin
    if not exists (
      select 1 from public.event_drafts
      where id = coalesce(
        nullif(current_setting('test.task7_failed_draft', true), '')::uuid,
        '65000000-0000-4000-8000-000000000905'::uuid
      )
    ) or not exists (
      select 1 from public.event_draft_private_locations
      where draft_id = coalesce(
        nullif(current_setting('test.task7_failed_draft', true), '')::uuid,
        '65000000-0000-4000-8000-000000000905'::uuid
      )
    ) then
      raise exception 'failed finalization removed recoverable draft state';
    end if;
  end;
  $body$
  $test$,
  'a failed finalization preserves both safe and protected draft rows'
);

create function pg_temp.create_task7_direct_group_event(
  input_organizing_group_id uuid,
  input_audience_group_id uuid,
  input_title text,
  input_audit_request_id uuid
)
returns table (event_id uuid, status text)
language sql
as $function$
  select *
  from public.create_or_update_event(
    null,
    null,
    input_organizing_group_id,
    '65000000-0000-4000-8000-000000000204',
    input_title,
    'A direct controlled-RPC group event used to prove role-aware publication.',
    'Watch the match with registered supporters.',
    'Free.',
    'Respect the group, host, and every attendee.',
    'No commercial affiliation.',
    true,
    (select starts_at from public.matches where id = '65000000-0000-4000-8000-000000000204'),
    (select starts_at + interval '3 hours' from public.matches where id = '65000000-0000-4000-8000-000000000204'),
    (select id from public.cities where slug = 'haifa'),
    'public_place',
    null,
    'Task Seven Direct Square',
    '18 Direct Square, Haifa',
    34.9992,
    32.8132,
    'group',
    null,
    input_audience_group_id,
    20,
    true,
    null,
    null,
    null,
    null,
    'publish',
    input_audit_request_id
  );
$function$;

create function pg_temp.update_task7_direct_group_event(
  input_event_id uuid,
  input_audit_request_id uuid
)
returns table (event_id uuid, status text)
language sql
as $function$
  select *
  from public.create_or_update_event(
    input_event_id,
    null,
    '65000000-0000-4000-8000-000000000205',
    '65000000-0000-4000-8000-000000000204',
    'Attempted direct group update',
    'Group-governed event editing remains unsupported through the generic RPC.',
    'Watch the match with registered supporters.',
    'Free.',
    'Respect the group, host, and every attendee.',
    'No commercial affiliation.',
    true,
    (select starts_at from public.matches where id = '65000000-0000-4000-8000-000000000204'),
    (select starts_at + interval '3 hours' from public.matches where id = '65000000-0000-4000-8000-000000000204'),
    (select id from public.cities where slug = 'haifa'),
    'public_place',
    null,
    'Task Seven Direct Square',
    '18 Direct Square, Haifa',
    34.9992,
    32.8132,
    'group',
    null,
    '65000000-0000-4000-8000-000000000207',
    20,
    true,
    null,
    null,
    null,
    null,
    'publish',
    input_audit_request_id
  );
$function$;

create function pg_temp.clear_task7_direct_group_governance(
  input_event_id uuid,
  input_audit_request_id uuid
)
returns table (event_id uuid, status text)
language sql
as $function$
  select *
  from public.create_or_update_event(
    input_event_id,
    null,
    null,
    '65000000-0000-4000-8000-000000000204',
    'Attempted governance removal',
    'An existing group-governed event cannot escape through non-group update inputs.',
    'Watch the match with registered supporters.',
    'Free.',
    'Respect the group, host, and every attendee.',
    'No commercial affiliation.',
    true,
    (select starts_at from public.matches where id = '65000000-0000-4000-8000-000000000204'),
    (select starts_at + interval '3 hours' from public.matches where id = '65000000-0000-4000-8000-000000000204'),
    (select id from public.cities where slug = 'haifa'),
    'public_place',
    null,
    'Task Seven Direct Square',
    '18 Direct Square, Haifa',
    34.9992,
    32.8132,
    'invite_only',
    null,
    null,
    20,
    true,
    null,
    null,
    null,
    null,
    'publish',
    input_audit_request_id
  );
$function$;

set local role authenticated;
select set_config('request.jwt.claim.sub', '65000000-0000-4000-8000-000000000104', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select lives_ok(
  $test$
  do $body$
  declare created record;
  begin
    select * into created
    from pg_temp.create_task7_direct_group_event(
      null,
      '65000000-0000-4000-8000-000000000205',
      'Direct owner publication',
      '65000000-0000-4000-8000-000000000411'
    );
    if created.status <> 'published' then
      raise exception 'direct owner publication status was %', created.status;
    end if;
    perform set_config('test.task7_direct_owner_event', created.event_id::text, true);
  end;
  $body$
  $test$,
  'direct group-audience publication derives its governing audience group and publishes for its owner'
);

select set_config('request.jwt.claim.sub', '65000000-0000-4000-8000-000000000105', true);
select lives_ok(
  $test$
  do $body$
  declare created record;
  begin
    select * into created
    from pg_temp.create_task7_direct_group_event(
      '65000000-0000-4000-8000-000000000205',
      '65000000-0000-4000-8000-000000000207',
      'Direct admin publication',
      '65000000-0000-4000-8000-000000000412'
    );
    if created.status <> 'published' then
      raise exception 'direct admin publication status was %', created.status;
    end if;
    perform set_config('test.task7_direct_admin_event', created.event_id::text, true);
  end;
  $body$
  $test$,
  'direct publication uses the explicit organizer admin role when its audience group is different'
);

select set_config('request.jwt.claim.sub', '65000000-0000-4000-8000-000000000106', true);
select lives_ok(
  $test$
  do $body$
  declare created record;
  begin
    select * into created
    from pg_temp.create_task7_direct_group_event(
      '65000000-0000-4000-8000-000000000205',
      '65000000-0000-4000-8000-000000000207',
      'Direct member submission',
      '65000000-0000-4000-8000-000000000413'
    );
    if created.status <> 'pending_group_review' then
      raise exception 'direct member publication status was %', created.status;
    end if;
    perform set_config('test.task7_direct_member_event', created.event_id::text, true);
  end;
  $body$
  $test$,
  'direct publication uses the explicit organizer member role instead of an audience-group admin role'
);
select throws_ok(
  format(
    'select * from pg_temp.update_task7_direct_group_event(%L::uuid, %L::uuid)',
    nullif(current_setting('test.task7_direct_member_event', true), ''),
    '65000000-0000-4000-8000-000000000414'
  ),
  'P0001',
  'NOT_ALLOWED',
  'the generic direct RPC rejects group-governed updates while non-group updates stay compatible'
);
select throws_ok(
  format(
    'select * from pg_temp.clear_task7_direct_group_governance(%L::uuid, %L::uuid)',
    nullif(current_setting('test.task7_direct_member_event', true), ''),
    '65000000-0000-4000-8000-000000000415'
  ),
  'P0001',
  'NOT_ALLOWED',
  'non-group update inputs cannot strip governance from an existing group event'
);

reset role;
select lives_ok(
  $test$
  do $body$
  begin
    if not exists (
      select 1
      from public.events as event
      where event.id = nullif(current_setting('test.task7_direct_owner_event', true), '')::uuid
        and event.organizing_group_id = '65000000-0000-4000-8000-000000000205'
        and event.audience_group_id = '65000000-0000-4000-8000-000000000205'
    ) or not exists (
      select 1
      from public.events as event
      where event.id = nullif(current_setting('test.task7_direct_admin_event', true), '')::uuid
        and event.organizing_group_id = '65000000-0000-4000-8000-000000000205'
        and event.audience_group_id = '65000000-0000-4000-8000-000000000207'
    ) or not exists (
      select 1
      from public.security_audit_events as audit
      where audit.request_id = '65000000-0000-4000-8000-000000000411'
        and audit.action = 'event.group_publish.author'
        and audit.metadata ->> 'author_role' = 'owner'
        and audit.metadata ->> 'organizing_group_id' = '65000000-0000-4000-8000-000000000205'
    ) or not exists (
      select 1
      from public.security_audit_events as audit
      where audit.request_id = '65000000-0000-4000-8000-000000000412'
        and audit.action = 'event.group_publish.author'
        and audit.metadata ->> 'author_role' = 'admin'
        and audit.metadata ->> 'organizing_group_id' = '65000000-0000-4000-8000-000000000205'
    ) or not exists (
      select 1
      from public.security_audit_events as audit
      where audit.request_id = '65000000-0000-4000-8000-000000000413'
        and audit.action = 'event.group_submit'
        and audit.metadata ->> 'author_role' = 'member'
        and audit.metadata ->> 'organizing_group_id' = '65000000-0000-4000-8000-000000000205'
    ) or (
      select count(*)
      from public.security_audit_events as audit
      where audit.request_id in (
        '65000000-0000-4000-8000-000000000411',
        '65000000-0000-4000-8000-000000000412',
        '65000000-0000-4000-8000-000000000413'
      )
        and audit.action in ('event.group_publish.author', 'event.group_submit')
    ) <> 3 then
      raise exception 'direct group publication did not preserve organizer authority and audit facts';
    end if;
  end;
  $body$
  $test$,
  'direct owner admin and member publication records exactly the governing organizer facts'
);

delete from public.security_audit_events
where request_id in (
  '65000000-0000-4000-8000-000000000411',
  '65000000-0000-4000-8000-000000000412',
  '65000000-0000-4000-8000-000000000413',
  '65000000-0000-4000-8000-000000000414',
  '65000000-0000-4000-8000-000000000415'
);
delete from public.events
where id in (
  nullif(current_setting('test.task7_direct_owner_event', true), '')::uuid,
  nullif(current_setting('test.task7_direct_admin_event', true), '')::uuid,
  nullif(current_setting('test.task7_direct_member_event', true), '')::uuid
);

create function pg_temp.create_task7_group_event(
  input_title text,
  input_audit_request_id uuid
)
returns table (event_id uuid, status text)
language sql
as $function$
  select *
  from public.create_group_event(
    '65000000-0000-4000-8000-000000000205',
    '65000000-0000-4000-8000-000000000204',
    input_title,
    'A complete supporter-group event used to verify publication roles.',
    'Watch the match and meet supporters.',
    'Free.',
    'Respect the group and event host.',
    'No commercial affiliation.',
    true,
    (select starts_at from public.matches where id = '65000000-0000-4000-8000-000000000204'),
    (select starts_at + interval '3 hours' from public.matches where id = '65000000-0000-4000-8000-000000000204'),
    (select id from public.cities where slug = 'haifa'),
    'public_place',
    'Task Seven Group Square',
    '12 Group Square, Haifa',
    34.9991,
    32.8131,
    'group',
    '65000000-0000-4000-8000-000000000205',
    20,
    null,
    null,
    null,
    null,
    'publish',
    input_audit_request_id
  );
$function$;

set local role authenticated;
select set_config('request.jwt.claim.sub', '65000000-0000-4000-8000-000000000104', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select lives_ok(
  $test$
  do $body$
  declare
    created record;
  begin
    select * into created
    from pg_temp.create_task7_group_event(
      'Owner-authored group event',
      '65000000-0000-4000-8000-000000000401'
    );
    if created.status <> 'published' then
      raise exception 'owner-authored publication status was %', created.status;
    end if;
    perform set_config('test.task7_owner_group_event', created.event_id::text, true);
  end;
  $body$
  $test$,
  'a current group owner author publishes atomically without self-review'
);

select set_config('request.jwt.claim.sub', '65000000-0000-4000-8000-000000000105', true);
select lives_ok(
  $test$
  do $body$
  declare
    created record;
  begin
    select * into created
    from pg_temp.create_task7_group_event(
      'Admin-authored group event',
      '65000000-0000-4000-8000-000000000402'
    );
    if created.status <> 'published' then
      raise exception 'admin-authored publication status was %', created.status;
    end if;
    perform set_config('test.task7_admin_group_event', created.event_id::text, true);
  end;
  $body$
  $test$,
  'a current group admin author publishes atomically without self-review'
);

select set_config('request.jwt.claim.sub', '65000000-0000-4000-8000-000000000106', true);
select lives_ok(
  $test$
  do $body$
  declare
    created record;
  begin
    select * into created
    from pg_temp.create_task7_group_event(
      'Member-authored group event',
      '65000000-0000-4000-8000-000000000403'
    );
    if created.status <> 'pending_group_review' then
      raise exception 'member submission status was %', created.status;
    end if;
    perform set_config('test.task7_member_group_event', created.event_id::text, true);
  end;
  $body$
  $test$,
  'an ordinary group member still submits into pending review'
);

reset role;
select lives_ok(
  $test$
  do $body$
  begin
    if not exists (
      select 1
      from public.security_audit_events as audit
      where audit.request_id = '65000000-0000-4000-8000-000000000401'
        and audit.actor_id = '65000000-0000-4000-8000-000000000104'
        and audit.action = 'event.group_publish.author'
        and audit.outcome = 'succeeded'
        and audit.metadata ->> 'author_role' = 'owner'
        and audit.metadata ->> 'status' = 'published'
    ) or not exists (
      select 1
      from public.security_audit_events as audit
      where audit.request_id = '65000000-0000-4000-8000-000000000402'
        and audit.actor_id = '65000000-0000-4000-8000-000000000105'
        and audit.action = 'event.group_publish.author'
        and audit.outcome = 'succeeded'
        and audit.metadata ->> 'author_role' = 'admin'
        and audit.metadata ->> 'status' = 'published'
    ) or (
      select count(*)
      from public.security_audit_events as audit
      where audit.request_id in (
        '65000000-0000-4000-8000-000000000401',
        '65000000-0000-4000-8000-000000000402',
        '65000000-0000-4000-8000-000000000403'
      )
        and audit.action in ('event.group_publish.author', 'event.group_submit')
    ) <> 3 then
      raise exception 'atomic group publication audit evidence is incomplete';
    end if;
  end;
  $body$
  $test$,
  'owner/admin author publication records truthful role and status audit evidence'
);

update public.group_memberships
set role = 'admin'
where group_id = '65000000-0000-4000-8000-000000000205'
  and user_id = '65000000-0000-4000-8000-000000000106';

set local role authenticated;
select set_config('request.jwt.claim.sub', '65000000-0000-4000-8000-000000000106', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select throws_ok(
  format(
    'select * from public.publish_group_event(%L::uuid, %L, null)',
    coalesce(
      nullif(current_setting('test.task7_member_group_event', true), ''),
      '65000000-0000-4000-8000-000000000906'
    ),
    'approve'
  ),
  'P0001',
  'NOT_ALLOWED',
  'a promoted creator cannot approve their own pending event'
);
select throws_ok(
  format(
    'select * from public.publish_group_event(%L::uuid, %L, null)',
    coalesce(
      nullif(current_setting('test.task7_member_group_event', true), ''),
      '65000000-0000-4000-8000-000000000906'
    ),
    'reject'
  ),
  'P0001',
  'NOT_ALLOWED',
  'a promoted creator cannot reject their own pending event'
);

select set_config('request.jwt.claim.sub', '65000000-0000-4000-8000-000000000105', true);
select throws_ok(
  format(
    'select * from public.publish_group_event(%L::uuid, null, null)',
    coalesce(
      nullif(current_setting('test.task7_member_group_event', true), ''),
      '65000000-0000-4000-8000-000000000906'
    )
  ),
  'P0001',
  'VALIDATION_FAILED',
  'a null group-review decision is rejected explicitly before transition or audit work'
);
select lives_ok(
  format(
    $sql$
      do $body$
      declare reviewed record;
      begin
        select * into reviewed
        from public.publish_group_event(%L::uuid, 'approve', '65000000-0000-4000-8000-000000000404');
        if reviewed.status <> 'published' or reviewed.decision <> 'approve' then
          raise exception 'different-admin approval failed';
        end if;
      end;
      $body$
    $sql$,
    coalesce(
      nullif(current_setting('test.task7_member_group_event', true), ''),
      '65000000-0000-4000-8000-000000000906'
    )
  ),
  'a different current admin can approve the promoted creator submission'
);

select set_config('request.jwt.claim.sub', '65000000-0000-4000-8000-000000000108', true);
select lives_ok(
  $test$
  do $body$
  declare
    created record;
  begin
    select * into created
    from pg_temp.create_task7_group_event(
      'Second member group event',
      '65000000-0000-4000-8000-000000000405'
    );
    if created.status <> 'pending_group_review' then
      raise exception 'second member submission was not pending';
    end if;
    perform set_config('test.task7_reject_group_event', created.event_id::text, true);
  end;
  $body$
  $test$,
  'a second ordinary member produces another pending review decision'
);

select set_config('request.jwt.claim.sub', '65000000-0000-4000-8000-000000000104', true);
select lives_ok(
  format(
    $sql$
      do $body$
      declare reviewed record;
      begin
        select * into reviewed
        from public.publish_group_event(%L::uuid, 'reject', '65000000-0000-4000-8000-000000000406');
        if reviewed.status <> 'cancelled' or reviewed.decision <> 'reject' then
          raise exception 'different-owner rejection failed';
        end if;
      end;
      $body$
    $sql$,
    coalesce(
      nullif(current_setting('test.task7_reject_group_event', true), ''),
      '65000000-0000-4000-8000-000000000907'
    )
  ),
  'a different current owner can reject a member submission with retained history'
);

select set_config('request.jwt.claim.sub', '65000000-0000-4000-8000-000000000109', true);
select lives_ok(
  $test$
  do $body$
  declare
    saved record;
    finalized record;
  begin
    select * into saved
    from public.save_event_draft(
      null,
      3,
      jsonb_build_object(
        'matchId', '65000000-0000-4000-8000-000000000204',
        'title', 'Group draft finalization',
        'description', 'A complete group draft created by an ordinary member.',
        'expectedActivity', 'Watch the match with the supporter group.',
        'costDescription', 'Free.',
        'eventRules', 'Respect the group and the host.',
        'commercialAffiliation', 'None.',
        'hostPresenceConfirmed', true,
        'cityId', (select id::text from public.cities where slug = 'haifa'),
        'placeKind', 'home',
        'audience', 'group',
        'audienceGroupId', '65000000-0000-4000-8000-000000000207',
        'capacity', 8
      ),
      '65000000-0000-4000-8000-000000000205',
      'replace',
      '21 Protected Group Lane, Haifa',
      null,
      34.9987,
      32.8127
    );

    select * into finalized
    from public.finalize_event_draft(
      saved.draft_id,
      '65000000-0000-4000-8000-000000000407'
    );
    if finalized.status <> 'pending_group_review' then
      raise exception 'member group draft finalized as %', finalized.status;
    end if;
    perform set_config('test.task7_distinct_group_event', finalized.event_id::text, true);
  end;
  $body$
  $test$,
  'group draft finalization uses the explicit organizer while preserving a distinct audience group'
);

reset role;
select ok(
  exists (
    select 1
    from public.events as event
    where event.id = nullif(
      current_setting('test.task7_distinct_group_event', true),
      ''
    )::uuid
      and event.organizing_group_id = '65000000-0000-4000-8000-000000000205'
      and event.audience_group_id = '65000000-0000-4000-8000-000000000207'
  ),
  'finalized storage keeps the explicit organizer distinct from its group audience'
);
select lives_ok(
  $test$
  do $body$
  begin
    if exists (
      select 1
      from public.event_drafts as draft
      where draft.draft_values::text ilike any(array[
        '%privateAddress%',
        '%privateDirections%',
        '%privateLongitude%',
        '%privateLatitude%',
        '%Protected Lane%',
        '%Retained Draft Street%'
      ])
    ) or exists (
      select 1
      from public.security_audit_events as audit
      where audit.metadata::text ilike any(array[
        '%privateAddress%',
        '%privateDirections%',
        '%privateLongitude%',
        '%privateLatitude%',
        '%Protected Lane%',
        '%Retained Draft Street%'
      ])
    ) then
      raise exception 'generic draft or audit data leaked protected values';
    end if;
  end;
  $body$
  $test$,
  'generic payloads and audit metadata contain no protected field names or values'
);

select * from finish();
rollback;
