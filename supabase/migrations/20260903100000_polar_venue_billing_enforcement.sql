begin;

-- Read-time cancellation uses the same timestamp boundary as the deadline
-- sweep. It never writes history or waits for a background job.
create function private.venue_event_projected_status(input_event public.events,input_now timestamptz)
returns public.event_status language sql security definer stable set search_path='' as $function$
  select case when input_event.host_venue_id is not null and input_event.status='published'
    and input_event.starts_at>input_now
    and private.venue_billing_effective_state(input_event.host_venue_id,input_now)='expired'
    then 'cancelled'::public.event_status else input_event.status end;
$function$;

create function private.venue_event_participant_visibility(input_event_id uuid,input_actor_id uuid,input_now timestamptz)
returns boolean language sql security definer stable set search_path='' as $function$
  select exists(select 1 from public.events e join public.venues v on v.id=e.host_venue_id
    join public.event_attendance a on a.event_id=e.id and a.user_id=input_actor_id
    where e.id=input_event_id and a.status in ('requested','approved')
      and private.profile_is_fan_eligible(input_actor_id)
      and v.archived_at is null and v.suspended_at is null and v.verification_status<>'suspended'
      and e.status in ('published','cancelled','completed')
      and private.venue_billing_effective_state(v.id,input_now) in ('active','canceling','past_due','provider_stale','legacy_grace','expired'));
$function$;

-- Authenticated mutations call the actor serializer before this helper and
-- recheck row-locking actor eligibility only after the common venue lock.
create function private.lock_event_venue_billing(input_event_id uuid,input_venue_id uuid default null)
returns void language plpgsql security definer volatile set search_path='' as $function$
declare venue_id uuid;
begin
  if input_event_id is not null then
    select e.host_venue_id into venue_id from public.events e where e.id=input_event_id;
    if input_venue_id is not null and venue_id is distinct from input_venue_id then
      raise exception using errcode='P0001',message='NOT_ALLOWED';
    end if;
  else venue_id:=input_venue_id;
  end if;
  if venue_id is not null then perform private.lock_venue_billing(venue_id); end if;
end;
$function$;

create function public.follow_venue(input_venue_id uuid,audit_request_id uuid default null)
returns boolean language plpgsql security definer volatile set search_path='' as $function$
declare actor_id uuid:=private.serialize_actor_transaction(); inserted_rows integer;
begin
  perform private.lock_venue_billing(input_venue_id);
  actor_id:=private.assert_fan_actor();
  if not private.venue_follow_is_allowed(input_venue_id,actor_id) then
    raise exception using errcode='P0001',message='NOT_ALLOWED';
  end if;
  insert into public.venue_follows(user_id,venue_id) values(actor_id,input_venue_id)
    on conflict(user_id,venue_id) do nothing;
  get diagnostics inserted_rows=row_count;
  if inserted_rows>0 then perform private.write_security_audit(actor_id,'venue.follow','venue',input_venue_id,'succeeded',audit_request_id,'{}'::jsonb); end if;
  return true;
end;
$function$;
revoke insert on public.venue_follows from anon,authenticated;
drop policy if exists venue_follows_insert_own on public.venue_follows;
-- The direct INSERT grant is revoked as well as denying all insert policies.
create policy venue_follows_rpc_insert_only on public.venue_follows as restrictive for insert to authenticated with check(false);
revoke all on function public.follow_venue(uuid,uuid) from public,anon,authenticated,service_role;
grant execute on function public.follow_venue(uuid,uuid) to authenticated;
revoke all on function private.venue_event_projected_status(public.events,timestamptz),private.venue_event_participant_visibility(uuid,uuid,timestamptz),private.lock_event_venue_billing(uuid,uuid) from public,anon,authenticated,service_role;
comment on function public.follow_venue(uuid,uuid) is 'Idempotent Fan follow under the actor then venue lock; current public entitlement is required.';

