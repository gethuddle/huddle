begin;

-- Bounded provenance is necessary after grace columns have been cleared.
alter table private.venue_billing_entitlements
  add column expiry_reason text check (expiry_reason in ('past_due','provider_stale','legacy_grace','canceling','terminal')),
  add column provider_status text check (provider_status in ('incomplete','incomplete_expired','trialing','active','past_due','canceled','unpaid','paused')),
  add column provider_cancel_at_period_end boolean;
alter table private.venue_billing_checkout_attempts
  add column completed_subscription_id text check (completed_subscription_id ~ '^[a-zA-Z0-9_-]{1,128}$'),
  add column activation_authorized boolean not null default false,
  add column subscription_terminal boolean not null default false,
  add column erased_organization_id text check (erased_organization_id ~ '^[a-zA-Z0-9_-]{1,128}$'),
  add column erased_product_id text check (erased_product_id ~ '^[a-zA-Z0-9_-]{1,128}$'),
  add constraint venue_checkout_erased_binding_pair check ((erased_organization_id is null)=(erased_product_id is null));

create function private.retain_erased_checkout_binding()
returns trigger language plpgsql security definer set search_path='' as $function$
begin
  if old.erased_at is null and new.erased_at is not null then
    new.erased_organization_id:=old.polar_organization_id;
    new.erased_product_id:=old.polar_product_id;
    new.completed_subscription_id:=null;
    new.activation_authorized:=false;
  elsif old.erased_at is not null then
    new.erased_organization_id:=old.erased_organization_id;
    new.erased_product_id:=old.erased_product_id;
    new.erased_at:=old.erased_at;
    new.completed_subscription_id:=null;
    new.activation_authorized:=false;
  else
    new.erased_organization_id:=null;
    new.erased_product_id:=null;
  end if;
  return new;
end;
$function$;
create trigger venue_checkout_retain_erasure before update on private.venue_billing_checkout_attempts
for each row execute function private.retain_erased_checkout_binding();

-- Only normalized scalar proof survives the network boundary. No provider JSON.
alter table private.polar_webhook_events
  add column event_timestamp timestamptz,
  add column checkout_attempt_id uuid references private.venue_billing_checkout_attempts(id),
  add column organization_id text,
  add column checkout_id text,
  add column customer_id text,
  add column external_customer_id text,
  add column product_id text,
  add column price_id text,
  add column amount_minor integer,
  add column currency text,
  add column billing_interval public.venue_billing_interval,
  add column interval_count integer,
  add column provider_status text,
  add column cancel_at_period_end boolean,
  add column current_period_end timestamptz,
  add column past_due_at timestamptz,
  add column signed_period_end timestamptz,
  add column paid_order_modified_at timestamptz,
  add constraint polar_receipt_bounded_context check (
    (organization_id is null or organization_id ~ '^[a-zA-Z0-9_-]{1,128}$') and
    (checkout_id is null or checkout_id ~ '^[a-zA-Z0-9_-]{1,128}$') and
    (customer_id is null or customer_id ~ '^[a-zA-Z0-9_-]{1,128}$') and
    (external_customer_id is null or external_customer_id ~ '^[a-fA-F0-9-]{36}$') and
    (product_id is null or product_id ~ '^[a-zA-Z0-9_-]{1,128}$') and
    (price_id is null or price_id ~ '^[a-zA-Z0-9_-]{1,128}$') and
    (amount_minor is null or amount_minor in (1500,15000)) and
    (currency is null or currency='ils') and (interval_count is null or interval_count=1) and
    (provider_status is null or provider_status in ('incomplete','incomplete_expired','trialing','active','past_due','canceled','unpaid','paused')) and
    (event_timestamp is null or pg_catalog.isfinite(event_timestamp)) and pg_catalog.isfinite(provider_modified_at) and
    (current_period_end is null or pg_catalog.isfinite(current_period_end)) and
    (past_due_at is null or pg_catalog.isfinite(past_due_at)) and
    (signed_period_end is null or pg_catalog.isfinite(signed_period_end)) and
    (paid_order_modified_at is null or pg_catalog.isfinite(paid_order_modified_at))
  );

create or replace function private.apply_venue_billing_deadline_for_venue(input_venue_id uuid,input_now timestamptz)
returns void language plpgsql security definer volatile set search_path='' as $function$
declare entitlement private.venue_billing_entitlements%rowtype;
begin
  if input_now is null or not pg_catalog.isfinite(input_now) then raise exception using errcode='P0001',message='VALIDATION_FAILED'; end if;
  perform private.lock_venue_billing(input_venue_id);
  select * into entitlement from private.venue_billing_entitlements where venue_id=input_venue_id for update;
  if not found then return; end if;
  if entitlement.status='active' and input_now>=entitlement.paid_through_at then
    update private.venue_billing_entitlements set status='provider_stale',expiry_reason=null,
      grace_started_at=entitlement.paid_through_at,grace_expires_at=entitlement.paid_through_at+interval '168 hours'
    where venue_id=input_venue_id returning * into entitlement;
  end if;
  if (entitlement.status in ('past_due','provider_stale','legacy_grace') and input_now>=entitlement.grace_expires_at)
    or (entitlement.status='canceling' and input_now>=entitlement.paid_through_at) then
    update private.venue_billing_entitlements set status='expired',expiry_reason=entitlement.status::text,
      grace_started_at=null,grace_expires_at=null where venue_id=input_venue_id;
    update public.events set status='cancelled',cancelled_at=input_now,cancel_reason='This event has been cancelled.'
    where host_venue_id=input_venue_id and status='published' and starts_at>input_now;
  end if;
