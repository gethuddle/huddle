-- Integrated review: activation authority, independent object clocks, retained
-- nonterminal checkout exclusion, and version-fenced external erasure cleanup.
begin;
alter table private.polar_webhook_events add column subscription_modified_at timestamptz;
alter table private.polar_account_erasure_cleanup add column cleanup_token uuid not null default gen_random_uuid();
comment on column private.polar_webhook_events.subscription_modified_at is 'Subscription object version carried by an order; never inferred from the order timestamp.';
comment on column private.polar_account_erasure_cleanup.cleanup_token is 'Opaque fence for the external delete snapshot; new late creation rotates it.';

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
  snapshot_version timestamptz;
  known_cancellation_version timestamptz;
  known_cancellation_end timestamptz;
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
  snapshot_version:=case when r.event_type='order.paid' then r.subscription_modified_at else r.provider_modified_at end;
  if r.price_id is null or snapshot_version is null then return 'reconciliation_required'; end if;
  if (r.price_id,r.amount_minor,r.currency,r.billing_interval,r.interval_count)
    is distinct from (a.polar_product_price_id,a.amount,a.currency,a.interval,a.interval_count) then
    raise exception using errcode='P0001',message='INVALID_TRANSITION';
  end if;
  -- Never-paid/legacy entitlement rows intentionally retain no provider fields.
  -- Their accepted cancellation receipt still fences an older initial activation.
  if r.event_type='subscription.active' then
    select w.provider_modified_at,w.current_period_end into known_cancellation_version,known_cancellation_end
    from private.polar_webhook_events w
    where w.venue_id=r.venue_id and w.checkout_attempt_id=a.id and w.polar_subscription_id=r.polar_subscription_id
      and w.event_type='subscription.canceled' and w.provider_status='active' and w.cancel_at_period_end
      and w.outcome in ('observed','applied')
    order by w.provider_modified_at desc,w.webhook_id limit 1;
    if snapshot_version<known_cancellation_version then return 'stale'; end if;
    if not input_reconciled and snapshot_version=known_cancellation_version
      and (r.provider_status<>'active' or not r.cancel_at_period_end or r.current_period_end is distinct from known_cancellation_end) then
      return 'reconciliation_required';
    end if;
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
    if snapshot_version<coalesce(e.subscription_modified_at,'-infinity'::timestamptz) then return 'stale'; end if;
    if not input_reconciled and snapshot_version=e.subscription_modified_at and
      (r.provider_status,r.cancel_at_period_end) is distinct from (e.provider_status,e.provider_cancel_at_period_end) then
      return 'reconciliation_required';
    end if;
    next_status:=case when r.cancel_at_period_end then 'canceling' else 'active' end;
    next_period:=r.current_period_end;
  else
    if snapshot_version<e.subscription_modified_at then return 'stale'; end if;
    if not input_reconciled and snapshot_version=e.subscription_modified_at and
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
      if r.event_type='subscription.active'
        and (e.status in ('inactive','confirming','legacy_grace','past_due') or
          (e.status='expired' and (e.expiry_reason='past_due' or e.polar_subscription_id is null))) then
        next_status:=case when r.cancel_at_period_end then 'canceling' else 'active' end;
        next_period:=r.current_period_end;
      elsif a.activation_authorized and e.status in ('active','canceling') and r.cancel_at_period_end and e.paid_through_at>checked_at then
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
      update private.venue_billing_entitlements set subscription_modified_at=snapshot_version,
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
    subscription_modified_at=snapshot_version,
    last_paid_order_id=case when r.event_type='order.paid' then r.polar_order_id else e.last_paid_order_id end,
    last_paid_order_at=case when r.event_type='order.paid' then r.paid_order_modified_at else e.last_paid_order_at end,
    provider_status=r.provider_status,provider_cancel_at_period_end=r.cancel_at_period_end,last_webhook_id=r.webhook_id
  where venue_id=r.venue_id;
  update private.venue_billing_checkout_attempts set state='completed',closed_at=coalesce(closed_at,checked_at),
    completed_subscription_id=r.polar_subscription_id,subscription_terminal=coalesce(terminal,false),
    activation_authorized=a.activation_authorized or (next_status in ('active','canceling') and r.event_type='subscription.active') where id=a.id;
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
  subscription_pending boolean;
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
  subscription_pending:=exists(select 1 from private.venue_billing_checkout_attempts a where a.venue_id=input_venue_id and a.state='completed' and a.completed_subscription_id is not null and not a.subscription_terminal and a.erased_at is null);
  drafts:=private.venue_allows_draft_work(input_venue_id,checked_at);
  return pg_catalog.jsonb_build_object(
    'state',effective_state,'interval',e.interval,'checkoutPending',pending or subscription_pending,
    'paidThroughAt',e.paid_through_at,
    'graceExpiresAt',case when e.status='active' and effective_state='provider_stale' then e.paid_through_at+interval '168 hours' else e.grace_expires_at end,
    'publishCutoffAt',case when e.status='canceling' then e.paid_through_at else null end,
    'isPublic',private.venue_allows_public_presence(input_venue_id,checked_at),
    'canPublish',private.venue_allows_public_presence(input_venue_id,checked_at),
    'canPrepareDrafts',drafts,'canOperateExistingEvents',drafts,
    'canManageBilling',is_owner,
    'canStartCheckout',is_owner and v.archived_at is null and v.suspended_at is null
      and e.polar_subscription_id is null and not subscription_pending and not pending and effective_state in ('payment_required','legacy_grace','expired'),
    'canOpenPortal',is_owner and (e.polar_subscription_id is not null or subscription_pending)
  );
