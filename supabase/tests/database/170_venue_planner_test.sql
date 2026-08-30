begin;

create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public, pg_catalog;

select no_plan();

select isnt(
  to_regprocedure('public.plan_venue_events(jsonb,text,uuid)'),
  null::regprocedure,
  'Venue batches use the exact bounded transaction signature'
);
select isnt(
  to_regprocedure('public.get_venue_today(uuid,integer)'),
  null::regprocedure,
  'Today uses one bounded workspace projection'
);
select isnt(
  to_regprocedure('public.get_venue_settings(uuid)'),
  null::regprocedure,
  'Venue defaults use one membership-authorized projection'
);
select is(
  (
    select count(*)
    from pg_proc as procedure
    join pg_namespace as namespace on namespace.oid = procedure.pronamespace
    where namespace.nspname = 'public'
      and procedure.proname in ('plan_venue_events', 'get_venue_today', 'get_venue_settings')
      and procedure.prosecdef
      and procedure.proconfig = array['search_path=""']::text[]
  ),
  3::bigint,
  'planner and workspace projections are security definer functions with empty search paths'
);
select ok(
  has_function_privilege(
    'authenticated', 'public.plan_venue_events(jsonb,text,uuid)', 'execute'
  )
  and has_function_privilege(
    'authenticated', 'public.get_venue_today(uuid,integer)', 'execute'
  )
  and has_function_privilege(
    'authenticated', 'public.get_venue_settings(uuid)', 'execute'
  ),
  'authenticated operators may use the controlled Venue planning interfaces'
);
select ok(
  not has_function_privilege('anon', 'public.plan_venue_events(jsonb,text,uuid)', 'execute')
  and not has_function_privilege('anon', 'public.get_venue_today(uuid,integer)', 'execute')
  and not has_function_privilege('anon', 'public.get_venue_settings(uuid)', 'execute'),
  'anonymous sessions cannot use Venue planning interfaces'
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
    ('e5000000-0000-4000-8000-000000000101'::uuid, 'planner-owner@example.test'),
    ('e5000000-0000-4000-8000-000000000102'::uuid, 'planner-admin@example.test'),
    ('e5000000-0000-4000-8000-000000000103'::uuid, 'planner-unrelated@example.test'),
    ('e5000000-0000-4000-8000-000000000104'::uuid, 'planner-attendee@example.test')
) as fixture(id, email);

update public.profiles
set adult_attested_at = statement_timestamp(),
    rules_version = 1,
    rules_accepted_at = statement_timestamp()
where id in (
  'e5000000-0000-4000-8000-000000000101',
  'e5000000-0000-4000-8000-000000000102',
  'e5000000-0000-4000-8000-000000000103',
  'e5000000-0000-4000-8000-000000000104'
);

update public.profiles
set handle = 'planner_attendee',
    display_name = 'Planner Attendee',
    city_id = (select id from public.cities where slug = 'haifa'),
    profile_completed_at = statement_timestamp(),
    fan_enabled_at = statement_timestamp()
where id = 'e5000000-0000-4000-8000-000000000104';

insert into public.venues (
  id, owner_id, slug, name, city_id, address_text, location, description,
  stated_capacity, facilities, house_information, default_requires_approval,
  business_representation_attested_at, business_representation_attested_by
)
values (
  'e5000000-0000-4000-8000-000000000201',
  'e5000000-0000-4000-8000-000000000101',
  'planner-match-corner', 'Planner Match Corner',
  (select id from public.cities where slug = 'haifa'),
  '12 Stadium Street, Haifa',
  extensions.st_setsrid(extensions.st_makepoint(34.998, 32.812), 4326)::extensions.geography,
  'A welcoming Venue for watching the full match together.',
  80, array['food','drinks']::public.venue_facility[],
  'Order at the bar before kick-off.', true,
  statement_timestamp(), 'e5000000-0000-4000-8000-000000000101'
);

insert into public.venue_memberships (venue_id, user_id, role, status)
values (
    'e5000000-0000-4000-8000-000000000201',
    'e5000000-0000-4000-8000-000000000102', 'admin', 'active'
  );

