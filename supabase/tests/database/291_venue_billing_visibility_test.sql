begin;
create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public, pg_catalog;
select no_plan();

-- Independent synthetic accounts and catalog; no provider request is made.
insert into auth.users(instance_id,id,aud,role,email,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
select '00000000-0000-0000-0000-000000000000', ('e6000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,
 'authenticated','authenticated','vb-visibility-'||n||'@example.test',now(),'{}','{}',now(),now()
from generate_series(1,6) n;
update public.profiles set handle='vb_visibility_'||right(id::text,1),display_name='Visibility Fan',
 adult_attested_at=now(),rules_version=private.current_rules_version(),rules_accepted_at=now(),
 profile_completed_at=now(),fan_enabled_at=now() where id::text like 'e6000000%';
insert into public.competitions(id,sport_id,provider,provider_external_id,code,name,country_name,last_synced_at)
values('e6000000-0000-4000-8000-000000000100','00000000-0000-4000-8000-000000000020','vb-visibility','league','VBV','Visibility League','Israel',now());
insert into public.teams(id,sport_id,provider,provider_external_id,name,short_name,tla,country_name,last_synced_at)
select ('e6000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'00000000-0000-4000-8000-000000000020',
 'vb-visibility',n::text,'Visibility Team '||n,'VB '||n,'VBV','Israel',now() from generate_series(101,102) n;
insert into public.matches(id,provider,provider_external_id,competition_id,home_team_id,away_team_id,starts_at,status,last_synced_at)
values('e6000000-0000-4000-8000-000000000103','vb-visibility','fixture','e6000000-0000-4000-8000-000000000100',
 'e6000000-0000-4000-8000-000000000101','e6000000-0000-4000-8000-000000000102',now()+interval '2 days','timed',now());
create temporary table billing_cases(n integer, state text, visible boolean);
insert into billing_cases values(1,'active',true),(2,'canceling',true),(3,'past_due',false),(4,'provider_stale',false),
 (5,'legacy_grace',false),(6,'inactive',false),(7,'confirming',false),(8,'expired',false);
insert into public.venues(id,owner_id,slug,name,address_text,location,description)
select ('e6000000-0000-4000-8000-'||lpad((200+n)::text,12,'0'))::uuid,'e6000000-0000-4000-8000-000000000001',
 'vb-visibility-'||n,'Visibility Venue '||n,'10 Test Street, Haifa',st_setsrid(st_makepoint(34.998,32.812),4326)::geography,
 'A synthetic venue for entitlement boundaries.' from billing_cases;
delete from private.venue_billing_entitlements where venue_id='e6000000-0000-4000-8000-000000000205';
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
from billing_cases c where c.n<>5 and e.venue_id=('e6000000-0000-4000-8000-'||lpad((200+c.n)::text,12,'0'))::uuid;
insert into public.events(id,created_by,host_venue_id,match_id,title,description,expected_activity,cost_description,event_rules,
 commercial_affiliation,host_presence_confirmed_at,starts_at,ends_at,place_kind,venue_id,audience,capacity,requires_approval,status,published_at)
select ('e6000000-0000-4000-8000-'||lpad((300+n)::text,12,'0'))::uuid,'e6000000-0000-4000-8000-000000000001',
 ('e6000000-0000-4000-8000-'||lpad((200+n)::text,12,'0'))::uuid,'e6000000-0000-4000-8000-000000000103',
 'Visibility Event '||n,'Watch the match together.','Watch the match.','No entry fee.','Be respectful.','Hosted by the venue.',
 now(),now()+interval '2 days',now()+interval '2 days 3 hours','venue',
 ('e6000000-0000-4000-8000-'||lpad((200+n)::text,12,'0'))::uuid,'public',20,true,'published',now() from billing_cases;

-- Drafts and open-door rows differ only in the product capability under test.
insert into public.events select (jsonb_populate_record(null::public.events,to_jsonb(e)||jsonb_build_object(
 'id',('e6000000-0000-4000-8000-'||lpad((400+c.n)::text,12,'0'))::uuid,'status','draft','published_at',null))).*
from public.events e join billing_cases c on e.id=('e6000000-0000-4000-8000-'||lpad((300+c.n)::text,12,'0'))::uuid;
insert into public.events select (jsonb_populate_record(null::public.events,to_jsonb(e)||jsonb_build_object(
 'id',('e6000000-0000-4000-8000-'||lpad((500+c.n)::text,12,'0'))::uuid,'attendance_mode','open_door','capacity',null,'requires_approval',false))).*
from public.events e join billing_cases c on e.id=('e6000000-0000-4000-8000-'||lpad((300+c.n)::text,12,'0'))::uuid;
insert into public.venue_spaces(id,venue_id,name,capacity,active,sort_order)
select ('e6000000-0000-4000-8000-'||lpad((600+n)::text,12,'0'))::uuid,('e6000000-0000-4000-8000-'||lpad((200+n)::text,12,'0'))::uuid,
 'Test room',20,true,0 from billing_cases;
create function pg_temp.event_edit(n integer, event_number integer, intent text, distant boolean default false)
returns text language sql as $$
 select status from public.create_or_update_event(
 ('e6000000-0000-4000-8000-'||lpad(event_number::text,12,'0'))::uuid,
 ('e6000000-0000-4000-8000-'||lpad((200+n)::text,12,'0'))::uuid,null,'e6000000-0000-4000-8000-000000000103',
 'Updated visibility event','Watch the match together.','Watch the match.','No entry fee.','Be respectful.','Hosted by the venue.',true,
 now()+case when distant then interval '90 days' else interval '2 days' end,
 now()+case when distant then interval '90 days 3 hours' else interval '2 days 3 hours' end,'venue',
 ('e6000000-0000-4000-8000-'||lpad((200+n)::text,12,'0'))::uuid,null,null,null,null,'public',null,null,20,true,null,null,null,null,intent,null);
$$;

select is((select count(*) from public.get_venue_by_slug('vb-visibility-'||n)),case when visible then 1 else 0 end::bigint,state||' public venue') from billing_cases;
select is((select count(*) from public.get_event_summary(('e6000000-0000-4000-8000-'||lpad((300+n)::text,12,'0'))::uuid)),case when visible then 1 else 0 end::bigint,state||' public detail') from billing_cases;
select is((select count(*) from public.discover_events(32.812,34.998,15,now(),now()+interval '14 days') where event_id::text like 'e6000000%'),2::bigint,'ordinary Explore contains only active and canceling');
select is((select count(*) from public.discover_open_door_events(32.812,34.998,15,now(),now()+interval '14 days') where event_id::text like 'e6000000%'),2::bigint,'open-door Explore applies the same entitlement');
select is((select count(*) from public.list_match_events('e6000000-0000-4000-8000-000000000103',50)),4::bigint,'match list filters both reservation and open-door rows');
select is((select count(*) from public.list_venue_events('vb-visibility-'||n,50)),case when visible then 2 else 0 end::bigint,state||' venue list') from billing_cases;
select is((select count(*) from public.get_public_event_map_points(array(select id from public.events where id::text like 'e6000000%'))),4::bigint,'map only returns public entitled events');
select set_config('request.jwt.claim.sub','e6000000-0000-4000-8000-000000000001',true);
select is((select count(*) from public.discover_owned_venue_events(32.812,34.998,15,now(),now()+interval '14 days') where event_id::text like 'e6000000%'),4::bigint,'owner-aware Explore cannot reveal unpaid events');
select is((select count(*) from public.get_venue_by_slug('vb-visibility-6')),0::bigint,'owner cannot use public venue page as private preview');
select set_config('request.jwt.claim.sub','e6000000-0000-4000-8000-000000000002',true);
select is((select count(*) from public.search_assisted_events((now() at time zone 'Asia/Jerusalem')::date,(now() at time zone 'Asia/Jerusalem')::date+14,'{}',null,'any','venue','{}',32.812,34.998) where host_venue_slug not in ('vb-visibility-1','vb-visibility-2')),0::bigint,'Ask never returns a hidden venue');
select lives_ok($$select public.follow_venue('e6000000-0000-4000-8000-000000000201',null)$$,'active allows following');
select lives_ok($$select public.follow_venue('e6000000-0000-4000-8000-000000000201',null)$$,'follow is idempotent');
select is((select count(*) from public.venue_follows where venue_id='e6000000-0000-4000-8000-000000000201'),1::bigint,'repeat follow creates no duplicate');
select throws_ok(format('select public.follow_venue(%L,null)',('e6000000-0000-4000-8000-'||lpad((200+n)::text,12,'0'))::uuid),'P0001','NOT_ALLOWED',state||' denies following') from billing_cases where not visible;
select throws_ok(format('select public.request_or_join_event(%L,null)',('e6000000-0000-4000-8000-'||lpad((300+n)::text,12,'0'))::uuid),'P0001','NOT_ALLOWED',state||' denies new attendance') from billing_cases where not visible;
select lives_ok($$select public.request_or_join_event('e6000000-0000-4000-8000-000000000301',null)$$,'active accepts a request');
select is((select public_cacheable from public.get_calendar_event('e6000000-0000-4000-8000-000000000301',null)),false,'even active venue calendars cannot be cached publicly');

-- Existing commitments survive hidden grace, independently from new acquisition.
insert into public.event_attendance(event_id,user_id,status,source)
select ('e6000000-0000-4000-8000-'||lpad((300+n)::text,12,'0'))::uuid,'e6000000-0000-4000-8000-000000000003','requested','self_request' from billing_cases where n in (2,3,4,5,8);
select set_config('request.jwt.claim.sub','e6000000-0000-4000-8000-000000000003',true);
select is((select status from public.get_event_summary(('e6000000-0000-4000-8000-'||lpad((300+n)::text,12,'0'))::uuid)),'published',state||' participant sees scheduled commitment') from billing_cases where n in (3,4,5);
select is((select host_venue_is_public from public.get_event_summary(('e6000000-0000-4000-8000-'||lpad((300+n)::text,12,'0'))::uuid)),false,state||' participant has host text but no public venue link') from billing_cases where n in (3,4,5,8);
select is((select host_venue_is_public from public.get_event_summary('e6000000-0000-4000-8000-000000000301')),true,'public venue retains public navigation');
select ok((select host_venue_slug is not null from public.get_event_summary('e6000000-0000-4000-8000-000000000303')),'hidden venue keeps distinct workspace routing identity');
select is((select status from public.get_event_summary('e6000000-0000-4000-8000-000000000308')),'cancelled','expired participant sees cancellation before sweep');
select is((select count(*) from public.list_my_events('history',20,0) where event_id='e6000000-0000-4000-8000-000000000308'),1::bigint,'expired future commitment appears in history before sweep');
update public.events set starts_at=now()-interval '1 hour',ends_at=now()+interval '2 hours' where id='e6000000-0000-4000-8000-000000000303';
select is((select status from public.get_event_summary('e6000000-0000-4000-8000-000000000303')),'published','grace participant retains an in-progress commitment');
select lives_ok($$select * from public.get_calendar_event('e6000000-0000-4000-8000-000000000303',null)$$,'in-progress grace calendar remains private and accessible');
select set_config('request.jwt.claim.sub','e6000000-0000-4000-8000-000000000004',true);
select is((select count(*) from public.get_event_summary('e6000000-0000-4000-8000-000000000303')),0::bigint,'unrelated fan cannot read grace event');

-- Publishing gates transitions, while grace preserves existing operations.
select set_config('request.jwt.claim.sub','e6000000-0000-4000-8000-000000000001',true);
select is(pg_temp.event_edit(1,401,'publish',true),'published','active can publish months beyond current paid-through');
select throws_ok($$select pg_temp.event_edit(2,402,'publish',true)$$,'P0001','NOT_ALLOWED','canceling rejects a post-cutoff publication');
select is(pg_temp.event_edit(2,402,'publish'),'published','canceling permits a pre-cutoff publication');
select throws_ok(format('select pg_temp.event_edit(%s,%s,%L)',n,400+n,'publish'),'P0001','NOT_ALLOWED',state||' denies draft-to-published') from billing_cases where not visible;
select is(pg_temp.event_edit(n,400+n,'draft'),'draft',state||' allows private draft edits') from billing_cases where n in (3,4,5,6,7);
select is(pg_temp.event_edit(n,300+n,'publish'),'published',state||' allows editing an existing published event') from billing_cases where n in (3,4,5);
select throws_ok($$select pg_temp.event_edit(8,408,'draft')$$,'P0001','NOT_ALLOWED','expired blocks draft edits');
select lives_ok(format('select public.save_venue_space(%L,%L,%L,20,true,0,null)',
 ('e6000000-0000-4000-8000-'||lpad((200+n)::text,12,'0'))::uuid,('e6000000-0000-4000-8000-'||lpad((600+n)::text,12,'0'))::uuid,'Test room'),state||' permits private space setup') from billing_cases where n<8;
select throws_ok($$select public.save_venue_space('e6000000-0000-4000-8000-000000000208','e6000000-0000-4000-8000-000000000608','Test room',20,true,0,null)$$,'P0001','NOT_ALLOWED','expired blocks direct space setup');
select lives_ok(format('select public.update_venue(%L,%L,%L,%L,34.998,32.812,%L,1,20,null)',
 ('e6000000-0000-4000-8000-'||lpad((200+n)::text,12,'0'))::uuid,'Visibility Venue '||n,'vb-visibility-'||n,'10 Test Street, Haifa','A synthetic venue for entitlement boundaries.'),state||' permits private venue setup') from billing_cases where n<8;
select throws_ok($$select public.update_venue('e6000000-0000-4000-8000-000000000208','Visibility Venue 8','vb-visibility-8','10 Test Street, Haifa',34.998,32.812,'A synthetic venue for entitlement boundaries.',1,20,null)$$,'P0001','NOT_ALLOWED','expired blocks direct venue setup');
select lives_ok(format('select public.update_venue_workspace_v2(%L,%L,%L,%L,34.998,32.812,%L,''{}'','''',''reservations'',true,null)',
 ('e6000000-0000-4000-8000-'||lpad((200+n)::text,12,'0'))::uuid,'Visibility Venue '||n,'vb-visibility-'||n,'10 Test Street, Haifa','A synthetic venue for entitlement boundaries.'),state||' permits workspace setup') from billing_cases where n<8;
select throws_ok($$select public.update_venue_workspace('e6000000-0000-4000-8000-000000000208','Visibility Venue 8','vb-visibility-8','10 Test Street, Haifa',34.998,32.812,'A synthetic venue for entitlement boundaries.','{}','',true,null)$$,'P0001','NOT_ALLOWED','expired blocks compatibility workspace setup');
select is((select status from public.list_venue_calendar('e6000000-0000-4000-8000-000000000208',100) where event_id='e6000000-0000-4000-8000-000000000308'),'cancelled','workspace calendar projects expiry without sweep');
select is((select status from public.list_managed_venue_events('e6000000-0000-4000-8000-000000000208',20) where event_id='e6000000-0000-4000-8000-000000000308'),'cancelled','managed-event reader projects expiry without sweep');
insert into public.matches(id,provider,provider_external_id,competition_id,home_team_id,away_team_id,starts_at,status,last_synced_at)
values('e6000000-0000-4000-8000-000000000104','vb-visibility','distant-fixture','e6000000-0000-4000-8000-000000000100',
 'e6000000-0000-4000-8000-000000000101','e6000000-0000-4000-8000-000000000102',now()+interval '90 days','timed',now());
insert into public.matches(id,provider,provider_external_id,competition_id,home_team_id,away_team_id,starts_at,status,last_synced_at)
values('e6000000-0000-4000-8000-000000000105','vb-visibility','second-near-fixture','e6000000-0000-4000-8000-000000000100',
 'e6000000-0000-4000-8000-000000000101','e6000000-0000-4000-8000-000000000102',now()+interval '2 days','timed',now());
select lives_ok($$select public.plan_venue_events('[{"matchId":"e6000000-0000-4000-8000-000000000104","venueSpaceId":"e6000000-0000-4000-8000-000000000601"}]','publish',null)$$,'active planner publishes a fixture months beyond paid-through');
select throws_ok($$select public.plan_venue_events('[{"matchId":"e6000000-0000-4000-8000-000000000104","venueSpaceId":"e6000000-0000-4000-8000-000000000602"}]','publish',null)$$,'P0001','NOT_ALLOWED','canceling planner rejects post-cutoff fixture');
select lives_ok($$select public.plan_venue_events('[{"matchId":"e6000000-0000-4000-8000-000000000105","venueSpaceId":"e6000000-0000-4000-8000-000000000602"}]','publish',null)$$,'canceling planner publishes before cutoff');
select throws_ok(format('select public.plan_venue_events(%L::jsonb,''publish'',null)',jsonb_build_array(jsonb_build_object('matchId','e6000000-0000-4000-8000-000000000103','venueSpaceId',('e6000000-0000-4000-8000-'||lpad((600+n)::text,12,'0'))::uuid))),'P0001','NOT_ALLOWED',state||' planner rejects new publishing') from billing_cases where not visible;
select lives_ok(format('select public.plan_venue_events(%L::jsonb,''draft'',null)',jsonb_build_array(jsonb_build_object('matchId','e6000000-0000-4000-8000-000000000104','venueSpaceId',('e6000000-0000-4000-8000-'||lpad((600+n)::text,12,'0'))::uuid))),state||' planner creates unpublished drafts') from billing_cases where n in (3,4,5,6,7);
select throws_ok($$select public.plan_venue_events('[{"matchId":"e6000000-0000-4000-8000-000000000103","venueSpaceId":"e6000000-0000-4000-8000-000000000608"}]','draft',null)$$,'P0001','NOT_ALLOWED','expired planner rejects drafts');
select throws_ok(format('select pg_temp.event_edit(%s,null,''publish'')',n),'P0001','NOT_ALLOWED',state||' direct RPC rejects a newly published row') from billing_cases where not visible;

select has_function('public','follow_venue',array['uuid','uuid'],'follow has an actor/venue serialized RPC');
-- A direct invitation is new acquisition until accepted; requests already
-- pending are commitments which managers may review during grace.
select lives_ok($$select public.create_event_invitation('e6000000-0000-4000-8000-000000000301','vb_visibility_4',null)$$,'active manager can invite');
select throws_ok(format('select public.create_event_invitation(%L,''vb_visibility_6'',null)',('e6000000-0000-4000-8000-'||lpad((300+n)::text,12,'0'))::uuid),'P0001','NOT_ALLOWED',state||' rejects new invitation') from billing_cases where not visible;
insert into public.event_invitations(event_id,invitee_id,invited_by)
select ('e6000000-0000-4000-8000-'||lpad((300+n)::text,12,'0'))::uuid,('e6000000-0000-4000-8000-'||lpad(actor::text,12,'0'))::uuid,'e6000000-0000-4000-8000-000000000001'
from billing_cases cross join generate_series(4,5) actor where n in (3,4,5,6,7,8);
select set_config('request.jwt.claim.sub','e6000000-0000-4000-8000-000000000004',true);
select lives_ok($$select public.respond_to_event_invitation((select id from public.event_invitations where event_id='e6000000-0000-4000-8000-000000000301' and invitee_id=auth.uid()),'accept',null)$$,'active invite may be accepted');
select throws_ok(format('select public.respond_to_event_invitation(%L,''accept'',null)',i.id),'P0001','NOT_ALLOWED',c.state||' rejects accepting unaccepted direct invite')
from public.event_invitations i join public.events e on e.id=i.event_id join billing_cases c on e.host_venue_id=('e6000000-0000-4000-8000-'||lpad((200+c.n)::text,12,'0'))::uuid where i.invitee_id=auth.uid() and not c.visible;
select lives_ok(format('select public.respond_to_event_invitation(%L,''decline'',null)',id),'hidden invitation can still be declined') from public.event_invitations where invitee_id=auth.uid() and status='pending';
select set_config('request.jwt.claim.sub','e6000000-0000-4000-8000-000000000001',true);
select lives_ok(format('select public.revoke_event_invitation(%L,null)',i.id),c.state||' allows existing invitation revocation') from public.event_invitations i join public.events e on e.id=i.event_id join billing_cases c on e.host_venue_id=('e6000000-0000-4000-8000-'||lpad((200+c.n)::text,12,'0'))::uuid where i.invitee_id='e6000000-0000-4000-8000-000000000005' and c.n in (3,4,5);
select throws_ok($$select public.revoke_event_invitation((select id from public.event_invitations where event_id='e6000000-0000-4000-8000-000000000308' and invitee_id='e6000000-0000-4000-8000-000000000005'),null)$$,'P0001','NOT_ALLOWED','expired blocks invitation revocation');
select lives_ok(format('select public.review_attendance(%L,''approve'',null)',a.id),c.state||' allows approving a pending request') from public.event_attendance a join public.events e on e.id=a.event_id join billing_cases c on e.host_venue_id=('e6000000-0000-4000-8000-'||lpad((200+c.n)::text,12,'0'))::uuid where a.user_id='e6000000-0000-4000-8000-000000000003' and c.n in (3,4,5);
select throws_ok($$select public.review_attendance((select id from public.event_attendance where event_id='e6000000-0000-4000-8000-000000000308' and user_id='e6000000-0000-4000-8000-000000000003'),'approve',null)$$,'P0001','NOT_ALLOWED','expired blocks pending approval');
insert into public.event_attendance(event_id,user_id,status,source)
select ('e6000000-0000-4000-8000-'||lpad((300+n)::text,12,'0'))::uuid,'e6000000-0000-4000-8000-000000000006','requested','self_request' from billing_cases where n in (3,4,5,8);
select lives_ok(format('select public.review_attendance(%L,''decline'',null)',a.id),c.state||' allows declining pending requests') from public.event_attendance a join public.events e on e.id=a.event_id join billing_cases c on e.host_venue_id=('e6000000-0000-4000-8000-'||lpad((200+c.n)::text,12,'0'))::uuid where a.user_id='e6000000-0000-4000-8000-000000000006' and c.n in (3,4,5);
select throws_ok($$select public.review_attendance((select id from public.event_attendance where event_id='e6000000-0000-4000-8000-000000000308' and user_id='e6000000-0000-4000-8000-000000000006'),'decline',null)$$,'P0001','NOT_ALLOWED','expired blocks manager decline');
select lives_ok(format('select public.remove_attendee(%L,''Cannot attend.'',null)',a.id),c.state||' allows removing an existing attendee') from public.event_attendance a join public.events e on e.id=a.event_id join billing_cases c on e.host_venue_id=('e6000000-0000-4000-8000-'||lpad((200+c.n)::text,12,'0'))::uuid where a.user_id='e6000000-0000-4000-8000-000000000003' and c.n in (3,4,5);
select throws_ok($$select public.remove_attendee((select id from public.event_attendance where event_id='e6000000-0000-4000-8000-000000000308' and user_id='e6000000-0000-4000-8000-000000000003'),'Cannot attend.',null)$$,'P0001','NOT_ALLOWED','expired blocks manager attendee removal');
select lives_ok(format('select public.cancel_event(%L,''Unavailable.'',null)',('e6000000-0000-4000-8000-'||lpad((300+n)::text,12,'0'))::uuid),state||' allows cancellation') from billing_cases where n in (3,4,5);
select throws_ok($$select public.cancel_event('e6000000-0000-4000-8000-000000000308','Unavailable.',null)$$,'P0001','NOT_ALLOWED','expired blocks manager cancellation');

-- Voluntary cancellation has an event-date cutoff, without ending current
-- private commitments before the paid period itself expires.
update private.venue_billing_entitlements set paid_through_at=now()+interval '2 days' where venue_id='e6000000-0000-4000-8000-000000000202';
update public.events set starts_at=now()+interval '1 day',ends_at=now()+interval '1 day 3 hours' where id='e6000000-0000-4000-8000-000000000402';
select set_config('request.jwt.claim.sub','e6000000-0000-4000-8000-000000000003',true);
select is((select count(*) from public.list_venue_events('vb-visibility-2',50)),1::bigint,'canceling cutoff equality hides later events and retains earlier one');
select is((select status from public.get_event_summary('e6000000-0000-4000-8000-000000000302')),'published','post-cutoff requested participant retains scheduled detail');
select is((select public_cacheable from public.get_calendar_event('e6000000-0000-4000-8000-000000000302',null)),false,'post-cutoff participant calendar is private');
select is((select count(*) from public.list_my_events('pending',50,0) where event_id='e6000000-0000-4000-8000-000000000302'),1::bigint,'post-cutoff request stays in My Huddle');
select is((select count(*) from public.get_public_event_map_points(array['e6000000-0000-4000-8000-000000000302']::uuid[])),0::bigint,'participant exception does not leak through map');
select set_config('request.jwt.claim.sub','e6000000-0000-4000-8000-000000000004',true);
select throws_ok($$select public.request_or_join_event('e6000000-0000-4000-8000-000000000302',null)$$,'P0001','NOT_ALLOWED','cutoff blocks new acquisition');
select is((select count(*) from public.get_event_summary('e6000000-0000-4000-8000-000000000302')),0::bigint,'cutoff hidden event is unavailable to unrelated fan');
update private.venue_billing_entitlements set paid_through_at=now()-interval '1 second' where venue_id='e6000000-0000-4000-8000-000000000202';
select set_config('request.jwt.claim.sub','e6000000-0000-4000-8000-000000000003',true);
select is((select status from public.get_event_summary('e6000000-0000-4000-8000-000000000302')),'cancelled','paid end projects future participant event as cancelled before sweep');
select lives_ok($$select public.leave_event((select id from public.event_attendance where event_id='e6000000-0000-4000-8000-000000000308' and user_id=auth.uid()),null)$$,'own leaving remains available after expiry');

select ok(not has_table_privilege('authenticated','public.venue_follows','INSERT'),'direct follow insertion cannot bypass entitlement lock');
select set_config('request.jwt.claim.sub','e6000000-0000-4000-8000-000000000002',true);
select is((select count(*) from public.list_my_saved_items('venue',20,0)),1::bigint,'an active followed venue appears in saved items');
update private.venue_billing_entitlements set status='past_due',grace_started_at=now(),grace_expires_at=now()+interval '168 hours' where venue_id='e6000000-0000-4000-8000-000000000201';
select is((select count(*) from public.list_my_saved_items('venue',20,0)),0::bigint,'saved links disappear immediately when followed venue hides');
set local role authenticated;
select throws_ok($$insert into public.venue_follows(user_id,venue_id) values(auth.uid(),'e6000000-0000-4000-8000-000000000206')$$,'42501',null,'raw table insertion cannot bypass follow entitlement');
select lives_ok($$delete from public.venue_follows where user_id=auth.uid() and venue_id='e6000000-0000-4000-8000-000000000201'$$,'own unfollow remains available while venue is hidden');
reset role;
select has_function('public','prepare_account_erasure_v2',array['text','uuid'],'billing-aware erasure is versioned');
select is(pg_get_function_result('public.prepare_account_erasure(text,uuid)'::regprocedure),'boolean','V1 boolean contract is preserved');
select set_config('request.jwt.claim.sub','e6000000-0000-4000-8000-000000000001',true);
create temporary table erasure_reserved as select * from public.reserve_venue_billing_checkout('e6000000-0000-4000-8000-000000000206','month',null);
create temporary table erasure_uncertain as select * from public.reserve_venue_billing_checkout('e6000000-0000-4000-8000-000000000208','month',null);
select public.mark_venue_checkout_uncertain((select attempt_id from erasure_uncertain));
create temporary table erasure_attached as select * from public.reserve_venue_billing_checkout('e6000000-0000-4000-8000-000000000205','month',null);
select public.attach_venue_billing_checkout((select attempt_id from erasure_attached),'erasure-checkout',now()+interval '1 hour','fixture-org','fixture-prod','fixture-price',1500,'ils','month',1,'e6000000-0000-4000-8000-000000000001',null);
select throws_ok($$select public.prepare_account_erasure('DELETE',null)$$,'P0001','UPSTREAM_UNAVAILABLE','V1 rolls back rather than stranding Polar cleanup');
select ok((select deleted_at is null from public.profiles where id='e6000000-0000-4000-8000-000000000001'),'V1 cleanup rejection does not tombstone locally');
select is((select count(*) from private.venue_billing_checkout_attempts where owner_id=auth.uid() and state in ('reserved','uncertain','attached')),3::bigint,'V1 rejection rolls back closure of every open attempt');
select results_eq($$select prepared,polar_cleanup_required from public.prepare_account_erasure_v2('DELETE',null)$$,$$values (true,true)$$,'V2 returns only successful preparation and cleanup obligation');
select is((select count(*) from public.venues where owner_id=auth.uid() and archived_at is not null),8::bigint,'erasure archives every owned venue');
select is((select count(*) from private.venue_billing_entitlements e join public.venues v on v.id=e.venue_id where v.owner_id=auth.uid() and e.status='expired' and e.polar_customer_id is null and e.polar_subscription_id is null),8::bigint,'erasure terminalizes all per-venue bindings');
select is((select count(*) from private.venue_billing_checkout_attempts where owner_id=auth.uid() and state='expired' and erased_at is not null and polar_checkout_id is null and external_customer_id is null),3::bigint,'reserved uncertain and attached attempts close with scrubbed identifiers');
select is((select erased_organization_id from private.venue_billing_checkout_attempts where id=(select attempt_id from erasure_attached)),'fixture-org','attached checkout retains the minimal authenticated late-event marker');
select results_eq($$select prepared,polar_cleanup_required from public.prepare_account_erasure_v2('DELETE',null)$$,$$values (true,true)$$,'pending provider cleanup is retryable without losing the obligation');
select is((select count(*) from public.security_audit_events where actor_id=auth.uid() and action='account.erase.prepare'),1::bigint,'V2 retry does not create another erasure audit');
select throws_ok($$select public.prepare_account_erasure('DELETE',null)$$,'P0001','UPSTREAM_UNAVAILABLE','V1 remains blocked while cleanup is pending');
select lives_ok($$select public.complete_polar_account_erasure_cleanup('e6000000-0000-4000-8000-000000000001',null,(select cleanup_token from private.polar_account_erasure_cleanup where actor_id='e6000000-0000-4000-8000-000000000001'))$$,'guarded service completion accepts fully scrubbed V2 state');
select results_eq($$select prepared,polar_cleanup_required from public.prepare_account_erasure_v2('DELETE',null)$$,$$values (true,false)$$,'retry after provider completion skips the external call');
select is(public.prepare_account_erasure('DELETE',null),true,'V1 remains compatible after provider cleanup completed');
select is((select outcome::text from public.apply_polar_venue_billing_event('visibility-late','subscription.active',now(),now(),
 'fixture-org','late-sub','late-checkout',(select attempt_id from erasure_reserved),'e6000000-0000-4000-8000-000000000206',
 'late-customer','e6000000-0000-4000-8000-000000000001','fixture-prod','fixture-price',1500,'ils','month',1,'active',false,now()+interval '30 days',null,null,null,null,null)),
 'erasure_cleanup_required','checkout succeeding after V2 erasure triggers cleanup and never activation');
select is((select status::text from private.venue_billing_entitlements where venue_id='e6000000-0000-4000-8000-000000000206'),'expired','late success cannot restore an erased venue');
select public.complete_polar_account_erasure_cleanup('e6000000-0000-4000-8000-000000000001',null,(select cleanup_token from private.polar_account_erasure_cleanup where actor_id='e6000000-0000-4000-8000-000000000001'));
select is((select count(*) from private.polar_webhook_events where webhook_id='visibility-late' and customer_id is null and external_customer_id is null and product_id is null),1::bigint,'late cleanup scrubs receipt bindings');
select set_config('request.jwt.claim.sub','e6000000-0000-4000-8000-000000000006',true);
select is(public.prepare_account_erasure('DELETE',null),true,'a no-billing Fan retains the boolean erasure success contract');
select is((select count(*) from private.polar_account_erasure_cleanup where actor_id=auth.uid()),0::bigint,'no-billing Fan creates no provider cleanup state');
select ok(not has_function_privilege('authenticated','private.prepare_account_erasure_core(text,uuid)','execute') and not has_function_privilege('anon','public.prepare_account_erasure_v2(text,uuid)','execute'),'private erasure core is inaccessible and V2 is authenticated-only');

select * from finish();
rollback;
