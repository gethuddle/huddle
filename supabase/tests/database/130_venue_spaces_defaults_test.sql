begin;

create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public, pg_catalog;

select no_plan();

select has_table('public', 'venue_spaces', 'Venue areas are normalized');
select has_column('public', 'venues', 'facilities', 'Venue facilities are stored as defaults');
select has_column('public', 'venues', 'house_information', 'Venue house information is stored');
select has_column(
  'public', 'venues', 'default_requires_approval',
  'Venue attendance approval has a reusable default'
);
select has_column(
  'public', 'venues', 'business_representation_attested_at',
  'Venue activation records representation attestation time'
);
select has_column(
  'public', 'venues', 'business_representation_attested_by',
  'Venue activation records the attesting account'
);
select has_column('public', 'events', 'venue_space_id', 'Events can identify one Venue area');
select is(
  enum_range(null::public.venue_facility)::text,
  '{wheelchair_accessible,step_free_access,accessible_toilet,hearing_loop,parking,food,drinks}',
  'Venue facilities use only the approved values in stable order'
);
select isnt(
  to_regprocedure(
    'public.create_venue_workspace(text,text,uuid,text,numeric,numeric,text,text,integer,text[],text,boolean,boolean,boolean,integer,uuid)'
  ),
  null::regprocedure,
  'Venue activation exposes the exact controlled signature'
);
select is(
  (
    select procedure.proargnames
    from pg_proc as procedure
    join pg_namespace as namespace on namespace.oid = procedure.pronamespace
    where namespace.nspname = 'public'
      and procedure.oid = to_regprocedure(
        'public.create_venue_workspace(text,text,uuid,text,numeric,numeric,text,text,integer,text[],text,boolean,boolean,boolean,integer,uuid)'
      )
  ),
  array[
    'input_name', 'input_slug', 'input_city_id', 'input_address_text',
    'input_longitude', 'input_latitude', 'input_description',
    'input_main_space_name', 'input_main_space_capacity', 'input_facilities',
    'input_house_information', 'input_default_requires_approval',
    'input_adult_attested', 'input_representation_attested',
    'input_rules_version', 'audit_request_id',
    'venue_id', 'slug', 'verification_status'
  ]::text[],
  'Venue activation preserves the exact named argument order before its output columns'
);
select isnt(
  to_regprocedure('public.get_venue_workspace(uuid)'),
  null::regprocedure,
  'Venue workspace reads use a bounded RPC'
);
select isnt(
  to_regprocedure('public.list_venue_calendar(uuid,integer)'),
  null::regprocedure,
  'Venue calendar reads use a bounded RPC'
);
select isnt(
  to_regprocedure(
    'public.update_venue_workspace(uuid,text,text,uuid,text,numeric,numeric,text,text[],text,boolean,uuid)'
  ),
  null::regprocedure,
  'Venue profile defaults update through a controlled RPC'
);
select isnt(
  to_regprocedure('public.save_venue_space(uuid,uuid,text,integer,boolean,integer,uuid)'),
  null::regprocedure,
  'Venue areas save through a controlled RPC'
);
select ok(
  (
    select relation.relrowsecurity and relation.relforcerowsecurity
    from pg_class as relation
    join pg_namespace as namespace on namespace.oid = relation.relnamespace
    where namespace.nspname = 'public' and relation.relname = 'venue_spaces'
  ),
  'Venue areas have RLS enabled and forced'
);
select ok(
  not has_table_privilege('authenticated', 'public.venue_spaces', 'select'),
  'authenticated clients cannot read Venue areas directly'
);
select ok(
  not has_table_privilege('authenticated', 'public.venue_spaces', 'insert'),
  'authenticated clients cannot insert Venue areas directly'
);
select ok(
  not has_table_privilege('authenticated', 'public.venue_spaces', 'update'),
  'authenticated clients cannot update Venue areas directly'
);
select ok(
  not has_table_privilege('authenticated', 'public.venue_spaces', 'delete'),
  'authenticated clients cannot delete Venue areas directly'
);
select ok(
  has_function_privilege(
    'authenticated',
    'public.create_venue_workspace(text,text,uuid,text,numeric,numeric,text,text,integer,text[],text,boolean,boolean,boolean,integer,uuid)',
    'execute'
  ),
  'authenticated actors may call controlled Venue activation'
);
select ok(
  not has_function_privilege(
    'anon',
    'public.create_venue_workspace(text,text,uuid,text,numeric,numeric,text,text,integer,text[],text,boolean,boolean,boolean,integer,uuid)',
    'execute'
  ),
  'anonymous actors cannot activate a Venue workspace'
);
select ok(
  not has_function_privilege(
    'authenticated',
    'public.create_venue(text,text,uuid,text,double precision,double precision,text,integer,integer,uuid)',
    'execute'
  ),
  'the legacy create_venue RPC cannot bypass explicit activation attestations'
);
select ok(
  has_function_privilege(
    'authenticated', 'public.get_venue_workspace(uuid)', 'execute'
  )
  and has_function_privilege(
    'authenticated', 'public.list_venue_calendar(uuid,integer)', 'execute'
  )
  and has_function_privilege(
    'authenticated',
    'public.update_venue_workspace(uuid,text,text,uuid,text,numeric,numeric,text,text[],text,boolean,uuid)',
    'execute'
  )
  and has_function_privilege(
    'authenticated',
    'public.save_venue_space(uuid,uuid,text,integer,boolean,integer,uuid)',
    'execute'
  ),
  'authenticated actors can use every controlled Venue workspace RPC'
);
select ok(
  not has_function_privilege('anon', 'public.get_venue_workspace(uuid)', 'execute')
  and not has_function_privilege(
    'anon', 'public.list_venue_calendar(uuid,integer)', 'execute'
  )
  and not has_function_privilege(
    'anon',
    'public.update_venue_workspace(uuid,text,text,uuid,text,numeric,numeric,text,text[],text,boolean,uuid)',
    'execute'
  )
  and not has_function_privilege(
    'anon',
    'public.save_venue_space(uuid,uuid,text,integer,boolean,integer,uuid)',
    'execute'
  ),
  'anonymous actors cannot use Venue workspace management RPCs'
);
select is(
  (
    select count(*)
    from pg_proc as procedure
    join pg_namespace as namespace on namespace.oid = procedure.pronamespace
    where namespace.nspname = 'public'
      and procedure.proname in (
        'create_venue_workspace', 'get_venue_workspace', 'list_venue_calendar',
        'update_venue_workspace', 'save_venue_space'
      )
      and procedure.prosecdef
      and procedure.proconfig = array['search_path=""']::text[]
  ),
  5::bigint,
  'all five Venue workspace RPCs are security definer functions with empty search_path'
);
select ok(
  not has_function_privilege(
    'authenticated',
    'private.ensure_venue_main_space(uuid)',
    'execute'
  ),
  'the legacy backfill helper is not client-executable'
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
    ('d3000000-0000-4000-8000-000000000101'::uuid, 'venue-area-owner@example.com'),
    ('d3000000-0000-4000-8000-000000000102'::uuid, 'venue-area-admin@example.com'),
    ('d3000000-0000-4000-8000-000000000103'::uuid, 'venue-area-unrelated@example.com'),
    ('d3000000-0000-4000-8000-000000000104'::uuid, 'venue-area-restricted@example.com'),
    ('d3000000-0000-4000-8000-000000000105'::uuid, 'venue-area-suspended@example.com'),
    ('d3000000-0000-4000-8000-000000000106'::uuid, 'venue-activation@example.com'),
    ('d3000000-0000-4000-8000-000000000107'::uuid, 'venue-activation-invalid@example.com'),
    ('d3000000-0000-4000-8000-000000000108'::uuid, 'venue-event-fan@example.com')
) as fixture(id, email);