end;
$function$;

-- Called only with a persisted signed receipt, under the venue advisory lock.
-- Reconciliation has the same binding checks and a separate paid-order lane.
create function private.project_polar_venue_billing(input_webhook_id text,input_reconciled boolean,input_audit_request_id uuid)
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
begin
  select * into strict r from private.polar_webhook_events where webhook_id=input_webhook_id;
  perform private.lock_venue_billing(r.venue_id);
  select * into strict e from private.venue_billing_entitlements where venue_id=r.venue_id for update;
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
  perform private.apply_venue_billing_deadline_for_venue(r.venue_id,checked_at);
  select * into strict e from private.venue_billing_entitlements where venue_id=r.venue_id;
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
    update public.events set status='cancelled',cancelled_at=checked_at,cancel_reason='This event has been cancelled.'
    where host_venue_id=r.venue_id and status='published' and starts_at>checked_at;
  end if;
  perform private.apply_venue_billing_deadline_for_venue(r.venue_id,checked_at);
  perform private.write_security_audit(null,'venue.billing.apply','venue',r.venue_id,'succeeded',input_audit_request_id,'{}'::jsonb);
  return 'applied';
end;
$function$;

create function public.apply_polar_venue_billing_event(
  input_webhook_id text,input_event_type public.polar_venue_billing_event_type,input_event_timestamp timestamptz,
  input_provider_modified_at timestamptz,input_organization_id text,input_subscription_id text,input_checkout_id text,
  input_checkout_attempt_id uuid,input_venue_id uuid,input_customer_id text,input_external_customer_id text,
  input_product_id text,input_price_id text,input_amount_minor integer,input_currency text,
  input_interval public.venue_billing_interval,input_interval_count integer,input_provider_status text,
  input_cancel_at_period_end boolean,input_current_period_end timestamptz,input_past_due_at timestamptz,
  input_order_id text,input_billing_reason text,input_audit_request_id uuid,input_signed_period_end timestamptz default null
) returns table(outcome public.venue_billing_apply_outcome,cleanup_actor_id uuid)
language plpgsql security definer volatile set search_path='' as $function$
declare
  a private.venue_billing_checkout_attempts%rowtype;
  existing private.polar_webhook_events%rowtype;
  result public.venue_billing_apply_outcome;
  cleanup public.venue_billing_apply_outcome;
begin
  if input_webhook_id is null or input_webhook_id !~ '^[a-zA-Z0-9_-]{1,128}$' or input_event_type is null
    or input_event_timestamp is null or not pg_catalog.isfinite(input_event_timestamp)
    or input_provider_modified_at is null or not pg_catalog.isfinite(input_provider_modified_at)
    or input_organization_id is null or input_subscription_id is null or input_customer_id is null or input_product_id is null
    or input_checkout_attempt_id is null or input_venue_id is null
    or (input_event_type='order.paid' and (input_order_id is null or input_billing_reason is distinct from 'subscription_cycle' or input_past_due_at is not null or input_external_customer_id is null))
    or (input_event_type<>'order.paid' and (input_order_id is not null or input_billing_reason is not null or input_signed_period_end is not null or input_checkout_id is null))
    or (input_external_customer_id is null and (input_event_type<>'subscription.revoked' or input_provider_status is distinct from 'canceled'))
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
    if existing.outcome='erasure_cleanup_required' then return query select existing.outcome,a.owner_id; return; end if;
    if existing.outcome='erasure_cleanup_complete' then return query select existing.outcome,null::uuid; return; end if;
    if existing.outcome='reconciliation_required' then return query select existing.outcome,null::uuid; return; end if;
    return query select 'duplicate'::public.venue_billing_apply_outcome,null::uuid;return;
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
    select c.outcome into cleanup from private.polar_account_erasure_cleanup c where c.actor_id=a.owner_id;
    if not found then raise exception using errcode='P0001',message='INVALID_TRANSITION'; end if;
    if input_external_customer_id is not null then
      cleanup:='erasure_cleanup_required';
      update private.polar_account_erasure_cleanup set outcome=cleanup,completed_at=null where actor_id=a.owner_id;
    end if;
    insert into private.polar_webhook_events(webhook_id,event_type,venue_id,checkout_attempt_id,provider_modified_at,processed_at,outcome)
    values(input_webhook_id,input_event_type,input_venue_id,input_checkout_attempt_id,input_provider_modified_at,statement_timestamp(),cleanup);
    return query select cleanup,case when cleanup='erasure_cleanup_required' then a.owner_id else null::uuid end;return;
  end if;
  if input_external_customer_id is null then raise exception using errcode='P0001',message='INVALID_TRANSITION'; end if;
  insert into private.polar_webhook_events(webhook_id,event_type,venue_id,polar_subscription_id,polar_order_id,provider_modified_at,outcome,event_timestamp,checkout_attempt_id,organization_id,checkout_id,customer_id,external_customer_id,product_id,price_id,amount_minor,currency,billing_interval,interval_count,provider_status,cancel_at_period_end,current_period_end,past_due_at,signed_period_end)
  values(input_webhook_id,input_event_type,input_venue_id,input_subscription_id,input_order_id,input_provider_modified_at,'reconciliation_required',input_event_timestamp,input_checkout_attempt_id,input_organization_id,input_checkout_id,input_customer_id,input_external_customer_id,input_product_id,input_price_id,input_amount_minor,input_currency,input_interval,input_interval_count,input_provider_status,input_cancel_at_period_end,input_current_period_end,input_past_due_at,input_signed_period_end);
  if input_event_type='order.paid' then
    update private.polar_webhook_events set paid_order_modified_at=input_provider_modified_at where webhook_id=input_webhook_id;
  end if;
  result:=private.project_polar_venue_billing(input_webhook_id,false,input_audit_request_id);
  update private.polar_webhook_events set outcome=result,processed_at=case when result='reconciliation_required' then null else statement_timestamp() end where webhook_id=input_webhook_id;
  return query select result,null::uuid;
