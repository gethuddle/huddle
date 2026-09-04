begin;
create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public, pg_catalog;
select no_plan();

-- These contract tests catch missing isolation, owner/admin confusion, duplicate
-- checkout creation, moving grace deadlines, and stale callbacks releasing a
-- newer checkout. All provider identifiers are synthetic and no network is used.
select has_table('private', 'venue_billing_entitlements', 'entitlements are private');
select has_table('private', 'venue_billing_checkout_attempts', 'attempts are private');
select has_table('private', 'polar_webhook_events', 'receipts are private');
select has_table('private', 'polar_account_erasure_cleanup', 'erasure cleanup is private');
select has_table('public', 'subscriptions', 'Fan follows retain their existing table');
select lives_ok($$select private.backfill_legacy_venue_billing_entitlements('2026-09-03 00:00Z')$$,
  'postgres can idempotently backfill missing legacy entitlements');

select ok(c.relrowsecurity and c.relforcerowsecurity, c.relname || ' forces RLS')
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'private' and c.relname in
  ('venue_billing_entitlements', 'venue_billing_checkout_attempts', 'polar_webhook_events', 'polar_account_erasure_cleanup');
select ok(not has_table_privilege(r, 'private.' || t, 'SELECT,INSERT,UPDATE,DELETE'), r || ' cannot directly access ' || t)
from unnest(array['anon','authenticated','service_role']) r
cross join unnest(array['venue_billing_entitlements','venue_billing_checkout_attempts','polar_webhook_events','polar_account_erasure_cleanup']) t;
select ok(not has_function_privilege(r, 'private.backfill_legacy_venue_billing_entitlements(timestamptz)', 'EXECUTE'), r || ' cannot backfill')
from unnest(array['anon','authenticated','service_role']) r;
select ok(not has_function_privilege(r, 'private.lock_venue_billing(uuid)', 'EXECUTE'), r || ' cannot acquire private billing lock')
from unnest(array['anon','authenticated','service_role']) r;

