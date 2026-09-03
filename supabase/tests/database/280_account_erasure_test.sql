begin;

create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public, pg_catalog;

select no_plan();

select has_column(
  'public',
  'profiles',
  'deleted_at',
  'profiles expose the canonical account-erasure marker'
);
select has_function(
  'public',
  'prepare_account_erasure',
  array['text', 'uuid'],
  'account erasure has one authenticated product-data preparation RPC'
);
select ok(
  has_function_privilege(
    'authenticated',
    'public.prepare_account_erasure(text,uuid)',
    'execute'
  )
  and not has_function_privilege(
    'anon',
    'public.prepare_account_erasure(text,uuid)',
    'execute'
  ),
  'only authenticated callers can reach account-erasure preparation'
);
select ok(
  (
    select procedure.prosecdef
      and procedure.proconfig = array['search_path=""']::text[]
    from pg_catalog.pg_proc as procedure
    join pg_catalog.pg_namespace as namespace on namespace.oid = procedure.pronamespace
    where namespace.nspname = 'public'
      and procedure.oid = pg_catalog.to_regprocedure(
        'public.prepare_account_erasure(text,uuid)'
      )
  ),
  'account-erasure preparation is security definer with an empty search path'
);
select ok(
  exists (
    select 1
    from pg_catalog.pg_indexes as index_definition
    where index_definition.schemaname = 'public'
      and index_definition.tablename = 'profiles'
      and index_definition.indexname = 'profiles_deleted_at_idx'
      and index_definition.indexdef like '%WHERE (deleted_at IS NOT NULL)'
  ),
  'deleted profile tombstones have the required partial index'
);
select has_trigger(
  'public', 'subscriptions', 'subscriptions_serialize_actor_mutation',
  'direct subscription writes share the account-erasure actor lock'
);
select has_trigger(
  'public', 'venue_follows', 'venue_follows_serialize_actor_mutation',
  'direct Venue-follow writes share the account-erasure actor lock'
);
select ok(
  not has_table_privilege('authenticated', 'public.event_invitations', 'select')
  and not has_table_privilege('authenticated', 'public.event_attendance', 'select'),
  'event invitation and attendance history retain their stricter RPC-only ACL'
);

select throws_ok(
  $$ select public.prepare_account_erasure('DELETE', null) $$,
  'P0001', 'AUTH_REQUIRED',
  'anonymous callers cannot prepare account erasure'
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
    ('e4000000-0000-4000-8000-000000000281'::uuid, 'erase-actor@example.test'),
    ('e4000000-0000-4000-8000-000000000282'::uuid, 'erase-friend@example.test'),
    ('e4000000-0000-4000-8000-000000000283'::uuid, 'erase-outsider@example.test'),
    ('e4000000-0000-4000-8000-000000000284'::uuid, 'erase-moderator@example.test')
) as fixture(id, email);

update public.profiles as profile
set
  handle = case profile.id
    when 'e4000000-0000-4000-8000-000000000281' then 'erase_actor'
    when 'e4000000-0000-4000-8000-000000000282' then 'erase_friend'
    when 'e4000000-0000-4000-8000-000000000283' then 'erase_outsider'
    else 'erase_moderator'
  end,
  display_name = case profile.id
    when 'e4000000-0000-4000-8000-000000000281' then 'Erase Actor'
    when 'e4000000-0000-4000-8000-000000000282' then 'Erase Friend'
    when 'e4000000-0000-4000-8000-000000000283' then 'Erase Outsider'
    else 'Erase Moderator'
  end,
  bio = case
    when profile.id = 'e4000000-0000-4000-8000-000000000281'
      then 'Private biography that must be erased.'
    else null
  end,
  adult_attested_at = statement_timestamp(),
  rules_version = private.current_rules_version(),
  rules_accepted_at = statement_timestamp(),
  profile_completed_at = statement_timestamp(),
  fan_enabled_at = statement_timestamp()
where profile.id in (
  'e4000000-0000-4000-8000-000000000281',
  'e4000000-0000-4000-8000-000000000282',
  'e4000000-0000-4000-8000-000000000283',
  'e4000000-0000-4000-8000-000000000284'
);

insert into public.competitions (
  id, sport_id, provider, provider_external_id, code, name, country_name,
  last_synced_at
)
values (
  'e4000000-0000-4000-8000-000000000401',
  '00000000-0000-4000-8000-000000000020',
  'account-erasure-test', 'competition', 'AET', 'Account Erasure League',
  'England', statement_timestamp()
);

insert into public.teams (
  id, sport_id, provider, provider_external_id, name, short_name, tla,
  country_name, last_synced_at
)
values
  (
    'e4000000-0000-4000-8000-000000000402',
    '00000000-0000-4000-8000-000000000020',
    'account-erasure-test', 'home', 'Erasure Home FC', 'Erasure Home', 'ERH',
    'England', statement_timestamp()
  ),
  (
    'e4000000-0000-4000-8000-000000000403',
    '00000000-0000-4000-8000-000000000020',
    'account-erasure-test', 'away', 'Erasure Away FC', 'Erasure Away', 'ERA',
    'England', statement_timestamp()
  );

insert into public.matches (
  id, provider, provider_external_id, competition_id, home_team_id, away_team_id,
  starts_at, status, matchday, season_label, last_synced_at
)
values (
  'e4000000-0000-4000-8000-000000000404',
  'account-erasure-test', 'match',
  'e4000000-0000-4000-8000-000000000401',
  'e4000000-0000-4000-8000-000000000402',
  'e4000000-0000-4000-8000-000000000403',
  statement_timestamp() + interval '10 days', 'timed', 1, '2026',
  statement_timestamp()
);

