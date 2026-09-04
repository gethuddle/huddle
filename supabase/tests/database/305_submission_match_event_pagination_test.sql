begin;
create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public, pg_catalog;
select no_plan();

select has_function('public','list_match_events_page',array['uuid','integer','integer'],
  'match event discovery has an offset page RPC instead of silently truncating at twenty');
select has_index('public','events','events_match_watch_page_idx',
  'published match-event pages have an index matching their fixture and stable order');

-- Every fixture is transaction-scoped and deliberately distinct from seeded/E2E rows.
insert into auth.users(instance_id,id,aud,role,email,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
select '00000000-0000-0000-0000-000000000000',id,'authenticated','authenticated',email,
  now(),'{}','{}',now(),now()
from (values
  ('f3050000-0000-4000-8000-000000000001'::uuid,'match-pagination-host@example.test'),
  ('f3050000-0000-4000-8000-000000000002'::uuid,'match-pagination-viewer@example.test')
) fixtures(id,email);
update public.profiles set handle='match_page_'||right(id::text,1),display_name='Pagination fixture',
  adult_attested_at=now(),rules_version=private.current_rules_version(),rules_accepted_at=now(),
  profile_completed_at=now(),fan_enabled_at=now()
where id in ('f3050000-0000-4000-8000-000000000001','f3050000-0000-4000-8000-000000000002');
insert into public.competitions(id,sport_id,provider,provider_external_id,code,name,country_name,last_synced_at)
values('f3050000-0000-4000-8000-000000000010','00000000-0000-4000-8000-000000000020',
  'match-pagination','league','PAGE','Pagination league','Israel',now());
insert into public.teams(id,sport_id,provider,provider_external_id,name,short_name,tla,country_name,last_synced_at)
select id,'00000000-0000-4000-8000-000000000020','match-pagination',name,name,name,tla,'Israel',now()
from (values
  ('f3050000-0000-4000-8000-000000000011'::uuid,'Page Home','PHO'),
  ('f3050000-0000-4000-8000-000000000012'::uuid,'Page Away','PAW')
) fixtures(id,name,tla);
insert into public.matches(id,provider,provider_external_id,competition_id,home_team_id,away_team_id,starts_at,status,last_synced_at)
select id,'match-pagination',right(id::text,3),'f3050000-0000-4000-8000-000000000010',
  'f3050000-0000-4000-8000-000000000011','f3050000-0000-4000-8000-000000000012',now()+interval '1 day','timed',now()
from (values ('f3050000-0000-4000-8000-000000000013'::uuid),('f3050000-0000-4000-8000-000000000014'::uuid)) fixtures(id);
insert into public.venues(id,owner_id,slug,name,address_text,location,description,stated_capacity,default_attendance_mode,default_requires_approval)
select id,'f3050000-0000-4000-8000-000000000001','match-page-'||right(id::text,3),'Pagination venue',
  'Synthetic public venue',st_setsrid(st_makepoint(34.8,32.1),4326)::geography,
  'Synthetic venue pagination fixture',30,'reservations',false
from (values
  ('f3050000-0000-4000-8000-000000000031'::uuid),
  ('f3050000-0000-4000-8000-000000000032'::uuid),
  ('f3050000-0000-4000-8000-000000000033'::uuid)
) fixtures(id);
insert into public.venue_spaces(id,venue_id,name,capacity)
select ('f3050000-0000-4000-8000-'||lpad((n+10)::text,12,'0'))::uuid,
  ('f3050000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'Pagination screen',30
from generate_series(31,33) n;
update private.venue_billing_entitlements set status='active',interval='month',interval_count=1,
  polar_customer_id='pagination-customer-'||right(venue_id::text,3),
  polar_subscription_id='pagination-subscription-'||right(venue_id::text,3),
  polar_product_id='pagination-product',polar_product_price_id='pagination-price',
  amount=1500,currency='ils',paid_through_at=now()+interval '30 days',first_activated_at=now()
where venue_id in ('f3050000-0000-4000-8000-000000000031','f3050000-0000-4000-8000-000000000033');
update public.venues set verification_status='suspended',suspended_at=now()
where id='f3050000-0000-4000-8000-000000000033';

-- Insert the visible set in reverse identity order. 002/003 tie on start+title;
-- 001 has their start but a later title; 004 has a later start but an earlier title.
-- Expected ordering is therefore 002,003,001,004..024, independent of insertion.
insert into public.events(id,created_by,host_venue_id,venue_id,venue_space_id,match_id,title,description,
  expected_activity,cost_description,event_rules,commercial_affiliation,host_presence_confirmed_at,
  starts_at,ends_at,place_kind,audience,attendance_mode,capacity,requires_approval,status,published_at)
select ('f3051000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,
  'f3050000-0000-4000-8000-000000000001','f3050000-0000-4000-8000-000000000031',
  'f3050000-0000-4000-8000-000000000031',space.id,'f3050000-0000-4000-8000-000000000013',
  case when n=1 then 'Zulu early' when n in (2,3) then 'Alpha early' else 'A later '||lpad(n::text,2,'0') end,
  'Synthetic visible pagination event','Watch football','Free','Respect others','Hosted by venue',now(),
  now()+interval '1 day'+case when n<=3 then interval '0 hours' else interval '1 hour' end,
  now()+interval '1 day 3 hours','venue','public','reservations',30,false,'published',now()
from generate_series(24,1,-1) n
cross join lateral (select id from public.venue_spaces where venue_id='f3050000-0000-4000-8000-000000000031' order by id limit 1) space;

-- Decoys sort before the visible set if status, time, fixture, billing, or
-- suspended-venue visibility is mistakenly applied after LIMIT/OFFSET.
insert into public.events(id,created_by,host_venue_id,venue_id,venue_space_id,match_id,title,description,
  expected_activity,cost_description,event_rules,commercial_affiliation,host_presence_confirmed_at,
  starts_at,ends_at,place_kind,audience,attendance_mode,capacity,requires_approval,status,published_at,cancelled_at,cancel_reason)
select ('f3051000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,
  'f3050000-0000-4000-8000-000000000001',venue_id,venue_id,space.id,
  case when n=806 then 'f3050000-0000-4000-8000-000000000014'::uuid else 'f3050000-0000-4000-8000-000000000013'::uuid end,
  'AAA hidden '||n,'Synthetic excluded pagination event','Watch football','Free','Respect others','Hosted by venue',now(),
  case when n=803 then now()-interval '1 hour' else now()+interval '1 day' end,
  now()+interval '1 day 3 hours','venue','public','reservations',30,false,
  case n when 801 then 'draft' when 802 then 'cancelled' else 'published' end::public.event_status,
  case when n<>801 then now() end,case when n=802 then now() end,case when n=802 then 'Synthetic cancellation' end
from (values
  (801,'f3050000-0000-4000-8000-000000000031'::uuid),
  (802,'f3050000-0000-4000-8000-000000000031'::uuid),
  (803,'f3050000-0000-4000-8000-000000000031'::uuid),
  (804,'f3050000-0000-4000-8000-000000000032'::uuid),
  (805,'f3050000-0000-4000-8000-000000000033'::uuid),
  (806,'f3050000-0000-4000-8000-000000000031'::uuid)
) fixtures(n,venue_id)
cross join lateral (select id from public.venue_spaces where public.venue_spaces.venue_id=fixtures.venue_id order by id limit 1) space;
insert into public.events(id,created_by,host_user_id,match_id,title,description,expected_activity,cost_description,event_rules,
  commercial_affiliation,host_presence_confirmed_at,starts_at,ends_at,place_kind,audience,capacity,requires_approval,status,published_at)
select ('f3051000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,
  'f3050000-0000-4000-8000-000000000001','f3050000-0000-4000-8000-000000000001',
  'f3050000-0000-4000-8000-000000000013','AAA private '||n,'Synthetic private pagination event',
  'Watch football','Free','Respect others','None',now(),now()+interval '1 day',now()+interval '1 day 3 hours','home',
  case when n=901 then 'invite_only' else 'friends' end::public.event_audience,8,true,'published',now()
from (values (901),(902)) fixtures(n);
insert into public.event_private_locations(event_id,address_text,directions,location)
select id,'PROTECTED PAGINATION HOME SENTINEL','PROTECTED DIRECTIONS SENTINEL',st_setsrid(st_makepoint(34.812345,32.112345),4326)::geography
from public.events where id in ('f3051000-0000-4000-8000-000000000901','f3051000-0000-4000-8000-000000000902');
insert into public.event_attendance(event_id,user_id,status,source,reviewed_at,reviewed_by)
values('f3051000-0000-4000-8000-000000000002','f3050000-0000-4000-8000-000000000002',
  'approved','self_request',now(),'f3050000-0000-4000-8000-000000000001');

select set_config('request.jwt.claim.sub','',true);
set local role anon;
select is((select count(*) from public.list_match_events_page('f3050000-0000-4000-8000-000000000013')),20::bigint,'default page is twenty visible events');
select is((select count(*) from public.list_match_events_page('f3050000-0000-4000-8000-000000000013',21,0)),21::bigint,'lookahead returns the twenty-first authorized event');
select is((select array_agg(right(event_id::text,3)) from public.list_match_events_page('f3050000-0000-4000-8000-000000000013',20,0)),
  array['002','003','001','004','005','006','007','008','009','010','011','012','013','014','015','016','017','018','019','020'],
  'first page preserves start then title then identity ordering');
select is((select array_agg(right(event_id::text,3)) from public.list_match_events_page('f3050000-0000-4000-8000-000000000013',20,20)),
  array['021','022','023','024'],'second page exposes every previously truncated event');
select is((select count(*) from (
  select event_id from public.list_match_events_page('f3050000-0000-4000-8000-000000000013',20,0)
  intersect select event_id from public.list_match_events_page('f3050000-0000-4000-8000-000000000013',20,20)
) overlap),0::bigint,'consecutive pages do not repeat events');
select is((select count(distinct event_id) from (
  select event_id from public.list_match_events_page('f3050000-0000-4000-8000-000000000013',20,0)
  union all select event_id from public.list_match_events_page('f3050000-0000-4000-8000-000000000013',20,20)
) all_pages),24::bigint,'paging neither drops visible events nor admits excluded decoys');
select is((select count(*) from public.list_match_events_page('f3050000-0000-4000-8000-000000000013',50,0)),24::bigint,'maximum limit returns only eligible future paid public events for the fixture');
select is((select count(*) from public.list_match_events_page('f3050000-0000-4000-8000-000000000013',1,0)),1::bigint,'minimum page size is accepted');
select is((select count(*) from public.list_match_events_page('f3050000-0000-4000-8000-000000000013',50,10000)),0::bigint,'maximum allowed offset yields an empty terminal page');
select is((select count(*) from public.list_match_events_page('f3050000-0000-4000-8000-000000000099',20,0)),0::bigint,'unknown fixture yields no events');
select results_eq(
  $$select * from public.list_match_events_page('f3050000-0000-4000-8000-000000000013',20,0)$$,
  $$select * from public.list_match_events('f3050000-0000-4000-8000-000000000013',20)$$,
  'first page retains the existing eleven-column DTO and approved attendance projection');
select is((select approved_attendee_count from public.list_match_events_page('f3050000-0000-4000-8000-000000000013',1,0)),1::bigint,'approved attendee count remains factual');
select throws_ok($$select * from public.list_match_events_page(null,20,0)$$,'P0001','VALIDATION_FAILED','null fixture is invalid');
select throws_ok($$select * from public.list_match_events_page('f3050000-0000-4000-8000-000000000013',null,0)$$,'P0001','VALIDATION_FAILED','null limit is invalid');
select throws_ok($$select * from public.list_match_events_page('f3050000-0000-4000-8000-000000000013',0,0)$$,'P0001','VALIDATION_FAILED','zero limit is invalid');
select throws_ok($$select * from public.list_match_events_page('f3050000-0000-4000-8000-000000000013',51,0)$$,'P0001','VALIDATION_FAILED','oversized limit is invalid');
select throws_ok($$select * from public.list_match_events_page('f3050000-0000-4000-8000-000000000013',20,null)$$,'P0001','VALIDATION_FAILED','null offset is invalid');
select throws_ok($$select * from public.list_match_events_page('f3050000-0000-4000-8000-000000000013',20,-1)$$,'P0001','VALIDATION_FAILED','negative offset is invalid');
select throws_ok($$select * from public.list_match_events_page('f3050000-0000-4000-8000-000000000013',20,10001)$$,'P0001','VALIDATION_FAILED','offset beyond the bounded horizon is invalid');
reset role;

select set_config('request.jwt.claim.sub','f3050000-0000-4000-8000-000000000002',true);
set local role authenticated;
select is((select count(*) from public.list_match_events_page('f3050000-0000-4000-8000-000000000013',50,0)),24::bigint,'signed-in stranger receives no extra home events');
reset role;
insert into public.event_invitations(event_id,invitee_id,invited_by,status)
values('f3051000-0000-4000-8000-000000000901','f3050000-0000-4000-8000-000000000002',
  'f3050000-0000-4000-8000-000000000001','pending');
set local role authenticated;
select is((select count(*) from public.list_match_events_page('f3050000-0000-4000-8000-000000000013',50,0)),25::bigint,'current direct invite adds only its authorized private summary');
select is((select array_agg(key order by key) from public.list_match_events_page('f3050000-0000-4000-8000-000000000013',1,0) row
  cross join lateral jsonb_object_keys(to_jsonb(row)) key),
  array['approved_attendee_count','audience','audience_team_name','away_team_name','capacity','competition_name','event_id','home_team_name','requires_approval','starts_at','title'],
  'authorized home preview contains exactly the safe eleven summary columns');
select ok((select to_jsonb(row)::text !~ 'PROTECTED|34.812345|32.112345'
  from public.list_match_events_page('f3050000-0000-4000-8000-000000000013',50,0) row
  where event_id='f3051000-0000-4000-8000-000000000901'),
  'even an invited viewer receives no private address directions or coordinates');
reset role;
update public.profiles set rules_version=private.current_rules_version()+1 where id='f3050000-0000-4000-8000-000000000002';
set local role authenticated;
select is((select count(*) from public.list_match_events_page('f3050000-0000-4000-8000-000000000013',50,0)),24::bigint,'eligibility loss revokes the private preview despite a surviving invite and JWT');
reset role;
update public.profiles set rules_version=private.current_rules_version() where id='f3050000-0000-4000-8000-000000000002';
insert into public.user_blocks(blocker_id,blocked_id)
values('f3050000-0000-4000-8000-000000000001','f3050000-0000-4000-8000-000000000002');
set local role authenticated;
select is((select count(*) from public.list_match_events_page('f3050000-0000-4000-8000-000000000013',50,0)),24::bigint,'block immediately removes invited private preview before pagination');
reset role;

select * from finish();
rollback;