insert into auth.users(instance_id,id,aud,role,email,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
select '00000000-0000-0000-0000-000000000000', id, 'authenticated','authenticated', email, now(),'{}','{}',now(),now()
from (values
 ('e5000000-0000-4000-8000-000000000291'::uuid,'billing-owner@example.test'),
 ('e5000000-0000-4000-8000-000000000292'::uuid,'billing-admin@example.test'),
 ('e5000000-0000-4000-8000-000000000293'::uuid,'billing-outsider@example.test')) f(id,email);
update public.profiles set adult_attested_at=now(), rules_version=private.current_rules_version(), rules_accepted_at=now()
where id in ('e5000000-0000-4000-8000-000000000291','e5000000-0000-4000-8000-000000000292','e5000000-0000-4000-8000-000000000293');
insert into public.venues(id,owner_id,slug,name,address_text,location,description)
select id,'e5000000-0000-4000-8000-000000000291',slug,'Billing Venue','10 Venue Street, Haifa',
extensions.st_setsrid(extensions.st_makepoint(34.998,32.812),4326)::extensions.geography,'A synthetic billing test venue.'
from (values
 ('e5000000-0000-4000-8000-000000000601'::uuid,'billing-new'),
 ('e5000000-0000-4000-8000-000000000602'::uuid,'billing-legacy'),
 ('e5000000-0000-4000-8000-000000000603'::uuid,'billing-other'),
 ('e5000000-0000-4000-8000-000000000604'::uuid,'billing-current-legacy')) f(id,slug);
insert into public.venue_memberships(venue_id,user_id,role,status)
values('e5000000-0000-4000-8000-000000000601','e5000000-0000-4000-8000-000000000292','admin','active');
select is((select count(*) from private.venue_billing_entitlements where venue_id::text like 'e5000000%'),4::bigint,'venue insert atomically seeds exactly one entitlement');
select is((select status::text from private.venue_billing_entitlements where venue_id='e5000000-0000-4000-8000-000000000601'),'inactive','new venue is never granted legacy grace');
delete from private.venue_billing_entitlements where venue_id='e5000000-0000-4000-8000-000000000602';
select private.backfill_legacy_venue_billing_entitlements('2026-09-03 00:00Z');
select private.backfill_legacy_venue_billing_entitlements('2026-10-03 00:00Z');
select is((select grace_expires_at from private.venue_billing_entitlements where venue_id='e5000000-0000-4000-8000-000000000602'),'2026-09-10 00:00Z'::timestamptz,'repeated backfill never extends seven day cutover');
select is(private.venue_billing_effective_state('e5000000-0000-4000-8000-000000000602','2026-09-09 23:59:59Z'),'legacy_grace','grace valid immediately before deadline');
select is(private.venue_billing_effective_state('e5000000-0000-4000-8000-000000000602','2026-09-10 00:00Z'),'expired','deadline equality is expired');
select ok(not private.venue_allows_public_presence('e5000000-0000-4000-8000-000000000602','2026-09-04'), 'legacy venue is immediately hidden');
select ok(private.venue_allows_draft_work('e5000000-0000-4000-8000-000000000602','2026-09-04'), 'legacy grace allows private draft work');
select ok(not private.venue_allows_draft_work('e5000000-0000-4000-8000-000000000602','2026-09-10'), 'expired legacy loses draft work');
select throws_ok($$update private.venue_billing_entitlements set grace_started_at=grace_started_at+interval '1 day',grace_expires_at=grace_expires_at+interval '1 day' where venue_id='e5000000-0000-4000-8000-000000000602'$$,'23514',null,'even a coherent repeated failure cannot extend fixed grace');
select throws_ok($$update private.venue_billing_entitlements set grace_expires_at=grace_expires_at+interval '1 hour' where venue_id='e5000000-0000-4000-8000-000000000602'$$,'23514',null,'grace cannot be longer than seven days');

select set_config('request.jwt.claim.sub','e5000000-0000-4000-8000-000000000292',true);
select throws_ok($$select public.reserve_venue_billing_checkout('e5000000-0000-4000-8000-000000000601','month',null)$$,'P0001','VENUE_BILLING_OWNER_REQUIRED','admin cannot start checkout');
select is(public.get_venue_billing_context('e5000000-0000-4000-8000-000000000601')->>'canManageBilling','false','admin context has no billing action');
select set_config('request.jwt.claim.sub','e5000000-0000-4000-8000-000000000293',true);
select throws_ok($$select public.get_venue_billing_context('e5000000-0000-4000-8000-000000000601')$$,'P0001','NOT_FOUND','outsider cannot inspect billing context');
select throws_ok($$select public.reserve_venue_billing_checkout('e5000000-0000-4000-8000-000000000601','month',null)$$,'P0001','VENUE_BILLING_OWNER_REQUIRED','nonmember cannot reserve checkout');
select set_config('request.jwt.claim.sub','e5000000-0000-4000-8000-000000000291',true);
create temporary table reserved as select * from public.reserve_venue_billing_checkout('e5000000-0000-4000-8000-000000000601','month',null);
select ok((select created_by_this_call from reserved),'only creating call may create at provider');
select is((select attempt_id from public.reserve_venue_billing_checkout('e5000000-0000-4000-8000-000000000601','month',null)),(select attempt_id from reserved),'retry sees same immutable generation token');
select ok(not (select created_by_this_call from public.reserve_venue_billing_checkout('e5000000-0000-4000-8000-000000000601','year',null)), 'even a changed plan cannot independently create another checkout');
select is(public.get_venue_billing_context('e5000000-0000-4000-8000-000000000601')->>'state','confirming','inactive open checkout derives confirming');
select is((select status::text from private.venue_billing_entitlements where venue_id='e5000000-0000-4000-8000-000000000601'),'inactive','checkout reservation does not grant provider state');
select is((select array_agg(k order by k) from jsonb_object_keys(public.get_venue_billing_context('e5000000-0000-4000-8000-000000000601')) k),array['canManageBilling','canOpenPortal','canOperateExistingEvents','canPrepareDrafts','canPublish','canStartCheckout','checkoutPending','graceExpiresAt','interval','isPublic','paidThroughAt','publishCutoffAt','state']::text[],'context has only the bounded safe fields');
select throws_ok($$insert into private.venue_billing_checkout_attempts(venue_id,owner_id,interval,generation) values('e5000000-0000-4000-8000-000000000601','e5000000-0000-4000-8000-000000000291','month',2)$$,'23505',null,'only one open checkout per venue');
select throws_ok($$select public.fail_venue_billing_checkout((select attempt_id from reserved),'not_created_after_timeout',null)$$,'P0001','VENUE_BILLING_PENDING','uncertain creation cannot be released before fifteen minutes');
select lives_ok($$select public.attach_venue_billing_checkout((select attempt_id from reserved),'checkout-1',now()+interval '1 hour','organization-1','product-1','price-1',1500,'ils','month',1,'e5000000-0000-4000-8000-000000000291',null)$$,'service attachment accepts complete binding');
select throws_ok($$select public.close_venue_billing_checkout((select attempt_id from reserved),'wrong-checkout','expired',null)$$,'P0001','INVALID_TRANSITION','close rechecks exact provider checkout');
select throws_ok($$select public.fail_venue_billing_checkout((select attempt_id from reserved),'request_rejected',null)$$,'P0001','INVALID_TRANSITION','attached checkout cannot be released as failed creation');
select lives_ok($$select public.close_venue_billing_checkout((select attempt_id from reserved),'checkout-1','expired',null)$$,'validated terminal checkout evidence closes same generation');
create temporary table newer as select * from public.reserve_venue_billing_checkout('e5000000-0000-4000-8000-000000000601','year',null);
select ok((select generation from newer) > (select generation from reserved),'new reservation advances generation');
select throws_ok($$select public.close_venue_billing_checkout((select attempt_id from reserved),'checkout-1','expired',null)$$,'P0001','INVALID_TRANSITION','old close cannot release newer attempt');
select throws_ok($$select public.fail_venue_billing_checkout((select attempt_id from reserved),'request_rejected',null)$$,'P0001','INVALID_TRANSITION','old failure cannot release newer attempt');
select throws_ok($$select public.attach_venue_billing_checkout((select attempt_id from reserved),'checkout-old',now()+interval '1 hour','organization-1','product-1','price-1',1500,'ils','month',1,'e5000000-0000-4000-8000-000000000291',null)$$,'P0001','INVALID_TRANSITION','old attachment cannot replace current generation');
select lives_ok($$select public.fail_venue_billing_checkout((select attempt_id from newer),'request_rejected',null)$$,'definitive rejection releases current reservation');
select throws_ok($$select 'provider SDK secret'::public.venue_billing_checkout_failure_code$$,'22P02',null,'raw provider error cannot be stored as failure code');

create temporary table validation_attempt as select * from public.reserve_venue_billing_checkout('e5000000-0000-4000-8000-000000000601','month',null);
select is(public.get_venue_checkout_context('e5000000-0000-4000-8000-000000000291','e5000000-0000-4000-8000-000000000601',(select attempt_id from validation_attempt),null)->>'interval','month','service context returns immutable reserved plan');
select throws_ok($$select public.get_venue_checkout_context('e5000000-0000-4000-8000-000000000292','e5000000-0000-4000-8000-000000000601',(select attempt_id from validation_attempt),null)$$,'P0001','NOT_FOUND','admin cannot read owner checkout context');
select throws_ok($$select public.get_venue_checkout_context('e5000000-0000-4000-8000-000000000291','e5000000-0000-4000-8000-000000000603',(select attempt_id from validation_attempt),null)$$,'P0001','NOT_FOUND','cross venue attempt rejected');
select throws_ok($$select public.get_venue_checkout_context('e5000000-0000-4000-8000-000000000291','e5000000-0000-4000-8000-000000000601',null,null)$$,'P0001','VALIDATION_FAILED','context requires exactly one selector');
select ok(not has_function_privilege('authenticated','public.get_venue_checkout_context(uuid,uuid,uuid,text)','EXECUTE'),'browser cannot get private checkout binding');
select ok(has_function_privilege('service_role','public.get_venue_checkout_context(uuid,uuid,uuid,text)','EXECUTE'),'service may get guarded context');
select lives_ok($$select public.mark_venue_checkout_uncertain((select attempt_id from validation_attempt))$$,'uncertain creation retains open generation');
select is(public.get_venue_checkout_context('e5000000-0000-4000-8000-000000000291','e5000000-0000-4000-8000-000000000601',(select attempt_id from validation_attempt),null)->>'state','uncertain','uncertain result is recoverable');
select throws_ok($$select public.attach_venue_billing_checkout((select attempt_id from validation_attempt),'checkout-bad',now()+interval '1 hour','organization-1','product-1','price-1',15000,'ils','month',1,'e5000000-0000-4000-8000-000000000291',null)$$,'P0001','VALIDATION_FAILED','wrong plan amount cannot attach');
select throws_ok($$select public.attach_venue_billing_checkout((select attempt_id from validation_attempt),'checkout-bad',now()+interval '1 hour','organization-1','product-1','price-1',1500,'ils','month',1,'e5000000-0000-4000-8000-000000000292',null)$$,'P0001','VALIDATION_FAILED','external customer must be the exact owner');
select throws_ok($$select public.attach_venue_billing_checkout((select attempt_id from validation_attempt),'checkout-bad',now()-interval '1 second','organization-1','product-1','price-1',1500,'ils','month',1,'e5000000-0000-4000-8000-000000000291',null)$$,'P0001','VALIDATION_FAILED','expired checkout response cannot attach');
update public.venues set archived_at=now(),archived_by='e5000000-0000-4000-8000-000000000291' where id='e5000000-0000-4000-8000-000000000601';
select throws_ok($$select public.fail_venue_billing_checkout((select attempt_id from validation_attempt),'request_rejected',null)$$,'P0001','INVALID_TRANSITION','callback rechecks archive after external request');
update public.venues set archived_at=null,archived_by=null where id='e5000000-0000-4000-8000-000000000601';
update private.venue_billing_checkout_attempts set owner_id='e5000000-0000-4000-8000-000000000292' where id=(select attempt_id from validation_attempt);
select throws_ok($$select public.fail_venue_billing_checkout((select attempt_id from validation_attempt),'request_rejected',null)$$,'P0001','INVALID_TRANSITION','callback rechecks exact owner after external request');
update private.venue_billing_checkout_attempts set owner_id='e5000000-0000-4000-8000-000000000291' where id=(select attempt_id from validation_attempt);

-- Real-clock RPCs use a separate transaction-current fixture. The fixed-date
-- backfill/deadline checks above never determine this fixture's current state.
delete from private.venue_billing_entitlements where venue_id='e5000000-0000-4000-8000-000000000604';
select private.backfill_legacy_venue_billing_entitlements(now());
create temporary table legacy_attempt as select * from public.reserve_venue_billing_checkout('e5000000-0000-4000-8000-000000000604','month',null);
select is(public.get_venue_billing_context('e5000000-0000-4000-8000-000000000604')->>'state','legacy_grace','legacy checkout keeps deadline precedence');
select is(public.get_venue_billing_context('e5000000-0000-4000-8000-000000000604')->>'checkoutPending','true','legacy checkout is separately visible to management');
select private.apply_venue_billing_deadline_for_venue('e5000000-0000-4000-8000-000000000604',now()+interval '168 hours');
select is((select status::text from private.venue_billing_entitlements where venue_id='e5000000-0000-4000-8000-000000000604'),'expired','legacy no-ID expiry is persisted');
select throws_ok($$update private.venue_billing_entitlements set status='legacy_grace',grace_started_at=now()+interval '168 hours',grace_expires_at=now()+interval '336 hours' where venue_id='e5000000-0000-4000-8000-000000000604'$$,'23514',null,'expired venue cannot restart its one-time legacy grace');
select is(public.get_venue_billing_context('e5000000-0000-4000-8000-000000000604')->>'state','expired','pending checkout cannot mask legacy expiry');
select public.fail_venue_billing_checkout((select attempt_id from legacy_attempt),'request_rejected',null);
select ok((select created_by_this_call from public.reserve_venue_billing_checkout('e5000000-0000-4000-8000-000000000604','year',null)),'legacy expired without provider IDs may reserve fresh checkout');
select throws_ok($$select public.attach_venue_billing_checkout((select id from private.venue_billing_checkout_attempts where venue_id='e5000000-0000-4000-8000-000000000604' and state='reserved'),'checkout-1',now()+interval '1 hour','organization-1','product-year','price-year',15000,'ils','year',1,'e5000000-0000-4000-8000-000000000291',null)$$,'23505',null,'checkout ID cannot bind another venue even after local close');

-- Explicit provider fixtures make state and binding constraints observable.
update private.venue_billing_entitlements set status='active',interval='month',interval_count=1,polar_customer_id='customer-shared',polar_subscription_id='subscription-1',polar_product_id='product-1',polar_product_price_id='price-1',amount=1500,currency='ils',paid_through_at='2026-10-01 00:00Z',first_activated_at='2026-09-01 00:00Z' where venue_id='e5000000-0000-4000-8000-000000000601';
select throws_ok($$select public.fail_venue_billing_checkout((select attempt_id from validation_attempt),'request_rejected',null)$$,'P0001','INVALID_TRANSITION','new subscription binding prevents a late release');
update private.venue_billing_checkout_attempts set state='completed',closed_at=now() where id=(select attempt_id from validation_attempt);
select throws_ok($$update private.venue_billing_entitlements set paid_through_at='infinity' where venue_id='e5000000-0000-4000-8000-000000000601'$$,'23514',null,'infinite paid period cannot authorize forever');
select throws_ok($$update private.venue_billing_entitlements set first_activated_at=null where venue_id='e5000000-0000-4000-8000-000000000601'$$,'23514',null,'first activation evidence is immutable');
select is(private.venue_billing_effective_state('e5000000-0000-4000-8000-000000000601','2026-10-01'),'provider_stale','elapsed paid period does not falsely claim payment failed');
select is(private.venue_billing_effective_state('e5000000-0000-4000-8000-000000000601','2026-10-08'),'expired','elapsed stale grace is expired without waiting for scheduler');
select ok(private.venue_allows_publishing('e5000000-0000-4000-8000-000000000601','2027-01-01','2026-09-10'),'active venue may publish beyond current paid period');
-- This real-clock RPC rejects the current subscription in every lifecycle
-- state. Any deadline work it attempts rolls back with the expected exception.
select throws_ok($$select public.reserve_venue_billing_checkout('e5000000-0000-4000-8000-000000000601','month',null)$$,'P0001','VENUE_BILLING_PENDING','current subscription prevents duplicate checkout');
select throws_ok($$update private.venue_billing_entitlements set interval_count=2 where venue_id='e5000000-0000-4000-8000-000000000601'$$,'23514',null,'multi-interval subscription rejected');
select throws_ok($$update private.venue_billing_entitlements set currency='ILS' where venue_id='e5000000-0000-4000-8000-000000000601'$$,'23514',null,'currency must be normalized');
select throws_ok($$update private.venue_billing_entitlements set paid_through_at=null where venue_id='e5000000-0000-4000-8000-000000000601'$$,'23514',null,'active projection requires paid period');
select throws_ok($$update private.venue_billing_entitlements set status='past_due' where venue_id='e5000000-0000-4000-8000-000000000601'$$,'23514',null,'past due requires fixed grace');
select lives_ok($$update private.venue_billing_entitlements set status='active',interval='year',interval_count=1,polar_customer_id='customer-shared',polar_subscription_id='subscription-2',polar_product_id='product-2',polar_product_price_id='price-2',amount=15000,currency='ils',paid_through_at='2027-01-01',first_activated_at='2026-09-01' where venue_id='e5000000-0000-4000-8000-000000000603'$$,'one customer may subscribe to several venues');
select throws_ok($$update private.venue_billing_entitlements set polar_subscription_id='subscription-1' where venue_id='e5000000-0000-4000-8000-000000000603'$$,'23505',null,'subscription cannot bind two venues');
update private.venue_billing_entitlements set status='canceling' where venue_id='e5000000-0000-4000-8000-000000000601';
select ok(private.venue_allows_publishing('e5000000-0000-4000-8000-000000000601','2026-09-30','2026-09-10'),'canceling permits pre-cutoff events');
select ok(not private.venue_allows_publishing('e5000000-0000-4000-8000-000000000601','2026-10-01','2026-09-10'),'canceling excludes event at paid-end equality');
select private.lock_venue_billing('e5000000-0000-4000-8000-000000000601');
select private.apply_venue_billing_deadline_for_venue('e5000000-0000-4000-8000-000000000601','2026-10-01');
select is((select status::text from private.venue_billing_entitlements where venue_id='e5000000-0000-4000-8000-000000000601'),'expired','deadline persists expired rather than inactive');
-- Expired is already persisted above; these context capabilities depend on the
-- binding and terminal state, never on the wall clock relative to the fixture.
select is(public.get_venue_billing_context('e5000000-0000-4000-8000-000000000601')->>'canOpenPortal','true','bound expired subscription retains owner portal');
select throws_ok($$update private.venue_billing_entitlements set status='confirming' where venue_id='e5000000-0000-4000-8000-000000000601'$$,'23514',null,'provider confirmation cannot unlock an already expired venue');
select is(public.get_venue_billing_context('e5000000-0000-4000-8000-000000000601')->>'canStartCheckout','false','bound expired subscription cannot start another checkout');
update private.venue_billing_entitlements set polar_subscription_id=null where venue_id='e5000000-0000-4000-8000-000000000601';
select is(public.get_venue_billing_context('e5000000-0000-4000-8000-000000000601')->>'canStartCheckout','true','terminal released subscription may start fresh checkout');
select is(public.get_venue_billing_context('e5000000-0000-4000-8000-000000000601')->>'canPrepareDrafts','false','released expired subscription does not become never-paid');
select throws_ok($$update private.venue_billing_entitlements set status='inactive',interval=null,interval_count=null,polar_customer_id=null,polar_product_id=null,polar_product_price_id=null,amount=null,currency=null,paid_through_at=null,first_activated_at=null where venue_id='e5000000-0000-4000-8000-000000000601'$$,'23514',null,'expired history cannot revert to never-paid');

-- Event fixtures cover deadline side effects, acquisition cutoff, and retained
-- history. A fixture starts exactly at the deadline to test strict futurity.
insert into public.competitions(id,sport_id,provider,provider_external_id,code,name,country_name,last_synced_at)
values('e5000000-0000-4000-8000-000000000401','00000000-0000-4000-8000-000000000020','billing-test','competition','BT','Billing League','England',now());
insert into public.teams(id,sport_id,provider,provider_external_id,name,short_name,tla,country_name,last_synced_at)
values
 ('e5000000-0000-4000-8000-000000000402','00000000-0000-4000-8000-000000000020','billing-test','home','Billing Home','Home','BHM','England',now()),
 ('e5000000-0000-4000-8000-000000000403','00000000-0000-4000-8000-000000000020','billing-test','away','Billing Away','Away','BAW','England',now());
insert into public.matches(id,provider,provider_external_id,competition_id,home_team_id,away_team_id,starts_at,status,matchday,season_label,last_synced_at)
values('e5000000-0000-4000-8000-000000000404','billing-test','match','e5000000-0000-4000-8000-000000000401','e5000000-0000-4000-8000-000000000402','e5000000-0000-4000-8000-000000000403','2027-01-09','scheduled',1,'2026/27',now());
insert into public.events(id,created_by,host_venue_id,venue_id,match_id,title,description,expected_activity,cost_description,event_rules,commercial_affiliation,host_presence_confirmed_at,starts_at,ends_at,place_kind,audience,capacity,requires_approval,status,published_at)
select id,'e5000000-0000-4000-8000-000000000291','e5000000-0000-4000-8000-000000000603','e5000000-0000-4000-8000-000000000603',
 (select id from public.matches order by id limit 1),'Billing deadline event','Synthetic event for deadline cancellation.','Watch together','Free entry','Respect attendees.','Venue hosted',now(),starts,starts+interval '2 hours','venue','public',10,true,state::public.event_status,case when state='published' then now() end
from (values
 ('e5000000-0000-4000-8000-000000000701'::uuid,'2027-01-09 00:00Z'::timestamptz,'published'),
 ('e5000000-0000-4000-8000-000000000702'::uuid,'2027-01-08 00:00Z'::timestamptz,'published'),
 ('e5000000-0000-4000-8000-000000000703'::uuid,'2027-01-07 00:00Z'::timestamptz,'published'),
 ('e5000000-0000-4000-8000-000000000704'::uuid,'2027-01-09 00:00Z'::timestamptz,'draft')) f(id,starts,state);
insert into public.events(id,created_by,host_user_id,match_id,title,description,expected_activity,cost_description,event_rules,commercial_affiliation,host_presence_confirmed_at,starts_at,ends_at,place_kind,public_place_name,public_address_text,public_location,audience,capacity,requires_approval,status,published_at)
values('e5000000-0000-4000-8000-000000000705','e5000000-0000-4000-8000-000000000291','e5000000-0000-4000-8000-000000000291','e5000000-0000-4000-8000-000000000404','Private watch gathering','A free private gathering at a public cafe.','Watch together','Free entry','Respect attendees.','None',now(),'2027-01-09','2027-01-09 02:00Z','public_place','Billing Venue','10 Venue Street, Haifa',extensions.st_setsrid(extensions.st_makepoint(34.998,32.812),4326)::extensions.geography,'friends',10,true,'published',now());
insert into public.event_attendance(event_id,user_id,status,source,requested_at)
values('e5000000-0000-4000-8000-000000000701','e5000000-0000-4000-8000-000000000292','approved','self_request',now());
select ok(private.venue_allows_event_acquisition('e5000000-0000-4000-8000-000000000701','2026-12-30'),'active event acquisition permits future fixture');
update private.venue_billing_entitlements set status='canceling' where venue_id='e5000000-0000-4000-8000-000000000603';
select ok(not private.venue_allows_event_acquisition('e5000000-0000-4000-8000-000000000701','2026-12-30'),'canceling acquisition excludes post-cutoff event');
update private.venue_billing_entitlements set status='active' where venue_id='e5000000-0000-4000-8000-000000000603';
select private.apply_venue_billing_deadline_for_venue('e5000000-0000-4000-8000-000000000603','2027-01-01');
select is((select status::text from private.venue_billing_entitlements where venue_id='e5000000-0000-4000-8000-000000000603'),'provider_stale','deadline anchors provider-stale without asserting payment failure');
select throws_ok($$update private.venue_billing_entitlements set status='past_due',grace_started_at='2027-01-02',grace_expires_at='2027-01-09' where venue_id='e5000000-0000-4000-8000-000000000603'$$,'23514',null,'changing grace label cannot extend continuous failure window');
select private.apply_venue_billing_deadline_for_venue('e5000000-0000-4000-8000-000000000603','2027-01-02');
select is((select grace_expires_at from private.venue_billing_entitlements where venue_id='e5000000-0000-4000-8000-000000000603'),'2027-01-08 00:00Z'::timestamptz,'repeat stale evaluation keeps original paid-end anchor');
select private.apply_venue_billing_deadline_for_venue('e5000000-0000-4000-8000-000000000603','2027-01-08');
select is((select status::text from public.events where id='e5000000-0000-4000-8000-000000000701'),'cancelled','deadline cancels future published event');
select is((select status::text from public.events where id='e5000000-0000-4000-8000-000000000702'),'published','event starting exactly now is not rewritten');
select is((select status::text from public.events where id='e5000000-0000-4000-8000-000000000703'),'published','already-started history is not rewritten');
select is((select status::text from public.events where id='e5000000-0000-4000-8000-000000000704'),'draft','unpublished draft is retained');
select is((select status::text from public.events where id='e5000000-0000-4000-8000-000000000705'),'published','free private gathering at the same public place survives billing expiry');
select is((select count(*) from public.event_attendance where event_id='e5000000-0000-4000-8000-000000000701'),1::bigint,'deadline retains attendance history');
update private.venue_billing_entitlements set status='active',paid_through_at='2027-02-01' where venue_id='e5000000-0000-4000-8000-000000000603';
select is((select status::text from public.events where id='e5000000-0000-4000-8000-000000000701'),'cancelled','later recovery never uncancels deadline event');

select is(enum_range(null::public.polar_venue_billing_event_type)::text,'{subscription.created,subscription.active,subscription.canceled,subscription.uncanceled,subscription.cycled,subscription.past_due,subscription.revoked,order.paid}','receipt types are bounded to subscribed events');
select is(enum_range(null::public.venue_billing_apply_outcome)::text,'{applied,duplicate,stale,observed,ignored,reconciliation_required,erasure_cleanup_required,erasure_cleanup_complete}','outcomes cannot contain provider data');
select ok(not has_function_privilege('authenticated','public.attach_venue_billing_checkout(uuid,text,timestamptz,text,text,text,integer,text,public.venue_billing_interval,integer,text,uuid)','EXECUTE'),'browser cannot attach provider checkout');
select ok(has_function_privilege('service_role','public.complete_polar_account_erasure_cleanup(uuid,uuid,uuid)','EXECUTE') and not has_function_privilege('authenticated','public.complete_polar_account_erasure_cleanup(uuid,uuid,uuid)','EXECUTE'),'cleanup completion is service role only');
select throws_ok($$select public.complete_polar_account_erasure_cleanup('e5000000-0000-4000-8000-000000000291',null,(select cleanup_token from private.polar_account_erasure_cleanup where actor_id='e5000000-0000-4000-8000-000000000291'))$$,'P0001','INVALID_TRANSITION','cleanup cannot complete for an unerased actor');

-- Actual role checks catch an accidental future GRANT, including BYPASSRLS
-- service_role (which must still lack table privileges).
set local role authenticated;
select throws_ok($$select public.get_venue_checkout_context('e5000000-0000-4000-8000-000000000291','e5000000-0000-4000-8000-000000000601','e5000000-0000-4000-8000-000000000601',null)$$,'42501',null,'browser cannot invoke private context even with supplied actor');
select throws_ok($$select public.mark_venue_checkout_uncertain('e5000000-0000-4000-8000-000000000601')$$,'42501',null,'browser cannot write uncertainty evidence');
select throws_ok($$select * from private.venue_billing_entitlements$$,'42501',null,'browser cannot directly read entitlement IDs');
select throws_ok($$select public.fail_venue_billing_checkout('e5000000-0000-4000-8000-000000000601','request_rejected',null)$$,'42501',null,'browser cannot claim provider rejection');
select throws_ok($$select public.close_venue_billing_checkout('e5000000-0000-4000-8000-000000000601','checkout-1','expired',null)$$,'42501',null,'browser cannot claim provider terminal checkout');
select throws_ok($$select public.complete_polar_account_erasure_cleanup('e5000000-0000-4000-8000-000000000291',null,(select cleanup_token from private.polar_account_erasure_cleanup where actor_id='e5000000-0000-4000-8000-000000000291'))$$,'42501',null,'browser cannot acknowledge erasure provider cleanup');
reset role;
set local role anon;
select throws_ok($$select public.get_venue_billing_context('e5000000-0000-4000-8000-000000000601')$$,'42501',null,'anonymous client cannot read billing context');
reset role;
set local role service_role;
select throws_ok($$select * from private.venue_billing_checkout_attempts$$,'42501',null,'service bypass-RLS role still cannot read private attempts directly');
select throws_ok($$insert into private.polar_account_erasure_cleanup(actor_id) values('e5000000-0000-4000-8000-000000000291')$$,'42501',null,'service bypass-RLS role cannot write cleanup state directly');
reset role;

insert into private.polar_account_erasure_cleanup(actor_id) values('e5000000-0000-4000-8000-000000000291');
insert into private.polar_webhook_events(webhook_id,event_type,venue_id,polar_subscription_id,polar_order_id,provider_modified_at,outcome)
values('webhook-erased','order.paid','e5000000-0000-4000-8000-000000000603','subscription-2','order-erased',now(),'observed');
update public.profiles set deleted_at=now() where id='e5000000-0000-4000-8000-000000000291';
select throws_ok($$select public.complete_polar_account_erasure_cleanup('e5000000-0000-4000-8000-000000000291',null,(select cleanup_token from private.polar_account_erasure_cleanup where actor_id='e5000000-0000-4000-8000-000000000291'))$$,'P0001','INVALID_TRANSITION','completion rejects unterminalized provider residue');
update private.venue_billing_entitlements set status='expired',grace_started_at=null,grace_expires_at=null,
 polar_customer_id=null,polar_subscription_id=null,last_paid_order_id=null,last_paid_order_at=null,last_webhook_id=null
where venue_id::text like 'e5000000%';
update private.venue_billing_checkout_attempts set state='failed',erased_at=now(),closed_at=now(),
 polar_checkout_id=null,checkout_expires_at=null,polar_organization_id=null,polar_product_id=null,polar_product_price_id=null,amount=null,currency=null,interval_count=null,external_customer_id=null
where owner_id='e5000000-0000-4000-8000-000000000291';
update private.polar_webhook_events set polar_subscription_id=null,polar_order_id=null where webhook_id='webhook-erased';
select throws_ok($$select public.complete_polar_account_erasure_cleanup('e5000000-0000-4000-8000-000000000291',null,(select cleanup_token from private.polar_account_erasure_cleanup where actor_id='e5000000-0000-4000-8000-000000000291'))$$,'P0001','INVALID_TRANSITION','completion also requires owned venues to be archived');
update public.venues set archived_at=now(),archived_by=owner_id where owner_id='e5000000-0000-4000-8000-000000000291';
select lives_ok($$select public.complete_polar_account_erasure_cleanup('e5000000-0000-4000-8000-000000000291',null,(select cleanup_token from private.polar_account_erasure_cleanup where actor_id='e5000000-0000-4000-8000-000000000291'))$$,'sanitized erased actor cleanup completes');
create temporary table first_cleanup as select completed_at from private.polar_account_erasure_cleanup where actor_id='e5000000-0000-4000-8000-000000000291';
select public.complete_polar_account_erasure_cleanup('e5000000-0000-4000-8000-000000000291',null,(select cleanup_token from private.polar_account_erasure_cleanup where actor_id='e5000000-0000-4000-8000-000000000291'));
select is((select completed_at from private.polar_account_erasure_cleanup where actor_id='e5000000-0000-4000-8000-000000000291'),(select completed_at from first_cleanup),'cleanup retry does not rewrite completed time');
select is((select outcome::text from private.polar_account_erasure_cleanup where actor_id='e5000000-0000-4000-8000-000000000291'),'erasure_cleanup_complete','completion persists only bounded outcome');
select throws_ok($$select public.attach_venue_billing_checkout((select attempt_id from reserved),'late-checkout',now()+interval '1 hour','organization-1','product-1','price-1',1500,'ils','month',1,'e5000000-0000-4000-8000-000000000291',null)$$,'P0001','INVALID_TRANSITION','late erased checkout never restores entitlement');

-- Reconciliation retains elapsed succeeded bindings without granting access.
insert into auth.users(instance_id,id,aud,role,email,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
values('00000000-0000-0000-0000-000000000000','e5000000-0000-4000-8000-000000000294','authenticated','authenticated','reconcile@example.test',now(),'{}','{}',now(),now());
update public.profiles set adult_attested_at=now(),rules_version=private.current_rules_version(),rules_accepted_at=now() where id='e5000000-0000-4000-8000-000000000294';
insert into public.venues(id,owner_id,slug,name,address_text,location,description)
values('e5000000-0000-4000-8000-000000000605','e5000000-0000-4000-8000-000000000294','billing-reconcile','Reconcile','Test address',extensions.st_setsrid(extensions.st_makepoint(34.998,32.812),4326)::extensions.geography,'A synthetic reconciliation test venue.');
select set_config('request.jwt.claim.sub','e5000000-0000-4000-8000-000000000294',true);
create temporary table recovered as select * from public.reserve_venue_billing_checkout('e5000000-0000-4000-8000-000000000605','month',null);
select lives_ok($$select public.reconcile_venue_billing_checkout((select attempt_id from recovered),'recovered-checkout',now()-interval '1 hour','org','prod','price',1500,'ils','month',1,'e5000000-0000-4000-8000-000000000294','succeeded')$$,'elapsed succeeded checkout can be attached for webhook confirmation');
select is((select state from private.venue_billing_checkout_attempts where id=(select attempt_id from recovered)),'attached','succeeded stays attached');
select is((select status::text from private.venue_billing_entitlements where venue_id='e5000000-0000-4000-8000-000000000605'),'inactive','reconciliation never activates entitlement');
select is(public.get_venue_checkout_context('e5000000-0000-4000-8000-000000000294','e5000000-0000-4000-8000-000000000605',null,'recovered-checkout')->>'attemptId',(select attempt_id::text from recovered),'return selector resolves the same owner binding');
select lives_ok($$select public.reconcile_venue_billing_checkout((select attempt_id from recovered),'recovered-checkout',now()-interval '1 hour','org','prod','price',1500,'ils','month',1,'e5000000-0000-4000-8000-000000000294','expired')$$,'exact terminal evidence closes recovered checkout');
select is((select state from private.venue_billing_checkout_attempts where id=(select attempt_id from recovered)),'expired','recovered terminal is closed');
select ok((select created_by_this_call from public.reserve_venue_billing_checkout('e5000000-0000-4000-8000-000000000605','month',null)),'terminal proof permits new generation');
select throws_ok($$select public.get_venue_checkout_context('e5000000-0000-4000-8000-000000000294','e5000000-0000-4000-8000-000000000605',null,'recovered-checkout')$$,'P0001','NOT_FOUND','stale return cannot read superseded checkout');
select throws_ok($$select public.get_venue_checkout_context('e5000000-0000-4000-8000-000000000294','e5000000-0000-4000-8000-000000000605',(select attempt_id from recovered),'recovered-checkout')$$,'P0001','VALIDATION_FAILED','both selectors are rejected');
select throws_ok($$select public.get_venue_checkout_context('e5000000-0000-4000-8000-000000000291','e5000000-0000-4000-8000-000000000601',(select attempt_id from validation_attempt),null)$$,'P0001','NOT_FOUND','erased actor cannot read retained checkout marker');
select ok(not has_function_privilege('authenticated','public.reconcile_venue_billing_checkout(uuid,text,timestamptz,text,text,text,integer,text,public.venue_billing_interval,integer,text,text)','EXECUTE'),'browser cannot assert terminal reconciliation evidence');
select throws_ok($$select public.reconcile_venue_billing_checkout((select id from private.venue_billing_checkout_attempts where venue_id='e5000000-0000-4000-8000-000000000605' and state='reserved'),'recovered-failed',now()-interval '1 hour','org','prod','price',1500,'ils','month',1,'e5000000-0000-4000-8000-000000000294','404')$$,'P0001','VALIDATION_FAILED','not-found is not terminal reconciliation proof');
select lives_ok($$select public.reconcile_venue_billing_checkout((select id from private.venue_billing_checkout_attempts where venue_id='e5000000-0000-4000-8000-000000000605' and state='reserved'),'recovered-failed',now()-interval '1 hour','org','prod','price',1500,'ils','month',1,'e5000000-0000-4000-8000-000000000294','failed')$$,'validated failed recovery persists terminal binding');
update public.venues set archived_at=now(),archived_by=owner_id where id='e5000000-0000-4000-8000-000000000605';
select throws_ok($$select public.get_venue_checkout_context('e5000000-0000-4000-8000-000000000294','e5000000-0000-4000-8000-000000000605',null,'recovered-failed')$$,'P0001','NOT_FOUND','archived owner cannot read checkout return');
-- Task 5: exercise signed-event scalar transaction contract. Deliberately use
-- synthetic provider IDs and current-relative periods; no provider is contacted.
select has_function('public','apply_polar_venue_billing_event','signed scalar apply RPC exists');
select has_function('public','complete_polar_venue_billing_reconciliation','second guarded reconciliation RPC exists');
select has_column('private','venue_billing_entitlements','expiry_reason','expired failure provenance is retained');
insert into auth.users(instance_id,id,aud,role,email,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
values('00000000-0000-0000-0000-000000000000','e5000000-0000-4000-8000-000000000295','authenticated','authenticated','webhooks@example.test',now(),'{}','{}',now(),now());
update public.profiles set adult_attested_at=now(),rules_version=private.current_rules_version(),rules_accepted_at=now() where id='e5000000-0000-4000-8000-000000000295';
insert into public.venues(id,owner_id,slug,name,address_text,location,description)
values('e5000000-0000-4000-8000-000000000606','e5000000-0000-4000-8000-000000000295','billing-webhook','Webhook','Test address',extensions.st_setsrid(extensions.st_makepoint(34.998,32.812),4326)::extensions.geography,'A synthetic webhook test venue.');
select set_config('request.jwt.claim.sub','e5000000-0000-4000-8000-000000000295',true);
create temporary table webhook_attempt as select * from public.reserve_venue_billing_checkout('e5000000-0000-4000-8000-000000000606','month',null);
select public.attach_venue_billing_checkout((select attempt_id from webhook_attempt),'wh-checkout',now()+interval '1 hour','wh-org','wh-prod','wh-price',1500,'ils','month',1,'e5000000-0000-4000-8000-000000000295',null);
create function pg_temp.ev(w text,t text default 'subscription.active',s text default 'active',version integer default 0,period_days integer default 30, canceling boolean default false,order_id text default null,reconcile boolean default false, org text default 'wh-org',prod text default 'wh-prod',price text default 'wh-price',customer text default 'wh-customer',owner text default 'e5000000-0000-4000-8000-000000000295',checkout text default 'wh-checkout',sub text default 'wh-sub',attempt uuid default null)
returns text language plpgsql as $$
declare result text;
begin
select outcome::text into result from public.apply_polar_venue_billing_event(w,t::public.polar_venue_billing_event_type,now()+version*interval '1 second',now()+version*interval '1 second',org,sub,checkout,coalesce(attempt,(select attempt_id from webhook_attempt)),'e5000000-0000-4000-8000-000000000606',customer,owner,prod,case when reconcile then null else price end,case when reconcile then null else 1500 end,case when reconcile then null else 'ils' end,'month'::public.venue_billing_interval,case when reconcile then null else 1 end,case when reconcile then null else s end,case when reconcile then null else canceling end,case when reconcile then null else now()+period_days*interval '1 day' end,case when s='past_due' then now()-interval '1 day' else null end,order_id,case when t='order.paid' then 'subscription_cycle' else null end,null,case when t='order.paid' then now()+period_days*interval '1 day' else null end,case when t='order.paid' and not reconcile then now()+version*interval '1 second' else null end);
return result;
end $$;
delete from private.venue_billing_entitlements where venue_id='e5000000-0000-4000-8000-000000000606';
select private.backfill_legacy_venue_billing_entitlements(now());
select is(pg_temp.ev('wh-legacy-created','subscription.created','incomplete'),'observed','created observes legacy without masking its deadline');
select is((select grace_expires_at from private.venue_billing_entitlements where venue_id='e5000000-0000-4000-8000-000000000606'),now()+interval '168 hours','created preserves original legacy deadline');
select is((select completed_subscription_id from private.venue_billing_checkout_attempts where id=(select attempt_id from webhook_attempt)),'wh-sub','legacy created binds completed attempt to exactly one subscription');
-- Fresh entitlement fixture for the independent never-paid initial flow.
delete from private.venue_billing_entitlements where venue_id='e5000000-0000-4000-8000-000000000606';
insert into private.venue_billing_entitlements(venue_id) values('e5000000-0000-4000-8000-000000000606');
select is(pg_temp.ev('wh-created','subscription.created','incomplete'),'applied','created records confirming without activating');
select is((select status::text from private.venue_billing_entitlements where venue_id='e5000000-0000-4000-8000-000000000606'),'confirming','created is private');
savepoint unactivated_direct;
select is(pg_temp.ev('wh-unactivated-paid','order.paid',version=>0,period_days=>30,order_id=>'unactivated-direct'),'ignored','paid cycle cannot supply initial activation after created');
select is((select status::text from private.venue_billing_entitlements where venue_id='e5000000-0000-4000-8000-000000000606'),'confirming','direct paid proof leaves an unactivated subscription hidden');
rollback to savepoint unactivated_direct;
savepoint unactivated_reconciled;
select is(pg_temp.ev('wh-unactivated-reconciled','order.paid',version=>0,period_days=>30,order_id=>'unactivated-reconciled',reconcile=>true),'reconciliation_required','incomplete paid proof may be inspected without activating');
select is(public.complete_polar_venue_billing_reconciliation('wh-unactivated-reconciled','wh-sub',now(),null,'wh-customer','e5000000-0000-4000-8000-000000000295','wh-prod','wh-price',1500,'ils','month',1,'active',false,now()+interval '30 days',null)::text,'ignored','canonical active plus paid cycle cannot replace initial signed activation');
select is((select status::text from private.venue_billing_entitlements where venue_id='e5000000-0000-4000-8000-000000000606'),'confirming','reconciled paid proof leaves an unactivated subscription hidden');
rollback to savepoint unactivated_reconciled;
select is(pg_temp.ev('wh-active',version=>1),'applied','signed active initially activates');
select is(pg_temp.ev('wh-active',version=>1),'duplicate','webhook redelivery is idempotent');
select throws_ok($$select pg_temp.ev('wh-org-bad',org=>'wrong')$$,'P0001','INVALID_TRANSITION','organization is bound to attached checkout');
select throws_ok($$select pg_temp.ev('wh-prod-bad',prod=>'wrong')$$,'P0001','INVALID_TRANSITION','product is bound to attached checkout');
select throws_ok($$select pg_temp.ev('wh-price-bad',price=>'wrong')$$,'P0001','INVALID_TRANSITION','selected price is checked independently from product');
select throws_ok($$select pg_temp.ev('wh-customer-bad',customer=>'wrong')$$,'P0001','INVALID_TRANSITION','provider customer cannot switch on same subscription');
select throws_ok($$select pg_temp.ev('wh-checkout-bad',checkout=>'wrong')$$,'P0001','INVALID_TRANSITION','non-null checkout must match');
select is(pg_temp.ev('wh-owner-bad',owner=>'e5000000-0000-4000-8000-000000000294'),'ignored','wrong external owner cannot grant');
select is((select count(*) from private.polar_webhook_events where webhook_id='wh-price-bad'),0::bigint,'receipt and failed transition roll back atomically');
select throws_ok($$select pg_temp.ev('wh-attempt-bad',attempt=>'e5000000-0000-4000-8000-000000000000')$$,'P0001','INVALID_TRANSITION','unknown attempt cannot write receipt');
select is((select state from private.venue_billing_checkout_attempts where id=(select attempt_id from webhook_attempt)),'completed','activation completes only matched attempt');
select is(pg_temp.ev('wh-stale',version=>0),'stale','older snapshot cannot regress');
select is(pg_temp.ev('wh-cycle','subscription.cycled',version=>2,period_days=>60),'observed','prepayment cycle is observation only');
select is(pg_temp.ev('wh-active-later',version=>3,period_days=>60),'observed','active snapshot cannot prove routine renewal');
select is((select paid_through_at from private.venue_billing_entitlements where venue_id='e5000000-0000-4000-8000-000000000606'),now()+interval '30 days','unpaid snapshots leave proven period unchanged');
select is(pg_temp.ev('wh-paid','order.paid',version=>4,period_days=>60,order_id=>'order-1'),'applied','bound renewal advances period');
select is(pg_temp.ev('wh-paid-old-failure','subscription.past_due','past_due',3),'stale','older failure cannot undo newer paid proof');
select is(pg_temp.ev('wh-paid-replay','order.paid',version=>5,period_days=>90,order_id=>'order-1'),'duplicate','same order cannot advance twice under a new webhook ID');
select is(pg_temp.ev('wh-past','subscription.past_due','past_due',6),'applied','failure hides venue');
create temporary table wh_grace as select grace_started_at,grace_expires_at from private.venue_billing_entitlements where venue_id='e5000000-0000-4000-8000-000000000606';
select is(pg_temp.ev('wh-past-again','subscription.past_due','past_due',7),'applied','repeat failure records current version');
select is((select grace_expires_at from private.venue_billing_entitlements where venue_id='e5000000-0000-4000-8000-000000000606'),(select grace_expires_at from wh_grace),'repeat failure cannot extend grace');
select private.apply_venue_billing_deadline_for_venue('e5000000-0000-4000-8000-000000000606',now()+interval '8 days');
select is((select expiry_reason from private.venue_billing_entitlements where venue_id='e5000000-0000-4000-8000-000000000606'),'past_due','deadline retains failure provenance');
select is(pg_temp.ev('wh-recovered',version=>8,period_days=>90),'applied','bound active recovers expired true failure');
insert into public.events(id,created_by,host_venue_id,venue_id,match_id,title,description,expected_activity,cost_description,event_rules,commercial_affiliation,host_presence_confirmed_at,starts_at,ends_at,place_kind,audience,capacity,requires_approval,status,published_at)
select 'e5000000-0000-4000-8000-000000000706','e5000000-0000-4000-8000-000000000295','e5000000-0000-4000-8000-000000000606','e5000000-0000-4000-8000-000000000606',match_id,'Webhook recovery event',description,expected_activity,cost_description,event_rules,commercial_affiliation,now(),now()+interval '180 days',now()+interval '180 days 2 hours',place_kind,audience,capacity,requires_approval,'published',now()
from public.events where id='e5000000-0000-4000-8000-000000000701';
select private.apply_venue_billing_deadline_for_venue('e5000000-0000-4000-8000-000000000606',now()+interval '98 days');
select is((select expiry_reason from private.venue_billing_entitlements where venue_id='e5000000-0000-4000-8000-000000000606'),'provider_stale','deadline distinguishes stale from payment failure');
select is(pg_temp.ev('wh-no-recover',version=>9,period_days=>120),'observed','active cannot recover expired provider-stale');
savepoint expired_signed_failure;
select is(pg_temp.ev('wh-expired-signed-failure','subscription.past_due','past_due',10),'applied','new signed failure replaces expired stale provenance');
select is((select status::text from private.venue_billing_entitlements where venue_id='e5000000-0000-4000-8000-000000000606'),'expired','signed failure does not reopen an expired grace period');
select is((select expiry_reason from private.venue_billing_entitlements where venue_id='e5000000-0000-4000-8000-000000000606'),'past_due','expired row retains real signed failure provenance');
select ok((select grace_started_at is null and grace_expires_at is null from private.venue_billing_entitlements where venue_id='e5000000-0000-4000-8000-000000000606'),'expired signed failure cannot start or extend grace');
select is(pg_temp.ev('wh-expired-failure-recovered',version=>11,period_days=>120),'applied','active may recover signed failure after earlier stale expiry');
select is((select status::text from private.venue_billing_entitlements where venue_id='e5000000-0000-4000-8000-000000000606'),'active','failure recovery restores entitlement');
select is((select status::text from public.events where id='e5000000-0000-4000-8000-000000000706'),'cancelled','failure recovery never resurrects events cancelled at stale expiry');
rollback to savepoint expired_signed_failure;
select is(pg_temp.ev('wh-pending','order.paid',version=>10,period_days=>120,order_id=>'order-2',reconcile=>true),'reconciliation_required','incomplete order commits proof without entitlement');
select is(pg_temp.ev('wh-pending','order.paid',version=>10,period_days=>120,order_id=>'order-2',reconcile=>true),'reconciliation_required','pending proof is retryable');
select throws_ok($$select public.complete_polar_venue_billing_reconciliation('wh-pending','wh-sub',now()+interval '11 seconds',null,'wh-customer','e5000000-0000-4000-8000-000000000295','wh-prod','wh-price',1500,'ils','month',1,'active',false,now()+interval '150 days',null)$$,'P0001','INVALID_TRANSITION','old paid proof cannot authorize a newer unpaid canonical cycle');
select is(public.complete_polar_venue_billing_reconciliation('wh-pending','wh-sub',now()+interval '11 seconds',null,'wh-customer','e5000000-0000-4000-8000-000000000295','wh-prod','wh-price',1500,'ils','month',1,'active',false,now()+interval '120 days',null)::text,'applied','bound canonical same-cycle completes paid proof');
select is(pg_temp.ev('wh-pending-earlier-canonical','order.paid',version=>12,period_days=>130,order_id=>'order-earlier',reconcile=>true),'reconciliation_required','order version is separate from canonical subscription version');
select is(public.complete_polar_venue_billing_reconciliation('wh-pending-earlier-canonical','wh-sub',now()+interval '11 seconds',null,'wh-customer','e5000000-0000-4000-8000-000000000295','wh-prod','wh-price',1500,'ils','month',1,'active',false,now()+interval '130 days',null)::text,'applied','current canonical subscription may predate its paid order');
select is((select last_paid_order_at from private.venue_billing_entitlements where venue_id='e5000000-0000-4000-8000-000000000606'),now()+interval '12 seconds','canonical version never overwrites signed order version');
select is(pg_temp.ev('wh-cancel','subscription.canceled',version=>12,period_days=>120,canceling=>true),'applied','cancel-at-end within proven period is canceling');
select is(pg_temp.ev('wh-uncancel','subscription.uncanceled',version=>13,period_days=>120),'applied','uncancel restores still-proven period');
select is(pg_temp.ev('wh-equal','subscription.active',version=>13,period_days=>120,canceling=>true),'reconciliation_required','equal conflicting state requires canonical reconciliation');
select is(public.complete_polar_venue_billing_reconciliation('wh-equal','wh-sub',now()+interval '13 seconds','wh-checkout','wh-customer','e5000000-0000-4000-8000-000000000295','wh-prod','wh-price',1500,'ils','month',1,'active',true,now()+interval '180 days',null)::text,'applied','canonical conflict resolution uses already-proven period');
select is((select paid_through_at from private.venue_billing_entitlements where venue_id='e5000000-0000-4000-8000-000000000606'),now()+interval '130 days','snapshot reconciliation does not grant an unpaid newer cycle');
select is(pg_temp.ev('wh-revoke','subscription.revoked','canceled',14),'applied','terminal revocation expires and releases binding');
select is((select polar_subscription_id from private.venue_billing_entitlements where venue_id='e5000000-0000-4000-8000-000000000606'),null,'terminal releases own provider subscription');
select is(pg_temp.ev('wh-zombie',version=>15),'ignored','completed terminal subscription cannot reactivate');
create temporary table second_webhook_attempt as select * from public.reserve_venue_billing_checkout('e5000000-0000-4000-8000-000000000606','month',null);
select public.attach_venue_billing_checkout((select attempt_id from second_webhook_attempt),'wh-checkout-2',now()+interval '1 hour','wh-org','wh-prod','wh-price',1500,'ils','month',1,'e5000000-0000-4000-8000-000000000295',null);
savepoint replacement_without_activation;
select is(pg_temp.ev('wh-second-created','subscription.created','incomplete',15,sub=>'wh-sub-2',checkout=>'wh-checkout-2',attempt=>(select attempt_id from second_webhook_attempt)),'observed','replacement created retains expired venue state');
select is(pg_temp.ev('wh-second-initial-failure','subscription.past_due','past_due',16,sub=>'wh-sub-2',checkout=>'wh-checkout-2',attempt=>(select attempt_id from second_webhook_attempt)),'applied','initial failure binds replacement without activating it');
select ok((select first_activated_at is not null from private.venue_billing_entitlements where venue_id='e5000000-0000-4000-8000-000000000606'),'replacement venue retains prior generation activation history');
select is(pg_temp.ev('wh-second-unactivated-paid','order.paid',version=>17,period_days=>140,order_id=>'replacement-unactivated',sub=>'wh-sub-2',checkout=>'wh-checkout-2',attempt=>(select attempt_id from second_webhook_attempt)),'ignored','old generation activation cannot authorize replacement renewal');
select is((select status::text from private.venue_billing_entitlements where venue_id='e5000000-0000-4000-8000-000000000606'),'past_due','replacement remains hidden until its own activating event');
rollback to savepoint replacement_without_activation;
select is(pg_temp.ev('wh-second',version=>16,sub=>'wh-sub-2',checkout=>'wh-checkout-2',attempt=>(select attempt_id from second_webhook_attempt)),'applied','new subscription after terminal activates its own generation');
select is(pg_temp.ev('wh-conflict-failure',version=>16,canceling=>true,sub=>'wh-sub-2',checkout=>'wh-checkout-2',attempt=>(select attempt_id from second_webhook_attempt)),'reconciliation_required','equal active cancellation conflict persists proof');
select is(public.complete_polar_venue_billing_reconciliation('wh-conflict-failure','wh-sub-2',now()+interval '16 seconds','wh-checkout-2','wh-customer','e5000000-0000-4000-8000-000000000295','wh-prod','wh-price',1500,'ils','month',1,'past_due',false,now()+interval '30 days',null)::text,'applied','canonical failure hides venue during status reconciliation');
select is((select status::text from private.venue_billing_entitlements where venue_id='e5000000-0000-4000-8000-000000000606'),'past_due','canonical failure cannot leave formerly active venue public');
select is((select grace_started_at from private.venue_billing_entitlements where venue_id='e5000000-0000-4000-8000-000000000606'),now()+interval '16 seconds','canonical failure fallback is retained signed event time');
select is(pg_temp.ev('wh-old-revoke','subscription.revoked','canceled',17),'ignored','old subscription cannot revoke new subscription');
select is((select polar_subscription_id from private.venue_billing_entitlements where venue_id='e5000000-0000-4000-8000-000000000606'),'wh-sub-2','new binding survives old event');
select is((select count(*) from private.polar_webhook_events where webhook_id='wh-pending'),1::bigint,'reconciliation updates original receipt');
select ok(not has_function_privilege(r,p.oid,'EXECUTE'),r || ' cannot apply webhook scalar RPC') from pg_proc p join pg_namespace n on n.oid=p.pronamespace cross join unnest(array['anon','authenticated']) r where n.nspname='public' and p.proname in ('apply_polar_venue_billing_event','complete_polar_venue_billing_reconciliation');
-- Synthetic retained markers exercise Task 5 cleanup only; production account
-- erasure V2 preparation and action orchestration belong to Task 6.
select is(pg_temp.ev('wh-paused','subscription.active','paused',18,attempt=>(select attempt_id from second_webhook_attempt),sub=>'wh-sub-2',checkout=>'wh-checkout-2'),'applied','unsupported paused expires fail-closed');
select is((select polar_subscription_id from private.venue_billing_entitlements where venue_id='e5000000-0000-4000-8000-000000000606'),'wh-sub-2','paused does not release nonterminal provider binding');
select throws_ok($$select public.reserve_venue_billing_checkout('e5000000-0000-4000-8000-000000000606','month',null)$$,'P0001','VENUE_BILLING_PENDING','paused subscription cannot authorize a duplicate checkout');
select is(pg_temp.ev('wh-terminal-2','subscription.revoked','canceled',19,attempt=>(select attempt_id from second_webhook_attempt),sub=>'wh-sub-2',checkout=>'wh-checkout-2'),'applied','terminal releases paused binding');
create temporary table unbound_erased_attempt as select * from public.reserve_venue_billing_checkout('e5000000-0000-4000-8000-000000000606','month',null);
insert into private.polar_account_erasure_cleanup(actor_id) values('e5000000-0000-4000-8000-000000000295');
update public.profiles set deleted_at=now() where id='e5000000-0000-4000-8000-000000000295';
update public.venues set archived_at=now(),archived_by=owner_id where owner_id='e5000000-0000-4000-8000-000000000295';
update private.venue_billing_entitlements set status='expired',grace_started_at=null,grace_expires_at=null,polar_customer_id=null,polar_subscription_id=null,last_paid_order_id=null,last_paid_order_at=null,last_webhook_id=null where venue_id='e5000000-0000-4000-8000-000000000606';
update private.venue_billing_checkout_attempts set state='failed',erased_at=now(),closed_at=now(),polar_checkout_id=null,checkout_expires_at=null,polar_organization_id=null,polar_product_id=null,polar_product_price_id=null,amount=null,currency=null,interval_count=null,external_customer_id=null where owner_id='e5000000-0000-4000-8000-000000000295';
select is((select erased_product_id from private.venue_billing_checkout_attempts where id=(select attempt_id from webhook_attempt)),'wh-prod','erasure trigger retains known product binding');
select is((select erased_product_id from private.venue_billing_checkout_attempts where id=(select attempt_id from unbound_erased_attempt)),null,'never-attached marker has no invented product binding');
select throws_ok($$select pg_temp.ev('wh-erased-wrong-product',prod=>'wrong')$$,'P0001','INVALID_TRANSITION','known erased marker rejects mismatched product');
select is(pg_temp.ev('wh-erased-late',version=>20),'erasure_cleanup_required','late erased callback grants nothing and remains actionable');
select is(pg_temp.ev('wh-erased-late',version=>20),'erasure_cleanup_required','pending cleanup redelivery does not become inert duplicate');
select is(pg_temp.ev('wh-erased-unbound',version=>20,attempt=>(select attempt_id from unbound_erased_attempt),sub=>'late-unbound-sub',checkout=>'late-unbound-checkout'),'erasure_cleanup_required','late never-attached subscription triggers owner cleanup');
select is((select status::text from private.venue_billing_entitlements where venue_id='e5000000-0000-4000-8000-000000000606'),'expired','erased callbacks never revive entitlement');
select public.complete_polar_account_erasure_cleanup('e5000000-0000-4000-8000-000000000295',null,(select cleanup_token from private.polar_account_erasure_cleanup where actor_id='e5000000-0000-4000-8000-000000000295'));
select is((select outcome::text from private.polar_webhook_events where webhook_id='wh-erased-late'),'erasure_cleanup_complete','completion atomically finishes late receipts');
select is((select count(*) from private.polar_webhook_events where venue_id='e5000000-0000-4000-8000-000000000606' and (polar_subscription_id is not null or customer_id is not null or external_customer_id is not null or product_id is not null)),0::bigint,'cleanup scrubs all receipt provider context');
select is(pg_temp.ev('wh-erased-revoked','subscription.revoked','canceled',21,owner=>null),'erasure_cleanup_complete','signed null-external revoked after cleanup acknowledges without another cleanup');
select throws_ok($$select pg_temp.ev('wh-erased-active-null',owner=>null)$$,'P0001','VALIDATION_FAILED','null identity cannot grant entitlement');
select * from finish();
rollback;
