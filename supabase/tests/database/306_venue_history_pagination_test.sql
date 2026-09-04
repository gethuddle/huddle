begin;
create extension if not exists pgtap with schema extensions;
set local search_path=extensions,public,pg_catalog;
select no_plan();

select has_function('public','list_venue_calendar_page',array['uuid','text','integer','integer'],
  'venue history has an offset page RPC instead of fixed surface truncation');
select has_index('public','events','events_host_venue_history_page_idx',
  'Venue history has an index matching its host and stable page order');
select function_privs_are('public','list_venue_calendar_page',array['uuid','text','integer','integer'],'anon',array[]::text[],
  'anonymous actors cannot execute Venue history');
select function_privs_are('public','list_venue_calendar_page',array['uuid','text','integer','integer'],'authenticated',array['EXECUTE'],
  'authenticated actors may reach the internally authorized RPC');
select is((select provolatile::text from pg_proc where oid='public.list_venue_calendar_page(uuid,text,integer,integer)'::regprocedure),
  'v','the wrapper stays volatile because its actor assertion may take a row lock');
select ok(pg_get_functiondef('public.list_venue_calendar_page(uuid,text,integer,integer)'::regprocedure)
  like '%private.actor_manages_venue(actor_id,input_venue_id)%',
  'the page RPC retains owner/admin authorization');
select ok(pg_get_functiondef('public.list_venue_calendar_page(uuid,text,integer,integer)'::regprocedure)
  like '%private.event_history_status(event,statement_timestamp())%',
  'calendar paging uses the common elapsed-event history status');

