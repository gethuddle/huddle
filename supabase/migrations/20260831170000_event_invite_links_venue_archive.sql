begin;

alter table public.venues
  add column archived_at timestamptz,
  add column archived_by uuid references public.profiles(id) on delete restrict,
  add constraint venues_archive_pair_check check (
    (archived_at is null and archived_by is null)
    or (archived_at is not null and archived_by is not null)
  );

comment on column public.venues.archived_at is
  'Owner-controlled soft closure. Archived Venues leave public and operator discovery while relational history remains intact.';

comment on column public.venues.archived_by is
  'The owner who closed this Venue; administrators cannot perform the irreversible workspace transition.';

create index venues_owner_active_created_idx
  on public.venues (owner_id, created_at desc, id)
  where archived_at is null;

create table public.event_invite_tokens (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete restrict,
  token_hash text not null unique,
  created_by uuid not null references public.profiles(id) on delete restrict,
  expires_at timestamptz not null,
  max_uses integer not null,
  use_count integer not null default 0,
  revoked_at timestamptz,
  revoked_by uuid references public.profiles(id) on delete restrict,
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  constraint event_invite_tokens_hash_check check (token_hash ~ '^[0-9a-f]{64}$'),
  constraint event_invite_tokens_expiry_check check (expires_at > created_at),
  constraint event_invite_tokens_use_limit_check check (
    max_uses between 1 and 100
    and use_count between 0 and max_uses
  ),
  constraint event_invite_tokens_revocation_pair_check check (
    (revoked_at is null and revoked_by is null)
    or (revoked_at is not null and revoked_by is not null)
  )
);

comment on table public.event_invite_tokens is
  'Expiring invite-only event links. Only a SHA-256 digest is persisted; the raw bearer token is returned once and never logged.';

create index event_invite_tokens_event_created_idx
  on public.event_invite_tokens (event_id, created_at desc, id);

create index event_invite_tokens_active_expiry_idx
  on public.event_invite_tokens (event_id, expires_at)
  where revoked_at is null;

create trigger event_invite_tokens_set_updated_at
before update on public.event_invite_tokens
for each row execute function private.set_updated_at();

alter table public.event_invitations
  add column invite_token_id uuid references public.event_invite_tokens(id) on delete set null;

comment on column public.event_invitations.invite_token_id is
  'Optional non-secret provenance for invitations created by redeeming an event invite link.';

create or replace function private.hash_event_invite_token(input_token text)
returns text
language sql
immutable
strict
set search_path = ''
as $function$
  select pg_catalog.encode(
    pg_catalog.sha256(pg_catalog.convert_to(input_token, 'UTF8')),
    'hex'
  );
$function$;

comment on function private.hash_event_invite_token(text) is
  'Hashes one transient URL-safe event invite token with SHA-256; only this digest is persisted.';

create or replace function private.actor_manages_venue(
  input_actor_id uuid,
  input_venue_id uuid
)
returns boolean
language sql
security definer
stable
set search_path = ''
as $function$
  select input_actor_id is not null
    and input_venue_id is not null
    and private.profile_is_common_eligible(input_actor_id)
    and exists (
      select 1
      from public.venue_memberships as membership
      join public.venues as venue on venue.id = membership.venue_id
      where membership.venue_id = input_venue_id
        and membership.user_id = input_actor_id
        and membership.status = 'active'
        and membership.revoked_at is null
        and membership.role in ('owner', 'admin')
        and venue.verification_status <> 'suspended'
        and venue.suspended_at is null
        and venue.archived_at is null
    );
$function$;

comment on function private.actor_manages_venue(uuid, uuid) is
  'Authorizes one active Venue through current membership and common eligibility; archived Venues cannot be operated.';

create or replace function private.actor_owns_venue(
  input_venue_id uuid,
  input_actor_id uuid
)
returns boolean
language sql
security definer
stable
set search_path = ''
as $function$
  select private.actor_manages_venue(input_actor_id, input_venue_id);
$function$;

comment on function private.actor_owns_venue(uuid, uuid) is
  'Compatibility wrapper for active membership-aware Venue management authorization.';

create or replace function private.venue_follow_is_allowed(
  input_venue_id uuid,
  input_actor_id uuid
)
returns boolean
language sql
security definer
stable
set search_path = ''
as $function$
  select input_actor_id is not null
    and private.profile_is_community_eligible(input_actor_id)
    and exists (
      select 1
      from public.venues as venue
      where venue.id = input_venue_id
        and venue.verification_status <> 'suspended'
        and venue.suspended_at is null
        and venue.archived_at is null
    );
