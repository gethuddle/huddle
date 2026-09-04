begin;

-- Every writer starts with the same venue token. The CTE carries only the
-- events changed by this transition, so closed invitations/history stay intact.
create function private.cancel_venue_billing_future_events(input_venue_id uuid,input_now timestamptz)
returns table(cancelled_event_count integer,revoked_invitation_count integer)
language plpgsql security definer volatile set search_path='' as $function$
begin
  perform private.lock_venue_billing(input_venue_id);
  return query with cancelled as (
    update public.events set status='cancelled',cancelled_at=input_now,
      cancel_reason='This event has been cancelled.'
    where host_venue_id=input_venue_id and status='published' and starts_at>input_now
    returning id
  ), revoked as (
    update public.event_invitations set status='revoked',responded_at=input_now
    where status='pending' and event_id in (select id from cancelled) returning id
  ) select (select count(*)::integer from cancelled),(select count(*)::integer from revoked);
end;
$function$;

create function private.transition_venue_billing_deadline(input_venue_id uuid,input_now timestamptz,input_request_id uuid)
returns integer language plpgsql security definer volatile set search_path='' as $function$
declare
  entitlement private.venue_billing_entitlements%rowtype;
  previous_status public.venue_billing_status;
  cancelled_count integer:=0;
  revoked_count integer:=0;
begin
  if input_now is null or not pg_catalog.isfinite(input_now) then
    raise exception using errcode='P0001',message='VALIDATION_FAILED';
  end if;
  perform private.lock_venue_billing(input_venue_id);
  select * into entitlement from private.venue_billing_entitlements where venue_id=input_venue_id for update;
  if not found then return 0; end if;
  previous_status:=entitlement.status;
  if entitlement.status='active' and input_now>=entitlement.paid_through_at then
    update private.venue_billing_entitlements set status='provider_stale',expiry_reason=null,
      grace_started_at=entitlement.paid_through_at,grace_expires_at=entitlement.paid_through_at+interval '168 hours'
    where venue_id=input_venue_id returning * into entitlement;
  end if;
  if (entitlement.status in ('past_due','provider_stale','legacy_grace') and input_now>=entitlement.grace_expires_at)
    or (entitlement.status='canceling' and input_now>=entitlement.paid_through_at) then
    update private.venue_billing_entitlements set status='expired',expiry_reason=entitlement.status::text,
      grace_started_at=null,grace_expires_at=null where venue_id=input_venue_id returning * into entitlement;
    select c.cancelled_event_count,c.revoked_invitation_count into cancelled_count,revoked_count
      from private.cancel_venue_billing_future_events(input_venue_id,input_now) c;
  end if;
  if previous_status is distinct from entitlement.status then
    perform private.write_security_audit(null,'venue.billing.deadline','venue',input_venue_id,'succeeded',input_request_id,
      jsonb_build_object('previous_status',previous_status,'next_status',entitlement.status,'source','deadline',
        'cancelled_event_count',cancelled_count,'revoked_invitation_count',revoked_count));
  end if;
  return cancelled_count;
end;
$function$;

create or replace function private.apply_venue_billing_deadline_for_venue(input_venue_id uuid,input_now timestamptz)
returns void language plpgsql security definer volatile set search_path='' as $function$
begin
  perform private.transition_venue_billing_deadline(input_venue_id,input_now,null);
end;
$function$;

create function private.sweep_venue_billing_deadlines(input_now timestamptz,input_limit integer,input_request_id uuid)
returns table(venue_id uuid,previous_status public.venue_billing_status,next_status public.venue_billing_status,cancelled_event_count integer)
language plpgsql security definer volatile set search_path='' as $function$
declare candidate record; entitlement private.venue_billing_entitlements%rowtype;
begin
  if input_now is null or not pg_catalog.isfinite(input_now) or input_limit is null or input_limit<1 or input_limit>500 then
    raise exception using errcode='P0001',message='VALIDATION_FAILED';
  end if;
  -- Nomination takes no row locks. A busy venue is skipped, never waited on.
  for candidate in
    select e.venue_id,coalesce(e.grace_expires_at,e.paid_through_at) as deadline
    from private.venue_billing_entitlements e
    where (e.status in ('past_due','provider_stale','legacy_grace') and e.grace_expires_at<=input_now)
      or (e.status in ('active','canceling') and e.paid_through_at<=input_now)
    order by deadline,e.venue_id limit input_limit
  loop
    if not pg_catalog.pg_try_advisory_xact_lock(pg_catalog.hashtextextended(candidate.venue_id::text,4105)) then continue; end if;
    select * into entitlement from private.venue_billing_entitlements e where e.venue_id=candidate.venue_id for update;
    if not ((entitlement.status in ('past_due','provider_stale','legacy_grace') and entitlement.grace_expires_at<=input_now)
      or (entitlement.status in ('active','canceling') and entitlement.paid_through_at<=input_now)) then continue; end if;
    venue_id:=candidate.venue_id;
    previous_status:=entitlement.status;
    cancelled_event_count:=private.transition_venue_billing_deadline(venue_id,input_now,input_request_id);
    select e.status into next_status from private.venue_billing_entitlements e where e.venue_id=candidate.venue_id;
    return next;
  end loop;