insert into public.venue_spaces (id, venue_id, name, capacity, active, sort_order)
values
  (
    'e5000000-0000-4000-8000-000000000211',
    'e5000000-0000-4000-8000-000000000201', 'Main screen', 80, true, 0
  ),
  (
    'e5000000-0000-4000-8000-000000000212',
    'e5000000-0000-4000-8000-000000000201', 'Terrace screen', 40, true, 1
  );

insert into public.competitions (
  id, sport_id, provider, provider_external_id, code, name, country_name, last_synced_at
)
values (
  'e5000000-0000-4000-8000-000000000301',
  '00000000-0000-4000-8000-000000000020',
  'planner-test', 'competition', 'PLN', 'Planner Test League', 'England', statement_timestamp()
);

insert into public.teams (
  id, sport_id, provider, provider_external_id, name, short_name, tla,
  country_name, last_synced_at
)
values
  (
    'e5000000-0000-4000-8000-000000000311',
    '00000000-0000-4000-8000-000000000020',
    'planner-test', 'home', 'Planner Home', 'Home', 'PLH', 'England', statement_timestamp()
  ),
  (
    'e5000000-0000-4000-8000-000000000312',
    '00000000-0000-4000-8000-000000000020',
    'planner-test', 'away', 'Planner Away', 'Away', 'PLA', 'England', statement_timestamp()
  );

insert into public.matches (
  id, provider, provider_external_id, competition_id, home_team_id, away_team_id,
  starts_at, status, matchday, season_label, last_synced_at
)
select
  fixture.id, 'planner-test', fixture.external_id,
  'e5000000-0000-4000-8000-000000000301',
  'e5000000-0000-4000-8000-000000000311',
  'e5000000-0000-4000-8000-000000000312',
  statement_timestamp() + fixture.starts_after,
  'timed', fixture.matchday, '2026', statement_timestamp()
from (
  values
    ('e5000000-0000-4000-8000-000000000321'::uuid, 'match-1', interval '30 days', 1),
    ('e5000000-0000-4000-8000-000000000322'::uuid, 'match-2', interval '31 days', 2),
    ('e5000000-0000-4000-8000-000000000323'::uuid, 'match-3', interval '40 days', 3),
    ('e5000000-0000-4000-8000-000000000324'::uuid, 'match-4', interval '40 days 1 hour', 4),
    ('e5000000-0000-4000-8000-000000000325'::uuid, 'match-5', interval '50 days', 5),
    ('e5000000-0000-4000-8000-000000000326'::uuid, 'match-6', interval '50 days 1 hour', 6)
) as fixture(id, external_id, starts_after, matchday);

set local role authenticated;
set local "request.jwt.claim.sub" = 'e5000000-0000-4000-8000-000000000101';

select is(
  (
    select count(*)
    from public.plan_venue_events(
      jsonb_build_array(
        jsonb_build_object(
          'matchId', 'e5000000-0000-4000-8000-000000000321',
          'venueSpaceId', 'e5000000-0000-4000-8000-000000000211'
        ),
        jsonb_build_object(
          'matchId', 'e5000000-0000-4000-8000-000000000322',
          'venueSpaceId', 'e5000000-0000-4000-8000-000000000212',
          'capacity', 30,
          'requiresApproval', false
        )
      ),
      'draft',
      'e5000000-0000-4000-8000-000000000901'
    )
  ),
  2::bigint,
  'owner creates a two-fixture batch atomically'
);

reset role;

select results_eq(
  $$
    select event.capacity, event.requires_approval, event.status::text, space.name
    from public.events as event
    join public.venue_spaces as space on space.id = event.venue_space_id
    where event.host_venue_id = 'e5000000-0000-4000-8000-000000000201'
    order by event.starts_at
  $$,
  $$values
    (80::integer, true, 'draft'::text, 'Main screen'::text),
    (30::integer, false, 'draft'::text, 'Terrace screen'::text)
  $$,
  'planner snapshots the selected area capacity and joining policy with bounded overrides'
);
select ok(
  (
    select bool_and(
      event.title like '%at Planner Match Corner'
      and event.description = 'A welcoming Venue for watching the full match together.'
      and event.commercial_affiliation = 'Hosted commercially by Planner Match Corner'
    )
    from public.events as event
    where event.host_venue_id = 'e5000000-0000-4000-8000-000000000201'
  ),
  'planner inherits the Venue identity and reusable public defaults'
);

