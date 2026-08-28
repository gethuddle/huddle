begin;

create type public.moderation_target_type as enum ('profile', 'group', 'venue', 'event');
create type public.report_category as enum (
  'immediate_danger',
  'harassment_stalking_sexual_misconduct',
  'hate_discrimination',
  'privacy_exposure',
  'impersonation_fraud',
  'dangerous_illegal_activity',
  'spam_scam',
  'other'
);
create type public.report_status as enum ('open', 'reviewing', 'resolved', 'dismissed');
create type public.moderation_action_kind as enum (
  'content_correction',
  'warning',
  'feature_restriction',
  'temporary_suspension',
  'event_cancellation',
  'group_suspension',
  'venue_suspension',
  'permanent_account_ban'
);
create type public.appeal_status as enum ('open', 'reviewing', 'upheld', 'modified', 'reversed');

alter table public.profiles
  add column community_restricted_at timestamptz,
  add column community_restricted_until timestamptz,
  add column suspension_expires_at timestamptz,
  add constraint profiles_community_restriction_pair_check check (
    (
      community_restricted_at is null
      and community_restricted_until is null
    )
    or (
      community_restricted_at is not null
      and community_restricted_until is not null
      and community_restricted_until > community_restricted_at
    )
  ),
  add constraint profiles_suspension_expiry_check check (
    suspension_expires_at is null
    or (
      suspended_at is not null
      and suspension_expires_at > suspended_at
    )
  );

create index profiles_community_restricted_until_idx
  on public.profiles (community_restricted_until)
  where community_restricted_at is not null;
create index profiles_suspension_expires_at_idx
  on public.profiles (suspension_expires_at)
  where suspended_at is not null;

create table public.reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references public.profiles(id) on delete restrict,
  target_type public.moderation_target_type not null,
  profile_id uuid references public.profiles(id) on delete restrict,
  group_id uuid references public.groups(id) on delete restrict,
  venue_id uuid references public.venues(id) on delete restrict,
  event_id uuid references public.events(id) on delete restrict,
  category public.report_category not null,
  details text not null,
  status public.report_status not null default 'open',
  assigned_to uuid references public.profiles(id) on delete restrict,
  resolution_note text,
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  constraint reports_exact_target_check check (
    (
      target_type = 'profile'
      and profile_id is not null
      and group_id is null
      and venue_id is null
      and event_id is null
    )
    or (
      target_type = 'group'
      and profile_id is null
      and group_id is not null
      and venue_id is null
      and event_id is null
    )
    or (
      target_type = 'venue'
      and profile_id is null
      and group_id is null
      and venue_id is not null
      and event_id is null
    )
    or (
      target_type = 'event'
      and profile_id is null
      and group_id is null
      and venue_id is null
      and event_id is not null
    )
  ),
  constraint reports_details_length_check check (
    details = btrim(details)
    and char_length(details) between 20 and 2000
  ),
  constraint reports_resolution_note_length_check check (
    resolution_note is null
    or (
      resolution_note = btrim(resolution_note)
      and char_length(resolution_note) between 10 and 2000
    )
  ),
  constraint reports_workflow_check check (
    (
      status = 'open'
      and assigned_to is null
      and resolution_note is null
    )
    or (
      status = 'reviewing'
      and assigned_to is not null
      and resolution_note is null
    )
    or (
      status in ('resolved', 'dismissed')
      and assigned_to is not null
      and resolution_note is not null
    )
  )
);

comment on table public.reports is
  'Confidential user reports. Targets and group administrators cannot read reporter identity or investigation details.';

create index reports_queue_idx on public.reports (status, created_at, id);
create index reports_reporter_created_idx on public.reports (reporter_id, created_at desc, id);
create index reports_profile_target_idx on public.reports (profile_id, created_at desc)
  where profile_id is not null;
create index reports_group_target_idx on public.reports (group_id, created_at desc)
  where group_id is not null;
create index reports_venue_target_idx on public.reports (venue_id, created_at desc)
  where venue_id is not null;
create index reports_event_target_idx on public.reports (event_id, created_at desc)
  where event_id is not null;

create trigger reports_set_updated_at
before update on public.reports
for each row execute function private.set_updated_at();

create table public.moderation_actions (
  id uuid primary key default gen_random_uuid(),
  report_id uuid references public.reports(id) on delete restrict,
  moderator_id uuid not null references public.profiles(id) on delete restrict,
  target_type public.moderation_target_type not null,
  profile_id uuid references public.profiles(id) on delete restrict,
  group_id uuid references public.groups(id) on delete restrict,
  venue_id uuid references public.venues(id) on delete restrict,
  event_id uuid references public.events(id) on delete restrict,
  action public.moderation_action_kind not null,
  reason text not null,
  expires_at timestamptz,
  state_before jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default statement_timestamp(),
  reversed_by uuid references public.profiles(id) on delete restrict,
  reversed_at timestamptz,
  reversal_reason text,
  constraint moderation_actions_exact_target_check check (
    (
      target_type = 'profile'
      and profile_id is not null
      and group_id is null
      and venue_id is null
      and event_id is null
    )
    or (
      target_type = 'group'
      and profile_id is null
      and group_id is not null
      and venue_id is null
      and event_id is null
    )
    or (
      target_type = 'venue'
      and profile_id is null
      and group_id is null
      and venue_id is not null
      and event_id is null
    )
    or (
      target_type = 'event'
      and profile_id is null
      and group_id is null
      and venue_id is null
      and event_id is not null
    )
  ),
  constraint moderation_actions_reason_length_check check (
    reason = btrim(reason)
    and char_length(reason) between 10 and 1000
  ),
  constraint moderation_actions_duration_check check (
    (
      action in ('feature_restriction', 'temporary_suspension')
      and expires_at is not null
      and expires_at > created_at
    )
    or (
      action not in ('feature_restriction', 'temporary_suspension')
      and expires_at is null
    )
  ),
  constraint moderation_actions_state_before_check check (
    jsonb_typeof(state_before) = 'object'
    and octet_length(state_before::text) <= 2048
  ),
  constraint moderation_actions_reversal_check check (
    (
      reversed_by is null
      and reversed_at is null
      and reversal_reason is null
    )
    or (
      reversed_by is not null
      and reversed_at is not null
      and reversal_reason is not null
      and reversal_reason = btrim(reversal_reason)
      and char_length(reversal_reason) between 10 and 1000
    )
  )
);

comment on table public.moderation_actions is
  'Platform-only proportional enforcement log whose product-state mutation and audit evidence are transactional.';

create index moderation_actions_report_idx
  on public.moderation_actions (report_id, created_at desc, id);
create index moderation_actions_profile_idx
  on public.moderation_actions (profile_id, created_at desc, id)
  where profile_id is not null;
create index moderation_actions_group_idx
  on public.moderation_actions (group_id, created_at desc, id)
  where group_id is not null;
create index moderation_actions_venue_idx
  on public.moderation_actions (venue_id, created_at desc, id)
  where venue_id is not null;
create index moderation_actions_event_idx
  on public.moderation_actions (event_id, created_at desc, id)
  where event_id is not null;

