begin;
create extension if not exists pgtap with schema extensions;
set local search_path=extensions,public,pg_catalog;
select no_plan();

create function pg_temp.id(n integer) returns uuid language sql as $$
 select ('ea000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid;
$$;
insert into auth.users(instance_id,id,aud,role,email,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
values('00000000-0000-0000-0000-000000000000',pg_temp.id(1),'authenticated','authenticated','integrated-billing@example.test',now(),'{}','{}',now(),now());
update public.profiles set adult_attested_at=now(),rules_version=private.current_rules_version(),rules_accepted_at=now() where id=pg_temp.id(1);
insert into public.venues(id,owner_id,slug,name,address_text,location,description)
select pg_temp.id(100+n),pg_temp.id(1),'integrated-billing-'||n,'Integrated Venue','Test address',
 st_setsrid(st_makepoint(34.998,32.812),4326)::geography,'Synthetic integrated regression venue.' from generate_series(1,7) n;
select set_config('request.jwt.claim.sub',pg_temp.id(1)::text,true);
create temporary table attempts(n integer,attempt_id uuid);
insert into attempts select n,(public.reserve_venue_billing_checkout(pg_temp.id(100+n),'month',null)).attempt_id from generate_series(1,7) n;
select public.attach_venue_billing_checkout(attempt_id,'checkout-'||n,now()+interval '1 hour','org','product','price',1500,'ils','month',1,pg_temp.id(1)::text,null) from attempts;
delete from private.venue_billing_entitlements where venue_id in (pg_temp.id(102),pg_temp.id(103));
insert into private.venue_billing_entitlements(venue_id,status,grace_started_at,grace_expires_at)
values(pg_temp.id(102),'legacy_grace',now(),now()+interval '168 hours'),(pg_temp.id(103),'expired',null,null);

-- Signed scalar ingress, not direct entitlement setup, establishes all activation
-- and version authority below. Object clocks intentionally differ.
create function pg_temp.ev(n integer,w text,t text default 'subscription.active',s text default 'active',v integer default 0,c boolean default false,days integer default 30,ord text default null,sv integer default null,reconcile boolean default false)
returns text language plpgsql as $$
declare answer text;
begin
 select outcome::text into answer from public.apply_polar_venue_billing_event(
  w,t::public.polar_venue_billing_event_type,now()+v*interval '1 minute',now()+v*interval '1 minute',
  'org','sub-'||n,'checkout-'||n,(select attempt_id from attempts where attempts.n=ev.n),pg_temp.id(100+n),'customer',pg_temp.id(1)::text,'product',
  case when reconcile then null else 'price' end,case when reconcile then null else 1500 end,case when reconcile then null else 'ils' end,'month',
  case when reconcile then null else 1 end,case when reconcile then null else s end,case when reconcile then null else c end,
  case when reconcile then null else now()+days*interval '1 day' end,case when s='past_due' then now() else null end,
  ord,case when t='order.paid' then 'subscription_cycle' end,null,case when t='order.paid' then now()+days*interval '1 day' end,
  case when t='order.paid' and sv is not null then now()+sv*interval '1 minute' end);
 return answer;
end $$;

-- I1: cancellation is never initial activation, including legacy and replacement.
select is(pg_temp.ev(n,'cancel-first-'||n,'subscription.canceled','active',0,true),'observed','canceled-first is only observed') from generate_series(1,3) n;
select ok(not private.venue_allows_public_presence(pg_temp.id(100+n),now()),'canceled-first remains hidden and cannot publish') from generate_series(1,3) n;
select ok(not activation_authorized,'canceled-first cannot establish activation authority') from private.venue_billing_checkout_attempts where id in(select attempt_id from attempts where n<=3);
select is((select grace_expires_at from private.venue_billing_entitlements where venue_id=pg_temp.id(102)),now()+interval '168 hours','canceled-first retains legacy deadline');
select is(pg_temp.ev(n,'older-active-after-cancel-'||n,v=>-1),'stale','older activating proof cannot erase the known cancellation cutoff') from generate_series(1,3) n;
select ok(not private.venue_allows_public_presence(pg_temp.id(100+n),now()),'canceled-first plus older active stays deliberately fail closed') from generate_series(1,3) n;
select is(pg_temp.ev(n,'equal-active-after-cancel-'||n,v=>0),'reconciliation_required','equal conflicting activation requires canonical cancellation truth') from generate_series(1,3) n;
select ok(not activation_authorized,'older/equal unresolved active cannot grant authority') from private.venue_billing_checkout_attempts where id in(select attempt_id from attempts where n<=3);
select is(pg_temp.ev(1,'new-created','subscription.created','incomplete',1),'applied','created establishes confirming only');
select is(pg_temp.ev(1,'confirming-canceled','subscription.canceled','active',2,true),'observed','cancellation cannot activate a confirming subscription');
select is((select status::text from private.venue_billing_entitlements where venue_id=pg_temp.id(101)),'confirming','confirming remains non-entitled after cancellation');

-- I3: created may complete a checkout while the subscription is still live.
select is(pg_temp.ev(2,'legacy-created','subscription.created','incomplete',1),'observed','legacy created does not replace grace');
select is(pg_temp.ev(3,'expired-created','subscription.created','incomplete',1),'observed','replacement created does not grant access');
select is(public.get_venue_billing_context(pg_temp.id(100+n))->>'canStartCheckout','false','known incomplete subscription excludes a second checkout') from generate_series(2,3) n;
select is(public.get_venue_billing_context(pg_temp.id(100+n))->>'canOpenPortal','true','known incomplete subscription has owner recovery') from generate_series(2,3) n;
select throws_ok(format('select public.reserve_venue_billing_checkout(%L,''year'',null)',pg_temp.id(100+n)),'P0001','VENUE_BILLING_PENDING','reservation agrees with existing nonterminal binding') from generate_series(2,3) n;
savepoint archived_recovery;
select public.archive_venue(pg_temp.id(102),'Integrated Venue',null);
select is(public.get_archived_venue_billing_context('integrated-billing-2')->>'canOpenPortal','true','closure retains exact-owner portal for the known incomplete subscription');
rollback to savepoint archived_recovery;
savepoint terminal_proof;
select is(pg_temp.ev(n,'terminal-incomplete-'||n,'subscription.revoked','canceled',2),'applied','signed terminal proof releases incomplete subscription') from generate_series(2,3) n;
select is(public.get_venue_billing_context(pg_temp.id(100+n))->>'canStartCheckout','true','terminal proof restores replacement capability') from generate_series(2,3) n;
select ok((public.reserve_venue_billing_checkout(pg_temp.id(100+n),'year',null)).created_by_this_call,'terminal proof permits a fresh generation') from generate_series(2,3) n;
rollback to savepoint terminal_proof;
select is(pg_temp.ev(n,'active-after-created-'||n,v=>3),'applied','the original generation can still activate') from generate_series(1,3) n;
select ok(activation_authorized,'only active establishes activation authority') from private.venue_billing_checkout_attempts where id in(select attempt_id from attempts where n<=3);

-- I2: a later order clock must not make a genuine subscription update stale.
select is(pg_temp.ev(4,'clock-active'),'applied','clock fixture activated by signed active');
select is(pg_temp.ev(4,'clock-order','order.paid',v=>5,days=>60,ord=>'clock-order',sv=>0),'applied','new paid period with unchanged nested subscription version is valid');
select is((select subscription_modified_at from private.venue_billing_entitlements where venue_id=pg_temp.id(104)),now(),'order clock is not a subscription version');
select is(pg_temp.ev(4,'clock-cancel','subscription.canceled',v=>1,c=>true,days=>60),'applied','subscription cancellation between object clocks is not stale');
select is(pg_temp.ev(4,'clock-pastdue','subscription.past_due','past_due',2,days=>60),'applied','subscription failure after renewal is not stale');
select is(pg_temp.ev(4,'clock-stale-order','order.paid',v=>10,days=>90,ord=>'clock-stale-order',sv=>1),'stale','new order time cannot promote stale nested active over later failure');
select is((select status::text from private.venue_billing_entitlements where venue_id=pg_temp.id(104)),'past_due','stale nested active preserves failure');
select is(pg_temp.ev(4,'clock-new-order','order.paid',v=>11,days=>90,ord=>'clock-new-order',sv=>3),'applied','fresh nested active plus paid proof recovers');
select is((select subscription_modified_at from private.venue_billing_entitlements where venue_id=pg_temp.id(104)),now()+interval '3 minutes','accepted nested version persists coherently');
select is(pg_temp.ev(4,'clock-revoked','subscription.revoked','canceled',4,days=>90),'applied','terminal subscription snapshot below order clock remains authoritative');

select is(pg_temp.ev(5,'canonical-active'),'applied','canonical fixture activated');
select is(pg_temp.ev(5,'canonical-order','order.paid',v=>5,days=>60,ord=>'canonical-order',reconcile=>true),'reconciliation_required','incomplete proof grants nothing');
select is(public.complete_polar_venue_billing_reconciliation('canonical-order','sub-5',now(),null,'customer',pg_temp.id(1)::text,'product','price',1500,'ils','month',1,'active',false,now()+interval '60 days',null)::text,'applied','canonical subscription clock independent of signed order');
select is(pg_temp.ev(5,'canonical-failure','subscription.past_due','past_due',1,days=>60),'applied','failure after canonical renewal uses only subscription clock');
select is(pg_temp.ev(5,'equal-version-order','order.paid',v=>9,days=>90,ord=>'equal-version-order',sv=>1),'reconciliation_required','equal conflicting nested state requires canonical resolution');
select is(pg_temp.ev(5,'canonical-stale-order','order.paid',v=>10,days=>90,ord=>'canonical-stale-order',reconcile=>true),'reconciliation_required','new signed order requires canonical inspection');
select is(public.complete_polar_venue_billing_reconciliation('canonical-stale-order','sub-5',now(),null,'customer',pg_temp.id(1)::text,'product','price',1500,'ils','month',1,'active',false,now()+interval '90 days',null)::text,'stale','stale canonical active cannot overwrite later failure');
select is(pg_temp.ev(5,'null-version-order','order.paid',v=>11,days=>90,ord=>'null-version-order'),'reconciliation_required','absent subscription version cannot use the signed order clock');
select is((select status::text from private.venue_billing_entitlements where venue_id=pg_temp.id(105)),'past_due','unknown object version leaves failure closed');

-- I4: two independently committed external operations use different fences.
create temporary table initial_cleanup as select * from public.prepare_account_erasure_v2('DELETE',null);
select ok((select polar_cleanup_required and cleanup_token is not null from initial_cleanup),'prepare captures an opaque cleanup fence');
select is(pg_temp.ev(6,'late-erased-customer'),'erasure_cleanup_required','late creation creates a newer obligation after the earlier external 404');
create temporary table newer_cleanup as select cleanup_token from private.polar_account_erasure_cleanup where actor_id=pg_temp.id(1);
select isnt((select cleanup_token from initial_cleanup),(select cleanup_token from newer_cleanup),'new receipt rotates the fence');
select throws_ok($$select public.complete_polar_account_erasure_cleanup(pg_temp.id(1),null,(select cleanup_token from initial_cleanup))$$,'P0001','INVALID_TRANSITION','older successful delete cannot acknowledge the new customer');
select is((select outcome::text from private.polar_webhook_events where webhook_id='late-erased-customer'),'erasure_cleanup_required','failed late handler remains retryable after stale completion');
select is(pg_temp.ev(6,'late-erased-customer'),'erasure_cleanup_required','same signed retry still asks for external deletion');
select is((select cleanup_token from private.polar_account_erasure_cleanup where actor_id=pg_temp.id(1)),(select cleanup_token from newer_cleanup),'duplicate delivery does not rotate the obligation');
select lives_ok($$select public.complete_polar_account_erasure_cleanup(pg_temp.id(1),null,(select cleanup_token from newer_cleanup))$$,'fresh successful deletion acknowledges current obligations');
select is(pg_temp.ev(6,'late-erased-customer'),'erasure_cleanup_complete','completed retry performs no provider work');
select ok(to_regprocedure('public.complete_polar_account_erasure_cleanup(uuid,uuid)') is null,'unfenced completion overload removed');
select ok(not has_function_privilege('authenticated','public.complete_polar_account_erasure_cleanup(uuid,uuid,uuid)','EXECUTE'),'browser cannot acknowledge cleanup');
select ok(has_function_privilege('service_role','public.complete_polar_account_erasure_cleanup(uuid,uuid,uuid)','EXECUTE'),'service has exact fenced capability');
select col_not_null('private','polar_account_erasure_cleanup','cleanup_token','every cleanup obligation has a non-null fence');
select * from finish();
rollback;