create or replace function private.prepare_account_erasure_core(
  input_confirmation text,
  audit_request_id uuid default null
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $function$
declare
  current_actor_id uuid := auth.uid();
  serialized_actor_id uuid;
  captured_erased_at timestamptz := statement_timestamp();
  cancelled_count bigint := 0;
  first_transition boolean;
  owned_venue_id uuid;
  cleanup_required boolean;
begin
  if current_actor_id is null then
    raise exception using errcode = 'P0001', message = 'AUTH_REQUIRED';
  end if;
  if input_confirmation is distinct from 'DELETE' then
    raise exception using errcode = 'P0001', message = 'CONFIRMATION_MISMATCH';
  end if;

  serialized_actor_id := private.serialize_actor_transaction();
  if serialized_actor_id is distinct from current_actor_id then
    raise exception using errcode = 'P0001', message = 'AUTH_REQUIRED';
  end if;

  -- All venue locks precede every product/billing/profile row lock.
  for owned_venue_id in select v.id from public.venues v where v.owner_id=current_actor_id order by v.id loop
    perform private.lock_venue_billing(owned_venue_id);
  end loop;
  cleanup_required:=exists(select 1 from private.venue_billing_entitlements e join public.venues v on v.id=e.venue_id
    where v.owner_id=current_actor_id and e.polar_customer_id is not null)
    or exists(select 1 from private.venue_billing_checkout_attempts a where a.owner_id=current_actor_id
      and (a.state in ('reserved','uncertain','attached') or a.polar_checkout_id is not null))
    or exists(select 1 from private.polar_account_erasure_cleanup c where c.actor_id=current_actor_id and c.completed_at is null);

  select profile.deleted_at is null
  into first_transition
  from public.profiles as profile
  where profile.id = current_actor_id
  for update;

  if not found then
    raise exception using errcode = 'P0001', message = 'AUTH_REQUIRED';
  end if;

  update public.events as event
  set
    status = 'cancelled',
    cancelled_at = captured_erased_at,
    cancel_reason = 'Host account deleted.'
  where event.status in ('draft', 'pending_group_review', 'published')
    and event.ends_at > captured_erased_at
    and (
      event.host_user_id = current_actor_id
      or event.organizing_group_id in (
        select supporter_group.id
        from public.groups as supporter_group
        where supporter_group.owner_id = current_actor_id
      )
      or event.audience_group_id in (
        select supporter_group.id
        from public.groups as supporter_group
        where supporter_group.owner_id = current_actor_id
      )
      or event.host_venue_id in (
        select venue.id
        from public.venues as venue
        where venue.owner_id = current_actor_id
      )
    );
  get diagnostics cancelled_count = row_count;

  update public.event_invitations as invitation
  set status = 'revoked', responded_at = captured_erased_at
  where invitation.status = 'pending'
    and (
      invitation.invitee_id = current_actor_id
      or invitation.invited_by = current_actor_id
      or exists (
        select 1
        from public.events as event
        where event.id = invitation.event_id
          and (
            event.host_user_id = current_actor_id
            or event.organizing_group_id in (
              select supporter_group.id
              from public.groups as supporter_group
              where supporter_group.owner_id = current_actor_id
            )
            or event.audience_group_id in (
              select supporter_group.id
              from public.groups as supporter_group
              where supporter_group.owner_id = current_actor_id
            )
            or event.host_venue_id in (
              select venue.id
              from public.venues as venue
              where venue.owner_id = current_actor_id
            )
          )
      )
    );

  update public.group_invitations as invitation
  set status = 'revoked', responded_at = null, revoked_at = captured_erased_at
  where invitation.status = 'pending'
    and (
      invitation.invitee_id = current_actor_id
      or invitation.invited_by = current_actor_id
      or invitation.group_id in (
        select supporter_group.id
        from public.groups as supporter_group
        where supporter_group.owner_id = current_actor_id
      )
    );

  update public.event_invite_tokens as invite
  set revoked_at = captured_erased_at, revoked_by = current_actor_id
  where invite.revoked_at is null
    and invite.expires_at > captured_erased_at
    and invite.use_count < invite.max_uses
    and (
      invite.created_by = current_actor_id
      or exists (
        select 1
        from public.events as event
        where event.id = invite.event_id
          and (
            event.host_user_id = current_actor_id
            or event.organizing_group_id in (
              select supporter_group.id
              from public.groups as supporter_group
              where supporter_group.owner_id = current_actor_id
            )
            or event.audience_group_id in (
              select supporter_group.id
              from public.groups as supporter_group
              where supporter_group.owner_id = current_actor_id
            )
            or event.host_venue_id in (
              select venue.id
              from public.venues as venue
              where venue.owner_id = current_actor_id
            )
          )
      )
    );

  update public.group_invite_tokens as invite
  set revoked_at = captured_erased_at
  where invite.revoked_at is null
    and invite.expires_at > captured_erased_at
    and invite.use_count < invite.max_uses
    and (
      invite.created_by = current_actor_id
      or invite.group_id in (
        select supporter_group.id
        from public.groups as supporter_group
        where supporter_group.owner_id = current_actor_id
      )
    );

  update public.event_attendance as attendance
  set
    status = 'left',
    left_at = captured_erased_at,
    removed_by = null,
    removed_at = null,
    removal_reason = null
  where attendance.user_id = current_actor_id
    and attendance.status in ('requested', 'approved');

  update public.groups as supporter_group
  set lifecycle = 'archived'
  where supporter_group.owner_id = current_actor_id
    and supporter_group.lifecycle <> 'archived';

  update public.venues as venue
  set archived_at = captured_erased_at, archived_by = current_actor_id
  where venue.owner_id = current_actor_id
    and venue.archived_at is null;

  update public.group_memberships as membership
  set
    role = case
      when membership.role <> 'owner'
        and membership.status in ('pending', 'active') then 'member'
      else membership.role
    end,
    status = case
      when membership.role <> 'owner'
        and membership.status in ('pending', 'active') then 'left'
      else membership.status
    end,
    application_message = null
  where membership.user_id = current_actor_id
    and (
      membership.application_message is not null
      or (
        membership.role <> 'owner'
        and membership.status in ('pending', 'active')
      )
    );

  update public.venue_memberships as membership
  set status = 'revoked', revoked_at = captured_erased_at
  where membership.user_id = current_actor_id
    and membership.role <> 'owner'
    and membership.status = 'active';

  delete from public.subscriptions as subscription
  where subscription.user_id = current_actor_id;
  delete from public.venue_follows as follow
  where follow.user_id = current_actor_id;
  delete from public.friendships as friendship
  where friendship.user_low_id = current_actor_id
    or friendship.user_high_id = current_actor_id;
  delete from public.user_blocks as user_block
  where user_block.blocker_id = current_actor_id
    or user_block.blocked_id = current_actor_id;
  delete from public.platform_roles as platform_role
  where platform_role.profile_id = current_actor_id;
  delete from private.location_search_rate_limits as rate_limit
  where rate_limit.actor_id = current_actor_id;
  delete from private.assisted_discovery_actor_rate_limits as rate_limit
  where rate_limit.actor_id = current_actor_id;

  -- The tombstone is visible to the two exact-location guards before deletion.
  update public.profiles as profile
  set
    handle = null,
    display_name = 'Deleted account',
    bio = null,
    adult_attested_at = null,
    rules_version = null,
    rules_accepted_at = null,
    profile_completed_at = null,
    fan_enabled_at = null,
    deleted_at = coalesce(profile.deleted_at, captured_erased_at)
  where profile.id = current_actor_id;

  delete from public.event_private_locations as location
  using public.events as event
  where location.event_id = event.id
    and event.host_user_id = current_actor_id;
  delete from public.event_drafts as draft
  where draft.owner_id = current_actor_id;

  if first_transition then
    perform private.write_security_audit(
      current_actor_id,
      'account.erase.prepare',
      'profile',
      current_actor_id,
      'succeeded',
      audit_request_id,
      pg_catalog.jsonb_build_object('future_events_cancelled', cancelled_count)
    );
  end if;

  update private.venue_billing_entitlements e set status='expired',
    interval=null,interval_count=null,polar_customer_id=null,polar_subscription_id=null,polar_product_id=null,
    polar_product_price_id=null,amount=null,currency=null,paid_through_at=null,grace_started_at=null,grace_expires_at=null,
    subscription_modified_at=null,last_paid_order_id=null,last_paid_order_at=null,last_webhook_id=null
  from public.venues v where v.id=e.venue_id and v.owner_id=current_actor_id;
  update private.venue_billing_checkout_attempts a set
    state=case when a.state in ('reserved','uncertain','attached') then 'expired' else a.state end,
    closed_at=coalesce(a.closed_at,captured_erased_at),erased_at=coalesce(a.erased_at,captured_erased_at),
    polar_checkout_id=null,checkout_expires_at=null,polar_organization_id=null,polar_product_id=null,
    polar_product_price_id=null,amount=null,currency=null,interval_count=null,external_customer_id=null,
    completed_subscription_id=null,activation_authorized=false
  where a.owner_id=current_actor_id;
  update private.polar_webhook_events w set polar_subscription_id=null,polar_order_id=null,organization_id=null,checkout_id=null,
    customer_id=null,external_customer_id=null,product_id=null,price_id=null,amount_minor=null,currency=null,billing_interval=null,
    interval_count=null,provider_status=null,cancel_at_period_end=null,current_period_end=null,past_due_at=null,signed_period_end=null,paid_order_modified_at=null
  from public.venues v where v.id=w.venue_id and v.owner_id=current_actor_id;
  if cleanup_required then
    insert into private.polar_account_erasure_cleanup(actor_id) values(current_actor_id)
    on conflict(actor_id) do update set completed_at=null,outcome='erasure_cleanup_required';
  end if;
  return cleanup_required;
end;
$function$;
revoke all on function private.prepare_account_erasure_core(text,uuid) from public,anon,authenticated,service_role;

create function public.prepare_account_erasure_v2(input_confirmation text,audit_request_id uuid default null)
returns table(prepared boolean,polar_cleanup_required boolean)
language plpgsql security definer set search_path='' as $function$
begin
  return query select true,private.prepare_account_erasure_core(input_confirmation,audit_request_id);
end;
$function$;
revoke all on function public.prepare_account_erasure_v2(text,uuid) from public,anon,authenticated,service_role;
grant execute on function public.prepare_account_erasure_v2(text,uuid) to authenticated;
comment on function public.prepare_account_erasure_v2(text,uuid) is 'Prepares product erasure and returns only the retryable external-cleanup obligation; no provider identifier is exposed.';

create or replace function private.discover_event_page(
  input_mode text,
  input_lat double precision,
  input_lng double precision,
  input_radius_km integer,
  input_from timestamptz,
  input_to timestamptz,
  input_team_id uuid,
  input_competition_id uuid,
  input_match_id uuid,
  input_after_interest_score integer,
  input_after_distance_band integer,
  input_after_starts_at timestamptz,
  input_after_event_id uuid,
  input_limit integer
)
returns table (
  event_id uuid,
  title text,
  host_kind text,
  host_display_name text,
  host_venue_slug text,
  venue_verification_status text,
  match_id uuid,
  competition_name text,
  home_team_name text,
  away_team_name text,
  starts_at timestamptz,
  ends_at timestamptz,
  place_kind text,
  location_summary text,
  audience text,
  audience_group_name text,
  audience_team_name text,
  capacity integer,
  approved_attendee_count bigint,
  remaining_capacity integer,
  requires_approval boolean,
  interest_score integer,
  cursor_distance_band integer,
  has_more boolean
)
language plpgsql
security definer
stable
set search_path = ''
as $function$
#variable_conflict use_variable
declare
  actor_id uuid := auth.uid();
  origin extensions.geography(Point, 4326);
  bounded_limit integer;
begin
  if input_mode not in ('reservations', 'open_door', 'owned')
    or input_lat is null or input_lng is null
    or input_lat not between -90 and 90 or input_lng not between -180 and 180
    or input_radius_km is null or input_radius_km not in (5, 15, 30, 50)
    or not private.discovery_window_is_valid(input_from, input_to)
    or input_limit is null or input_limit not between 1 and 50
    or num_nonnulls(
      input_after_interest_score, input_after_distance_band,
      input_after_starts_at, input_after_event_id
    ) not in (0, 4)
    or (
      input_after_interest_score is not null
      and input_after_interest_score not between 0 and 15
    )
    or (
      input_after_distance_band is not null
      and input_after_distance_band not between 0 and 4
    )
    or (
      input_after_starts_at is not null
      and (input_after_starts_at < input_from or input_after_starts_at >= input_to)
    ) then
    raise exception using errcode = 'P0001', message = 'VALIDATION_FAILED';
  end if;
  bounded_limit := input_limit;
  origin := extensions.st_setsrid(
    extensions.st_makepoint(input_lng, input_lat), 4326
  )::extensions.geography;

  return query
  with spatial_candidates as (
    select
      public_event.id as event_id,
      round(extensions.st_distance(origin, public_event.public_location))::bigint
        as distance_meters
    from public.events as public_event
    where public_event.place_kind = 'public_place'
      and public_event.public_location is not null
      and extensions.st_dwithin(
        public_event.public_location, origin, input_radius_km * 1000.0
      )

    union all

    select
      venue_event.id,
      round(extensions.st_distance(origin, nearby_venue.location))::bigint
    from public.venues as nearby_venue
    join public.events as venue_event on venue_event.host_venue_id = nearby_venue.id
    where venue_event.place_kind = 'venue'
      and nearby_venue.archived_at is null
      and extensions.st_dwithin(
        nearby_venue.location, origin, input_radius_km * 1000.0
      )

    union all

    select
      private_location.event_id,
      round(extensions.st_distance(origin, private_location.location))::bigint
    from public.event_private_locations as private_location
    join public.events as home_event on home_event.id = private_location.event_id
    where home_event.place_kind = 'home'
      and extensions.st_dwithin(
        private_location.location, origin, input_radius_km * 1000.0
      )
  ),
  ranked_events as (
    select
      event.id as event_id,
      event.title,
      case when event.host_user_id is not null then 'person' else 'venue' end as host_kind,
      coalesce(host_profile.display_name, host_venue.name) as host_display_name,
      host_venue.slug as host_venue_slug,
      host_venue.verification_status::text as venue_verification_status,
      event.match_id,
      competition.name as competition_name,
      home_team.name as home_team_name,
      away_team.name as away_team_name,
      event.starts_at,
      event.ends_at,
      event.place_kind::text as place_kind,
      case
        when event.place_kind = 'home' and distance.distance_meters < 5000 then 'Within 5 km'
        when event.place_kind = 'home' and distance.distance_meters < 15000 then '5–15 km away'
        when event.place_kind = 'home' and distance.distance_meters < 50000 then '15–50 km away'
        when event.place_kind = 'home' then '50+ km away'
        when distance.distance_meters < 1000 then 'Within 1 km'
        when distance.distance_meters < 5000 then '1–5 km away'
        when distance.distance_meters < 15000 then '5–15 km away'
        when distance.distance_meters < 50000 then '15–50 km away'
        else '50+ km away'
      end as location_summary,
      event.audience::text as audience,
      audience_group.name as audience_group_name,
      audience_team.name as audience_team_name,
      event.capacity,
      attendance_counts.approved_count as approved_attendee_count,
      case when event.capacity is null then null
        else greatest(event.capacity - attendance_counts.approved_count::integer, 0) end
        as remaining_capacity,
      event.requires_approval,
      case when actor_id is null then 0 else
        case when exists (
          select 1 from public.subscriptions as subscription
          where subscription.user_id = actor_id and subscription.kind = 'team'
            and subscription.team_id in (
              match.home_team_id, match.away_team_id, event.audience_team_id
            )
        ) then 8 else 0 end
        + case when exists (
          select 1 from public.subscriptions as subscription
          where subscription.user_id = actor_id and subscription.kind = 'competition'
            and subscription.competition_id = match.competition_id
        ) then 4 else 0 end
        + case when exists (
          select 1 from public.subscriptions as subscription
          where subscription.user_id = actor_id and subscription.kind = 'sport'
            and subscription.sport_id = competition.sport_id
        ) then 2 else 0 end
        + case when exists (
          select 1 from public.venue_follows as venue_follow
          where venue_follow.user_id = actor_id
            and venue_follow.venue_id = event.host_venue_id
        ) then 1 else 0 end
      end as interest_score,
      case
        when event.place_kind = 'home' and distance.distance_meters < 5000 then 0
        when event.place_kind = 'home' and distance.distance_meters < 15000 then 1
        when event.place_kind = 'home' and distance.distance_meters < 50000 then 2
        when event.place_kind = 'home' then 3
        when distance.distance_meters < 1000 then 0
        when distance.distance_meters < 5000 then 1
        when distance.distance_meters < 15000 then 2
        when distance.distance_meters < 50000 then 3
        else 4
      end as distance_band
    from public.events as event
    join public.matches as match on match.id = event.match_id
    join public.competitions as competition on competition.id = match.competition_id
    join public.teams as home_team on home_team.id = match.home_team_id
    join public.teams as away_team on away_team.id = match.away_team_id
    join spatial_candidates as distance on distance.event_id = event.id
    left join public.profiles as host_profile on host_profile.id = event.host_user_id
    left join public.venues as host_venue on host_venue.id = event.host_venue_id
    left join public.groups as audience_group on audience_group.id = event.audience_group_id
    left join public.teams as audience_team on audience_team.id = event.audience_team_id
    cross join lateral (
      select count(*) as approved_count
      from public.event_attendance as attendance
      where attendance.event_id = event.id and attendance.status = 'approved'
    ) as attendance_counts
    where (event.host_venue_id is null or private.venue_allows_event_acquisition(event.id,statement_timestamp()))
      and event.status = 'published'
      and event.starts_at > statement_timestamp()
      and event.starts_at >= input_from and event.starts_at < input_to
      and event.audience <> 'invite_only'
      and (input_team_id is null or input_team_id in (match.home_team_id, match.away_team_id))
      and (input_competition_id is null or match.competition_id = input_competition_id)
      and (input_match_id is null or match.id = input_match_id)
      and (
        private.event_is_visible_to_actor(event.id, actor_id)
        or private.actor_manages_event(event.id, actor_id)
      )
      and (
        actor_id is null
        or event.created_by = actor_id
        or private.actor_manages_event(event.id, actor_id)
        or (
          not exists (
            select 1
            from public.event_attendance as existing_attendance
            where existing_attendance.event_id = event.id
              and existing_attendance.user_id = actor_id
              and existing_attendance.status <> 'left'
          )
          and not exists (
            select 1
            from public.event_invitations as existing_invitation
            where existing_invitation.event_id = event.id
              and existing_invitation.invitee_id = actor_id
              and (
                existing_invitation.status = 'pending'
                or not exists (
                  select 1
                  from public.event_attendance as left_attendance
                  where left_attendance.event_id = event.id
                    and left_attendance.user_id = actor_id
                    and left_attendance.status = 'left'
                )
              )
          )
        )
      )
      and (event.host_venue_id is not null or private.profile_is_fan_eligible(actor_id))
      and (
        (input_mode = 'reservations' and event.attendance_mode = 'reservations')
        or (input_mode = 'open_door' and event.attendance_mode = 'open_door')
        or (
          input_mode = 'owned'
          and actor_id is not null
          and exists (
            select 1 from public.venue_memberships as membership
            where membership.user_id = actor_id
              and membership.venue_id = event.host_venue_id
              and membership.status = 'active'
              and membership.revoked_at is null
          )
        )
      )
      and (
        event.capacity is null
        or attendance_counts.approved_count < event.capacity
        or private.actor_manages_event(event.id, actor_id)
      )
      and (
        host_venue.id is null
        or (
          host_venue.verification_status <> 'suspended'
          and host_venue.suspended_at is null
          and host_venue.archived_at is null
        )
      )
  ),
  cursor_page as (
    select ranked.*
    from ranked_events as ranked
    where input_after_interest_score is null
      or ranked.interest_score < input_after_interest_score
      or (
        ranked.interest_score = input_after_interest_score
        and ranked.distance_band > input_after_distance_band
      )
      or (
        ranked.interest_score = input_after_interest_score
        and ranked.distance_band = input_after_distance_band
        and ranked.starts_at > input_after_starts_at
      )
      or (
        ranked.interest_score = input_after_interest_score
        and ranked.distance_band = input_after_distance_band
        and ranked.starts_at = input_after_starts_at
        and ranked.event_id > input_after_event_id
      )
    order by ranked.interest_score desc, ranked.distance_band, ranked.starts_at, ranked.event_id
    limit bounded_limit + 1
  ),
  numbered_page as (
    select
      page.*,
      row_number() over (
        order by page.interest_score desc, page.distance_band, page.starts_at, page.event_id
      ) as row_number,
      count(*) over () > bounded_limit as has_more
    from cursor_page as page
  )
  select
    page.event_id,
    page.title,
    page.host_kind,
    page.host_display_name,
    page.host_venue_slug,
    page.venue_verification_status,
    page.match_id,
    page.competition_name,
    page.home_team_name,
    page.away_team_name,
    page.starts_at,
    page.ends_at,
    page.place_kind,
    page.location_summary,
    page.audience,
    page.audience_group_name,
    page.audience_team_name,
    page.capacity,
    page.approved_attendee_count,
    page.remaining_capacity,
    page.requires_approval,
    page.interest_score,
    page.distance_band,
    page.has_more
  from numbered_page as page
  where page.row_number <= bounded_limit
  order by page.interest_score desc, page.distance_band, page.starts_at, page.event_id;
end;
$function$;
revoke all on function private.discover_event_page(input_mode text, input_lat double precision, input_lng double precision, input_radius_km integer, input_from timestamp with time zone, input_to timestamp with time zone, input_team_id uuid, input_competition_id uuid, input_match_id uuid, input_after_interest_score integer, input_after_distance_band integer, input_after_starts_at timestamp with time zone, input_after_event_id uuid, input_limit integer) from public,anon,authenticated,service_role;
comment on function private.discover_event_page(input_mode text, input_lat double precision, input_lng double precision, input_radius_km integer, input_from timestamp with time zone, input_to timestamp with time zone, input_team_id uuid, input_competition_id uuid, input_match_id uuid, input_after_interest_score integer, input_after_distance_band integer, input_after_starts_at timestamp with time zone, input_after_event_id uuid, input_limit integer) is 'VB01 entitlement enforcement; retains the existing authorization and DTO contract.';

create or replace function private.search_assisted_events_core(
  input_from_date date,
  input_to_date date,
  input_team_ids uuid[],
  input_competition_id uuid,
  input_relationship text,
  input_host_kind text,
  input_facilities text[],
  input_lat double precision,
  input_lng double precision
)
returns table (
  event_id uuid,
  title text,
  host_kind text,
  host_display_name text,
  host_venue_slug text,
  venue_verification_status text,
  match_id uuid,
  competition_name text,
  home_team_name text,
  away_team_name text,
  starts_at timestamptz,
  ends_at timestamptz,
  place_kind text,
  location_summary text,
  audience text,
  capacity integer,
  approved_attendee_count bigint,
  remaining_capacity integer,
  requires_approval boolean,
  attendance_mode text,
  viewer_participation_state text,
  venue_facilities text[],
  interest_score integer,
  distance_band integer,
  matched_friend_host boolean,
  matched_my_group boolean
)
language plpgsql
security definer
stable
set search_path = ''
as $function$
#variable_conflict use_variable
declare
  actor_id uuid := private.assert_fan_actor();
  parsed_facilities public.venue_facility[];
  origin extensions.geography(Point, 4326);
  from_instant timestamptz;
  until_instant timestamptz;
begin
  begin
    select coalesce(
      array_agg(item.facility::public.venue_facility order by item.ordinal),
      '{}'::public.venue_facility[]
    )
    into parsed_facilities
    from unnest(coalesce(input_facilities, '{}'::text[]))
      with ordinality as item(facility, ordinal);
  exception when invalid_text_representation then
    raise exception using errcode = 'P0001', message = 'VALIDATION_FAILED';
  end;

  if input_from_date is null
    or input_to_date is null
    or input_from_date < (statement_timestamp() at time zone 'Asia/Jerusalem')::date
    or input_to_date < input_from_date
    or input_to_date - input_from_date > 30
    or cardinality(coalesce(input_team_ids, '{}'::uuid[])) > 2
    or array_position(coalesce(input_team_ids, '{}'::uuid[]), null) is not null
    or (
      select count(*) <> count(distinct team_id)
      from unnest(coalesce(input_team_ids, '{}'::uuid[])) as team(team_id)
    )
    or (
      select count(*) <> cardinality(coalesce(input_team_ids, '{}'::uuid[]))
      from public.teams as team
      where team.id = any(coalesce(input_team_ids, '{}'::uuid[]))
        and team.active
    )
    or (
      input_competition_id is not null
      and not exists (
        select 1 from public.competitions as competition
        where competition.id = input_competition_id and competition.active
      )
    )
    or input_relationship is null
    or input_relationship not in ('any', 'friend_host', 'my_groups')
    or input_host_kind is null
    or input_host_kind not in ('any', 'venue', 'person')
    or cardinality(parsed_facilities) > 7
    or not private.venue_facilities_are_unique(parsed_facilities)
    or (input_lat is null) <> (input_lng is null)
    or (input_lat is not null and input_lat not between -90 and 90)
    or (input_lng is not null and input_lng not between -180 and 180)
    or (input_relationship = 'any' and input_lat is null) then
    raise exception using errcode = 'P0001', message = 'VALIDATION_FAILED';
  end if;

  from_instant := input_from_date::timestamp at time zone 'Asia/Jerusalem';
  until_instant := (input_to_date + 1)::timestamp at time zone 'Asia/Jerusalem';
  if input_lat is not null then
    origin := extensions.st_setsrid(
      extensions.st_makepoint(input_lng, input_lat), 4326
    )::extensions.geography;
  end if;

  return query
  with event_facts as (
    select
      event.id as event_id,
      event.title,
      case when event.host_user_id is not null then 'person' else 'venue' end as host_kind,
      coalesce(host_profile.display_name, host_venue.name) as host_display_name,
      host_venue.slug as host_venue_slug,
      host_venue.verification_status::text as venue_verification_status,
      event.match_id,
      competition.name as competition_name,
      home_team.name as home_team_name,
      away_team.name as away_team_name,
      event.starts_at,
      event.ends_at,
      event.place_kind::text as place_kind,
      event.public_place_name,
      event.audience::text as audience,
      event.capacity,
      event.requires_approval,
      event.attendance_mode::text as attendance_mode,
      host_venue.facilities::text[] as venue_facilities,
      match.home_team_id,
      match.away_team_id,
      match.competition_id,
      competition.sport_id,
      event.host_user_id,
      event.host_venue_id,
      event.organizing_group_id,
      event.audience_group_id,
      attendance_counts.approved_count,
      viewer_facts.viewer_attendance_status,
      viewer_facts.viewer_invitation_status,
      viewer_facts.viewer_manages_event,
      viewer_facts.viewer_involved,
      private.actor_is_accepted_friend(event.host_user_id, actor_id) as is_friend_host,
      exists (
        select 1
        from public.groups as related_group
        where related_group.id in (event.organizing_group_id, event.audience_group_id)
          and related_group.lifecycle = 'active'
          and related_group.suspended_at is null
          and private.actor_is_active_group_member(related_group.id, actor_id)
      ) as is_my_group,
      case
        when origin is null then null
        when event.place_kind = 'venue' then
          round(extensions.st_distance(origin, host_venue.location))::bigint
        when event.place_kind = 'public_place' then
          round(extensions.st_distance(origin, event.public_location))::bigint
        when event.place_kind = 'home' then (
          select round(extensions.st_distance(origin, private_location.location))::bigint
          from public.event_private_locations as private_location
          where private_location.event_id = event.id
        )
      end as distance_meters,
      case
        when exists (
          select 1 from public.subscriptions as subscription
          where subscription.user_id = actor_id
            and subscription.kind = 'team'
            and subscription.team_id in (
              match.home_team_id, match.away_team_id, event.audience_team_id
            )
        ) then 8 else 0 end
        + case when exists (
          select 1 from public.subscriptions as subscription
          where subscription.user_id = actor_id
            and subscription.kind = 'competition'
            and subscription.competition_id = match.competition_id
        ) then 4 else 0 end
        + case when exists (
          select 1 from public.subscriptions as subscription
          where subscription.user_id = actor_id
            and subscription.kind = 'sport'
            and subscription.sport_id = competition.sport_id
        ) then 2 else 0 end
        + case when exists (
          select 1 from public.venue_follows as venue_follow
          where venue_follow.user_id = actor_id
            and venue_follow.venue_id = event.host_venue_id
        ) then 1 else 0 end
      as interest_score
    from public.events as event
    join public.matches as match on match.id = event.match_id
    join public.competitions as competition on competition.id = match.competition_id
    join public.teams as home_team on home_team.id = match.home_team_id
    join public.teams as away_team on away_team.id = match.away_team_id
    left join public.profiles as host_profile on host_profile.id = event.host_user_id
    left join public.venues as host_venue on host_venue.id = event.host_venue_id
    cross join lateral (
      select count(*) as approved_count
      from public.event_attendance as attendance
      where attendance.event_id = event.id and attendance.status = 'approved'
    ) as attendance_counts
    cross join lateral (
      select
        (
          select attendance.status::text
          from public.event_attendance as attendance
          where attendance.event_id = event.id and attendance.user_id = actor_id
        ) as viewer_attendance_status,
        (
          select invitation.status::text
          from public.event_invitations as invitation
          where invitation.event_id = event.id and invitation.invitee_id = actor_id
        ) as viewer_invitation_status,
        private.actor_manages_event(event.id, actor_id) as viewer_manages_event,
        (
          private.actor_manages_event(event.id, actor_id)
          or exists (
            select 1 from public.event_attendance as attendance
            where attendance.event_id = event.id
              and attendance.user_id = actor_id
              and attendance.status in ('requested', 'approved')
          )
          or exists (
            select 1 from public.event_invitations as invitation
            where invitation.event_id = event.id
              and invitation.invitee_id = actor_id
              and invitation.status = 'pending'
          )
        ) as viewer_involved
    ) as viewer_facts
    where (event.host_venue_id is null or private.venue_allows_event_acquisition(event.id,statement_timestamp()))
      and event.status = 'published'
      and event.starts_at > statement_timestamp()
      and event.starts_at >= from_instant
      and event.starts_at < until_instant
      and private.event_is_visible_to_actor(event.id, actor_id)
      and (
        cardinality(coalesce(input_team_ids, '{}'::uuid[])) = 0
        or (
          cardinality(input_team_ids) = 1
          and input_team_ids[1] in (match.home_team_id, match.away_team_id)
        )
        or (
          cardinality(input_team_ids) = 2
          and match.home_team_id = any(input_team_ids)
          and match.away_team_id = any(input_team_ids)
        )
      )
      and (input_competition_id is null or match.competition_id = input_competition_id)
      and (
        input_host_kind = 'any'
        or (input_host_kind = 'person' and event.host_user_id is not null)
        or (input_host_kind = 'venue' and event.host_venue_id is not null)
      )
      and (
        cardinality(parsed_facilities) = 0
        or host_venue.facilities @> parsed_facilities
      )
      and (
        host_venue.id is null
        or (
          host_venue.verification_status <> 'suspended'
          and host_venue.suspended_at is null
          and host_venue.archived_at is null
        )
      )
      and (host_profile.id is null or host_profile.suspended_at is null)
  ),
  hard_filtered as (
    select facts.*
    from event_facts as facts
    where (origin is null or facts.distance_meters <= 15000)
      and (
        (input_relationship = 'friend_host' and facts.is_friend_host)
        or (input_relationship = 'my_groups' and facts.is_my_group)
        or (
          input_relationship = 'any'
          and facts.audience <> 'invite_only'
          and (
            facts.viewer_manages_event
            or not exists (
              select 1 from public.event_attendance as existing_attendance
              where existing_attendance.event_id = facts.event_id
                and existing_attendance.user_id = actor_id
                and existing_attendance.status <> 'left'
            )
          )
          and (
            facts.viewer_manages_event
            or not exists (
              select 1 from public.event_invitations as existing_invitation
              where existing_invitation.event_id = facts.event_id
                and existing_invitation.invitee_id = actor_id
                and (
                  existing_invitation.status = 'pending'
                  or not exists (
                    select 1
                    from public.event_attendance as left_attendance
                    where left_attendance.event_id = facts.event_id
                      and left_attendance.user_id = actor_id
                      and left_attendance.status = 'left'
                  )
                )
            )
          )
        )
      )
      and (
        facts.capacity is null
        or facts.approved_count < facts.capacity
        or (
          input_relationship in ('friend_host', 'my_groups')
          and facts.viewer_involved
        )
        or (
          input_relationship = 'any'
          and facts.viewer_manages_event
        )
      )
  ),
  ranked as (
    select
      facts.*,
      case
        when facts.distance_meters is null then 4
        when facts.place_kind = 'home' and facts.distance_meters < 5000 then 0
        when facts.place_kind = 'home' and facts.distance_meters < 15000 then 1
        when facts.place_kind = 'home' then 2
        when facts.distance_meters < 1000 then 0
        when facts.distance_meters < 5000 then 1
        when facts.distance_meters < 15000 then 2
        else 3
      end as ranked_distance_band
    from hard_filtered as facts
  )
  select
    ranked.event_id,
    ranked.title,
    ranked.host_kind,
    ranked.host_display_name,
    ranked.host_venue_slug,
    ranked.venue_verification_status,
    ranked.match_id,
    ranked.competition_name,
    ranked.home_team_name,
    ranked.away_team_name,
    ranked.starts_at,
    ranked.ends_at,
    ranked.place_kind,
    case
      when ranked.distance_meters is null and ranked.place_kind = 'home' then 'Private home'
      when ranked.distance_meters is null and ranked.place_kind = 'venue' then ranked.host_display_name
      when ranked.distance_meters is null then ranked.public_place_name
      when ranked.place_kind = 'home' and ranked.distance_meters < 5000 then 'Within 5 km'
      when ranked.place_kind = 'home' and ranked.distance_meters < 15000 then '5–15 km away'
      when ranked.place_kind = 'home' then '15+ km away'
      when ranked.distance_meters < 1000 then 'Within 1 km'
      when ranked.distance_meters < 5000 then '1–5 km away'
      when ranked.distance_meters < 15000 then '5–15 km away'
      else '15+ km away'
    end as location_summary,
    ranked.audience,
    ranked.capacity,
    ranked.approved_count,
    case
      when ranked.capacity is null then null
      else greatest(ranked.capacity - ranked.approved_count::integer, 0)
    end as remaining_capacity,
    ranked.requires_approval,
    ranked.attendance_mode,
    case
      when ranked.viewer_manages_event then 'host'
      when ranked.viewer_attendance_status is not null then ranked.viewer_attendance_status
      when ranked.viewer_invitation_status in ('pending', 'accepted') then 'invited'
      else null
    end as viewer_participation_state,
    coalesce(ranked.venue_facilities, '{}'::text[]),
    ranked.interest_score,
    ranked.ranked_distance_band,
    ranked.is_friend_host,
    ranked.is_my_group
  from ranked
  order by
    ranked.interest_score desc,
    ranked.ranked_distance_band,
    ranked.starts_at,
    ranked.event_id
  limit 3;
end;
$function$;
revoke all on function private.search_assisted_events_core(input_from_date date, input_to_date date, input_team_ids uuid[], input_competition_id uuid, input_relationship text, input_host_kind text, input_facilities text[], input_lat double precision, input_lng double precision) from public,anon,authenticated,service_role;
comment on function private.search_assisted_events_core(input_from_date date, input_to_date date, input_team_ids uuid[], input_competition_id uuid, input_relationship text, input_host_kind text, input_facilities text[], input_lat double precision, input_lng double precision) is 'VB01 entitlement enforcement; retains the existing authorization and DTO contract.';

create or replace function public.discover_events(
  input_lat double precision,
  input_lng double precision,
  input_radius_km integer,
  input_from timestamptz,
  input_to timestamptz,
  input_team_id uuid default null,
  input_competition_id uuid default null,
  input_match_id uuid default null,
  input_after_interest_score integer default null,
  input_after_distance_band integer default null,
  input_after_starts_at timestamptz default null,
  input_after_event_id uuid default null,
  input_limit integer default 20
)
returns table (
  event_id uuid, title text, host_kind text, host_display_name text,
  host_venue_slug text, venue_verification_status text, match_id uuid,
  competition_name text, home_team_name text, away_team_name text,
  starts_at timestamptz, ends_at timestamptz, place_kind text,
  location_summary text, audience text, audience_group_name text,
  audience_team_name text, capacity integer, approved_attendee_count bigint,
  remaining_capacity integer, requires_approval boolean, interest_score integer,
  cursor_distance_band integer, has_more boolean
)
language sql security definer stable set search_path = ''
as $function$
  select * from private.discover_event_page(
    'reservations', input_lat, input_lng, input_radius_km, input_from, input_to,
    input_team_id, input_competition_id, input_match_id, input_after_interest_score,
    input_after_distance_band, input_after_starts_at, input_after_event_id, input_limit
  );
$function$;
revoke all on function public.discover_events(input_lat double precision, input_lng double precision, input_radius_km integer, input_from timestamp with time zone, input_to timestamp with time zone, input_team_id uuid, input_competition_id uuid, input_match_id uuid, input_after_interest_score integer, input_after_distance_band integer, input_after_starts_at timestamp with time zone, input_after_event_id uuid, input_limit integer) from public,anon,authenticated,service_role;
grant execute on function public.discover_events(input_lat double precision, input_lng double precision, input_radius_km integer, input_from timestamp with time zone, input_to timestamp with time zone, input_team_id uuid, input_competition_id uuid, input_match_id uuid, input_after_interest_score integer, input_after_distance_band integer, input_after_starts_at timestamp with time zone, input_after_event_id uuid, input_limit integer) to anon;
grant execute on function public.discover_events(input_lat double precision, input_lng double precision, input_radius_km integer, input_from timestamp with time zone, input_to timestamp with time zone, input_team_id uuid, input_competition_id uuid, input_match_id uuid, input_after_interest_score integer, input_after_distance_band integer, input_after_starts_at timestamp with time zone, input_after_event_id uuid, input_limit integer) to authenticated;
comment on function public.discover_events(input_lat double precision, input_lng double precision, input_radius_km integer, input_from timestamp with time zone, input_to timestamp with time zone, input_team_id uuid, input_competition_id uuid, input_match_id uuid, input_after_interest_score integer, input_after_distance_band integer, input_after_starts_at timestamp with time zone, input_after_event_id uuid, input_limit integer) is 'VB01 entitlement enforcement; retains the existing authorization and DTO contract.';

create or replace function public.discover_open_door_events(
  input_lat double precision,
  input_lng double precision,
  input_radius_km integer,
  input_from timestamptz,
  input_to timestamptz,
  input_team_id uuid default null,
  input_competition_id uuid default null,
  input_match_id uuid default null,
  input_after_interest_score integer default null,
  input_after_distance_band integer default null,
  input_after_starts_at timestamptz default null,
  input_after_event_id uuid default null,
  input_limit integer default 20
)
returns table (
  event_id uuid, title text, host_kind text, host_display_name text,
  host_venue_slug text, venue_verification_status text, match_id uuid,
  competition_name text, home_team_name text, away_team_name text,
  starts_at timestamptz, ends_at timestamptz, place_kind text,
  location_summary text, audience text, audience_group_name text,
  audience_team_name text, capacity integer, approved_attendee_count bigint,
  remaining_capacity integer, requires_approval boolean, interest_score integer,
  cursor_distance_band integer, has_more boolean
)
language sql security definer stable set search_path = ''
as $function$
  select * from private.discover_event_page(
    'open_door', input_lat, input_lng, input_radius_km, input_from, input_to,
    input_team_id, input_competition_id, input_match_id, input_after_interest_score,
    input_after_distance_band, input_after_starts_at, input_after_event_id, input_limit
  );
$function$;
revoke all on function public.discover_open_door_events(input_lat double precision, input_lng double precision, input_radius_km integer, input_from timestamp with time zone, input_to timestamp with time zone, input_team_id uuid, input_competition_id uuid, input_match_id uuid, input_after_interest_score integer, input_after_distance_band integer, input_after_starts_at timestamp with time zone, input_after_event_id uuid, input_limit integer) from public,anon,authenticated,service_role;
grant execute on function public.discover_open_door_events(input_lat double precision, input_lng double precision, input_radius_km integer, input_from timestamp with time zone, input_to timestamp with time zone, input_team_id uuid, input_competition_id uuid, input_match_id uuid, input_after_interest_score integer, input_after_distance_band integer, input_after_starts_at timestamp with time zone, input_after_event_id uuid, input_limit integer) to anon;
grant execute on function public.discover_open_door_events(input_lat double precision, input_lng double precision, input_radius_km integer, input_from timestamp with time zone, input_to timestamp with time zone, input_team_id uuid, input_competition_id uuid, input_match_id uuid, input_after_interest_score integer, input_after_distance_band integer, input_after_starts_at timestamp with time zone, input_after_event_id uuid, input_limit integer) to authenticated;
comment on function public.discover_open_door_events(input_lat double precision, input_lng double precision, input_radius_km integer, input_from timestamp with time zone, input_to timestamp with time zone, input_team_id uuid, input_competition_id uuid, input_match_id uuid, input_after_interest_score integer, input_after_distance_band integer, input_after_starts_at timestamp with time zone, input_after_event_id uuid, input_limit integer) is 'VB01 entitlement enforcement; retains the existing authorization and DTO contract.';

create or replace function public.discover_owned_venue_events(
  input_lat double precision,
  input_lng double precision,
  input_radius_km integer,
  input_from timestamptz,
  input_to timestamptz,
  input_team_id uuid default null,
  input_competition_id uuid default null,
  input_match_id uuid default null,
  input_after_interest_score integer default null,
  input_after_distance_band integer default null,
  input_after_starts_at timestamptz default null,
  input_after_event_id uuid default null,
  input_limit integer default 20
)
returns table (
  event_id uuid, title text, host_kind text, host_display_name text,
  host_venue_slug text, venue_verification_status text, match_id uuid,
  competition_name text, home_team_name text, away_team_name text,
  starts_at timestamptz, ends_at timestamptz, place_kind text,
  location_summary text, audience text, audience_group_name text,
  audience_team_name text, capacity integer, approved_attendee_count bigint,
  remaining_capacity integer, requires_approval boolean, interest_score integer,
  cursor_distance_band integer, has_more boolean
)
language sql security definer stable set search_path = ''
as $function$
  select * from private.discover_event_page(
    'owned', input_lat, input_lng, input_radius_km, input_from, input_to,
    input_team_id, input_competition_id, input_match_id, input_after_interest_score,
    input_after_distance_band, input_after_starts_at, input_after_event_id, input_limit
  );
$function$;
revoke all on function public.discover_owned_venue_events(input_lat double precision, input_lng double precision, input_radius_km integer, input_from timestamp with time zone, input_to timestamp with time zone, input_team_id uuid, input_competition_id uuid, input_match_id uuid, input_after_interest_score integer, input_after_distance_band integer, input_after_starts_at timestamp with time zone, input_after_event_id uuid, input_limit integer) from public,anon,authenticated,service_role;
grant execute on function public.discover_owned_venue_events(input_lat double precision, input_lng double precision, input_radius_km integer, input_from timestamp with time zone, input_to timestamp with time zone, input_team_id uuid, input_competition_id uuid, input_match_id uuid, input_after_interest_score integer, input_after_distance_band integer, input_after_starts_at timestamp with time zone, input_after_event_id uuid, input_limit integer) to authenticated;
comment on function public.discover_owned_venue_events(input_lat double precision, input_lng double precision, input_radius_km integer, input_from timestamp with time zone, input_to timestamp with time zone, input_team_id uuid, input_competition_id uuid, input_match_id uuid, input_after_interest_score integer, input_after_distance_band integer, input_after_starts_at timestamp with time zone, input_after_event_id uuid, input_limit integer) is 'VB01 entitlement enforcement; retains the existing authorization and DTO contract.';

create or replace function public.update_venue_workspace(
  input_venue_id uuid,
  input_name text,
  input_slug text,
  input_address_text text,
  input_longitude numeric,
  input_latitude numeric,
  input_description text,
  input_facilities text[],
  input_house_information text,
  input_default_requires_approval boolean,
  audit_request_id uuid default null
)
returns table (venue_id uuid, slug text, verification_status text)
language sql
security definer
set search_path = ''
as $function$
  select updated.venue_id, updated.slug, updated.verification_status
  from public.update_venue_workspace_v2(
    input_venue_id,
    input_name,
    input_slug,
    input_address_text,
    input_longitude,
    input_latitude,
    input_description,
    input_facilities,
    input_house_information,
    'reservations',
    input_default_requires_approval,
    audit_request_id
  ) as updated;
$function$;
revoke all on function public.update_venue_workspace(input_venue_id uuid, input_name text, input_slug text, input_address_text text, input_longitude numeric, input_latitude numeric, input_description text, input_facilities text[], input_house_information text, input_default_requires_approval boolean, audit_request_id uuid) from public,anon,authenticated,service_role;
grant execute on function public.update_venue_workspace(input_venue_id uuid, input_name text, input_slug text, input_address_text text, input_longitude numeric, input_latitude numeric, input_description text, input_facilities text[], input_house_information text, input_default_requires_approval boolean, audit_request_id uuid) to authenticated;
comment on function public.update_venue_workspace(input_venue_id uuid, input_name text, input_slug text, input_address_text text, input_longitude numeric, input_latitude numeric, input_description text, input_facilities text[], input_house_information text, input_default_requires_approval boolean, audit_request_id uuid) is 'VB01 entitlement enforcement; retains the existing authorization and DTO contract.';

create or replace function public.get_public_event_map_points(input_event_ids uuid[])
returns table (
  event_id uuid,
  place_name text,
  latitude double precision,
  longitude double precision
)
language plpgsql
security definer
stable
set search_path = ''
as $function$
begin
  if input_event_ids is null or cardinality(input_event_ids) > 50 then
    raise exception using errcode = 'P0001', message = 'VALIDATION_FAILED';
  end if;

  return query
  select
    event.id,
    case
      when event.place_kind = 'venue' then host_venue.name
      else event.public_place_name
    end,
    extensions.st_y(
      case
        when event.place_kind = 'venue' then host_venue.location::extensions.geometry
        else event.public_location::extensions.geometry
      end
    )::double precision as latitude,
    extensions.st_x(
      case
        when event.place_kind = 'venue' then host_venue.location::extensions.geometry
        else event.public_location::extensions.geometry
      end
    )::double precision as longitude
  from public.events as event
  left join public.venues as host_venue
    on host_venue.id = event.venue_id
  where event.id = any(input_event_ids)
    and (event.host_venue_id is null or private.venue_allows_event_acquisition(event.id,statement_timestamp()))
    and event.status = 'published'
    and event.starts_at > statement_timestamp()
    and event.place_kind in ('venue', 'public_place')
    and event.audience <> 'invite_only'
    and (
      (event.place_kind = 'venue' and host_venue.location is not null)
      or (event.place_kind = 'public_place' and event.public_location is not null)
    )
    and private.event_is_visible_to_actor(event.id, auth.uid())
  order by array_position(input_event_ids, event.id);
end;
$function$;
revoke all on function public.get_public_event_map_points(input_event_ids uuid[]) from public,anon,authenticated,service_role;
grant execute on function public.get_public_event_map_points(input_event_ids uuid[]) to anon;
grant execute on function public.get_public_event_map_points(input_event_ids uuid[]) to authenticated;
comment on function public.get_public_event_map_points(input_event_ids uuid[]) is 'VB01 entitlement enforcement; retains the existing authorization and DTO contract.';

create or replace function public.list_match_events(
  input_match_id uuid,
  input_limit integer default 20
)
returns table (
  event_id uuid,
  title text,
  home_team_name text,
  away_team_name text,
  competition_name text,
  starts_at timestamptz,
  audience text,
  audience_team_name text,
  capacity integer,
  approved_attendee_count bigint,
  requires_approval boolean
)
language plpgsql
security definer
stable
set search_path = ''
as $function$
#variable_conflict use_variable
declare
  actor_id uuid := auth.uid();
  bounded_limit integer;
begin
  if input_match_id is null or input_limit is null or input_limit not between 1 and 50 then
    raise exception using errcode = 'P0001', message = 'VALIDATION_FAILED';
  end if;
  bounded_limit := input_limit;

  return query
  select
    event.id,
    event.title,
    home_team.name,
    away_team.name,
    competition.name,
    event.starts_at,
    event.audience::text,
    audience_team.name,
    event.capacity,
    (
      select count(*)
      from public.event_attendance as attendance
      where attendance.event_id = event.id
        and attendance.status = 'approved'
    ),
    event.requires_approval
  from public.events as event
  join public.matches as match on match.id = event.match_id
  join public.teams as home_team on home_team.id = match.home_team_id
  join public.teams as away_team on away_team.id = match.away_team_id
  join public.competitions as competition on competition.id = match.competition_id
  left join public.teams as audience_team on audience_team.id = event.audience_team_id
  where event.match_id = input_match_id
    and (event.host_venue_id is null or private.venue_allows_event_acquisition(event.id,statement_timestamp()))
    and event.status = 'published'
    and event.starts_at > statement_timestamp()
    and private.event_is_visible_to_actor(event.id, actor_id)
  order by event.starts_at, event.title, event.id
  limit bounded_limit;
end;
$function$;
revoke all on function public.list_match_events(input_match_id uuid, input_limit integer) from public,anon,authenticated,service_role;
grant execute on function public.list_match_events(input_match_id uuid, input_limit integer) to anon;
grant execute on function public.list_match_events(input_match_id uuid, input_limit integer) to authenticated;
comment on function public.list_match_events(input_match_id uuid, input_limit integer) is 'VB01 entitlement enforcement; retains the existing authorization and DTO contract.';

create or replace function public.list_venue_events(
  lookup_slug text,
  input_limit integer default 12
)
returns table (
  event_id uuid,
  title text,
  home_team_name text,
  away_team_name text,
  competition_name text,
  starts_at timestamptz,
  audience text,
  audience_team_name text,
  capacity integer,
  approved_attendee_count bigint,
  requires_approval boolean
)
language sql
security definer
stable
set search_path = ''
as $function$
  select
    event.id,
    event.title,
    home_team.name,
    away_team.name,
    competition.name,
    event.starts_at,
    event.audience::text,
    audience_team.name,
    event.capacity,
    (
      select count(*)
      from public.event_attendance as attendance
      where attendance.event_id = event.id
        and attendance.status = 'approved'
    ),
    event.requires_approval
  from public.venues as venue
  join public.events as event on event.host_venue_id = venue.id
  join public.matches as match on match.id = event.match_id
  join public.teams as home_team on home_team.id = match.home_team_id
  join public.teams as away_team on away_team.id = match.away_team_id
  join public.competitions as competition on competition.id = match.competition_id
  left join public.teams as audience_team on audience_team.id = event.audience_team_id
  where lower(venue.slug) = lower(btrim(lookup_slug))
    and venue.verification_status <> 'suspended'
    and venue.suspended_at is null
    and (event.host_venue_id is null or private.venue_allows_event_acquisition(event.id,statement_timestamp()))
    and event.status = 'published'
    and event.starts_at > statement_timestamp()
    and event.audience in ('public', 'team_followers')
    and private.event_is_visible_to_actor(event.id, auth.uid())
  order by event.starts_at, event.id
  limit least(greatest(coalesce(input_limit, 12), 1), 50);
$function$;
revoke all on function public.list_venue_events(lookup_slug text, input_limit integer) from public,anon,authenticated,service_role;
grant execute on function public.list_venue_events(lookup_slug text, input_limit integer) to anon;
grant execute on function public.list_venue_events(lookup_slug text, input_limit integer) to authenticated;
comment on function public.list_venue_events(lookup_slug text, input_limit integer) is 'VB01 entitlement enforcement; retains the existing authorization and DTO contract.';

create or replace function public.get_venue_by_slug(lookup_slug text)
returns table (
  venue_id uuid,
  slug text,
  name text,
  address_text text,
  description text,
  screen_count integer,
  stated_capacity integer,
  facilities text[],
  verification_status text,
  owner_handle text,
  follower_count bigint,
  viewer_follows boolean,
  viewer_is_owner boolean
)
language sql
stable
security definer
set search_path = ''
as $function$
  select
    venue.id,
    venue.slug,
    venue.name,
    venue.address_text,
    venue.description,
    venue.screen_count,
    venue.stated_capacity,
    venue.facilities::text[],
    venue.verification_status::text,
    owner_profile.handle,
    (select count(*) from public.venue_follows as follow where follow.venue_id = venue.id),
    exists (
      select 1 from public.venue_follows as own_follow
      where own_follow.venue_id = venue.id
        and own_follow.user_id = auth.uid()
    ),
    private.actor_manages_venue(auth.uid(), venue.id)
  from public.venues as venue
  join public.profiles as owner_profile on owner_profile.id = venue.owner_id
  where venue.slug = lower(btrim(lookup_slug))
    and venue.verification_status <> 'suspended'
    and venue.suspended_at is null
    and venue.archived_at is null
      and private.venue_allows_public_presence(venue.id,statement_timestamp());
$function$;
revoke all on function public.get_venue_by_slug(lookup_slug text) from public,anon,authenticated,service_role;
grant execute on function public.get_venue_by_slug(lookup_slug text) to anon;
grant execute on function public.get_venue_by_slug(lookup_slug text) to authenticated;
comment on function public.get_venue_by_slug(lookup_slug text) is 'VB01 entitlement enforcement; retains the existing authorization and DTO contract.';

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
      and private.venue_allows_public_presence(venue.id,statement_timestamp())
    );