update public.venue_spaces
set capacity = 100
where id = 'e5000000-0000-4000-8000-000000000211';
select is(
  (
    select event.capacity
    from public.events as event
    where event.match_id = 'e5000000-0000-4000-8000-000000000321'
  ),
  80,
  'later area changes do not rewrite event capacity snapshots'
);

set local role authenticated;
set local "request.jwt.claim.sub" = 'e5000000-0000-4000-8000-000000000102';

select results_eq(
  $$
    select status
    from public.plan_venue_events(
      jsonb_build_array(jsonb_build_object(
        'matchId', 'e5000000-0000-4000-8000-000000000323',
        'venueSpaceId', 'e5000000-0000-4000-8000-000000000212'
      )),
      'publish',
      'e5000000-0000-4000-8000-000000000902'
    )
  $$,
  $$values ('published'::text)$$,
  'an active admin has parity for atomic publication'
);
select throws_ok(
  $$
    select * from public.plan_venue_events(
      jsonb_build_array(jsonb_build_object(
        'matchId', 'e5000000-0000-4000-8000-000000000324',
        'venueSpaceId', 'e5000000-0000-4000-8000-000000000212'
      )),
      'publish', null
    )
  $$,
  'P0001', 'VENUE_SPACE_OVERLAP',
  'an existing active event blocks an overlapping event in the same area'
);
select throws_ok(
  $$
    select * from public.plan_venue_events(
      jsonb_build_array(
        jsonb_build_object(
          'matchId', 'e5000000-0000-4000-8000-000000000325',
          'venueSpaceId', 'e5000000-0000-4000-8000-000000000211'
        ),
        jsonb_build_object(
          'matchId', 'e5000000-0000-4000-8000-000000000326',
          'venueSpaceId', 'e5000000-0000-4000-8000-000000000211'
        )
      ),
      'draft', null
    )
  $$,
  'P0001', 'VENUE_SPACE_OVERLAP',
  'the same transaction rejects overlapping selected fixtures inline'
);

reset role;

select is(
  (
    select count(*)
    from public.events
    where match_id in (
      'e5000000-0000-4000-8000-000000000325',
      'e5000000-0000-4000-8000-000000000326'
    )
  ),
  0::bigint,
  'a rejected batch leaves no partial event behind'
);

set local role authenticated;
set local "request.jwt.claim.sub" = 'e5000000-0000-4000-8000-000000000103';

select throws_ok(
  $$
    select * from public.plan_venue_events(
      jsonb_build_array(jsonb_build_object(
        'matchId', 'e5000000-0000-4000-8000-000000000325',
        'venueSpaceId', 'e5000000-0000-4000-8000-000000000211'
      )),
      'draft', null
    )
  $$,
  'P0001', 'NOT_ALLOWED',
  'an unrelated account cannot plan against a guessed Venue area ID'
);
select throws_ok(
  $$select * from public.get_venue_settings('e5000000-0000-4000-8000-000000000201')$$,
  'P0001', 'NOT_FOUND',
  'settings use the same privacy-safe nonmember result'
);

reset role;

insert into public.event_attendance (event_id, user_id, status, source)
select event.id, 'e5000000-0000-4000-8000-000000000104', 'requested', 'self_request'
from public.events as event
where event.match_id = 'e5000000-0000-4000-8000-000000000323';

set local role authenticated;
set local "request.jwt.claim.sub" = 'e5000000-0000-4000-8000-000000000101';

select is(
  (
    select (attention -> 0 ->> 'waiting_count')::integer
    from public.get_venue_today('e5000000-0000-4000-8000-000000000201', 12)
  ),
  1,
  'Today exposes the current waiting count as direct actionable work'
);
select is(
  (
    select role
    from public.get_venue_settings('e5000000-0000-4000-8000-000000000201')
  ),
  'owner',
  'settings reauthorize the active role for the concrete Venue'
);

reset role;

select ok(
  not exists (
    select 1
    from public.security_audit_events as audit
    where audit.action = 'venue.event.plan'
      and audit.metadata ?| array[
        'address', 'address_text', 'latitude', 'longitude', 'token', 'session', 'cookie'
      ]
  ),
  'planner audit metadata contains no address, coordinate, token, or session values'
);

select * from finish();
rollback;