end;
$function$;

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
  if e.polar_subscription_id is not null or e.status not in ('inactive','legacy_grace','expired')
    or exists(select 1 from private.venue_billing_checkout_attempts a where a.venue_id=input_venue_id and a.state='completed' and a.completed_subscription_id is not null and not a.subscription_terminal and a.erased_at is null) then
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

drop function public.apply_polar_venue_billing_event(text,public.polar_venue_billing_event_type,timestamptz,timestamptz,text,text,text,uuid,uuid,text,text,text,text,integer,text,public.venue_billing_interval,integer,text,boolean,timestamptz,timestamptz,text,text,uuid,timestamptz);
create function public.apply_polar_venue_billing_event(
  input_webhook_id text,input_event_type public.polar_venue_billing_event_type,input_event_timestamp timestamptz,
  input_provider_modified_at timestamptz,input_organization_id text,input_subscription_id text,input_checkout_id text,
  input_checkout_attempt_id uuid,input_venue_id uuid,input_customer_id text,input_external_customer_id text,
  input_product_id text,input_price_id text,input_amount_minor integer,input_currency text,
  input_interval public.venue_billing_interval,input_interval_count integer,input_provider_status text,
  input_cancel_at_period_end boolean,input_current_period_end timestamptz,input_past_due_at timestamptz,
  input_order_id text,input_billing_reason text,input_audit_request_id uuid,input_signed_period_end timestamptz default null,input_subscription_modified_at timestamptz default null
) returns table(outcome public.venue_billing_apply_outcome,cleanup_actor_id uuid,cleanup_token uuid)
language plpgsql security definer volatile set search_path='' as $function$
declare
  a private.venue_billing_checkout_attempts%rowtype;
  existing private.polar_webhook_events%rowtype;
  result public.venue_billing_apply_outcome;
  cleanup public.venue_billing_apply_outcome;
  captured_cleanup_token uuid;