$function$;

comment on function private.venue_follow_is_allowed(uuid, uuid) is
  'Checks actor eligibility and active Venue followability without granting direct base-table reads.';

create or replace function private.event_user_is_audience_eligible(
  input_event_id uuid,
  input_user_id uuid,
  input_direct_invite boolean
)
returns boolean
language sql
security definer
stable
set search_path = ''
as $function$
  select input_user_id is not null
    and private.profile_is_community_eligible(input_user_id)
    and exists (
      select 1
      from public.events as event
      left join public.profiles as host_profile on host_profile.id = event.host_user_id
      left join public.venues as host_venue on host_venue.id = event.host_venue_id
      left join public.groups as audience_group on audience_group.id = event.audience_group_id
      where event.id = input_event_id
        and event.attendance_mode = 'reservations'
        and input_user_id is distinct from event.host_user_id
        and (
          (
            event.host_user_id is not null
            and private.profile_is_community_eligible(event.host_user_id)
            and host_profile.suspended_at is null
            and not private.users_are_blocked(input_user_id, event.host_user_id)
          )
          or (
            event.host_venue_id is not null
            and host_venue.verification_status <> 'suspended'
            and host_venue.suspended_at is null
            and host_venue.archived_at is null
          )
        )
        and (
          event.audience = 'public'
          or (
            event.audience = 'team_followers'
            and (
              input_direct_invite
              or exists (
                select 1
                from public.subscriptions as subscription
                where subscription.user_id = input_user_id
                  and subscription.kind = 'team'
                  and subscription.team_id = event.audience_team_id
              )
            )
          )
          or (
            event.audience = 'group'
            and audience_group.lifecycle in ('forming', 'active')
            and audience_group.suspended_at is null
            and private.actor_is_active_group_member(event.audience_group_id, input_user_id)
          )
          or (
            event.audience = 'friends'
            and private.actor_is_accepted_friend(event.host_user_id, input_user_id)
          )
          or (event.audience = 'invite_only' and input_direct_invite)
        )
    );
$function$;

comment on function private.event_user_is_audience_eligible(uuid, uuid, boolean) is
  'Rechecks account, active host, audience, and block eligibility and denies attendance or invitations for open-door events.';

drop function public.get_venue_by_slug(text);

create function public.get_venue_by_slug(lookup_slug text)
returns table (
  venue_id uuid,
  slug text,
  name text,
  city_id uuid,
  city_name text,
  address_text text,
  description text,
  screen_count integer,
  stated_capacity integer,
  verification_status text,
  owner_handle text,
  follower_count bigint,
  viewer_follows boolean,
  viewer_is_owner boolean
)
language sql
security definer
stable
set search_path = ''
as $function$
  select
    venue.id,
    venue.slug,
    venue.name,
    venue.city_id,
    city.name_en,
    venue.address_text,
    venue.description,
    venue.screen_count,
    venue.stated_capacity,
    venue.verification_status::text,
    owner_profile.handle,
    (
      select count(*)
      from public.venue_follows as follow
      where follow.venue_id = venue.id
    ),
    exists (
      select 1
      from public.venue_follows as own_follow
      where own_follow.venue_id = venue.id
        and own_follow.user_id = auth.uid()
    ),
    private.actor_manages_venue(auth.uid(), venue.id)
  from public.venues as venue
  join public.cities as city on city.id = venue.city_id
  join public.profiles as owner_profile on owner_profile.id = venue.owner_id
  where venue.slug = lower(btrim(lookup_slug))
    and venue.verification_status <> 'suspended'
    and venue.suspended_at is null
    and venue.archived_at is null;
$function$;

comment on function public.get_venue_by_slug(text) is
  'Returns one active public Venue summary; closed or suspended Venues are indistinguishable from missing.';