update public.profiles
set
  adult_attested_at = statement_timestamp(),
  rules_version = 1,
  rules_accepted_at = statement_timestamp()
where id in (
  'd3000000-0000-4000-8000-000000000101',
  'd3000000-0000-4000-8000-000000000102',
  'd3000000-0000-4000-8000-000000000103',
  'd3000000-0000-4000-8000-000000000104',
  'd3000000-0000-4000-8000-000000000105',
  'd3000000-0000-4000-8000-000000000108'
);

update public.profiles
set community_restricted_at = statement_timestamp(),
    community_restricted_until = statement_timestamp() + interval '7 days'
where id = 'd3000000-0000-4000-8000-000000000104';

update public.profiles
set suspended_at = statement_timestamp()
where id = 'd3000000-0000-4000-8000-000000000105';

update public.profiles
set
  handle = 'venue_event_fan',
  display_name = 'Venue Event Fan',
  city_id = (select id from public.cities where slug = 'haifa'),
  profile_completed_at = statement_timestamp(),
  fan_enabled_at = statement_timestamp()
where id = 'd3000000-0000-4000-8000-000000000108';

insert into public.venues (
  id, owner_id, slug, name, city_id, address_text, location,
  description, screen_count, stated_capacity
)
values
  (
    'd3000000-0000-4000-8000-000000000201',
    'd3000000-0000-4000-8000-000000000101',
    'legacy-four-screen-venue', 'Legacy Four Screen Venue',
    (select id from public.cities where slug = 'haifa'),
    '20 Legacy Street, Haifa',
    extensions.st_setsrid(extensions.st_makepoint(34.999, 32.813), 4326)::extensions.geography,
    'A legacy Venue with an unstructured screen count and stated capacity.',
    4, 80
  ),
  (
    'd3000000-0000-4000-8000-000000000202',
    'd3000000-0000-4000-8000-000000000101',
    'legacy-unknown-capacity', 'Legacy Unknown Capacity',
    (select id from public.cities where slug = 'haifa'),
    '21 Legacy Street, Haifa',
    extensions.st_setsrid(extensions.st_makepoint(34.998, 32.812), 4326)::extensions.geography,
    'A legacy Venue whose one known area still needs a capacity.',
    1, null
  );