-- Transaction-only actors and catalog rows; these never depend on seed data.
insert into auth.users(instance_id,id,aud,role,email,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
select '00000000-0000-0000-0000-000000000000',id,'authenticated','authenticated',email,
  now(),'{}','{}',now(),now()
from (values
  ('f3060000-0000-4000-8000-000000000001'::uuid,'venue-history-owner@example.test'),
  ('f3060000-0000-4000-8000-000000000002'::uuid,'venue-history-admin@example.test'),
  ('f3060000-0000-4000-8000-000000000003'::uuid,'venue-history-outsider@example.test')
) fixtures(id,email);
update public.profiles set handle='venue_history_'||right(id::text,1),display_name='Venue history fixture',
  adult_attested_at=now(),rules_version=private.current_rules_version(),rules_accepted_at=now(),
  profile_completed_at=now(),fan_enabled_at=now()
where id in ('f3060000-0000-4000-8000-000000000001','f3060000-0000-4000-8000-000000000002',
  'f3060000-0000-4000-8000-000000000003');
insert into public.competitions(id,sport_id,provider,provider_external_id,code,name,country_name,last_synced_at)
values('f3060000-0000-4000-8000-000000000010','00000000-0000-4000-8000-000000000020',
  'venue-history','league','HIST','Venue history league','Israel',now());
insert into public.teams(id,sport_id,provider,provider_external_id,name,short_name,tla,country_name,last_synced_at)
select id,'00000000-0000-4000-8000-000000000020','venue-history',name,name,name,tla,'Israel',now()
from (values
  ('f3060000-0000-4000-8000-000000000011'::uuid,'History Home','HIS'),
  ('f3060000-0000-4000-8000-000000000012'::uuid,'History Away','AWY')
) fixtures(id,name,tla);
insert into public.matches(id,provider,provider_external_id,competition_id,home_team_id,away_team_id,starts_at,status,last_synced_at)
values('f3060000-0000-4000-8000-000000000013','venue-history','fixture',
  'f3060000-0000-4000-8000-000000000010','f3060000-0000-4000-8000-000000000011',
  'f3060000-0000-4000-8000-000000000012',now()+interval '1 day','timed',now());
insert into public.venues(id,owner_id,slug,name,address_text,location,description,stated_capacity,
  default_attendance_mode,default_requires_approval)
values('f3060000-0000-4000-8000-000000000020','f3060000-0000-4000-8000-000000000001',
  'venue-history-fixture','Venue history fixture','Synthetic public venue',
  st_setsrid(st_makepoint(34.8,32.1),4326)::geography,'Synthetic history pagination fixture',40,
  'reservations',false);
insert into public.venue_spaces(id,venue_id,name,capacity)
values('f3060000-0000-4000-8000-000000000021','f3060000-0000-4000-8000-000000000020',
  'History screen',40);
insert into public.venue_memberships(venue_id,user_id,role,status)
values('f3060000-0000-4000-8000-000000000020','f3060000-0000-4000-8000-000000000002','admin','active');
update private.venue_billing_entitlements set status='active',interval='month',interval_count=1,
  polar_customer_id='venue-history-customer',polar_subscription_id='venue-history-subscription',
  polar_product_id='venue-history-product',polar_product_price_id='venue-history-price',
  amount=1500,currency='ils',paid_through_at=now()+interval '30 days',first_activated_at=now()
where venue_id='f3060000-0000-4000-8000-000000000020';

-- More than the old 250-row Events cap makes the former truncation observable.
insert into public.events(id,created_by,host_venue_id,venue_id,venue_space_id,match_id,title,description,
  expected_activity,cost_description,event_rules,commercial_affiliation,host_presence_confirmed_at,
  starts_at,ends_at,place_kind,audience,attendance_mode,capacity,requires_approval,status,published_at)
select ('f3061000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,
  'f3060000-0000-4000-8000-000000000001','f3060000-0000-4000-8000-000000000020',
  'f3060000-0000-4000-8000-000000000020','f3060000-0000-4000-8000-000000000021',
  'f3060000-0000-4000-8000-000000000013','Completed history '||lpad(n::text,3,'0'),
  'Synthetic completed venue history event','Watch football','Free','Respect others','Hosted by venue',now(),
  now()-interval '400 days'+n*interval '1 day',now()-interval '400 days'+n*interval '1 day 3 hours',
  'venue','public','reservations',40,false,'completed',now()-interval '500 days'
from generate_series(1,251) n;

-- These newer drafts would crowd completed rows out if filtering happened after pagination.
insert into public.events(id,created_by,host_venue_id,venue_id,venue_space_id,match_id,title,description,
  expected_activity,cost_description,event_rules,commercial_affiliation,host_presence_confirmed_at,
  starts_at,ends_at,place_kind,audience,attendance_mode,capacity,requires_approval,status)
select ('f3061000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,
  'f3060000-0000-4000-8000-000000000001','f3060000-0000-4000-8000-000000000020',
  'f3060000-0000-4000-8000-000000000020','f3060000-0000-4000-8000-000000000021',
  'f3060000-0000-4000-8000-000000000013','Future draft '||lpad(n::text,3,'0'),
  'Synthetic future venue history draft','Watch football','Free','Respect others','Hosted by venue',now(),
  case when n<=322 then now()+interval '60 days' else now()+(n-300)*interval '1 day' end,
  case when n<=322 then now()+interval '60 days 3 hours' else now()+(n-300)*interval '1 day 3 hours' end,
  'venue','public','reservations',40,false,'draft'
from generate_series(301,330) n;

-- Stored published but elapsed: the history projection, not a destructive write, must say Completed.
insert into public.events(id,created_by,host_venue_id,venue_id,venue_space_id,match_id,title,description,
  expected_activity,cost_description,event_rules,commercial_affiliation,host_presence_confirmed_at,
  starts_at,ends_at,place_kind,audience,attendance_mode,capacity,requires_approval,status,published_at)
values('f3061000-0000-4000-8000-000000000901','f3060000-0000-4000-8000-000000000001',
  'f3060000-0000-4000-8000-000000000020','f3060000-0000-4000-8000-000000000020',
  'f3060000-0000-4000-8000-000000000021','f3060000-0000-4000-8000-000000000013',
  'Elapsed published event','Synthetic elapsed published event','Watch football','Free','Respect others',
  'Hosted by venue',now()-interval '3 days',now()-interval '2 days',now()-interval '1 day',
  'venue','public','reservations',40,false,'published',now()-interval '3 days');

-- Separate full, ordinary published, and cancelled rows protect filter semantics.
insert into public.events(id,created_by,host_venue_id,venue_id,venue_space_id,match_id,title,description,
  expected_activity,cost_description,event_rules,commercial_affiliation,host_presence_confirmed_at,
  starts_at,ends_at,place_kind,audience,attendance_mode,capacity,requires_approval,status,published_at,
  cancelled_at,cancel_reason)
values
  ('f3061000-0000-4000-8000-000000000902','f3060000-0000-4000-8000-000000000001',
    'f3060000-0000-4000-8000-000000000020','f3060000-0000-4000-8000-000000000020',
    'f3060000-0000-4000-8000-000000000021','f3060000-0000-4000-8000-000000000013',
    'Full published event','Synthetic full venue event','Watch football','Free','Respect others',
    'Hosted by venue',now(),now()+interval '5 days',now()+interval '5 days 3 hours',
    'venue','public','reservations',1,false,'published',now(),null,null),
  ('f3061000-0000-4000-8000-000000000903','f3060000-0000-4000-8000-000000000001',
    'f3060000-0000-4000-8000-000000000020','f3060000-0000-4000-8000-000000000020',
    'f3060000-0000-4000-8000-000000000021','f3060000-0000-4000-8000-000000000013',
    'Available published event','Synthetic available venue event','Watch football','Free','Respect others',
    'Hosted by venue',now(),now()+interval '4 days',now()+interval '4 days 3 hours',
    'venue','public','reservations',1,false,'published',now(),null,null),
  ('f3061000-0000-4000-8000-000000000904','f3060000-0000-4000-8000-000000000001',
    'f3060000-0000-4000-8000-000000000020','f3060000-0000-4000-8000-000000000020',
    'f3060000-0000-4000-8000-000000000021','f3060000-0000-4000-8000-000000000013',
    'Cancelled venue event','Synthetic cancelled venue event','Watch football','Free','Respect others',
    'Hosted by venue',now(),now()+interval '3 days',now()+interval '3 days 3 hours',
    'venue','public','reservations',1,false,'cancelled',now()-interval '1 day',now(),
    'Synthetic cancellation');
insert into public.event_attendance(event_id,user_id,status,source,reviewed_at,reviewed_by)
values('f3061000-0000-4000-8000-000000000902','f3060000-0000-4000-8000-000000000002',
  'approved','self_request',now(),'f3060000-0000-4000-8000-000000000001');

select set_config('request.jwt.claim.sub','f3060000-0000-4000-8000-000000000001',true);
set local role authenticated;
select is((select count(*) from public.list_venue_calendar_page(
  'f3060000-0000-4000-8000-000000000020','all',20,260)),20::bigint,
  'the owner reaches an all-status page beyond the former 250-row Events cap');
select is((select min(total_count) from public.list_venue_calendar_page(
  'f3060000-0000-4000-8000-000000000020','all',20,260)),285::bigint,
  'later pages retain the complete filtered total');
select is((select array_agg(right(event_id::text,3)) from public.list_venue_calendar_page(
  'f3060000-0000-4000-8000-000000000020','all',20,0)),
  array['322','321','320','319','318','317','316','315','314','313','312','311','310','309','308','307','306','305','304','303'],
  'equal-start rows use descending identity as a deterministic adjacent-page tie-breaker');
select is((select array_agg(right(event_id::text,3)) from (select event_id
  from public.list_venue_calendar_page('f3060000-0000-4000-8000-000000000020','all',20,20)
  limit 2) adjacent),array['302','301'],
  'the next page continues the equal-start identity order without skipping the boundary');
select is((select count(*) from (
  select event_id from public.list_venue_calendar_page(
    'f3060000-0000-4000-8000-000000000020','all',20,0)
  intersect
  select event_id from public.list_venue_calendar_page(
    'f3060000-0000-4000-8000-000000000020','all',20,20)
) overlap),0::bigint,'adjacent deterministic pages never repeat an event');
select is((select count(*) from public.list_venue_calendar_page(
  'f3060000-0000-4000-8000-000000000020','completed',20,0)),20::bigint,
  'status filtering happens before the first page despite newer draft rows');
select is((select count(*) from public.list_venue_calendar_page(
  'f3060000-0000-4000-8000-000000000020','completed',20,240)),12::bigint,
  'the final Completed page exposes all 252 projected history rows');
select is((select status from public.list_venue_calendar_page(
  'f3060000-0000-4000-8000-000000000020','completed',50,0)
  where event_id='f3061000-0000-4000-8000-000000000901'),'completed',
  'an elapsed stored-published event is presented as Completed');
select is((select event_id from public.list_venue_calendar_page(
  'f3060000-0000-4000-8000-000000000020','full',20,0)),
  'f3061000-0000-4000-8000-000000000902'::uuid,
  'Full returns only a capacity-backed published event whose approved count reaches capacity');
select is((select event_id from public.list_venue_calendar_page(
  'f3060000-0000-4000-8000-000000000020','published',20,0)),
  'f3061000-0000-4000-8000-000000000903'::uuid,
  'Published excludes both elapsed and full events');
select is((select event_id from public.list_venue_calendar_page(
  'f3060000-0000-4000-8000-000000000020','cancelled',20,0)),
  'f3061000-0000-4000-8000-000000000904'::uuid,
  'Cancelled remains separately reachable in retained Venue history');
reset role;

select set_config('request.jwt.claim.sub','f3060000-0000-4000-8000-000000000002',true);
set local role authenticated;
select is((select count(*) from public.list_venue_calendar_page(
  'f3060000-0000-4000-8000-000000000020','all',20,260)),20::bigint,
  'an active Venue admin reaches the same later history page');
reset role;

select set_config('request.jwt.claim.sub','f3060000-0000-4000-8000-000000000003',true);
set local role authenticated;
select throws_ok($$select * from public.list_venue_calendar_page(
  'f3060000-0000-4000-8000-000000000020','all',20,0)$$,'P0001','NOT_FOUND',
  'a common-eligible outsider cannot read Venue history');
reset role;

select set_config('request.jwt.claim.sub','f3060000-0000-4000-8000-000000000001',true);
set local role authenticated;
select throws_ok($$select * from public.list_venue_calendar_page(null,'all',20,0)$$,
  'P0001','VALIDATION_FAILED','null Venue is rejected');
select throws_ok($$select * from public.list_venue_calendar_page(
  'f3060000-0000-4000-8000-000000000020',null,20,0)$$,
  'P0001','VALIDATION_FAILED','null status is rejected');
select throws_ok($$select * from public.list_venue_calendar_page(
  'f3060000-0000-4000-8000-000000000020','unexpected',20,0)$$,
  'P0001','VALIDATION_FAILED','unknown status is rejected');
select throws_ok($$select * from public.list_venue_calendar_page(
  'f3060000-0000-4000-8000-000000000020','all',51,0)$$,
  'P0001','VALIDATION_FAILED','oversized pages are rejected');
select throws_ok($$select * from public.list_venue_calendar_page(
  'f3060000-0000-4000-8000-000000000020','all',20,10001)$$,
  'P0001','VALIDATION_FAILED','offsets beyond the common collection horizon are rejected');
reset role;

select * from finish();
rollback;