create function public.create_event_invite_token(
  input_event_id uuid,
  input_expires_at timestamptz,
  input_max_uses integer,
  audit_request_id uuid default null
)
returns table (
  invite_token_id uuid,
  invite_token text,
  expires_at timestamptz,
  max_uses integer,
  use_count integer,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $function$
#variable_conflict use_variable
declare
  actor_id uuid := private.assert_fan_actor();
  target_event public.events%rowtype;
  raw_invite_token text;
  created_invite public.event_invite_tokens%rowtype;
begin
  if input_event_id is null
    or input_expires_at is null
    or input_expires_at < statement_timestamp() + interval '5 minutes'
    or input_expires_at > statement_timestamp() + interval '30 days'
    or input_max_uses is null
    or input_max_uses not between 1 and 100 then
    raise exception using errcode = 'P0001', message = 'VALIDATION_FAILED';
  end if;

  select event.*
  into target_event
  from public.events as event
  where event.id = input_event_id
  for share;

  if not found
    or target_event.host_user_id <> actor_id
    or target_event.host_venue_id is not null
    or target_event.audience <> 'invite_only'
    or target_event.attendance_mode <> 'reservations'
    or target_event.status <> 'published'
    or target_event.starts_at <= statement_timestamp() then
    raise exception using errcode = 'P0001', message = 'NOT_FOUND';
  end if;

  raw_invite_token := pg_catalog.translate(
    pg_catalog.rtrim(
      pg_catalog.encode(extensions.gen_random_bytes(32), 'base64'),
      '='
    ),
    '+/',
    '-_'
  );

  insert into public.event_invite_tokens (
    event_id,
    token_hash,
    created_by,
    expires_at,
    max_uses
  )
  values (
    target_event.id,
    private.hash_event_invite_token(raw_invite_token),
    actor_id,
    input_expires_at,
    input_max_uses
  )
  returning * into created_invite;

  perform private.write_security_audit(
    actor_id,
    'event.invite_link.create',
    'event',
    target_event.id,
    'succeeded',
    audit_request_id,
    jsonb_build_object(
      'invite_link_id', created_invite.id,
      'max_uses', created_invite.max_uses,
      'expires_at', created_invite.expires_at
    )
  );

  return query
  select
    created_invite.id,
    raw_invite_token,
    created_invite.expires_at,
    created_invite.max_uses,
    created_invite.use_count,
    created_invite.created_at;
end;
$function$;

comment on function public.create_event_invite_token(uuid, timestamptz, integer, uuid) is
  'Creates a bounded invite link for a future personal invite-only event and returns the raw token exactly once.';

create function public.list_event_invite_tokens(input_event_id uuid)
returns table (
  invite_token_id uuid,
  creator_handle text,
  expires_at timestamptz,
  max_uses integer,
  use_count integer,
  revoked_at timestamptz,
  invite_status text,
  created_at timestamptz
)
language plpgsql
security definer
volatile
set search_path = ''
as $function$
#variable_conflict use_variable
declare
  actor_id uuid := private.assert_fan_actor();
begin
  if not exists (
    select 1
    from public.events as event
    where event.id = input_event_id
      and event.host_user_id = actor_id
      and event.audience = 'invite_only'
  ) then
    raise exception using errcode = 'P0001', message = 'NOT_FOUND';
  end if;

  return query
  select
    invite.id,
    creator.handle,
    invite.expires_at,
    invite.max_uses,
    invite.use_count,
    invite.revoked_at,
    case
      when invite.revoked_at is not null then 'revoked'
      when invite.expires_at <= statement_timestamp() then 'expired'
      when invite.use_count >= invite.max_uses then 'used'
      else 'active'
    end,
    invite.created_at
  from public.event_invite_tokens as invite
  join public.profiles as creator on creator.id = invite.created_by
  where invite.event_id = input_event_id
  order by invite.created_at desc, invite.id
  limit 50;
end;
$function$;

comment on function public.list_event_invite_tokens(uuid) is
  'Lists bounded non-secret invite-link metadata to the personal event host.';

create function public.revoke_event_invite_token(
  input_invite_token_id uuid,
  audit_request_id uuid default null
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $function$
declare
  actor_id uuid := private.assert_fan_actor();
  invite_row public.event_invite_tokens%rowtype;
begin
  select invite.*
  into invite_row
  from public.event_invite_tokens as invite
  join public.events as event on event.id = invite.event_id
  where invite.id = input_invite_token_id
    and event.host_user_id = actor_id
    and event.audience = 'invite_only'
  for update of invite;

  if not found then
    raise exception using errcode = 'P0001', message = 'NOT_FOUND';
  end if;

  if invite_row.revoked_at is not null then
    return false;
  end if;

  update public.event_invite_tokens as invite
  set revoked_at = statement_timestamp(), revoked_by = actor_id
  where invite.id = invite_row.id;

  perform private.write_security_audit(
    actor_id,
    'event.invite_link.revoke',
    'event',
    invite_row.event_id,
    'succeeded',
    audit_request_id,
    jsonb_build_object('invite_link_id', invite_row.id)
  );

  return true;
end;
$function$;

comment on function public.revoke_event_invite_token(uuid, uuid) is
  'Revokes an event invite link without deleting its non-secret audit metadata.';

create function public.redeem_event_invite_token(
  input_invite_token text,
  audit_request_id uuid default null
)
returns table (
  event_id uuid,
  invitation_id uuid,
  invitation_status text
)
language plpgsql
security definer
set search_path = ''
as $function$
#variable_conflict use_variable
declare
  actor_id uuid := private.assert_fan_actor();
  invite_row public.event_invite_tokens%rowtype;
  target_event public.events%rowtype;
  target_invitation public.event_invitations%rowtype;
  approved_count bigint;
  consumed_use boolean := false;
begin
  if input_invite_token is null
    or input_invite_token !~ '^[A-Za-z0-9_-]{43}$' then
    raise exception using errcode = 'P0001', message = 'INVITE_INVALID';
  end if;

  select invite.*
  into invite_row
  from public.event_invite_tokens as invite
  where invite.token_hash = private.hash_event_invite_token(input_invite_token)
  for update;

  if not found or invite_row.revoked_at is not null then
    raise exception using errcode = 'P0001', message = 'INVITE_INVALID';
  end if;

  if invite_row.expires_at <= statement_timestamp() then
    raise exception using errcode = 'P0001', message = 'INVITE_EXPIRED';
  end if;

  select event.*
  into target_event
  from public.events as event
  where event.id = invite_row.event_id
  for update;

  if not found
    or target_event.host_user_id is null
    or target_event.host_venue_id is not null
    or target_event.audience <> 'invite_only'
    or target_event.attendance_mode <> 'reservations'
    or target_event.status <> 'published' then
    raise exception using errcode = 'P0001', message = 'INVITE_INVALID';
  end if;

  if target_event.starts_at <= statement_timestamp() then
    raise exception using errcode = 'P0001', message = 'EVENT_STARTED';
  end if;

  if actor_id = target_event.host_user_id then
    raise exception using errcode = 'P0001', message = 'NOT_ALLOWED';
  end if;

  perform private.lock_event_interaction_pairs(
    actor_id,
    invite_row.created_by,
    target_event.host_user_id
  );

  if private.users_are_blocked(actor_id, invite_row.created_by)
    or private.users_are_blocked(actor_id, target_event.host_user_id)
    or not private.event_user_is_audience_eligible(target_event.id, actor_id, true) then
    raise exception using errcode = 'P0001', message = 'NOT_ALLOWED';
  end if;

  select count(*)
  into approved_count
  from public.event_attendance as attendance
  where attendance.event_id = target_event.id
    and attendance.status = 'approved';

  if approved_count >= target_event.capacity then
    raise exception using errcode = 'P0001', message = 'EVENT_FULL';
  end if;

  select invitation.*
  into target_invitation
  from public.event_invitations as invitation
  where invitation.event_id = target_event.id
    and invitation.invitee_id = actor_id
  for update;

  if found and target_invitation.status in ('pending', 'accepted') then
    return query select
      target_event.id,
      target_invitation.id,
      target_invitation.status::text;
    return;
  elsif invite_row.use_count >= invite_row.max_uses then
    raise exception using errcode = 'P0001', message = 'INVITE_INVALID';
  elsif found then
    update public.event_invitations as invitation
    set
      invited_by = invite_row.created_by,
      invite_token_id = invite_row.id,
      status = 'pending',
      responded_at = null
    where invitation.id = target_invitation.id
    returning * into target_invitation;
    consumed_use := true;
  else
    insert into public.event_invitations (
      event_id,
      invitee_id,
      invited_by,
      invite_token_id
    )
    values (
      target_event.id,
      actor_id,
      invite_row.created_by,
      invite_row.id
    )
    returning * into target_invitation;
    consumed_use := true;
  end if;

  if consumed_use then
    update public.event_invite_tokens as invite
    set use_count = invite.use_count + 1
    where invite.id = invite_row.id;
  end if;

  perform private.write_security_audit(
    actor_id,
    'event.invite_link.redeem',
    'event',
    target_event.id,
    'succeeded',
    audit_request_id,
    jsonb_build_object('invite_link_id', invite_row.id)
  );

  return query select
    target_event.id,
    target_invitation.id,
    target_invitation.status::text;
end;
$function$;

comment on function public.redeem_event_invite_token(text, uuid) is
  'Redeems one valid link use into a normal pending invitation. It never grants attendance or exposes protected event details before redemption.';

create function public.archive_venue(
  input_venue_id uuid,
  input_confirmation text,
  audit_request_id uuid default null
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $function$
declare
  actor_id uuid := private.assert_common_actor();
  target_venue public.venues%rowtype;
  cancelled_event_count bigint;
  revoked_invitation_count bigint;
begin
  select venue.*
  into target_venue
  from public.venues as venue
  where venue.id = input_venue_id
    and venue.owner_id = actor_id
    and venue.archived_at is null
  for update;

  if not found then
    raise exception using errcode = 'P0001', message = 'NOT_FOUND';
  end if;

  if input_confirmation is null
    or btrim(input_confirmation) <> target_venue.name then
    raise exception using errcode = 'P0001', message = 'CONFIRMATION_MISMATCH';
  end if;

  update public.events as event
  set
    status = 'cancelled',
    cancelled_at = statement_timestamp(),
    cancel_reason = 'Venue closed by its owner.'
  where event.host_venue_id = target_venue.id
    and event.status in ('draft', 'pending_group_review', 'published')
    and event.ends_at > statement_timestamp();
  get diagnostics cancelled_event_count = row_count;

  update public.event_invitations as invitation
  set status = 'revoked', responded_at = statement_timestamp()
  where invitation.status = 'pending'
    and exists (
      select 1
      from public.events as event
      where event.id = invitation.event_id
        and event.host_venue_id = target_venue.id
        and event.status = 'cancelled'
        and event.ends_at > statement_timestamp()
    );
  get diagnostics revoked_invitation_count = row_count;

  update public.venues as venue
  set archived_at = statement_timestamp(), archived_by = actor_id
  where venue.id = target_venue.id;

  perform private.write_security_audit(
    actor_id,
    'venue.archive',
    'venue',
    target_venue.id,
    'succeeded',
    audit_request_id,
    jsonb_build_object(
      'cancelled_event_count', cancelled_event_count,
      'revoked_invitation_count', revoked_invitation_count
    )
  );

  return true;
end;
$function$;

comment on function public.archive_venue(uuid, text, uuid) is
  'Lets only the Venue owner close a workspace, cancel future events, revoke pending invitations, and retain historical rows.';

drop function public.list_group_event_submissions(uuid, integer, integer);

create function public.list_group_event_submissions(
  input_group_id uuid,
  input_offset integer default 0,
  input_limit integer default 20
)
returns table (
  event_id uuid,
  title text,
  status text,
  submitter_handle text,
  submitter_display_name text,
  audience text,
  audience_group_name text,
  place_kind text,
  home_team_name text,
  away_team_name text,
  competition_name text,
  starts_at timestamptz,
  submitted_at timestamptz,
  can_review boolean,
  can_withdraw boolean,
  total_count bigint
)
language plpgsql
security definer
volatile
set search_path = ''
as $function$
#variable_conflict use_variable
declare
  actor_id uuid := private.assert_actor(true);
  bounded_offset integer := greatest(coalesce(input_offset, 0), 0);
  bounded_limit integer := least(greatest(coalesce(input_limit, 20), 1), 50);
begin
  if not private.actor_is_group_admin(input_group_id, actor_id)
    or not exists (
      select 1
      from public.groups as supporter_group
      where supporter_group.id = input_group_id
        and supporter_group.lifecycle in ('forming', 'active')
        and supporter_group.suspended_at is null
    ) then
    raise exception using errcode = 'P0001', message = 'NOT_FOUND';
  end if;

  return query
  select
    event.id,
    event.title,
    event.status::text,
    submitter.handle,
    submitter.display_name,
    event.audience::text,
    audience_group.name,
    event.place_kind::text,
    home_team.name,
    away_team.name,
    competition.name,
    event.starts_at,
    event.created_at,
    event.status = 'pending_group_review' and event.created_by <> actor_id,
    event.status = 'pending_group_review' and event.created_by = actor_id,
    count(*) over ()
  from public.events as event
  join public.profiles as submitter on submitter.id = event.created_by
  join public.matches as match on match.id = event.match_id
  join public.teams as home_team on home_team.id = match.home_team_id
  join public.teams as away_team on away_team.id = match.away_team_id
  join public.competitions as competition on competition.id = match.competition_id
  left join public.groups as audience_group on audience_group.id = event.audience_group_id
  where event.organizing_group_id = input_group_id
    and event.status in ('pending_group_review', 'published', 'cancelled', 'completed')
    and event.host_user_id is not null
    and not private.users_are_blocked(event.host_user_id, actor_id)
  order by
    case when event.status = 'pending_group_review' then 0 else 1 end,
    event.created_at desc,
    event.id
  offset bounded_offset
  limit bounded_limit;
end;
$function$;

comment on function public.list_group_event_submissions(uuid, integer, integer) is
  'Returns an admin-only event queue with explicit review-versus-own-withdraw capabilities so the UI never offers forbidden self-review.';

create function public.withdraw_group_event_submission(
  input_event_id uuid,
  audit_request_id uuid default null
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $function$
declare
  actor_id uuid := private.assert_actor(false);
  target_event public.events%rowtype;
begin
  select event.*
  into target_event
  from public.events as event
  where event.id = input_event_id
    and event.created_by = actor_id
    and event.host_user_id = actor_id
    and event.organizing_group_id is not null
    and event.status = 'pending_group_review'
  for update;

  if not found then
    raise exception using errcode = 'P0001', message = 'NOT_FOUND';
  end if;

  update public.events as event
  set
    status = 'cancelled',
    published_at = null,
    cancelled_at = statement_timestamp(),
    cancel_reason = 'Withdrawn by submitter.'
  where event.id = target_event.id;

  perform private.write_security_audit(
    actor_id,
    'event.group_submission.withdraw',
    'event',
    target_event.id,
    'succeeded',
    audit_request_id,
    jsonb_build_object('organizing_group_id', target_event.organizing_group_id)
  );

  return true;
end;
$function$;

comment on function public.withdraw_group_event_submission(uuid, uuid) is
  'Lets the original submitter cancel a still-pending group event without granting self-review authority.';

alter table public.event_invite_tokens enable row level security;
alter table public.event_invite_tokens force row level security;

revoke all on public.event_invite_tokens from anon, authenticated;

revoke all on function private.hash_event_invite_token(text)
  from public, anon, authenticated;
revoke all on function private.actor_manages_venue(uuid, uuid)
  from public, anon, authenticated;
revoke all on function private.actor_owns_venue(uuid, uuid)
  from public, anon, authenticated;
revoke all on function private.venue_follow_is_allowed(uuid, uuid)
  from public, anon, authenticated;
revoke all on function private.event_user_is_audience_eligible(uuid, uuid, boolean)
  from public, anon, authenticated;
revoke all on function public.get_venue_by_slug(text) from public;
revoke all on function public.create_event_invite_token(uuid, timestamptz, integer, uuid)
  from public, anon;
revoke all on function public.list_event_invite_tokens(uuid)
  from public, anon;
revoke all on function public.revoke_event_invite_token(uuid, uuid)
  from public, anon;
revoke all on function public.redeem_event_invite_token(text, uuid)
  from public, anon;
revoke all on function public.archive_venue(uuid, text, uuid)
  from public, anon;
revoke all on function public.list_group_event_submissions(uuid, integer, integer)
  from public, anon;
revoke all on function public.withdraw_group_event_submission(uuid, uuid)
  from public, anon;

grant execute on function public.get_venue_by_slug(text) to anon, authenticated;
grant execute on function private.venue_follow_is_allowed(uuid, uuid) to authenticated;
grant execute on function public.create_event_invite_token(uuid, timestamptz, integer, uuid)
  to authenticated;
grant execute on function public.list_event_invite_tokens(uuid)
  to authenticated;
grant execute on function public.revoke_event_invite_token(uuid, uuid)
  to authenticated;
grant execute on function public.redeem_event_invite_token(text, uuid)
  to authenticated;
grant execute on function public.archive_venue(uuid, text, uuid)
  to authenticated;
grant execute on function public.list_group_event_submissions(uuid, integer, integer)
  to authenticated;
grant execute on function public.withdraw_group_event_submission(uuid, uuid)
  to authenticated;

commit;