begin
  if input_webhook_id is null or input_webhook_id !~ '^[a-zA-Z0-9_-]{1,128}$' or input_event_type is null
    or input_event_timestamp is null or not pg_catalog.isfinite(input_event_timestamp)
    or input_provider_modified_at is null or not pg_catalog.isfinite(input_provider_modified_at)
    or input_organization_id is null or input_subscription_id is null or input_customer_id is null or input_product_id is null
    or input_checkout_attempt_id is null or input_venue_id is null
    or (input_event_type='order.paid' and (input_order_id is null or input_billing_reason is distinct from 'subscription_cycle' or input_past_due_at is not null or input_external_customer_id is null))
    or (input_event_type<>'order.paid' and (input_order_id is not null or input_billing_reason is not null or input_signed_period_end is not null or input_checkout_id is null))
    or (input_external_customer_id is null and (input_event_type<>'subscription.revoked' or input_provider_status is distinct from 'canceled'))
    or (input_subscription_modified_at is not null and (input_event_type<>'order.paid' or not pg_catalog.isfinite(input_subscription_modified_at)))
    or input_interval is null
    or (input_price_id is null and (input_event_type<>'order.paid' or input_amount_minor is not null or input_currency is not null or input_interval_count is not null or input_provider_status is not null or input_cancel_at_period_end is not null or input_current_period_end is not null))
    or (input_price_id is not null and (input_amount_minor is null or input_currency is null or input_interval is null or input_interval_count is null or input_provider_status is null or input_cancel_at_period_end is null))
    or (input_past_due_at is not null and input_provider_status is distinct from 'past_due') then
    raise exception using errcode='P0001',message='VALIDATION_FAILED';
  end if;
  perform private.lock_venue_billing(input_venue_id);
  select * into a from private.venue_billing_checkout_attempts where id=input_checkout_attempt_id for update;
  if not found or a.venue_id<>input_venue_id then raise exception using errcode='P0001',message='INVALID_TRANSITION'; end if;
  select * into existing from private.polar_webhook_events where webhook_id=input_webhook_id;
  if found then
    if existing.venue_id is distinct from input_venue_id or existing.event_type<>input_event_type or existing.checkout_attempt_id is distinct from input_checkout_attempt_id then
      raise exception using errcode='P0001',message='INVALID_TRANSITION';
    end if;
    if existing.outcome='erasure_cleanup_required' then return query select existing.outcome,a.owner_id,(select c.cleanup_token from private.polar_account_erasure_cleanup c where c.actor_id=a.owner_id); return; end if;
    if existing.outcome='erasure_cleanup_complete' then return query select existing.outcome,null::uuid,null::uuid; return; end if;
    if existing.outcome='reconciliation_required' then return query select existing.outcome,null::uuid,null::uuid; return; end if;
    return query select 'duplicate'::public.venue_billing_apply_outcome,null::uuid,null::uuid;return;
  end if;
  -- Erased markers are checked before normal attempt lifecycle. The first erase
  -- trigger retains any known org/product; null pair means never attached.
  if a.erased_at is not null then
    if not exists(select 1 from public.venues v join public.profiles p on p.id=v.owner_id where v.id=input_venue_id and v.owner_id=a.owner_id and v.archived_at is not null and p.deleted_at is not null)
      or (input_external_customer_id is not null and input_external_customer_id<>a.owner_id::text)
      or (a.erased_organization_id is not null and (a.erased_organization_id,a.erased_product_id) is distinct from (input_organization_id,input_product_id))
      or (input_interval is not null and input_interval<>a.interval) then
      raise exception using errcode='P0001',message='INVALID_TRANSITION';
    end if;
    select c.outcome,c.cleanup_token into cleanup,captured_cleanup_token from private.polar_account_erasure_cleanup c where c.actor_id=a.owner_id for update;
    if not found then raise exception using errcode='P0001',message='INVALID_TRANSITION'; end if;
    if input_external_customer_id is not null then
      cleanup:='erasure_cleanup_required';
      update private.polar_account_erasure_cleanup c set outcome=cleanup,completed_at=null,cleanup_token=gen_random_uuid() where c.actor_id=a.owner_id returning c.cleanup_token into captured_cleanup_token;
    end if;
    insert into private.polar_webhook_events(webhook_id,event_type,venue_id,checkout_attempt_id,provider_modified_at,processed_at,outcome)
    values(input_webhook_id,input_event_type,input_venue_id,input_checkout_attempt_id,input_provider_modified_at,statement_timestamp(),cleanup);
    return query select cleanup,case when cleanup='erasure_cleanup_required' then a.owner_id else null::uuid end,case when cleanup='erasure_cleanup_required' then captured_cleanup_token else null::uuid end;return;
  end if;
  if input_external_customer_id is null then raise exception using errcode='P0001',message='INVALID_TRANSITION'; end if;
  insert into private.polar_webhook_events(webhook_id,event_type,venue_id,polar_subscription_id,polar_order_id,provider_modified_at,outcome,event_timestamp,checkout_attempt_id,organization_id,checkout_id,customer_id,external_customer_id,product_id,price_id,amount_minor,currency,billing_interval,interval_count,provider_status,cancel_at_period_end,current_period_end,past_due_at,signed_period_end)
  values(input_webhook_id,input_event_type,input_venue_id,input_subscription_id,input_order_id,input_provider_modified_at,'reconciliation_required',input_event_timestamp,input_checkout_attempt_id,input_organization_id,input_checkout_id,input_customer_id,input_external_customer_id,input_product_id,input_price_id,input_amount_minor,input_currency,input_interval,input_interval_count,input_provider_status,input_cancel_at_period_end,input_current_period_end,input_past_due_at,input_signed_period_end);
  if input_event_type='order.paid' then
    update private.polar_webhook_events set paid_order_modified_at=input_provider_modified_at,subscription_modified_at=input_subscription_modified_at where webhook_id=input_webhook_id;
  end if;
  result:=private.project_polar_venue_billing(input_webhook_id,false,input_audit_request_id);
  update private.polar_webhook_events set outcome=result,processed_at=case when result='reconciliation_required' then null else statement_timestamp() end where webhook_id=input_webhook_id;
  return query select result,null::uuid,null::uuid;