insert into public.groups (
  id, slug, name, owner_id, visibility, lifecycle, description, activated_at
)
values
  (
    'e4000000-0000-4000-8000-000000000501',
    'erase-owned-group', 'Erase Owned Group',
    'e4000000-0000-4000-8000-000000000281',
    'unlisted', 'active', 'A group owned by the account being erased.',
    statement_timestamp()
  ),
  (
    'e4000000-0000-4000-8000-000000000502',
    'erase-other-group', 'Erase Other Group',
    'e4000000-0000-4000-8000-000000000282',
    'unlisted', 'active', 'A group where the erased account is only an admin.',
    statement_timestamp()
  ),
  (
    'e4000000-0000-4000-8000-000000000503',
    'erase-unrelated-group', 'Erase Unrelated Group',
    'e4000000-0000-4000-8000-000000000283',
    'unlisted', 'active', 'An unrelated group whose invitations remain active.',
    statement_timestamp()
  ),
  (
    'e4000000-0000-4000-8000-000000000504',
    'erase-rejected-group', 'Erase Rejected Group',
    'e4000000-0000-4000-8000-000000000282',
    'unlisted', 'active', 'A group retaining a rejected membership row.',
    statement_timestamp()
  ),
  (
    'e4000000-0000-4000-8000-000000000505',
    'erase-left-group', 'Erase Left Group',
    'e4000000-0000-4000-8000-000000000282',
    'unlisted', 'active', 'A group retaining a left membership row.',
    statement_timestamp()
  ),
  (
    'e4000000-0000-4000-8000-000000000506',
    'erase-banned-group', 'Erase Banned Group',
    'e4000000-0000-4000-8000-000000000283',
    'unlisted', 'active', 'A group retaining a banned membership row.',
    statement_timestamp()
  );

insert into public.group_memberships (
  group_id, user_id, role, status, application_message, reviewed_by, reviewed_at
)
values
  (
    'e4000000-0000-4000-8000-000000000501',
    'e4000000-0000-4000-8000-000000000281',
    'owner', 'active', 'Sensitive owner application prose.', null, null
  ),
  (
    'e4000000-0000-4000-8000-000000000502',
    'e4000000-0000-4000-8000-000000000282',
    'owner', 'active', null, null, null
  ),
  (
    'e4000000-0000-4000-8000-000000000502',
    'e4000000-0000-4000-8000-000000000281',
    'admin', 'active', 'Sensitive active application prose.',
    'e4000000-0000-4000-8000-000000000282', statement_timestamp()
  ),
  (
    'e4000000-0000-4000-8000-000000000503',
    'e4000000-0000-4000-8000-000000000283',
    'owner', 'active', null, null, null
  ),
  (
    'e4000000-0000-4000-8000-000000000503',
    'e4000000-0000-4000-8000-000000000281',
    'member', 'pending', 'Sensitive pending application prose.', null, null
  ),
  (
    'e4000000-0000-4000-8000-000000000504',
    'e4000000-0000-4000-8000-000000000282',
    'owner', 'active', null, null, null
  ),
  (
    'e4000000-0000-4000-8000-000000000504',
    'e4000000-0000-4000-8000-000000000281',
    'member', 'rejected', 'Sensitive rejected application prose.',
    'e4000000-0000-4000-8000-000000000282', statement_timestamp()
  ),
  (
    'e4000000-0000-4000-8000-000000000505',
    'e4000000-0000-4000-8000-000000000282',
    'owner', 'active', null, null, null
  ),
  (
    'e4000000-0000-4000-8000-000000000505',
    'e4000000-0000-4000-8000-000000000281',
    'member', 'left', 'Sensitive left application prose.',
    'e4000000-0000-4000-8000-000000000282', statement_timestamp()
  ),
  (
    'e4000000-0000-4000-8000-000000000506',
    'e4000000-0000-4000-8000-000000000283',
    'owner', 'active', null, null, null
  ),
  (
    'e4000000-0000-4000-8000-000000000506',
    'e4000000-0000-4000-8000-000000000281',
    'member', 'banned', 'Sensitive banned application prose.',
    'e4000000-0000-4000-8000-000000000283', statement_timestamp()
  );

insert into public.venues (
  id, owner_id, slug, name, address_text, location, description,
  stated_capacity, verification_status
)
values
  (
    'e4000000-0000-4000-8000-000000000601',
    'e4000000-0000-4000-8000-000000000281',
    'erase-owned-venue', 'Erase Owned Venue',
    '10 Venue Street, Haifa',
    extensions.st_setsrid(
      extensions.st_makepoint(34.998, 32.812), 4326
    )::extensions.geography,
    'A Venue owned by the account being erased.',
    80, 'unverified'
  ),
  (
    'e4000000-0000-4000-8000-000000000602',
    'e4000000-0000-4000-8000-000000000282',
    'erase-other-venue', 'Erase Other Venue',
    '11 Venue Street, Haifa',
    extensions.st_setsrid(
      extensions.st_makepoint(34.999, 32.813), 4326
    )::extensions.geography,
    'A Venue where the erased account is only an admin.',
    60, 'unverified'
  );

insert into public.venue_memberships (venue_id, user_id, role, status)
values (
  'e4000000-0000-4000-8000-000000000602',
  'e4000000-0000-4000-8000-000000000281',
  'admin', 'active'
);

