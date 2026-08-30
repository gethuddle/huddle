begin;

create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public, pg_catalog;

select no_plan();

select has_table('public', 'reports', 'B11 creates confidential reports');
select has_table('public', 'moderation_actions', 'B11 creates auditable moderation actions');
select has_table('public', 'moderation_appeals', 'B11 creates affected-user appeals');
select is(
  (
    select count(*)
    from pg_class as relation
    join pg_namespace as namespace on namespace.oid = relation.relnamespace
    where namespace.nspname = 'public'
      and relation.relkind in ('r', 'p')
      and (not relation.relrowsecurity or not relation.relforcerowsecurity)
  ),
  0::bigint,
  'every exposed application table has RLS enabled and forced'
);
select ok(
  not has_table_privilege('authenticated', 'public.reports', 'select'),
  'authenticated callers cannot bypass the reporter and moderator projections'
);
select ok(
  not has_table_privilege('authenticated', 'public.moderation_actions', 'select'),
  'authenticated callers cannot enumerate moderation actions directly'
);
select ok(
  not has_table_privilege('authenticated', 'public.moderation_appeals', 'select'),
  'authenticated callers cannot enumerate appeals directly'
);
select ok(
  has_function_privilege(
    'authenticated',
    'public.submit_report(text,uuid,text,text,uuid)',
    'execute'
  ),
  'authenticated users may invoke controlled reporting'
);
select ok(
  not has_function_privilege(
    'anon',
    'public.list_moderation_reports(text,integer,integer)',
    'execute'
  ),
  'anonymous callers cannot invoke the platform queue'
);
select is(
  enum_range(null::public.report_category)::text,
  '{immediate_danger,harassment_stalking_sexual_misconduct,hate_discrimination,privacy_exposure,impersonation_fraud,dangerous_illegal_activity,spam_scam,other}',
  'the report categories match the locked contract'
);