end;
$function$;

create or replace function public.complete_polar_venue_billing_reconciliation(
  input_webhook_id text,input_subscription_id text,input_provider_modified_at timestamptz,input_checkout_id text,
  input_customer_id text,input_external_customer_id text,input_product_id text,input_price_id text,
  input_amount_minor integer,input_currency text,input_interval public.venue_billing_interval,input_interval_count integer,
  input_provider_status text,input_cancel_at_period_end boolean,input_current_period_end timestamptz,input_audit_request_id uuid
) returns public.venue_billing_apply_outcome language plpgsql security definer volatile set search_path='' as $function$
declare r private.polar_webhook_events%rowtype;result public.venue_billing_apply_outcome;
begin
  select * into r from private.polar_webhook_events where webhook_id=input_webhook_id;
  if not found then raise exception using errcode='P0001',message='INVALID_TRANSITION'; end if;
  perform private.lock_venue_billing(r.venue_id);
  select * into strict r from private.polar_webhook_events where webhook_id=input_webhook_id for update;
  if r.outcome<>'reconciliation_required' then return r.outcome; end if;
  if (r.polar_subscription_id,r.customer_id,r.external_customer_id,r.product_id) is distinct from (input_subscription_id,input_customer_id,input_external_customer_id,input_product_id)
    or (input_checkout_id is not null and r.checkout_id is not null and input_checkout_id<>r.checkout_id)
    or input_provider_modified_at is null or not pg_catalog.isfinite(input_provider_modified_at) or (r.event_type<>'order.paid' and input_provider_modified_at<r.provider_modified_at)
    or input_price_id is null or input_amount_minor is null or input_currency is null or input_interval is null or input_interval_count is null or input_provider_status is null or input_cancel_at_period_end is null
    or (r.event_type='order.paid' and (r.signed_period_end is null or input_current_period_end is distinct from r.signed_period_end)) then
    raise exception using errcode='P0001',message='INVALID_TRANSITION';
  end if;
  update private.polar_webhook_events set subscription_modified_at=case when r.event_type='order.paid' then input_provider_modified_at else null end,
    provider_modified_at=case when r.event_type='order.paid' then r.provider_modified_at else input_provider_modified_at end,checkout_id=coalesce(input_checkout_id,r.checkout_id),
    price_id=input_price_id,amount_minor=input_amount_minor,currency=input_currency,billing_interval=input_interval,interval_count=input_interval_count,
    provider_status=input_provider_status,cancel_at_period_end=input_cancel_at_period_end,current_period_end=input_current_period_end where webhook_id=input_webhook_id;
  result:=private.project_polar_venue_billing(input_webhook_id,true,input_audit_request_id);
  update private.polar_webhook_events set outcome=result,processed_at=statement_timestamp() where webhook_id=input_webhook_id;
  return result;
end;
$function$;

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
    interval_count=null,provider_status=null,cancel_at_period_end=null,current_period_end=null,past_due_at=null,signed_period_end=null,paid_order_modified_at=null,subscription_modified_at=null
  from public.venues v where v.id=w.venue_id and v.owner_id=current_actor_id;
  if cleanup_required then
    insert into private.polar_account_erasure_cleanup(actor_id) values(current_actor_id)
    on conflict(actor_id) do update set completed_at=null,outcome='erasure_cleanup_required';
  end if;
  return cleanup_required;
end;
$function$;

drop function public.prepare_account_erasure_v2(text,uuid);
create function public.prepare_account_erasure_v2(input_confirmation text,audit_request_id uuid default null)
returns table(prepared boolean,polar_cleanup_required boolean,cleanup_token uuid)
language plpgsql security definer set search_path='' as $function$
declare required boolean; captured_token uuid;
begin
  required:=private.prepare_account_erasure_core(input_confirmation,audit_request_id);
  if required then select c.cleanup_token into strict captured_token from private.polar_account_erasure_cleanup c where c.actor_id=auth.uid(); end if;
  return query select true,required,captured_token;
end;
$function$;