select private.ensure_venue_main_space('d3000000-0000-4000-8000-000000000201');
select private.ensure_venue_main_space('d3000000-0000-4000-8000-000000000202');
select private.ensure_venue_main_space('d3000000-0000-4000-8000-000000000201');

select is(
  (
    select count(*) from public.venue_spaces
    where venue_id = 'd3000000-0000-4000-8000-000000000201'
  ),
  1::bigint,
  'legacy backfill creates exactly one area even when screen_count is greater than one'
);
select is(
  (
    select name from public.venue_spaces
    where venue_id = 'd3000000-0000-4000-8000-000000000201'
  ),
  'Main screen',
  'legacy backfill uses the honest Main screen name'
);
select is(
  (
    select capacity from public.venue_spaces
    where venue_id = 'd3000000-0000-4000-8000-000000000201'
  ),
  80,
  'legacy backfill copies stated capacity into the one known area'
);
select is(
  (
    select capacity from public.venue_spaces
    where venue_id = 'd3000000-0000-4000-8000-000000000202'
  ),
  null::integer,
  'legacy backfill leaves unknown capacity incomplete'
);

insert into public.venue_memberships (venue_id, user_id, role, status)
values
  (
    'd3000000-0000-4000-8000-000000000201',
    'd3000000-0000-4000-8000-000000000102',
    'admin', 'active'
  ),
  (
    'd3000000-0000-4000-8000-000000000201',
    'd3000000-0000-4000-8000-000000000104',
    'admin', 'active'
  ),
  (
    'd3000000-0000-4000-8000-000000000201',
    'd3000000-0000-4000-8000-000000000105',
    'admin', 'active'
  );

set local role authenticated;
set local "request.jwt.claim.sub" = 'd3000000-0000-4000-8000-000000000101';

select is(
  (
    select role from public.get_venue_workspace('d3000000-0000-4000-8000-000000000201')
  ),
  'owner',
  'active owner reads the concrete Venue workspace'
);
select is(
  (
    select needs_area_setup
    from public.get_venue_workspace('d3000000-0000-4000-8000-000000000201')
  ),
  true,
  'legacy screen_count greater than one is exposed as an area setup task'
);
select is(
  (
    select needs_capacity
    from public.get_venue_workspace('d3000000-0000-4000-8000-000000000202')
  ),
  true,
  'unknown legacy area capacity is exposed as a capacity setup task'
);

set local "request.jwt.claim.sub" = 'd3000000-0000-4000-8000-000000000102';
select is(
  (
    select role from public.get_venue_workspace('d3000000-0000-4000-8000-000000000201')
  ),
  'admin',
  'active admin has parity for workspace reads'
);
select lives_ok(
  $$select * from public.save_venue_space('d3000000-0000-4000-8000-000000000201',null,'Terrace screen',45,true,2,null)$$,
  'active admin has parity for controlled area management'
);
select throws_ok(
  $$insert into public.venue_spaces (venue_id,name,capacity) values ('d3000000-0000-4000-8000-000000000201','Client area',20)$$,
  '42501',
  'permission denied for table venue_spaces',
  'active members still cannot bypass the controlled area RPC'
);

