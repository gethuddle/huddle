begin;

create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public, pg_catalog;

select no_plan();

select is(
  (select enum_range(null::public.event_attendance_mode)::text),
  '{reservations,open_door}',
  'event attendance modes are explicit and bounded'
);
select ok(
  exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'events'
      and column_name = 'attendance_mode' and is_nullable = 'NO'
  )
  and exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'events'
      and column_name = 'capacity' and is_nullable = 'YES'
  ),
  'events store the joining contract while capacity can be absent for walk-ins'
);
select isnt(
  to_regprocedure(
    'public.create_venue_workspace_v2(text,text,text,numeric,numeric,text,text,integer,text[],text,text,boolean,boolean,boolean,integer,uuid)'
  ),
  null::regprocedure,
  'Venue activation accepts one explicit attendance default'
);
select isnt(
  to_regprocedure(
    'public.discover_open_door_events(double precision,double precision,integer,timestamptz,timestamptz,uuid,uuid,uuid,integer,integer,timestamptz,uuid,integer)'
  ),
  null::regprocedure,
  'discovery has a dedicated walk-in projection'
);
select is(
  (
    select procedure.provolatile
    from pg_proc as procedure
    where procedure.oid = to_regprocedure('public.get_venue_workspace(uuid)')
  ),
  'v'::"char",
  'the replaced Venue workspace projection remains lock-safe through PostgREST'
);
select is(
  (
    select procedure.provolatile
    from pg_proc as procedure
    where procedure.oid = to_regprocedure('public.list_venue_calendar(uuid,integer)')
  ),
  'v'::"char",
  'the replaced Venue calendar projection remains lock-safe through PostgREST'
);

