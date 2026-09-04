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

insert into public.event_drafts(id,owner_id,step,draft_values) values
('fa000000-0000-4000-8000-000000000051','fa000000-0000-4000-8000-000000000001',2,'{"matchId":"fa000000-0000-4000-8000-000000000013","title":"First private draft"}'),
('fa000000-0000-4000-8000-000000000052','fa000000-0000-4000-8000-000000000001',1,'{}'),
('fa000000-0000-4000-8000-000000000053','fa000000-0000-4000-8000-000000000003',1,'{"title":"Another person draft"}');
insert into public.event_draft_private_locations(draft_id,address_text,directions_text,location)
values('fa000000-0000-4000-8000-000000000051','Synthetic protected address','Synthetic private directions',
  st_setsrid(st_makepoint(34.8,32.1),4326)::geography);
select has_function('public','list_my_event_drafts',array['integer','integer'],'private drafts have a bounded owner-only recovery list');
select ok(not has_function_privilege('anon','public.list_my_event_drafts(integer,integer)','execute'),'anonymous users cannot execute private draft recovery');
select set_config('request.jwt.claim.sub','fa000000-0000-4000-8000-000000000001',true);
set local role authenticated;
select is((select count(*) from public.list_my_event_drafts(1,0)),1::bigint,'first draft page is bounded');
select is((select total_count from public.list_my_event_drafts(1,0)),2::bigint,'draft list counts only the current owner');
select is((select count(*) from public.list_my_event_drafts(1,1)),1::bigint,'second draft page is reachable');
select is((select count(*) from public.list_my_event_drafts(20,0) where draft_id='fa000000-0000-4000-8000-000000000053'),0::bigint,'draft list never returns another owner');
select is((select title from public.list_my_event_drafts(20,0) where draft_id='fa000000-0000-4000-8000-000000000052'),null::text,'incomplete blank draft remains recoverable without inventing a title');
select is((select home_team_name from public.list_my_event_drafts(20,0) where draft_id='fa000000-0000-4000-8000-000000000052'),null::text,'missing match selection does not prevent draft recovery');
select ok((select not (to_jsonb(draft) ?| array['draft_values','private_address_text','private_directions_text','private_longitude','private_latitude','location'])
  and to_jsonb(draft)::text not like '%Synthetic protected address%'
  and to_jsonb(draft)::text not like '%Synthetic private directions%'
  from public.list_my_event_drafts(20,0) draft where draft_id='fa000000-0000-4000-8000-000000000051'),
  'list projects only safe summary fields even when a protected draft location exists');
select throws_ok($$select * from public.list_my_event_drafts(100,0)$$,'P0001','VALIDATION_FAILED','draft list rejects oversized requests');
select throws_ok($$select * from public.list_my_event_drafts(0,0)$$,'P0001','VALIDATION_FAILED','draft list rejects zero limit');
select throws_ok($$select * from public.list_my_event_drafts(null,0)$$,'P0001','VALIDATION_FAILED','draft list rejects null limit');
select throws_ok($$select * from public.list_my_event_drafts(20,-1)$$,'P0001','VALIDATION_FAILED','draft list rejects negative offset');
select throws_ok($$select * from public.list_my_event_drafts(20,10001)$$,'P0001','VALIDATION_FAILED','draft list rejects unbounded offset');
select throws_ok($$select public.discard_event_draft('fa000000-0000-4000-8000-000000000053')$$,'P0001','NOT_FOUND','discard remains owner-bound');
reset role;
update public.profiles set fan_enabled_at=null,profile_completed_at=null where id='fa000000-0000-4000-8000-000000000001';
set local role authenticated;
select is((select total_count from public.list_my_event_drafts(1,0)),2::bigint,'recovery remains available after Fan activation is lost');
select ok(public.discard_event_draft('fa000000-0000-4000-8000-000000000051'),'owner can discard a listed draft');
select is((select total_count from public.list_my_event_drafts(20,0)),1::bigint,'discard is reflected in recovery list');
reset role;
select is((select count(*) from public.event_draft_private_locations where draft_id='fa000000-0000-4000-8000-000000000051'),0::bigint,'discard cascades the protected draft location');
update public.profiles set deleted_at=now(),handle=null,display_name='Deleted account',fan_enabled_at=null,profile_completed_at=null where id='fa000000-0000-4000-8000-000000000001';
set local role authenticated;
select throws_ok($$select * from public.list_my_event_drafts(20,0)$$,'P0001','AUTH_REQUIRED','erased JWT cannot access retained draft recovery');
reset role;
select * from finish();
rollback;