set local "request.jwt.claim.sub" = 'd3000000-0000-4000-8000-000000000103';
select throws_ok(
  $$select * from public.get_venue_workspace('d3000000-0000-4000-8000-000000000201')$$,
  'P0001', 'NOT_FOUND',
  'unrelated eligible account cannot read a Venue workspace'
);

set local "request.jwt.claim.sub" = 'd3000000-0000-4000-8000-000000000104';
select throws_ok(
  $$select * from public.save_venue_space('d3000000-0000-4000-8000-000000000201',null,'Restricted area',20,true,3,null)$$,
  'P0001', 'ACCOUNT_RESTRICTED',
  'restricted operator cannot manage Venue areas'
);

set local "request.jwt.claim.sub" = 'd3000000-0000-4000-8000-000000000105';
select throws_ok(
  $$select * from public.save_venue_space('d3000000-0000-4000-8000-000000000201',null,'Suspended area',20,true,3,null)$$,
  'P0001', 'ACCOUNT_SUSPENDED',
  'suspended operator cannot manage Venue areas'
);

set local "request.jwt.claim.sub" = 'd3000000-0000-4000-8000-000000000106';
select lives_ok(
  $$select * from public.create_venue_workspace(
    'Activated Venue','activated-venue',(select id from public.cities where slug='haifa'),
    '30 Activation Street, Haifa',34.997,32.811,
    'A self-serve Venue workspace with one truthfully named initial area.',
    'Front room',55,array['wheelchair_accessible','food'],'Ask staff for the accessible entrance.',
    false,true,true,1,null
  )$$,
  'verified account activates a Venue without first publishing a Fan identity'
);

reset role;

select is(
  (
    select count(*)
    from public.venue_spaces as space
    join public.venues as venue on venue.id = space.venue_id
    where venue.slug = 'activated-venue'
  ),
  1::bigint,
  'activation creates exactly one initial area'
);
select results_eq(
  $$select space.name, space.capacity from public.venue_spaces as space join public.venues as venue on venue.id=space.venue_id where venue.slug='activated-venue'$$,
  $$values ('Front room'::text,55::integer)$$,
  'activation preserves the explicitly named positive-capacity area'
);
select results_eq(
  $$select venue.business_representation_attested_by, venue.verification_status::text from public.venues as venue where venue.slug='activated-venue'$$,
  $$values ('d3000000-0000-4000-8000-000000000106'::uuid,'unverified'::text)$$,
  'activation records truthful representation separately and remains visibly Unverified'
);
select results_eq(
  $$select profile.adult_attested_at is not null, profile.rules_version from public.profiles as profile where profile.id='d3000000-0000-4000-8000-000000000106'$$,
  $$values (true,1::integer)$$,
  'activation records adult attestation and exact current rules acceptance'
);

set local role authenticated;
set local "request.jwt.claim.sub" = 'd3000000-0000-4000-8000-000000000107';
select throws_ok(
  $$select * from public.create_venue_workspace('Null Adult','null-adult',(select id from public.cities where slug='haifa'),'31 Activation Street, Haifa',34.997,32.811,'A Venue activation that must reject a missing adult confirmation.','Main screen',20,array[]::text[],'',true,null,true,1,null)$$,
  'P0001', 'ADULT_ATTESTATION_REQUIRED',
  'raw activation rejects NULL adult attestation with IS DISTINCT FROM TRUE semantics'
);
select throws_ok(
  $$select * from public.create_venue_workspace('False Representation','false-representation',(select id from public.cities where slug='haifa'),'32 Activation Street, Haifa',34.997,32.811,'A Venue activation that must reject false representation.','Main screen',20,array[]::text[],'',true,true,false,1,null)$$,
  'P0001', 'REPRESENTATION_ATTESTATION_REQUIRED',
  'raw activation rejects false business representation attestation'
);
select throws_ok(
  $$select * from public.create_venue_workspace('Stale Rules','stale-rules',(select id from public.cities where slug='haifa'),'33 Activation Street, Haifa',34.997,32.811,'A Venue activation that must reject a stale rules version.','Main screen',20,array[]::text[],'',true,true,true,2,null)$$,
  'P0001', 'RULES_ACCEPTANCE_REQUIRED',
  'raw activation rejects a non-current rules version'
);

reset role;

select throws_ok(
  $$insert into public.venue_spaces (venue_id,name,capacity,active,sort_order) values ('d3000000-0000-4000-8000-000000000201','main SCREEN',30,true,9)$$,
  '23505',
  null,
  'active area names are unique case-insensitively within one Venue'
);
select lives_ok(
  $$insert into public.venue_spaces (venue_id,name,capacity,active,sort_order) values ('d3000000-0000-4000-8000-000000000201','main SCREEN',30,false,9)$$,
  'an inactive historical area may retain a duplicate display name'
);