insert into auth.users (
  instance_id, id, aud, role, email, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
select
  '00000000-0000-0000-0000-000000000000', fixture.id,
  'authenticated', 'authenticated', fixture.email, statement_timestamp(),
  '{}'::jsonb, '{}'::jsonb, statement_timestamp(), statement_timestamp()
from (
  values
    ('f5000000-0000-4000-8000-000000000101'::uuid, 'open-door-owner@example.test'),
    ('f5000000-0000-4000-8000-000000000102'::uuid, 'open-door-fan@example.test')
) as fixture(id, email);

update public.profiles
set adult_attested_at = statement_timestamp(),
    rules_version = 1,
    rules_accepted_at = statement_timestamp()
where id in (
  'f5000000-0000-4000-8000-000000000101',
  'f5000000-0000-4000-8000-000000000102'
);

update public.profiles
set handle = 'open_door_fan',
    display_name = 'Open Door Fan',
    profile_completed_at = statement_timestamp(),
    fan_enabled_at = statement_timestamp()
where id = 'f5000000-0000-4000-8000-000000000102';

insert into public.venues (
  id, owner_id, slug, name, address_text, location, description,
  stated_capacity, facilities, house_information, default_attendance_mode,
  default_requires_approval, business_representation_attested_at,
  business_representation_attested_by
)
values (
  'f5000000-0000-4000-8000-000000000201',
  'f5000000-0000-4000-8000-000000000101',
  'open-door-corner', 'Open Door Corner',
  '12 Stadium Street, Haifa',
  extensions.st_setsrid(extensions.st_makepoint(34.998, 32.812), 4326)::extensions.geography,
  'A public walk-in Venue showing the full match.',
  null, array['food','drinks']::public.venue_facility[],
  'Walk in before kick-off.', 'open_door', false,
  statement_timestamp(), 'f5000000-0000-4000-8000-000000000101'
);

insert into public.venue_spaces (id, venue_id, name, capacity, active, sort_order)
values (
  'f5000000-0000-4000-8000-000000000211',
  'f5000000-0000-4000-8000-000000000201',
  'Main screen', null, true, 0
);

insert into public.competitions (
  id, sport_id, provider, provider_external_id, code, name, country_name, last_synced_at
)
values (
  'f5000000-0000-4000-8000-000000000301',
  '00000000-0000-4000-8000-000000000020',
  'open-door-test', 'competition', 'ODT', 'Open Door Test League', 'England',
  statement_timestamp()
);

insert into public.teams (
  id, sport_id, provider, provider_external_id, name, short_name, tla,
  country_name, last_synced_at
)
values
  (
    'f5000000-0000-4000-8000-000000000311',
    '00000000-0000-4000-8000-000000000020',
    'open-door-test', 'home', 'Open Door Home', 'Home', 'ODH', 'England', statement_timestamp()
  ),
  (
    'f5000000-0000-4000-8000-000000000312',
    '00000000-0000-4000-8000-000000000020',
    'open-door-test', 'away', 'Open Door Away', 'Away', 'ODA', 'England', statement_timestamp()
  );

insert into public.matches (
  id, provider, provider_external_id, competition_id, home_team_id, away_team_id,
  starts_at, status, matchday, season_label, last_synced_at
)
values (
  'f5000000-0000-4000-8000-000000000321',
  'open-door-test', 'match-1',
  'f5000000-0000-4000-8000-000000000301',
  'f5000000-0000-4000-8000-000000000311',
  'f5000000-0000-4000-8000-000000000312',
  statement_timestamp() + interval '30 days', 'timed', 1, '2026', statement_timestamp()
);

set local role authenticated;
set local "request.jwt.claim.sub" = 'f5000000-0000-4000-8000-000000000101';

select is(
  (
    select count(*)
    from public.plan_venue_events(
      jsonb_build_array(jsonb_build_object(
        'matchId', 'f5000000-0000-4000-8000-000000000321',
        'venueSpaceId', 'f5000000-0000-4000-8000-000000000211',
        'attendanceMode', 'open_door'
      )),
      'publish',
      'f5000000-0000-4000-8000-000000000901'
    )
  ),
  1::bigint,
  'an owner publishes the fixture without entering a date, capacity, or approval policy'
);

select throws_ok(
  $$select * from public.create_event_invitation(
    (select event_id from public.list_managed_venue_events(
      'f5000000-0000-4000-8000-000000000201', 1
    )),
    'open_door_fan', null
  )$$,
  'P0001', 'NOT_ALLOWED',
  'an open-door event cannot create invitations'
);

reset role;

select results_eq(
  $$
    select attendance_mode::text, capacity, requires_approval, audience::text, status::text
    from public.events
    where match_id = 'f5000000-0000-4000-8000-000000000321'
  $$,
  $$values ('open_door'::text, null::integer, false, 'public'::text, 'published'::text)$$,
  'walk-in events store no registered capacity or approval fiction'
);

select throws_ok(
  $$update public.events
    set capacity = 10
    where match_id = 'f5000000-0000-4000-8000-000000000321'$$,
  '23514',
  null,
  'the database rejects a capacity on an open-door event'
);

set local role authenticated;
set local "request.jwt.claim.sub" = 'f5000000-0000-4000-8000-000000000102';

select throws_ok(
  $$select * from public.request_or_join_event(
    (select event_id from public.list_venue_events('open-door-corner', 1)),
    null
  )$$,
  'P0001', 'NOT_ALLOWED',
  'a fan cannot create an RSVP or attendance row for a walk-in event'
);

reset role;
set local role anon;

select is(
  (
    select count(*)
    from public.discover_open_door_events(
      32.800, 35.000, 50,
      statement_timestamp(), statement_timestamp() + interval '31 days',
      null, null, null, null, null, null, null, 20
    )
    where capacity is null and remaining_capacity is null and not requires_approval
  ),
  1::bigint,
  'walk-in events remain publicly discoverable without fake availability numbers'
);

reset role;

select is(
  (
    select count(*)
    from public.event_attendance as attendance
    join public.events as event on event.id = attendance.event_id
    where event.match_id = 'f5000000-0000-4000-8000-000000000321'
  ),
  0::bigint,
  'rejected walk-in interactions leave no attendance residue'
);

select * from finish();
rollback;