end;
$function$;

create function public.complete_polar_venue_billing_reconciliation(
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
  update private.polar_webhook_events set provider_modified_at=input_provider_modified_at,checkout_id=coalesce(input_checkout_id,r.checkout_id),
    price_id=input_price_id,amount_minor=input_amount_minor,currency=input_currency,billing_interval=input_interval,interval_count=input_interval_count,
    provider_status=input_provider_status,cancel_at_period_end=input_cancel_at_period_end,current_period_end=input_current_period_end where webhook_id=input_webhook_id;
  result:=private.project_polar_venue_billing(input_webhook_id,true,input_audit_request_id);
  update private.polar_webhook_events set outcome=result,processed_at=statement_timestamp() where webhook_id=input_webhook_id;
  return result;
end;
$function$;

create or replace function public.complete_polar_account_erasure_cleanup(input_actor_id uuid,input_request_id uuid)
returns void language plpgsql security definer volatile set search_path='' as $function$
declare owned_venue_id uuid;
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
  update private.polar_webhook_events w set polar_subscription_id=null,polar_order_id=null,organization_id=null,checkout_id=null,
    customer_id=null,external_customer_id=null,product_id=null,price_id=null,amount_minor=null,currency=null,billing_interval=null,
    interval_count=null,provider_status=null,cancel_at_period_end=null,current_period_end=null,past_due_at=null,signed_period_end=null,paid_order_modified_at=null,
    outcome=case when w.outcome in ('erasure_cleanup_required','reconciliation_required') then 'erasure_cleanup_complete'::public.venue_billing_apply_outcome else w.outcome end,
    processed_at=coalesce(w.processed_at,statement_timestamp())
  from public.venues v where v.id=w.venue_id and v.owner_id=input_actor_id;
  update private.polar_account_erasure_cleanup set completed_at=statement_timestamp(),outcome='erasure_cleanup_complete' where actor_id=input_actor_id and completed_at is null;
end;
$function$;

revoke all on function private.retain_erased_checkout_binding(),private.project_polar_venue_billing(text,boolean,uuid) from public,anon,authenticated,service_role;
revoke all on function public.apply_polar_venue_billing_event(text,public.polar_venue_billing_event_type,timestamptz,timestamptz,text,text,text,uuid,uuid,text,text,text,text,integer,text,public.venue_billing_interval,integer,text,boolean,timestamptz,timestamptz,text,text,uuid,timestamptz),
  public.complete_polar_venue_billing_reconciliation(text,text,timestamptz,text,text,text,text,text,integer,text,public.venue_billing_interval,integer,text,boolean,timestamptz,uuid)
from public,anon,authenticated,service_role;
grant execute on function public.apply_polar_venue_billing_event(text,public.polar_venue_billing_event_type,timestamptz,timestamptz,text,text,text,uuid,uuid,text,text,text,text,integer,text,public.venue_billing_interval,integer,text,boolean,timestamptz,timestamptz,text,text,uuid,timestamptz),
  public.complete_polar_venue_billing_reconciliation(text,text,timestamptz,text,text,text,text,text,integer,text,public.venue_billing_interval,integer,text,boolean,timestamptz,uuid)
to service_role;
commit;