insert into public.competitions (
  id, sport_id, provider, provider_external_id, code, name, country_name, last_synced_at
)
values (
  'd3000000-0000-4000-8000-000000000401',
  '00000000-0000-4000-8000-000000000020',
  'venue-area-test', 'competition', 'VAT', 'Venue Area Test League',
  'England', statement_timestamp()
);

insert into public.teams (
  id, sport_id, provider, provider_external_id, name, short_name, tla,
  country_name, last_synced_at
)
values
  (
    'd3000000-0000-4000-8000-000000000402',
    '00000000-0000-4000-8000-000000000020',
    'venue-area-test', 'home', 'Venue Area Home', 'Area Home', 'VAH',
    'England', statement_timestamp()
  ),
  (
    'd3000000-0000-4000-8000-000000000403',
    '00000000-0000-4000-8000-000000000020',
    'venue-area-test', 'away', 'Venue Area Away', 'Area Away', 'VAA',
    'England', statement_timestamp()
  );

insert into public.matches (
  id, provider, provider_external_id, competition_id, home_team_id,
  away_team_id, starts_at, status, matchday, season_label, last_synced_at
)
values (
  'd3000000-0000-4000-8000-000000000404',
  'venue-area-test', 'match',
  'd3000000-0000-4000-8000-000000000401',
  'd3000000-0000-4000-8000-000000000402',
  'd3000000-0000-4000-8000-000000000403',
  statement_timestamp() + interval '30 days', 'timed', 1, '2026', statement_timestamp()
);

insert into public.events (
  id, created_by, host_venue_id, match_id, title, description,
  expected_activity, cost_description, event_rules, commercial_affiliation,
  host_presence_confirmed_at, starts_at, ends_at, city_id, place_kind,
  venue_id, venue_space_id, audience, capacity, requires_approval, status, published_at
)
values (
  'd3000000-0000-4000-8000-000000000501',
  'd3000000-0000-4000-8000-000000000101',
  'd3000000-0000-4000-8000-000000000201',
  'd3000000-0000-4000-8000-000000000404',
  'Venue area snapshot event',
  'A commercial event whose capacity is an independent historical snapshot.',
  'Watch the full match together', 'Food and drinks available',
  'Respect staff and every guest.', 'Hosted by Legacy Four Screen Venue',
  statement_timestamp(), statement_timestamp() + interval '30 days',
  statement_timestamp() + interval '30 days 3 hours',
  (select id from public.cities where slug = 'haifa'),
  'venue', 'd3000000-0000-4000-8000-000000000201',
  (select id from public.venue_spaces where venue_id='d3000000-0000-4000-8000-000000000201' and name='Main screen'),
  'public', 40, false, 'published', statement_timestamp()
);

update public.venue_spaces
set capacity = 95
where venue_id = 'd3000000-0000-4000-8000-000000000201' and name = 'Main screen';

select is(
  (
    select capacity from public.events
    where id = 'd3000000-0000-4000-8000-000000000501'
  ),
  40,
  'event capacity remains an independent historical snapshot after area capacity changes'
);
select throws_ok(
  $$update public.events set venue_space_id=(select id from public.venue_spaces where venue_id='d3000000-0000-4000-8000-000000000202') where id='d3000000-0000-4000-8000-000000000501'$$,
  '23514', 'VENUE_SPACE_MISMATCH',
  'an event cannot attach an area from a different Venue'
);

select ok(
  (
    select position('membership' in row_to_json(summary)::text) = 0
      and position('user_id' in row_to_json(summary)::text) = 0
    from public.get_venue_by_slug('legacy-four-screen-venue') as summary
  ),
  'the public Venue projection does not reveal membership records'
);

update public.venues
set verification_status = 'suspended', suspended_at = statement_timestamp()
where id = 'd3000000-0000-4000-8000-000000000201';

set local role authenticated;
set local "request.jwt.claim.sub" = 'd3000000-0000-4000-8000-000000000101';
select throws_ok(
  $$select * from public.save_venue_space('d3000000-0000-4000-8000-000000000201',null,'Venue suspended area',20,true,5,null)$$,
  'P0001', 'NOT_ALLOWED',
  'a suspended Venue denies otherwise eligible owner management'
);

reset role;

select * from finish();
rollback;