insert into public.events (
  id, created_by, host_user_id, match_id, title, description,
  expected_activity, cost_description, event_rules, commercial_affiliation,
  host_presence_confirmed_at, starts_at, ends_at, place_kind, audience,
  capacity, requires_approval, status, published_at
)
values
  (
    'e4000000-0000-4000-8000-000000000701',
    'e4000000-0000-4000-8000-000000000281',
    'e4000000-0000-4000-8000-000000000281',
    'e4000000-0000-4000-8000-000000000404',
    'Erased personal home event',
    'A future home event directly hosted by the erased account.',
    'Watch together', 'Free entry', 'Respect the host.', 'None',
    statement_timestamp(), statement_timestamp() + interval '7 days',
    statement_timestamp() + interval '7 days 3 hours',
    'home', 'invite_only', 8, true, 'published', statement_timestamp()
  ),
  (
    'e4000000-0000-4000-8000-000000000704',
    'e4000000-0000-4000-8000-000000000282',
    'e4000000-0000-4000-8000-000000000282',
    'e4000000-0000-4000-8000-000000000404',
    'External approved event',
    'A future event where the erased account has approved attendance.',
    'Watch together', 'Free entry', 'Respect the host.', 'None',
    statement_timestamp(), statement_timestamp() + interval '7 days 30 minutes',
    statement_timestamp() + interval '7 days 3 hours 30 minutes',
    'home', 'invite_only', 8, true, 'published', statement_timestamp()
  ),
  (
    'e4000000-0000-4000-8000-000000000705',
    'e4000000-0000-4000-8000-000000000283',
    'e4000000-0000-4000-8000-000000000283',
    'e4000000-0000-4000-8000-000000000404',
    'External requested event',
    'A future event where the erased account has requested attendance.',
    'Watch together', 'Free entry', 'Respect the host.', 'None',
    statement_timestamp(), statement_timestamp() + interval '7 days 45 minutes',
    statement_timestamp() + interval '7 days 3 hours 45 minutes',
    'home', 'invite_only', 8, true, 'published', statement_timestamp()
  ),
  (
    'e4000000-0000-4000-8000-000000000706',
    'e4000000-0000-4000-8000-000000000281',
    'e4000000-0000-4000-8000-000000000281',
    'e4000000-0000-4000-8000-000000000404',
    'Erased approved home event',
    'A future erased-host home event retaining another approved attendee.',
    'Watch together', 'Free entry', 'Respect the host.', 'None',
    statement_timestamp(), statement_timestamp() + interval '7 days 50 minutes',
    statement_timestamp() + interval '7 days 3 hours 50 minutes',
    'home', 'invite_only', 8, true, 'published', statement_timestamp()
  ),
  (
    'e4000000-0000-4000-8000-000000000707',
    'e4000000-0000-4000-8000-000000000283',
    'e4000000-0000-4000-8000-000000000283',
    'e4000000-0000-4000-8000-000000000404',
    'Unrelated cancelled event',
    'A pre-cancelled unrelated event with the same generic reason.',
    'Watch together', 'Free entry', 'Respect the host.', 'None',
    statement_timestamp(), statement_timestamp() + interval '8 days',
    statement_timestamp() + interval '8 days 3 hours',
    'home', 'invite_only', 8, true, 'published', statement_timestamp()
  );

update public.events as event
set
  status = 'cancelled',
  cancelled_at = statement_timestamp(),
  cancel_reason = 'Host account deleted.'
where event.id = 'e4000000-0000-4000-8000-000000000707';

insert into public.events (
  id, created_by, host_user_id, organizing_group_id, match_id, title, description,
  expected_activity, cost_description, event_rules, commercial_affiliation,
  host_presence_confirmed_at, starts_at, ends_at, place_kind,
  public_place_name, public_address_text, public_location,
  audience, audience_group_id, capacity, requires_approval, status, published_at
)
values (
  'e4000000-0000-4000-8000-000000000702',
  'e4000000-0000-4000-8000-000000000282',
  'e4000000-0000-4000-8000-000000000282',
  'e4000000-0000-4000-8000-000000000501',
  'e4000000-0000-4000-8000-000000000404',
  'Erased owned group event',
  'A future event organized through the erased account owned group.',
  'Watch together', 'Free entry', 'Respect the group.', 'None',
  statement_timestamp(), statement_timestamp() + interval '7 days 10 minutes',
  statement_timestamp() + interval '7 days 3 hours 10 minutes',
  'public_place', 'Supporters Hall', '12 Public Street, Haifa',
  extensions.st_setsrid(
    extensions.st_makepoint(35.000, 32.814), 4326
  )::extensions.geography,
  'group', 'e4000000-0000-4000-8000-000000000501',
  20, true, 'published', statement_timestamp()
);

insert into public.events (
  id, created_by, host_venue_id, match_id, title, description,
  expected_activity, cost_description, event_rules, commercial_affiliation,
  host_presence_confirmed_at, starts_at, ends_at, place_kind, venue_id,
  audience, capacity, requires_approval, status, published_at
)
values (
  'e4000000-0000-4000-8000-000000000703',
  'e4000000-0000-4000-8000-000000000281',
  'e4000000-0000-4000-8000-000000000601',
  'e4000000-0000-4000-8000-000000000404',
  'Erased owned Venue event',
  'A future event hosted through the erased account owned Venue.',
  'Watch together', 'Free entry', 'Respect the Venue.', 'Venue-hosted',
  statement_timestamp(), statement_timestamp() + interval '7 days 20 minutes',
  statement_timestamp() + interval '7 days 3 hours 20 minutes',
  'venue', 'e4000000-0000-4000-8000-000000000601',
  'public', 80, false, 'published', statement_timestamp()
);