$function$;
revoke all on function private.venue_follow_is_allowed(input_venue_id uuid, input_actor_id uuid) from public,anon,authenticated,service_role;
grant execute on function private.venue_follow_is_allowed(input_venue_id uuid, input_actor_id uuid) to authenticated;
comment on function private.venue_follow_is_allowed(input_venue_id uuid, input_actor_id uuid) is 'VB01 entitlement enforcement; retains the existing authorization and DTO contract.';

create or replace function public.list_my_saved_items(
  input_bucket text,
  input_limit integer default 20,
  input_offset integer default 0
)
returns table (
  item_id uuid,
  kind text,
  label text,
  detail text,
  href text,
  created_at timestamptz,
  total_count bigint
)
language plpgsql
security definer
volatile
set search_path = ''
as $function$
declare
  actor_id uuid := private.assert_fan_actor();
  bounded_limit integer;
  bounded_offset integer;
begin
  if input_bucket is null
    or input_bucket not in ('all', 'sport', 'competition', 'team', 'venue')
    or input_limit is null
    or input_limit not between 1 and 50
    or input_offset is null
    or input_offset not between 0 and 10000
    or input_offset + input_limit > 10020 then
    raise exception using errcode = 'P0001', message = 'VALIDATION_FAILED';
  end if;
  bounded_limit := input_limit;
  bounded_offset := input_offset;

  return query
  with saved as (
    select sport.id as item_id, 'sport'::text as kind, sport.name as label,
      null::text as detail, '/settings/interests'::text as href, subscription.created_at
    from public.subscriptions as subscription
    join public.sports as sport
      on subscription.kind = 'sport' and sport.id = subscription.sport_id and sport.active
    where subscription.user_id = actor_id

    union all

    select competition.id, 'competition'::text, competition.name, competition.country_name,
      '/matches?competition=' || competition.id::text, subscription.created_at
    from public.subscriptions as subscription
    join public.competitions as competition
      on subscription.kind = 'competition'
      and competition.id = subscription.competition_id
      and competition.active
    where subscription.user_id = actor_id

    union all

    select team.id, 'team'::text, team.name, team.country_name,
      '/matches?team=' || team.id::text, subscription.created_at
    from public.subscriptions as subscription
    join public.teams as team
      on subscription.kind = 'team' and team.id = subscription.team_id and team.active
    where subscription.user_id = actor_id

    union all

    select venue.id, 'venue'::text, venue.name, venue.address_text,
      '/venues/' || venue.slug, follow.created_at
    from public.venue_follows as follow
    join public.venues as venue
      on venue.id = follow.venue_id
      and venue.verification_status <> 'suspended'
      and venue.suspended_at is null
      and venue.archived_at is null
      and private.venue_allows_public_presence(venue.id,statement_timestamp())
    where follow.user_id = actor_id
  ),
  filtered as (
    select * from saved where input_bucket = 'all' or saved.kind = input_bucket
  )
  select
    filtered.item_id,
    filtered.kind,
    filtered.label,
    filtered.detail,
    filtered.href,
    filtered.created_at,
    count(*) over ()
  from filtered
  order by filtered.created_at desc, filtered.kind, filtered.item_id
  offset bounded_offset
  limit bounded_limit;
end;
$function$;
revoke all on function public.list_my_saved_items(input_bucket text, input_limit integer, input_offset integer) from public,anon,authenticated,service_role;
grant execute on function public.list_my_saved_items(input_bucket text, input_limit integer, input_offset integer) to authenticated;
comment on function public.list_my_saved_items(input_bucket text, input_limit integer, input_offset integer) is 'VB01 entitlement enforcement; retains the existing authorization and DTO contract.';

