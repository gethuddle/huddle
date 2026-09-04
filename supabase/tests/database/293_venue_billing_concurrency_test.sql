begin;
create extension if not exists pgtap with schema extensions;
create extension if not exists dblink with schema extensions;
set local search_path=extensions,public,pg_catalog;
select no_plan();

-- Only synthetic records, committed through a separate local connection.
do $setup$
begin
 perform dblink_connect('vb8_setup',format('host=%s port=5432 dbname=postgres user=postgres password=postgres sslmode=disable', host(inet_server_addr())));
 perform dblink_exec('vb8_setup',$remote$
insert into auth.users(instance_id,id,aud,role,email,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
select '00000000-0000-0000-0000-000000000000', ('e9000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,
 'authenticated','authenticated','vb-race-'||n||'@example.test',now(),'{}','{}',now(),now()
from generate_series(1,6) n;
update public.profiles set handle='vb_race_'||right(id::text,1),display_name='Race Fan',
 adult_attested_at=now(),rules_version=private.current_rules_version(),rules_accepted_at=now(),
 profile_completed_at=now(),fan_enabled_at=now() where id::text like 'e9000000%';
insert into public.competitions(id,sport_id,provider,provider_external_id,code,name,country_name,last_synced_at)
values('e9000000-0000-4000-8000-000000000100','00000000-0000-4000-8000-000000000020','vb-race','league','VBV','Race League','Israel',now());
insert into public.teams(id,sport_id,provider,provider_external_id,name,short_name,tla,country_name,last_synced_at)
select ('e9000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'00000000-0000-4000-8000-000000000020',
 'vb-race',n::text,'Race Team '||n,'VB '||n,'VBV','Israel',now() from generate_series(101,102) n;
insert into public.matches(id,provider,provider_external_id,competition_id,home_team_id,away_team_id,starts_at,status,last_synced_at)
values('e9000000-0000-4000-8000-000000000103','vb-race','fixture','e9000000-0000-4000-8000-000000000100',
 'e9000000-0000-4000-8000-000000000101','e9000000-0000-4000-8000-000000000102',now()+interval '2 days','timed',now());
create temporary table billing_cases(n integer, state text, visible boolean);
insert into billing_cases values(1,'active',true),(2,'canceling',true),(3,'past_due',false),(4,'provider_stale',false),
 (5,'legacy_grace',false),(6,'inactive',false),(7,'confirming',false),(8,'expired',false);
insert into public.venues(id,owner_id,slug,name,address_text,location,description)
select ('e9000000-0000-4000-8000-'||lpad((200+n)::text,12,'0'))::uuid,'e9000000-0000-4000-8000-000000000001',
 'vb-race-'||n,'Race Venue '||n,'10 Test Street, Haifa',extensions.st_setsrid(extensions.st_makepoint(34.998,32.812),4326)::extensions.geography,
 'A synthetic venue for entitlement boundaries.' from billing_cases;
delete from private.venue_billing_entitlements where venue_id='e9000000-0000-4000-8000-000000000205';
select private.backfill_legacy_venue_billing_entitlements(now());
update private.venue_billing_entitlements e set status=c.state::public.venue_billing_status,
 interval=case when c.state not in ('inactive','legacy_grace','expired') then 'month'::public.venue_billing_interval end,
 interval_count=case when c.state not in ('inactive','legacy_grace','expired') then 1 end,
 polar_customer_id=case when c.state not in ('inactive','legacy_grace','expired') then 'customer-test' end,
 polar_subscription_id=case when c.state not in ('inactive','legacy_grace','expired') then 'subscription-'||c.n end,
 polar_product_id=case when c.state not in ('inactive','legacy_grace','expired') then 'product-test' end,
 polar_product_price_id=case when c.state not in ('inactive','legacy_grace','expired') then 'price-test' end,
 amount=case when c.state not in ('inactive','legacy_grace','expired') then 1500 end,
 currency=case when c.state not in ('inactive','legacy_grace','expired') then 'ils' end,
 paid_through_at=case when c.state not in ('inactive','legacy_grace','expired') then now()+interval '5 days' end,
 grace_started_at=case when c.state in ('past_due','provider_stale','legacy_grace') then now() end,
 grace_expires_at=case when c.state in ('past_due','provider_stale','legacy_grace') then now()+interval '168 hours' end
from billing_cases c where c.n<>5 and e.venue_id=('e9000000-0000-4000-8000-'||lpad((200+c.n)::text,12,'0'))::uuid;
insert into public.events(id,created_by,host_venue_id,match_id,title,description,expected_activity,cost_description,event_rules,
 commercial_affiliation,host_presence_confirmed_at,starts_at,ends_at,place_kind,venue_id,audience,capacity,requires_approval,status,published_at)
select ('e9000000-0000-4000-8000-'||lpad((300+n)::text,12,'0'))::uuid,'e9000000-0000-4000-8000-000000000001',
 ('e9000000-0000-4000-8000-'||lpad((200+n)::text,12,'0'))::uuid,'e9000000-0000-4000-8000-000000000103',
 'Race Event '||n,'Watch the match together.','Watch the match.','No entry fee.','Be respectful.','Hosted by the venue.',
 now(),now()+interval '2 days',now()+interval '2 days 3 hours','venue',
 ('e9000000-0000-4000-8000-'||lpad((200+n)::text,12,'0'))::uuid,'public',20,true,'published',now() from billing_cases;

 $remote$);
 perform dblink_disconnect('vb8_setup');
end;
$setup$;
create temporary table race_evidence(label text,waiting boolean,rows_free boolean,result text);
do $races$
declare
 conn text:=format('host=%s port=5432 dbname=postgres user=postgres password=postgres sslmode=disable', host(inet_server_addr()));
 worker_pid integer; scenario record; observed boolean; row_free boolean; result text; deadline timestamptz;
begin
 perform dblink_connect('vb8_holder',conn);
 perform dblink_connect('vb8_worker',conn);
 perform dblink_connect('vb8_probe',conn);
 select pid into worker_pid from dblink('vb8_worker','select pg_backend_pid()') t(pid integer);
 perform dblink_exec('vb8_worker',$remote$
 create function pg_temp.try_query(q text) returns text language plpgsql as $body$
 begin execute q; return 'ok'; exception when others then return sqlstate||':'||sqlerrm; end; $body$;
 $remote$);
 for scenario in select * from (values
 ('archive','e9000000-0000-4000-8000-000000000201',
  $$select public.archive_venue('e9000000-0000-4000-8000-000000000201','Race Venue 1',null)$$),
 ('reservation','e9000000-0000-4000-8000-000000000206',
  $$select * from public.reserve_venue_billing_checkout('e9000000-0000-4000-8000-000000000206','month',null)$$),
 ('follow','e9000000-0000-4000-8000-000000000201',
  $$select public.follow_venue('e9000000-0000-4000-8000-000000000201',null)$$),
 ('join','e9000000-0000-4000-8000-000000000201',
  $$select public.request_or_join_event('e9000000-0000-4000-8000-000000000301',null)$$),
 ('invitation','e9000000-0000-4000-8000-000000000201',
  $$select public.create_event_invitation('e9000000-0000-4000-8000-000000000301','vb_race_4',null)$$),
 ('profile settings','e9000000-0000-4000-8000-000000000201',
  $$select public.update_venue('e9000000-0000-4000-8000-000000000201','Race Venue 1','vb-race-1','10 Test Street, Haifa',34.998,32.812,'A synthetic venue for entitlement boundaries.',1,20,null)$$),
 ('workspace settings','e9000000-0000-4000-8000-000000000201',
  $$select public.update_venue_workspace_v2('e9000000-0000-4000-8000-000000000201','Race Venue 1','vb-race-1','10 Test Street, Haifa',34.998,32.812,'A synthetic venue for entitlement boundaries.','{}','','reservations',true,null)$$),
 ('space settings','e9000000-0000-4000-8000-000000000201',
  $$select public.save_venue_space('e9000000-0000-4000-8000-000000000201',null,'Test room',20,true,0,null)$$)
 ) c(label,venue_id,query_text) loop
  perform dblink_exec('vb8_holder','begin');
  perform dblink_exec('vb8_holder',format('do $b$ begin perform private.lock_venue_billing(%L); end; $b$',scenario.venue_id));
  perform dblink_exec('vb8_worker','begin');
  perform dblink_exec('vb8_worker','set local statement_timeout=''5s''');
  perform dblink_exec('vb8_worker','set local "request.jwt.claim.sub"=''e9000000-0000-4000-8000-000000000001''');
  perform dblink_send_query('vb8_worker',format('select pg_temp.try_query(%L)',scenario.query_text));
  deadline:=clock_timestamp()+interval '2 seconds';
  loop
   observed:=exists(select 1 from pg_locks where pid=worker_pid and locktype='advisory' and not granted);
   exit when observed or dblink_is_busy('vb8_worker')=0 or clock_timestamp()>=deadline;
  end loop;
  begin
   select free into row_free from dblink('vb8_probe',format('select true from public.venues where id=%L for update nowait',scenario.venue_id)) t(free boolean);
  exception when others then row_free:=false; end;
  perform dblink_exec('vb8_holder','rollback');
  select outcome into result from dblink_get_result('vb8_worker') t(outcome text);
  perform outcome from dblink_get_result('vb8_worker') t(outcome text);
  perform dblink_exec('vb8_worker','rollback');
  insert into race_evidence values(scenario.label,observed,row_free,result);
 end loop;
 perform dblink_disconnect('vb8_holder');
 perform dblink_disconnect('vb8_worker');
 perform dblink_disconnect('vb8_probe');
end;
$races$;
select ok(waiting,label||' waits on venue token before touching rows') from race_evidence;
select ok(rows_free,label||' leaves venue row unlocked until token is held') from race_evidence;
select is(result,'ok',label||' completes after token release without deadlock') from race_evidence;

-- Real signed processor races, including recovery that owns the token before
-- persistence, and old subscription A after a new subscription B owns it.
create temporary table webhook_races(label text,waiting boolean,outcome text,event_status text);
do $signed_races$
declare
 conn text:=format('host=%s port=5432 dbname=postgres user=postgres password=postgres sslmode=disable', host(inet_server_addr()));
 helper text:=$helper$
 create function pg_temp.deliver(w text,t text,s text,version integer,days integer default 30,g integer default 1,failure_days integer default 1)
 returns text language sql as $body$
 select outcome::text from public.apply_polar_venue_billing_event(w,t::public.polar_venue_billing_event_type,
 '2026-01-01'::timestamptz+version*interval '1 second','2026-01-01'::timestamptz+version*interval '1 second',
 'race-org','race-sub-'||g,'race-checkout-'||g,
 (select id from private.venue_billing_checkout_attempts where venue_id='e9000000-0000-4000-8000-000000000209' and generation=g),
 'e9000000-0000-4000-8000-000000000209','race-customer','e9000000-0000-4000-8000-000000000001',
 'race-product','race-price',1500,'ils','month',1,s,false,now()+days*interval '1 day',
 case when s='past_due' then now()-failure_days*interval '1 day' end,
 case when t='order.paid' then w end,case when t='order.paid' then 'subscription_cycle' end,null,
 case when t='order.paid' then now()+days*interval '1 day' end,case when t='order.paid' then '2026-01-01'::timestamptz+version*interval '1 second' end);
 $body$;
 create function pg_temp.try_query(q text) returns text language plpgsql as $body$
 begin execute q; return 'ok'; exception when others then return sqlstate||':'||sqlerrm; end; $body$;
 $helper$;
 worker_backend integer; due timestamptz; waited boolean; result text; observed_status text; scenario record;
begin
 perform dblink_connect('vb8_signed_first',conn); perform dblink_connect('vb8_signed_second',conn);
 perform dblink_exec('vb8_signed_first',helper); perform dblink_exec('vb8_signed_second',helper);
 perform dblink_exec('vb8_signed_first',$setup$
 insert into public.venues(id,owner_id,slug,name,address_text,location,description)
 select 'e9000000-0000-4000-8000-000000000209',owner_id,'vb-race-recovery','Recovery venue',address_text,location,description from public.venues where id='e9000000-0000-4000-8000-000000000206';
 insert into public.events select (jsonb_populate_record(null::public.events,to_jsonb(e)||jsonb_build_object(
 'id','e9000000-0000-4000-8000-000000000309','host_venue_id','e9000000-0000-4000-8000-000000000209','venue_id','e9000000-0000-4000-8000-000000000209',
 'starts_at',now()+interval '100 days','ends_at',now()+interval '100 days 3 hours'))).*
 from public.events e where id='e9000000-0000-4000-8000-000000000306';
 set "request.jwt.claim.sub"='e9000000-0000-4000-8000-000000000001';
 do $reserve$ declare a uuid; begin
 select attempt_id into a from public.reserve_venue_billing_checkout('e9000000-0000-4000-8000-000000000209','month',null);
 perform public.attach_venue_billing_checkout(a,'race-checkout-1',now()+interval '1 hour','race-org','race-product','race-price',1500,'ils','month',1,'e9000000-0000-4000-8000-000000000001',null);
 end; $reserve$;
 $setup$);
 select backend into worker_backend from dblink('vb8_signed_second','select pg_backend_pid()') p(backend integer);
 for scenario in select * from (values
  ('duplicate', $$select pg_temp.deliver('race-active','subscription.active','active',1)$$, $$select pg_temp.deliver('race-active','subscription.active','active',1)$$),
  ('stale', $$select pg_temp.deliver('race-failure','subscription.past_due','past_due',3)$$, $$select pg_temp.deliver('race-older','subscription.active','active',2)$$)
 ) s(label,first_query,second_query) loop
  perform dblink_exec('vb8_signed_first','begin');
  perform answer from dblink('vb8_signed_first',scenario.first_query) t(answer text);
  perform dblink_send_query('vb8_signed_second',scenario.second_query);
  due:=clock_timestamp()+interval '2 seconds';
  loop
   waited:=exists(select 1 from pg_locks where pid=worker_backend and locktype='advisory' and not granted);
   exit when waited or dblink_is_busy('vb8_signed_second')=0 or clock_timestamp()>=due;
  end loop;
  perform dblink_exec('vb8_signed_first','commit');
  select answer into result from dblink_get_result('vb8_signed_second') t(answer text);
  perform answer from dblink_get_result('vb8_signed_second') t(answer text);
  select status into observed_status from dblink('vb8_signed_first',$q$select status::text from public.events where id='e9000000-0000-4000-8000-000000000309'$q$) t(status text);
  insert into webhook_races values(scenario.label,waited,result,observed_status);
 end loop;
 -- Signed renewal holds the token first; concurrent due sweep must skip it.
 perform dblink_exec('vb8_signed_first',$q$update private.venue_billing_entitlements set status='active',grace_started_at=null,grace_expires_at=null,paid_through_at=now()-interval '8 days' where venue_id='e9000000-0000-4000-8000-000000000209'$q$);
 perform dblink_exec('vb8_signed_first','begin');
 perform answer from dblink('vb8_signed_first',$q$select pg_temp.deliver('race-recovery','order.paid','active',4,60)$q$) t(answer text);
 select answer into result from dblink('vb8_signed_second',$q$select count(*)::text from public.run_venue_billing_deadline_sweep(now(),100,null) where venue_id='e9000000-0000-4000-8000-000000000209'$q$) t(answer text);
 perform dblink_exec('vb8_signed_first','commit');
 select status into observed_status from dblink('vb8_signed_first',$q$select status::text from public.events where id='e9000000-0000-4000-8000-000000000309'$q$) t(status text);
 insert into webhook_races values('signed recovery first',true,result,observed_status);
 -- Persisted expiry wins; later paid proof restores only entitlement.
 perform dblink_exec('vb8_signed_first',$q$update private.venue_billing_entitlements set paid_through_at=now()-interval '8 days' where venue_id='e9000000-0000-4000-8000-000000000209'$q$);
 perform dblink_exec('vb8_signed_first','begin');
 perform answer from dblink('vb8_signed_first',$q$select count(*)::text from public.run_venue_billing_deadline_sweep(now(),100,null)$q$) t(answer text);
 perform dblink_send_query('vb8_signed_second',$q$select pg_temp.deliver('race-recovery-after','order.paid','active',5,90)$q$);
 perform dblink_exec('vb8_signed_first','commit');
 select answer into result from dblink_get_result('vb8_signed_second') t(answer text);
 perform answer from dblink_get_result('vb8_signed_second') t(answer text);
 select status into observed_status from dblink('vb8_signed_first',$q$select status::text from public.events where id='e9000000-0000-4000-8000-000000000309'$q$) t(status text);
 insert into webhook_races values('expiry first',true,result,observed_status);
 -- Signed terminal A releases the binding; B activates in a new generation.
 perform answer from dblink('vb8_signed_first',$q$select pg_temp.deliver('race-terminal','subscription.revoked','canceled',6)$q$) t(answer text);
 perform dblink_exec('vb8_signed_first',$q$
 do $reserve$ declare a uuid; begin
 select attempt_id into a from public.reserve_venue_billing_checkout('e9000000-0000-4000-8000-000000000209','month',null);
 perform public.attach_venue_billing_checkout(a,'race-checkout-2',now()+interval '1 hour','race-org','race-product','race-price',1500,'ils','month',1,'e9000000-0000-4000-8000-000000000001',null);
 end; $reserve$;
 $q$);
 perform dblink_exec('vb8_signed_first','begin');
 perform answer from dblink('vb8_signed_first',$q$select pg_temp.deliver('race-new','subscription.active','active',7,90,2)$q$) t(answer text);
 perform dblink_send_query('vb8_signed_second',$q$select pg_temp.deliver('race-old-terminal','subscription.revoked','canceled',99)$q$);
 perform dblink_exec('vb8_signed_first','commit');
 select answer into result from dblink_get_result('vb8_signed_second') t(answer text);
 perform answer from dblink_get_result('vb8_signed_second') t(answer text);
 select status into observed_status from dblink('vb8_signed_first',$q$select status::text||':'||polar_subscription_id from private.venue_billing_entitlements where venue_id='e9000000-0000-4000-8000-000000000209'$q$) t(status text);
 insert into webhook_races values('old terminal versus new activation',true,result,observed_status);
 -- Fresh event and draft make acquisition failures depend on the transition,
 -- not on a cancellation left by a previous scenario.
 perform dblink_exec('vb8_signed_first',$q$
 insert into public.events select (jsonb_populate_record(null::public.events,to_jsonb(e)||jsonb_build_object(
 'id','e9000000-0000-4000-8000-000000000310','host_venue_id','e9000000-0000-4000-8000-000000000209','venue_id','e9000000-0000-4000-8000-000000000209'))).*
 from public.events e where id='e9000000-0000-4000-8000-000000000306';
 insert into public.events select (jsonb_populate_record(null::public.events,to_jsonb(e)||jsonb_build_object(
 'id','e9000000-0000-4000-8000-000000000410','status','draft','published_at',null))).*
 from public.events e where id='e9000000-0000-4000-8000-000000000310';
 $q$);
 for scenario in select * from (values
  (1,'publish versus past due',1,$$select * from public.create_or_update_event('e9000000-0000-4000-8000-000000000410','e9000000-0000-4000-8000-000000000209',null,'e9000000-0000-4000-8000-000000000103','Updated event','Watch the match together.','Watch the match.','No entry fee.','Be respectful.','Hosted by the venue.',true,now()+interval '2 days',now()+interval '2 days 3 hours','venue','e9000000-0000-4000-8000-000000000209',null,null,null,null,'public',null,null,20,true,null,null,null,null,'publish',null)$$),
  (2,'join versus past due',1,$$select public.request_or_join_event('e9000000-0000-4000-8000-000000000310',null)$$),
  (3,'invite versus past due',1,$$select public.create_event_invitation('e9000000-0000-4000-8000-000000000310','vb_race_4',null)$$),
  (4,'follow versus grace',1,$$select public.follow_venue('e9000000-0000-4000-8000-000000000209',null)$$),
  (5,'profile versus deadline',8,$$select public.update_venue('e9000000-0000-4000-8000-000000000209','Recovery venue','vb-race-recovery','10 Test Street, Haifa',34.998,32.812,'A synthetic venue for entitlement boundaries.',1,20,null)$$),
  (6,'workspace versus deadline',8,$$select public.update_venue_workspace_v2('e9000000-0000-4000-8000-000000000209','Recovery venue','vb-race-recovery','10 Test Street, Haifa',34.998,32.812,'A synthetic venue for entitlement boundaries.','{}','','reservations',true,null)$$),
  (7,'space versus deadline',8,$$select public.save_venue_space('e9000000-0000-4000-8000-000000000209',null,'Test room',20,true,0,null)$$)
 ) s(n,label,failure_days,query_text) loop
  perform dblink_exec('vb8_signed_first','begin');
  perform answer from dblink('vb8_signed_first',format('select pg_temp.deliver(%L,''subscription.past_due'',''past_due'',%s,90,2,%s)','race-fail-'||scenario.n,100+scenario.n*2,scenario.failure_days)) t(answer text);
  perform dblink_exec('vb8_signed_second','begin');
  perform dblink_exec('vb8_signed_second','set local statement_timeout=''5s''');
  perform dblink_exec('vb8_signed_second','set local "request.jwt.claim.sub"=''e9000000-0000-4000-8000-000000000001''');
  perform dblink_send_query('vb8_signed_second',format('select pg_temp.try_query(%L)',scenario.query_text));
  due:=clock_timestamp()+interval '2 seconds';
  loop
   waited:=exists(select 1 from pg_locks where pid=worker_backend and locktype='advisory' and not granted);
   exit when waited or dblink_is_busy('vb8_signed_second')=0 or clock_timestamp()>=due;
  end loop;
  perform dblink_exec('vb8_signed_first','commit');
  select answer into result from dblink_get_result('vb8_signed_second') t(answer text);
  perform answer from dblink_get_result('vb8_signed_second') t(answer text);
  perform dblink_exec('vb8_signed_second','rollback');
  insert into race_evidence values(scenario.label,waited,true,result);
  perform answer from dblink('vb8_signed_first',format('select pg_temp.deliver(%L,''subscription.active'',''active'',%s,90,2)','race-recover-'||scenario.n,101+scenario.n*2)) t(answer text);
 end loop;
 -- Archive owns actor then venue before closing its open generation. Every
 -- post-network callback and publication must recheck after that commit.
 perform dblink_exec('vb8_signed_first',$q$
 insert into public.venues(id,owner_id,slug,name,address_text,location,description)
 select 'e9000000-0000-4000-8000-000000000210',owner_id,'vb-race-archive','Archive race',address_text,location,description from public.venues where id='e9000000-0000-4000-8000-000000000206';
 $q$);
 for scenario in select * from (values
  ('archive versus reservation','e9000000-0000-4000-8000-000000000210','Archive race',
   $$select * from public.reserve_venue_billing_checkout('e9000000-0000-4000-8000-000000000210','month',null)$$),
  ('archive versus attachment','e9000000-0000-4000-8000-000000000210','Archive race',
   $$select public.attach_venue_billing_checkout((select id from private.venue_billing_checkout_attempts where venue_id='e9000000-0000-4000-8000-000000000210' order by generation desc limit 1),'race-archive-checkout',now()+interval '1 hour','race-org','race-product','race-price',1500,'ils','month',1,'e9000000-0000-4000-8000-000000000001',null)$$),
  ('archive versus publish','e9000000-0000-4000-8000-000000000209','Recovery venue',
   $$select * from public.create_or_update_event('e9000000-0000-4000-8000-000000000410','e9000000-0000-4000-8000-000000000209',null,'e9000000-0000-4000-8000-000000000103','Updated event','Watch the match together.','Watch the match.','No entry fee.','Be respectful.','Hosted by the venue.',true,now()+interval '2 days',now()+interval '2 days 3 hours','venue','e9000000-0000-4000-8000-000000000209',null,null,null,null,'public',null,null,20,true,null,null,null,null,'publish',null)$$)
 ) s(label,venue_id,venue_name,query_text) loop
  if scenario.venue_id='e9000000-0000-4000-8000-000000000210' then
   perform dblink_exec('vb8_signed_first',$q$update public.venues set archived_at=null,archived_by=null where id='e9000000-0000-4000-8000-000000000210'$q$);
   perform answer from dblink('vb8_signed_first',$q$select attempt_id::text from public.reserve_venue_billing_checkout('e9000000-0000-4000-8000-000000000210','month',null)$q$) t(answer text);
  end if;
  perform dblink_exec('vb8_signed_first','begin');
  perform answer from dblink('vb8_signed_first',format('select public.archive_venue(%L,%L,null)::text',scenario.venue_id,scenario.venue_name)) t(answer text);
  perform dblink_exec('vb8_signed_second','begin');
  perform dblink_exec('vb8_signed_second','set local statement_timeout=''5s''');
  perform dblink_exec('vb8_signed_second','set local "request.jwt.claim.sub"=''e9000000-0000-4000-8000-000000000001''');
  perform dblink_send_query('vb8_signed_second',format('select pg_temp.try_query(%L)',scenario.query_text));
  due:=clock_timestamp()+interval '2 seconds';
  loop
   waited:=exists(select 1 from pg_locks where pid=worker_backend and locktype='advisory' and not granted);
   exit when waited or dblink_is_busy('vb8_signed_second')=0 or clock_timestamp()>=due;
  end loop;
  perform dblink_exec('vb8_signed_first','commit');
  select answer into result from dblink_get_result('vb8_signed_second') t(answer text);
  perform answer from dblink_get_result('vb8_signed_second') t(answer text);
  perform dblink_exec('vb8_signed_second','rollback');
  insert into race_evidence values(scenario.label,waited,true,result);
 end loop;
 select answer into result from dblink('vb8_signed_first',$q$select pg_temp.deliver('race-archived-active','subscription.active','active',999,90,2)$q$) t(answer text);
 select status into observed_status from dblink('vb8_signed_first',$q$select count(*)::text from public.get_venue_by_slug('vb-race-recovery')$q$) t(status text);
 insert into webhook_races values('archived generation',false,result,observed_status);
 perform dblink_disconnect('vb8_signed_first'); perform dblink_disconnect('vb8_signed_second');
end;
$signed_races$;
select ok(waiting,label||' serializes on the common venue token') from webhook_races where label in ('duplicate','stale');
select is(outcome,case label when 'duplicate' then 'duplicate' when 'stale' then 'stale' when 'signed recovery first' then '0' when 'expiry first' then 'applied' else 'ignored' end,label||' transaction outcome') from webhook_races;
select is(event_status,case label when 'expiry first' then 'cancelled' when 'old terminal versus new activation' then 'active:race-sub-2' when 'archived generation' then '0' else 'published' end,label||' preserves final event or entitlement truth') from webhook_races;
select ok(waiting,label||' waits for signed transition before authorization') from race_evidence where label like '% versus %';
select is(result,case when label='archive versus attachment' then 'P0001:INVALID_TRANSITION' else 'P0001:NOT_ALLOWED' end,label||' denies the write after transition commits') from race_evidence where label like '% versus %';

-- Two workers nominate one due row. The loser skips it without taking its row
-- lock; recovery can win the same token while its row still looks due.
create temporary table sweep_evidence(label text,count integer);
do $sweep$
declare conn text:=format('host=%s port=5432 dbname=postgres user=postgres password=postgres sslmode=disable', host(inet_server_addr())); n integer;
begin
 perform dblink_connect('vb8_first',conn); perform dblink_connect('vb8_second',conn);
 perform dblink_exec('vb8_first','begin');
 perform dblink_exec('vb8_first',$remote$
 do $b$ begin perform private.lock_venue_billing('e9000000-0000-4000-8000-000000000203'); end; $b$;
 update private.venue_billing_entitlements set status='active',grace_started_at=null,grace_expires_at=null,paid_through_at=now()+interval '60 days'
 where venue_id='e9000000-0000-4000-8000-000000000203';
 $remote$);
 select total into n from dblink('vb8_second',$q$select count(*)::integer from public.run_venue_billing_deadline_sweep(now()+interval '8 days',100,null) where venue_id='e9000000-0000-4000-8000-000000000203'$q$) t(total integer);
 insert into sweep_evidence values('recovery holds token; sweep skips',n);
 perform dblink_exec('vb8_first','commit');
 select total into n from dblink('vb8_second',$q$select count(*)::integer from public.run_venue_billing_deadline_sweep(now()+interval '8 days',100,null) where venue_id='e9000000-0000-4000-8000-000000000203'$q$) t(total integer);
 insert into sweep_evidence values('committed recovery no longer due',n);
 perform dblink_exec('vb8_first','begin');
 select total into n from dblink('vb8_first',$q$select count(*)::integer from public.run_venue_billing_deadline_sweep(now()+interval '70 days',100,null) where venue_id='e9000000-0000-4000-8000-000000000203'$q$) t(total integer);
 insert into sweep_evidence values('first sweep owns transition',n);
 select total into n from dblink('vb8_second',$q$select count(*)::integer from public.run_venue_billing_deadline_sweep(now()+interval '70 days',100,null) where venue_id='e9000000-0000-4000-8000-000000000203'$q$) t(total integer);
 insert into sweep_evidence values('second sweep skips same nominee',n);
 perform dblink_exec('vb8_first','commit');
 perform dblink_disconnect('vb8_first'); perform dblink_disconnect('vb8_second');
end;
$sweep$;
select is(count,case when label='first sweep owns transition' then 1 else 0 end,label) from sweep_evidence;

do $cleanup$
begin
 perform dblink_connect('vb8_cleanup',format('host=%s port=5432 dbname=postgres user=postgres password=postgres sslmode=disable', host(inet_server_addr())));
 perform dblink_exec('vb8_cleanup',$remote$
 delete from public.security_audit_events where resource_id::text like 'e9000000%' or actor_id::text like 'e9000000%';
 delete from private.polar_webhook_events where venue_id::text like 'e9000000%';
 delete from private.venue_billing_checkout_attempts where venue_id::text like 'e9000000%';
 delete from public.events where id::text like 'e9000000%';
 delete from private.venue_billing_entitlements where venue_id::text like 'e9000000%';
 delete from public.venues where id::text like 'e9000000%';
 delete from public.matches where id::text like 'e9000000%';
 delete from public.teams where id::text like 'e9000000%';
 delete from public.competitions where id::text like 'e9000000%';
 delete from auth.users where id::text like 'e9000000%';
 $remote$);
 perform dblink_disconnect('vb8_cleanup');
end;
$cleanup$;
select * from finish();
rollback;