insert into public.event_private_locations (
  event_id, address_text, directions, location
)
values
  (
    'e4000000-0000-4000-8000-000000000701',
    '99 Exact Home Street, Haifa', 'Ring the private bell.',
    extensions.st_setsrid(
      extensions.st_makepoint(35.001, 32.815), 4326
    )::extensions.geography
  ),
  (
    'e4000000-0000-4000-8000-000000000704',
    '94 External Home Street, Haifa', 'Ordinary protected location.',
    extensions.st_setsrid(
      extensions.st_makepoint(35.003, 32.817), 4326
    )::extensions.geography
  ),
  (
    'e4000000-0000-4000-8000-000000000705',
    '95 External Home Street, Haifa', 'Ordinary requested location.',
    extensions.st_setsrid(
      extensions.st_makepoint(35.004, 32.818), 4326
    )::extensions.geography
  ),
  (
    'e4000000-0000-4000-8000-000000000706',
    '96 Approved Home Street, Haifa', 'Approved attendee location.',
    extensions.st_setsrid(
      extensions.st_makepoint(35.005, 32.819), 4326
    )::extensions.geography
  ),
  (
    'e4000000-0000-4000-8000-000000000707',
    '97 Cancelled Home Street, Haifa', 'Unrelated cancelled location.',
    extensions.st_setsrid(
      extensions.st_makepoint(35.006, 32.820), 4326
    )::extensions.geography
  );

insert into public.event_drafts (
  id, owner_id, step, draft_values, organizing_group_id
)
values (
  'e4000000-0000-4000-8000-000000000710',
  'e4000000-0000-4000-8000-000000000281',
  2, '{"title":"Private unfinished draft"}'::jsonb,
  'e4000000-0000-4000-8000-000000000501'
);
insert into public.event_draft_private_locations (
  draft_id, address_text, directions_text, location
)
values (
  'e4000000-0000-4000-8000-000000000710',
  '98 Exact Draft Street, Haifa', 'Private draft directions.',
  extensions.st_setsrid(
    extensions.st_makepoint(35.002, 32.816), 4326
  )::extensions.geography
);

insert into public.event_invitations (
  id, event_id, invitee_id, invited_by
)
values
  (
    'e4000000-0000-4000-8000-000000000721',
    'e4000000-0000-4000-8000-000000000701',
    'e4000000-0000-4000-8000-000000000282',
    'e4000000-0000-4000-8000-000000000281'
  ),
  (
    'e4000000-0000-4000-8000-000000000722',
    'e4000000-0000-4000-8000-000000000702',
    'e4000000-0000-4000-8000-000000000283',
    'e4000000-0000-4000-8000-000000000282'
  ),
  (
    'e4000000-0000-4000-8000-000000000723',
    'e4000000-0000-4000-8000-000000000704',
    'e4000000-0000-4000-8000-000000000281',
    'e4000000-0000-4000-8000-000000000282'
  ),
  (
    'e4000000-0000-4000-8000-000000000724',
    'e4000000-0000-4000-8000-000000000707',
    'e4000000-0000-4000-8000-000000000284',
    'e4000000-0000-4000-8000-000000000283'
  );

insert into public.event_invite_tokens (
  id, event_id, token_hash, created_by, expires_at, max_uses
)
values
  (
    'e4000000-0000-4000-8000-000000000731',
    'e4000000-0000-4000-8000-000000000701', repeat('a', 64),
    'e4000000-0000-4000-8000-000000000281',
    statement_timestamp() + interval '1 day', 10
  ),
  (
    'e4000000-0000-4000-8000-000000000732',
    'e4000000-0000-4000-8000-000000000702', repeat('b', 64),
    'e4000000-0000-4000-8000-000000000282',
    statement_timestamp() + interval '1 day', 10
  ),
  (
    'e4000000-0000-4000-8000-000000000733',
    'e4000000-0000-4000-8000-000000000703', repeat('c', 64),
    'e4000000-0000-4000-8000-000000000282',
    statement_timestamp() + interval '1 day', 10
  ),
  (
    'e4000000-0000-4000-8000-000000000734',
    'e4000000-0000-4000-8000-000000000704', repeat('d', 64),
    'e4000000-0000-4000-8000-000000000281',
    statement_timestamp() + interval '1 day', 10
  ),
  (
    'e4000000-0000-4000-8000-000000000735',
    'e4000000-0000-4000-8000-000000000707', repeat('e', 64),
    'e4000000-0000-4000-8000-000000000283',
    statement_timestamp() + interval '1 day', 10
  );

insert into public.event_invite_tokens (
  id, event_id, token_hash, created_by, expires_at, max_uses, use_count,
  created_at, updated_at
)
values
  (
    'e4000000-0000-4000-8000-000000000736',
    'e4000000-0000-4000-8000-000000000701', repeat('2', 64),
    'e4000000-0000-4000-8000-000000000281',
    statement_timestamp() - interval '1 day', 10, 0,
    statement_timestamp() - interval '2 days',
    statement_timestamp() - interval '2 days'
  ),
  (
    'e4000000-0000-4000-8000-000000000737',
    'e4000000-0000-4000-8000-000000000701', repeat('3', 64),
    'e4000000-0000-4000-8000-000000000281',
    statement_timestamp() + interval '1 day', 1, 1,
    statement_timestamp(), statement_timestamp()
  );

insert into public.group_invitations (
  id, group_id, invitee_id, invited_by
)
values
  (
    'e4000000-0000-4000-8000-000000000741',
    'e4000000-0000-4000-8000-000000000501',
    'e4000000-0000-4000-8000-000000000283',
    'e4000000-0000-4000-8000-000000000281'
  ),
  (
    'e4000000-0000-4000-8000-000000000742',
    'e4000000-0000-4000-8000-000000000502',
    'e4000000-0000-4000-8000-000000000281',
    'e4000000-0000-4000-8000-000000000282'
  ),
  (
    'e4000000-0000-4000-8000-000000000743',
    'e4000000-0000-4000-8000-000000000503',
    'e4000000-0000-4000-8000-000000000284',
    'e4000000-0000-4000-8000-000000000283'
  );

