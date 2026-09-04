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
insert into public.groups(id,slug,name,owner_id,visibility,lifecycle,description,activated_at)
values('fa000000-0000-4000-8000-000000000030','hardening-private-group','Hardening private group',
  'fa000000-0000-4000-8000-000000000001','unlisted','active','Synthetic group for authorization checks',now());
insert into public.group_memberships(group_id,user_id,role,status) values
('fa000000-0000-4000-8000-000000000030','fa000000-0000-4000-8000-000000000001','owner','active'),
('fa000000-0000-4000-8000-000000000030','fa000000-0000-4000-8000-000000000002','member','active');
insert into public.events(id,created_by,host_user_id,match_id,title,description,expected_activity,cost_description,event_rules,commercial_affiliation,
  host_presence_confirmed_at,starts_at,ends_at,place_kind,audience,audience_group_id,organizing_group_id,capacity,requires_approval,status,published_at)
select id,'fa000000-0000-4000-8000-000000000001','fa000000-0000-4000-8000-000000000001','fa000000-0000-4000-8000-000000000013',
  title,'Synthetic private watch event.','Watch football','Free','Respect everyone','None',now(),starts_at,ends_at,'home',
  case when id in ('fa000000-0000-4000-8000-000000000026','fa000000-0000-4000-8000-000000000027') then 'group' else 'invite_only' end::public.event_audience,
  case when id in ('fa000000-0000-4000-8000-000000000026','fa000000-0000-4000-8000-000000000027') then 'fa000000-0000-4000-8000-000000000030'::uuid end,
  case when id in ('fa000000-0000-4000-8000-000000000026','fa000000-0000-4000-8000-000000000027') then 'fa000000-0000-4000-8000-000000000030'::uuid end,
  8,true,'published',now()
from (values
  ('fa000000-0000-4000-8000-000000000021'::uuid,'Before kickoff',now()+interval '1 day',now()+interval '1 day 3 hours'),
  ('fa000000-0000-4000-8000-000000000022'::uuid,'During match',now()-interval '30 minutes',now()+interval '2 hours'),
  ('fa000000-0000-4000-8000-000000000023'::uuid,'Elapsed match',now()-interval '1 day',now()-interval '21 hours'),
  ('fa000000-0000-4000-8000-000000000024'::uuid,'Exact kickoff',now()+interval '1 day',now()+interval '1 day 3 hours'),
  ('fa000000-0000-4000-8000-000000000025'::uuid,'Cancelled private match',now()+interval '1 day',now()+interval '1 day 3 hours'),
  ('fa000000-0000-4000-8000-000000000026'::uuid,'During group match',now()-interval '30 minutes',now()+interval '2 hours'),
  ('fa000000-0000-4000-8000-000000000027'::uuid,'Elapsed group match',now()-interval '1 day',now()-interval '21 hours')
) fixtures(id,title,starts_at,ends_at);
insert into public.event_private_locations(event_id,address_text,location)
select id,'Synthetic test address, not a real home',st_setsrid(st_makepoint(34.8,32.1),4326)::geography
from public.events where id between 'fa000000-0000-4000-8000-000000000021' and 'fa000000-0000-4000-8000-000000000027';
insert into public.event_invitations(event_id,invitee_id,invited_by,status,responded_at)
select id,'fa000000-0000-4000-8000-000000000002','fa000000-0000-4000-8000-000000000001','accepted',now()
from public.events where id between 'fa000000-0000-4000-8000-000000000021' and 'fa000000-0000-4000-8000-000000000027';
insert into public.event_attendance(event_id,user_id,status,source,reviewed_at,reviewed_by)
select id,'fa000000-0000-4000-8000-000000000002','approved','direct_invite',now(),'fa000000-0000-4000-8000-000000000001'
from public.events where id between 'fa000000-0000-4000-8000-000000000021' and 'fa000000-0000-4000-8000-000000000027';
update public.events set status='cancelled',cancelled_at=now(),cancel_reason='Synthetic cancellation'
where id='fa000000-0000-4000-8000-000000000025';