insert into auth.users (
  instance_id, id, aud, role, email, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
select
  '00000000-0000-0000-0000-000000000000',
  fixture.id,
  'authenticated',
  'authenticated',
  fixture.email,
  statement_timestamp(),
  '{}'::jsonb,
  '{}'::jsonb,
  statement_timestamp() - interval '30 days',
  statement_timestamp()
from (
  values
    ('b1100000-0000-4000-8000-000000000101'::uuid, 'b11-reporter@example.com'),
    ('b1100000-0000-4000-8000-000000000102'::uuid, 'b11-target@example.com'),
    ('b1100000-0000-4000-8000-000000000103'::uuid, 'b11-group-owner@example.com'),
    ('b1100000-0000-4000-8000-000000000104'::uuid, 'b11-group-admin@example.com'),
    ('b1100000-0000-4000-8000-000000000105'::uuid, 'b11-moderator-one@example.com'),
    ('b1100000-0000-4000-8000-000000000106'::uuid, 'b11-moderator-two@example.com'),
    ('b1100000-0000-4000-8000-000000000107'::uuid, 'b11-unrelated@example.com')
) as fixture(id, email);

update public.profiles
set
  handle = 'b11_user_' || right(id::text, 3),
  display_name = 'B11 User ' || right(id::text, 3),
  city_id = (select id from public.cities where slug = 'haifa'),
  adult_attested_at = statement_timestamp(),
  rules_version = 1,
  rules_accepted_at = statement_timestamp(),
  profile_completed_at = statement_timestamp(),
  fan_enabled_at = statement_timestamp()
where id::text like 'b1100000-%';

insert into public.platform_roles (profile_id, role)
values
  ('b1100000-0000-4000-8000-000000000105', 'moderator'),
  ('b1100000-0000-4000-8000-000000000106', 'moderator');

insert into public.competitions (
  id, sport_id, provider, provider_external_id, code, name, country_name, last_synced_at
)
values (
  'b1100000-0000-4000-8000-000000000401',
  '00000000-0000-4000-8000-000000000020',
  'b11-test', 'competition', 'B11', 'B11 League', 'England', statement_timestamp()
);

insert into public.teams (
  id, sport_id, provider, provider_external_id, name, short_name, tla,
  country_name, last_synced_at
)
values
  (
    'b1100000-0000-4000-8000-000000000402',
    '00000000-0000-4000-8000-000000000020',
    'b11-test', 'home', 'B11 Home FC', 'B11 Home', 'BHM', 'England', statement_timestamp()
  ),
  (
    'b1100000-0000-4000-8000-000000000403',
    '00000000-0000-4000-8000-000000000020',
    'b11-test', 'away', 'B11 Away FC', 'B11 Away', 'BAW', 'England', statement_timestamp()
  );

insert into public.matches (
  id, provider, provider_external_id, competition_id, home_team_id,
  away_team_id, starts_at, status, matchday, season_label, last_synced_at
)
values
  (
    'b1100000-0000-4000-8000-000000000404', 'b11-test', 'future-match',
    'b1100000-0000-4000-8000-000000000401',
    'b1100000-0000-4000-8000-000000000402',
    'b1100000-0000-4000-8000-000000000403',
    statement_timestamp() + interval '7 days', 'timed', 1, '2026', statement_timestamp()
  ),
  (
    'b1100000-0000-4000-8000-000000000405', 'b11-test', 'past-match',
    'b1100000-0000-4000-8000-000000000401',
    'b1100000-0000-4000-8000-000000000402',
    'b1100000-0000-4000-8000-000000000403',
    statement_timestamp() - interval '7 days', 'finished', 2, '2026', statement_timestamp()
  );

insert into public.groups (
  id, slug, name, owner_id, city_id, visibility, lifecycle, description, activated_at
)
values (
  'b1100000-0000-4000-8000-000000000201',
  'b11-group', 'B11 Supporters', 'b1100000-0000-4000-8000-000000000103',
  (select id from public.cities where slug = 'haifa'),
  'discoverable', 'active', 'A discoverable group for B11 confidentiality tests.',
  statement_timestamp()
);

insert into public.group_memberships (group_id, user_id, role, status, reviewed_by, reviewed_at)
values
  (
    'b1100000-0000-4000-8000-000000000201',
    'b1100000-0000-4000-8000-000000000103',
    'owner', 'active', null, null
  ),
  (
    'b1100000-0000-4000-8000-000000000201',
    'b1100000-0000-4000-8000-000000000104',
    'admin', 'active', 'b1100000-0000-4000-8000-000000000103', statement_timestamp()
  );

insert into public.venues (
  id, owner_id, slug, name, city_id, address_text, location,
  description, screen_count, stated_capacity
)
values (
  'b1100000-0000-4000-8000-000000000301',
  'b1100000-0000-4000-8000-000000000102',
  'b11-venue', 'B11 Match Corner',
  (select id from public.cities where slug = 'haifa'),
  '11 Public Street, Haifa',
  extensions.st_setsrid(extensions.st_makepoint(34.999, 32.813), 4326)::extensions.geography,
  'A public business venue for B11 reporting and suspension tests.', 4, 80
);

insert into public.events (
  id, created_by, host_venue_id, match_id, title, description,
  expected_activity, cost_description, event_rules, commercial_affiliation,
  host_presence_confirmed_at, starts_at, ends_at, city_id, place_kind,
  venue_id, audience, capacity, requires_approval, status, published_at
)
values
  (
    'b1100000-0000-4000-8000-000000000501',
    'b1100000-0000-4000-8000-000000000102',
    'b1100000-0000-4000-8000-000000000301',
    'b1100000-0000-4000-8000-000000000404',
    'B11 Future Venue Event', 'A future public venue event that can be reported before kickoff.',
    'Watch together', 'Free', 'Follow the community rules.', 'Venue-hosted',
    statement_timestamp(), statement_timestamp() + interval '7 days',
    statement_timestamp() + interval '7 days 3 hours',
    (select id from public.cities where slug = 'haifa'),
    'venue', 'b1100000-0000-4000-8000-000000000301',
    'public', 30, false, 'published', statement_timestamp()
  ),
  (
    'b1100000-0000-4000-8000-000000000502',
    'b1100000-0000-4000-8000-000000000102',
    'b1100000-0000-4000-8000-000000000301',
    'b1100000-0000-4000-8000-000000000405',
    'B11 Past Venue Event', 'A finished public venue event that remains reportable afterward.',
    'Watched together', 'Free', 'Follow the community rules.', 'Venue-hosted',
    statement_timestamp() - interval '7 days', statement_timestamp() - interval '7 days',
    statement_timestamp() - interval '6 days 21 hours',
    (select id from public.cities where slug = 'haifa'),
    'venue', 'b1100000-0000-4000-8000-000000000301',
    'public', 30, false, 'completed', statement_timestamp() - interval '8 days'
  );

insert into public.friendships (
  user_low_id, user_high_id, requested_by, status, responded_at
)
values (
  'b1100000-0000-4000-8000-000000000101',
  'b1100000-0000-4000-8000-000000000102',
  'b1100000-0000-4000-8000-000000000101',
  'accepted', statement_timestamp()
);

insert into public.events (
  id, created_by, host_user_id, match_id, title, description,
  expected_activity, cost_description, event_rules, commercial_affiliation,
  host_presence_confirmed_at, starts_at, ends_at, city_id, place_kind,
  audience, capacity, requires_approval, status, published_at
)
values (
  'b1100000-0000-4000-8000-000000000503',
  'b1100000-0000-4000-8000-000000000101',
  'b1100000-0000-4000-8000-000000000101',
  'b1100000-0000-4000-8000-000000000404',
  'B11 Protected Home', 'A protected friends-only event for suspension revocation tests.',
  'Watch together', 'Free', 'Follow the community rules.', 'None',
  statement_timestamp(), statement_timestamp() + interval '7 days',
  statement_timestamp() + interval '7 days 3 hours',
  (select id from public.cities where slug = 'haifa'),
  'home', 'friends', 6, true, 'published', statement_timestamp()
);

insert into public.event_private_locations (event_id, address_text, directions, location)
values (
  'b1100000-0000-4000-8000-000000000503',
  'Protected B11 address', 'Private directions',
  extensions.st_setsrid(extensions.st_makepoint(34.997, 32.811), 4326)::extensions.geography
);

insert into public.event_attendance (
  event_id, user_id, status, source, reviewed_by, reviewed_at
)
values (
  'b1100000-0000-4000-8000-000000000503',
  'b1100000-0000-4000-8000-000000000102',
  'approved', 'self_request',
  'b1100000-0000-4000-8000-000000000101', statement_timestamp()
);

-- Every CHECK, unique, and FK added by B11 receives a direct denial case.
select throws_ok(
  $$update public.profiles set community_restricted_at = statement_timestamp() where id = 'b1100000-0000-4000-8000-000000000107'$$,
  '23514', null, 'profile restriction timestamps remain paired'
);
select throws_ok(
  $$update public.profiles set suspension_expires_at = statement_timestamp() + interval '1 day' where id = 'b1100000-0000-4000-8000-000000000107'$$,
  '23514', null, 'profile suspension expiry requires a suspension start'
);
select throws_ok(
  $$insert into public.reports (reporter_id,target_type,profile_id,group_id,category,details) values ('b1100000-0000-4000-8000-000000000101','profile','b1100000-0000-4000-8000-000000000102','b1100000-0000-4000-8000-000000000201','other','This report has enough bounded detail.')$$,
  '23514', null, 'a report has exactly one target matching its target type'
);
select throws_ok(
  $$insert into public.reports (reporter_id,target_type,profile_id,category,details) values ('b1100000-0000-4000-8000-000000000101','profile','b1100000-0000-4000-8000-000000000102','other','too short')$$,
  '23514', null, 'report details are trimmed and bounded'
);
select throws_ok(
  $$insert into public.reports (reporter_id,target_type,profile_id,category,details,status,assigned_to,resolution_note) values ('b1100000-0000-4000-8000-000000000101','profile','b1100000-0000-4000-8000-000000000102','other','This report has enough bounded detail.','resolved','b1100000-0000-4000-8000-000000000105','short')$$,
  '23514', null, 'report resolution notes are bounded'
);
select throws_ok(
  $$insert into public.reports (reporter_id,target_type,profile_id,category,details,status,assigned_to) values ('b1100000-0000-4000-8000-000000000101','profile','b1100000-0000-4000-8000-000000000102','other','This report has enough bounded detail.','open','b1100000-0000-4000-8000-000000000105')$$,
  '23514', null, 'report status and assignment evidence remain consistent'
);
select throws_ok(
  $$insert into public.reports (reporter_id,target_type,profile_id,category,details) values ('ffffffff-0000-4000-8000-000000000001','profile','b1100000-0000-4000-8000-000000000102','other','This report has enough bounded detail.')$$,
  '23503', null, 'report reporter references a profile'
);
select throws_ok(
  $$insert into public.reports (reporter_id,target_type,profile_id,category,details) values ('b1100000-0000-4000-8000-000000000101','profile','ffffffff-0000-4000-8000-000000000002','other','This report has enough bounded detail.')$$,
  '23503', null, 'profile report target references a profile'
);
select throws_ok(
  $$insert into public.reports (reporter_id,target_type,group_id,category,details) values ('b1100000-0000-4000-8000-000000000101','group','ffffffff-0000-4000-8000-000000000003','other','This report has enough bounded detail.')$$,
  '23503', null, 'group report target references a group'
);
select throws_ok(
  $$insert into public.reports (reporter_id,target_type,venue_id,category,details) values ('b1100000-0000-4000-8000-000000000101','venue','ffffffff-0000-4000-8000-000000000004','other','This report has enough bounded detail.')$$,
  '23503', null, 'venue report target references a venue'
);
select throws_ok(
  $$insert into public.reports (reporter_id,target_type,event_id,category,details) values ('b1100000-0000-4000-8000-000000000101','event','ffffffff-0000-4000-8000-000000000005','other','This report has enough bounded detail.')$$,
  '23503', null, 'event report target references an event'
);
select throws_ok(
  $$insert into public.reports (reporter_id,target_type,profile_id,category,details,status,assigned_to) values ('b1100000-0000-4000-8000-000000000101','profile','b1100000-0000-4000-8000-000000000102','other','This report has enough bounded detail.','reviewing','ffffffff-0000-4000-8000-000000000006')$$,
  '23503', null, 'report assignee references a profile'
);

insert into public.reports (
  id, reporter_id, target_type, profile_id, category, details
)
values (
  'b1100000-0000-4000-8000-000000000601',
  'b1100000-0000-4000-8000-000000000101', 'profile',
  'b1100000-0000-4000-8000-000000000107', 'other',
  'A direct invariant fixture report with enough detail.'
);
select throws_ok(
  $$insert into public.reports (id,reporter_id,target_type,profile_id,category,details) values ('b1100000-0000-4000-8000-000000000601','b1100000-0000-4000-8000-000000000101','profile','b1100000-0000-4000-8000-000000000102','other','A duplicate report identifier must be rejected.')$$,
  '23505', null, 'report identifiers are unique'
);

select throws_ok(
  $$insert into public.moderation_actions (report_id,moderator_id,target_type,profile_id,group_id,action,reason) values ('b1100000-0000-4000-8000-000000000601','b1100000-0000-4000-8000-000000000105','profile','b1100000-0000-4000-8000-000000000107','b1100000-0000-4000-8000-000000000201','warning','A sufficiently detailed reason.')$$,
  '23514', null, 'moderation actions have exactly one matching target'
);
select throws_ok(
  $$insert into public.moderation_actions (report_id,moderator_id,target_type,profile_id,action,reason) values ('b1100000-0000-4000-8000-000000000601','b1100000-0000-4000-8000-000000000105','profile','b1100000-0000-4000-8000-000000000107','warning','short')$$,
  '23514', null, 'moderation action reasons are bounded'
);
select throws_ok(
  $$insert into public.moderation_actions (report_id,moderator_id,target_type,profile_id,action,reason) values ('b1100000-0000-4000-8000-000000000601','b1100000-0000-4000-8000-000000000105','profile','b1100000-0000-4000-8000-000000000107','temporary_suspension','A sufficiently detailed reason.')$$,
  '23514', null, 'timed actions require a future expiry'
);
select throws_ok(
  $$insert into public.moderation_actions (report_id,moderator_id,target_type,profile_id,action,reason,state_before) values ('b1100000-0000-4000-8000-000000000601','b1100000-0000-4000-8000-000000000105','profile','b1100000-0000-4000-8000-000000000107','warning','A sufficiently detailed reason.','[]'::jsonb)$$,
  '23514', null, 'moderation reversal snapshots are bounded JSON objects'
);
select throws_ok(
  $$insert into public.moderation_actions (report_id,moderator_id,target_type,profile_id,action,reason,reversed_by) values ('b1100000-0000-4000-8000-000000000601','b1100000-0000-4000-8000-000000000105','profile','b1100000-0000-4000-8000-000000000107','warning','A sufficiently detailed reason.','b1100000-0000-4000-8000-000000000106')$$,
  '23514', null, 'moderation reversal fields require complete evidence'
);
select throws_ok(
  $$insert into public.moderation_actions (report_id,moderator_id,target_type,profile_id,action,reason) values ('ffffffff-0000-4000-8000-000000000011','b1100000-0000-4000-8000-000000000105','profile','b1100000-0000-4000-8000-000000000107','warning','A sufficiently detailed reason.')$$,
  '23503', null, 'moderation action report references a report'
);
select throws_ok(
  $$insert into public.moderation_actions (report_id,moderator_id,target_type,profile_id,action,reason) values ('b1100000-0000-4000-8000-000000000601','ffffffff-0000-4000-8000-000000000012','profile','b1100000-0000-4000-8000-000000000107','warning','A sufficiently detailed reason.')$$,
  '23503', null, 'moderation action moderator references a profile'
);
select throws_ok(
  $$insert into public.moderation_actions (report_id,moderator_id,target_type,profile_id,action,reason) values ('b1100000-0000-4000-8000-000000000601','b1100000-0000-4000-8000-000000000105','profile','ffffffff-0000-4000-8000-000000000013','warning','A sufficiently detailed reason.')$$,
  '23503', null, 'moderation profile target references a profile'
);
select throws_ok(
  $$insert into public.moderation_actions (report_id,moderator_id,target_type,group_id,action,reason) values ('b1100000-0000-4000-8000-000000000601','b1100000-0000-4000-8000-000000000105','group','ffffffff-0000-4000-8000-000000000014','group_suspension','A sufficiently detailed reason.')$$,
  '23503', null, 'moderation group target references a group'
);
select throws_ok(
  $$insert into public.moderation_actions (report_id,moderator_id,target_type,venue_id,action,reason) values ('b1100000-0000-4000-8000-000000000601','b1100000-0000-4000-8000-000000000105','venue','ffffffff-0000-4000-8000-000000000015','venue_suspension','A sufficiently detailed reason.')$$,
  '23503', null, 'moderation venue target references a venue'
);
select throws_ok(
  $$insert into public.moderation_actions (report_id,moderator_id,target_type,event_id,action,reason) values ('b1100000-0000-4000-8000-000000000601','b1100000-0000-4000-8000-000000000105','event','ffffffff-0000-4000-8000-000000000016','event_cancellation','A sufficiently detailed reason.')$$,
  '23503', null, 'moderation event target references an event'
);
select throws_ok(
  $$insert into public.moderation_actions (report_id,moderator_id,target_type,profile_id,action,reason,reversed_by,reversed_at,reversal_reason) values ('b1100000-0000-4000-8000-000000000601','b1100000-0000-4000-8000-000000000105','profile','b1100000-0000-4000-8000-000000000107','warning','A sufficiently detailed reason.','ffffffff-0000-4000-8000-000000000017',statement_timestamp(),'A sufficiently detailed reversal.')$$,
  '23503', null, 'moderation reverser references a profile'
);

insert into public.moderation_actions (
  id, report_id, moderator_id, target_type, profile_id, action, reason
)
values (
  'b1100000-0000-4000-8000-000000000701',
  'b1100000-0000-4000-8000-000000000601',
  'b1100000-0000-4000-8000-000000000105',
  'profile', 'b1100000-0000-4000-8000-000000000107',
  'warning', 'A direct action fixture with enough reason.'
);
select throws_ok(
  $$insert into public.moderation_actions (id,report_id,moderator_id,target_type,profile_id,action,reason) values ('b1100000-0000-4000-8000-000000000701','b1100000-0000-4000-8000-000000000601','b1100000-0000-4000-8000-000000000106','profile','b1100000-0000-4000-8000-000000000107','warning','A duplicate moderation action identifier must be rejected.')$$,
  '23505', null, 'moderation action identifiers are unique'
);

select throws_ok(
  $$insert into public.moderation_appeals (moderation_action_id,appellant_id,reason) values ('b1100000-0000-4000-8000-000000000701','b1100000-0000-4000-8000-000000000107','short')$$,
  '23514', null, 'appeal reasons are bounded'
);
select throws_ok(
  $$insert into public.moderation_appeals (moderation_action_id,appellant_id,reason,status,reviewed_by,reviewed_at,outcome_reason) values ('b1100000-0000-4000-8000-000000000701','b1100000-0000-4000-8000-000000000107','This appeal has enough bounded detail.','upheld','b1100000-0000-4000-8000-000000000106',statement_timestamp(),'short')$$,
  '23514', null, 'appeal outcome reasons are bounded'
);
select throws_ok(
  $$insert into public.moderation_appeals (moderation_action_id,appellant_id,reason,status,reviewed_by) values ('b1100000-0000-4000-8000-000000000701','b1100000-0000-4000-8000-000000000107','This appeal has enough bounded detail.','open','b1100000-0000-4000-8000-000000000106')$$,
  '23514', null, 'appeal status and review evidence remain consistent'
);
select throws_ok(
  $$insert into public.moderation_appeals (moderation_action_id,appellant_id,reason) values ('ffffffff-0000-4000-8000-000000000021','b1100000-0000-4000-8000-000000000107','This appeal has enough bounded detail.')$$,
  '23503', null, 'appeal action references a moderation action'
);
select throws_ok(
  $$insert into public.moderation_appeals (moderation_action_id,appellant_id,reason) values ('b1100000-0000-4000-8000-000000000701','ffffffff-0000-4000-8000-000000000022','This appeal has enough bounded detail.')$$,
  '23503', null, 'appeal appellant references a profile'
);
select throws_ok(
  $$insert into public.moderation_appeals (moderation_action_id,appellant_id,reason,status,reviewed_by) values ('b1100000-0000-4000-8000-000000000701','b1100000-0000-4000-8000-000000000107','This appeal has enough bounded detail.','reviewing','ffffffff-0000-4000-8000-000000000023')$$,
  '23503', null, 'appeal reviewer references a profile'
);

insert into public.moderation_appeals (
  id, moderation_action_id, appellant_id, reason
)
values (
  'b1100000-0000-4000-8000-000000000801',
  'b1100000-0000-4000-8000-000000000701',
  'b1100000-0000-4000-8000-000000000107',
  'This active appeal fixture has enough bounded detail.'
);
select throws_ok(
  $$insert into public.moderation_appeals (id,moderation_action_id,appellant_id,reason) values ('b1100000-0000-4000-8000-000000000801','b1100000-0000-4000-8000-000000000701','b1100000-0000-4000-8000-000000000106','A duplicate appeal identifier must be rejected with enough detail.')$$,
  '23505', null, 'moderation appeal identifiers are unique'
);
select throws_ok(
  $$insert into public.moderation_appeals (moderation_action_id,appellant_id,reason) values ('b1100000-0000-4000-8000-000000000701','b1100000-0000-4000-8000-000000000107','This duplicate active appeal has enough detail.')$$,
  '23505', null, 'only one active appeal exists per action and appellant'
);
delete from public.moderation_appeals where id = 'b1100000-0000-4000-8000-000000000801';
delete from public.moderation_actions where id = 'b1100000-0000-4000-8000-000000000701';
delete from public.reports where id = 'b1100000-0000-4000-8000-000000000601';

set local role authenticated;
set local "request.jwt.claim.sub" = 'b1100000-0000-4000-8000-000000000101';
select set_config(
  'test.b11_profile_report',
  (
    select report_id::text
    from public.submit_profile_report(
      'b11_user_102', 'harassment_stalking_sexual_misconduct',
      'Repeated unwanted contact tied to this public profile.', null
    )
  ),
  true
);
select set_config(
  'test.b11_group_report',
  (
    select report_id::text
    from public.submit_report(
      'group', 'b1100000-0000-4000-8000-000000000201', 'hate_discrimination',
      'Discriminatory statements appeared in the supporter group.', null
    )
  ),
  true
);
select set_config(
  'test.b11_event_report',
  (
    select report_id::text
    from public.submit_report(
      'event', 'b1100000-0000-4000-8000-000000000501', 'privacy_exposure',
      'The future event description exposed private personal information.', null
    )
  ),
  true
);
select throws_ok(
  $$select * from public.submit_report('venue','b1100000-0000-4000-8000-000000000301','spam_scam','A fourth ordinary report inside the bounded cooldown window.',null)$$,
  'P0001', 'RATE_LIMITED', 'ordinary report spam is bounded under a per-actor lock'
);
select set_config(
  'test.b11_venue_report',
  (
    select report_id::text
    from public.submit_report(
      'venue', 'b1100000-0000-4000-8000-000000000301', 'immediate_danger',
      'There is a credible immediate safety danger at this venue.', null
    )
  ),
  true
);
select is(
  (select count(*) from public.list_my_reports(20, 0)),
  4::bigint,
  'the reporter sees only their own bounded status projection'
);
select ok(
  position(
    'details' in pg_get_function_result('public.list_my_reports(integer,integer)'::regprocedure)
  ) = 0
  and position(
    'resolution_note' in pg_get_function_result('public.list_my_reports(integer,integer)'::regprocedure)
  ) = 0,
  'the reporter projection structurally omits report and investigation details'
);
select throws_ok(
  $$select count(*) from public.reports$$,
  '42501', 'permission denied for table reports',
  'the reporter cannot bypass the safe status projection'
);

set local "request.jwt.claim.sub" = 'b1100000-0000-4000-8000-000000000102';
select throws_ok(
  $$select count(*) from public.reports$$,
  '42501', 'permission denied for table reports',
  'the reported profile cannot read reporter identity or details'
);
select throws_ok(
  $$select count(*) from public.list_moderation_reports(null,20,0)$$,
  'P0001', 'NOT_ALLOWED',
  'an ordinary reported user cannot open the platform moderation queue'
);
select throws_ok(
  $$select count(*) from public.list_moderation_actions(true,20,0)$$,
  'P0001', 'NOT_ALLOWED',
  'an ordinary affected user cannot inspect the platform action inventory'
);

set local "request.jwt.claim.sub" = 'b1100000-0000-4000-8000-000000000104';
select throws_ok(
  $$select count(*) from public.list_moderation_reports(null,20,0)$$,
  'P0001', 'NOT_ALLOWED',
  'a group administrator has no platform report authority'
);

set local "request.jwt.claim.sub" = 'b1100000-0000-4000-8000-000000000107';
select set_config(
  'test.b11_past_event_report',
  (
    select report_id::text
    from public.submit_report(
      'event', 'b1100000-0000-4000-8000-000000000502', 'other',
      'This report was submitted after the event had already finished.', null
    )
  ),
  true
);
select is(
  (select safe_status from public.list_my_reports(20,0) where report_id = current_setting('test.b11_past_event_report')::uuid),
  'received',
  'a finished event remains reportable afterward'
);

set local "request.jwt.claim.sub" = 'b1100000-0000-4000-8000-000000000102';
select lives_ok(
  $$select * from public.get_private_event_location('b1100000-0000-4000-8000-000000000503',null)$$,
  'an eligible approved attendee can read the protected location before suspension'
);

set local "request.jwt.claim.sub" = 'b1100000-0000-4000-8000-000000000105';
select is(
  (select count(*) from public.list_moderation_reports(null,20,0)),
  5::bigint,
  'a platform moderator sees the complete confidential queue through its controlled projection'
);
select is(
  (
    select assigned_to_me
    from public.list_moderation_reports(null,20,0)
    where report_id = current_setting('test.b11_profile_report')::uuid
  ),
  false,
  'an unassigned report exposes a concrete false assignment state'
);
select throws_ok(
  $$select * from public.apply_moderation_action(current_setting('test.b11_group_report')::uuid,'group_suspension','An unassigned report cannot skip the platform queue workflow.',null,null)$$,
  'P0001', 'INVALID_TRANSITION',
  'a moderator must explicitly assign a report before applying enforcement'
);
select is(
  public.assign_report(current_setting('test.b11_profile_report')::uuid, null),
  true,
  'a platform moderator can assign one open report'
);
select set_config(
  'test.b11_profile_action',
  (
    select moderation_action_id::text
    from public.apply_moderation_action(
      current_setting('test.b11_profile_report')::uuid,
      'temporary_suspension',
      'A temporary suspension is proportionate to the verified conduct.',
      24,
      null
    )
  ),
  true
);
select is(
  (
    select count(*)
    from public.list_moderation_actions(true, 20, 0)
    where moderation_action_id = current_setting('test.b11_profile_action')::uuid
  ),
  1::bigint,
  'a moderator sees the current action in the controlled reversal inventory'
);

reset role;
select ok(
  (
    select suspended_at is not null and suspension_expires_at > statement_timestamp()
    from public.profiles
    where id = 'b1100000-0000-4000-8000-000000000102'
  ),
  'the moderation log and temporary profile suspension commit transactionally'
);
select is(
  (
    select status::text from public.reports
    where id = current_setting('test.b11_profile_report')::uuid
  ),
  'resolved',
  'the acted-on report reaches a terminal workflow state'
);

set local role authenticated;
set local "request.jwt.claim.sub" = 'b1100000-0000-4000-8000-000000000102';
select is(
  (select count(*) from public.get_public_profile_by_handle('b11_user_102')),
  0::bigint,
  'an actively suspended public profile is hidden'
);
select throws_ok(
  $$select * from public.request_friendship('b1100000-0000-4000-8000-000000000107',null)$$,
  'P0001', 'ACCOUNT_SUSPENDED',
  'an active suspension blocks ordinary community mutations'
);
select throws_ok(
  $$select * from public.get_private_event_location('b1100000-0000-4000-8000-000000000503',null)$$,
  'P0001', 'ACCOUNT_SUSPENDED',
  'an active suspension immediately revokes future protected-location reads'
);
select set_config(
  'test.b11_appeal',
  (
    select appeal_id::text
    from public.submit_moderation_appeal(
      current_setting('test.b11_profile_action')::uuid,
      'I am requesting a fresh review of the evidence and proportionality.',
      null
    )
  ),
  true
);
select throws_ok(
  $$select * from public.submit_moderation_appeal(current_setting('test.b11_profile_action')::uuid,'This duplicate appeal should remain unavailable to the same appellant.',null)$$,
  'P0001', 'INVALID_TRANSITION',
  'an affected user has only one active appeal per action'
);

set local "request.jwt.claim.sub" = 'b1100000-0000-4000-8000-000000000107';
select throws_ok(
  $$select * from public.submit_moderation_appeal(current_setting('test.b11_profile_action')::uuid,'An unrelated person cannot appeal another user moderation action.',null)$$,
  'P0001', 'NOT_FOUND',
  'an unrelated user cannot appeal another person action'
);

set local "request.jwt.claim.sub" = 'b1100000-0000-4000-8000-000000000105';
select is(
  (
    select has_active_appeal
    from public.list_moderation_actions(true,20,0)
    where moderation_action_id = current_setting('test.b11_profile_action')::uuid
  ),
  true,
  'the moderator action inventory marks an action with an active appeal'
);
select throws_ok(
  $$select public.reverse_moderation_action(current_setting('test.b11_profile_action')::uuid,'An active appeal must own the reversal decision.',null)$$,
  'P0001', 'INVALID_TRANSITION',
  'a moderator cannot directly reverse an action while its appeal is active'
);
select is(
  (
    select count(*)
    from public.list_moderation_actions(true,20,0)
    where moderation_action_id = current_setting('test.b11_profile_action')::uuid
  ),
  1::bigint,
  'a denied direct reversal leaves the moderation action active'
);
select is(
  (
    select status
    from public.list_moderation_appeals(null,20,0)
    where appeal_id = current_setting('test.b11_appeal')::uuid
  ),
  'open',
  'a denied direct reversal leaves the appeal available for independent review'
);
select is(
  (
    select can_current_moderator_review
    from public.list_moderation_appeals(null,20,0)
    where appeal_id = current_setting('test.b11_appeal')::uuid
  ),
  false,
  'the queue marks the original moderator ineligible while an active peer exists'
);
select throws_ok(
  $$select public.review_moderation_appeal(current_setting('test.b11_appeal')::uuid,'uphold','The original moderator should not self-review while a peer is active.',null)$$,
  'P0001', 'NOT_ALLOWED',
  'the original moderator cannot review their own appeal when a peer is available'
);

set local "request.jwt.claim.sub" = 'b1100000-0000-4000-8000-000000000106';
select is(
  (
    select can_current_moderator_review
    from public.list_moderation_appeals(null,20,0)
    where appeal_id = current_setting('test.b11_appeal')::uuid
  ),
  true,
  'the queue marks a separate eligible moderator able to review the appeal'
);
select is(
  public.review_moderation_appeal(
    current_setting('test.b11_appeal')::uuid,
    'reverse',
    'A separate review found that the action should be reversed.',
    null
  ),
  true,
  'a different moderator can reverse the action through the appeal outcome'
);
select is(
  (
    select count(*)
    from public.list_moderation_actions(true, 20, 0)
    where moderation_action_id = current_setting('test.b11_profile_action')::uuid
  ),
  0::bigint,
  'a reversed action leaves the active moderator inventory'
);

set local "request.jwt.claim.sub" = 'b1100000-0000-4000-8000-000000000102';
select lives_ok(
  $$select * from public.get_private_event_location('b1100000-0000-4000-8000-000000000503',null)$$,
  'reversal restores current eligibility and protected-location access'
);
select is(
  (
    select status from public.list_my_moderation_appeals(20,0)
    where appeal_id = current_setting('test.b11_appeal')::uuid
  ),
  'reversed',
  'the appellant sees the bounded appeal outcome'
);

-- With exactly two moderators, an appellant who is also a moderator is not an
-- eligible independent reviewer. The original moderator must remain able to
-- decide the appeal so the queue cannot deadlock.
set local "request.jwt.claim.sub" = 'b1100000-0000-4000-8000-000000000107';
select set_config(
  'test.b11_moderator_target_report',
  (
    select report_id::text
    from public.submit_report(
      'profile', 'b1100000-0000-4000-8000-000000000106', 'other',
      'This report exercises the two-moderator appeal fallback path.', null
    )
  ),
  true
);

set local "request.jwt.claim.sub" = 'b1100000-0000-4000-8000-000000000105';
select is(
  public.assign_report(current_setting('test.b11_moderator_target_report')::uuid, null),
  true,
  'the original moderator can assign the moderator-target report'
);
select set_config(
  'test.b11_moderator_target_action',
  (
    select moderation_action_id::text
    from public.apply_moderation_action(
      current_setting('test.b11_moderator_target_report')::uuid,
      'warning',
      'A documented warning creates the two-moderator appeal regression.',
      null,
      null
    )
  ),
  true
);

set local "request.jwt.claim.sub" = 'b1100000-0000-4000-8000-000000000106';
select set_config(
  'test.b11_moderator_target_appeal',
  (
    select appeal_id::text
    from public.submit_moderation_appeal(
      current_setting('test.b11_moderator_target_action')::uuid,
      'The moderator target requests review of the warning evidence.',
      null
    )
  ),
  true
);
select throws_ok(
  $$select public.review_moderation_appeal(current_setting('test.b11_moderator_target_appeal')::uuid,'uphold','An appellant must never review their own moderation appeal.',null)$$,
  'P0001', 'NOT_ALLOWED',
  'a moderator appellant cannot review their own appeal'
);

set local "request.jwt.claim.sub" = 'b1100000-0000-4000-8000-000000000105';
select is(
  (
    select can_current_moderator_review
    from public.list_moderation_appeals(null,20,0)
    where appeal_id = current_setting('test.b11_moderator_target_appeal')::uuid
  ),
  true,
  'the queue does not count the appellant as an eligible moderator peer'
);
select lives_ok(
  $$select public.review_moderation_appeal(current_setting('test.b11_moderator_target_appeal')::uuid,'uphold','No independent eligible peer exists, so the original moderator must decide.',null)$$,
  'the original moderator can decide when the only peer is the appellant'
);
select is(
  (
    select status
    from public.list_moderation_appeals(null,20,0)
    where appeal_id = current_setting('test.b11_moderator_target_appeal')::uuid
  ),
  'upheld',
  'the two-moderator appeal reaches a terminal decision'
);

set local "request.jwt.claim.sub" = 'b1100000-0000-4000-8000-000000000105';
select is(
  public.assign_report(current_setting('test.b11_group_report')::uuid, null),
  true,
  'a moderator can assign the group report'
);
select lives_ok(
  $$select * from public.apply_moderation_action(current_setting('test.b11_group_report')::uuid,'group_suspension','The verified group conduct requires platform suspension.',null,null)$$,
  'group suspension is an allowed proportional action for a group report'
);
select is(
  public.assign_report(current_setting('test.b11_venue_report')::uuid, null),
  true,
  'a moderator can assign the immediate-danger venue report'
);
select lives_ok(
  $$select * from public.apply_moderation_action(current_setting('test.b11_venue_report')::uuid,'venue_suspension','The verified venue danger requires immediate platform suspension.',null,null)$$,
  'venue suspension is an allowed proportional action for a venue report'
);
select is(
  public.assign_report(current_setting('test.b11_event_report')::uuid, null),
  true,
  'a moderator can assign the future event report'
);
select lives_ok(
  $$select * from public.apply_moderation_action(current_setting('test.b11_event_report')::uuid,'event_cancellation','The privacy exposure requires cancelling this future event.',null,null)$$,
  'event cancellation is an allowed proportional action for an event report'
);

reset role;
select is(
  (select lifecycle::text from public.groups where id = 'b1100000-0000-4000-8000-000000000201'),
  'suspended',
  'group enforcement updates product state transactionally'
);
select is(
  (select verification_status::text from public.venues where id = 'b1100000-0000-4000-8000-000000000301'),
  'suspended',
  'venue enforcement updates product state transactionally'
);
select is(
  (select status::text from public.events where id = 'b1100000-0000-4000-8000-000000000501'),
  'cancelled',
  'event enforcement updates product state transactionally'
);
select ok(
  (
    select count(*) >= 10
    from public.security_audit_events
    where action in (
      'report.submit',
      'moderation.report.assign',
      'moderation.action.apply',
      'moderation.appeal.submit',
      'moderation.appeal.review',
      'moderation.action.reverse'
    )
  ),
  'report, action, appeal, and reversal transitions leave minimal security audit evidence'
);
select ok(
  not exists (
    select 1
    from public.security_audit_events
    where metadata ?| array['password','session','cookie','token','invite_token','provider_token','address','address_text','location','coordinates','latitude','longitude']
  ),
  'moderation audit metadata contains no forbidden secrets or private-location keys'
);

update public.profiles
set
  community_restricted_at = statement_timestamp() - interval '2 days',
  community_restricted_until = statement_timestamp() - interval '1 day'
where id = 'b1100000-0000-4000-8000-000000000107';
set local role authenticated;
set local "request.jwt.claim.sub" = 'b1100000-0000-4000-8000-000000000107';
select throws_ok(
  $$select public.request_friendship_by_handle('b11_user_103',null)$$,
  'P0001', 'ACCOUNT_RESTRICTED',
  'a passed restriction review deadline does not silently restore community mutations'
);
select lives_ok(
  $$select * from public.list_my_reports(20,0)$$,
  'safety history stays available while ordinary community features are restricted'
);
reset role;
update public.profiles
set community_restricted_at = null, community_restricted_until = null
where id = 'b1100000-0000-4000-8000-000000000107';

update public.profiles
set
  suspended_at = statement_timestamp() - interval '2 days',
  suspension_expires_at = statement_timestamp() - interval '1 day'
where id = 'b1100000-0000-4000-8000-000000000107';
set local role authenticated;
set local "request.jwt.claim.sub" = 'b1100000-0000-4000-8000-000000000107';
select is(
  public.current_actor_is_community_eligible(),
  false,
  'a passed suspension review deadline does not silently restore community authority'
);
select throws_ok(
  $$select public.request_friendship_by_handle('b11_user_103',null)$$,
  'P0001', 'ACCOUNT_SUSPENDED',
  'a timed suspension remains enforced until an audited moderator reversal'
);
select throws_ok(
  $$select public.block_user('b11_user_103',null)$$,
  'P0001',
  'ACCOUNT_SUSPENDED',
  'suspension still denies the community block mutation while report and appeal history stay available'
);
reset role;
update public.profiles
set rules_version = 2
where id = 'b1100000-0000-4000-8000-000000000107';
set local role authenticated;
set local "request.jwt.claim.sub" = 'b1100000-0000-4000-8000-000000000107';
select lives_ok(
  $$select * from public.list_my_reports(20,0)$$,
  'safety history stays available during suspension and after a rules-version change'
);
reset role;

select * from finish();
rollback;