insert into public.group_invite_tokens (
  id, group_id, token_hash, created_by, expires_at, max_uses
)
values
  (
    'e4000000-0000-4000-8000-000000000751',
    'e4000000-0000-4000-8000-000000000501', repeat('f', 64),
    'e4000000-0000-4000-8000-000000000282',
    statement_timestamp() + interval '1 day', 10
  ),
  (
    'e4000000-0000-4000-8000-000000000752',
    'e4000000-0000-4000-8000-000000000502', repeat('0', 64),
    'e4000000-0000-4000-8000-000000000281',
    statement_timestamp() + interval '1 day', 10
  ),
  (
    'e4000000-0000-4000-8000-000000000753',
    'e4000000-0000-4000-8000-000000000503', repeat('1', 64),
    'e4000000-0000-4000-8000-000000000283',
    statement_timestamp() + interval '1 day', 10
  );

insert into public.group_invite_tokens (
  id, group_id, token_hash, created_by, expires_at, max_uses, use_count,
  created_at, updated_at
)
values
  (
    'e4000000-0000-4000-8000-000000000754',
    'e4000000-0000-4000-8000-000000000501', repeat('4', 64),
    'e4000000-0000-4000-8000-000000000281',
    statement_timestamp() - interval '1 day', 10, 0,
    statement_timestamp() - interval '2 days',
    statement_timestamp() - interval '2 days'
  ),
  (
    'e4000000-0000-4000-8000-000000000755',
    'e4000000-0000-4000-8000-000000000501', repeat('5', 64),
    'e4000000-0000-4000-8000-000000000281',
    statement_timestamp() + interval '1 day', 1, 1,
    statement_timestamp(), statement_timestamp()
  );

insert into public.event_attendance (
  id, event_id, user_id, status, source, reviewed_by, reviewed_at
)
values
  (
    'e4000000-0000-4000-8000-000000000761',
    'e4000000-0000-4000-8000-000000000704',
    'e4000000-0000-4000-8000-000000000281',
    'approved', 'self_request',
    'e4000000-0000-4000-8000-000000000282', statement_timestamp()
  ),
  (
    'e4000000-0000-4000-8000-000000000762',
    'e4000000-0000-4000-8000-000000000705',
    'e4000000-0000-4000-8000-000000000281',
    'requested', 'self_request', null, null
  ),
  (
    'e4000000-0000-4000-8000-000000000763',
    'e4000000-0000-4000-8000-000000000706',
    'e4000000-0000-4000-8000-000000000282',
    'approved', 'direct_invite',
    'e4000000-0000-4000-8000-000000000281', statement_timestamp()
  );

select throws_ok(
  $$
    delete from public.event_private_locations
    where event_id = 'e4000000-0000-4000-8000-000000000704'
  $$,
  'P0001', 'MATERIAL_CHANGE_REQUIRES_NEW_EVENT',
  'ordinary live home-event locations remain protected before erasure'
);

insert into public.subscriptions (user_id, kind, sport_id)
values (
  'e4000000-0000-4000-8000-000000000281',
  'sport', '00000000-0000-4000-8000-000000000020'
);
insert into public.venue_follows (user_id, venue_id)
values (
  'e4000000-0000-4000-8000-000000000281',
  'e4000000-0000-4000-8000-000000000602'
);
insert into public.friendships (
  user_low_id, user_high_id, requested_by, status, responded_at
)
values (
  'e4000000-0000-4000-8000-000000000281',
  'e4000000-0000-4000-8000-000000000282',
  'e4000000-0000-4000-8000-000000000281',
  'accepted', statement_timestamp()
);
insert into public.user_blocks (blocker_id, blocked_id)
values
  (
    'e4000000-0000-4000-8000-000000000281',
    'e4000000-0000-4000-8000-000000000283'
  ),
  (
    'e4000000-0000-4000-8000-000000000284',
    'e4000000-0000-4000-8000-000000000281'
  );
insert into public.platform_roles (profile_id, role)
values ('e4000000-0000-4000-8000-000000000281', 'moderator');

insert into private.location_search_rate_limits (
  actor_id, purpose, window_started_at, request_count
)
values (
  'e4000000-0000-4000-8000-000000000281',
  'origin', statement_timestamp(), 1
);
insert into private.assisted_discovery_actor_rate_limits (
  actor_id, minute_started_at, minute_count, day_value, day_count
)
values (
  'e4000000-0000-4000-8000-000000000281',
  statement_timestamp(), 1,
  (statement_timestamp() at time zone 'Asia/Jerusalem')::date, 1
);

insert into public.reports (
  id, reporter_id, target_type, profile_id, category, details
)
values (
  'e4000000-0000-4000-8000-000000000901',
  'e4000000-0000-4000-8000-000000000282',
  'profile', 'e4000000-0000-4000-8000-000000000281', 'other',
  'A retained report fixture with enough bounded detail.'
);
insert into public.moderation_actions (
  id, report_id, moderator_id, target_type, profile_id, action, reason
)
values (
  'e4000000-0000-4000-8000-000000000902',
  'e4000000-0000-4000-8000-000000000901',
  'e4000000-0000-4000-8000-000000000284',
  'profile', 'e4000000-0000-4000-8000-000000000281',
  'warning', 'A retained moderation action with enough reason.'
);
insert into public.moderation_appeals (
  id, moderation_action_id, appellant_id, reason
)
values (
  'e4000000-0000-4000-8000-000000000903',
  'e4000000-0000-4000-8000-000000000902',
  'e4000000-0000-4000-8000-000000000281',
  'A retained appeal fixture with enough bounded detail.'
);

-- Production already denies these two base-table reads at the ACL. Grant them
-- only inside this rolled-back test so the new RLS predicates are exercised too.
grant select on public.event_invitations, public.event_attendance to authenticated;

set local role authenticated;
set local "request.jwt.claim.sub" = 'e4000000-0000-4000-8000-000000000281';

