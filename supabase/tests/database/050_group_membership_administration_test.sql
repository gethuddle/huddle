begin;

create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public, pg_catalog;

select no_plan();

select has_index(
  'public',
  'group_memberships',
  'group_memberships_pending_queue_idx',
  'pending application queues have a targeted index'
);
select matches(
  (
    select indexdef
    from pg_indexes
    where schemaname = 'public'
      and indexname = 'group_memberships_pending_queue_idx'
  ),
  '\(group_id, status, updated_at, user_id\)',
  'the pending queue orders current applications by their latest transition time'
);
select has_index(
  'public',
  'security_audit_events',
  'security_audit_group_application_cooldown_idx',
  'application cooldowns use durable indexed audit evidence'
);
select has_index(
  'public',
  'security_audit_events',
  'security_audit_group_invite_cooldown_idx',
  'invite creation cooldowns use durable indexed audit evidence'
);
select ok(
  has_function_privilege('authenticated', 'public.apply_to_group(uuid,text,uuid)', 'execute'),
  'eligible authenticated users may invoke controlled discoverable applications'
);
select ok(
  not has_function_privilege('anon', 'public.apply_to_group(uuid,text,uuid)', 'execute'),
  'anonymous callers cannot apply to a group'
);
select ok(
  has_function_privilege('authenticated', 'public.review_group_membership(uuid,uuid,text,uuid)', 'execute'),
  'authenticated group administrators may invoke the reviewed transition boundary'
);
select ok(
  has_function_privilege('authenticated', 'public.consume_group_invite(text,text,uuid)', 'execute'),
  'authenticated users may invoke controlled invite consumption'
);
select ok(
  not has_function_privilege('anon', 'public.get_group_invite_preview(text)', 'execute'),
  'anonymous callers cannot probe invitation tokens'
);
select ok(
  not has_function_privilege('authenticated', 'private.hash_group_invite_token(text)', 'execute'),
  'the invitation hash helper remains private'
);
select ok(
  not has_table_privilege('authenticated', 'public.group_invite_tokens', 'select'),
  'authenticated callers cannot read invitation digests directly'
);
select ok(
  not has_table_privilege('authenticated', 'public.group_bans', 'select'),
  'group bans require the administrator-safe projection'
);
select ok(
  not has_table_privilege('authenticated', 'public.security_audit_events', 'select'),
  'group roles never grant access to platform security audits'
);
select ok(
  not has_table_privilege('authenticated', 'public.platform_roles', 'select'),
  'group roles never grant platform moderation-role access'
);