create or replace function private.event_is_visible_to_actor(
  input_event_id uuid,
  input_actor_id uuid
)
returns boolean
language sql
security definer
stable
set search_path = ''
as $function$
  select exists (
    select 1
    from public.events as event
    left join public.venues as host_venue on host_venue.id = event.host_venue_id
    left join public.profiles as host_profile on host_profile.id = event.host_user_id
    where event.id = input_event_id
      and (
        private.actor_manages_event(event.id, input_actor_id)
        or private.venue_event_participant_visibility(event.id,input_actor_id,statement_timestamp())
        or (
          event.status = 'published'
          and event.starts_at > statement_timestamp()
          and (
            (
              event.host_venue_id is not null
              and host_venue.verification_status <> 'suspended'
              and host_venue.suspended_at is null
              and private.venue_allows_event_acquisition(event.id,statement_timestamp())
            )
            or (
              event.host_user_id is not null
              and input_actor_id is not null
              and private.profile_is_community_eligible(input_actor_id)
              and host_profile.suspended_at is null
              and not private.users_are_blocked(input_actor_id, event.host_user_id)
              and (
                (
                  event.audience = 'group'
                  and exists (
                    select 1
                    from public.groups as audience_group
                    where audience_group.id = event.audience_group_id
                      and audience_group.lifecycle in ('forming', 'active')
                      and audience_group.suspended_at is null
                      and (
                        private.actor_is_active_group_member(
                          event.audience_group_id,
                          input_actor_id
                        )
                        or (
                          event.place_kind = 'public_place'
                          and audience_group.visibility = 'discoverable'
                          and audience_group.lifecycle = 'active'
                          and not private.users_are_blocked(
                            input_actor_id,
                            audience_group.owner_id
                          )
                          and not exists (
                            select 1
                            from public.group_bans as viewer_ban
                            where viewer_ban.group_id = audience_group.id
                              and viewer_ban.user_id = input_actor_id
                              and viewer_ban.revoked_at is null
                          )
                        )
                      )
                  )
                )
                or (
                  event.audience = 'friends'
                  and private.actor_is_accepted_friend(event.host_user_id, input_actor_id)
                )
                or (
                  event.audience = 'invite_only'
                  and exists (
                    select 1
                    from public.event_invitations as invitation
                    where invitation.event_id = event.id
                      and invitation.invitee_id = input_actor_id
                      and invitation.status in ('pending', 'accepted')
                  )
                )
              )
            )
          )
        )
      )
  );
$function$;
revoke all on function private.event_is_visible_to_actor(input_event_id uuid, input_actor_id uuid) from public,anon,authenticated,service_role;
comment on function private.event_is_visible_to_actor(input_event_id uuid, input_actor_id uuid) is 'VB01 entitlement enforcement; retains the existing authorization and DTO contract.';

create or replace function public.get_event_summary(input_event_id uuid)
returns table (
  event_id uuid,
  status text,
  title text,
  description text,
  expected_activity text,
  cost_description text,
  event_rules text,
  commercial_affiliation text,
  host_kind text,
  host_display_name text,
  host_handle text,
  host_venue_slug text,
  venue_verification_status text,
  match_id uuid,
  competition_name text,
  home_team_name text,
  away_team_name text,
  starts_at timestamptz,
  ends_at timestamptz,
  place_kind text,
  public_place_name text,
  public_address_text text,
  location_summary text,
  audience text,
  audience_group_name text,
  audience_team_name text,
  capacity integer,
  approved_attendee_count bigint,
  remaining_capacity integer,
  viewer_attendance_id uuid,
  viewer_attendance_status text,
  viewer_invitation_id uuid,
  viewer_invitation_status text,
  viewer_is_authenticated boolean,
  viewer_can_read_private_location boolean,
  requires_approval boolean,
  organizing_group_name text,
  organizing_group_slug text,
  can_manage boolean
)
language sql
security definer
stable
set search_path = ''
as $function$
  select
    event.id,
    private.venue_event_projected_status(event,statement_timestamp())::text,
    event.title,
    event.description,
    event.expected_activity,
    event.cost_description,
    event.event_rules,
    event.commercial_affiliation,
    case when event.host_user_id is not null then 'person' else 'venue' end,
    coalesce(host_profile.display_name, host_venue.name),
    host_profile.handle,
    host_venue.slug,
    host_venue.verification_status::text,
    event.match_id,
    competition.name,
    home_team.name,
    away_team.name,
    event.starts_at,
    event.ends_at,
    event.place_kind::text,
    event.public_place_name,
    event.public_address_text,
    case
      when event.place_kind = 'public_place' then event.public_place_name
      when event.place_kind = 'venue' then host_venue.address_text
      when private.actor_manages_event(event.id, auth.uid()) then 'Private meeting point saved'
      else 'Private meeting place'
    end,
    event.audience::text,
    audience_group.name,
    audience_team.name,
    event.capacity,
    attendance_counts.approved_count,
    case when event.capacity is null then 0
      else greatest(event.capacity - attendance_counts.approved_count::integer, 0) end,
    viewer_attendance.id,
    viewer_attendance.status::text,
    viewer_invitation.id,
    viewer_invitation.status::text,
    auth.uid() is not null,
    private.actor_can_read_private_event_location(event.id, auth.uid()),
    event.requires_approval,
    organizing_group.name,
    case
      when organizing_group.id is null then null
      when (
        organizing_group.visibility = 'discoverable'
        and organizing_group.lifecycle = 'active'
      ) or private.actor_is_active_group_member(organizing_group.id, auth.uid())
        then organizing_group.slug
      else null
    end,
    private.actor_manages_event(event.id, auth.uid())
  from public.events as event
  join public.matches as match on match.id = event.match_id
  join public.competitions as competition on competition.id = match.competition_id
  join public.teams as home_team on home_team.id = match.home_team_id
  join public.teams as away_team on away_team.id = match.away_team_id
  left join public.profiles as host_profile on host_profile.id = event.host_user_id
  left join public.venues as host_venue on host_venue.id = event.host_venue_id
  left join public.groups as audience_group on audience_group.id = event.audience_group_id
  left join public.teams as audience_team on audience_team.id = event.audience_team_id
  left join public.groups as organizing_group on organizing_group.id = event.organizing_group_id
  left join public.event_attendance as viewer_attendance
    on viewer_attendance.event_id = event.id and viewer_attendance.user_id = auth.uid()
  left join public.event_invitations as viewer_invitation
    on viewer_invitation.event_id = event.id and viewer_invitation.invitee_id = auth.uid()
  cross join lateral (
    select count(*) as approved_count
    from public.event_attendance as attendance
    where attendance.event_id = event.id and attendance.status = 'approved'
  ) as attendance_counts
  where event.id = input_event_id
    and private.event_is_visible_to_actor(event.id, auth.uid());
$function$;
revoke all on function public.get_event_summary(input_event_id uuid) from public,anon,authenticated,service_role;
grant execute on function public.get_event_summary(input_event_id uuid) to anon;
grant execute on function public.get_event_summary(input_event_id uuid) to authenticated;
comment on function public.get_event_summary(input_event_id uuid) is 'VB01 entitlement enforcement; retains the existing authorization and DTO contract.';

create or replace function public.list_my_event_participation(
  input_limit integer default 20,
  input_offset integer default 0
)
returns table (
  event_id uuid,
  title text,
  home_team_name text,
  away_team_name text,
  competition_name text,
  starts_at timestamptz,
  place_kind text,
  host_kind text,
  requires_approval boolean,
  remaining_capacity integer,
  invitation_id uuid,
  invitation_status text,
  attendance_id uuid,
  attendance_status text,
  total_count bigint
)
language plpgsql
security definer
stable
set search_path = ''
as $function$
declare
  actor_id uuid := private.assert_fan_actor();
  bounded_limit integer := least(greatest(coalesce(input_limit, 20), 1), 50);
  bounded_offset integer := greatest(coalesce(input_offset, 0), 0);
begin
  return query
  select
    event.id,
    event.title,
    home_team.name,
    away_team.name,
    competition.name,
    event.starts_at,
    event.place_kind::text,
    case when event.host_user_id is not null then 'person' else 'venue' end,
    event.requires_approval,
    case when event.capacity is null then 0
      else greatest(event.capacity - attendance_counts.approved_count::integer, 0) end,
    invitation.id,
    invitation.status::text,
    attendance.id,
    attendance.status::text,
    count(*) over ()
  from public.events as event
  join public.matches as match on match.id = event.match_id
  join public.competitions as competition on competition.id = match.competition_id
  join public.teams as home_team on home_team.id = match.home_team_id
  join public.teams as away_team on away_team.id = match.away_team_id
  left join public.event_invitations as invitation
    on invitation.event_id = event.id and invitation.invitee_id = actor_id
  left join public.event_attendance as attendance
    on attendance.event_id = event.id and attendance.user_id = actor_id
  cross join lateral (
    select count(*) as approved_count
    from public.event_attendance as counted_attendance
    where counted_attendance.event_id = event.id
      and counted_attendance.status = 'approved'
  ) as attendance_counts
  where private.venue_event_projected_status(event,statement_timestamp()) = 'published'
    and event.starts_at > statement_timestamp()
    and (invitation.id is not null or attendance.id is not null)
    and private.event_is_visible_to_actor(event.id, actor_id)
  order by event.starts_at, event.id
  offset bounded_offset
  limit bounded_limit;
end;
$function$;
revoke all on function public.list_my_event_participation(input_limit integer, input_offset integer) from public,anon,authenticated,service_role;
grant execute on function public.list_my_event_participation(input_limit integer, input_offset integer) to authenticated;
comment on function public.list_my_event_participation(input_limit integer, input_offset integer) is 'VB01 entitlement enforcement; retains the existing authorization and DTO contract.';

create or replace function public.list_my_events(
  input_bucket text,
  input_limit integer default 20,
  input_offset integer default 0
)
returns table (
  event_id uuid,
  title text,
  home_team_name text,
  away_team_name text,
  competition_name text,
  starts_at timestamptz,
  place_kind text,
  audience text,
  status text,
  bucket text,
  relationship_label text,
  can_manage boolean,
  total_count bigint
)
language plpgsql
security definer
volatile
set search_path = ''
as $function$
declare
  actor_id uuid := private.assert_fan_actor();
  bounded_limit integer;
  bounded_offset integer;
begin
  if input_bucket is null
    or input_bucket not in ('upcoming', 'hosting', 'pending', 'history')
    or input_limit is null
    or input_limit not between 1 and 50
    or input_offset is null
    or input_offset not between 0 and 10000
    or input_offset + input_limit > 10020 then
    raise exception using errcode = 'P0001', message = 'VALIDATION_FAILED';
  end if;
  bounded_limit := input_limit;
  bounded_offset := input_offset;

  return query
  with relationships as (
    select
      event.id as event_id,
      event.title,
      home_team.name as home_team_name,
      away_team.name as away_team_name,
      competition.name as competition_name,
      event.starts_at,
      event.place_kind::text as place_kind,
      event.audience::text as audience,
      private.venue_event_projected_status(event,statement_timestamp())::text as status,
      input_bucket as bucket,
      case input_bucket
        when 'upcoming' then case
          when event.host_venue_id is null
            and (event.host_user_id = actor_id or event.created_by = actor_id)
            then 'You are hosting'
          else 'You are going'
        end
        when 'hosting' then case when private.venue_event_projected_status(event,statement_timestamp()) = 'draft' then 'Draft' else 'You are hosting' end
        when 'pending' then case
          when attendance.status = 'requested' then 'Waiting for host'
          else 'Waiting for group review'
        end
        else case
          when event.host_venue_id is null
            and (event.host_user_id = actor_id or event.created_by = actor_id)
            then 'You hosted'
          else 'You attended'
        end
      end as relationship_label,
      case
        when event.host_venue_id is not null then false
        else private.actor_manages_event(event.id, actor_id)
      end as can_manage
    from public.events as event
    join public.matches as match on match.id = event.match_id
    join public.competitions as competition on competition.id = match.competition_id
    join public.teams as home_team on home_team.id = match.home_team_id
    join public.teams as away_team on away_team.id = match.away_team_id
    left join public.event_attendance as attendance
      on attendance.event_id = event.id
      and attendance.user_id = actor_id
    where (
        (
          input_bucket = 'upcoming'
          and private.venue_event_projected_status(event,statement_timestamp()) = 'published'
          and event.starts_at > statement_timestamp()
          and (
            (
              event.host_venue_id is null
              and (event.host_user_id = actor_id or event.created_by = actor_id)
            )
            or (
              attendance.status = 'approved'
              and (
                event.host_venue_id is not null
                or (
                  event.host_user_id is distinct from actor_id
                  and event.created_by <> actor_id
                )
              )
            )
          )
          and private.event_is_visible_to_actor(event.id, actor_id)
        )
        or (
          input_bucket = 'hosting'
          and private.venue_event_projected_status(event,statement_timestamp()) in ('draft', 'published')
          and event.ends_at > statement_timestamp()
          and event.host_venue_id is null
          and (event.host_user_id = actor_id or event.created_by = actor_id)
        )
        or (
          input_bucket = 'pending'
          and event.starts_at > statement_timestamp()
          and (
            (
              private.venue_event_projected_status(event,statement_timestamp()) = 'pending_group_review'
              and event.host_venue_id is null
              and event.created_by = actor_id
            )
            or (
              private.venue_event_projected_status(event,statement_timestamp()) = 'published'
              and attendance.status = 'requested'
              and private.event_is_visible_to_actor(event.id, actor_id)
            )
          )
        )
        or (
          input_bucket = 'history'
          and private.venue_event_projected_status(event,statement_timestamp()) in ('completed', 'cancelled')
          and (
            (
              event.host_venue_id is null
              and (event.host_user_id = actor_id or event.created_by = actor_id)
            )
            or (private.venue_event_projected_status(event,statement_timestamp()) = 'completed' and attendance.status = 'approved')
            or (event.host_venue_id is not null and private.venue_event_projected_status(event,statement_timestamp())='cancelled'
              and attendance.status in ('requested','approved') and private.event_is_visible_to_actor(event.id,actor_id))
          )
        )
      )
      and (
        coalesce(event.organizing_group_id, event.audience_group_id) is null
        or (
          private.actor_is_active_group_member(
            coalesce(event.organizing_group_id, event.audience_group_id), actor_id
          )
          and exists (
            select 1
            from public.groups as governing_group
            where governing_group.id = coalesce(event.organizing_group_id, event.audience_group_id)
              and governing_group.lifecycle in ('forming', 'active')
              and governing_group.suspended_at is null
          )
        )
      )
  )
  select
    relationship.event_id,
    relationship.title,
    relationship.home_team_name,
    relationship.away_team_name,
    relationship.competition_name,
    relationship.starts_at,
    relationship.place_kind,
    relationship.audience,
    relationship.status,
    relationship.bucket,
    relationship.relationship_label,
    relationship.can_manage,
    count(*) over ()
  from relationships as relationship
  order by
    case when input_bucket = 'history' then relationship.starts_at end desc,
    case when input_bucket <> 'history' then relationship.starts_at end,
    relationship.event_id
  offset bounded_offset
  limit bounded_limit;
end;
$function$;
revoke all on function public.list_my_events(input_bucket text, input_limit integer, input_offset integer) from public,anon,authenticated,service_role;
grant execute on function public.list_my_events(input_bucket text, input_limit integer, input_offset integer) to authenticated;
comment on function public.list_my_events(input_bucket text, input_limit integer, input_offset integer) is 'VB01 entitlement enforcement; retains the existing authorization and DTO contract.';

create or replace function public.list_venue_calendar(
  input_venue_id uuid,
  input_limit integer default 100
)
returns table (
  event_id uuid,
  title text,
  status text,
  starts_at timestamptz,
  ends_at timestamptz,
  venue_space_id uuid,
  venue_space_name text,
  attendance_mode text,
  capacity integer,
  approved_attendee_count bigint,
  requires_approval boolean
)
language plpgsql
security definer
stable
set search_path = ''
as $function$
declare
  actor_id uuid := private.assert_common_actor();
begin
  if not private.actor_manages_venue(actor_id, input_venue_id) then
    raise exception using errcode = 'P0001', message = 'NOT_FOUND';
  end if;

  return query
  select
    event.id,
    event.title,
    private.venue_event_projected_status(event,statement_timestamp())::text,
    event.starts_at,
    event.ends_at,
    event.venue_space_id,
    space.name,
    event.attendance_mode::text,
    event.capacity,
    (
      select count(*)
      from public.event_attendance as attendance
      where attendance.event_id = event.id
        and attendance.status = 'approved'
    ),
    event.requires_approval
  from public.events as event
  left join public.venue_spaces as space on space.id = event.venue_space_id
  where event.host_venue_id = input_venue_id
  order by event.starts_at, event.id
  limit least(greatest(coalesce(input_limit, 100), 1), 250);
end;
$function$;
revoke all on function public.list_venue_calendar(input_venue_id uuid, input_limit integer) from public,anon,authenticated,service_role;
grant execute on function public.list_venue_calendar(input_venue_id uuid, input_limit integer) to authenticated;
comment on function public.list_venue_calendar(input_venue_id uuid, input_limit integer) is 'VB01 entitlement enforcement; retains the existing authorization and DTO contract.';

create or replace function public.get_venue_today(
  input_venue_id uuid,
  input_limit integer default 12
)
returns table (
  next_event jsonb,
  today_events jsonb,
  attention jsonb,
  setup_tasks jsonb
)
language plpgsql
security definer
volatile
set search_path = ''
as $function$
declare
  actor_id uuid := private.assert_common_actor();
  bounded_limit integer := least(greatest(coalesce(input_limit, 12), 1), 30);
  israel_today date := timezone('Asia/Jerusalem', statement_timestamp())::date;
  today_start timestamptz;
  tomorrow_start timestamptz;
begin
  if not private.actor_manages_venue(actor_id, input_venue_id) then
    raise exception using errcode = 'P0001', message = 'NOT_FOUND';
  end if;

  today_start := israel_today::timestamp at time zone 'Asia/Jerusalem';
  tomorrow_start := (israel_today + 1)::timestamp at time zone 'Asia/Jerusalem';

  return query
  with event_rows as (
    select
      event.id,
      event.title,
      private.venue_event_projected_status(event,statement_timestamp())::text as status,
      event.starts_at,
      event.ends_at,
      event.venue_space_id,
      space.name as venue_space_name,
      event.attendance_mode::text as attendance_mode,
      event.capacity,
      count(attendance.id) filter (where attendance.status = 'approved') as approved_count,
      count(attendance.id) filter (where attendance.status = 'requested') as waiting_count,
      event.requires_approval
    from public.events as event
    left join public.venue_spaces as space on space.id = event.venue_space_id
    left join public.event_attendance as attendance on attendance.event_id = event.id
    where event.host_venue_id = input_venue_id
    group by event.id, space.name
  ),
  next_row as (
    select *
    from event_rows
    where ends_at >= statement_timestamp()
      and status not in ('cancelled', 'completed')
    order by starts_at, id
    limit 1
  ),
  today_rows as (
    select *
    from event_rows
    where ends_at >= statement_timestamp()
      and starts_at < tomorrow_start
      and ends_at >= today_start
      and status not in ('cancelled', 'completed')
    order by starts_at, id
    limit bounded_limit
  ),
  attention_rows as (
    select *
    from event_rows
    where ends_at >= statement_timestamp()
      and status not in ('cancelled', 'completed')
      and attendance_mode = 'reservations'
      and waiting_count > 0
    order by starts_at, id
    limit bounded_limit
  )
  select
    (
      select jsonb_build_object(
        'event_id', next_row.id,
        'title', next_row.title,
        'status', next_row.status,
        'starts_at', next_row.starts_at,
        'ends_at', next_row.ends_at,
        'venue_space_id', next_row.venue_space_id,
        'venue_space_name', next_row.venue_space_name,
        'attendance_mode', next_row.attendance_mode,
        'capacity', next_row.capacity,
        'approved_attendee_count', next_row.approved_count,
        'waiting_attendee_count', next_row.waiting_count,
        'requires_approval', next_row.requires_approval
      )
      from next_row
    ),
    coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'event_id', today_row.id,
            'title', today_row.title,
            'status', today_row.status,
            'starts_at', today_row.starts_at,
            'ends_at', today_row.ends_at,
            'venue_space_id', today_row.venue_space_id,
            'venue_space_name', today_row.venue_space_name,
            'attendance_mode', today_row.attendance_mode,
            'capacity', today_row.capacity,
            'approved_attendee_count', today_row.approved_count,
            'waiting_attendee_count', today_row.waiting_count,
            'requires_approval', today_row.requires_approval
          )
          order by today_row.starts_at, today_row.id
        )
        from today_rows as today_row
      ),
      '[]'::jsonb
    ),
    coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'event_id', attention_row.id,
            'title', attention_row.title,
            'waiting_count', attention_row.waiting_count
          )
          order by attention_row.starts_at, attention_row.id
        )
        from attention_rows as attention_row
      ),
      '[]'::jsonb
    ),
    coalesce(
      (
        select jsonb_agg(task.message order by task.position)
        from (
          select 1 as position, 'Add an active viewing area before planning events.'::text as message
          where not exists (
            select 1 from public.venue_spaces as space
            where space.venue_id = input_venue_id and space.active
          )
          union all
          select 2, 'Add a capacity for every active viewing area.'
          where exists (
            select 1
            from public.venues as venue
            join public.venue_spaces as space on space.venue_id = venue.id
            where venue.id = input_venue_id
              and venue.default_attendance_mode = 'reservations'
              and space.active
              and space.capacity is null
          )
          union all
          select 3, 'Name each real viewing area.'
          from public.venues as venue
          where venue.id = input_venue_id
            and coalesce(venue.screen_count, 1) > (
              select count(*)
              from public.venue_spaces as space
              where space.venue_id = input_venue_id and space.active
            )
        ) as task
      ),
      '[]'::jsonb
    );