select throws_ok(
  $$ select public.prepare_account_erasure('delete', null) $$,
  'P0001', 'CONFIRMATION_MISMATCH',
  'account erasure requires the exact DELETE confirmation'
);
select is(
  public.prepare_account_erasure(
    'DELETE', 'e4000000-0000-4000-8000-000000000280'
  ),
  true,
  'the signed-in actor prepares erasure'
);
select throws_ok(
  $$ select * from public.claim_ephemeral_location_search('origin') $$,
  'P0001', 'AUTH_REQUIRED',
  'a stale JWT cannot cross a central post-erasure mutation gate'
);
select is(
  (select count(*) from public.group_memberships),
  0::bigint,
  'a stale JWT cannot read retained group membership history'
);
select is(
  (select count(*) from public.venue_memberships),
  0::bigint,
  'a stale JWT cannot read retained Venue membership history'
);
select is(
  (select count(*) from public.event_invitations),
  0::bigint,
  'a stale JWT cannot read retained event invitation history'
);
select is(
  (select count(*) from public.event_attendance),
  0::bigint,
  'a stale JWT cannot read retained attendance history'
);
select results_eq(
  $$
    select handle, display_name, bio, deleted_at is not null
    from public.profiles
    where id = auth.uid()
  $$,
  $$ values (null::text, 'Deleted account'::text, null::text, true) $$,
  'the own-profile policy exposes only the sanitized tombstone to a stale JWT'
);
select throws_ok(
  $$
    insert into public.subscriptions (user_id, kind, sport_id)
    values (
      'e4000000-0000-4000-8000-000000000281',
      'sport', '00000000-0000-4000-8000-000000000020'
    )
  $$,
  'P0001', 'ACCOUNT_DELETED',
  'the serialized direct subscription path rejects a tombstoned actor'
);
select throws_ok(
  $$
    insert into public.venue_follows (user_id, venue_id)
    values (
      'e4000000-0000-4000-8000-000000000281',
      'e4000000-0000-4000-8000-000000000602'
    )
  $$,
  'P0001', 'ACCOUNT_DELETED',
  'the serialized direct Venue-follow path rejects a tombstoned actor'
);

reset role;
select pg_catalog.set_config('request.jwt.claim.sub', '', true);

-- Simulate residue left after a provider failure or a privileged repair. An
-- idempotent preparation retry must reconcile it without adding another audit.
insert into public.subscriptions (user_id, kind, sport_id)
values (
  'e4000000-0000-4000-8000-000000000281',
  'sport', '00000000-0000-4000-8000-000000000020'
);
insert into public.venue_follows (user_id, venue_id)
values (
  'e4000000-0000-4000-8000-000000000281',
  'e4000000-0000-4000-8000-000000000602'
);

set local role authenticated;
set local "request.jwt.claim.sub" = 'e4000000-0000-4000-8000-000000000281';
select is(
  public.prepare_account_erasure(
    'DELETE', 'e4000000-0000-4000-8000-000000000280'
  ),
  true,
  'an idempotent retry reconciles residue without repeating the transition'
);

reset role;
select pg_catalog.set_config('request.jwt.claim.sub', '', true);

select results_eq(
  $$
    select
      handle, display_name, bio, adult_attested_at, rules_version,
      rules_accepted_at, fan_enabled_at, profile_completed_at,
      deleted_at is not null
    from public.profiles
    where id = 'e4000000-0000-4000-8000-000000000281'
  $$,
  $$
    values (
      null::text, 'Deleted account'::text, null::text,
      null::timestamptz, null::integer, null::timestamptz,
      null::timestamptz, null::timestamptz, true
    )
  $$,
  'the profile becomes a non-public tombstone'
);

select results_eq(
  $$
    select id, status::text, cancel_reason
    from public.events
    where id in (
      'e4000000-0000-4000-8000-000000000701',
      'e4000000-0000-4000-8000-000000000702',
      'e4000000-0000-4000-8000-000000000703',
      'e4000000-0000-4000-8000-000000000706'
    )
    order by id
  $$,
  $$
    values
      (
        'e4000000-0000-4000-8000-000000000701'::uuid,
        'cancelled'::text, 'Host account deleted.'::text
      ),
      (
        'e4000000-0000-4000-8000-000000000702'::uuid,
        'cancelled'::text, 'Host account deleted.'::text
      ),
      (
        'e4000000-0000-4000-8000-000000000703'::uuid,
        'cancelled'::text, 'Host account deleted.'::text
      ),
      (
        'e4000000-0000-4000-8000-000000000706'::uuid,
        'cancelled'::text, 'Host account deleted.'::text
      )
  $$,
  'future personal, owned-group, and owned-Venue events are cancelled'
);
select is(
  (
    select status::text
    from public.events
    where id = 'e4000000-0000-4000-8000-000000000704'
  ),
  'published'::text,
  'an event merely attended by the actor remains live'
);

select results_eq(
  $$
    select id, status::text, responded_at is not null
    from public.event_invitations
    where id in (
      'e4000000-0000-4000-8000-000000000721',
      'e4000000-0000-4000-8000-000000000722',
      'e4000000-0000-4000-8000-000000000723'
    )
    order by id
  $$,
  $$
    values
      ('e4000000-0000-4000-8000-000000000721'::uuid, 'revoked'::text, true),
      ('e4000000-0000-4000-8000-000000000722'::uuid, 'revoked'::text, true),
      ('e4000000-0000-4000-8000-000000000723'::uuid, 'revoked'::text, true)
  $$,
  'pending event invitations involving the actor or owned events are revoked'
);
select results_eq(
  $$
    select status::text, responded_at is null
    from public.event_invitations
    where id = 'e4000000-0000-4000-8000-000000000724'
  $$,
  $$ values ('pending'::text, true) $$,
  'an unrelated event invitation is not revoked by a matching cancel reason'
);

