begin;

create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public, pg_catalog;

select no_plan();

select has_table(
  'public',
  'group_invitations',
  'recipient-bound group invitations have a durable lifecycle'
);

select ok(
  (
    select relation.relrowsecurity and relation.relforcerowsecurity
    from pg_class as relation
    join pg_namespace as namespace on namespace.oid = relation.relnamespace
    where namespace.nspname = 'public' and relation.relname = 'group_invitations'
  ),
  'recipient-bound invitations force row level security'
);

select ok(
  not has_table_privilege('authenticated', 'public.group_invitations', 'select'),
  'invitation rows are available only through safe projections'
);

select is(
  (
    select procedure.provolatile
    from pg_proc as procedure
    join pg_namespace as namespace on namespace.oid = procedure.pronamespace
    where namespace.nspname = 'public'
      and procedure.proname = 'list_my_group_invitations'
      and pg_get_function_identity_arguments(procedure.oid) = ''
  ),
  'v'::"char",
  'the recipient invitation projection remains writable-transaction safe through PostgREST'
);

select is(
  (
    select procedure.provolatile
    from pg_proc as procedure
    join pg_namespace as namespace on namespace.oid = procedure.pronamespace
    where namespace.nspname = 'public'
      and procedure.proname = 'list_group_direct_invitations'
      and pg_get_function_identity_arguments(procedure.oid) = 'input_group_id uuid, input_offset integer, input_limit integer'
  ),
  'v'::"char",
  'the administrator invitation projection remains writable-transaction safe through PostgREST'
);