select set_config('request.jwt.claim.sub','fa000000-0000-4000-8000-000000000002',true);
set local role authenticated;
select is((select count(*) from public.get_event_summary('fa000000-0000-4000-8000-000000000021')),1::bigint,'approved attendee sees the event before kickoff');
select is((select count(*) from public.get_event_summary('fa000000-0000-4000-8000-000000000022')),1::bigint,'approved attendee keeps the event during the match');
select is((select count(*) from public.get_event_summary('fa000000-0000-4000-8000-000000000023')),1::bigint,'approved attendee can reopen their elapsed event summary');
select is((select status from public.get_event_summary('fa000000-0000-4000-8000-000000000023')),'completed','elapsed summary agrees with closed history presentation');
select is((select count(*) from public.list_my_events('history',20,0) where event_id='fa000000-0000-4000-8000-000000000023'),1::bigint,'elapsed published attendance enters history without a completion job');
select is((select status from public.list_my_events('history',20,0) where event_id='fa000000-0000-4000-8000-000000000023'),'completed','elapsed published history uses completed presentation');
select is((select count(*) from public.list_my_events('upcoming',20,0) where event_id='fa000000-0000-4000-8000-000000000022'),1::bigint,'in-progress attendance stays reachable in My Huddle');
select is((select status from public.get_event_summary('fa000000-0000-4000-8000-000000000025')),'cancelled','approved private attendee retains a cancelled summary');
select is((select status from public.list_my_events('history',20,0) where event_id='fa000000-0000-4000-8000-000000000025'),'cancelled','cancelled private attendance remains in history');
select is((select count(*) from public.get_event_summary('fa000000-0000-4000-8000-000000000026')),1::bigint,'active group member retains in-progress summary');
select is((select count(*) from public.list_my_events('history',20,0) where event_id='fa000000-0000-4000-8000-000000000027'),1::bigint,'active group member retains completed history');
reset role;
select ok(private.actor_can_read_private_event_location('fa000000-0000-4000-8000-000000000022','fa000000-0000-4000-8000-000000000002'),'current approved attendee may reveal in-progress home location');
select ok(not private.actor_can_read_private_event_location('fa000000-0000-4000-8000-000000000023','fa000000-0000-4000-8000-000000000002'),'history never extends exact home-location lifetime');
select ok(not private.actor_can_read_private_event_location('fa000000-0000-4000-8000-000000000025','fa000000-0000-4000-8000-000000000002'),'cancelled summary never reveals the home location');
select ok(private.actor_can_read_private_event_location('fa000000-0000-4000-8000-000000000026','fa000000-0000-4000-8000-000000000002'),'active approved group member retains in-progress location');
-- A single statement keeps the equality boundary exact without sleeps or clock mocking.
create function pg_temp.retains_at_exact_kickoff() returns boolean language plpgsql as $boundary$
begin
  update public.events set starts_at=statement_timestamp() where id='fa000000-0000-4000-8000-000000000024';
  return (select starts_at=statement_timestamp() from public.events where id='fa000000-0000-4000-8000-000000000024')
    and (select count(*)=1 from public.get_event_summary('fa000000-0000-4000-8000-000000000024'))
    and (select count(*)=1 from public.list_my_events('upcoming',20,0) where event_id='fa000000-0000-4000-8000-000000000024')
    and private.actor_can_read_private_event_location('fa000000-0000-4000-8000-000000000024','fa000000-0000-4000-8000-000000000002')
    and not private.event_is_visible_to_actor('fa000000-0000-4000-8000-000000000024','fa000000-0000-4000-8000-000000000003');
