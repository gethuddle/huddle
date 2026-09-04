begin;
create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public, pg_catalog;
select no_plan();

-- Distinct transactional fixtures: never inspect or modify acceptance accounts.
insert into auth.users(instance_id,id,aud,role,email,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
select '00000000-0000-0000-0000-000000000000',('fb030000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,
  'authenticated','authenticated','identifier-303-'||n||'@example.test',
  case when n=4 then null else now() end,'{}','{}',now(),now()
from generate_series(1,6) n;
update public.profiles set handle='identifier_303_'||right(id::text,1),display_name='Identifier fixture',
  adult_attested_at=now(),rules_version=private.current_rules_version(),rules_accepted_at=now(),
  profile_completed_at=now(),fan_enabled_at=now()
where id in ('fb030000-0000-4000-8000-000000000001','fb030000-0000-4000-8000-000000000002','fb030000-0000-4000-8000-000000000003');
update public.profiles set deleted_at=now(),display_name='Deleted account'
where id='fb030000-0000-4000-8000-000000000005';
insert into public.venues(id,owner_id,slug,name,address_text,location,description) values
('fb030000-0000-4000-8000-000000000201','fb030000-0000-4000-8000-000000000001','identifier-303-own','Identifier own venue','Synthetic venue address',st_setsrid(st_makepoint(34.8,32.1),4326)::geography,'Synthetic identifier test venue.'),
('fb030000-0000-4000-8000-000000000202','fb030000-0000-4000-8000-000000000002','identifier-303-taken','Identifier other venue','Synthetic venue address',st_setsrid(st_makepoint(34.8,32.1),4326)::geography,'Synthetic identifier test venue.');
insert into public.venue_memberships(venue_id,user_id,role,status)
values('fb030000-0000-4000-8000-000000000201','fb030000-0000-4000-8000-000000000003','admin','active');

select has_function('public','is_profile_handle_available',array['text'],'authenticated handle availability RPC exists');
select has_function('public','is_venue_slug_available',array['text','uuid'],'authorized venue-slug availability RPC exists');
select has_function('public','create_venue_workspace_auto',array['text','text','numeric','numeric','text','text','integer','text[]','text','text','boolean','boolean','boolean','integer','uuid'],'automatic venue activation RPC exists without a slug argument');

select set_config('request.jwt.claim.sub','fb030000-0000-4000-8000-000000000001',true);
set local role authenticated;
select is(public.is_profile_handle_available('  IDENTIFIER_303_1  '),true,'own handle remains available after trimming and lowercasing');
select is(public.is_profile_handle_available('identifier_303_2'),false,'another account handle is unavailable');
select is(public.is_profile_handle_available('identifier_303_unused'),true,'unused valid handle is available');
select is(pg_typeof(public.is_profile_handle_available('identifier_303_unused'))::text,'boolean','handle lookup returns only availability, never an identity object');
select throws_ok($$select public.is_profile_handle_available('ab')$$,'P0001','VALIDATION_FAILED','short handle is rejected');
select throws_ok($$select public.is_profile_handle_available(repeat('a',31))$$,'P0001','VALIDATION_FAILED','oversized handle is rejected');
select throws_ok($$select public.is_profile_handle_available('invalid-handle')$$,'P0001','VALIDATION_FAILED','handle punctuation is rejected');
select throws_ok($$select public.is_profile_handle_available(null)$$,'P0001','VALIDATION_FAILED','null handle is rejected');

select is(public.is_venue_slug_available('  IDENTIFIER-303-OWN  ','fb030000-0000-4000-8000-000000000201'),true,'own venue slug is available after normalization');
select is(public.is_venue_slug_available('identifier-303-taken','fb030000-0000-4000-8000-000000000201'),false,'another venue slug is unavailable');
select is(public.is_venue_slug_available('identifier-303-unused','fb030000-0000-4000-8000-000000000201'),true,'owner may check an unused venue slug');
select is(pg_typeof(public.is_venue_slug_available('identifier-303-unused','fb030000-0000-4000-8000-000000000201'))::text,'boolean','venue lookup returns only availability, never venue metadata');
select throws_ok($$select public.is_venue_slug_available('ab','fb030000-0000-4000-8000-000000000201')$$,'P0001','VALIDATION_FAILED','short venue slug is rejected');
select throws_ok($$select public.is_venue_slug_available(repeat('a',61),'fb030000-0000-4000-8000-000000000201')$$,'P0001','VALIDATION_FAILED','oversized venue slug is rejected');
select throws_ok($$select public.is_venue_slug_available('invalid_slug','fb030000-0000-4000-8000-000000000201')$$,'P0001','VALIDATION_FAILED','venue slug underscores are rejected');
select throws_ok($$select public.is_venue_slug_available('-invalid','fb030000-0000-4000-8000-000000000201')$$,'P0001','VALIDATION_FAILED','leading venue slug separator is rejected');
select throws_ok($$select public.is_venue_slug_available('invalid--slug','fb030000-0000-4000-8000-000000000201')$$,'P0001','VALIDATION_FAILED','repeated venue slug separators are rejected');
select throws_ok($$select public.is_venue_slug_available('identifier-303-unused',null)$$,'P0001','NOT_ALLOWED','slug availability requires an authorized target venue');
select throws_ok($$select public.is_venue_slug_available('identifier-303-unused','fb030000-0000-4000-8000-000000000202')$$,'P0001','NOT_ALLOWED','owner cannot check slugs against another owner target');
reset role;

select ok(not has_function_privilege('anon','public.is_profile_handle_available(text)','execute'),'anonymous signup cannot enumerate handles through availability');
select ok(not has_function_privilege('anon','public.is_venue_slug_available(text,uuid)','execute'),'anonymous visitors cannot enumerate venue slugs through availability');
select ok(not has_function_privilege('anon','public.create_venue_workspace_auto(text,text,numeric,numeric,text,text,integer,text[],text,text,boolean,boolean,boolean,integer,uuid)','execute'),'anonymous visitors cannot create automatic venue workspaces');

select set_config('request.jwt.claim.sub','fb030000-0000-4000-8000-000000000003',true);
set local role authenticated;
select is(public.is_venue_slug_available('identifier-303-own','fb030000-0000-4000-8000-000000000201'),true,'active venue admin may check the current venue slug');
reset role;
update public.venue_memberships set status='revoked',revoked_at=now()
where venue_id='fb030000-0000-4000-8000-000000000201' and user_id='fb030000-0000-4000-8000-000000000003';
set local role authenticated;
select throws_ok($$select public.is_venue_slug_available('identifier-303-own','fb030000-0000-4000-8000-000000000201')$$,'P0001','NOT_ALLOWED','revoked admin cannot use the old JWT for slug lookup');
reset role;
select set_config('request.jwt.claim.sub','fb030000-0000-4000-8000-000000000004',true);
set local role authenticated;
select throws_ok($$select public.is_profile_handle_available('identifier_303_unused')$$,'P0001','EMAIL_NOT_VERIFIED','unverified signup cannot enumerate handles');
select throws_ok($$select * from public.create_venue_workspace_auto('Identifier303 Stadium','Synthetic venue address',34.8,32.1,'Synthetic venue description','Main screen',20,'{}','Respect others','reservations',true,true,true,1,null)$$,'P0001','EMAIL_NOT_VERIFIED','automatic venue creation still requires verified email');
reset role;
select set_config('request.jwt.claim.sub','fb030000-0000-4000-8000-000000000005',true);
set local role authenticated;
select throws_ok($$select public.is_profile_handle_available('identifier_303_unused')$$,'P0001','AUTH_REQUIRED','erased-account JWT cannot enumerate handles');
select throws_ok($$select * from public.create_venue_workspace_auto('Identifier303 Stadium','Synthetic venue address',34.8,32.1,'Synthetic venue description','Main screen',20,'{}','Respect others','reservations',true,true,true,1,null)$$,'P0001','AUTH_REQUIRED','surviving erased-account JWT cannot create a venue');
reset role;

-- Automatic naming preserves the original v2 validation, owner and inactive-billing contract.
select set_config('request.jwt.claim.sub','fb030000-0000-4000-8000-000000000006',true);
update public.profiles set suspended_at=now() where id='fb030000-0000-4000-8000-000000000006';
set local role authenticated;
select throws_ok($$select * from public.create_venue_workspace_auto('Identifier303 Stadium','Synthetic venue address',34.8,32.1,'Synthetic venue description','Main screen',20,'{}','Respect others','reservations',true,true,true,1,null)$$,'P0001','ACCOUNT_SUSPENDED','suspension blocks automatic creation before any venue is written');
reset role;
update public.profiles set suspended_at=null where id='fb030000-0000-4000-8000-000000000006';
set local role authenticated;
select is(public.is_profile_handle_available('identifier_303_unused'),true,'verified account may check a handle before Fan activation');
select throws_ok($$select * from public.create_venue_workspace_auto('Identifier303 Stadium','Synthetic venue address',34.8,32.1,'Synthetic venue description','Main screen',20,'{}','Respect others','reservations',true,false,true,1,null)$$,'P0001','ADULT_ATTESTATION_REQUIRED','automatic naming does not bypass adult attestation');
select throws_ok($$select * from public.create_venue_workspace_auto('Identifier303 Stadium','Synthetic venue address',34.8,32.1,'Synthetic venue description','Main screen',20,'{}','Respect others','reservations',true,true,false,1,null)$$,'P0001','REPRESENTATION_ATTESTATION_REQUIRED','automatic naming does not bypass business representation attestation');
select throws_ok($$select * from public.create_venue_workspace_auto('Identifier303 Stadium','Synthetic venue address',34.8,32.1,'Synthetic venue description','Main screen',20,'{}','Respect others','reservations',true,true,true,0,null)$$,'P0001','RULES_ACCEPTANCE_REQUIRED','automatic naming requires current community rules');
select throws_ok($$select * from public.create_venue_workspace_auto('Identifier303 Stadium','Synthetic venue address',0,0,'Synthetic venue description','Main screen',20,'{}','Respect others','reservations',true,true,true,1,null)$$,'P0001','VALIDATION_FAILED','automatic naming retains Israel coordinate validation');
select throws_ok($$select * from public.create_venue_workspace_auto('Identifier303 Stadium','Synthetic venue address',34.8,32.1,'Synthetic venue description','Main screen',20,'{}','Respect others','open_door',false,true,true,1,null)$$,'P0001','VALIDATION_FAILED','automatic naming does not invent open-door capacity');
create temporary table auto_created as
select * from public.create_venue_workspace_auto('  Identifier303 Stadium!!!  ','Synthetic venue address',34.8,32.1,'Synthetic venue description','Main screen',20,'{}','Respect others','reservations',true,true,true,1,null);
select is((select slug from auto_created),'identifier303-stadium','automatic slug normalizes the venue name without a caller slug');
select is((select verification_status from auto_created),'unverified','automatic activation retains visible unverified status');
select is((select slug from public.create_venue_workspace_auto('Identifier303 Stadium','Synthetic venue address',34.8,32.1,'Synthetic venue description','Main screen',20,'{}','Respect others','reservations',true,true,true,1,null)),'identifier303-stadium-2','first name collision receives suffix two');
select is((select slug from public.create_venue_workspace_auto('Identifier303 Stadium','Synthetic venue address',34.8,32.1,'Synthetic venue description','Main screen',null,'{}','Respect others','open_door',false,true,true,1,null)),'identifier303-stadium-3','next name collision receives suffix three and open door remains supported');
select is((select slug from public.create_venue_workspace_auto(repeat('A',60),'Synthetic venue address',34.8,32.1,'Synthetic venue description','Main screen',20,'{}','Respect others','reservations',true,true,true,1,null)),repeat('a',52),'automatic base reserves suffix room by truncating at 52 characters');
reset role;
select ok((select profile.handle is null and profile.fan_enabled_at is null and profile.profile_completed_at is null
  from public.profiles profile where id='fb030000-0000-4000-8000-000000000006'),'Venue-only automatic activation never publishes or activates a Fan identity');
select is((select count(*) from public.venues where owner_id='fb030000-0000-4000-8000-000000000006'),4::bigint,'failed automatic creates leave no partial venues');
select ok((select bool_and(entitlement.status='inactive' and entitlement.polar_customer_id is null and entitlement.polar_subscription_id is null)
  from private.venue_billing_entitlements entitlement join public.venues venue on venue.id=entitlement.venue_id
  where venue.owner_id='fb030000-0000-4000-8000-000000000006'),'automatic creation seeds only inactive unbound demo entitlements');
select ok((select bool_and(membership.role='owner' and membership.status='active' and membership.user_id=venue.owner_id)
  from public.venue_memberships membership join public.venues venue on venue.id=membership.venue_id
  where venue.owner_id='fb030000-0000-4000-8000-000000000006'),'automatic creation grants only the requesting account ownership');
select ok((select bool_and(venue.business_representation_attested_by=venue.owner_id and venue.business_representation_attested_at is not null)
  from public.venues venue where venue.owner_id='fb030000-0000-4000-8000-000000000006'),'business attestation remains bound to the authenticated owner');
select ok((select bool_and(not private.venue_allows_public_presence(venue.id,statement_timestamp()))
  from public.venues venue where venue.owner_id='fb030000-0000-4000-8000-000000000006'),'name generation never grants public visibility or publishing');

-- The fallback is tested against an occupied base so the test is independent of ordinary venue slugs.
insert into public.venues(id,owner_id,slug,name,address_text,location,description)
select 'fb030000-0000-4000-8000-000000000203','fb030000-0000-4000-8000-000000000001','venue','Fallback fixture','Synthetic venue address',st_setsrid(st_makepoint(34.8,32.1),4326)::geography,'Synthetic fallback collision fixture.'
where not exists(select 1 from public.venues where slug='venue');
select set_config('request.jwt.claim.sub','fb030000-0000-4000-8000-000000000006',true);
set local role authenticated;
select matches((select slug from public.create_venue_workspace_auto('מקום צפייה','Synthetic venue address',34.8,32.1,'Synthetic venue description','Main screen',20,'{}','Respect others','reservations',true,true,true,1,null)),'^venue-[0-9]+$','non-ASCII name safely falls back to a collision-resistant venue base');
reset role;
select * from finish();
rollback;