drop function public.complete_polar_account_erasure_cleanup(uuid,uuid);
create or replace function public.complete_polar_account_erasure_cleanup(input_actor_id uuid,input_request_id uuid,input_cleanup_token uuid)
returns void language plpgsql security definer volatile set search_path='' as $function$
declare owned_venue_id uuid; current_token uuid;
begin
  if input_actor_id is null then raise exception using errcode='P0001',message='VALIDATION_FAILED'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(input_actor_id::text,4104));
  for owned_venue_id in select v.id from public.venues v where v.owner_id=input_actor_id order by v.id loop perform private.lock_venue_billing(owned_venue_id); end loop;
  if not exists(select 1 from public.profiles p where p.id=input_actor_id and p.deleted_at is not null)
    or not exists(select 1 from private.polar_account_erasure_cleanup c where c.actor_id=input_actor_id)
    or exists(select 1 from public.venues v where v.owner_id=input_actor_id and v.archived_at is null)
    or exists(select 1 from private.venue_billing_entitlements e join public.venues v on v.id=e.venue_id where v.owner_id=input_actor_id and (e.status<>'expired' or e.polar_customer_id is not null or e.polar_subscription_id is not null or e.last_paid_order_id is not null or e.last_webhook_id is not null))
    or exists(select 1 from private.venue_billing_checkout_attempts a where a.owner_id=input_actor_id and (a.erased_at is null or a.polar_checkout_id is not null or a.external_customer_id is not null)) then
    raise exception using errcode='P0001',message='INVALID_TRANSITION';
  end if;
  select c.cleanup_token into current_token from private.polar_account_erasure_cleanup c where c.actor_id=input_actor_id for update;
  if input_cleanup_token is null or input_cleanup_token is distinct from current_token then
    raise exception using errcode='P0001',message='INVALID_TRANSITION';
  end if;
  update private.polar_webhook_events w set polar_subscription_id=null,polar_order_id=null,organization_id=null,checkout_id=null,
    customer_id=null,external_customer_id=null,product_id=null,price_id=null,amount_minor=null,currency=null,billing_interval=null,
    interval_count=null,provider_status=null,cancel_at_period_end=null,current_period_end=null,past_due_at=null,signed_period_end=null,paid_order_modified_at=null,subscription_modified_at=null,
    outcome=case when w.outcome in ('erasure_cleanup_required','reconciliation_required') then 'erasure_cleanup_complete'::public.venue_billing_apply_outcome else w.outcome end,
    processed_at=coalesce(w.processed_at,statement_timestamp())
  from public.venues v where v.id=w.venue_id and v.owner_id=input_actor_id;
  update private.polar_account_erasure_cleanup set completed_at=statement_timestamp(),outcome='erasure_cleanup_complete' where actor_id=input_actor_id and completed_at is null;
end;
$function$;

drop function public.get_event_summary(uuid);
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
  host_venue_is_public boolean,
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
    coalesce(private.venue_allows_public_presence(host_venue.id,statement_timestamp()),false),
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

revoke all on function public.apply_polar_venue_billing_event(text,public.polar_venue_billing_event_type,timestamptz,timestamptz,text,text,text,uuid,uuid,text,text,text,text,integer,text,public.venue_billing_interval,integer,text,boolean,timestamptz,timestamptz,text,text,uuid,timestamptz,timestamptz),public.complete_polar_account_erasure_cleanup(uuid,uuid,uuid) from public,anon,authenticated,service_role;
grant execute on function public.apply_polar_venue_billing_event(text,public.polar_venue_billing_event_type,timestamptz,timestamptz,text,text,text,uuid,uuid,text,text,text,text,integer,text,public.venue_billing_interval,integer,text,boolean,timestamptz,timestamptz,text,text,uuid,timestamptz,timestamptz),public.complete_polar_account_erasure_cleanup(uuid,uuid,uuid) to service_role;
revoke all on function public.prepare_account_erasure_v2(text,uuid),public.get_event_summary(uuid) from public,anon,authenticated,service_role;
grant execute on function public.prepare_account_erasure_v2(text,uuid) to authenticated;
grant execute on function public.get_event_summary(uuid) to anon,authenticated;
create or replace function public.get_archived_venue_billing_context(input_slug text)
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
    'interval',e.interval,'paidThroughAt',e.paid_through_at,'canOpenPortal',e.polar_subscription_id is not null or exists(
      select 1 from private.venue_billing_checkout_attempts a where a.venue_id=v.id and a.state='completed'
        and a.completed_subscription_id is not null and not a.subscription_terminal and a.erased_at is null));
end;
$function$;

commit;