end;
$boundary$;
select ok(pg_temp.retains_at_exact_kickoff(),'exact kickoff retains approved access and upcoming entry without admitting an outsider');
select set_config('request.jwt.claim.sub','fa000000-0000-4000-8000-000000000003',true);
set local role authenticated;
select is((select count(*) from public.get_event_summary('fa000000-0000-4000-8000-000000000022')),0::bigint,'unrelated viewer cannot use participant retention');
select is((select count(*) from public.get_event_summary('fa000000-0000-4000-8000-000000000025')),0::bigint,'unrelated viewer cannot read cancelled private history');
reset role;
insert into public.user_blocks(blocker_id,blocked_id)
values('fa000000-0000-4000-8000-000000000001','fa000000-0000-4000-8000-000000000002');
select set_config('request.jwt.claim.sub','fa000000-0000-4000-8000-000000000002',true);
set local role authenticated;
select is((select count(*) from public.get_event_summary('fa000000-0000-4000-8000-000000000022')),0::bigint,'block revokes in-progress private summary despite retained approved attendance');
select is((select count(*) from public.list_my_events('history',20,0) where event_id in ('fa000000-0000-4000-8000-000000000023','fa000000-0000-4000-8000-000000000025')),0::bigint,'block removes elapsed and cancelled private history cards');
reset role;
select ok(not private.actor_can_read_private_event_location('fa000000-0000-4000-8000-000000000022','fa000000-0000-4000-8000-000000000002'),'block immediately revokes in-progress protected location');
delete from public.user_blocks where blocker_id='fa000000-0000-4000-8000-000000000001' and blocked_id='fa000000-0000-4000-8000-000000000002';
update public.profiles set fan_enabled_at=null where id='fa000000-0000-4000-8000-000000000002';
set local role authenticated;
select is((select count(*) from public.get_event_summary('fa000000-0000-4000-8000-000000000022')),0::bigint,'loss of Fan eligibility revokes retained private summary');
reset role;
select ok(not private.actor_can_read_private_event_location('fa000000-0000-4000-8000-000000000022','fa000000-0000-4000-8000-000000000002'),'loss of Fan eligibility revokes protected location');
update public.profiles set fan_enabled_at=now(),suspended_at=now() where id='fa000000-0000-4000-8000-000000000002';
set local role authenticated;
select is((select count(*) from public.get_event_summary('fa000000-0000-4000-8000-000000000025')),0::bigint,'suspended attendee cannot recover cancelled private summary');
reset role;
update public.profiles set suspended_at=null where id='fa000000-0000-4000-8000-000000000002';
update public.group_memberships set status='left' where group_id='fa000000-0000-4000-8000-000000000030' and user_id='fa000000-0000-4000-8000-000000000002';
set local role authenticated;
select is((select count(*) from public.get_event_summary('fa000000-0000-4000-8000-000000000026')),0::bigint,'leaving the audience group revokes in-progress summary');
select is((select count(*) from public.list_my_events('history',20,0) where event_id='fa000000-0000-4000-8000-000000000027'),0::bigint,'leaving the audience group revokes completed history');
reset role;
select ok(not private.actor_can_read_private_event_location('fa000000-0000-4000-8000-000000000026','fa000000-0000-4000-8000-000000000002'),'leaving audience group revokes the protected location');
update public.group_memberships set status='active' where group_id='fa000000-0000-4000-8000-000000000030' and user_id='fa000000-0000-4000-8000-000000000002';
insert into public.group_bans(group_id,user_id,banned_by,reason)
values('fa000000-0000-4000-8000-000000000030','fa000000-0000-4000-8000-000000000002','fa000000-0000-4000-8000-000000000001','Synthetic ban');
set local role authenticated;
select is((select count(*) from public.get_event_summary('fa000000-0000-4000-8000-000000000026')),0::bigint,'group ban overrides a retained active membership row');
reset role;
select ok(not private.actor_can_read_private_event_location('fa000000-0000-4000-8000-000000000026','fa000000-0000-4000-8000-000000000002'),'group ban independently revokes protected location');
update public.event_attendance set status='removed',removed_at=now(),removed_by='fa000000-0000-4000-8000-000000000001',removal_reason='Fixture removal'
where event_id='fa000000-0000-4000-8000-000000000022' and user_id='fa000000-0000-4000-8000-000000000002';
select set_config('request.jwt.claim.sub','fa000000-0000-4000-8000-000000000002',true);
set local role authenticated;
select is((select count(*) from public.get_event_summary('fa000000-0000-4000-8000-000000000022')),0::bigint,'removal revokes the new during-event exception');
reset role;
update public.event_attendance set status='removed',removed_at=now(),removed_by='fa000000-0000-4000-8000-000000000001',removal_reason='Fixture removal'
where event_id='fa000000-0000-4000-8000-000000000025' and user_id='fa000000-0000-4000-8000-000000000002';
set local role authenticated;
select is((select count(*) from public.get_event_summary('fa000000-0000-4000-8000-000000000025')),0::bigint,'removed attendee cannot use cancelled private summary retention');
select is((select count(*) from public.list_my_events('history',20,0) where event_id='fa000000-0000-4000-8000-000000000025'),0::bigint,'removed attendee cannot use cancelled private history retention');
reset role;
select set_config('request.jwt.claim.sub','fa000000-0000-4000-8000-000000000001',true);
set local role authenticated;
select is((select count(*) from public.list_my_events('history',20,0) where event_id='fa000000-0000-4000-8000-000000000023'),1::bigint,'host also sees elapsed published history');
reset role;
update public.profiles set deleted_at=now(),handle=null,display_name='Deleted account',fan_enabled_at=null,profile_completed_at=null
where id='fa000000-0000-4000-8000-000000000001';
select ok(not private.actor_manages_event('fa000000-0000-4000-8000-000000000021','fa000000-0000-4000-8000-000000000001'),'tombstoned actor loses personal-host authority immediately');
set local role authenticated;
select is((select count(*) from public.get_event_summary('fa000000-0000-4000-8000-000000000021')),0::bigint,'surviving erased-host JWT cannot read private event summary');
reset role;
select * from finish();
rollback;