create table public.moderation_appeals (
  id uuid primary key default gen_random_uuid(),
  moderation_action_id uuid not null references public.moderation_actions(id) on delete restrict,
  appellant_id uuid not null references public.profiles(id) on delete restrict,
  reason text not null,
  status public.appeal_status not null default 'open',
  reviewed_by uuid references public.profiles(id) on delete restrict,
  reviewed_at timestamptz,
  outcome_reason text,
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  constraint moderation_appeals_reason_length_check check (
    reason = btrim(reason)
    and char_length(reason) between 20 and 2000
  ),
  constraint moderation_appeals_outcome_reason_length_check check (
    outcome_reason is null
    or (
      outcome_reason = btrim(outcome_reason)
      and char_length(outcome_reason) between 10 and 2000
    )
  ),
  constraint moderation_appeals_workflow_check check (
    (
      status = 'open'
      and reviewed_by is null
      and reviewed_at is null
      and outcome_reason is null
    )
    or (
      status = 'reviewing'
      and reviewed_by is not null
      and reviewed_at is null
      and outcome_reason is null
    )
    or (
      status in ('upheld', 'modified', 'reversed')
      and reviewed_by is not null
      and reviewed_at is not null
      and outcome_reason is not null
    )
  )
);

comment on table public.moderation_appeals is
  'Affected-user appeal records with one active appeal per action/appellant and a bounded visible outcome.';

create unique index moderation_appeals_one_active_idx
  on public.moderation_appeals (moderation_action_id, appellant_id)
  where status in ('open', 'reviewing');
create index moderation_appeals_queue_idx
  on public.moderation_appeals (status, created_at, id);
create index moderation_appeals_appellant_idx
  on public.moderation_appeals (appellant_id, created_at desc, id);

create trigger moderation_appeals_set_updated_at
before update on public.moderation_appeals
for each row execute function private.set_updated_at();

create or replace function private.assert_safety_actor(require_complete boolean)
returns uuid
language plpgsql
security definer
stable
set search_path = ''
as $function$
declare
  actor_id uuid := auth.uid();
  auth_email_confirmed_at timestamptz;
  actor_profile public.profiles%rowtype;
begin
  if actor_id is null then
    raise exception using errcode = 'P0001', message = 'AUTH_REQUIRED';
  end if;

  select auth_user.email_confirmed_at
  into auth_email_confirmed_at
  from auth.users as auth_user
  where auth_user.id = actor_id;

  if not found or auth_email_confirmed_at is null then
    raise exception using errcode = 'P0001', message = 'EMAIL_NOT_VERIFIED';
  end if;

  select profile.*
  into actor_profile
  from public.profiles as profile
  where profile.id = actor_id;

  if not found then
    raise exception using errcode = 'P0001', message = 'PROFILE_INCOMPLETE';
  end if;

  if require_complete then
    if actor_profile.adult_attested_at is null then
      raise exception using errcode = 'P0001', message = 'ADULT_ATTESTATION_REQUIRED';
    end if;

    if actor_profile.rules_version is distinct from private.current_rules_version()
      or actor_profile.rules_accepted_at is null then
      raise exception using errcode = 'P0001', message = 'RULES_ACCEPTANCE_REQUIRED';
    end if;

    if actor_profile.handle is null
      or actor_profile.display_name is null
      or actor_profile.city_id is null
      or actor_profile.profile_completed_at is null then
      raise exception using errcode = 'P0001', message = 'PROFILE_INCOMPLETE';
    end if;
  end if;

  return actor_id;
end;
$function$;

comment on function private.assert_safety_actor(boolean) is
  'Allows verified users to report or appeal even while restricted or suspended, while optionally retaining the complete-profile gate.';

create or replace function private.assert_actor(require_complete boolean)
returns uuid
language plpgsql
security definer
volatile
set search_path = ''
as $function$
declare
  actor_id uuid := private.assert_safety_actor(require_complete);
  actor_profile public.profiles%rowtype;
begin
  if current_setting('transaction_read_only') = 'on' then
    select profile.*
    into strict actor_profile
    from public.profiles as profile
    where profile.id = actor_id;
  else
    select profile.*
    into strict actor_profile
    from public.profiles as profile
    where profile.id = actor_id
    for share;
  end if;

  if actor_profile.suspended_at is not null then
    raise exception using errcode = 'P0001', message = 'ACCOUNT_SUSPENDED';
  end if;

  if require_complete
    and actor_profile.community_restricted_at is not null then
    raise exception using errcode = 'P0001', message = 'ACCOUNT_RESTRICTED';
  end if;

  return actor_id;
end;
$function$;

comment on function private.assert_actor(boolean) is
  'Reusable verified actor gate that keeps stable read-only projections lock-free and holds a shared profile lock in write transactions so moderation cannot race past eligibility enforcement.';

create or replace function private.profile_is_community_eligible(target_profile_id uuid)
returns boolean
language sql
security definer
stable
set search_path = ''
as $function$
  select exists (
    select 1
    from public.profiles as profile
    join auth.users as auth_user on auth_user.id = profile.id
    where profile.id = target_profile_id
      and auth_user.email_confirmed_at is not null
      and profile.handle is not null
      and profile.display_name is not null
      and profile.city_id is not null
      and profile.adult_attested_at is not null
      and profile.rules_version = private.current_rules_version()
      and profile.rules_accepted_at is not null
      and profile.profile_completed_at is not null
      and profile.suspended_at is null
  );
$function$;

create or replace function private.actor_is_active_group_member(
  input_group_id uuid,
  input_actor_id uuid
)
returns boolean
language sql
security definer
stable
set search_path = ''
as $function$
  select input_actor_id is not null
    and exists (
      select 1
      from public.group_memberships as membership
      where membership.group_id = input_group_id
        and membership.user_id = input_actor_id
        and membership.status = 'active'
        and private.profile_is_community_eligible(membership.user_id)
    )
    and not exists (
      select 1
      from public.group_bans as ban
      where ban.group_id = input_group_id
        and ban.user_id = input_actor_id
        and ban.revoked_at is null
    );
$function$;

create or replace function public.get_public_profile_by_handle(lookup_handle text)
returns table (
  handle text,
  display_name text,
  city_name text,
  bio text,
  member_since timestamptz,
  viewer_has_blocked boolean,
  friendship_id uuid,
  friendship_status text,
  friendship_direction text
)
language sql
security definer
stable
set search_path = ''
as $function$
  select
    profile.handle,
    profile.display_name,
    city.name_en,
    profile.bio,
    profile.created_at,
    coalesce(
      exists (
        select 1
        from public.user_blocks as block
        where block.blocker_id = auth.uid()
          and block.blocked_id = profile.id
      ),
      false
    ),
    friendship.id,
    friendship.status::text,
    case
      when friendship.status = 'accepted' then 'accepted'
      when friendship.requested_by = auth.uid() then 'outgoing'
      when friendship.id is not null then 'incoming'
      else null
    end
  from public.profiles as profile
  join public.cities as city on city.id = profile.city_id
  left join lateral (
    select relation.id, relation.status, relation.requested_by
    from public.friendships as relation
    where auth.uid() is not null
      and relation.status in ('pending', 'accepted')
      and relation.user_low_id = least(auth.uid(), profile.id)
      and relation.user_high_id = greatest(auth.uid(), profile.id)
    limit 1
  ) as friendship on true
  where profile.handle = lower(btrim(lookup_handle))
    and profile.profile_completed_at is not null
    and profile.suspended_at is null
    and city.active;
$function$;

create or replace function private.assert_platform_moderator()
returns uuid
language plpgsql
security definer
stable
set search_path = ''
as $function$
declare
  actor_id uuid := private.assert_actor(true);
begin
  if not private.has_platform_role(
    actor_id,
    array['moderator', 'admin']::public.platform_role[]
  ) then
    raise exception using errcode = 'P0001', message = 'NOT_ALLOWED';
  end if;

  return actor_id;
end;
$function$;

