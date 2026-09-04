begin;
create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public, pg_catalog;
select no_plan();

insert into auth.users (instance_id,id,aud,role,email,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
select '00000000-0000-0000-0000-000000000000', id, 'authenticated','authenticated', email,
  now(),'{}','{}',now(),now()
from (values
  ('fa000000-0000-4000-8000-000000000001'::uuid,'hardening-host@example.test'),
  ('fa000000-0000-4000-8000-000000000002'::uuid,'hardening-attendee@example.test'),
  ('fa000000-0000-4000-8000-000000000003'::uuid,'hardening-outsider@example.test')
) fixtures(id,email);
update public.profiles set handle='hardening_'||right(id::text,1),display_name='Hardening fixture',
  adult_attested_at=now(),rules_version=private.current_rules_version(),rules_accepted_at=now(),
  profile_completed_at=now(),fan_enabled_at=now()
where id in ('fa000000-0000-4000-8000-000000000001','fa000000-0000-4000-8000-000000000002','fa000000-0000-4000-8000-000000000003');
insert into public.competitions(id,sport_id,provider,provider_external_id,code,name,country_name,last_synced_at)
values('fa000000-0000-4000-8000-000000000010','00000000-0000-4000-8000-000000000020','hardening','league','HARD','Hardening league','Israel',now());
insert into public.teams(id,sport_id,provider,provider_external_id,name,short_name,tla,country_name,last_synced_at)
select id,'00000000-0000-4000-8000-000000000020','hardening',name,name,name,tla,'Israel',now()
from (values ('fa000000-0000-4000-8000-000000000011'::uuid,'Home','HOM'),('fa000000-0000-4000-8000-000000000012'::uuid,'Away','AWY')) fixtures(id,name,tla);
insert into public.matches(id,provider,provider_external_id,competition_id,home_team_id,away_team_id,starts_at,status,last_synced_at)
values('fa000000-0000-4000-8000-000000000013','hardening','match','fa000000-0000-4000-8000-000000000010',
  'fa000000-0000-4000-8000-000000000011','fa000000-0000-4000-8000-000000000012',now()+interval '1 day','timed',now());

insert into public.venues(id,owner_id,slug,name,address_text,location,description,stated_capacity,default_attendance_mode,default_requires_approval)
values('fa000000-0000-4000-8000-000000000031','fa000000-0000-4000-8000-000000000001','hardening-venue','Hardening venue',
  'Synthetic public venue',st_setsrid(st_makepoint(34.8,32.1),4326)::geography,'Synthetic venue description',20,'reservations',false);
insert into public.venue_memberships(venue_id,user_id,role,status)
values('fa000000-0000-4000-8000-000000000031','fa000000-0000-4000-8000-000000000002','admin','active');
insert into public.venue_spaces(id,venue_id,name,capacity)
values('fa000000-0000-4000-8000-000000000032','fa000000-0000-4000-8000-000000000031','Audit screen',20);
insert into public.events(id,created_by,host_venue_id,venue_id,venue_space_id,match_id,title,description,expected_activity,cost_description,event_rules,
  commercial_affiliation,host_presence_confirmed_at,starts_at,ends_at,place_kind,audience,attendance_mode,capacity,requires_approval,status)
select id,'fa000000-0000-4000-8000-000000000001','fa000000-0000-4000-8000-000000000031','fa000000-0000-4000-8000-000000000031',
  'fa000000-0000-4000-8000-000000000032','fa000000-0000-4000-8000-000000000013',title,'Synthetic venue event description','Watch football','Free',
  'Respect others','Hosted by venue',now(),now()+interval '1 day',now()+interval '1 day 3 hours','venue','public',mode::event_attendance_mode,capacity,false,'draft'
from (values ('fa000000-0000-4000-8000-000000000041'::uuid,'Open-door draft','open_door',null::integer),
  ('fa000000-0000-4000-8000-000000000042'::uuid,'Reservation draft','reservations',10),
  ('fa000000-0000-4000-8000-000000000043'::uuid,'Discardable draft','open_door',null::integer),
  ('fa000000-0000-4000-8000-000000000044'::uuid,'Retained unpaid draft','open_door',null::integer)) fixtures(id,title,mode,capacity);
create temporary table edit_values(value jsonb);
insert into edit_values values('{"title":"Updated event","description":"Updated synthetic event description","expectedActivity":"Watch football","costDescription":"Free","eventRules":"Respect others","commercialAffiliation":"Hosted by venue","hostPresenceConfirmed":true,"capacity":null,"requiresApproval":false}');
grant select on edit_values to authenticated;

select set_config('request.jwt.claim.sub','fa000000-0000-4000-8000-000000000001',true);
set local role authenticated;
select is((select attendance_mode from public.get_venue_event_for_management('fa000000-0000-4000-8000-000000000041')),'open_door','owner reads immutable open-door edit contract');
select is((select status from public.save_venue_event('fa000000-0000-4000-8000-000000000041',(select value from edit_values),'draft')),'draft','inactive venue can edit an unpublished draft');
select throws_ok($$select * from public.save_venue_event('fa000000-0000-4000-8000-000000000041',(select value from edit_values),'publish')$$,'P0001','NOT_ALLOWED','inactive entitlement cannot publish saved draft');
reset role;
update private.venue_billing_entitlements set status='active',interval='month',interval_count=1,
  polar_customer_id='fixture-customer',polar_subscription_id='fixture-subscription',polar_product_id='fixture-product',polar_product_price_id='fixture-price',
  amount=1500,currency='ils',paid_through_at=now()+interval '30 days',first_activated_at=now()
where venue_id='fa000000-0000-4000-8000-000000000031';
update public.matches set status='cancelled' where id='fa000000-0000-4000-8000-000000000013';
set local role authenticated;
select throws_ok($$select * from public.save_venue_event('fa000000-0000-4000-8000-000000000041',(select value from edit_values),'publish')$$,'P0001','NOT_FOUND','saved draft cannot publish a cancelled fixture');
reset role;
update public.matches set status='timed',starts_at=now()-interval '1 hour' where id='fa000000-0000-4000-8000-000000000013';
set local role authenticated;
select throws_ok($$select * from public.save_venue_event('fa000000-0000-4000-8000-000000000041',(select value from edit_values),'publish')$$,'P0001','NOT_FOUND','saved draft cannot publish a fixture moved into the past');
reset role;
update public.matches set starts_at=now()+interval '1 day' where id='fa000000-0000-4000-8000-000000000013';
set local role authenticated;
select is((select status from public.save_venue_event('fa000000-0000-4000-8000-000000000041',(select value from edit_values),'publish')),'published','active owner publishes existing open-door draft');
select throws_ok($$select * from public.save_venue_event('fa000000-0000-4000-8000-000000000041',(select value from edit_values),'draft')$$,'P0001','INVALID_TRANSITION','published event cannot be moved back to draft');
select throws_ok($$select * from public.save_venue_event('fa000000-0000-4000-8000-000000000041',(select value||'{"audience":"friends"}'::jsonb from edit_values),'publish')$$,'P0001','VALIDATION_FAILED','crafted immutable audience key is rejected');
select throws_ok($$select * from public.save_venue_event('fa000000-0000-4000-8000-000000000041',(select value||'{"capacity":2}'::jsonb from edit_values),'publish')$$,'P0001','VALIDATION_FAILED','open door never acquires invented capacity');
select is((select status from public.save_venue_event('fa000000-0000-4000-8000-000000000043','{}','cancel')),'cancelled','cancel draft retains terminal row');
select throws_ok($$select * from public.save_venue_event('fa000000-0000-4000-8000-000000000043',(select value from edit_values),'publish')$$,'P0001','INVALID_TRANSITION','cancelled draft never resurrects');
reset role;
select is((select count(*) from public.events where id='fa000000-0000-4000-8000-000000000043'),1::bigint,'cancelled draft row is retained');
select set_config('request.jwt.claim.sub','fa000000-0000-4000-8000-000000000002',true);
set local role authenticated;
select is((select status from public.save_venue_event('fa000000-0000-4000-8000-000000000042',(select value||'{"capacity":10}'::jsonb from edit_values),'publish')),'published','active venue admin can publish reservation draft without billing authority');
select throws_ok($$select * from public.save_venue_event('fa000000-0000-4000-8000-000000000042',(select value||'{"capacity":21}'::jsonb from edit_values),'publish')$$,'P0001','VALIDATION_FAILED','capacity cannot exceed viewing area');
reset role;
insert into public.event_attendance(event_id,user_id,status,source,reviewed_at,reviewed_by)
select 'fa000000-0000-4000-8000-000000000042',id,'approved','self_request',now(),'fa000000-0000-4000-8000-000000000001'
from public.profiles where id in ('fa000000-0000-4000-8000-000000000002','fa000000-0000-4000-8000-000000000003');
set local role authenticated;
select throws_ok($$select * from public.save_venue_event('fa000000-0000-4000-8000-000000000042',(select value||'{"capacity":1}'::jsonb from edit_values),'publish')$$,'P0001','EVENT_FULL','editor cannot lower capacity below already-approved attendees');
select is((select capacity from public.get_venue_event_for_management('fa000000-0000-4000-8000-000000000042')),10,'failed capacity edit preserves the existing capacity');
select lives_ok($$select * from public.save_venue_event('fa000000-0000-4000-8000-000000000042',(select value||'{"capacity":2}'::jsonb from edit_values),'publish')$$,'capacity equal to approved attendance remains valid');
reset role;
update private.venue_billing_entitlements set status='past_due',grace_started_at=now(),grace_expires_at=now()+interval '7 days'
where venue_id='fa000000-0000-4000-8000-000000000031';
set local role authenticated;
select lives_ok($$select * from public.save_venue_event('fa000000-0000-4000-8000-000000000042',(select value||'{"capacity":10}'::jsonb from edit_values),'publish')$$,'grace permits editing already-published event without acquiring visibility');
select throws_ok($$select * from public.save_venue_event('fa000000-0000-4000-8000-000000000044',(select value from edit_values),'publish')$$,'P0001','NOT_ALLOWED','past-due grace cannot publish a new venue event');
select is((select status from public.save_venue_event('fa000000-0000-4000-8000-000000000044',(select value from edit_values),'draft')),'draft','past-due grace retains unpublished draft preparation');
reset role;
select ok(not private.venue_allows_public_presence('fa000000-0000-4000-8000-000000000031',statement_timestamp()),'editing during grace does not restore public venue presence');
-- Restore active before starting a distinct fixed grace interval; never extend a grace.
update private.venue_billing_entitlements set status='active',grace_started_at=null,grace_expires_at=null,
  paid_through_at=now()-interval '1 day' where venue_id='fa000000-0000-4000-8000-000000000031';
set local role authenticated;
select lives_ok($$select * from public.save_venue_event('fa000000-0000-4000-8000-000000000042',(select value||'{"capacity":10}'::jsonb from edit_values),'publish')$$,'timestamp-derived provider-stale grace permits editing existing events');
select throws_ok($$select * from public.save_venue_event('fa000000-0000-4000-8000-000000000044',(select value from edit_values),'publish')$$,'P0001','NOT_ALLOWED','timestamp-derived provider-stale grace cannot publish a new event');
reset role;
update private.venue_billing_entitlements set status='past_due',grace_started_at=now()-interval '7 days',grace_expires_at=now()
where venue_id='fa000000-0000-4000-8000-000000000031';
set local role authenticated;
select throws_ok($$select * from public.save_venue_event('fa000000-0000-4000-8000-000000000042',(select value||'{"capacity":10}'::jsonb from edit_values),'publish')$$,'P0001','NOT_ALLOWED','expired grace denies editing an existing published event');
select throws_ok($$select * from public.save_venue_event('fa000000-0000-4000-8000-000000000044',(select value from edit_values),'draft')$$,'P0001','NOT_ALLOWED','expired grace denies unpublished draft changes');
select throws_ok($$select * from public.save_venue_event('fa000000-0000-4000-8000-000000000044','{}','cancel')$$,'P0001','NOT_ALLOWED','expired grace denies draft cancellation mutations');
select is((select status from public.get_venue_event_for_management('fa000000-0000-4000-8000-000000000042')),'cancelled','expired grace projects future published event as cancelled without a sweep');
select is((select status from public.get_venue_event_for_management('fa000000-0000-4000-8000-000000000044')),'draft','expired grace retains read-only draft access');
reset role;
update private.venue_billing_entitlements set status='canceling',grace_started_at=null,grace_expires_at=null,
  paid_through_at=(select starts_at from public.events where id='fa000000-0000-4000-8000-000000000044')
where venue_id='fa000000-0000-4000-8000-000000000031';
set local role authenticated;
select throws_ok($$select * from public.save_venue_event('fa000000-0000-4000-8000-000000000044',(select value from edit_values),'publish')$$,'P0001','NOT_ALLOWED','cancel-at-end cannot publish an event starting exactly at the paid cutoff');
reset role;
update private.venue_billing_entitlements set paid_through_at=paid_through_at+interval '1 microsecond'
where venue_id='fa000000-0000-4000-8000-000000000031';
set local role authenticated;
select is((select status from public.save_venue_event('fa000000-0000-4000-8000-000000000044',(select value from edit_values),'publish')),'published','cancel-at-end can publish an event starting strictly before the paid cutoff');
reset role;
update private.venue_billing_entitlements set paid_through_at=now()
where venue_id='fa000000-0000-4000-8000-000000000031';
set local role authenticated;
select throws_ok($$select * from public.save_venue_event('fa000000-0000-4000-8000-000000000044',(select value from edit_values),'publish')$$,'P0001','NOT_ALLOWED','elapsed voluntary cancellation period denies further edits');
select is((select status from public.get_venue_event_for_management('fa000000-0000-4000-8000-000000000044')),'cancelled','elapsed voluntary cancellation period retains read-only cancelled projection');
reset role;
update private.venue_billing_entitlements set status='active',paid_through_at=now()+interval '30 days'
where venue_id='fa000000-0000-4000-8000-000000000031';
update public.venue_memberships set status='revoked',revoked_at=now()
where venue_id='fa000000-0000-4000-8000-000000000031' and user_id='fa000000-0000-4000-8000-000000000002';
set local role authenticated;
select throws_ok($$select * from public.get_venue_event_for_management('fa000000-0000-4000-8000-000000000041')$$,'P0001','NOT_ALLOWED','revoked venue admin cannot read editor data with an existing JWT');
select throws_ok($$select * from public.save_venue_event('fa000000-0000-4000-8000-000000000041',(select value from edit_values),'publish')$$,'P0001','NOT_ALLOWED','revoked venue admin cannot edit with an existing JWT');
reset role;
update public.venue_memberships set status='active',revoked_at=null
where venue_id='fa000000-0000-4000-8000-000000000031' and user_id='fa000000-0000-4000-8000-000000000002';
update public.profiles set deleted_at=now(),handle=null,display_name='Deleted account',fan_enabled_at=null,profile_completed_at=null
where id='fa000000-0000-4000-8000-000000000002';
set local role authenticated;
select throws_ok($$select * from public.get_venue_event_for_management('fa000000-0000-4000-8000-000000000041')$$,'P0001','AUTH_REQUIRED','deleted venue admin cannot read editor data with a surviving JWT');
select throws_ok($$select * from public.save_venue_event('fa000000-0000-4000-8000-000000000041',(select value from edit_values),'publish')$$,'P0001','AUTH_REQUIRED','deleted venue admin cannot mutate despite a retained membership');
reset role;
select set_config('request.jwt.claim.sub','fa000000-0000-4000-8000-000000000003',true);
set local role authenticated;
select throws_ok($$select * from public.get_venue_event_for_management('fa000000-0000-4000-8000-000000000041')$$,'P0001','NOT_ALLOWED','outsider cannot read management projection');
select throws_ok($$select * from public.save_venue_event('fa000000-0000-4000-8000-000000000041',(select value from edit_values),'publish')$$,'P0001','NOT_ALLOWED','outsider cannot edit another venue event');
reset role;
reset role;
update public.events set starts_at=now()-interval '4 hours',ends_at=now()-interval '1 hour'
where id='fa000000-0000-4000-8000-000000000041';
select set_config('request.jwt.claim.sub','fa000000-0000-4000-8000-000000000001',true);
set local role authenticated;
select is((select status from public.get_venue_event_for_management('fa000000-0000-4000-8000-000000000041')),'completed','elapsed venue management DTO agrees with completed summary');
reset role;
select * from finish();
rollback;