select is(
  (
    select count(*)
    from public.event_invite_tokens
    where id in (
      'e4000000-0000-4000-8000-000000000731',
      'e4000000-0000-4000-8000-000000000732',
      'e4000000-0000-4000-8000-000000000733',
      'e4000000-0000-4000-8000-000000000734'
    )
      and revoked_at is not null
      and revoked_by = 'e4000000-0000-4000-8000-000000000281'
  ),
  4::bigint,
  'actor-created and actor-owned event invite tokens are revoked'
);
select is(
  (
    select count(*)
    from public.event_invite_tokens
    where id in (
      'e4000000-0000-4000-8000-000000000736',
      'e4000000-0000-4000-8000-000000000737'
    )
      and revoked_at is null
      and revoked_by is null
  ),
  2::bigint,
  'expired and exhausted event tokens retain their historical outcome'
);
select ok(
  (
    select revoked_at is null and revoked_by is null
    from public.event_invite_tokens
    where id = 'e4000000-0000-4000-8000-000000000735'
  ),
  'an unrelated event token is not revoked by a matching cancel reason'
);

select results_eq(
  $$
    select id, status, responded_at is null, revoked_at is not null
    from public.group_invitations
    where id in (
      'e4000000-0000-4000-8000-000000000741',
      'e4000000-0000-4000-8000-000000000742'
    )
    order by id
  $$,
  $$
    values
      ('e4000000-0000-4000-8000-000000000741'::uuid, 'revoked'::text, true, true),
      ('e4000000-0000-4000-8000-000000000742'::uuid, 'revoked'::text, true, true)
  $$,
  'pending group invitations involving the actor or owned groups are revoked'
);
select is(
  (
    select status
    from public.group_invitations
    where id = 'e4000000-0000-4000-8000-000000000743'
  ),
  'pending'::text,
  'unrelated group invitations remain pending'
);
select is(
  (
    select count(*)
    from public.group_invite_tokens
    where id in (
      'e4000000-0000-4000-8000-000000000751',
      'e4000000-0000-4000-8000-000000000752'
    )
      and revoked_at is not null
  ),
  2::bigint,
  'actor-created and actor-owned group invite tokens are revoked'
);
select is(
  (
    select count(*)
    from public.group_invite_tokens
    where id in (
      'e4000000-0000-4000-8000-000000000754',
      'e4000000-0000-4000-8000-000000000755'
    )
      and revoked_at is null
  ),
  2::bigint,
  'expired and exhausted group tokens retain their historical outcome'
);
select is(
  (
    select revoked_at
    from public.group_invite_tokens
    where id = 'e4000000-0000-4000-8000-000000000753'
  ),
  null::timestamptz,
  'unrelated group invite tokens remain active'
);

select results_eq(
  $$
    select status::text, left_at is not null, removed_at is null,
      removed_by is null, removal_reason is null
    from public.event_attendance
    where user_id = 'e4000000-0000-4000-8000-000000000281'
    order by id
  $$,
  $$
    values
      ('left'::text, true, true, true, true),
      ('left'::text, true, true, true, true)
  $$,
  'requested and approved attendance become retained left history'
);
select is(
  (
    select count(*)
    from public.event_private_locations as location
    join public.events as event on event.id = location.event_id
    where event.host_user_id = 'e4000000-0000-4000-8000-000000000281'
  ),
  0::bigint,
  'every exact home location for an actor-hosted event is deleted'
);
select is(
  (
    select count(*)
    from public.event_attendance
    where event_id = 'e4000000-0000-4000-8000-000000000706'
      and user_id = 'e4000000-0000-4000-8000-000000000282'
      and status = 'approved'
  ),
  1::bigint,
  'another approved attendee remains as history after exact-location erasure'
);
select is(
  (
    select count(*)
    from public.event_drafts
    where owner_id = 'e4000000-0000-4000-8000-000000000281'
  ),
  0::bigint,
  'the actor draft and its cascading exact draft location are deleted'
);
select is(
  (
    select count(*)
    from public.event_draft_private_locations
    where draft_id = 'e4000000-0000-4000-8000-000000000710'
  ),
  0::bigint,
  'draft-location deletion follows the draft cascade'
);

select is(
  (
    select lifecycle::text
    from public.groups
    where id = 'e4000000-0000-4000-8000-000000000501'
  ),
  'archived'::text,
  'the actor owned group is archived'
);
select ok(
  (
    select archived_at is not null
      and archived_by = 'e4000000-0000-4000-8000-000000000281'
    from public.venues
    where id = 'e4000000-0000-4000-8000-000000000601'
  ),
  'the actor owned Venue is archived by its owner'
);
select results_eq(
  $$
    select group_id, role::text, status::text, application_message is null
    from public.group_memberships
    where user_id = 'e4000000-0000-4000-8000-000000000281'
    order by group_id
  $$,
  $$
    values
      (
        'e4000000-0000-4000-8000-000000000501'::uuid,
        'owner'::text, 'active'::text, true
      ),
      (
        'e4000000-0000-4000-8000-000000000502'::uuid,
        'member'::text, 'left'::text, true
      ),
      (
        'e4000000-0000-4000-8000-000000000503'::uuid,
        'member'::text, 'left'::text, true
      ),
      (
        'e4000000-0000-4000-8000-000000000504'::uuid,
        'member'::text, 'rejected'::text, true
      ),
      (
        'e4000000-0000-4000-8000-000000000505'::uuid,
        'member'::text, 'left'::text, true
      ),
      (
        'e4000000-0000-4000-8000-000000000506'::uuid,
        'member'::text, 'banned'::text, true
      )
  $$,
  'membership history remains while access ends and all application prose clears'
);
select results_eq(
  $$
    select venue_id, role::text, status::text, revoked_at is not null
    from public.venue_memberships
    where user_id = 'e4000000-0000-4000-8000-000000000281'
    order by venue_id
  $$,
  $$
    values
      (
        'e4000000-0000-4000-8000-000000000601'::uuid,
        'owner'::text, 'active'::text, false
      ),
      (
        'e4000000-0000-4000-8000-000000000602'::uuid,
        'admin'::text, 'revoked'::text, true
      )
  $$,
  'only the archived owned Venue keeps the required owner membership active'
);