insert into auth.users (
  instance_id, id, aud, role, email, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
select
  '00000000-0000-0000-0000-000000000000', fixture.id,
  'authenticated', 'authenticated', fixture.email, statement_timestamp(),
  '{}'::jsonb, '{}'::jsonb, statement_timestamp(), statement_timestamp()
from (
  values
    ('fc000000-0000-4000-8000-000000000101'::uuid, 'direct-owner@example.test'),
    ('fc000000-0000-4000-8000-000000000102'::uuid, 'direct-admin@example.test'),
    ('fc000000-0000-4000-8000-000000000103'::uuid, 'direct-member@example.test'),
    ('fc000000-0000-4000-8000-000000000104'::uuid, 'direct-invitee@example.test'),
    ('fc000000-0000-4000-8000-000000000105'::uuid, 'direct-decline@example.test'),
    ('fc000000-0000-4000-8000-000000000106'::uuid, 'direct-revoke@example.test')
) as fixture(id, email);

update public.profiles
set
  handle = 'direct_' || right(id::text, 3),
  display_name = 'Direct Fan ' || right(id::text, 3),
  city_id = (select id from public.cities where slug = 'haifa'),
  adult_attested_at = statement_timestamp(),
  rules_version = 1,
  rules_accepted_at = statement_timestamp(),
  profile_completed_at = statement_timestamp(),
  fan_enabled_at = statement_timestamp()
where id::text like 'fc000000-0000-4000-8000-0000000001%';

insert into public.groups (
  id, slug, name, owner_id, city_id, visibility, lifecycle, description, activated_at
)
values (
  'fc000000-0000-4000-8000-000000000201',
  'direct-invite-group',
  'Direct Invite Group',
  'fc000000-0000-4000-8000-000000000101',
  null,
  'discoverable',
  'active',
  'A group used to verify clear direct invitation and removal transitions.',
  statement_timestamp()
);

insert into public.group_memberships (group_id, user_id, role, status)
values
  ('fc000000-0000-4000-8000-000000000201', 'fc000000-0000-4000-8000-000000000101', 'owner', 'active'),
  ('fc000000-0000-4000-8000-000000000201', 'fc000000-0000-4000-8000-000000000102', 'admin', 'active'),
  ('fc000000-0000-4000-8000-000000000201', 'fc000000-0000-4000-8000-000000000103', 'member', 'active');

set local role authenticated;
select set_config('request.jwt.claim.sub', 'fc000000-0000-4000-8000-000000000101', true);

select lives_ok(
  $$
    select * from public.create_group_invitation(
      'fc000000-0000-4000-8000-000000000201',
      'fc000000-0000-4000-8000-000000000104',
      'fc000000-0000-4000-8000-000000000301'
    )
  $$,
  'an owner can send a recipient-bound invitation'
);

select is(
  (
    select count(*)
    from public.create_group_invitation(
      'fc000000-0000-4000-8000-000000000201',
      'fc000000-0000-4000-8000-000000000105',
      'fc000000-0000-4000-8000-000000000302'
    )
  ),
  1::bigint,
  'a second eligible recipient can be invited independently'
);

select is(
  (
    select count(*)
    from public.create_group_invitation(
      'fc000000-0000-4000-8000-000000000201',
      'fc000000-0000-4000-8000-000000000106',
      'fc000000-0000-4000-8000-000000000303'
    )
  ),
  1::bigint,
  'a pending invitation can later be revoked'
);

select set_config('request.jwt.claim.sub', 'fc000000-0000-4000-8000-000000000104', true);

select results_eq(
  $$
    select group_name, inviter_handle
    from public.list_my_group_invitations()
  $$,
  $$values ('Direct Invite Group'::text, 'direct_101'::text)$$,
  'only the intended recipient sees their pending invitation'
);

select lives_ok(
  $$
    select * from public.respond_group_invitation(
      (
        select invitation_id from public.list_my_group_invitations()
        where group_id = 'fc000000-0000-4000-8000-000000000201'
      ),
      'accept',
      'fc000000-0000-4000-8000-000000000304'
    )
  $$,
  'the intended recipient can accept the invitation'
);

reset role;

select is(
  (
    select status::text from public.group_memberships
    where group_id = 'fc000000-0000-4000-8000-000000000201'
      and user_id = 'fc000000-0000-4000-8000-000000000104'
  ),
  'active',
  'acceptance creates an active member relationship'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', 'fc000000-0000-4000-8000-000000000105', true);

select lives_ok(
  $$
    select * from public.respond_group_invitation(
      (
        select invitation_id from public.list_my_group_invitations()
        where group_id = 'fc000000-0000-4000-8000-000000000201'
      ),
      'decline',
      'fc000000-0000-4000-8000-000000000305'
    )
  $$,
  'the intended recipient can decline without creating membership residue'
);

select set_config('request.jwt.claim.sub', 'fc000000-0000-4000-8000-000000000101', true);

select lives_ok(
  $$
    select * from public.revoke_group_invitation(
      (
        select invitation_id
        from public.list_group_direct_invitations(
          'fc000000-0000-4000-8000-000000000201',
          0,
          20
        )
        where invitee_id = 'fc000000-0000-4000-8000-000000000106'
      ),
      'fc000000-0000-4000-8000-000000000306'
    )
  $$,
  'the owner can revoke a pending direct invitation'
);

select lives_ok(
  $$
    select * from public.remove_group_member(
      'fc000000-0000-4000-8000-000000000201',
      'fc000000-0000-4000-8000-000000000103',
      'fc000000-0000-4000-8000-000000000307'
    )
  $$,
  'an owner can remove a non-owner active member without banning them'
);

reset role;

select results_eq(
  $$
    select membership.status::text, (ban.user_id is not null)
    from public.group_memberships as membership
    left join public.group_bans as ban
      on ban.group_id = membership.group_id
     and ban.user_id = membership.user_id
     and ban.revoked_at is null
    where membership.group_id = 'fc000000-0000-4000-8000-000000000201'
      and membership.user_id = 'fc000000-0000-4000-8000-000000000103'
  $$,
  $$values ('left'::text, false)$$,
  'ordinary removal retains history but creates no ban'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', 'fc000000-0000-4000-8000-000000000103', true);

select lives_ok(
  $$
    select * from public.apply_to_group(
      'fc000000-0000-4000-8000-000000000201',
      'I would like to return.',
      'fc000000-0000-4000-8000-000000000308'
    )
  $$,
  'a removed member may submit a fresh application later'
);

select * from finish();
rollback;