end;
$function$;

create function private.expire_venue_billing_entitlements(input_now timestamptz,input_limit integer)
returns table(venue_id uuid,previous_status public.venue_billing_status,next_status public.venue_billing_status,cancelled_event_count integer)
language sql security definer volatile set search_path='' as $function$
  select * from private.sweep_venue_billing_deadlines(input_now,input_limit,null);
$function$;

create function public.run_venue_billing_deadline_sweep(input_now timestamptz,input_limit integer,audit_request_id uuid default null)
returns table(venue_id uuid,previous_status public.venue_billing_status,next_status public.venue_billing_status,cancelled_event_count integer)
language sql security definer volatile set search_path='' as $function$
  select * from private.sweep_venue_billing_deadlines(input_now,input_limit,audit_request_id);
$function$;

-- Status is a bounded product enum. A private export has the same effective
-- cancellation as detail/history even if the scheduled sweep has not run yet.
drop function public.get_calendar_event(uuid,uuid);
create function public.get_calendar_event(input_event_id uuid,audit_request_id uuid default null)
returns table(event_id uuid,title text,description text,starts_at timestamptz,ends_at timestamptz,
 updated_at timestamptz,location_text text,public_cacheable boolean,status public.event_status)
language plpgsql security definer set search_path='' as $function$
declare
  actor_id uuid:=auth.uid(); target_event public.events%rowtype;
  checked_at timestamptz:=statement_timestamp(); effective_status public.event_status;
  venue_address text; private_address text; private_directions text;
begin
  select e.* into target_event from public.events e where e.id=input_event_id for share;
  if not found or not private.event_is_visible_to_actor(input_event_id,actor_id) then
    raise exception using errcode='P0001',message='NOT_FOUND';
  end if;
  if target_event.host_user_id is not null and actor_id is null then
    raise exception using errcode='P0001',message='AUTH_REQUIRED';
  end if;
  effective_status:=private.venue_event_projected_status(target_event,checked_at);
  if target_event.place_kind='home' and private.actor_can_read_private_event_location(input_event_id,actor_id) then
    select l.address_text,l.directions into private_address,private_directions from public.get_private_event_location(input_event_id,audit_request_id) l;
  elsif target_event.place_kind='venue' then
    select v.address_text into venue_address from public.venues v where v.id=target_event.venue_id;
  end if;
  return query select target_event.id,target_event.title,
    case when effective_status='cancelled' then 'This event has been cancelled.' else target_event.description end,
    target_event.starts_at,target_event.ends_at,target_event.updated_at,
    case when target_event.place_kind='home' and private_address is not null then concat_ws(' — ',private_address,private_directions)
      when target_event.place_kind='venue' then venue_address
      when target_event.place_kind='public_place' then concat_ws(' — ',target_event.public_place_name,target_event.public_address_text)
      else null end,false,effective_status;
end;
$function$;

create function public.get_archived_venue_billing_context(input_slug text)
returns jsonb language plpgsql security definer volatile set search_path='' as $function$
declare actor_id uuid:=private.serialize_actor_transaction(); target_id uuid; e private.venue_billing_entitlements%rowtype; v public.venues%rowtype;
begin
  select id into target_id from public.venues where slug=input_slug and owner_id=actor_id and archived_at is not null;
  if not found then raise exception using errcode='P0001',message='NOT_FOUND'; end if;
  perform private.lock_venue_billing(target_id);
  actor_id:=private.assert_common_actor();
  select * into v from public.venues where id=target_id and owner_id=actor_id and archived_at is not null;
  if not found then raise exception using errcode='P0001',message='NOT_FOUND'; end if;
  select * into strict e from private.venue_billing_entitlements where venue_id=v.id;
  return jsonb_build_object('venueId',v.id,'name',v.name,'slug',v.slug,'state',private.venue_billing_effective_state(v.id,statement_timestamp()),
    'interval',e.interval,'paidThroughAt',e.paid_through_at,'canOpenPortal',e.polar_subscription_id is not null);
