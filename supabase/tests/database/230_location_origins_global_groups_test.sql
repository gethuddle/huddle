begin;

create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public, pg_catalog;

select no_plan();

select hasnt_column(
  'public',
  'groups',
  'city_id',
  'Groups have no locality field or city eligibility boundary'
);

select ok(
  private.discovery_window_is_valid(
    '2026-08-31 00:00:00+03'::timestamptz,
    '2026-10-22 00:00:00+03'::timestamptz,
    '2026-08-31 12:00:00+03'::timestamptz
  ),
  'discovery accepts a multi-month window inside the active football season'
);

select ok(
  not private.discovery_window_is_valid(
    '2026-08-31 00:00:00+03'::timestamptz,
    '2027-06-02 00:00:00+03'::timestamptz,
    '2026-08-31 12:00:00+03'::timestamptz
  ),
  'discovery rejects a date after the active football season'
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
    ('fb000000-0000-4000-8000-000000000101'::uuid, 'global-owner@example.test'),
    ('fb000000-0000-4000-8000-000000000102'::uuid, 'cross-city-applicant@example.test')
) as fixture(id, email);

update public.profiles
set
  handle = case id
    when 'fb000000-0000-4000-8000-000000000101' then 'global_owner'
    else 'cross_city_applicant'
  end,
  display_name = case id
    when 'fb000000-0000-4000-8000-000000000101' then 'Global Owner'
    else 'Cross City Applicant'
  end,
  adult_attested_at = statement_timestamp(),
  rules_version = 1,
  rules_accepted_at = statement_timestamp(),
  profile_completed_at = statement_timestamp(),
  fan_enabled_at = statement_timestamp()
where id in (
  'fb000000-0000-4000-8000-000000000101',
  'fb000000-0000-4000-8000-000000000102'
);

set local role authenticated;
set local "request.jwt.claim.sub" = 'fb000000-0000-4000-8000-000000000101';

select lives_ok(
  $$
    select *
    from public.create_group(
      'Global Match Friends',
      'global-match-friends',
      null,
      'discoverable',
      'A group that welcomes supporters regardless of where they live.',
      'fb000000-0000-4000-8000-000000000199'
    )
  $$,
  'an eligible Fan can create a discoverable group without selecting a city'
);

select is(
  (
    select count(*)
    from public.search_groups(
      'Global Match',
      null,
      null,
      null,
      null,
      20
    )
    where slug = 'global-match-friends'
  ),
  1::bigint,
  'global group search returns the discoverable group without locality input'
);

select is(
  (
    select count(*)
    from public.list_my_group_relationships('all', 20, 0)
    where slug = 'global-match-friends'
  ),
  1::bigint,
  'My Huddle all-groups bucket includes the owned group'
);

set local "request.jwt.claim.sub" = 'fb000000-0000-4000-8000-000000000102';

select lives_ok(
  $$
    select *
    from public.apply_to_group(
      (select id from public.groups where slug = 'global-match-friends'),
      'I would like to join from another city.',
      'fb000000-0000-4000-8000-000000000198'
    )
  $$,
  'any eligible Fan can apply to a discoverable group'
);

select is(
  (
    select status::text
    from public.group_memberships
    where group_id = (select id from public.groups where slug = 'global-match-friends')
      and user_id = 'fb000000-0000-4000-8000-000000000102'
  ),
  'pending'::text,
  'the application is retained as pending for review'
);

reset role;
select * from finish();
rollback;