end;
$function$;
revoke all on function public.get_venue_today(input_venue_id uuid, input_limit integer) from public,anon,authenticated,service_role;
grant execute on function public.get_venue_today(input_venue_id uuid, input_limit integer) to authenticated;
comment on function public.get_venue_today(input_venue_id uuid, input_limit integer) is 'VB01 entitlement enforcement; retains the existing authorization and DTO contract.';

create or replace function public.list_managed_venue_events(
  input_venue_id uuid,
  input_limit integer default 20
)
returns table (
  event_id uuid,
  title text,
  status text,
  home_team_name text,
  away_team_name text,
  competition_name text,
  starts_at timestamptz,
  audience text,
  audience_team_name text,
  capacity integer,
  approved_attendee_count bigint,
  requires_approval boolean
)
language plpgsql
security definer
stable
set search_path = ''
as $function$
#variable_conflict use_variable
declare
  actor_id uuid := private.assert_common_actor();
begin
  if not private.actor_manages_venue(actor_id, input_venue_id) then
    raise exception using errcode = 'P0001', message = 'NOT_FOUND';
  end if;

  return query
  select
    event.id,
    event.title,
    private.venue_event_projected_status(event,statement_timestamp())::text,
    home_team.name,
    away_team.name,
    competition.name,
    event.starts_at,
    event.audience::text,
    audience_team.name,
    event.capacity,
    (
      select count(*)
      from public.event_attendance as attendance
      where attendance.event_id = event.id
        and attendance.status = 'approved'
    ),
    event.requires_approval
  from public.events as event
  join public.matches as match on match.id = event.match_id
  join public.teams as home_team on home_team.id = match.home_team_id
  join public.teams as away_team on away_team.id = match.away_team_id
  join public.competitions as competition on competition.id = match.competition_id
  left join public.teams as audience_team on audience_team.id = event.audience_team_id
  where event.host_venue_id = input_venue_id
  order by event.starts_at desc, event.id
  limit least(greatest(coalesce(input_limit, 20), 1), 50);
end;
$function$;
revoke all on function public.list_managed_venue_events(input_venue_id uuid, input_limit integer) from public,anon,authenticated,service_role;
grant execute on function public.list_managed_venue_events(input_venue_id uuid, input_limit integer) to authenticated;
comment on function public.list_managed_venue_events(input_venue_id uuid, input_limit integer) is 'VB01 entitlement enforcement; retains the existing authorization and DTO contract.';

create or replace function public.get_calendar_event(
  input_event_id uuid,
  audit_request_id uuid default null
)
returns table (
  event_id uuid,
  title text,
  description text,
  starts_at timestamptz,
  ends_at timestamptz,
  updated_at timestamptz,
  location_text text,
  public_cacheable boolean
)
language plpgsql
security definer
set search_path = ''
as $function$
#variable_conflict use_variable
declare
  actor_id uuid := auth.uid();
  target_event public.events%rowtype;
  venue_address text;
  private_address text;
  private_directions text;
begin
  select event.*
  into target_event
  from public.events as event
  where event.id = input_event_id
  for share;

  if not found or not private.event_is_visible_to_actor(input_event_id, actor_id) then
    raise exception using errcode = 'P0001', message = 'NOT_FOUND';
  end if;

  if target_event.host_user_id is not null and actor_id is null then
    raise exception using errcode = 'P0001', message = 'AUTH_REQUIRED';
  end if;

  if target_event.place_kind = 'home'
    and private.actor_can_read_private_event_location(input_event_id, actor_id) then
    select location.address_text, location.directions
    into private_address, private_directions
    from public.get_private_event_location(input_event_id, audit_request_id) as location;
  elsif target_event.place_kind = 'venue' then
    select venue.address_text
    into venue_address
    from public.venues as venue
    where venue.id = target_event.venue_id;
  end if;

  return query select
    target_event.id,
    target_event.title,
    target_event.description,
    target_event.starts_at,
    target_event.ends_at,
    target_event.updated_at,
    case
      when target_event.place_kind = 'home' and private_address is not null then
        concat_ws(' — ', private_address, private_directions)
      when target_event.place_kind = 'venue' then venue_address
      when target_event.place_kind = 'public_place' then
        concat_ws(' — ', target_event.public_place_name, target_event.public_address_text)
      else null
    end,
    false;
end;
$function$;
revoke all on function public.get_calendar_event(input_event_id uuid, audit_request_id uuid) from public,anon,authenticated,service_role;
grant execute on function public.get_calendar_event(input_event_id uuid, audit_request_id uuid) to anon;
grant execute on function public.get_calendar_event(input_event_id uuid, audit_request_id uuid) to authenticated;
comment on function public.get_calendar_event(input_event_id uuid, audit_request_id uuid) is 'VB01 entitlement enforcement; retains the existing authorization and DTO contract.';

create or replace function public.update_venue(
  input_venue_id uuid,
  input_name text,
  input_slug text,
  input_address_text text,
  input_longitude double precision,
  input_latitude double precision,
  input_description text,
  input_screen_count integer,
  input_stated_capacity integer,
  audit_request_id uuid default null
)
returns table (venue_id uuid, slug text, verification_status text)
language plpgsql
security definer
set search_path = ''
as $function$
declare
  actor_id uuid := private.serialize_actor_transaction();
  target_venue public.venues%rowtype;
begin
  perform private.lock_venue_billing(input_venue_id);
  actor_id:=private.assert_common_actor();
  if not private.venue_allows_draft_work(input_venue_id,statement_timestamp()) then
    raise exception using errcode='P0001',message='NOT_ALLOWED';
  end if;
  select venue.*
  into target_venue
  from public.venues as venue
  where venue.id = input_venue_id
  for update;

  if not found
    or not private.actor_manages_venue(actor_id, input_venue_id)
    or target_venue.verification_status = 'suspended'
    or input_longitude is null
    or input_latitude is null
    or input_longitude not between 34 and 36
    or input_latitude not between 29 and 34 then
    raise exception using errcode = 'P0001', message = 'NOT_ALLOWED';
  end if;

  update public.venues as venue
  set slug = lower(btrim(input_slug)),
      name = btrim(input_name),
      address_text = btrim(input_address_text),
      location = extensions.st_setsrid(
        extensions.st_makepoint(input_longitude, input_latitude), 4326
      )::extensions.geography,
      description = btrim(input_description),
      screen_count = input_screen_count,
      stated_capacity = input_stated_capacity
  where venue.id = input_venue_id
  returning * into target_venue;

  perform private.write_security_audit(
    actor_id,
    'venue.update',
    'venue',
    target_venue.id,
    'succeeded',
    audit_request_id,
    jsonb_build_object('verification_status', target_venue.verification_status::text)
  );

  return query select
    target_venue.id, target_venue.slug, target_venue.verification_status::text;
exception
  when unique_violation then
    raise exception using errcode = 'P0001', message = 'VENUE_SLUG_UNAVAILABLE';
end;
$function$;
revoke all on function public.update_venue(input_venue_id uuid, input_name text, input_slug text, input_address_text text, input_longitude double precision, input_latitude double precision, input_description text, input_screen_count integer, input_stated_capacity integer, audit_request_id uuid) from public,anon,authenticated,service_role;
grant execute on function public.update_venue(input_venue_id uuid, input_name text, input_slug text, input_address_text text, input_longitude double precision, input_latitude double precision, input_description text, input_screen_count integer, input_stated_capacity integer, audit_request_id uuid) to authenticated;
comment on function public.update_venue(input_venue_id uuid, input_name text, input_slug text, input_address_text text, input_longitude double precision, input_latitude double precision, input_description text, input_screen_count integer, input_stated_capacity integer, audit_request_id uuid) is 'VB01 entitlement enforcement; retains the existing authorization and DTO contract.';

create or replace function public.update_venue_workspace_v2(
  input_venue_id uuid,
  input_name text,
  input_slug text,
  input_address_text text,
  input_longitude numeric,
  input_latitude numeric,
  input_description text,
  input_facilities text[],
  input_house_information text,
  input_default_attendance_mode text,
  input_default_requires_approval boolean,
  audit_request_id uuid default null
)
returns table (venue_id uuid, slug text, verification_status text)
language plpgsql
security definer
set search_path = ''
as $function$
declare
  actor_id uuid := private.serialize_actor_transaction();
  target_venue public.venues%rowtype;
  parsed_facilities public.venue_facility[];
  parsed_mode public.event_attendance_mode;
  normalized_house_information text := coalesce(btrim(input_house_information), '');
begin
  perform private.lock_venue_billing(input_venue_id);
  actor_id:=private.assert_common_actor();
  if not private.venue_allows_draft_work(input_venue_id,statement_timestamp()) then
    raise exception using errcode='P0001',message='NOT_ALLOWED';
  end if;
  if not private.actor_manages_venue(actor_id, input_venue_id) then
    raise exception using errcode = 'P0001', message = 'NOT_ALLOWED';
  end if;

  begin
    parsed_mode := input_default_attendance_mode::public.event_attendance_mode;
    select coalesce(array_agg(facility::public.venue_facility order by ordinal), '{}')
    into parsed_facilities
    from unnest(coalesce(input_facilities, '{}'))
      with ordinality as item(facility, ordinal);
  exception when invalid_text_representation then
    raise exception using errcode = 'P0001', message = 'VALIDATION_FAILED';
  end;

  if input_longitude is null
    or input_latitude is null
    or input_longitude not between 34 and 36
    or input_latitude not between 29 and 34
    or char_length(normalized_house_information) > 1000
    or input_default_requires_approval is null
    or (parsed_mode = 'open_door' and input_default_requires_approval)
    or cardinality(parsed_facilities) > 7
    or not private.venue_facilities_are_unique(parsed_facilities) then
    raise exception using errcode = 'P0001', message = 'VALIDATION_FAILED';
  end if;

  update public.venues as venue
  set slug = lower(btrim(input_slug)),
      name = btrim(input_name),
      address_text = btrim(input_address_text),
      location = extensions.st_setsrid(
        extensions.st_makepoint(
          input_longitude::double precision,
          input_latitude::double precision
        ),
        4326
      )::extensions.geography,
      description = btrim(input_description),
      facilities = parsed_facilities,
      house_information = normalized_house_information,
      default_attendance_mode = parsed_mode,
      default_requires_approval = case
        when parsed_mode = 'open_door' then false
        else input_default_requires_approval
      end
  where venue.id = input_venue_id
  returning * into target_venue;

  if parsed_mode = 'open_door' then
    update public.venue_spaces as space
    set capacity = null
    where space.venue_id = input_venue_id;
  end if;

  perform private.write_security_audit(
    actor_id,
    'venue.workspace.update',
    'venue',
    target_venue.id,
    'succeeded',
    audit_request_id,
    jsonb_build_object(
      'verification_status', target_venue.verification_status::text,
      'attendance_mode', parsed_mode::text
    )
  );

  return query select
    target_venue.id, target_venue.slug, target_venue.verification_status::text;
exception
  when unique_violation then
    raise exception using errcode = 'P0001', message = 'VENUE_SLUG_UNAVAILABLE';
end;
$function$;
revoke all on function public.update_venue_workspace_v2(input_venue_id uuid, input_name text, input_slug text, input_address_text text, input_longitude numeric, input_latitude numeric, input_description text, input_facilities text[], input_house_information text, input_default_attendance_mode text, input_default_requires_approval boolean, audit_request_id uuid) from public,anon,authenticated,service_role;
grant execute on function public.update_venue_workspace_v2(input_venue_id uuid, input_name text, input_slug text, input_address_text text, input_longitude numeric, input_latitude numeric, input_description text, input_facilities text[], input_house_information text, input_default_attendance_mode text, input_default_requires_approval boolean, audit_request_id uuid) to authenticated;
comment on function public.update_venue_workspace_v2(input_venue_id uuid, input_name text, input_slug text, input_address_text text, input_longitude numeric, input_latitude numeric, input_description text, input_facilities text[], input_house_information text, input_default_attendance_mode text, input_default_requires_approval boolean, audit_request_id uuid) is 'VB01 entitlement enforcement; retains the existing authorization and DTO contract.';

create or replace function public.save_venue_space(
  input_venue_id uuid,
  input_space_id uuid,
  input_name text,
  input_capacity integer,
  input_active boolean,
  input_sort_order integer,
  audit_request_id uuid default null
)
returns table (space_id uuid, name text, capacity integer, active boolean)
language plpgsql
security definer
set search_path = ''
as $function$
#variable_conflict use_variable
declare
  actor_id uuid := private.serialize_actor_transaction();
  target_space public.venue_spaces%rowtype;
begin
  perform private.lock_venue_billing(input_venue_id);
  actor_id:=private.assert_common_actor();
  if not private.venue_allows_draft_work(input_venue_id,statement_timestamp()) then
    raise exception using errcode='P0001',message='NOT_ALLOWED';
  end if;
  if not private.actor_manages_venue(actor_id, input_venue_id) then
    raise exception using errcode = 'P0001', message = 'NOT_ALLOWED';
  end if;
  if nullif(btrim(input_name), '') is null
    or char_length(btrim(input_name)) > 120
    or (input_capacity is not null and input_capacity not between 1 and 100000)
    or input_active is null
    or input_sort_order is null
    or input_sort_order not between 0 and 1000 then
    raise exception using errcode = 'P0001', message = 'VALIDATION_FAILED';
  end if;

  if input_space_id is null then
    insert into public.venue_spaces (venue_id, name, capacity, active, sort_order)
    values (
      input_venue_id,
      btrim(input_name),
      input_capacity,
      input_active,
      input_sort_order
    )
    returning * into target_space;
  else
    select space.*
    into target_space
    from public.venue_spaces as space
    where space.id = input_space_id
      and space.venue_id = input_venue_id
    for update;

    if not found then
      raise exception using errcode = 'P0001', message = 'NOT_FOUND';
    end if;

    update public.venue_spaces as space
    set name = btrim(input_name),
        capacity = input_capacity,
        active = input_active,
        sort_order = input_sort_order
    where space.id = input_space_id
    returning * into target_space;
  end if;

  perform private.write_security_audit(
    actor_id,
    'venue.space.save',
    'venue',
    input_venue_id,
    'succeeded',
    audit_request_id,
    jsonb_build_object('space_id', target_space.id, 'active', target_space.active)
  );

  return query select
    target_space.id,
    target_space.name,
    target_space.capacity,
    target_space.active;
exception
  when unique_violation then
    raise exception using errcode = 'P0001', message = 'VENUE_SPACE_NAME_UNAVAILABLE';
end;
$function$;
revoke all on function public.save_venue_space(input_venue_id uuid, input_space_id uuid, input_name text, input_capacity integer, input_active boolean, input_sort_order integer, audit_request_id uuid) from public,anon,authenticated,service_role;
grant execute on function public.save_venue_space(input_venue_id uuid, input_space_id uuid, input_name text, input_capacity integer, input_active boolean, input_sort_order integer, audit_request_id uuid) to authenticated;
comment on function public.save_venue_space(input_venue_id uuid, input_space_id uuid, input_name text, input_capacity integer, input_active boolean, input_sort_order integer, audit_request_id uuid) is 'VB01 entitlement enforcement; retains the existing authorization and DTO contract.';

create or replace function public.get_venue_billing_context(input_venue_id uuid)
returns jsonb language plpgsql security definer volatile set search_path='' as $function$
declare
  actor_id uuid := private.serialize_actor_transaction();
  checked_at timestamptz := statement_timestamp();
  e private.venue_billing_entitlements%rowtype;
  v public.venues%rowtype;
  effective_state text;
  is_owner boolean;
  pending boolean;
  drafts boolean;
begin
  perform private.lock_venue_billing(input_venue_id);
  actor_id:=private.assert_common_actor();
  if not private.actor_has_venue_membership(actor_id,input_venue_id) then
    raise exception using errcode='P0001',message='NOT_FOUND';
  end if;
  select * into strict e from private.venue_billing_entitlements where venue_id=input_venue_id;
  select * into strict v from public.venues where id=input_venue_id;
  effective_state:=private.venue_billing_effective_state(input_venue_id,checked_at);
  is_owner:=private.actor_is_venue_billing_owner(actor_id,input_venue_id);
  pending:=exists(select 1 from private.venue_billing_checkout_attempts a where a.venue_id=input_venue_id and a.state in ('reserved','uncertain','attached'));
  drafts:=private.venue_allows_draft_work(input_venue_id,checked_at);
  return pg_catalog.jsonb_build_object(
    'state',effective_state,'interval',e.interval,'checkoutPending',pending,
    'paidThroughAt',e.paid_through_at,
    'graceExpiresAt',case when e.status='active' and effective_state='provider_stale' then e.paid_through_at+interval '168 hours' else e.grace_expires_at end,
    'publishCutoffAt',case when e.status='canceling' then e.paid_through_at else null end,
    'isPublic',private.venue_allows_public_presence(input_venue_id,checked_at),
    'canPublish',private.venue_allows_public_presence(input_venue_id,checked_at),
    'canPrepareDrafts',drafts,'canOperateExistingEvents',drafts,
    'canManageBilling',is_owner,
    'canStartCheckout',is_owner and v.archived_at is null and v.suspended_at is null
      and e.polar_subscription_id is null and not pending and effective_state in ('payment_required','legacy_grace','expired'),
    'canOpenPortal',is_owner and e.polar_subscription_id is not null
  );
end;
$function$;
revoke all on function public.get_venue_billing_context(input_venue_id uuid) from public,anon,authenticated,service_role;
grant execute on function public.get_venue_billing_context(input_venue_id uuid) to authenticated;
comment on function public.get_venue_billing_context(input_venue_id uuid) is 'VB01 entitlement enforcement; retains the existing authorization and DTO contract.';

create or replace function public.reserve_venue_billing_checkout(input_venue_id uuid,input_interval public.venue_billing_interval,input_request_id uuid)
returns table(attempt_id uuid,generation bigint,created_by_this_call boolean)
language plpgsql security definer volatile set search_path='' as $function$
declare
  actor_id uuid := private.serialize_actor_transaction();
  attempt private.venue_billing_checkout_attempts%rowtype;
  e private.venue_billing_entitlements%rowtype;
begin
  if input_interval is null then raise exception using errcode='P0001',message='VALIDATION_FAILED'; end if;
  perform private.lock_venue_billing(input_venue_id);
  actor_id:=private.assert_common_actor();
  if not private.actor_is_venue_billing_owner(actor_id,input_venue_id) then
    raise exception using errcode='P0001',message='VENUE_BILLING_OWNER_REQUIRED';
  end if;
  if not private.actor_manages_venue(actor_id,input_venue_id) then
    raise exception using errcode='P0001',message='NOT_ALLOWED';
  end if;
  perform private.apply_venue_billing_deadline_for_venue(input_venue_id,statement_timestamp());
  select * into strict e from private.venue_billing_entitlements where venue_id=input_venue_id for update;
  if e.polar_subscription_id is not null or e.status not in ('inactive','legacy_grace','expired') then
    raise exception using errcode='P0001',message='VENUE_BILLING_PENDING';
  end if;
  select * into attempt from private.venue_billing_checkout_attempts a where a.venue_id=input_venue_id and a.state in ('reserved','uncertain','attached');
  if found then return query select attempt.id,attempt.generation,false; return; end if;
  insert into private.venue_billing_checkout_attempts(venue_id,owner_id,interval,generation)
  select input_venue_id,actor_id,input_interval,coalesce(max(a.generation),0)+1
  from private.venue_billing_checkout_attempts a where a.venue_id=input_venue_id
  returning * into attempt;
  return query select attempt.id,attempt.generation,true;
end;
$function$;
revoke all on function public.reserve_venue_billing_checkout(input_venue_id uuid, input_interval venue_billing_interval, input_request_id uuid) from public,anon,authenticated,service_role;
grant execute on function public.reserve_venue_billing_checkout(input_venue_id uuid, input_interval venue_billing_interval, input_request_id uuid) to authenticated;
comment on function public.reserve_venue_billing_checkout(input_venue_id uuid, input_interval venue_billing_interval, input_request_id uuid) is 'VB01 entitlement enforcement; retains the existing authorization and DTO contract.';