insert into auth.users (
  instance_id,
  id,
  aud,
  role,
  email,
  email_confirmed_at,
  raw_app_meta_data,
  raw_user_meta_data,
  created_at,
  updated_at
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
  statement_timestamp(),
  statement_timestamp()
from (
  values
    ('52000000-0000-4000-8000-000000000101'::uuid, 'b06-owner@example.com'),
    ('52000000-0000-4000-8000-000000000102'::uuid, 'b06-admin@example.com'),
    ('52000000-0000-4000-8000-000000000103'::uuid, 'b06-member@example.com'),
    ('52000000-0000-4000-8000-000000000104'::uuid, 'b06-applicant-a@example.com'),
    ('52000000-0000-4000-8000-000000000105'::uuid, 'b06-blocked@example.com'),
    ('52000000-0000-4000-8000-000000000106'::uuid, 'b06-incomplete@example.com'),
    ('52000000-0000-4000-8000-000000000107'::uuid, 'b06-applicant-b@example.com'),
    ('52000000-0000-4000-8000-000000000108'::uuid, 'b06-cooldown@example.com'),
    ('52000000-0000-4000-8000-000000000109'::uuid, 'b06-hierarchy@example.com'),
    ('52000000-0000-4000-8000-000000000110'::uuid, 'b06-suspended@example.com'),
    ('52000000-0000-4000-8000-000000000111'::uuid, 'b06-invitee@example.com')
) as fixture(id, email);

update public.profiles
set
  handle = 'b06_' || right(id::text, 3),
  display_name = 'B06 Fan ' || right(id::text, 3),
  city_id = (select id from public.cities where slug = 'haifa'),
  adult_attested_at = statement_timestamp(),
  rules_version = 1,
  rules_accepted_at = statement_timestamp(),
  profile_completed_at = statement_timestamp()
where id between
  '52000000-0000-4000-8000-000000000101' and
  '52000000-0000-4000-8000-000000000111'
  and id <> '52000000-0000-4000-8000-000000000106';

update public.profiles
set suspended_at = statement_timestamp()
where id = '52000000-0000-4000-8000-000000000110';

insert into public.groups (
  id,
  slug,
  name,
  owner_id,
  city_id,
  visibility,
  lifecycle,
  description,
  activated_at
)
values
  (
    '52000000-0000-4000-8000-000000000201',
    'b06-forming-group',
    'B06 Forming Group',
    '52000000-0000-4000-8000-000000000101',
    (select id from public.cities where slug = 'haifa'),
    'discoverable',
    'forming',
    'A safe forming-group application summary.',
    null
  ),
  (
    '52000000-0000-4000-8000-000000000202',
    'b06-active-group',
    'B06 Active Group',
    '52000000-0000-4000-8000-000000000101',
    (select id from public.cities where slug = 'haifa'),
    'discoverable',
    'active',
    'An active discoverable group.',
    statement_timestamp()
  ),
  (
    '52000000-0000-4000-8000-000000000203',
    'b06-unlisted-group',
    'B06 Unlisted Group',
    '52000000-0000-4000-8000-000000000101',
    (select id from public.cities where slug = 'haifa'),
    'unlisted',
    'active',
    'An unlisted group.',
    statement_timestamp()
  );

insert into public.group_memberships (group_id, user_id, role, status, reviewed_by, reviewed_at)
values
  ('52000000-0000-4000-8000-000000000201', '52000000-0000-4000-8000-000000000101', 'owner', 'active', null, null),
  ('52000000-0000-4000-8000-000000000202', '52000000-0000-4000-8000-000000000101', 'owner', 'active', null, null),
  ('52000000-0000-4000-8000-000000000203', '52000000-0000-4000-8000-000000000101', 'owner', 'active', null, null),
  ('52000000-0000-4000-8000-000000000201', '52000000-0000-4000-8000-000000000102', 'admin', 'active', '52000000-0000-4000-8000-000000000101', statement_timestamp()),
  ('52000000-0000-4000-8000-000000000202', '52000000-0000-4000-8000-000000000102', 'admin', 'active', '52000000-0000-4000-8000-000000000101', statement_timestamp()),
  ('52000000-0000-4000-8000-000000000203', '52000000-0000-4000-8000-000000000102', 'admin', 'active', '52000000-0000-4000-8000-000000000101', statement_timestamp()),
  ('52000000-0000-4000-8000-000000000201', '52000000-0000-4000-8000-000000000103', 'member', 'active', '52000000-0000-4000-8000-000000000101', statement_timestamp()),
  ('52000000-0000-4000-8000-000000000201', '52000000-0000-4000-8000-000000000109', 'member', 'active', '52000000-0000-4000-8000-000000000101', statement_timestamp()),
  ('52000000-0000-4000-8000-000000000203', '52000000-0000-4000-8000-000000000109', 'member', 'active', '52000000-0000-4000-8000-000000000101', statement_timestamp());

set local role anon;
set local "request.jwt.claim.sub" = '';
select is(
  (select count(*) from public.get_group_by_slug('b06-forming-group')),
  0::bigint,
  'anonymous discovery remains closed for a forming discoverable group'
);

set local role authenticated;
set local "request.jwt.claim.sub" = '52000000-0000-4000-8000-000000000104';
select is(
  (select count(*) from public.get_group_by_slug('b06-forming-group')),
  1::bigint,
  'an eligible signed-in direct-link viewer receives the safe forming summary'
);
select is(
  (select can_apply from public.get_group_by_slug('b06-forming-group')),
  true,
  'the safe forming summary exposes an application capability, not membership'
);
select lives_ok(
  $$select * from public.apply_to_group('52000000-0000-4000-8000-000000000201', 'I watch every match.', null)$$,
  'an eligible viewer can submit one discoverable-group application'
);
select is(
  (
    select status::text || ':' || role::text
    from public.group_memberships
    where group_id = '52000000-0000-4000-8000-000000000201'
      and user_id = auth.uid()
  ),
  'pending:member',
  'a discoverable application remains pending with no elevated role'
);
select throws_ok(
  $$select * from public.apply_to_group('52000000-0000-4000-8000-000000000201', 'Duplicate', null)$$,
  'P0001',
  'INVALID_TRANSITION',
  'a pending applicant cannot create a duplicate application'
);

set local "request.jwt.claim.sub" = '52000000-0000-4000-8000-000000000106';
select is(
  (select count(*) from public.get_group_by_slug('b06-forming-group')),
  0::bigint,
  'an incomplete account cannot view the forming application summary'
);
select throws_ok(
  $$select * from public.apply_to_group('52000000-0000-4000-8000-000000000201', '', null)$$,
  'P0001',
  'ADULT_ATTESTATION_REQUIRED',
  'the complete-account community gate is enforced in the application function'
);

reset role;
insert into public.user_blocks (blocker_id, blocked_id)
values ('52000000-0000-4000-8000-000000000105', '52000000-0000-4000-8000-000000000101');
set local role authenticated;
set local "request.jwt.claim.sub" = '52000000-0000-4000-8000-000000000105';
select is(
  (select count(*) from public.get_group_by_slug('b06-forming-group')),
  0::bigint,
  'a block with the owner removes the forming direct-link summary'
);
select throws_ok(
  $$select * from public.apply_to_group('52000000-0000-4000-8000-000000000201', '', null)$$,
  'P0001',
  'BLOCKED_RELATIONSHIP',
  'a block in either direction denies a new application'
);

set local "request.jwt.claim.sub" = '52000000-0000-4000-8000-000000000107';
select lives_ok(
  $$select * from public.apply_to_group('52000000-0000-4000-8000-000000000201', 'Please review me.', null)$$,
  'a second eligible account can create an independently reviewed application'
);

set local "request.jwt.claim.sub" = '52000000-0000-4000-8000-000000000108';
select lives_ok(
  $$select * from public.apply_to_group('52000000-0000-4000-8000-000000000201', '', null)$$,
  'an actor can submit their first application'
);
select throws_ok(
  $$select * from public.apply_to_group('52000000-0000-4000-8000-000000000202', '', null)$$,
  'P0001',
  'RATE_LIMITED',
  'the durable cooldown serializes applications across different groups'
);

set local "request.jwt.claim.sub" = '52000000-0000-4000-8000-000000000103';
select throws_ok(
  $$select * from public.list_group_applications('52000000-0000-4000-8000-000000000201', 0, 20)$$,
  'P0001',
  'NOT_FOUND',
  'an ordinary active member cannot read the private application queue'
);
select is(
  (
    select count(*)
    from public.group_memberships
    where group_id = '52000000-0000-4000-8000-000000000201'
      and user_id = '52000000-0000-4000-8000-000000000104'
  ),
  0::bigint,
  'RLS prevents an ordinary member from reading another applicant row or note'
);

set local "request.jwt.claim.sub" = '52000000-0000-4000-8000-000000000102';
select is(
  (
    select application_message
    from public.list_group_applications('52000000-0000-4000-8000-000000000201', 0, 20)
    where user_id = '52000000-0000-4000-8000-000000000104'
  ),
  'I watch every match.',
  'an active group admin receives the private application note through a bounded projection'
);
select lives_ok(
  $$select * from public.review_group_membership('52000000-0000-4000-8000-000000000201', '52000000-0000-4000-8000-000000000104', 'approve', null)$$,
  'an active admin may approve a pending application'
);

set local "request.jwt.claim.sub" = '52000000-0000-4000-8000-000000000101';
select lives_ok(
  $$select * from public.review_group_membership('52000000-0000-4000-8000-000000000201', '52000000-0000-4000-8000-000000000107', 'reject', null)$$,
  'the owner may reject a pending application'
);

reset role;
select ok(
  exists (
    select 1
    from public.group_memberships
    where group_id = '52000000-0000-4000-8000-000000000201'
      and user_id = '52000000-0000-4000-8000-000000000104'
      and status = 'active'
      and reviewed_by = '52000000-0000-4000-8000-000000000102'
      and reviewed_at is not null
  ),
  'approval stores the reviewing administrator and timestamp'
);
select is(
  (
    select status::text
    from public.group_memberships
    where group_id = '52000000-0000-4000-8000-000000000201'
      and user_id = '52000000-0000-4000-8000-000000000107'
  ),
  'rejected',
  'rejection retains the durable membership history'
);

set local role authenticated;
set local "request.jwt.claim.sub" = '52000000-0000-4000-8000-000000000103';
select lives_ok(
  $$select * from public.leave_group('52000000-0000-4000-8000-000000000201', null)$$,
  'a non-owner active member may leave'
);
select is(
  (
    select status::text
    from public.group_memberships
    where group_id = '52000000-0000-4000-8000-000000000201'
      and user_id = auth.uid()
  ),
  'left',
  'leaving retains the membership row in a durable left state'
);
select throws_ok(
  $$select * from public.leave_group('52000000-0000-4000-8000-000000000201', null)$$,
  'P0001',
  'INVALID_TRANSITION',
  'a left membership cannot leave again'
);

set local "request.jwt.claim.sub" = '52000000-0000-4000-8000-000000000101';
select throws_ok(
  $$select * from public.leave_group('52000000-0000-4000-8000-000000000201', null)$$,
  'P0001',
  'GROUP_OWNER_REQUIRED',
  'the sole active owner cannot leave'
);

set local "request.jwt.claim.sub" = '52000000-0000-4000-8000-000000000102';
select throws_ok(
  $$select * from public.change_group_member_role('52000000-0000-4000-8000-000000000201', '52000000-0000-4000-8000-000000000109', 'admin', null)$$,
  'P0001',
  'NOT_ALLOWED',
  'an admin cannot promote another member'
);

set local "request.jwt.claim.sub" = '52000000-0000-4000-8000-000000000101';
select lives_ok(
  $$select * from public.change_group_member_role('52000000-0000-4000-8000-000000000201', '52000000-0000-4000-8000-000000000109', 'admin', null)$$,
  'only the owner may promote a member to admin'
);
select is(
  (
    select member_since
    from public.list_group_admin_members('52000000-0000-4000-8000-000000000201', 0, 20)
    where user_id = '52000000-0000-4000-8000-000000000109'
  ),
  (
    select reviewed_at
    from public.group_memberships
    where group_id = '52000000-0000-4000-8000-000000000201'
      and user_id = '52000000-0000-4000-8000-000000000109'
  ),
  'role changes preserve the original active-membership date in the admin roster'
);
select throws_ok(
  $$select * from public.change_group_member_role('52000000-0000-4000-8000-000000000201', '52000000-0000-4000-8000-000000000101', 'member', null)$$,
  'P0001',
  'INVALID_TRANSITION',
  'the role function cannot demote the owner'
);

set local "request.jwt.claim.sub" = '52000000-0000-4000-8000-000000000102';
select throws_ok(
  $$select * from public.ban_group_member('52000000-0000-4000-8000-000000000201', '52000000-0000-4000-8000-000000000109', 'Admin hierarchy test', null)$$,
  'P0001',
  'NOT_ALLOWED',
  'an admin cannot ban another admin'
);

set local "request.jwt.claim.sub" = '52000000-0000-4000-8000-000000000101';
select lives_ok(
  $$select * from public.change_group_member_role('52000000-0000-4000-8000-000000000201', '52000000-0000-4000-8000-000000000109', 'member', null)$$,
  'the owner may demote a non-owner admin'
);

set local "request.jwt.claim.sub" = '52000000-0000-4000-8000-000000000102';
select lives_ok(
  $$select * from public.ban_group_member('52000000-0000-4000-8000-000000000201', '52000000-0000-4000-8000-000000000109', 'Repeated group abuse', null)$$,
  'an admin may ban an ordinary active member'
);

set local "request.jwt.claim.sub" = '52000000-0000-4000-8000-000000000109';
select is(
  (select can_view_member_content from public.get_group_by_slug('b06-forming-group')),
  null::boolean,
  'a ban removes the forming group summary and protected-content boundary entirely'
);
select throws_ok(
  $$select * from public.apply_to_group('52000000-0000-4000-8000-000000000201', '', null)$$,
  'P0001',
  'GROUP_BANNED',
  'an active ban denies reapplication'
);

set local "request.jwt.claim.sub" = '52000000-0000-4000-8000-000000000102';
select lives_ok(
  $$select public.unban_group_member('52000000-0000-4000-8000-000000000201', '52000000-0000-4000-8000-000000000109', null)$$,
  'an active group admin may revoke a ban'
);

set local "request.jwt.claim.sub" = '52000000-0000-4000-8000-000000000109';
select lives_ok(
  $$select * from public.apply_to_group('52000000-0000-4000-8000-000000000201', 'Fresh review required.', null)$$,
  'unbanning permits a fresh application instead of restoring membership'
);
select is(
  (
    select status::text
    from public.group_memberships
    where group_id = '52000000-0000-4000-8000-000000000201'
      and user_id = auth.uid()
  ),
  'pending',
  'the unbanned former member returns only to pending'
);
select ok(
  (
    select updated_at > created_at
    from public.group_memberships
    where group_id = '52000000-0000-4000-8000-000000000201'
      and user_id = auth.uid()
  ),
  'a renewed application retains original history while recording its current queue time'
);

set local "request.jwt.claim.sub" = '52000000-0000-4000-8000-000000000102';
select lives_ok(
  $$select * from public.create_group_rule('52000000-0000-4000-8000-000000000202', 'Draft conduct rule.', false, null)$$,
  'an admin may create a draft group rule'
);
select lives_ok(
  $$select * from public.create_group_rule('52000000-0000-4000-8000-000000000202', 'Published respect rule.', true, null)$$,
  'an admin may create a published group rule'
);
select is(
  (select count(*) from public.list_group_rules('52000000-0000-4000-8000-000000000202', 0, 100)),
  2::bigint,
  'an active admin sees drafts and published rules'
);

set local role anon;
set local "request.jwt.claim.sub" = '';
select is(
  (select count(*) from public.list_group_rules('52000000-0000-4000-8000-000000000202', 0, 100)),
  1::bigint,
  'a public group viewer sees only published rules'
);

set local role authenticated;
set local "request.jwt.claim.sub" = '52000000-0000-4000-8000-000000000102';
select lives_ok(
  $$select * from public.update_group_rule((select rule_id from public.list_group_rules('52000000-0000-4000-8000-000000000202', 0, 100) where rule_text = 'Draft conduct rule.'), 'Now published conduct rule.', true, null)$$,
  'an admin may edit and publish a draft rule'
);
select lives_ok(
  $$select public.reorder_group_rules('52000000-0000-4000-8000-000000000202', (select array_agg(rule_id order by rule_position desc) from public.list_group_rules('52000000-0000-4000-8000-000000000202', 0, 100)), null)$$,
  'an admin may atomically reorder the exact current rule set'
);
select throws_ok(
  $$select public.reorder_group_rules('52000000-0000-4000-8000-000000000202', array[(select rule_id from public.list_group_rules('52000000-0000-4000-8000-000000000202', 0, 1))], null)$$,
  'P0001',
  'VALIDATION_FAILED',
  'a partial rule list cannot corrupt the ordered set'
);

set local "request.jwt.claim.sub" = '52000000-0000-4000-8000-000000000101';
select lives_ok(
  $$select * from public.create_group_invite('52000000-0000-4000-8000-000000000203', encode(sha256(convert_to('AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA', 'UTF8')), 'hex'), statement_timestamp() + interval '7 days', 2, null)$$,
  'an unlisted-group owner can create digest-only invitation metadata'
);
select throws_ok(
  $$select * from public.create_group_invite('52000000-0000-4000-8000-000000000203', repeat('b', 64), statement_timestamp() + interval '7 days', 2, null)$$,
  'P0001',
  'RATE_LIMITED',
  'invite creation has a durable per-admin and per-group cooldown'
);
select is(
  (
    select array_agg(field_name order by field_name)
    from public.list_group_invites('52000000-0000-4000-8000-000000000203', 0, 20) as invite,
      lateral jsonb_object_keys(to_jsonb(invite)) as field_name
  ),
  array['created_at', 'creator_handle', 'expires_at', 'invite_id', 'invite_status', 'max_uses', 'revoked_at', 'total_count', 'use_count']::text[],
  'the admin invitation list never returns the token digest or plaintext secret'
);

set local "request.jwt.claim.sub" = '52000000-0000-4000-8000-000000000111';
select is(
  (select name from public.get_group_invite_preview('AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA')),
  'B06 Unlisted Group',
  'a valid invitation returns only the minimum safe group preview'
);
select lives_ok(
  $$select * from public.consume_group_invite('AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA', 'Invited supporter note.', null)$$,
  'a valid invitation can be consumed once into an application'
);
select is(
  (
    select status::text
    from public.group_memberships
    where group_id = '52000000-0000-4000-8000-000000000203'
      and user_id = auth.uid()
  ),
  'pending',
  'invitation consumption never activates the applicant'
);
select is(
  (select count(*) from public.get_group_by_slug('b06-unlisted-group')),
  0::bigint,
  'a pending invitation applicant cannot read the protected unlisted group'
);

set local "request.jwt.claim.sub" = '52000000-0000-4000-8000-000000000101';
select is(
  (
    select application_source
    from public.list_group_applications('52000000-0000-4000-8000-000000000203', 0, 20)
    where user_id = '52000000-0000-4000-8000-000000000111'
  ),
  'invite',
  'administrators can distinguish invite-backed applications without seeing the secret'
);
select lives_ok(
  $$select * from public.review_group_membership('52000000-0000-4000-8000-000000000203', '52000000-0000-4000-8000-000000000111', 'approve', null)$$,
  'the invitation-backed application still requires explicit administrator approval'
);

reset role;
select is(
  (
    select use_count
    from public.group_invite_tokens
    where token_hash = encode(sha256(convert_to('AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA', 'UTF8')), 'hex')
  ),
  1,
  'successful consumption increments exactly one durable use'
);
select ok(
  not exists (
    select 1
    from public.security_audit_events
    where metadata::text like '%AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA%'
  ),
  'audit metadata never contains invitation plaintext'
);

update public.security_audit_events
set created_at = statement_timestamp() - interval '11 seconds'
where actor_id = '52000000-0000-4000-8000-000000000101'
  and action = 'group.invite.create';

set local role authenticated;
set local "request.jwt.claim.sub" = '52000000-0000-4000-8000-000000000101';
select lives_ok(
  $$select * from public.create_group_invite('52000000-0000-4000-8000-000000000203', encode(sha256(convert_to('BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB', 'UTF8')), 'hex'), statement_timestamp() + interval '1 day', 1, null)$$,
  'invite creation resumes after the bounded cooldown'
);
select ok(
  public.revoke_group_invite(
    (
      select invite_id
      from public.list_group_invites('52000000-0000-4000-8000-000000000203', 0, 20)
      where max_uses = 1
    ),
    null
  ),
  'an administrator can revoke invitation metadata without deleting it'
);

set local "request.jwt.claim.sub" = '52000000-0000-4000-8000-000000000108';
select throws_ok(
  $$select * from public.get_group_invite_preview('BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB')$$,
  'P0001',
  'INVITE_INVALID',
  'a revoked invitation fails through the generic invalid boundary'
);

reset role;
insert into public.group_invite_tokens (
  group_id,
  token_hash,
  created_by,
  expires_at,
  max_uses,
  use_count,
  created_at
)
values
  (
    '52000000-0000-4000-8000-000000000203',
    encode(sha256(convert_to('CCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCC', 'UTF8')), 'hex'),
    '52000000-0000-4000-8000-000000000101',
    statement_timestamp() - interval '1 day',
    2,
    0,
    statement_timestamp() - interval '2 days'
  ),
  (
    '52000000-0000-4000-8000-000000000203',
    encode(sha256(convert_to('DDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDD', 'UTF8')), 'hex'),
    '52000000-0000-4000-8000-000000000101',
    statement_timestamp() + interval '1 day',
    1,
    1,
    statement_timestamp()
  ),
  (
    '52000000-0000-4000-8000-000000000203',
    encode(sha256(convert_to('EEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEE', 'UTF8')), 'hex'),
    '52000000-0000-4000-8000-000000000102',
    statement_timestamp() + interval '1 day',
    2,
    0,
    statement_timestamp()
  ),
  (
    '52000000-0000-4000-8000-000000000203',
    encode(sha256(convert_to('FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF', 'UTF8')), 'hex'),
    '52000000-0000-4000-8000-000000000101',
    statement_timestamp() + interval '1 day',
    2,
    0,
    statement_timestamp()
  );

set local role authenticated;
set local "request.jwt.claim.sub" = '52000000-0000-4000-8000-000000000108';
select throws_ok(
  $$select * from public.get_group_invite_preview('CCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCC')$$,
  'P0001',
  'INVITE_EXPIRED',
  'expired invitations reveal no group preview'
);
select throws_ok(
  $$select * from public.get_group_invite_preview('DDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDD')$$,
  'P0001',
  'INVITE_INVALID',
  'exhausted invitations use the generic unavailable boundary'
);

reset role;
insert into public.user_blocks (blocker_id, blocked_id)
values ('52000000-0000-4000-8000-000000000107', '52000000-0000-4000-8000-000000000102');
set local role authenticated;
set local "request.jwt.claim.sub" = '52000000-0000-4000-8000-000000000107';
select throws_ok(
  $$select * from public.get_group_invite_preview('EEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEE')$$,
  'P0001',
  'BLOCKED_RELATIONSHIP',
  'a block with the invitation creator denies use even when the owner is not blocked'
);

set local "request.jwt.claim.sub" = '52000000-0000-4000-8000-000000000101';
select lives_ok(
  $$select * from public.ban_group_member('52000000-0000-4000-8000-000000000203', '52000000-0000-4000-8000-000000000109', 'Unlisted group ban', null)$$,
  'the owner may ban an ordinary unlisted-group member'
);

set local "request.jwt.claim.sub" = '52000000-0000-4000-8000-000000000109';
select throws_ok(
  $$select * from public.get_group_invite_preview('FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF')$$,
  'P0001',
  'GROUP_BANNED',
  'an active group ban denies invitation previews and consumption'
);
select is(
  (select count(*) from public.get_group_by_slug('b06-unlisted-group')),
  0::bigint,
  'a ban immediately removes protected unlisted-group content'
);

reset role;
select ok(
  exists (
    select 1
    from public.security_audit_events
    where actor_id = '52000000-0000-4000-8000-000000000102'
      and action = 'group.membership.approve'
  ),
  'membership review decisions are auditable'
);
select ok(
  exists (
    select 1
    from public.security_audit_events
    where actor_id = '52000000-0000-4000-8000-000000000101'
      and action = 'group.membership.role_change'
  ),
  'role hierarchy changes are auditable'
);
select ok(
  exists (
    select 1
    from public.security_audit_events
    where action in ('group.membership.ban', 'group.membership.unban')
  ),
  'ban lifecycle transitions are auditable'
);
select is(
  (select count(*) from public.platform_roles where profile_id = '52000000-0000-4000-8000-000000000102'),
  0::bigint,
  'a group admin receives no platform moderation role'
);

select * from finish();
rollback;