create or replace function public.block_user(
  target_handle text,
  audit_request_id uuid default null
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $function$
declare
  actor_id uuid := private.assert_actor(true);
  target_id uuid;
  inserted_rows integer;
  removed_friendships integer;
  revoked_invitations integer;
  ended_attendance integer;
begin
  select profile.id
  into target_id
  from public.profiles as profile
  where profile.handle = lower(btrim(target_handle))
    and profile.profile_completed_at is not null;

  if target_id is null then
    raise exception using errcode = 'P0001', message = 'NOT_FOUND';
  end if;
  if target_id = actor_id then
    raise exception using errcode = 'P0001', message = 'NOT_ALLOWED';
  end if;

  perform private.lock_direct_user_pair(actor_id, target_id);

  insert into public.user_blocks (blocker_id, blocked_id)
  values (actor_id, target_id)
  on conflict (blocker_id, blocked_id) do nothing;
  get diagnostics inserted_rows = row_count;

  delete from public.friendships as friendship
  where friendship.user_low_id = least(actor_id, target_id)
    and friendship.user_high_id = greatest(actor_id, target_id);
  get diagnostics removed_friendships = row_count;

  update public.event_invitations as invitation
  set status = 'revoked', responded_at = statement_timestamp()
  from public.events as event
  where event.id = invitation.event_id
    and invitation.status = 'pending'
    and event.starts_at > statement_timestamp()
    and (
      (invitation.invited_by = actor_id and invitation.invitee_id = target_id)
      or (invitation.invited_by = target_id and invitation.invitee_id = actor_id)
      or (event.host_user_id = actor_id and invitation.invitee_id = target_id)
      or (event.host_user_id = target_id and invitation.invitee_id = actor_id)
    );
  get diagnostics revoked_invitations = row_count;

  update public.event_attendance as attendance
  set
    status = case
      when event.host_user_id = actor_id then 'removed'::public.attendance_status
      else 'left'::public.attendance_status
    end,
    left_at = case
      when event.host_user_id = target_id then statement_timestamp()
      else null
    end,
    removed_by = case
      when event.host_user_id = actor_id then actor_id
      else null
    end,
    removed_at = case
      when event.host_user_id = actor_id then statement_timestamp()
      else null
    end,
    removal_reason = null
  from public.events as event
  where event.id = attendance.event_id
    and event.place_kind = 'home'
    and event.status = 'published'
    and event.starts_at > statement_timestamp()
    and attendance.status in ('requested', 'approved')
    and (
      (event.host_user_id = actor_id and attendance.user_id = target_id)
      or (event.host_user_id = target_id and attendance.user_id = actor_id)
    );
  get diagnostics ended_attendance = row_count;

  if inserted_rows = 1
    or removed_friendships > 0
    or revoked_invitations > 0
    or ended_attendance > 0 then
    perform private.write_security_audit(
      actor_id,
      'user.block',
      'profile',
      target_id,
      'succeeded',
      audit_request_id,
      jsonb_build_object(
        'friendship_removed', removed_friendships > 0,
        'invitations_revoked', revoked_invitations,
        'attendance_ended', ended_attendance
      )
    );
  end if;

  return inserted_rows = 1;
end;
$function$;

comment on function public.block_user(text, uuid) is
  'Creates an immediate private block for an eligible community actor while atomically ending affected direct relationships and future home attendance.';

create or replace function public.unblock_user(
  target_handle text,
  audit_request_id uuid default null
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $function$
declare
  actor_id uuid := private.assert_actor(true);
  target_id uuid;
  deleted_rows integer;
begin
  select profile.id
  into target_id
  from public.profiles as profile
  where profile.handle = lower(btrim(target_handle));

  if target_id is null or target_id = actor_id then
    raise exception using errcode = 'P0001', message = 'NOT_ALLOWED';
  end if;

  delete from public.user_blocks as block
  where block.blocker_id = actor_id
    and block.blocked_id = target_id;
  get diagnostics deleted_rows = row_count;

  if deleted_rows = 1 then
    perform private.write_security_audit(
      actor_id,
      'user.unblock',
      'profile',
      target_id,
      'succeeded',
      audit_request_id,
      '{}'::jsonb
    );
  end if;

  return deleted_rows = 1;
end;
$function$;

comment on function public.unblock_user(text, uuid) is
  'Removes the eligible actor own private outgoing block without exposing it to the target.';

create or replace function private.report_target_is_available(
  input_actor_id uuid,
  input_target_type public.moderation_target_type,
  input_target_id uuid
)
returns boolean
language sql
security definer
stable
set search_path = ''
as $function$
  select case input_target_type
    when 'profile' then exists (
      select 1
      from public.profiles as profile
      where profile.id = input_target_id
        and profile.id <> input_actor_id
        and profile.profile_completed_at is not null
    )
    when 'group' then exists (
      select 1
      from public.groups as supporter_group
      where supporter_group.id = input_target_id
        and (
          supporter_group.visibility = 'discoverable'
          or exists (
            select 1
            from public.group_memberships as membership
            where membership.group_id = supporter_group.id
              and membership.user_id = input_actor_id
          )
        )
    )
    when 'venue' then exists (
      select 1 from public.venues as venue where venue.id = input_target_id
    )
    when 'event' then exists (
      select 1
      from public.events as event
      where event.id = input_target_id
        and (
          event.host_user_id = input_actor_id
          or private.actor_manages_event(event.id, input_actor_id)
          or exists (
            select 1
            from public.event_attendance as attendance
            where attendance.event_id = event.id
              and attendance.user_id = input_actor_id
          )
          or exists (
            select 1
            from public.event_invitations as invitation
            where invitation.event_id = event.id
              and invitation.invitee_id = input_actor_id
          )
          or (
            event.host_venue_id is not null
            and event.audience in ('public', 'team_followers')
          )
          or (
            event.audience_group_id is not null
            and exists (
              select 1
              from public.group_memberships as membership
              where membership.group_id = event.audience_group_id
                and membership.user_id = input_actor_id
            )
          )
          or (
            event.host_user_id is not null
            and private.actor_is_accepted_friend(event.host_user_id, input_actor_id)
          )
        )
    )
  end;
$function$;

create or replace function public.submit_report(
  input_target_type text,
  input_target_id uuid,
  input_category text,
  input_details text,
  audit_request_id uuid default null
)
returns table (report_id uuid, status text)
language plpgsql
security definer
set search_path = ''
as $function$
#variable_conflict use_variable
declare
  actor_id uuid := private.assert_safety_actor(false);
  parsed_target_type public.moderation_target_type;
  parsed_category public.report_category;
  normalized_details text := btrim(input_details);
  created_report public.reports%rowtype;
  recent_count bigint;
begin
  begin
    parsed_target_type := input_target_type::public.moderation_target_type;
    parsed_category := input_category::public.report_category;
  exception when invalid_text_representation then
    raise exception using errcode = 'P0001', message = 'VALIDATION_FAILED';
  end;

  if input_target_id is null
    or char_length(normalized_details) not between 20 and 2000 then
    raise exception using errcode = 'P0001', message = 'VALIDATION_FAILED';
  end if;

  if not private.report_target_is_available(actor_id, parsed_target_type, input_target_id) then
    raise exception using errcode = 'P0001', message = 'NOT_FOUND';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended('huddle:report:' || actor_id::text, 0)
  );

  if parsed_category <> 'immediate_danger' then
    select count(*)
    into recent_count
    from public.reports as recent_report
    where recent_report.reporter_id = actor_id
      and recent_report.created_at > statement_timestamp() - interval '10 minutes';

    if recent_count >= 3 then
      raise exception using errcode = 'P0001', message = 'RATE_LIMITED';
    end if;
  end if;

  insert into public.reports (
    reporter_id,
    target_type,
    profile_id,
    group_id,
    venue_id,
    event_id,
    category,
    details
  )
  values (
    actor_id,
    parsed_target_type,
    case when parsed_target_type = 'profile' then input_target_id end,
    case when parsed_target_type = 'group' then input_target_id end,
    case when parsed_target_type = 'venue' then input_target_id end,
    case when parsed_target_type = 'event' then input_target_id end,
    parsed_category,
    normalized_details
  )
  returning * into created_report;

  perform private.write_security_audit(
    actor_id,
    'report.submit',
    parsed_target_type::text,
    input_target_id,
    'succeeded',
    audit_request_id,
    jsonb_build_object('category', parsed_category::text)
  );

  return query select created_report.id, 'received'::text;
end;
$function$;

comment on function public.submit_report(text, uuid, text, text, uuid) is
  'Creates one bounded confidential report for an authorized target. Non-danger spam is limited; immediate-danger submissions remain available.';

create or replace function public.submit_profile_report(
  input_handle text,
  input_category text,
  input_details text,
  audit_request_id uuid default null
)
returns table (report_id uuid, status text)
language plpgsql
security definer
set search_path = ''
as $function$
declare
  target_id uuid;
begin
  if input_handle is null
    or btrim(input_handle) <> lower(btrim(input_handle))
    or btrim(input_handle) !~ '^[a-z0-9_]{3,30}$' then
    raise exception using errcode = 'P0001', message = 'VALIDATION_FAILED';
  end if;

  select profile.id
  into target_id
  from public.profiles as profile
  where profile.handle = btrim(input_handle)
    and profile.profile_completed_at is not null;

  if target_id is null then
    raise exception using errcode = 'P0001', message = 'NOT_FOUND';
  end if;

  return query
  select submitted.report_id, submitted.status
  from public.submit_report(
    'profile',
    target_id,
    input_category,
    input_details,
    audit_request_id
  ) as submitted;
end;
$function$;

create or replace function public.list_my_reports(
  input_limit integer default 20,
  input_offset integer default 0
)
returns table (
  report_id uuid,
  target_type text,
  target_label text,
  category text,
  safe_status text,
  created_at timestamptz
)
language plpgsql
security definer
stable
set search_path = ''
as $function$
declare
  actor_id uuid := private.assert_safety_actor(false);
begin
  if input_limit not between 1 and 50
    or input_offset not between 0 and 10000 then
    raise exception using errcode = 'P0001', message = 'VALIDATION_FAILED';
  end if;

  return query
  select
    report.id,
    report.target_type::text,
    coalesce(profile.handle, supporter_group.name, venue.name, event.title, 'Unavailable'),
    report.category::text,
    case
      when report.status = 'open' then 'received'
      when report.status = 'reviewing' then 'reviewing'
      else 'closed'
    end,
    report.created_at
  from public.reports as report
  left join public.profiles as profile on profile.id = report.profile_id
  left join public.groups as supporter_group on supporter_group.id = report.group_id
  left join public.venues as venue on venue.id = report.venue_id
  left join public.events as event on event.id = report.event_id
  where report.reporter_id = actor_id
  order by report.created_at desc, report.id desc
  limit input_limit
  offset input_offset;
end;
$function$;

create or replace function public.viewer_is_platform_moderator()
returns boolean
language sql
security definer
stable
set search_path = ''
as $function$
  select private.has_platform_role(
    auth.uid(),
    array['moderator', 'admin']::public.platform_role[]
  )
  and private.profile_is_community_eligible(auth.uid())
  and not exists (
    select 1
    from public.profiles as profile
    where profile.id = auth.uid()
      and profile.community_restricted_at is not null
  );
$function$;

create or replace function private.moderation_target_appellant(
  input_target_type public.moderation_target_type,
  input_profile_id uuid,
  input_group_id uuid,
  input_venue_id uuid,
  input_event_id uuid
)
returns uuid
language sql
security definer
stable
set search_path = ''
as $function$
  select case input_target_type
    when 'profile' then input_profile_id
    when 'group' then (
      select supporter_group.owner_id
      from public.groups as supporter_group
      where supporter_group.id = input_group_id
    )
    when 'venue' then (
      select venue.owner_id
      from public.venues as venue
      where venue.id = input_venue_id
    )
    when 'event' then (
      select coalesce(event.host_user_id, venue.owner_id)
      from public.events as event
      left join public.venues as venue on venue.id = event.host_venue_id
      where event.id = input_event_id
    )
  end;
$function$;

create or replace function public.list_moderation_reports(
  input_status text default null,
  input_limit integer default 20,
  input_offset integer default 0
)
returns table (
  report_id uuid,
  reporter_handle text,
  target_type text,
  target_id uuid,
  target_label text,
  category text,
  details text,
  status text,
  assigned_to_me boolean,
  created_at timestamptz
)
language plpgsql
security definer
stable
set search_path = ''
as $function$
declare
  actor_id uuid := private.assert_platform_moderator();
  parsed_status public.report_status;
begin
  if input_limit not between 1 and 50
    or input_offset not between 0 and 10000 then
    raise exception using errcode = 'P0001', message = 'VALIDATION_FAILED';
  end if;

  if input_status is not null then
    begin
      parsed_status := input_status::public.report_status;
    exception when invalid_text_representation then
      raise exception using errcode = 'P0001', message = 'VALIDATION_FAILED';
    end;
  end if;

  return query
  select
    report.id,
    reporter.handle,
    report.target_type::text,
    coalesce(report.profile_id, report.group_id, report.venue_id, report.event_id),
    coalesce(target_profile.handle, supporter_group.name, venue.name, event.title, 'Unavailable'),
    report.category::text,
    report.details,
    report.status::text,
    coalesce(report.assigned_to = actor_id, false),
    report.created_at
  from public.reports as report
  join public.profiles as reporter on reporter.id = report.reporter_id
  left join public.profiles as target_profile on target_profile.id = report.profile_id
  left join public.groups as supporter_group on supporter_group.id = report.group_id
  left join public.venues as venue on venue.id = report.venue_id
  left join public.events as event on event.id = report.event_id
  where parsed_status is null or report.status = parsed_status
  order by report.created_at, report.id
  limit input_limit
  offset input_offset;
end;
$function$;

create or replace function public.assign_report(
  input_report_id uuid,
  audit_request_id uuid default null
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $function$
declare
  actor_id uuid := private.assert_platform_moderator();
  target_report public.reports%rowtype;
begin
  select report.*
  into target_report
  from public.reports as report
  where report.id = input_report_id
  for update;

  if not found then
    raise exception using errcode = 'P0001', message = 'NOT_FOUND';
  end if;

  if target_report.status in ('resolved', 'dismissed') then
    raise exception using errcode = 'P0001', message = 'INVALID_TRANSITION';
  end if;

  if target_report.assigned_to is not null and target_report.assigned_to <> actor_id then
    raise exception using errcode = 'P0001', message = 'NOT_ALLOWED';
  end if;

  update public.reports as report
  set status = 'reviewing', assigned_to = actor_id
  where report.id = target_report.id;

  perform private.write_security_audit(
    actor_id,
    'moderation.report.assign',
    'report',
    target_report.id,
    'succeeded',
    audit_request_id,
    '{}'::jsonb
  );

  return true;
end;
$function$;

create or replace function public.dismiss_report(
  input_report_id uuid,
  input_reason text,
  audit_request_id uuid default null
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $function$
declare
  actor_id uuid := private.assert_platform_moderator();
  normalized_reason text := btrim(input_reason);
  target_report public.reports%rowtype;
begin
  if char_length(normalized_reason) not between 10 and 2000 then
    raise exception using errcode = 'P0001', message = 'VALIDATION_FAILED';
  end if;

  select report.*
  into target_report
  from public.reports as report
  where report.id = input_report_id
  for update;

  if not found then
    raise exception using errcode = 'P0001', message = 'NOT_FOUND';
  end if;

  if target_report.status in ('resolved', 'dismissed') then
    raise exception using errcode = 'P0001', message = 'INVALID_TRANSITION';
  end if;

  if target_report.assigned_to is not null and target_report.assigned_to <> actor_id then
    raise exception using errcode = 'P0001', message = 'NOT_ALLOWED';
  end if;
  if target_report.status <> 'reviewing' or target_report.assigned_to is distinct from actor_id then
    raise exception using errcode = 'P0001', message = 'INVALID_TRANSITION';
  end if;

  update public.reports as report
  set
    status = 'dismissed',
    assigned_to = actor_id,
    resolution_note = normalized_reason
  where report.id = target_report.id;

  perform private.write_security_audit(
    actor_id,
    'moderation.report.dismiss',
    'report',
    target_report.id,
    'succeeded',
    audit_request_id,
    '{}'::jsonb
  );

  return true;
end;
$function$;

create or replace function public.apply_moderation_action(
  input_report_id uuid,
  input_action text,
  input_reason text,
  input_duration_hours integer default null,
  audit_request_id uuid default null
)
returns table (moderation_action_id uuid, action text)
language plpgsql
security definer
set search_path = ''
as $function$
#variable_conflict use_variable
declare
  actor_id uuid := private.assert_platform_moderator();
  parsed_action public.moderation_action_kind;
  normalized_reason text := btrim(input_reason);
  target_report public.reports%rowtype;
  target_appellant_id uuid;
  prior_state jsonb := '{}'::jsonb;
  action_expiry timestamptz;
  created_action public.moderation_actions%rowtype;
  target_profile public.profiles%rowtype;
  target_group public.groups%rowtype;
  target_venue public.venues%rowtype;
  target_event public.events%rowtype;
begin
  begin
    parsed_action := input_action::public.moderation_action_kind;
  exception when invalid_text_representation then
    raise exception using errcode = 'P0001', message = 'VALIDATION_FAILED';
  end;

  if char_length(normalized_reason) not between 10 and 1000 then
    raise exception using errcode = 'P0001', message = 'VALIDATION_FAILED';
  end if;

  if parsed_action in ('feature_restriction', 'temporary_suspension') then
    if input_duration_hours not between 1 and 720 then
      raise exception using errcode = 'P0001', message = 'VALIDATION_FAILED';
    end if;
    action_expiry := statement_timestamp() + make_interval(hours => input_duration_hours);
  elsif input_duration_hours is not null then
    raise exception using errcode = 'P0001', message = 'VALIDATION_FAILED';
  end if;

  select report.*
  into target_report
  from public.reports as report
  where report.id = input_report_id
  for update;

  if not found then
    raise exception using errcode = 'P0001', message = 'NOT_FOUND';
  end if;

  if target_report.status in ('resolved', 'dismissed') then
    raise exception using errcode = 'P0001', message = 'INVALID_TRANSITION';
  end if;

  if target_report.assigned_to is not null
    and target_report.assigned_to <> actor_id then
    raise exception using errcode = 'P0001', message = 'NOT_ALLOWED';
  end if;
  if target_report.status <> 'reviewing' or target_report.assigned_to is distinct from actor_id then
    raise exception using errcode = 'P0001', message = 'INVALID_TRANSITION';
  end if;

  if not (
    parsed_action = 'content_correction'
    or (target_report.target_type = 'profile' and parsed_action in (
      'warning', 'feature_restriction', 'temporary_suspension', 'permanent_account_ban'
    ))
    or (target_report.target_type = 'group' and parsed_action = 'group_suspension')
    or (target_report.target_type = 'venue' and parsed_action = 'venue_suspension')
    or (target_report.target_type = 'event' and parsed_action = 'event_cancellation')
  ) then
    raise exception using errcode = 'P0001', message = 'VALIDATION_FAILED';
  end if;

  target_appellant_id := private.moderation_target_appellant(
    target_report.target_type,
    target_report.profile_id,
    target_report.group_id,
    target_report.venue_id,
    target_report.event_id
  );

  if target_appellant_id is null or target_appellant_id = actor_id then
    raise exception using errcode = 'P0001', message = 'NOT_ALLOWED';
  end if;

  case
    when parsed_action in (
      'warning', 'content_correction', 'feature_restriction',
      'temporary_suspension', 'permanent_account_ban'
    ) and target_report.target_type = 'profile' then
      select profile.*
      into target_profile
      from public.profiles as profile
      where profile.id = target_report.profile_id
      for update;

      if not found then
        raise exception using errcode = 'P0001', message = 'NOT_FOUND';
      end if;

      prior_state := jsonb_build_object(
        'community_restricted_at', target_profile.community_restricted_at,
        'community_restricted_until', target_profile.community_restricted_until,
        'suspended_at', target_profile.suspended_at,
        'suspension_expires_at', target_profile.suspension_expires_at
      );

      if parsed_action = 'feature_restriction' then
        if target_profile.community_restricted_at is not null then
          raise exception using errcode = 'P0001', message = 'INVALID_TRANSITION';
        end if;

        update public.profiles as profile
        set
          community_restricted_at = statement_timestamp(),
          community_restricted_until = action_expiry
        where profile.id = target_profile.id;
      elsif parsed_action in ('temporary_suspension', 'permanent_account_ban') then
        if target_profile.suspended_at is not null then
          raise exception using errcode = 'P0001', message = 'INVALID_TRANSITION';
        end if;

        update public.profiles as profile
        set
          suspended_at = statement_timestamp(),
          suspension_expires_at = case
            when parsed_action = 'temporary_suspension' then action_expiry
            else null
          end
        where profile.id = target_profile.id;
      end if;

    when parsed_action = 'group_suspension' then
      select supporter_group.*
      into target_group
      from public.groups as supporter_group
      where supporter_group.id = target_report.group_id
      for update;

      if not found then
        raise exception using errcode = 'P0001', message = 'NOT_FOUND';
      end if;
      if target_group.lifecycle in ('suspended', 'archived') then
        raise exception using errcode = 'P0001', message = 'INVALID_TRANSITION';
      end if;

      prior_state := jsonb_build_object(
        'lifecycle', target_group.lifecycle::text,
        'activated_at', target_group.activated_at,
        'suspended_at', target_group.suspended_at
      );
      update public.groups as supporter_group
      set lifecycle = 'suspended', suspended_at = statement_timestamp()
      where supporter_group.id = target_group.id;

    when parsed_action = 'venue_suspension' then
      select venue.*
      into target_venue
      from public.venues as venue
      where venue.id = target_report.venue_id
      for update;

      if not found then
        raise exception using errcode = 'P0001', message = 'NOT_FOUND';
      end if;
      if target_venue.verification_status = 'suspended' then
        raise exception using errcode = 'P0001', message = 'INVALID_TRANSITION';
      end if;

      prior_state := jsonb_build_object(
        'verification_status', target_venue.verification_status::text,
        'suspended_at', target_venue.suspended_at
      );
      update public.venues as venue
      set verification_status = 'suspended', suspended_at = statement_timestamp()
      where venue.id = target_venue.id;

    when parsed_action = 'event_cancellation' then
      select event.*
      into target_event
      from public.events as event
      where event.id = target_report.event_id
      for update;

      if not found then
        raise exception using errcode = 'P0001', message = 'NOT_FOUND';
      end if;
      if target_event.status in ('cancelled', 'completed') then
        raise exception using errcode = 'P0001', message = 'INVALID_TRANSITION';
      end if;

      prior_state := jsonb_build_object(
        'status', target_event.status::text,
        'published_at', target_event.published_at,
        'cancelled_at', target_event.cancelled_at,
        'cancel_reason', target_event.cancel_reason
      );
      update public.events as event
      set
        status = 'cancelled',
        cancelled_at = statement_timestamp(),
        cancel_reason = 'Cancelled by platform moderation.'
      where event.id = target_event.id;
  end case;

  insert into public.moderation_actions (
    report_id,
    moderator_id,
    target_type,
    profile_id,
    group_id,
    venue_id,
    event_id,
    action,
    reason,
    expires_at,
    state_before
  )
  values (
    target_report.id,
    actor_id,
    target_report.target_type,
    target_report.profile_id,
    target_report.group_id,
    target_report.venue_id,
    target_report.event_id,
    parsed_action,
    normalized_reason,
    action_expiry,
    prior_state
  )
  returning * into created_action;

  update public.reports as report
  set
    status = 'resolved',
    assigned_to = actor_id,
    resolution_note = 'Platform action applied: ' || parsed_action::text
  where report.id = target_report.id;

  perform private.write_security_audit(
    actor_id,
    'moderation.action.apply',
    target_report.target_type::text,
    coalesce(
      target_report.profile_id,
      target_report.group_id,
      target_report.venue_id,
      target_report.event_id
    ),
    'succeeded',
    audit_request_id,
    jsonb_build_object('action', parsed_action::text)
  );

  return query select created_action.id, created_action.action::text;
end;
$function$;

create or replace function private.reverse_moderation_action_state(
  input_action_id uuid,
  input_reverser_id uuid,
  input_reason text,
  audit_request_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare
  target_action public.moderation_actions%rowtype;
  target_event public.events%rowtype;
begin
  select moderation_action.*
  into target_action
  from public.moderation_actions as moderation_action
  where moderation_action.id = input_action_id
  for update;

  if not found then
    raise exception using errcode = 'P0001', message = 'NOT_FOUND';
  end if;
  if target_action.reversed_at is not null then
    raise exception using errcode = 'P0001', message = 'INVALID_TRANSITION';
  end if;

  case target_action.action
    when 'feature_restriction' then
      update public.profiles as profile
      set
        community_restricted_at = nullif(
          target_action.state_before ->> 'community_restricted_at',
          ''
        )::timestamptz,
        community_restricted_until = nullif(
          target_action.state_before ->> 'community_restricted_until',
          ''
        )::timestamptz
      where profile.id = target_action.profile_id
        and profile.community_restricted_at = target_action.created_at
        and profile.community_restricted_until is not distinct from target_action.expires_at;
      if not found then
        raise exception using errcode = 'P0001', message = 'INVALID_TRANSITION';
      end if;
    when 'temporary_suspension' then
      update public.profiles as profile
      set
        suspended_at = nullif(target_action.state_before ->> 'suspended_at', '')::timestamptz,
        suspension_expires_at = nullif(
          target_action.state_before ->> 'suspension_expires_at',
          ''
        )::timestamptz
      where profile.id = target_action.profile_id
        and profile.suspended_at = target_action.created_at
        and profile.suspension_expires_at is not distinct from target_action.expires_at;
      if not found then
        raise exception using errcode = 'P0001', message = 'INVALID_TRANSITION';
      end if;
    when 'permanent_account_ban' then
      update public.profiles as profile
      set
        suspended_at = nullif(target_action.state_before ->> 'suspended_at', '')::timestamptz,
        suspension_expires_at = nullif(
          target_action.state_before ->> 'suspension_expires_at',
          ''
        )::timestamptz
      where profile.id = target_action.profile_id
        and profile.suspended_at = target_action.created_at
        and profile.suspension_expires_at is null;
      if not found then
        raise exception using errcode = 'P0001', message = 'INVALID_TRANSITION';
      end if;
    when 'group_suspension' then
      update public.groups as supporter_group
      set
        lifecycle = (target_action.state_before ->> 'lifecycle')::public.group_lifecycle,
        activated_at = nullif(target_action.state_before ->> 'activated_at', '')::timestamptz,
        suspended_at = nullif(target_action.state_before ->> 'suspended_at', '')::timestamptz
      where supporter_group.id = target_action.group_id
        and supporter_group.lifecycle = 'suspended'
        and supporter_group.suspended_at = target_action.created_at;
      if not found then
        raise exception using errcode = 'P0001', message = 'INVALID_TRANSITION';
      end if;
    when 'venue_suspension' then
      update public.venues as venue
      set
        verification_status = (
          target_action.state_before ->> 'verification_status'
        )::public.venue_verification_status,
        suspended_at = nullif(target_action.state_before ->> 'suspended_at', '')::timestamptz
      where venue.id = target_action.venue_id
        and venue.verification_status = 'suspended'
        and venue.suspended_at = target_action.created_at;
      if not found then
        raise exception using errcode = 'P0001', message = 'INVALID_TRANSITION';
      end if;
    when 'event_cancellation' then
      select event.*
      into target_event
      from public.events as event
      where event.id = target_action.event_id
      for update;

      if not found then
        raise exception using errcode = 'P0001', message = 'NOT_FOUND';
      end if;
      if target_event.ends_at <= statement_timestamp() then
        raise exception using errcode = 'P0001', message = 'INVALID_TRANSITION';
      end if;

      update public.events as event
      set
        status = (target_action.state_before ->> 'status')::public.event_status,
        published_at = nullif(target_action.state_before ->> 'published_at', '')::timestamptz,
        cancelled_at = nullif(target_action.state_before ->> 'cancelled_at', '')::timestamptz,
        cancel_reason = nullif(target_action.state_before ->> 'cancel_reason', '')
      where event.id = target_action.event_id
        and event.status = 'cancelled'
        and event.cancelled_at = target_action.created_at
        and event.cancel_reason = 'Cancelled by platform moderation.';
      if not found then
        raise exception using errcode = 'P0001', message = 'INVALID_TRANSITION';
      end if;
    else
      null;
  end case;

  update public.moderation_actions as moderation_action
  set
    reversed_by = input_reverser_id,
    reversed_at = statement_timestamp(),
    reversal_reason = input_reason
  where moderation_action.id = target_action.id;

  perform private.write_security_audit(
    input_reverser_id,
    'moderation.action.reverse',
    target_action.target_type::text,
    coalesce(
      target_action.profile_id,
      target_action.group_id,
      target_action.venue_id,
      target_action.event_id
    ),
    'succeeded',
    audit_request_id,
    jsonb_build_object('action', target_action.action::text)
  );
end;
$function$;

create or replace function public.reverse_moderation_action(
  input_action_id uuid,
  input_reason text,
  audit_request_id uuid default null
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $function$
declare
  actor_id uuid := private.assert_platform_moderator();
  normalized_reason text := btrim(input_reason);
begin
  if char_length(normalized_reason) not between 10 and 1000 then
    raise exception using errcode = 'P0001', message = 'VALIDATION_FAILED';
  end if;

  perform private.reverse_moderation_action_state(
    input_action_id,
    actor_id,
    normalized_reason,
    audit_request_id
  );
  return true;
end;
$function$;

create or replace function public.submit_moderation_appeal(
  input_action_id uuid,
  input_reason text,
  audit_request_id uuid default null
)
returns table (appeal_id uuid, status text)
language plpgsql
security definer
set search_path = ''
as $function$
#variable_conflict use_variable
declare
  actor_id uuid := private.assert_safety_actor(false);
  normalized_reason text := btrim(input_reason);
  target_action public.moderation_actions%rowtype;
  appellant_id uuid;
  created_appeal public.moderation_appeals%rowtype;
begin
  if char_length(normalized_reason) not between 20 and 2000 then
    raise exception using errcode = 'P0001', message = 'VALIDATION_FAILED';
  end if;

  select moderation_action.*
  into target_action
  from public.moderation_actions as moderation_action
  where moderation_action.id = input_action_id
  for update;

  if not found or target_action.reversed_at is not null then
    raise exception using errcode = 'P0001', message = 'NOT_FOUND';
  end if;

  appellant_id := private.moderation_target_appellant(
    target_action.target_type,
    target_action.profile_id,
    target_action.group_id,
    target_action.venue_id,
    target_action.event_id
  );

  if appellant_id is distinct from actor_id then
    raise exception using errcode = 'P0001', message = 'NOT_FOUND';
  end if;

  insert into public.moderation_appeals (
    moderation_action_id,
    appellant_id,
    reason
  )
  values (target_action.id, actor_id, normalized_reason)
  returning * into created_appeal;

  perform private.write_security_audit(
    actor_id,
    'moderation.appeal.submit',
    'moderation_action',
    target_action.id,
    'succeeded',
    audit_request_id,
    '{}'::jsonb
  );

  return query select created_appeal.id, created_appeal.status::text;
exception
  when unique_violation then
    raise exception using errcode = 'P0001', message = 'INVALID_TRANSITION';
end;
$function$;

create or replace function public.list_my_moderation_actions(
  input_limit integer default 20,
  input_offset integer default 0
)
returns table (
  moderation_action_id uuid,
  target_type text,
  target_label text,
  action text,
  reason text,
  expires_at timestamptz,
  created_at timestamptz,
  reversed_at timestamptz,
  reversal_reason text,
  has_active_appeal boolean
)
language plpgsql
security definer
stable
set search_path = ''
as $function$
declare
  actor_id uuid := private.assert_safety_actor(false);
begin
  if input_limit not between 1 and 50
    or input_offset not between 0 and 10000 then
    raise exception using errcode = 'P0001', message = 'VALIDATION_FAILED';
  end if;

  return query
  select
    moderation_action.id,
    moderation_action.target_type::text,
    coalesce(profile.handle, supporter_group.name, venue.name, event.title, 'Unavailable'),
    moderation_action.action::text,
    moderation_action.reason,
    moderation_action.expires_at,
    moderation_action.created_at,
    moderation_action.reversed_at,
    moderation_action.reversal_reason,
    exists (
      select 1
      from public.moderation_appeals as appeal
      where appeal.moderation_action_id = moderation_action.id
        and appeal.appellant_id = actor_id
        and appeal.status in ('open', 'reviewing')
    )
  from public.moderation_actions as moderation_action
  left join public.profiles as profile on profile.id = moderation_action.profile_id
  left join public.groups as supporter_group on supporter_group.id = moderation_action.group_id
  left join public.venues as venue on venue.id = moderation_action.venue_id
  left join public.events as event on event.id = moderation_action.event_id
  left join public.venues as event_venue on event_venue.id = event.host_venue_id
  where private.moderation_target_appellant(
    moderation_action.target_type,
    moderation_action.profile_id,
    moderation_action.group_id,
    moderation_action.venue_id,
    moderation_action.event_id
  ) = actor_id
  order by moderation_action.created_at desc, moderation_action.id desc
  limit input_limit
  offset input_offset;
end;
$function$;

create or replace function public.list_my_moderation_appeals(
  input_limit integer default 20,
  input_offset integer default 0
)
returns table (
  appeal_id uuid,
  moderation_action_id uuid,
  action text,
  reason text,
  status text,
  outcome_reason text,
  created_at timestamptz,
  reviewed_at timestamptz
)
language plpgsql
security definer
stable
set search_path = ''
as $function$
declare
  actor_id uuid := private.assert_safety_actor(false);
begin
  if input_limit not between 1 and 50
    or input_offset not between 0 and 10000 then
    raise exception using errcode = 'P0001', message = 'VALIDATION_FAILED';
  end if;

  return query
  select
    appeal.id,
    appeal.moderation_action_id,
    moderation_action.action::text,
    appeal.reason,
    appeal.status::text,
    appeal.outcome_reason,
    appeal.created_at,
    appeal.reviewed_at
  from public.moderation_appeals as appeal
  join public.moderation_actions as moderation_action
    on moderation_action.id = appeal.moderation_action_id
  where appeal.appellant_id = actor_id
  order by appeal.created_at desc, appeal.id desc
  limit input_limit
  offset input_offset;
end;
$function$;

create or replace function public.list_moderation_actions(
  input_active_only boolean default true,
  input_limit integer default 20,
  input_offset integer default 0
)
returns table (
  moderation_action_id uuid,
  target_type text,
  target_label text,
  action text,
  reason text,
  expires_at timestamptz,
  created_at timestamptz,
  reversed_at timestamptz,
  reversal_reason text
)
language plpgsql
security definer
stable
set search_path = ''
as $function$
declare
  actor_id uuid := private.assert_platform_moderator();
begin
  if input_limit not between 1 and 50
    or input_offset not between 0 and 10000 then
    raise exception using errcode = 'P0001', message = 'VALIDATION_FAILED';
  end if;

  return query
  select
    moderation_action.id,
    moderation_action.target_type::text,
    coalesce(profile.handle, supporter_group.name, venue.name, event.title, 'Unavailable'),
    moderation_action.action::text,
    moderation_action.reason,
    moderation_action.expires_at,
    moderation_action.created_at,
    moderation_action.reversed_at,
    moderation_action.reversal_reason
  from public.moderation_actions as moderation_action
  left join public.profiles as profile on profile.id = moderation_action.profile_id
  left join public.groups as supporter_group on supporter_group.id = moderation_action.group_id
  left join public.venues as venue on venue.id = moderation_action.venue_id
  left join public.events as event on event.id = moderation_action.event_id
  where not input_active_only or moderation_action.reversed_at is null
  order by
    moderation_action.expires_at nulls last,
    moderation_action.created_at desc,
    moderation_action.id desc
  limit input_limit
  offset input_offset;
end;
$function$;

create or replace function private.has_eligible_moderator_peer(
  input_moderator_id uuid,
  input_appellant_id uuid
)
returns boolean
language sql
security definer
stable
set search_path = ''
as $function$
  select exists (
    select 1
    from public.platform_roles as platform_role
    join public.profiles as profile on profile.id = platform_role.profile_id
    where platform_role.profile_id <> input_moderator_id
      and platform_role.profile_id <> input_appellant_id
      and platform_role.role in ('moderator', 'admin')
      and private.profile_is_community_eligible(profile.id)
      and profile.community_restricted_at is null
  );
$function$;

create or replace function public.list_moderation_appeals(
  input_status text default null,
  input_limit integer default 20,
  input_offset integer default 0
)
returns table (
  appeal_id uuid,
  moderation_action_id uuid,
  appellant_handle text,
  action text,
  appeal_reason text,
  status text,
  original_moderator_id uuid,
  can_current_moderator_review boolean,
  created_at timestamptz
)
language plpgsql
security definer
stable
set search_path = ''
as $function$
declare
  actor_id uuid := private.assert_platform_moderator();
  parsed_status public.appeal_status;
begin
  if input_limit not between 1 and 50
    or input_offset not between 0 and 10000 then
    raise exception using errcode = 'P0001', message = 'VALIDATION_FAILED';
  end if;

  if input_status is not null then
    begin
      parsed_status := input_status::public.appeal_status;
    exception when invalid_text_representation then
      raise exception using errcode = 'P0001', message = 'VALIDATION_FAILED';
    end;
  end if;

  return query
  select
    appeal.id,
    appeal.moderation_action_id,
    appellant.handle,
    moderation_action.action::text,
    appeal.reason,
    appeal.status::text,
    moderation_action.moderator_id,
    appeal.appellant_id <> actor_id
      and not (
        moderation_action.moderator_id = actor_id
        and private.has_eligible_moderator_peer(actor_id, appeal.appellant_id)
      ),
    appeal.created_at
  from public.moderation_appeals as appeal
  join public.moderation_actions as moderation_action
    on moderation_action.id = appeal.moderation_action_id
  join public.profiles as appellant on appellant.id = appeal.appellant_id
  where parsed_status is null or appeal.status = parsed_status
  order by
    (moderation_action.moderator_id = actor_id),
    appeal.created_at,
    appeal.id
  limit input_limit
  offset input_offset;
end;
$function$;

create or replace function public.review_moderation_appeal(
  input_appeal_id uuid,
  input_decision text,
  input_outcome_reason text,
  audit_request_id uuid default null
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $function$
declare
  actor_id uuid := private.assert_platform_moderator();
  normalized_reason text := btrim(input_outcome_reason);
  parsed_status public.appeal_status;
  target_appeal public.moderation_appeals%rowtype;
  target_action public.moderation_actions%rowtype;
begin
  parsed_status := case lower(btrim(input_decision))
    when 'uphold' then 'upheld'::public.appeal_status
    when 'reverse' then 'reversed'::public.appeal_status
    else null
  end;

  if parsed_status is null
    or char_length(normalized_reason) not between 10 and 2000 then
    raise exception using errcode = 'P0001', message = 'VALIDATION_FAILED';
  end if;

  select appeal.*
  into target_appeal
  from public.moderation_appeals as appeal
  where appeal.id = input_appeal_id
  for update;

  if not found then
    raise exception using errcode = 'P0001', message = 'NOT_FOUND';
  end if;
  if target_appeal.status not in ('open', 'reviewing') then
    raise exception using errcode = 'P0001', message = 'INVALID_TRANSITION';
  end if;
  if target_appeal.appellant_id = actor_id then
    raise exception using errcode = 'P0001', message = 'NOT_ALLOWED';
  end if;

  select moderation_action.*
  into target_action
  from public.moderation_actions as moderation_action
  where moderation_action.id = target_appeal.moderation_action_id
  for update;

  if target_action.moderator_id = actor_id
    and private.has_eligible_moderator_peer(actor_id, target_appeal.appellant_id) then
    raise exception using errcode = 'P0001', message = 'NOT_ALLOWED';
  end if;

  if parsed_status = 'reversed' then
    perform private.reverse_moderation_action_state(
      target_action.id,
      actor_id,
      normalized_reason,
      audit_request_id
    );
  end if;

  update public.moderation_appeals as appeal
  set
    status = parsed_status,
    reviewed_by = actor_id,
    reviewed_at = statement_timestamp(),
    outcome_reason = normalized_reason
  where appeal.id = target_appeal.id;

  perform private.write_security_audit(
    actor_id,
    'moderation.appeal.review',
    'moderation_appeal',
    target_appeal.id,
    'succeeded',
    audit_request_id,
    jsonb_build_object('decision', parsed_status::text)
  );

  return true;
end;
$function$;

alter table public.reports enable row level security;
alter table public.reports force row level security;
alter table public.moderation_actions enable row level security;
alter table public.moderation_actions force row level security;
alter table public.moderation_appeals enable row level security;
alter table public.moderation_appeals force row level security;

revoke all on public.reports from anon, authenticated;
revoke all on public.moderation_actions from anon, authenticated;
revoke all on public.moderation_appeals from anon, authenticated;

revoke all on function private.assert_safety_actor(boolean) from public, anon, authenticated;
revoke all on function private.assert_platform_moderator() from public, anon, authenticated;
revoke all on function private.report_target_is_available(uuid, public.moderation_target_type, uuid)
  from public, anon, authenticated;
revoke all on function private.moderation_target_appellant(
  public.moderation_target_type, uuid, uuid, uuid, uuid
) from public, anon, authenticated;
revoke all on function private.has_eligible_moderator_peer(uuid, uuid)
  from public, anon, authenticated;
revoke all on function private.reverse_moderation_action_state(uuid, uuid, text, uuid)
  from public, anon, authenticated;

revoke all on function public.submit_report(text, uuid, text, text, uuid) from public, anon;
revoke all on function public.submit_profile_report(text, text, text, uuid) from public, anon;
revoke all on function public.list_my_reports(integer, integer) from public, anon;
revoke all on function public.viewer_is_platform_moderator() from public, anon;
revoke all on function public.list_moderation_reports(text, integer, integer) from public, anon;
revoke all on function public.assign_report(uuid, uuid) from public, anon;
revoke all on function public.dismiss_report(uuid, text, uuid) from public, anon;
revoke all on function public.apply_moderation_action(uuid, text, text, integer, uuid)
  from public, anon;
revoke all on function public.reverse_moderation_action(uuid, text, uuid) from public, anon;
revoke all on function public.submit_moderation_appeal(uuid, text, uuid) from public, anon;
revoke all on function public.list_my_moderation_actions(integer, integer) from public, anon;
revoke all on function public.list_my_moderation_appeals(integer, integer) from public, anon;
revoke all on function public.list_moderation_actions(boolean, integer, integer)
  from public, anon;
revoke all on function public.list_moderation_appeals(text, integer, integer) from public, anon;
revoke all on function public.review_moderation_appeal(uuid, text, text, uuid) from public, anon;

grant execute on function public.submit_report(text, uuid, text, text, uuid) to authenticated;
grant execute on function public.submit_profile_report(text, text, text, uuid) to authenticated;
grant execute on function public.list_my_reports(integer, integer) to authenticated;
grant execute on function public.viewer_is_platform_moderator() to authenticated;
grant execute on function public.list_moderation_reports(text, integer, integer) to authenticated;
grant execute on function public.assign_report(uuid, uuid) to authenticated;
grant execute on function public.dismiss_report(uuid, text, uuid) to authenticated;
grant execute on function public.apply_moderation_action(uuid, text, text, integer, uuid)
  to authenticated;
grant execute on function public.reverse_moderation_action(uuid, text, uuid) to authenticated;
grant execute on function public.submit_moderation_appeal(uuid, text, uuid) to authenticated;
grant execute on function public.list_my_moderation_actions(integer, integer) to authenticated;
grant execute on function public.list_my_moderation_appeals(integer, integer) to authenticated;
grant execute on function public.list_moderation_actions(boolean, integer, integer)
  to authenticated;
grant execute on function public.list_moderation_appeals(text, integer, integer) to authenticated;
grant execute on function public.review_moderation_appeal(uuid, text, text, uuid) to authenticated;

commit;
