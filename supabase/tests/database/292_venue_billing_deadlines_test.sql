begin;
create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public, pg_catalog;
select no_plan();

-- Independent synthetic accounts and catalog; no provider request is made.
insert into auth.users(instance_id,id,aud,role,email,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
select '00000000-0000-0000-0000-000000000000', ('e8000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,
 'authenticated','authenticated','vb-deadline-'||n||'@example.test',now(),'{}','{}',now(),now()
from generate_series(1,6) n;
update public.profiles set handle='vb_deadline_'||right(id::text,1),display_name='Deadline Fan',
 adult_attested_at=now(),rules_version=private.current_rules_version(),rules_accepted_at=now(),
 profile_completed_at=now(),fan_enabled_at=now() where id::text like 'e8000000%';
insert into public.competitions(id,sport_id,provider,provider_external_id,code,name,country_name,last_synced_at)
values('e8000000-0000-4000-8000-000000000100','00000000-0000-4000-8000-000000000020','vb-deadline','league','VBV','Deadline League','Israel',now());
insert into public.teams(id,sport_id,provider,provider_external_id,name,short_name,tla,country_name,last_synced_at)
select ('e8000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'00000000-0000-4000-8000-000000000020',
 'vb-deadline',n::text,'Deadline Team '||n,'VB '||n,'VBV','Israel',now() from generate_series(101,102) n;
insert into public.matches(id,provider,provider_external_id,competition_id,home_team_id,away_team_id,starts_at,status,last_synced_at)
values('e8000000-0000-4000-8000-000000000103','vb-deadline','fixture','e8000000-0000-4000-8000-000000000100',
 'e8000000-0000-4000-8000-000000000101','e8000000-0000-4000-8000-000000000102',now()+interval '2 days','timed',now());
create temporary table billing_cases(n integer, state text, visible boolean);
insert into billing_cases values(1,'active',true),(2,'canceling',true),(3,'past_due',false),(4,'provider_stale',false),
 (5,'legacy_grace',false),(6,'inactive',false),(7,'confirming',false),(8,'expired',false);
insert into public.venues(id,owner_id,slug,name,address_text,location,description)
select ('e8000000-0000-4000-8000-'||lpad((200+n)::text,12,'0'))::uuid,'e8000000-0000-4000-8000-000000000001',
 'vb-deadline-'||n,'Deadline Venue '||n,'10 Test Street, Haifa',st_setsrid(st_makepoint(34.998,32.812),4326)::geography,
 'A synthetic venue for entitlement boundaries.' from billing_cases;
delete from private.venue_billing_entitlements where venue_id='e8000000-0000-4000-8000-000000000205';
select private.backfill_legacy_venue_billing_entitlements(now()-interval '168 hours');
update private.venue_billing_entitlements e set status=c.state::public.venue_billing_status,
 interval=case when c.state not in ('inactive','legacy_grace','expired') then 'month'::public.venue_billing_interval end,
 interval_count=case when c.state not in ('inactive','legacy_grace','expired') then 1 end,
 polar_customer_id=case when c.state not in ('inactive','legacy_grace','expired') then 'customer-test' end,
 polar_subscription_id=case when c.state not in ('inactive','legacy_grace','expired') then 'subscription-'||c.n end,
 polar_product_id=case when c.state not in ('inactive','legacy_grace','expired') then 'product-test' end,
 polar_product_price_id=case when c.state not in ('inactive','legacy_grace','expired') then 'price-test' end,
 amount=case when c.state not in ('inactive','legacy_grace','expired') then 1500 end,
 currency=case when c.state not in ('inactive','legacy_grace','expired') then 'ils' end,
 paid_through_at=case when c.state not in ('inactive','legacy_grace','expired') then now() end,
 grace_started_at=case when c.state in ('past_due','provider_stale','legacy_grace') then now()-interval '168 hours' end,
 grace_expires_at=case when c.state in ('past_due','provider_stale','legacy_grace') then now() end
from billing_cases c where c.n<>5 and e.venue_id=('e8000000-0000-4000-8000-'||lpad((200+c.n)::text,12,'0'))::uuid;
insert into public.events(id,created_by,host_venue_id,match_id,title,description,expected_activity,cost_description,event_rules,
 commercial_affiliation,host_presence_confirmed_at,starts_at,ends_at,place_kind,venue_id,audience,capacity,requires_approval,status,published_at)
select ('e8000000-0000-4000-8000-'||lpad((300+n)::text,12,'0'))::uuid,'e8000000-0000-4000-8000-000000000001',
 ('e8000000-0000-4000-8000-'||lpad((200+n)::text,12,'0'))::uuid,'e8000000-0000-4000-8000-000000000103',
 'Deadline Event '||n,'Watch the match together.','Watch the match.','No entry fee.','Be respectful.','Hosted by the venue.',
 now(),now()+interval '2 days',now()+interval '2 days 3 hours','venue',
 ('e8000000-0000-4000-8000-'||lpad((200+n)::text,12,'0'))::uuid,'public',20,true,'published',now() from billing_cases;

-- The same instant is injected into every deadline assertion and sweep.
create function pg_temp.vid(n integer) returns uuid language sql as $$
 select ('e8000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid;
$$;
insert into public.events select (jsonb_populate_record(null::public.events,to_jsonb(e)||jsonb_build_object(
 'id',pg_temp.vid(400+c.n),'status',c.status,'published_at',case when c.status='draft' then null else now() end,
 'starts_at',c.start_at,'ends_at',c.start_at+interval '3 hours',
 'cancelled_at',case when c.status='cancelled' then now() end,
 'cancel_reason',case when c.status='cancelled' then 'Previously cancelled.' end))).*
from public.events e cross join (values
 (1,'draft',now()+interval '2 days'),(2,'published',now()),(3,'completed',now()-interval '3 days'),
 (4,'cancelled',now()+interval '2 days'),(5,'published',now()-interval '3 days')) c(n,status,start_at)
where e.id=pg_temp.vid(303);
insert into public.event_attendance(event_id,user_id,status,source)
select pg_temp.vid(300+n),pg_temp.vid(actor),case when actor=2 then 'requested'::public.attendance_status else 'approved'::public.attendance_status end,'self_request'
from generate_series(1,5) n cross join generate_series(2,3) actor;
insert into public.event_invitations(event_id,invitee_id,invited_by,status,responded_at)
select pg_temp.vid(303),pg_temp.vid(actor),pg_temp.vid(1),
 case when actor=4 then 'pending'::public.invitation_status else 'declined'::public.invitation_status end,
 case when actor=5 then now() end from generate_series(4,5) actor;

select ok(private.venue_allows_draft_work(pg_temp.vid(n),now()-interval '1 microsecond'),'grace operational strictly before deadline') from generate_series(203,205) n;
select ok(not private.venue_allows_draft_work(pg_temp.vid(n),now()),'grace restricted at equality') from generate_series(203,205) n;
select ok(private.venue_allows_public_presence(pg_temp.vid(202),now()-interval '1 microsecond'),'canceling public before paid end');
select ok(not private.venue_allows_public_presence(pg_temp.vid(202),now()),'canceling hidden at paid end');
select set_config('request.jwt.claim.sub',pg_temp.vid(2)::text,true);
update private.venue_billing_entitlements set paid_through_at=now()+interval '1 day' where venue_id=pg_temp.vid(202);
select is((select status from public.get_event_summary(pg_temp.vid(302))),'published','post-cutoff commitment stays scheduled for requested participant before paid end');
select is((select status::text from public.get_calendar_event(pg_temp.vid(302),null)),'published','private post-cutoff calendar remains scheduled before paid end');
update private.venue_billing_entitlements set paid_through_at=now() where venue_id=pg_temp.vid(202);
select is((select status::text from public.get_calendar_event(pg_temp.vid(302),null)),'cancelled','private canceling calendar flips at paid end');
select is((select status from public.get_event_summary(pg_temp.vid(303))),'cancelled','participant detail projects cancellation before persistence');
select is((select to_jsonb(c)->>'status' from public.get_calendar_event(pg_temp.vid(303),null) c),'cancelled','calendar projects cancellation before persistence');
select is((select description from public.get_calendar_event(pg_temp.vid(303),null)),'This event has been cancelled.','calendar replaces stale scheduled description');
select is((select public_cacheable from public.get_calendar_event(pg_temp.vid(303),null)),false,'participant calendar is private');
select is((select count(*) from public.list_my_events('history',20,0) where event_id=pg_temp.vid(303)),1::bigint,'requested fan retains effective cancellation in history');
select set_config('request.jwt.claim.sub',pg_temp.vid(6)::text,true);
select throws_ok($$select * from public.get_calendar_event(pg_temp.vid(303),null)$$,'P0001','NOT_FOUND','unrelated fan cannot export hidden calendar');

select private.apply_venue_billing_deadline_for_venue(pg_temp.vid(203),now());
select is((select status::text from public.event_invitations where event_id=pg_temp.vid(303) and invitee_id=pg_temp.vid(4)),'revoked','expiry revokes the still-pending invitation');
select is((select count(*) from public.event_invitations where event_id=pg_temp.vid(303)),2::bigint,'invitation history retained');
select is((select status::text from public.event_invitations where invitee_id=pg_temp.vid(5)),'declined','closed invitation untouched');
select is((select status::text from public.events where id=pg_temp.vid(303)),'cancelled','future published event persisted cancelled');
select is((select cancel_reason from public.events where id=pg_temp.vid(303)),'This event has been cancelled.','only neutral reason persisted');
select is((select array_agg(status::text order by id) from public.events where id between pg_temp.vid(401) and pg_temp.vid(405)),array['draft','published','completed','cancelled','published'],'drafts started completed previously cancelled and past remain untouched');
select is((select count(*) from public.event_attendance where event_id=pg_temp.vid(303)),2::bigint,'requested and approved attendance retained');
select set_config('request.jwt.claim.sub',pg_temp.vid(3)::text,true);
select is((select status from public.get_event_summary(pg_temp.vid(303))),'cancelled','approved participant retains persisted cancelled detail');
select is((select count(*) from public.list_my_events('history',20,0) where event_id=pg_temp.vid(303)),1::bigint,'approved participant retains persisted cancellation in My Huddle');
select is((select status::text from public.get_calendar_event(pg_temp.vid(303),null)),'cancelled','persisted participant calendar agrees with dynamic cancellation');
select is((select count(*) from public.security_audit_events where resource_id=pg_temp.vid(203) and action='venue.billing.deadline'),1::bigint,'one bounded deadline audit per venue transition');
select is((select metadata from public.security_audit_events where resource_id=pg_temp.vid(203) and action='venue.billing.deadline'),
 '{"previous_status":"past_due","next_status":"expired","source":"deadline","cancelled_event_count":1,"revoked_invitation_count":1}'::jsonb,'audit has only counts status and source');
select private.apply_venue_billing_deadline_for_venue(pg_temp.vid(203),now()+interval '1 hour');
select is((select count(*) from public.security_audit_events where resource_id=pg_temp.vid(203) and action='venue.billing.deadline'),1::bigint,'repeat expiry has no duplicate audit');

select has_function('public','run_venue_billing_deadline_sweep',array['timestamp with time zone','integer','uuid'],'bounded service sweep exists');
select is((select array_agg(venue_id) from public.run_venue_billing_deadline_sweep(now(),1,pg_temp.vid(900))),array[pg_temp.vid(201)],'one-row batch uses deadline then venue UUID order');
select is((select request_id from public.security_audit_events where resource_id=pg_temp.vid(201) and action='venue.billing.deadline'),pg_temp.vid(900),'sweep propagates bounded audit request identity');
select lives_ok($$select * from public.run_venue_billing_deadline_sweep(now(),100,null)$$,'sweep processes due rows');
select is((select status::text from private.venue_billing_entitlements where venue_id=pg_temp.vid(201)),'provider_stale','active becomes stale at paid-through');
select is((select grace_started_at from private.venue_billing_entitlements where venue_id=pg_temp.vid(201)),now(),'stale grace anchored to paid-through');
select is((select grace_expires_at from private.venue_billing_entitlements where venue_id=pg_temp.vid(201)),now()+interval '168 hours','stale management lasts exactly seven days');
select is((select status::text from public.events where id=pg_temp.vid(301)),'published','initial provider-stale does not cancel');
select is((select count(*) from private.venue_billing_entitlements where venue_id in (pg_temp.vid(202),pg_temp.vid(204),pg_temp.vid(205)) and status='expired'),3::bigint,'canceling stale and no-provider legacy persist expired');
select lives_ok($$select * from public.run_venue_billing_deadline_sweep(now(),100,null)$$,'repeated sweep is harmless');
select is((select count(*) from public.security_audit_events where resource_id=pg_temp.vid(201) and action='venue.billing.deadline'),1::bigint,'repeated stale evaluation never reanchors grace');
select throws_ok($$select * from public.run_venue_billing_deadline_sweep(now(),0,null)$$,'P0001','VALIDATION_FAILED','zero batch is rejected');
select throws_ok($$select * from public.run_venue_billing_deadline_sweep(now(),501,null)$$,'P0001','VALIDATION_FAILED','oversize batch is rejected');
select throws_ok($$select * from public.run_venue_billing_deadline_sweep(null,100,null)$$,'P0001','VALIDATION_FAILED','missing clock is rejected');
select throws_ok($$select * from public.run_venue_billing_deadline_sweep('infinity',100,null)$$,'P0001','VALIDATION_FAILED','infinite clock is rejected');

-- Signed recovery is evaluated while holding the venue token, before deciding
-- whether an as-yet-unpersisted expiry must cancel the scheduled commitment.
insert into public.venues(id,owner_id,slug,name,address_text,location,description)
select pg_temp.vid(209),owner_id,'vb-deadline-recovery','Recovery venue',address_text,location,description from public.venues where id=pg_temp.vid(206);
insert into public.events select (jsonb_populate_record(null::public.events,to_jsonb(e)||jsonb_build_object(
 'id',pg_temp.vid(309),'host_venue_id',pg_temp.vid(209),'venue_id',pg_temp.vid(209),
 'starts_at',now()+interval '100 days','ends_at',now()+interval '100 days 3 hours'))).*
from public.events e where id=pg_temp.vid(306);
select set_config('request.jwt.claim.sub',pg_temp.vid(1)::text,true);
create temporary table recovery_attempt as select * from public.reserve_venue_billing_checkout(pg_temp.vid(209),'month',null);
select public.attach_venue_billing_checkout((select attempt_id from recovery_attempt),'deadline-checkout',now()+interval '1 hour','deadline-org','deadline-product','deadline-price',1500,'ils','month',1,pg_temp.vid(1)::text,null);
create function pg_temp.deliver(w text,t text,s text,version integer,days integer default 30) returns text language sql as $$
 select outcome::text from public.apply_polar_venue_billing_event(w,t::public.polar_venue_billing_event_type,
 now()+version*interval '1 second',now()+version*interval '1 second','deadline-org','deadline-sub','deadline-checkout',
 (select attempt_id from recovery_attempt),pg_temp.vid(209),'deadline-customer',pg_temp.vid(1)::text,
 'deadline-product','deadline-price',1500,'ils','month',1,s,false,now()+days*interval '1 day',
 case when s='past_due' then now()-interval '8 days' end,
 case when t='order.paid' then w end,case when t='order.paid' then 'subscription_cycle' end,null,
 case when t='order.paid' then now()+days*interval '1 day' end,case when t='order.paid' then now()+version*interval '1 second' end);
$$;
savepoint legacy_observation;
delete from private.venue_billing_entitlements where venue_id=pg_temp.vid(209);
select private.backfill_legacy_venue_billing_entitlements(now()-interval '8 days');
select is(pg_temp.deliver('deadline-legacy-created','subscription.created','incomplete',0),'observed','overdue legacy created observation remains non-activating');
select is((select status::text from private.venue_billing_entitlements where venue_id=pg_temp.vid(209)),'expired','legacy expiry persists before provider observation metadata');
rollback to savepoint legacy_observation;
select is(pg_temp.deliver('deadline-activate','subscription.active','active',1),'applied','signed activation establishes binding');
savepoint observational_stale;
update private.venue_billing_entitlements set paid_through_at=now()-interval '8 days' where venue_id=pg_temp.vid(209);
select is(pg_temp.deliver('deadline-observation','subscription.active','active',2,60),'observed','active snapshot cannot recover derived stale expiry');
select is((select status::text from private.venue_billing_entitlements where venue_id=pg_temp.vid(209)),'expired','observation persists derived expiry instead of renewing');
select is((select expiry_reason from private.venue_billing_entitlements where venue_id=pg_temp.vid(209)),'provider_stale','derived expiry retains recovery authority');
rollback to savepoint observational_stale;
savepoint late_failure;
update private.venue_billing_entitlements set paid_through_at=now()-interval '8 days' where venue_id=pg_temp.vid(209);
select is(pg_temp.deliver('deadline-late-failure','subscription.past_due','past_due',2),'applied','late signed failure updates authority without new grace');
select is((select status::text from private.venue_billing_entitlements where venue_id=pg_temp.vid(209)),'expired','late failure cannot restart derived expired grace');
select is((select grace_expires_at from private.venue_billing_entitlements where venue_id=pg_temp.vid(209)),null::timestamptz,'late failure has no new deadline');
rollback to savepoint late_failure;
savepoint recovery_first;
update private.venue_billing_entitlements set paid_through_at=now()-interval '8 days' where venue_id=pg_temp.vid(209);
select is(pg_temp.deliver('deadline-recover','order.paid','active',2,60),'applied','bound renewal may win before expiry persistence');
select is((select status::text from public.events where id=pg_temp.vid(309)),'published','recovery winning the venue token prevents cancellation');
rollback to savepoint recovery_first;
savepoint expiry_first;
update private.venue_billing_entitlements set paid_through_at=now()-interval '8 days' where venue_id=pg_temp.vid(209);
select private.apply_venue_billing_deadline_for_venue(pg_temp.vid(209),now());
select is(pg_temp.deliver('deadline-recover-after','order.paid','active',2,60),'applied','signed recovery after persisted expiry restores entitlement');
select is((select status::text from public.events where id=pg_temp.vid(309)),'cancelled','expiry-first recovery never resurrects event');
rollback to savepoint expiry_first;
insert into public.event_invitations(event_id,invitee_id,invited_by) values(pg_temp.vid(309),pg_temp.vid(4),pg_temp.vid(1));
select is(pg_temp.deliver('deadline-terminal','subscription.revoked','canceled',3),'applied','terminal proof closes bound subscription');
select is((select status::text from public.event_invitations where event_id=pg_temp.vid(309)),'revoked','terminal cancellation revokes pending acquisition too');

-- Archive remains separate from provider billing and closes local generation.
select set_config('request.jwt.claim.sub',pg_temp.vid(1)::text,true);
create temporary table archive_attempt as select * from public.reserve_venue_billing_checkout(pg_temp.vid(206),'month',null);
select lives_ok($$select public.archive_venue(pg_temp.vid(206),'Deadline Venue 6',null)$$,'owner may archive an inactive venue');
select is((select state from private.venue_billing_checkout_attempts where id=(select attempt_id from archive_attempt)),'expired','archive closes open checkout generation');
select throws_ok($$select * from public.reserve_venue_billing_checkout(pg_temp.vid(206),'month',null)$$,'P0001','NOT_ALLOWED','archive cannot start checkout');
select throws_ok($$select public.attach_venue_billing_checkout((select attempt_id from archive_attempt),'archive-checkout',now()+interval '1 hour','org','prod','price',1500,'ils','month',1,pg_temp.vid(1)::text,null)$$,'P0001','INVALID_TRANSITION','late attachment cannot cross archive');
select lives_ok($$select public.archive_venue(pg_temp.vid(201),'Deadline Venue 1',null)$$,'owner may archive bound stale venue without cancelling provider');
select lives_ok($$select public.get_archived_venue_billing_context('vb-deadline-1')$$,'exact owner can recover archived billing');
select is((select array_agg(k order by k) from jsonb_object_keys(public.get_archived_venue_billing_context('vb-deadline-1')) k),array['canOpenPortal','interval','name','paidThroughAt','slug','state','venueId']::text[],'archived context contains only safe bounded fields');
select is((select public.get_archived_venue_billing_context('vb-deadline-1')->>'canOpenPortal'),'true','bound archived subscription retains portal');
select is((select public.get_archived_venue_billing_context('vb-deadline-6')->>'canOpenPortal'),'false','unbound archived venue has no portal');
select is((select count(*) from public.list_my_workspaces() where workspace_id=pg_temp.vid(201)),0::bigint,'archive stays outside ordinary workspaces');
insert into public.venue_memberships(venue_id,user_id,role,status) values(pg_temp.vid(201),pg_temp.vid(2),'admin','active');
select set_config('request.jwt.claim.sub',pg_temp.vid(2)::text,true);
select throws_ok($$select public.get_archived_venue_billing_context('vb-deadline-1')$$,'P0001','NOT_FOUND','active admin denied archived recovery');
select set_config('request.jwt.claim.sub',pg_temp.vid(6)::text,true);
select throws_ok($$select public.get_archived_venue_billing_context('vb-deadline-1')$$,'P0001','NOT_FOUND','unrelated fan denied archived recovery');
select ok(not has_function_privilege('authenticated','public.run_venue_billing_deadline_sweep(timestamptz,integer,uuid)','execute'),'browser cannot run deadline transitions');
select ok(has_function_privilege('service_role','public.run_venue_billing_deadline_sweep(timestamptz,integer,uuid)','execute'),'service can run bounded sweep');
select * from finish();
rollback;