select is(
  (
    select
      (select count(*) from public.subscriptions
        where user_id = 'e4000000-0000-4000-8000-000000000281')
      + (select count(*) from public.venue_follows
        where user_id = 'e4000000-0000-4000-8000-000000000281')
      + (select count(*) from public.friendships
        where user_low_id = 'e4000000-0000-4000-8000-000000000281'
          or user_high_id = 'e4000000-0000-4000-8000-000000000281')
      + (select count(*) from public.user_blocks
        where blocker_id = 'e4000000-0000-4000-8000-000000000281'
          or blocked_id = 'e4000000-0000-4000-8000-000000000281')
      + (select count(*) from public.platform_roles
        where profile_id = 'e4000000-0000-4000-8000-000000000281')
      + (select count(*) from private.location_search_rate_limits
        where actor_id = 'e4000000-0000-4000-8000-000000000281')
      + (select count(*) from private.assisted_discovery_actor_rate_limits
        where actor_id = 'e4000000-0000-4000-8000-000000000281')
  ),
  0::bigint,
  'follows, relationships, roles, and actor-scoped counters are deleted'
);

select results_eq(
  $$
    select
      (select count(*) from public.events
        where created_by = 'e4000000-0000-4000-8000-000000000281'),
      (select count(*) from public.event_attendance
        where user_id = 'e4000000-0000-4000-8000-000000000281'),
      (select count(*) from public.group_memberships
        where user_id = 'e4000000-0000-4000-8000-000000000281'),
      (select count(*) from public.reports
        where profile_id = 'e4000000-0000-4000-8000-000000000281'),
      (select count(*) from public.moderation_actions
        where profile_id = 'e4000000-0000-4000-8000-000000000281'),
      (select count(*) from public.moderation_appeals
        where appellant_id = 'e4000000-0000-4000-8000-000000000281')
  $$,
  $$ values (3::bigint, 2::bigint, 6::bigint, 1::bigint, 1::bigint, 1::bigint) $$,
  'event authorship, attendance, membership, report, action, and appeal history remain'
);

select results_eq(
  $$
    select actor_id, action, resource_type, resource_id, outcome, request_id, metadata
    from public.security_audit_events
    where action = 'account.erase.prepare'
      and actor_id = 'e4000000-0000-4000-8000-000000000281'
  $$,
  $$
    values (
      'e4000000-0000-4000-8000-000000000281'::uuid,
      'account.erase.prepare'::text, 'profile'::text,
      'e4000000-0000-4000-8000-000000000281'::uuid,
      'succeeded'::text,
      'e4000000-0000-4000-8000-000000000280'::uuid,
      '{"future_events_cancelled": 4}'::jsonb
    )
  $$,
  'one idempotent audit event contains only the approved integer count'
);

select is(
  (
    select count(*)
    from public.security_audit_events
    where action = 'account.erase.prepare'
      and actor_id = 'e4000000-0000-4000-8000-000000000281'
  ),
  1::bigint,
  'an idempotent retry does not write a second erasure audit event'
);

select ok(
  (
    select pg_catalog.bool_and(
      relation.relrowsecurity and relation.relforcerowsecurity
    )
    from pg_catalog.pg_class as relation
    join pg_catalog.pg_namespace as namespace on namespace.oid = relation.relnamespace
    where (namespace.nspname, relation.relname) in (
      ('public', 'profiles'),
      ('public', 'events'),
      ('public', 'event_invitations'),
      ('public', 'group_invitations'),
      ('public', 'event_invite_tokens'),
      ('public', 'group_invite_tokens'),
      ('public', 'event_attendance'),
      ('public', 'event_private_locations'),
      ('public', 'event_drafts'),
      ('public', 'groups'),
      ('public', 'venues'),
      ('public', 'group_memberships'),
      ('public', 'venue_memberships'),
      ('public', 'subscriptions'),
      ('public', 'venue_follows'),
      ('public', 'friendships'),
      ('public', 'user_blocks'),
      ('public', 'platform_roles'),
      ('public', 'reports'),
      ('public', 'moderation_actions'),
      ('public', 'moderation_appeals'),
      ('public', 'security_audit_events'),
      ('private', 'location_search_rate_limits'),
      ('private', 'assisted_discovery_actor_rate_limits')
    )
  ),
  'every table in the erasure boundary keeps forced RLS enabled'
);

select ok(
  pg_catalog.strpos(
    pg_catalog.pg_get_functiondef(
      'private.assert_actor(boolean)'::regprocedure
    ),
    'deleted_at'
  ) > 0
  and pg_catalog.strpos(
    pg_catalog.pg_get_functiondef(
      'private.assert_safety_actor(boolean)'::regprocedure
    ),
    'deleted_at'
  ) > 0
  and pg_catalog.strpos(
    pg_catalog.pg_get_functiondef(
      'private.assert_common_onboarding_actor()'::regprocedure
    ),
    'deleted_at'
  ) > 0
  and pg_catalog.strpos(
    pg_catalog.pg_get_functiondef(
      'private.profile_is_common_eligible(uuid)'::regprocedure
    ),
    'deleted_at'
  ) > 0,
  'all four central gates explicitly reject deleted profiles'
);

select * from finish();
rollback;