end;
$function$;

revoke all on function private.cancel_venue_billing_future_events(uuid,timestamptz),
 private.transition_venue_billing_deadline(uuid,timestamptz,uuid),private.sweep_venue_billing_deadlines(timestamptz,integer,uuid),
 private.expire_venue_billing_entitlements(timestamptz,integer),public.run_venue_billing_deadline_sweep(timestamptz,integer,uuid),
 public.get_calendar_event(uuid,uuid),public.get_archived_venue_billing_context(text) from public,anon,authenticated,service_role;
grant execute on function public.run_venue_billing_deadline_sweep(timestamptz,integer,uuid) to service_role;
grant execute on function public.get_calendar_event(uuid,uuid) to anon,authenticated;
grant execute on function public.get_archived_venue_billing_context(text) to authenticated;

create or replace function public.archive_venue(
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
  actor_id uuid := private.serialize_actor_transaction();
  target_venue public.venues%rowtype;
  cancelled_event_count bigint;
  revoked_invitation_count bigint;
begin
  perform private.lock_venue_billing(input_venue_id);
  actor_id:=private.assert_common_actor();
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

  update private.venue_billing_checkout_attempts set state='expired',failure_code='expired',closed_at=statement_timestamp()
  where venue_id=input_venue_id and state in ('reserved','uncertain','attached');

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
  if exists(select 1 from public.venues where id=input_venue_id and archived_at is not null)
    or not private.actor_manages_venue(actor_id,input_venue_id) then
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

-- Reconciliation has the same binding checks and a separate paid-order lane.
create or replace function private.project_polar_venue_billing(input_webhook_id text,input_reconciled boolean,input_audit_request_id uuid)
returns public.venue_billing_apply_outcome language plpgsql security definer volatile set search_path='' as $function$
declare
  r private.polar_webhook_events%rowtype;
  a private.venue_billing_checkout_attempts%rowtype;
  e private.venue_billing_entitlements%rowtype;
  checked_at timestamptz:=statement_timestamp();
  result public.venue_billing_apply_outcome:='observed';
  next_status public.venue_billing_status;
  next_period timestamptz;
  first_failure timestamptz;
  terminal boolean;
  previous_status public.venue_billing_status;
  cancelled_count integer:=0;
  revoked_count integer:=0;
begin
  select * into strict r from private.polar_webhook_events where webhook_id=input_webhook_id;
  perform private.lock_venue_billing(r.venue_id);
  select * into strict e from private.venue_billing_entitlements where venue_id=r.venue_id for update;
  previous_status:=e.status;
  select * into strict a from private.venue_billing_checkout_attempts where id=r.checkout_attempt_id for update;
  if a.venue_id<>r.venue_id or a.erased_at is not null or a.owner_id::text is distinct from r.external_customer_id
    or a.state not in ('attached','completed') or a.subscription_terminal
    or (a.completed_subscription_id is not null and a.completed_subscription_id<>r.polar_subscription_id)
    or exists(select 1 from private.venue_billing_checkout_attempts newer where newer.venue_id=a.venue_id and newer.generation>a.generation)
    or not exists(select 1 from public.venues v join public.profiles p on p.id=v.owner_id where v.id=r.venue_id and v.owner_id=a.owner_id and v.archived_at is null and p.deleted_at is null)
    or (e.polar_subscription_id is not null and e.polar_subscription_id<>r.polar_subscription_id) then
    return 'ignored';
  end if;
  if r.organization_id is distinct from a.polar_organization_id or r.product_id is distinct from a.polar_product_id
    or (r.checkout_id is not null and r.checkout_id is distinct from a.polar_checkout_id)
    or (e.polar_customer_id is not null and r.customer_id is distinct from e.polar_customer_id)
    or (r.event_type='order.paid' and (e.polar_subscription_id is distinct from r.polar_subscription_id or a.completed_subscription_id is distinct from r.polar_subscription_id)) then
    raise exception using errcode='P0001',message='INVALID_TRANSITION';
  end if;
  if r.price_id is null then return 'reconciliation_required'; end if;
  if (r.price_id,r.amount_minor,r.currency,r.billing_interval,r.interval_count)
    is distinct from (a.polar_product_price_id,a.amount,a.currency,a.interval,a.interval_count) then
    raise exception using errcode='P0001',message='INVALID_TRANSITION';
  end if;
  -- Derive the deadline authority without cancelling ahead of a fully bound
  -- recovery that already owns this token. Observations still cannot renew.
  if e.status='active' and checked_at>=e.paid_through_at then
    e.status:='provider_stale'; e.expiry_reason:=null;
    e.grace_started_at:=e.paid_through_at; e.grace_expires_at:=e.paid_through_at+interval '168 hours';
  end if;
  if (e.status in ('past_due','provider_stale','legacy_grace') and checked_at>=e.grace_expires_at)
    or (e.status='canceling' and checked_at>=e.paid_through_at) then
    e.expiry_reason:=e.status::text; e.status:='expired';
    e.grace_started_at:=null; e.grace_expires_at:=null;
  end if;
  if r.event_type='order.paid' and (not input_reconciled or r.provider_status='active') then
    -- Renewal proof cannot be the initial activating authority. This marker is
    -- scoped to the matched attempt/subscription, never to venue-wide history.
    if not a.activation_authorized then return 'ignored'; end if;
    if exists(select 1 from private.polar_webhook_events w where w.polar_order_id=r.polar_order_id and w.outcome='applied' and w.webhook_id<>r.webhook_id) then return 'duplicate'; end if;
    if r.signed_period_end is null or r.current_period_end is distinct from r.signed_period_end then
      raise exception using errcode='P0001',message='INVALID_TRANSITION';
    end if;
    if r.provider_status<>'active' then return 'ignored'; end if;
    if r.current_period_end<=coalesce(e.paid_through_at,'-infinity'::timestamptz) then return 'stale'; end if;
    -- A canonical fetch cannot supersede a later signed terminal/past-due state.
    if r.provider_modified_at<coalesce(e.subscription_modified_at,'-infinity'::timestamptz) then return 'stale'; end if;
    next_status:=case when r.cancel_at_period_end then 'canceling' else 'active' end;
    next_period:=r.current_period_end;
  else
    if r.provider_modified_at<greatest(e.subscription_modified_at,e.last_paid_order_at) then return 'stale'; end if;
    if not input_reconciled and r.provider_modified_at=e.subscription_modified_at and
      (r.provider_status,r.cancel_at_period_end) is distinct from (e.provider_status,e.provider_cancel_at_period_end) then
      return 'reconciliation_required';
    end if;
    terminal:=r.event_type='subscription.revoked' or r.provider_status in ('canceled','unpaid');
    if terminal or r.provider_status in ('paused','incomplete_expired') then
      next_status:='expired';
    elsif input_reconciled and r.provider_status='past_due' then
      if e.status='expired' and e.expiry_reason='provider_stale' then
        next_status:='expired';
      elsif e.status<>'expired' or e.expiry_reason not in ('past_due','provider_stale') then
        next_status:='past_due';
        first_failure:=coalesce(e.grace_started_at,r.past_due_at,r.event_timestamp);
      end if;
    elsif r.provider_status='trialing' then
      return 'ignored';
    elsif r.event_type='subscription.cycled' then
      result:='observed';
    elsif r.event_type='subscription.created' and r.provider_status='incomplete' then
      if e.status in ('inactive','confirming') then next_status:='confirming'; end if;
    elsif r.event_type='subscription.uncanceled' then
      if e.status='canceling' and e.paid_through_at>checked_at and r.provider_status='active' and not r.cancel_at_period_end then
        next_status:='active';next_period:=e.paid_through_at;
      end if;
    elsif r.provider_status='past_due' and r.event_type='subscription.past_due' then
      -- A later signed failure changes recovery authority, not an already
      -- elapsed deadline. Keep expiry and cancellations while retaining cause.
      if e.status='expired' and e.expiry_reason='provider_stale' then
        next_status:='expired';
      elsif e.status<>'expired' or e.expiry_reason not in ('past_due','provider_stale') then
        next_status:='past_due';
        first_failure:=coalesce(e.grace_started_at,r.past_due_at,r.event_timestamp);
      end if;
    elsif r.provider_status='active' then
      if (r.event_type='subscription.active' or (r.event_type='subscription.canceled' and r.cancel_at_period_end))
        and (e.status in ('inactive','confirming','legacy_grace','past_due') or
          (e.status='expired' and (e.expiry_reason='past_due' or e.polar_subscription_id is null))) then
        next_status:=case when r.cancel_at_period_end then 'canceling' else 'active' end;
        next_period:=r.current_period_end;
      elsif e.status in ('active','canceling') and r.cancel_at_period_end and e.paid_through_at>checked_at then
        next_status:='canceling';next_period:=e.paid_through_at;
      end if;
    end if;
  end if;
  -- Legacy created/cycled observations must preserve the no-provider legacy row.
  if next_status is null then
    -- Recovery has been ruled out. Persist expiry before observation metadata:
    -- an overdue legacy row must leave its no-provider state atomically first.
    perform private.transition_venue_billing_deadline(r.venue_id,checked_at,input_audit_request_id);
    if r.event_type='subscription.created' and r.provider_status='incomplete' then
      update private.venue_billing_checkout_attempts set state='completed',closed_at=coalesce(closed_at,checked_at),
        completed_subscription_id=r.polar_subscription_id where id=a.id;
    end if;
    if e.status not in ('inactive','legacy_grace') then
      update private.venue_billing_entitlements set subscription_modified_at=r.provider_modified_at,
        provider_status=r.provider_status,provider_cancel_at_period_end=r.cancel_at_period_end,last_webhook_id=r.webhook_id where venue_id=r.venue_id;
    end if;
    return result;
  end if;
  if next_status in ('active','canceling') and next_period is null then raise exception using errcode='P0001',message='VALIDATION_FAILED'; end if;
  update private.venue_billing_entitlements set status=next_status,
    interval=r.billing_interval,interval_count=r.interval_count,polar_customer_id=r.customer_id,
    polar_subscription_id=case when terminal then null else r.polar_subscription_id end,
    polar_product_id=r.product_id,polar_product_price_id=r.price_id,amount=r.amount_minor,currency=r.currency,
    paid_through_at=coalesce(next_period,e.paid_through_at),
    grace_started_at=case when next_status='past_due' then first_failure else null end,
    grace_expires_at=case when next_status='past_due' then first_failure+interval '168 hours' else null end,
    expiry_reason=case when next_status='expired' then case when r.provider_status='past_due' then 'past_due' else 'terminal' end else null end,
    first_activated_at=case when next_status in ('active','canceling') then coalesce(e.first_activated_at,checked_at) else e.first_activated_at end,
    subscription_modified_at=case when r.event_type='order.paid' then e.subscription_modified_at else r.provider_modified_at end,
    last_paid_order_id=case when r.event_type='order.paid' then r.polar_order_id else e.last_paid_order_id end,
    last_paid_order_at=case when r.event_type='order.paid' then r.paid_order_modified_at else e.last_paid_order_at end,
    provider_status=r.provider_status,provider_cancel_at_period_end=r.cancel_at_period_end,last_webhook_id=r.webhook_id
  where venue_id=r.venue_id;
  update private.venue_billing_checkout_attempts set state='completed',closed_at=coalesce(closed_at,checked_at),
    completed_subscription_id=r.polar_subscription_id,subscription_terminal=coalesce(terminal,false),
    activation_authorized=a.activation_authorized or (next_status in ('active','canceling') and r.event_type in ('subscription.active','subscription.canceled')) where id=a.id;
  if next_status='expired' then
    select c.cancelled_event_count,c.revoked_invitation_count into cancelled_count,revoked_count
      from private.cancel_venue_billing_future_events(r.venue_id,checked_at) c;
  end if;
  perform private.transition_venue_billing_deadline(r.venue_id,checked_at,input_audit_request_id);
  perform private.write_security_audit(null,'venue.billing.apply','venue',r.venue_id,'succeeded',input_audit_request_id,
    jsonb_build_object('previous_status',previous_status,'next_status',next_status,'source','webhook',
      'cancelled_event_count',cancelled_count,'revoked_invitation_count',revoked_count));
  return 'applied';
end;
$function$;

commit;
