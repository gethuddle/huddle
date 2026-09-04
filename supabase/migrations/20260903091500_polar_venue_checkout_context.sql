begin;

-- This read never advances entitlement or releases a reservation. Actor identity
-- is supplied only by the authenticated server, not by browser RPC callers.
create function public.get_venue_checkout_context(input_actor_id uuid,input_venue_id uuid,input_attempt_id uuid,input_checkout_id text)
returns jsonb language plpgsql security definer stable set search_path='' as $function$
declare a private.venue_billing_checkout_attempts%rowtype;
begin
  if (input_attempt_id is null) = (input_checkout_id is null) then
    raise exception using errcode='P0001',message='VALIDATION_FAILED';
  end if;
  if not private.actor_is_venue_billing_owner(input_actor_id,input_venue_id)
    or not private.actor_manages_venue(input_actor_id,input_venue_id)
    or not exists(select 1 from public.venues v where v.id=input_venue_id and v.archived_at is null and v.suspended_at is null) then
    raise exception using errcode='P0001',message='NOT_FOUND';
  end if;
  select * into a from private.venue_billing_checkout_attempts c
  where c.venue_id=input_venue_id and c.owner_id=input_actor_id and c.erased_at is null
    and ((input_attempt_id is not null and c.id=input_attempt_id) or
      (input_checkout_id is not null and c.polar_checkout_id=input_checkout_id))
    and not exists(select 1 from private.venue_billing_checkout_attempts newer where newer.venue_id=c.venue_id and newer.generation>c.generation);
  if not found then raise exception using errcode='P0001',message='NOT_FOUND'; end if;
  return pg_catalog.jsonb_build_object('attemptId',a.id,'createdAt',a.created_at,'interval',a.interval,
    'state',a.state,'generation',a.generation,'checkoutId',a.polar_checkout_id,
    'expiresAt',a.checkout_expires_at,'organizationId',a.polar_organization_id,
    'productId',a.polar_product_id,'priceId',a.polar_product_price_id,'amount',a.amount,
    'currency',a.currency,'intervalCount',a.interval_count,'externalCustomerId',a.external_customer_id);
end;
$function$;

create function public.mark_venue_checkout_uncertain(input_attempt_id uuid)
returns void language plpgsql security definer volatile set search_path='' as $function$
declare a private.venue_billing_checkout_attempts%rowtype;
begin
  a:=private.assert_current_venue_checkout(input_attempt_id);
  if a.state not in ('reserved','uncertain') then raise exception using errcode='P0001',message='INVALID_TRANSITION'; end if;
  update private.venue_billing_checkout_attempts set state='uncertain' where id=a.id;
end;
$function$;

-- Action-only evidence reconciliation. Unlike the fresh attachment API, a
-- confirmed/terminal provider snapshot may legitimately have elapsed expiry.
create function public.reconcile_venue_billing_checkout(
  input_attempt_id uuid,input_checkout_id text,input_checkout_expires_at timestamptz,
  input_organization_id text,input_product_id text,input_product_price_id text,input_amount integer,
  input_currency text,input_interval public.venue_billing_interval,input_interval_count integer,
  input_external_customer_id text,input_status text
)
returns void language plpgsql security definer volatile set search_path='' as $function$
declare a private.venue_billing_checkout_attempts%rowtype;
begin
  a:=private.assert_current_venue_checkout(input_attempt_id);
  if input_status is null or input_status not in ('confirmed','succeeded','expired','failed')
    or input_interval is distinct from a.interval or input_interval_count is distinct from 1
    or input_currency is distinct from 'ils' or input_external_customer_id is distinct from a.owner_id::text
    or input_amount is distinct from (case when a.interval='month' then 1500 else 15000 end)
    or input_checkout_expires_at is null or not pg_catalog.isfinite(input_checkout_expires_at)
    or input_checkout_id is null or input_organization_id is null or input_product_id is null or input_product_price_id is null then
    raise exception using errcode='P0001',message='VALIDATION_FAILED';
  end if;
  if a.state='attached' and
    (a.polar_checkout_id,a.checkout_expires_at,a.polar_organization_id,a.polar_product_id,a.polar_product_price_id)
    is distinct from (input_checkout_id,input_checkout_expires_at,input_organization_id,input_product_id,input_product_price_id) then
    raise exception using errcode='P0001',message='INVALID_TRANSITION';
  end if;
  update private.venue_billing_checkout_attempts set
    state=case when input_status='expired' then 'expired' when input_status='failed' then 'failed' else 'attached' end,
    failure_code=case when input_status='expired' then 'expired'::public.venue_billing_checkout_failure_code when input_status='failed' then 'provider_failed'::public.venue_billing_checkout_failure_code else null end,
    closed_at=case when input_status in ('expired','failed') then statement_timestamp() else null end,
    polar_checkout_id=input_checkout_id,checkout_expires_at=input_checkout_expires_at,
    polar_organization_id=input_organization_id,polar_product_id=input_product_id,polar_product_price_id=input_product_price_id,
    amount=input_amount,currency=input_currency,interval_count=input_interval_count,external_customer_id=input_external_customer_id
  where id=a.id;
end;
$function$;
revoke all on function public.reconcile_venue_billing_checkout(uuid,text,timestamptz,text,text,text,integer,text,public.venue_billing_interval,integer,text,text) from public,anon,authenticated;
grant execute on function public.reconcile_venue_billing_checkout(uuid,text,timestamptz,text,text,text,integer,text,public.venue_billing_interval,integer,text,text) to service_role;
revoke all on function public.get_venue_checkout_context(uuid,uuid,uuid,text),public.mark_venue_checkout_uncertain(uuid) from public,anon,authenticated;
grant execute on function public.get_venue_checkout_context(uuid,uuid,uuid,text),public.mark_venue_checkout_uncertain(uuid) to service_role;
commit;