create or replace function public.request_or_join_event(
  input_event_id uuid,
  audit_request_id uuid default null
)
returns table (attendance_id uuid, status text)
language plpgsql
security definer
set search_path = ''
as $function$
#variable_conflict use_variable
declare
  actor_id uuid := private.serialize_actor_transaction();
  host_id uuid;
  target_event public.events%rowtype;
  target_attendance public.event_attendance%rowtype;
  approved_count bigint;
  immediate_approval boolean;
  attendance_exists boolean;
begin
  perform private.lock_event_venue_billing(input_event_id);
  actor_id:=private.assert_actor(true);
  select event.host_user_id
  into host_id
  from public.events as event
  where event.id = input_event_id;

  if not found then
    raise exception using errcode = 'P0001', message = 'NOT_FOUND';
  end if;

  perform private.lock_event_interaction_pairs(actor_id, host_id, null);

  select event.*
  into target_event
  from public.events as event
  where event.id = input_event_id
  for update;

  if target_event.host_venue_id is not null and not private.venue_allows_event_acquisition(target_event.id,statement_timestamp()) then
    raise exception using errcode='P0001',message='NOT_ALLOWED';
  end if;

  if target_event.status = 'cancelled' then
    raise exception using errcode = 'P0001', message = 'EVENT_CANCELLED';
  end if;

  if target_event.status <> 'published' then
    raise exception using errcode = 'P0001', message = 'NOT_FOUND';
  end if;

  if target_event.starts_at <= statement_timestamp() then
    raise exception using errcode = 'P0001', message = 'EVENT_STARTED';
  end if;

  if not private.event_user_is_audience_eligible(target_event.id, actor_id, false) then
    raise exception using errcode = 'P0001', message = 'NOT_ALLOWED';
  end if;

  select attendance.*
  into target_attendance
  from public.event_attendance as attendance
  where attendance.event_id = target_event.id
    and attendance.user_id = actor_id
  for update;

  attendance_exists := found;

  if attendance_exists and target_attendance.status in ('requested', 'approved') then
    raise exception using errcode = 'P0001', message = 'ALREADY_ATTENDING';
  elsif attendance_exists and target_attendance.status in ('declined', 'removed') then
    raise exception using errcode = 'P0001', message = 'INVALID_TRANSITION';
  end if;

  immediate_approval := target_event.host_venue_id is not null
    and not target_event.requires_approval;

  if immediate_approval then
    select count(*)
    into approved_count
    from public.event_attendance as attendance
    where attendance.event_id = target_event.id
      and attendance.status = 'approved';

    if approved_count >= target_event.capacity then
      raise exception using errcode = 'P0001', message = 'EVENT_FULL';
    end if;
  end if;

  if attendance_exists then
    update public.event_attendance as attendance
    set
      status = case
        when immediate_approval then 'approved'::public.attendance_status
        else 'requested'::public.attendance_status
      end,
      source = 'self_request',
      requested_at = statement_timestamp(),
      reviewed_by = null,
      reviewed_at = null,
      left_at = null,
      removed_by = null,
      removed_at = null,
      removal_reason = null
    where attendance.id = target_attendance.id
    returning * into target_attendance;
  else
    insert into public.event_attendance (event_id, user_id, status, source)
    values (
      target_event.id,
      actor_id,
      case
        when immediate_approval then 'approved'::public.attendance_status
        else 'requested'::public.attendance_status
      end,
      'self_request'
    )
    returning * into target_attendance;
  end if;

  perform private.write_security_audit(
    actor_id,
    case
      when immediate_approval then 'event.attendance.join'
      else 'event.attendance.request'
    end,
    'event',
    target_event.id,
    'succeeded',
    audit_request_id,
    jsonb_build_object('attendance_status', target_attendance.status::text)
  );

  return query select target_attendance.id, target_attendance.status::text;
end;
$function$;
revoke all on function public.request_or_join_event(input_event_id uuid, audit_request_id uuid) from public,anon,authenticated,service_role;
grant execute on function public.request_or_join_event(input_event_id uuid, audit_request_id uuid) to authenticated;
comment on function public.request_or_join_event(input_event_id uuid, audit_request_id uuid) is 'VB01 entitlement enforcement; retains the existing authorization and DTO contract.';

create or replace function public.create_event_invitation(
  input_event_id uuid,
  input_invitee_handle text,
  audit_request_id uuid default null
)
returns table (invitation_id uuid, event_id uuid, status text)
language plpgsql
security definer
set search_path = ''
as $function$
#variable_conflict use_variable
declare
  actor_id uuid := private.serialize_actor_transaction();
  invitee_id uuid;
  host_id uuid;
  target_event public.events%rowtype;
  target_invitation public.event_invitations%rowtype;
  approved_count bigint;
begin
  perform private.lock_event_venue_billing(input_event_id);
  actor_id:=private.assert_event_context_actor(input_event_id);
  select profile.id
  into invitee_id
  from public.profiles as profile
  where profile.handle = lower(btrim(input_invitee_handle))
    and profile.profile_completed_at is not null;

  if invitee_id is null then
    raise exception using errcode = 'P0001', message = 'NOT_FOUND';
  end if;

  select event.host_user_id
  into host_id
  from public.events as event
  where event.id = input_event_id;

  if not found then
    raise exception using errcode = 'P0001', message = 'NOT_FOUND';
  end if;

  perform private.lock_event_interaction_pairs(invitee_id, actor_id, host_id);

  select event.*
  into target_event
  from public.events as event
  where event.id = input_event_id
  for update;

  if not found or not private.actor_manages_event(target_event.id, actor_id) then
    raise exception using errcode = 'P0001', message = 'NOT_FOUND';
  end if;

  if target_event.host_venue_id is not null and not private.venue_allows_event_acquisition(target_event.id,statement_timestamp()) then
    raise exception using errcode='P0001',message='NOT_ALLOWED';
  end if;

  if target_event.status = 'cancelled' then
    raise exception using errcode = 'P0001', message = 'EVENT_CANCELLED';
  end if;

  if target_event.status <> 'published' then
    raise exception using errcode = 'P0001', message = 'NOT_ALLOWED';
  end if;

  if target_event.starts_at <= statement_timestamp() then
    raise exception using errcode = 'P0001', message = 'EVENT_STARTED';
  end if;

  if invitee_id = actor_id or invitee_id = target_event.host_user_id then
    raise exception using errcode = 'P0001', message = 'NOT_ALLOWED';
  end if;

  if private.users_are_blocked(actor_id, invitee_id)
    or (
      target_event.host_user_id is not null
      and private.users_are_blocked(target_event.host_user_id, invitee_id)
    ) then
    raise exception using errcode = 'P0001', message = 'BLOCKED_RELATIONSHIP';
  end if;

  if not private.event_user_is_audience_eligible(
    target_event.id,
    invitee_id,
    true
  ) then
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
    and invitation.invitee_id = invitee_id
  for update;

  if found and target_invitation.status in ('pending', 'accepted') then
    raise exception using errcode = 'P0001', message = 'INVITE_INVALID';
  elsif found then
    update public.event_invitations as invitation
    set
      invited_by = actor_id,
      status = 'pending',
      responded_at = null
    where invitation.id = target_invitation.id
    returning * into target_invitation;
  else
    insert into public.event_invitations (event_id, invitee_id, invited_by)
    values (target_event.id, invitee_id, actor_id)
    returning * into target_invitation;
  end if;

  perform private.write_security_audit(
    actor_id,
    'event.invitation.create',
    'event',
    target_event.id,
    'succeeded',
    audit_request_id,
    jsonb_build_object('invitation_id', target_invitation.id)
  );

  return query select
    target_invitation.id,
    target_invitation.event_id,
    target_invitation.status::text;
end;
$function$;
revoke all on function public.create_event_invitation(input_event_id uuid, input_invitee_handle text, audit_request_id uuid) from public,anon,authenticated,service_role;
grant execute on function public.create_event_invitation(input_event_id uuid, input_invitee_handle text, audit_request_id uuid) to authenticated;
comment on function public.create_event_invitation(input_event_id uuid, input_invitee_handle text, audit_request_id uuid) is 'VB01 entitlement enforcement; retains the existing authorization and DTO contract.';

create or replace function public.respond_to_event_invitation(
  input_invitation_id uuid,
  input_decision text,
  audit_request_id uuid default null
)
returns table (
  event_id uuid,
  invitation_status text,
  attendance_id uuid,
  attendance_status text
)
language plpgsql
security definer
set search_path = ''
as $function$
#variable_conflict use_variable
declare
  actor_id uuid := private.serialize_actor_transaction();
  parsed_decision text := lower(btrim(input_decision));
  inviter_id uuid;
  host_id uuid;
  target_event public.events%rowtype;
  target_invitation public.event_invitations%rowtype;
  target_attendance public.event_attendance%rowtype;
  approved_count bigint;
begin
  perform private.lock_event_venue_billing((select event_id from public.event_invitations where id=input_invitation_id));
  actor_id:=private.assert_safety_actor(false);
  if parsed_decision not in ('accept', 'decline') then
    raise exception using errcode = 'P0001', message = 'VALIDATION_FAILED';
  end if;

  if parsed_decision = 'accept' then
    actor_id := private.assert_fan_actor();
  end if;

  select invitation.invited_by, event.host_user_id
  into inviter_id, host_id
  from public.event_invitations as invitation
  join public.events as event on event.id = invitation.event_id
  where invitation.id = input_invitation_id
    and invitation.invitee_id = actor_id;

  if not found then
    raise exception using errcode = 'P0001', message = 'NOT_FOUND';
  end if;

  perform private.lock_event_interaction_pairs(actor_id, inviter_id, host_id);

  select event.*
  into target_event
  from public.events as event
  join public.event_invitations as invitation on invitation.event_id = event.id
  where invitation.id = input_invitation_id
  for update of event;

  select invitation.*
  into target_invitation
  from public.event_invitations as invitation
  where invitation.id = input_invitation_id
    and invitation.invitee_id = actor_id
  for update;

  if not found then
    raise exception using errcode = 'P0001', message = 'NOT_FOUND';
  end if;

  if target_invitation.status <> 'pending' then
    raise exception using errcode = 'P0001', message = 'INVITE_INVALID';
  end if;

  if target_event.host_venue_id is not null and parsed_decision='accept' and not private.venue_allows_event_acquisition(target_event.id,statement_timestamp()) then
    raise exception using errcode='P0001',message='NOT_ALLOWED';
  end if;

  if target_event.status = 'cancelled' then
    raise exception using errcode = 'P0001', message = 'EVENT_CANCELLED';
  end if;

  if target_event.status <> 'published' then
    raise exception using errcode = 'P0001', message = 'NOT_ALLOWED';
  end if;

  if target_event.starts_at <= statement_timestamp() then
    raise exception using errcode = 'P0001', message = 'EVENT_STARTED';
  end if;

  if parsed_decision = 'decline' then
    update public.event_invitations as invitation
    set status = 'declined', responded_at = statement_timestamp()
    where invitation.id = target_invitation.id
    returning * into target_invitation;

    perform private.write_security_audit(
      actor_id,
      'event.invitation.respond',
      'event',
      target_event.id,
      'succeeded',
      audit_request_id,
      jsonb_build_object('decision', parsed_decision)
    );

    return query select
      target_event.id,
      target_invitation.status::text,
      null::uuid,
      null::text;
    return;
  end if;

  if private.users_are_blocked(actor_id, target_invitation.invited_by)
    or (
      target_event.host_user_id is not null
      and private.users_are_blocked(actor_id, target_event.host_user_id)
    ) then
    raise exception using errcode = 'P0001', message = 'BLOCKED_RELATIONSHIP';
  end if;

  if not private.event_user_is_audience_eligible(target_event.id, actor_id, true) then
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

  select attendance.*
  into target_attendance
  from public.event_attendance as attendance
  where attendance.event_id = target_event.id
    and attendance.user_id = actor_id
  for update;

  if found and target_attendance.status = 'approved' then
    raise exception using errcode = 'P0001', message = 'ALREADY_ATTENDING';
  elsif found then
    update public.event_attendance as attendance
    set
      status = 'approved',
      source = 'direct_invite',
      reviewed_by = target_invitation.invited_by,
      reviewed_at = statement_timestamp(),
      left_at = null,
      removed_by = null,
      removed_at = null,
      removal_reason = null
    where attendance.id = target_attendance.id
    returning * into target_attendance;
  else
    insert into public.event_attendance (
      event_id,
      user_id,
      status,
      source,
      reviewed_by,
      reviewed_at
    )
    values (
      target_event.id,
      actor_id,
      'approved',
      'direct_invite',
      target_invitation.invited_by,
      statement_timestamp()
    )
    returning * into target_attendance;
  end if;

  update public.event_invitations as invitation
  set status = 'accepted', responded_at = statement_timestamp()
  where invitation.id = target_invitation.id
  returning * into target_invitation;

  perform private.write_security_audit(
    actor_id,
    'event.invitation.respond',
    'event',
    target_event.id,
    'succeeded',
    audit_request_id,
    jsonb_build_object('decision', parsed_decision, 'attendance_status', 'approved')
  );

  return query select
    target_event.id,
    target_invitation.status::text,
    target_attendance.id,
    target_attendance.status::text;
end;
$function$;
revoke all on function public.respond_to_event_invitation(input_invitation_id uuid, input_decision text, audit_request_id uuid) from public,anon,authenticated,service_role;
grant execute on function public.respond_to_event_invitation(input_invitation_id uuid, input_decision text, audit_request_id uuid) to authenticated;
comment on function public.respond_to_event_invitation(input_invitation_id uuid, input_decision text, audit_request_id uuid) is 'VB01 entitlement enforcement; retains the existing authorization and DTO contract.';

create or replace function public.revoke_event_invitation(
  input_invitation_id uuid,
  audit_request_id uuid default null
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $function$
declare
  actor_id uuid := private.serialize_actor_transaction();
  invitee_id uuid;
  host_id uuid;
  target_event public.events%rowtype;
  target_invitation public.event_invitations%rowtype;
begin
  perform private.lock_event_venue_billing((select event_id from public.event_invitations where id=input_invitation_id));
  actor_id:=private.assert_invitation_context_actor(input_invitation_id);
  select invitation.invitee_id, event.host_user_id
  into invitee_id, host_id
  from public.event_invitations as invitation
  join public.events as event on event.id = invitation.event_id
  where invitation.id = input_invitation_id;

  if not found then
    raise exception using errcode = 'P0001', message = 'NOT_FOUND';
  end if;

  perform private.lock_event_interaction_pairs(invitee_id, actor_id, host_id);

  select event.*
  into target_event
  from public.events as event
  join public.event_invitations as invitation on invitation.event_id = event.id
  where invitation.id = input_invitation_id
  for update of event;

  select invitation.*
  into target_invitation
  from public.event_invitations as invitation
  where invitation.id = input_invitation_id
  for update;

  if not found or not private.actor_manages_event(target_event.id, actor_id) then
    raise exception using errcode = 'P0001', message = 'NOT_FOUND';
  end if;

  if target_event.host_venue_id is not null and not private.venue_allows_draft_work(target_event.host_venue_id,statement_timestamp()) then
    raise exception using errcode='P0001',message='NOT_ALLOWED';
  end if;

  if target_invitation.status <> 'pending' then
    raise exception using errcode = 'P0001', message = 'INVALID_TRANSITION';
  end if;

  update public.event_invitations as invitation
  set status = 'revoked', responded_at = statement_timestamp()
  where invitation.id = target_invitation.id;

  perform private.write_security_audit(
    actor_id,
    'event.invitation.revoke',
    'event',
    target_event.id,
    'succeeded',
    audit_request_id,
    jsonb_build_object('invitation_id', target_invitation.id)
  );

  return true;
end;
$function$;
revoke all on function public.revoke_event_invitation(input_invitation_id uuid, audit_request_id uuid) from public,anon,authenticated,service_role;
grant execute on function public.revoke_event_invitation(input_invitation_id uuid, audit_request_id uuid) to authenticated;
comment on function public.revoke_event_invitation(input_invitation_id uuid, audit_request_id uuid) is 'VB01 entitlement enforcement; retains the existing authorization and DTO contract.';

create or replace function public.review_attendance(
  input_attendance_id uuid,
  input_decision text,
  audit_request_id uuid default null
)
returns table (attendance_id uuid, status text)
language plpgsql
security definer
set search_path = ''
as $function$
#variable_conflict use_variable
declare
  actor_id uuid := private.serialize_actor_transaction();
  parsed_decision text := lower(btrim(input_decision));
  attendee_id uuid;
  host_id uuid;
  target_event public.events%rowtype;
  target_attendance public.event_attendance%rowtype;
  approved_count bigint;
begin
  perform private.lock_event_venue_billing((select event_id from public.event_attendance where id=input_attendance_id));
  actor_id:=private.assert_attendance_context_actor(input_attendance_id);
  if input_decision is null
    or parsed_decision is null
    or parsed_decision not in ('approve', 'decline') then
    raise exception using errcode = 'P0001', message = 'VALIDATION_FAILED';
  end if;

  select attendance.user_id, event.host_user_id
  into attendee_id, host_id
  from public.event_attendance as attendance
  join public.events as event on event.id = attendance.event_id
  where attendance.id = input_attendance_id;

  if not found then
    raise exception using errcode = 'P0001', message = 'NOT_FOUND';
  end if;

  perform private.lock_event_interaction_pairs(attendee_id, actor_id, host_id);

  select event.*
  into target_event
  from public.events as event
  join public.event_attendance as attendance on attendance.event_id = event.id
  where attendance.id = input_attendance_id
  for update of event;

  select attendance.*
  into target_attendance
  from public.event_attendance as attendance
  where attendance.id = input_attendance_id
  for update;

  if not found or not private.actor_manages_event(target_event.id, actor_id) then
    raise exception using errcode = 'P0001', message = 'NOT_FOUND';
  end if;

  if target_event.host_venue_id is not null and not private.venue_allows_draft_work(target_event.host_venue_id,statement_timestamp()) then
    raise exception using errcode='P0001',message='NOT_ALLOWED';
  end if;

  if target_event.status = 'cancelled' then
    raise exception using errcode = 'P0001', message = 'EVENT_CANCELLED';
  end if;

  if target_event.status <> 'published' then
    raise exception using errcode = 'P0001', message = 'NOT_ALLOWED';
  end if;

  if target_attendance.status <> 'requested' then
    raise exception using errcode = 'P0001', message = 'INVALID_TRANSITION';
  end if;

  if target_attendance.user_id = actor_id then
    raise exception using errcode = 'P0001', message = 'NOT_ALLOWED';
  end if;

  if not (
    select review_state.visible
    from private.attendance_review_state(
      target_event.id,
      target_attendance.user_id,
      actor_id
    ) as review_state
  ) then
    raise exception using errcode = 'P0001', message = 'NOT_FOUND';
  end if;

  if parsed_decision = 'approve' then
    if target_event.starts_at <= statement_timestamp() then
      raise exception using errcode = 'P0001', message = 'EVENT_STARTED';
    end if;

    if private.users_are_blocked(actor_id, target_attendance.user_id)
      or not private.event_user_is_audience_eligible(
        target_event.id,
        target_attendance.user_id,
        false
      ) then
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
  end if;

  update public.event_attendance as attendance
  set
    status = case
      when parsed_decision = 'approve' then 'approved'::public.attendance_status
      else 'declined'::public.attendance_status
    end,
    reviewed_by = actor_id,
    reviewed_at = statement_timestamp()
  where attendance.id = target_attendance.id
  returning * into target_attendance;

  perform private.write_security_audit(
    actor_id,
    'event.attendance.review',
    'event',
    target_event.id,
    'succeeded',
    audit_request_id,
    jsonb_build_object('decision', parsed_decision)
  );

  return query select target_attendance.id, target_attendance.status::text;
end;
$function$;
revoke all on function public.review_attendance(input_attendance_id uuid, input_decision text, audit_request_id uuid) from public,anon,authenticated,service_role;
grant execute on function public.review_attendance(input_attendance_id uuid, input_decision text, audit_request_id uuid) to authenticated;
comment on function public.review_attendance(input_attendance_id uuid, input_decision text, audit_request_id uuid) is 'VB01 entitlement enforcement; retains the existing authorization and DTO contract.';

create or replace function public.remove_attendee(
  input_attendance_id uuid,
  input_reason text,
  audit_request_id uuid default null
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $function$
declare
  actor_id uuid := private.serialize_actor_transaction();
  attendee_id uuid;
  host_id uuid;
  target_event public.events%rowtype;
  target_attendance public.event_attendance%rowtype;
  normalized_reason text := nullif(btrim(input_reason), '');
begin
  perform private.lock_event_venue_billing((select event_id from public.event_attendance where id=input_attendance_id));
  actor_id:=private.assert_attendance_context_actor(input_attendance_id);
  if normalized_reason is not null
    and char_length(normalized_reason) not between 3 and 500 then
    raise exception using errcode = 'P0001', message = 'VALIDATION_FAILED';
  end if;

  select attendance.user_id, event.host_user_id
  into attendee_id, host_id
  from public.event_attendance as attendance
  join public.events as event on event.id = attendance.event_id
  where attendance.id = input_attendance_id;

  if not found then
    raise exception using errcode = 'P0001', message = 'NOT_FOUND';
  end if;

  perform private.lock_event_interaction_pairs(attendee_id, actor_id, host_id);

  select event.*
  into target_event
  from public.events as event
  join public.event_attendance as attendance on attendance.event_id = event.id
  where attendance.id = input_attendance_id
  for update of event;

  select attendance.*
  into target_attendance
  from public.event_attendance as attendance
  where attendance.id = input_attendance_id
  for update;

  if not found or not private.actor_manages_event(target_event.id, actor_id) then
    raise exception using errcode = 'P0001', message = 'NOT_FOUND';
  end if;

  if target_event.host_venue_id is not null and not private.venue_allows_draft_work(target_event.host_venue_id,statement_timestamp()) then
    raise exception using errcode='P0001',message='NOT_ALLOWED';
  end if;

  if target_event.status = 'cancelled' then
    raise exception using errcode = 'P0001', message = 'EVENT_CANCELLED';
  end if;

  if target_event.status = 'completed'
    or target_event.ends_at <= statement_timestamp() then
    raise exception using errcode = 'P0001', message = 'INVALID_TRANSITION';
  end if;

  if target_attendance.status <> 'approved' then
    raise exception using errcode = 'P0001', message = 'INVALID_TRANSITION';
  end if;

  update public.event_attendance as attendance
  set
    status = 'removed',
    left_at = null,
    removed_by = actor_id,
    removed_at = statement_timestamp(),
    removal_reason = normalized_reason
  where attendance.id = target_attendance.id;

  perform private.write_security_audit(
    actor_id,
    'event.attendance.remove',
    'event',
    target_event.id,
    'succeeded',
    audit_request_id,
    jsonb_build_object('reason_supplied', normalized_reason is not null)
  );

  return true;
end;
$function$;
revoke all on function public.remove_attendee(input_attendance_id uuid, input_reason text, audit_request_id uuid) from public,anon,authenticated,service_role;
grant execute on function public.remove_attendee(input_attendance_id uuid, input_reason text, audit_request_id uuid) to authenticated;
comment on function public.remove_attendee(input_attendance_id uuid, input_reason text, audit_request_id uuid) is 'VB01 entitlement enforcement; retains the existing authorization and DTO contract.';

create or replace function public.cancel_event(
  input_event_id uuid,
  input_reason text,
  audit_request_id uuid default null
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $function$
declare
  actor_id uuid := private.serialize_actor_transaction();
  normalized_reason text := btrim(input_reason);
  target_event public.events%rowtype;
begin
  perform private.lock_event_venue_billing(input_event_id);
  actor_id:=private.assert_event_context_actor(input_event_id);
  if char_length(normalized_reason) not between 3 and 500 then
    raise exception using errcode = 'P0001', message = 'VALIDATION_FAILED';
  end if;

  select event.*
  into target_event
  from public.events as event
  where event.id = input_event_id
  for update;

  if not found or not private.actor_manages_event(target_event.id, actor_id) then
    raise exception using errcode = 'P0001', message = 'NOT_FOUND';
  end if;

  if target_event.host_venue_id is not null and not private.venue_allows_draft_work(target_event.host_venue_id,statement_timestamp()) then
    raise exception using errcode='P0001',message='NOT_ALLOWED';
  end if;

  if target_event.status = 'cancelled' then
    raise exception using errcode = 'P0001', message = 'EVENT_CANCELLED';
  end if;

  if target_event.status = 'completed' then
    raise exception using errcode = 'P0001', message = 'INVALID_TRANSITION';
  end if;

  if target_event.ends_at <= statement_timestamp() then
    raise exception using errcode = 'P0001', message = 'INVALID_TRANSITION';
  end if;

  update public.events as event
  set
    status = 'cancelled',
    cancelled_at = statement_timestamp(),
    cancel_reason = normalized_reason
  where event.id = target_event.id;

  perform private.write_security_audit(
    actor_id,
    'event.cancel',
    'event',
    target_event.id,
    'succeeded',
    audit_request_id,
    '{}'::jsonb
  );

  return true;
end;
$function$;
revoke all on function public.cancel_event(input_event_id uuid, input_reason text, audit_request_id uuid) from public,anon,authenticated,service_role;
grant execute on function public.cancel_event(input_event_id uuid, input_reason text, audit_request_id uuid) to authenticated;
comment on function public.cancel_event(input_event_id uuid, input_reason text, audit_request_id uuid) is 'VB01 entitlement enforcement; retains the existing authorization and DTO contract.';

create or replace function private.attendance_review_state(
  input_event_id uuid,
  input_requester_id uuid,
  input_actor_id uuid
)
returns table (
  visible boolean,
  can_approve boolean,
  review_reason text
)
language plpgsql
security definer
stable
set search_path = ''
as $function$
declare
  target_event public.events%rowtype;
  approved_count bigint;
  audience_eligible boolean;
begin
  select event.*
  into target_event
  from public.events as event
  where event.id = input_event_id;

  if not found
    or input_requester_id is null
    or input_actor_id is null
    or input_requester_id = input_actor_id
    or target_event.status <> 'published'
    or (target_event.host_venue_id is not null and not private.venue_allows_draft_work(target_event.host_venue_id,statement_timestamp()))
    or target_event.ends_at <= statement_timestamp()
    or not private.actor_manages_event(target_event.id, input_actor_id)
    or not private.profile_is_fan_eligible(input_requester_id)
    or private.users_are_blocked(input_actor_id, input_requester_id)
    or (
      target_event.host_user_id is not null
      and private.users_are_blocked(target_event.host_user_id, input_requester_id)
    )
    or exists (
      select 1
      from public.group_bans as ban
      where ban.group_id in (
          target_event.organizing_group_id,
          target_event.audience_group_id
        )
        and ban.user_id = input_requester_id
        and ban.revoked_at is null
    )
    or exists (
      select 1
      from public.groups as governing_group
      where governing_group.id in (
          target_event.organizing_group_id,
          target_event.audience_group_id
        )
        and (
          governing_group.lifecycle not in ('forming', 'active')
          or governing_group.suspended_at is not null
        )
    ) then
    return query select false, false, null::text;
    return;
  end if;

  audience_eligible := private.event_user_is_audience_eligible(
    target_event.id,
    input_requester_id,
    false
  );
  select count(*)
  into approved_count
  from public.event_attendance as attendance
  where attendance.event_id = target_event.id
    and attendance.status = 'approved';

  if target_event.starts_at <= statement_timestamp() then
    return query select true, false, 'The event has started. Only decline remains.'::text;
  elsif not audience_eligible then
    return query select true, false,
      'The requester is no longer eligible for this audience. Only decline remains.'::text;
  elsif approved_count >= target_event.capacity then
    return query select true, false, 'The event is full. Only decline remains.'::text;
  else
    return query select true, true, null::text;
  end if;
end;
$function$;
revoke all on function private.attendance_review_state(input_event_id uuid, input_requester_id uuid, input_actor_id uuid) from public,anon,authenticated,service_role;
comment on function private.attendance_review_state(input_event_id uuid, input_requester_id uuid, input_actor_id uuid) is 'VB01 entitlement enforcement; retains the existing authorization and DTO contract.';

create or replace function private.create_or_update_event_core(
  input_event_id uuid,
  input_host_venue_id uuid,
  input_organizing_group_id uuid,
  input_match_id uuid,
  input_title text,
  input_description text,
  input_expected_activity text,
  input_cost_description text,
  input_event_rules text,
  input_commercial_affiliation text,
  input_host_presence_confirmed boolean,
  input_starts_at timestamptz,
  input_ends_at timestamptz,
  input_place_kind text,
  input_venue_id uuid,
  input_public_place_name text,
  input_public_address_text text,
  input_public_longitude double precision,
  input_public_latitude double precision,
  input_audience text,
  input_audience_team_id uuid,
  input_audience_group_id uuid,
  input_capacity integer,
  input_requires_approval boolean,
  input_private_address_text text,
  input_private_directions text,
  input_private_longitude double precision,
  input_private_latitude double precision,
  input_intent text,
  audit_request_id uuid default null
)
returns table (event_id uuid, status text)
language plpgsql
security definer
set search_path = ''
as $function$
#variable_conflict use_variable
declare
  actor_id uuid := private.serialize_actor_transaction();
  parsed_place public.event_place_kind;
  parsed_audience public.event_audience;
  target_status public.event_status;
  target_event public.events%rowtype;
  host_venue public.venues%rowtype;
  resolved_host_user_id uuid;
  resolved_organizing_group_id uuid := input_organizing_group_id;
  public_point extensions.geography(Point, 4326);
  private_point extensions.geography(Point, 4326);
  is_create boolean := input_event_id is null;
begin
  perform private.lock_event_venue_billing(input_event_id,input_host_venue_id);
  if input_host_venue_id is not null and not private.venue_allows_draft_work(input_host_venue_id,statement_timestamp()) then
    raise exception using errcode='P0001',message='NOT_ALLOWED';
  end if;
  if input_host_venue_id is null then
    actor_id := private.assert_fan_actor();
  else
    actor_id := private.assert_common_actor();
  end if;

  begin
    parsed_place := input_place_kind::public.event_place_kind;
    parsed_audience := input_audience::public.event_audience;
  exception when invalid_text_representation then
    raise exception using errcode = 'P0001', message = 'VALIDATION_FAILED';
  end;

  if input_intent is null
    or input_intent not in ('draft', 'publish')
    or input_host_presence_confirmed is distinct from true
    or input_starts_at is null
    or input_ends_at is null
    or input_match_id is null
    or input_capacity is null
    or input_requires_approval is null
    or input_starts_at <= statement_timestamp()
    or input_ends_at <= input_starts_at then
    raise exception using errcode = 'P0001', message = 'VALIDATION_FAILED';
  end if;

  perform 1
  from public.matches as match
  where match.id = input_match_id
    and match.starts_at > statement_timestamp()
    and match.status in ('scheduled', 'timed', 'postponed')
  for share;
  if not found then
    raise exception using errcode = 'P0001', message = 'NOT_FOUND';
  end if;

  if parsed_place = 'public_place' then
    if input_public_longitude is null
      or input_public_latitude is null
      or input_public_longitude not between 34 and 36
      or input_public_latitude not between 29 and 34
      or nullif(btrim(input_public_place_name), '') is null
      or nullif(btrim(input_public_address_text), '') is null then
      raise exception using errcode = 'P0001', message = 'VALIDATION_FAILED';
    end if;
    public_point := extensions.st_setsrid(
      extensions.st_makepoint(input_public_longitude, input_public_latitude),
      4326
    )::extensions.geography;
  elsif input_public_place_name is not null
    or input_public_address_text is not null
    or input_public_longitude is not null
    or input_public_latitude is not null then
    raise exception using errcode = 'P0001', message = 'VALIDATION_FAILED';
  end if;

  if parsed_place = 'home' then
    if input_private_longitude is null
      or input_private_latitude is null
      or input_private_longitude not between 34 and 36
      or input_private_latitude not between 29 and 34
      or nullif(btrim(input_private_address_text), '') is null then
      raise exception using errcode = 'P0001', message = 'VALIDATION_FAILED';
    end if;
    private_point := extensions.st_setsrid(
      extensions.st_makepoint(input_private_longitude, input_private_latitude),
      4326
    )::extensions.geography;
  elsif input_private_address_text is not null
    or input_private_directions is not null
    or input_private_longitude is not null
    or input_private_latitude is not null then
    raise exception using errcode = 'P0001', message = 'VALIDATION_FAILED';
  end if;

  if input_host_venue_id is null then
    resolved_host_user_id := actor_id;
    if parsed_place not in ('home', 'public_place')
      or input_venue_id is not null
      or parsed_audience not in ('group', 'friends', 'invite_only')
      or not input_requires_approval then
      raise exception using errcode = 'P0001', message = 'NOT_ALLOWED';
    end if;
    if parsed_place = 'home' and input_capacity not between 1 and 12 then
      raise exception using errcode = 'P0001', message = 'VALIDATION_FAILED';
    end if;

    if parsed_audience = 'group' then
      if input_audience_group_id is null or (
        input_organizing_group_id is not null
        and input_organizing_group_id <> input_audience_group_id
      ) then
        raise exception using errcode = 'P0001', message = 'NOT_ALLOWED';
      end if;
      perform 1
      from public.group_memberships as membership
      join public.groups as supporter_group on supporter_group.id = membership.group_id
      where membership.group_id = input_audience_group_id
        and membership.user_id = actor_id
        and membership.status = 'active'
        and supporter_group.lifecycle = 'active'
        and supporter_group.suspended_at is null
        and not exists (
          select 1 from public.group_bans as ban
          where ban.group_id = membership.group_id
            and ban.user_id = membership.user_id
            and ban.revoked_at is null
        )
      for share of membership, supporter_group;
      if not found then
        raise exception using errcode = 'P0001', message = 'NOT_ALLOWED';
      end if;
      resolved_organizing_group_id := input_audience_group_id;
    elsif parsed_audience = 'friends' then
      if input_audience_group_id is not null
        or input_organizing_group_id is not null
        or not exists (
          select 1 from public.friendships as friendship
          where friendship.status = 'accepted'
            and actor_id in (friendship.user_low_id, friendship.user_high_id)
            and not private.users_are_blocked(
              actor_id,
              case
                when friendship.user_low_id = actor_id then friendship.user_high_id
                else friendship.user_low_id
              end
            )
        ) then
        raise exception using errcode = 'P0001', message = 'NOT_ALLOWED';
      end if;
    elsif input_audience_group_id is not null or input_organizing_group_id is not null then
      raise exception using errcode = 'P0001', message = 'NOT_ALLOWED';
    end if;

    if input_audience_team_id is not null then
      raise exception using errcode = 'P0001', message = 'NOT_ALLOWED';
    end if;

    target_status := case
      when input_intent = 'draft' then 'draft'::public.event_status
      when resolved_organizing_group_id is not null
        then 'pending_group_review'::public.event_status
      else 'published'::public.event_status
    end;
  else
    select venue.*
    into host_venue
    from public.venues as venue
    where venue.id = input_host_venue_id
    for share;

    if not found
      or not private.actor_manages_venue(actor_id, input_host_venue_id)
      or host_venue.verification_status = 'suspended'
      or host_venue.suspended_at is not null
      or parsed_place <> 'venue'
      or input_venue_id is distinct from input_host_venue_id
      or parsed_audience not in ('public', 'team_followers')
      or input_organizing_group_id is not null
      or input_audience_group_id is not null then
      raise exception using errcode = 'P0001', message = 'NOT_ALLOWED';
    end if;
    if parsed_audience = 'team_followers' then
      if input_audience_team_id is null or not exists (
        select 1 from public.teams as team
        where team.id = input_audience_team_id and team.active
      ) then
        raise exception using errcode = 'P0001', message = 'VALIDATION_FAILED';
      end if;
    elsif input_audience_team_id is not null then
      raise exception using errcode = 'P0001', message = 'VALIDATION_FAILED';
    end if;
    target_status := case
      when input_intent = 'draft' then 'draft'::public.event_status
      else 'published'::public.event_status
    end;
  end if;

  if is_create then
    if input_host_venue_id is not null and target_status='published'
      and not private.venue_allows_publishing(input_host_venue_id,input_starts_at,statement_timestamp()) then raise exception using errcode='P0001',message='NOT_ALLOWED'; end if;
    perform pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended('huddle:event-create:' || actor_id::text, 0)
    );
    if exists (
      select 1
      from public.security_audit_events as recent_event
      where recent_event.actor_id = actor_id
        and recent_event.action = 'event.create'
        and recent_event.created_at > statement_timestamp() - interval '10 seconds'
    ) then
      raise exception using errcode = 'P0001', message = 'RATE_LIMITED';
    end if;

    insert into public.events (
      created_by, host_user_id, host_venue_id, organizing_group_id,
      match_id, title, description, expected_activity, cost_description,
      event_rules, commercial_affiliation, host_presence_confirmed_at,
      starts_at, ends_at, place_kind, venue_id, public_place_name,
      public_address_text, public_location, audience, audience_team_id,
      audience_group_id, capacity, requires_approval, status, published_at
    ) values (
      actor_id, resolved_host_user_id, input_host_venue_id,
      resolved_organizing_group_id, input_match_id, btrim(input_title),
      btrim(input_description), btrim(input_expected_activity),
      btrim(input_cost_description), btrim(input_event_rules),
      btrim(input_commercial_affiliation), statement_timestamp(),
      input_starts_at, input_ends_at, parsed_place, input_venue_id,
      case when parsed_place = 'public_place' then btrim(input_public_place_name) end,
      case when parsed_place = 'public_place' then btrim(input_public_address_text) end,
      public_point, parsed_audience, input_audience_team_id,
      input_audience_group_id, input_capacity, input_requires_approval,
      target_status,
      case when target_status = 'published' then statement_timestamp() end
    ) returning * into target_event;
  else
    select event.*
    into target_event
    from public.events as event
    where event.id = input_event_id
    for update;

    if not found
      or target_event.status in ('cancelled', 'completed')
      or (
        target_event.host_user_id <> actor_id
        and not private.actor_owns_venue(target_event.host_venue_id, actor_id)
      )
      or target_event.host_user_id is distinct from resolved_host_user_id
      or target_event.host_venue_id is distinct from input_host_venue_id then
      raise exception using errcode = 'P0001', message = 'NOT_ALLOWED';
    end if;
    if target_event.status = 'published' and target_status <> 'published' then
      raise exception using errcode = 'P0001', message = 'INVALID_TRANSITION';
    end if;

    if input_host_venue_id is not null and target_status='published'
      and not private.venue_allows_publishing(input_host_venue_id,input_starts_at,statement_timestamp())
      and not (target_event.status='published' and private.venue_billing_effective_state(input_host_venue_id,statement_timestamp()) in ('past_due','provider_stale','legacy_grace'))
      then raise exception using errcode='P0001',message='NOT_ALLOWED'; end if;

    update public.events as event
    set organizing_group_id = resolved_organizing_group_id,
        match_id = input_match_id,
        title = btrim(input_title),
        description = btrim(input_description),
        expected_activity = btrim(input_expected_activity),
        cost_description = btrim(input_cost_description),
        event_rules = btrim(input_event_rules),
        commercial_affiliation = btrim(input_commercial_affiliation),
        host_presence_confirmed_at = statement_timestamp(),
        starts_at = input_starts_at,
        ends_at = input_ends_at,
        place_kind = parsed_place,
        venue_id = input_venue_id,
        public_place_name = case
          when parsed_place = 'public_place' then btrim(input_public_place_name)
        end,
        public_address_text = case
          when parsed_place = 'public_place' then btrim(input_public_address_text)
        end,
        public_location = public_point,
        audience = parsed_audience,
        audience_team_id = input_audience_team_id,
        audience_group_id = input_audience_group_id,
        capacity = input_capacity,
        requires_approval = input_requires_approval,
        status = target_status,
        published_at = case
          when event.published_at is not null then event.published_at
          when target_status = 'published' then statement_timestamp()
        end
    where event.id = input_event_id
    returning * into target_event;
  end if;

  if parsed_place = 'home' then
    insert into public.event_private_locations (event_id, address_text, directions, location)
    values (
      target_event.id,
      btrim(input_private_address_text),
      nullif(btrim(input_private_directions), ''),
      private_point
    )
    on conflict on constraint event_private_locations_pkey do update
    set address_text = excluded.address_text,
        directions = excluded.directions,
        location = excluded.location;
  else
    delete from public.event_private_locations as private_location
    where private_location.event_id = target_event.id;
  end if;

  perform private.write_security_audit(
    actor_id,
    case when is_create then 'event.create' else 'event.update' end,
    'event',
    target_event.id,
    'succeeded',
    audit_request_id,
    jsonb_build_object(
      'status', target_event.status::text,
      'audience', target_event.audience::text,
      'place_kind', target_event.place_kind::text
    )
  );

  return query select target_event.id, target_event.status::text;
end;
$function$;
revoke all on function private.create_or_update_event_core(input_event_id uuid, input_host_venue_id uuid, input_organizing_group_id uuid, input_match_id uuid, input_title text, input_description text, input_expected_activity text, input_cost_description text, input_event_rules text, input_commercial_affiliation text, input_host_presence_confirmed boolean, input_starts_at timestamp with time zone, input_ends_at timestamp with time zone, input_place_kind text, input_venue_id uuid, input_public_place_name text, input_public_address_text text, input_public_longitude double precision, input_public_latitude double precision, input_audience text, input_audience_team_id uuid, input_audience_group_id uuid, input_capacity integer, input_requires_approval boolean, input_private_address_text text, input_private_directions text, input_private_longitude double precision, input_private_latitude double precision, input_intent text, audit_request_id uuid) from public,anon,authenticated,service_role;
comment on function private.create_or_update_event_core(input_event_id uuid, input_host_venue_id uuid, input_organizing_group_id uuid, input_match_id uuid, input_title text, input_description text, input_expected_activity text, input_cost_description text, input_event_rules text, input_commercial_affiliation text, input_host_presence_confirmed boolean, input_starts_at timestamp with time zone, input_ends_at timestamp with time zone, input_place_kind text, input_venue_id uuid, input_public_place_name text, input_public_address_text text, input_public_longitude double precision, input_public_latitude double precision, input_audience text, input_audience_team_id uuid, input_audience_group_id uuid, input_capacity integer, input_requires_approval boolean, input_private_address_text text, input_private_directions text, input_private_longitude double precision, input_private_latitude double precision, input_intent text, audit_request_id uuid) is 'VB01 entitlement enforcement; retains the existing authorization and DTO contract.';

create or replace function public.create_or_update_event(
  input_event_id uuid,
  input_host_venue_id uuid,
  input_organizing_group_id uuid,
  input_match_id uuid,
  input_title text,
  input_description text,
  input_expected_activity text,
  input_cost_description text,
  input_event_rules text,
  input_commercial_affiliation text,
  input_host_presence_confirmed boolean,
  input_starts_at timestamptz,
  input_ends_at timestamptz,
  input_place_kind text,
  input_venue_id uuid,
  input_public_place_name text,
  input_public_address_text text,
  input_public_longitude double precision,
  input_public_latitude double precision,
  input_audience text,
  input_audience_team_id uuid,
  input_audience_group_id uuid,
  input_capacity integer,
  input_requires_approval boolean,
  input_private_address_text text,
  input_private_directions text,
  input_private_longitude double precision,
  input_private_latitude double precision,
  input_intent text,
  audit_request_id uuid default null
)
returns table (event_id uuid, status text)
language plpgsql
security definer
set search_path = ''
as $function$
#variable_conflict use_variable
declare
  actor_id uuid;
  organizer_role public.group_role;
  audience_role public.group_role;
  governing_group_id uuid;
  governing_role public.group_role;
  existing_organizing_group_id uuid;
  locked_group_id uuid;
  locked_role public.group_role;
  group_ids uuid[];
  created_event_id uuid;
  core_status text;
  final_status public.event_status;
  group_governed boolean := false;
begin
  perform private.serialize_actor_transaction();
  perform private.lock_event_venue_billing(input_event_id,input_host_venue_id);
  if input_intent is null or input_intent not in ('draft', 'publish') then
    raise exception using errcode = 'P0001', message = 'VALIDATION_FAILED';
  end if;

  group_governed := input_host_venue_id is null
    and (input_organizing_group_id is not null or input_audience = 'group');

  if input_event_id is not null then
    actor_id := private.assert_actor(false);
    select event.organizing_group_id
    into existing_organizing_group_id
    from public.events as event
    where event.id = input_event_id;
    if group_governed or existing_organizing_group_id is not null then
      raise exception using errcode = 'P0001', message = 'NOT_ALLOWED';
    end if;
  end if;

  if group_governed then
    actor_id := private.assert_fan_actor();
    if input_audience = 'group' and input_audience_group_id is null then
      raise exception using errcode = 'P0001', message = 'NOT_ALLOWED';
    end if;

    group_ids := array(
      select candidate.group_id
      from unnest(array[
        input_organizing_group_id,
        case when input_audience = 'group' then input_audience_group_id end
      ]) as candidate(group_id)
      where candidate.group_id is not null
      group by candidate.group_id
      order by candidate.group_id
    );

    foreach locked_group_id in array group_ids loop
      locked_role := private.lock_active_group_author_role(locked_group_id, actor_id);
      if locked_group_id = input_organizing_group_id then
        organizer_role := locked_role;
      end if;
      if input_audience = 'group' and locked_group_id = input_audience_group_id then
        audience_role := locked_role;
      end if;
    end loop;

    governing_group_id := coalesce(
      input_organizing_group_id,
      case when input_audience = 'group' then input_audience_group_id end
    );
    governing_role := case
      when input_organizing_group_id is not null then organizer_role
      else audience_role
    end;
  end if;

  select created.event_id, created.status
  into created_event_id, core_status
  from private.create_or_update_event_core(
    input_event_id,
    input_host_venue_id,
    case when group_governed then null else input_organizing_group_id end,
    input_match_id,
    input_title,
    input_description,
    input_expected_activity,
    input_cost_description,
    input_event_rules,
    input_commercial_affiliation,
    input_host_presence_confirmed,
    input_starts_at,
    input_ends_at,
    input_place_kind,
    input_venue_id,
    input_public_place_name,
    input_public_address_text,
    input_public_longitude,
    input_public_latitude,
    input_audience,
    input_audience_team_id,
    input_audience_group_id,
    input_capacity,
    input_requires_approval,
    input_private_address_text,
    input_private_directions,
    input_private_longitude,
    input_private_latitude,
    case when group_governed then 'draft' else input_intent end,
    audit_request_id
  ) as created;

  if not group_governed then
    return query select created_event_id, core_status;
    return;
  end if;

  final_status := case
    when input_intent = 'draft' then 'draft'::public.event_status
    when governing_role in ('owner', 'admin') then 'published'::public.event_status
    else 'pending_group_review'::public.event_status
  end;

  update public.events as event
  set organizing_group_id = governing_group_id,
      status = final_status,
      published_at = case
        when final_status = 'published' then coalesce(event.published_at, statement_timestamp())
      end,
      cancelled_at = null,
      cancel_reason = null
  where event.id = created_event_id;

  perform private.write_security_audit(
    actor_id,
    case
      when input_intent = 'draft' then 'event.group_draft'
      when final_status = 'published' then 'event.group_publish.author'
      else 'event.group_submit'
    end,
    'event',
    created_event_id,
    'succeeded',
    audit_request_id,
    jsonb_build_object(
      'organizing_group_id', governing_group_id,
      'audience_group_id', input_audience_group_id,
      'audience', input_audience,
      'author_role', governing_role::text,
      'status', final_status::text
    )
  );

  return query select created_event_id, final_status::text;
end;
$function$;
revoke all on function public.create_or_update_event(input_event_id uuid, input_host_venue_id uuid, input_organizing_group_id uuid, input_match_id uuid, input_title text, input_description text, input_expected_activity text, input_cost_description text, input_event_rules text, input_commercial_affiliation text, input_host_presence_confirmed boolean, input_starts_at timestamp with time zone, input_ends_at timestamp with time zone, input_place_kind text, input_venue_id uuid, input_public_place_name text, input_public_address_text text, input_public_longitude double precision, input_public_latitude double precision, input_audience text, input_audience_team_id uuid, input_audience_group_id uuid, input_capacity integer, input_requires_approval boolean, input_private_address_text text, input_private_directions text, input_private_longitude double precision, input_private_latitude double precision, input_intent text, audit_request_id uuid) from public,anon,authenticated,service_role;
grant execute on function public.create_or_update_event(input_event_id uuid, input_host_venue_id uuid, input_organizing_group_id uuid, input_match_id uuid, input_title text, input_description text, input_expected_activity text, input_cost_description text, input_event_rules text, input_commercial_affiliation text, input_host_presence_confirmed boolean, input_starts_at timestamp with time zone, input_ends_at timestamp with time zone, input_place_kind text, input_venue_id uuid, input_public_place_name text, input_public_address_text text, input_public_longitude double precision, input_public_latitude double precision, input_audience text, input_audience_team_id uuid, input_audience_group_id uuid, input_capacity integer, input_requires_approval boolean, input_private_address_text text, input_private_directions text, input_private_longitude double precision, input_private_latitude double precision, input_intent text, audit_request_id uuid) to authenticated;
comment on function public.create_or_update_event(input_event_id uuid, input_host_venue_id uuid, input_organizing_group_id uuid, input_match_id uuid, input_title text, input_description text, input_expected_activity text, input_cost_description text, input_event_rules text, input_commercial_affiliation text, input_host_presence_confirmed boolean, input_starts_at timestamp with time zone, input_ends_at timestamp with time zone, input_place_kind text, input_venue_id uuid, input_public_place_name text, input_public_address_text text, input_public_longitude double precision, input_public_latitude double precision, input_audience text, input_audience_team_id uuid, input_audience_group_id uuid, input_capacity integer, input_requires_approval boolean, input_private_address_text text, input_private_directions text, input_private_longitude double precision, input_private_latitude double precision, input_intent text, audit_request_id uuid) is 'VB01 entitlement enforcement; retains the existing authorization and DTO contract.';

create or replace function public.plan_venue_events(
  input_items jsonb,
  input_intent text,
  audit_request_id uuid default null
)
returns table (event_id uuid, status text)
language plpgsql
security definer
volatile
set search_path = ''
as $function$
#variable_conflict use_variable
declare
  actor_id uuid := private.serialize_actor_transaction();
  item jsonb;
  item_index bigint;
  target_match_id uuid;
  target_space_id uuid;
  target_venue_id uuid;
  batch_venue_id uuid;
  requested_attendance_mode public.event_attendance_mode;
  requested_title text;
  requested_description text;
  requested_capacity integer;
  requested_requires_approval boolean;
  resolved_attendance_mode public.event_attendance_mode;
  resolved_title text;
  resolved_description text;
  resolved_capacity integer;
  resolved_requires_approval boolean;
  selected_space public.venue_spaces%rowtype;
  selected_venue public.venues%rowtype;
  selected_match public.matches%rowtype;
  home_team_name text;
  away_team_name text;
  created_event public.events%rowtype;
  final_status public.event_status;
  planned_match_ids uuid[] := '{}';
begin
  if input_intent is null or input_intent not in ('draft', 'publish')
    or input_items is null or jsonb_typeof(input_items) <> 'array'
    or jsonb_array_length(input_items) not between 1 and 20 then
    raise exception using errcode = 'P0001', message = 'VALIDATION_FAILED';
  end if;
  final_status := case when input_intent = 'publish'
    then 'published'::public.event_status else 'draft'::public.event_status end;

  for item, item_index in
    select value, ordinality
    from jsonb_array_elements(input_items) with ordinality as planned(value, ordinality)
    order by ordinality
  loop
    if jsonb_typeof(item) <> 'object'
      or exists (
        select 1 from jsonb_object_keys(item) as supplied(key)
        where supplied.key <> all (array[
          'matchId', 'venueSpaceId', 'attendanceMode', 'title', 'description',
          'capacity', 'requiresApproval'
        ])
      )
      or not (item ? 'matchId') or not (item ? 'venueSpaceId')
      or (
        item ? 'attendanceMode'
        and jsonb_typeof(item -> 'attendanceMode') not in ('string', 'null')
      )
      or (item ? 'title' and jsonb_typeof(item -> 'title') not in ('string', 'null'))
      or (item ? 'description' and jsonb_typeof(item -> 'description') not in ('string', 'null'))
      or (item ? 'capacity' and jsonb_typeof(item -> 'capacity') not in ('number', 'null'))
      or (
        item ? 'requiresApproval'
        and jsonb_typeof(item -> 'requiresApproval') not in ('boolean', 'null')
      ) then
      raise exception using errcode = 'P0001', message = 'VALIDATION_FAILED';
    end if;

    begin
      target_match_id := nullif(item ->> 'matchId', '')::uuid;
      target_space_id := nullif(item ->> 'venueSpaceId', '')::uuid;
      requested_attendance_mode := nullif(item ->> 'attendanceMode', '')::public.event_attendance_mode;
      requested_title := nullif(btrim(item ->> 'title'), '');
      requested_description := nullif(btrim(item ->> 'description'), '');
      requested_capacity := nullif(item ->> 'capacity', '')::integer;
      requested_requires_approval := nullif(item ->> 'requiresApproval', '')::boolean;
    exception when invalid_text_representation or numeric_value_out_of_range then
      raise exception using errcode = 'P0001', message = 'VALIDATION_FAILED';
    end;
    if target_match_id is null or target_space_id is null
      or target_match_id = any(planned_match_ids) then
      raise exception using errcode = 'P0001', message = 'VALIDATION_FAILED';
    end if;
    planned_match_ids := array_append(planned_match_ids, target_match_id);

    select space.venue_id into target_venue_id
    from public.venue_spaces as space where space.id = target_space_id;
    if target_venue_id is null then
      raise exception using errcode = 'P0001', message = 'NOT_FOUND';
    end if;

    if batch_venue_id is null then
      batch_venue_id := target_venue_id;
      perform private.lock_venue_billing(batch_venue_id);
      actor_id:=private.assert_common_actor();
      if not private.venue_allows_draft_work(batch_venue_id,statement_timestamp()) then
        raise exception using errcode='P0001',message='NOT_ALLOWED';
      end if;
      if not private.actor_manages_venue(actor_id, batch_venue_id) then
        raise exception using errcode = 'P0001', message = 'NOT_ALLOWED';
      end if;
      perform pg_catalog.pg_advisory_xact_lock(
        pg_catalog.hashtextextended('huddle:venue-plan:' || batch_venue_id::text, 0)
      );
    elsif target_venue_id <> batch_venue_id then
      raise exception using errcode = 'P0001', message = 'VALIDATION_FAILED';
    end if;

    select space.* into selected_space
    from public.venue_spaces as space
    where space.id = target_space_id and space.venue_id = batch_venue_id
    for share;
    select venue.* into selected_venue
    from public.venues as venue where venue.id = batch_venue_id
    for share;
    if not found or selected_venue.verification_status = 'suspended'
      or selected_venue.suspended_at is not null or selected_venue.archived_at is not null then
      raise exception using errcode = 'P0001', message = 'NOT_ALLOWED';
    end if;
    if selected_space.id is null or not selected_space.active then
      raise exception using errcode = 'P0001', message = 'VENUE_DEFAULTS_INCOMPLETE';
    end if;

    resolved_attendance_mode := coalesce(
      requested_attendance_mode, selected_venue.default_attendance_mode
    );
    if resolved_attendance_mode = 'reservations' and selected_space.capacity is null then
      raise exception using errcode = 'P0001', message = 'VENUE_DEFAULTS_INCOMPLETE';
    end if;
    if resolved_attendance_mode = 'open_door'
      and (requested_capacity is not null or requested_requires_approval is true) then
      raise exception using errcode = 'P0001', message = 'VALIDATION_FAILED';
    end if;

    select match.* into selected_match
    from public.matches as match
    join public.competitions as competition on competition.id = match.competition_id
    join public.sports as sport on sport.id = competition.sport_id
    join public.teams as home_team on home_team.id = match.home_team_id
    join public.teams as away_team on away_team.id = match.away_team_id
    where match.id = target_match_id
      and match.starts_at > statement_timestamp()
      and match.status in ('scheduled', 'timed', 'postponed')
      and competition.active and sport.active and home_team.active and away_team.active
    for share of match;
    if not found then raise exception using errcode = 'P0001', message = 'NOT_FOUND'; end if;

    if final_status='published' and not private.venue_allows_publishing(batch_venue_id,selected_match.starts_at,statement_timestamp()) then
      raise exception using errcode='P0001',message='NOT_ALLOWED';
    end if;
    select home_team.name, away_team.name into strict home_team_name, away_team_name
    from public.teams as home_team, public.teams as away_team
    where home_team.id = selected_match.home_team_id
      and away_team.id = selected_match.away_team_id;
    resolved_title := coalesce(
      requested_title,
      btrim(left(home_team_name || ' vs ' || away_team_name || ' at ' || selected_venue.name, 120))
    );
    resolved_description := coalesce(requested_description, selected_venue.description);
    if resolved_attendance_mode = 'open_door' then
      resolved_capacity := null;
      resolved_requires_approval := false;
    else
      resolved_capacity := coalesce(requested_capacity, selected_space.capacity);
      resolved_requires_approval := coalesce(
        requested_requires_approval, selected_venue.default_requires_approval
      );
    end if;
    if char_length(resolved_title) not between 3 and 120
      or char_length(resolved_description) not between 10 and 2000
      or (
        resolved_attendance_mode = 'reservations'
        and (
          resolved_capacity is null or resolved_capacity not between 1 and selected_space.capacity
        )
      ) then
      raise exception using errcode = 'P0001', message = 'VALIDATION_FAILED';
    end if;

    if exists (
      select 1 from public.events as event
      where event.host_venue_id = selected_venue.id
        and event.status not in ('cancelled', 'completed')
        and (
          event.match_id = selected_match.id
          or (
            event.venue_space_id = selected_space.id
            and event.starts_at < selected_match.starts_at + interval '3 hours'
            and event.ends_at > selected_match.starts_at
          )
        )
    ) then
      if exists (
        select 1 from public.events as event
        where event.host_venue_id = selected_venue.id
          and event.match_id = selected_match.id
          and event.status not in ('cancelled', 'completed')
      ) then
        raise exception using errcode = 'P0001', message = 'MATCH_ALREADY_PLANNED';
      end if;
      raise exception using errcode = 'P0001', message = 'VENUE_SPACE_OVERLAP';
    end if;

    insert into public.events (
      created_by, host_venue_id, match_id, title, description, expected_activity,
      cost_description, event_rules, commercial_affiliation, host_presence_confirmed_at,
      starts_at, ends_at, place_kind, venue_id, venue_space_id, audience,
      attendance_mode, capacity, requires_approval, status, published_at
    ) values (
      actor_id, selected_venue.id, selected_match.id, resolved_title, resolved_description,
      case when char_length(btrim(selected_venue.house_information)) >= 3
        then btrim(left(selected_venue.house_information, 500))
        else 'Watch the full match together' end,
      'Ask venue staff about current food, drink, and entry costs.',
      'Respect venue staff, other supporters, and every attendee.',
      'Hosted commercially by ' || selected_venue.name,
      statement_timestamp(), selected_match.starts_at,
      selected_match.starts_at + interval '3 hours', 'venue', selected_venue.id,
      selected_space.id, 'public', resolved_attendance_mode, resolved_capacity,
      resolved_requires_approval, final_status,
      case when final_status = 'published' then statement_timestamp() end
    ) returning * into created_event;

    perform private.write_security_audit(
      actor_id, 'venue.event.plan', 'event', created_event.id, 'succeeded', audit_request_id,
      jsonb_build_object(
        'venue_id', selected_venue.id, 'venue_space_id', selected_space.id,
        'match_id', selected_match.id, 'status', created_event.status::text,
        'attendance_mode', created_event.attendance_mode::text,
        'batch_size', jsonb_array_length(input_items), 'batch_position', item_index
      )
    );
    return query select created_event.id, created_event.status::text;
  end loop;
end;
$function$;
revoke all on function public.plan_venue_events(input_items jsonb, input_intent text, audit_request_id uuid) from public,anon,authenticated,service_role;
grant execute on function public.plan_venue_events(input_items jsonb, input_intent text, audit_request_id uuid) to authenticated;
comment on function public.plan_venue_events(input_items jsonb, input_intent text, audit_request_id uuid) is 'VB01 entitlement enforcement; retains the existing authorization and DTO contract.';

create or replace function public.prepare_account_erasure(input_confirmation text,audit_request_id uuid default null)
returns boolean language plpgsql security definer set search_path='' as $function$
begin
  if private.prepare_account_erasure_core(input_confirmation,audit_request_id) then
    raise exception using errcode='P0001',message='UPSTREAM_UNAVAILABLE';
  end if;
  return true;
end;
$function$;
revoke all on function public.prepare_account_erasure(input_confirmation text, audit_request_id uuid) from public,anon,authenticated,service_role;
grant execute on function public.prepare_account_erasure(input_confirmation text, audit_request_id uuid) to authenticated;
comment on function public.prepare_account_erasure(input_confirmation text, audit_request_id uuid) is 'VB01 entitlement enforcement; retains the existing authorization and DTO contract.';

-- These management projections invoke row-locking common-actor checks. Keep
-- their existing VOLATILE contract through PostgREST, despite read-only DTOs.
alter function public.list_venue_calendar(uuid,integer) volatile;
alter function public.list_managed_venue_events(uuid,integer) volatile;

commit;
