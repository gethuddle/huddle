begin;

create type public.venue_billing_status as enum
  ('inactive','confirming','active','past_due','canceling','provider_stale','legacy_grace','expired');
create type public.venue_billing_interval as enum ('month','year');
create type public.venue_billing_checkout_failure_code as enum
  ('request_rejected','not_created_after_timeout','expired','provider_failed');
create type public.polar_venue_billing_event_type as enum
  ('subscription.created','subscription.active','subscription.canceled','subscription.uncanceled',
   'subscription.cycled','subscription.past_due','subscription.revoked','order.paid');
create type public.venue_billing_apply_outcome as enum
  ('applied','duplicate','stale','observed','ignored','reconciliation_required',
   'erasure_cleanup_required','erasure_cleanup_complete');

create table private.venue_billing_entitlements (
  venue_id uuid primary key references public.venues(id) on delete restrict,
  status public.venue_billing_status not null default 'inactive',
  interval public.venue_billing_interval,
  interval_count integer,
  polar_customer_id text,
  polar_subscription_id text,
  polar_product_id text,
  polar_product_price_id text,
  amount integer,
  currency text,
  paid_through_at timestamptz,
  grace_started_at timestamptz,
  grace_expires_at timestamptz,
  subscription_modified_at timestamptz,
  last_paid_order_id text,
  last_paid_order_at timestamptz,
  last_webhook_id text,
  first_activated_at timestamptz,
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  constraint venue_billing_identity_check check (
    (status not in ('confirming','active','past_due','canceling','provider_stale') or
      (polar_customer_id is not null and polar_subscription_id is not null
       and polar_product_id is not null and polar_product_price_id is not null
       and amount is not null and currency is not null and interval is not null and interval_count is not null))
    and (interval_count is null or interval_count = 1)
    and (amount is null or (interval = 'month' and amount = 1500) or (interval = 'year' and amount = 15000))
    and (currency is null or currency = 'ils')
    and (polar_customer_id is null or polar_customer_id ~ '^[a-zA-Z0-9_-]{1,128}$')
    and (polar_subscription_id is null or polar_subscription_id ~ '^[a-zA-Z0-9_-]{1,128}$')
    and (polar_product_id is null or polar_product_id ~ '^[a-zA-Z0-9_-]{1,128}$')
    and (polar_product_price_id is null or polar_product_price_id ~ '^[a-zA-Z0-9_-]{1,128}$')
    and (last_paid_order_id is null or last_paid_order_id ~ '^[a-zA-Z0-9_-]{1,128}$')
    and (last_webhook_id is null or last_webhook_id ~ '^[a-zA-Z0-9_-]{1,128}$')
  ),
  constraint venue_billing_paid_period_check check (status not in ('active','canceling') or paid_through_at is not null),
  constraint venue_billing_grace_check check (
    (status in ('past_due','provider_stale','legacy_grace') and grace_started_at is not null
      and grace_expires_at is not null and grace_expires_at = grace_started_at + interval '168 hours')
    or (status not in ('past_due','provider_stale','legacy_grace') and grace_started_at is null and grace_expires_at is null)
  ),
  constraint venue_billing_never_paid_check check (
    status not in ('inactive','legacy_grace') or
    (polar_customer_id is null and polar_subscription_id is null and polar_product_id is null
      and polar_product_price_id is null and interval is null and interval_count is null
      and amount is null and currency is null and paid_through_at is null
      and first_activated_at is null and subscription_modified_at is null
      and last_paid_order_id is null and last_paid_order_at is null and last_webhook_id is null)
  ),
  constraint venue_billing_order_time_check check ((last_paid_order_id is null) = (last_paid_order_at is null)),
  constraint venue_billing_finite_time_check check (
    (paid_through_at is null or pg_catalog.isfinite(paid_through_at))
    and (grace_started_at is null or pg_catalog.isfinite(grace_started_at))
    and (grace_expires_at is null or pg_catalog.isfinite(grace_expires_at))
    and (subscription_modified_at is null or pg_catalog.isfinite(subscription_modified_at))
    and (last_paid_order_at is null or pg_catalog.isfinite(last_paid_order_at))
    and (first_activated_at is null or pg_catalog.isfinite(first_activated_at))
    and pg_catalog.isfinite(created_at) and pg_catalog.isfinite(updated_at)
  )
);
create unique index venue_billing_subscription_uidx on private.venue_billing_entitlements(polar_subscription_id) where polar_subscription_id is not null;
create index venue_billing_customer_idx on private.venue_billing_entitlements(polar_customer_id,venue_id) where polar_customer_id is not null;
create index venue_billing_grace_deadline_idx on private.venue_billing_entitlements(grace_expires_at,venue_id) where grace_expires_at is not null;
create index venue_billing_paid_deadline_idx on private.venue_billing_entitlements(paid_through_at,venue_id) where status in ('active','canceling');

create table private.venue_billing_checkout_attempts (
  id uuid primary key default gen_random_uuid(),
  venue_id uuid not null references public.venues(id) on delete restrict,
  owner_id uuid not null references public.profiles(id) on delete restrict,
  interval public.venue_billing_interval not null,
  generation bigint not null check (generation > 0),
  state text not null default 'reserved' check (state in ('reserved','uncertain','attached','completed','failed','expired')),
  failure_code public.venue_billing_checkout_failure_code,
  polar_checkout_id text,
  checkout_expires_at timestamptz,
  polar_organization_id text,
  polar_product_id text,
  polar_product_price_id text,
  amount integer,
  currency text,
  interval_count integer,
  external_customer_id text,
  erased_at timestamptz,
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  closed_at timestamptz,
  unique(venue_id,generation),
  constraint venue_checkout_binding_check check (
    (polar_checkout_id is null and checkout_expires_at is null and polar_organization_id is null
      and polar_product_id is null and polar_product_price_id is null and amount is null
      and currency is null and interval_count is null and external_customer_id is null)
    or (polar_checkout_id is not null and polar_checkout_id ~ '^[a-zA-Z0-9_-]{1,128}$'
      and checkout_expires_at is not null and polar_organization_id is not null
      and polar_organization_id ~ '^[a-zA-Z0-9_-]{1,128}$'
      and polar_product_id is not null and polar_product_id ~ '^[a-zA-Z0-9_-]{1,128}$'
      and polar_product_price_id is not null and polar_product_price_id ~ '^[a-zA-Z0-9_-]{1,128}$'
      and amount is not null and ((interval='month' and amount=1500) or (interval='year' and amount=15000))
      and currency is not null and currency='ils' and interval_count is not null and interval_count=1
      and external_customer_id is not null and external_customer_id=owner_id::text)
  ),
  constraint venue_checkout_state_check check (
    ((state in ('reserved','uncertain','attached') and closed_at is null and failure_code is null and erased_at is null)
      or (state in ('completed','failed','expired') and closed_at is not null))
    and (state <> 'attached' or polar_checkout_id is not null)
    and (state not in ('reserved','uncertain') or polar_checkout_id is null)
    and (state not in ('failed','expired') or failure_code is not null or erased_at is not null)
    and (erased_at is null or polar_checkout_id is null)
  )
);
create unique index venue_checkout_open_uidx on private.venue_billing_checkout_attempts(venue_id) where state in ('reserved','uncertain','attached');
create unique index venue_checkout_provider_uidx on private.venue_billing_checkout_attempts(polar_checkout_id) where polar_checkout_id is not null;
create index venue_checkout_owner_idx on private.venue_billing_checkout_attempts(owner_id,venue_id);

create table private.polar_webhook_events (
  webhook_id text primary key check (webhook_id ~ '^[a-zA-Z0-9_-]{1,128}$'),
  event_type public.polar_venue_billing_event_type not null,
  venue_id uuid references public.venues(id) on delete restrict,
  polar_subscription_id text check (polar_subscription_id ~ '^[a-zA-Z0-9_-]{1,128}$'),
  polar_order_id text check (polar_order_id ~ '^[a-zA-Z0-9_-]{1,128}$'),
  provider_modified_at timestamptz not null,
  received_at timestamptz not null default statement_timestamp(),
  processed_at timestamptz,
  outcome public.venue_billing_apply_outcome not null
);
create index polar_webhook_venue_idx on private.polar_webhook_events(venue_id,received_at);
create unique index polar_webhook_applied_order_uidx on private.polar_webhook_events(polar_order_id) where polar_order_id is not null and outcome='applied';
create table private.polar_account_erasure_cleanup (
  actor_id uuid primary key references public.profiles(id) on delete restrict,
  pending_at timestamptz not null default statement_timestamp(),
  completed_at timestamptz,
  outcome public.venue_billing_apply_outcome not null default 'erasure_cleanup_required',
  constraint polar_cleanup_state_check check (
    (outcome='erasure_cleanup_required' and completed_at is null)
    or (outcome='erasure_cleanup_complete' and completed_at is not null and completed_at >= pending_at)
  )
);

alter table private.venue_billing_entitlements enable row level security;
alter table private.venue_billing_entitlements force row level security;
alter table private.venue_billing_checkout_attempts enable row level security;
alter table private.venue_billing_checkout_attempts force row level security;
alter table private.polar_webhook_events enable row level security;
alter table private.polar_webhook_events force row level security;
alter table private.polar_account_erasure_cleanup enable row level security;
alter table private.polar_account_erasure_cleanup force row level security;
revoke all on private.venue_billing_entitlements, private.venue_billing_checkout_attempts,
  private.polar_webhook_events, private.polar_account_erasure_cleanup from public,anon,authenticated,service_role;

create function private.lock_venue_billing(input_venue_id uuid)
returns void language plpgsql security definer volatile set search_path='' as $function$
begin
  if input_venue_id is null then raise exception using errcode='P0001',message='VALIDATION_FAILED'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(input_venue_id::text, 4105));
end;
$function$;
comment on function private.lock_venue_billing(uuid) is
  'Global order: authenticated actor serializer (hash seed 4104), then venue UUID hash seed 4105, then entitlement/venue/event rows. Callbacks start at venue; erasure takes venues in sorted UUID order. Never hold across provider I/O.';

create function private.guard_venue_billing_history()
returns trigger language plpgsql security definer set search_path='' as $function$
begin
  if new.status='inactive' and old.status<>'inactive' then
    raise exception using errcode='23514',message='venue_billing_never_revert_to_inactive';
  end if;
  if new.status='legacy_grace' and old.status<>'legacy_grace' then
    raise exception using errcode='23514',message='venue_billing_legacy_grace_once';
  end if;
  if new.status='confirming' and old.status not in ('inactive','confirming') then
    raise exception using errcode='23514',message='venue_billing_confirmation_not_recovery';
  end if;
  if old.status in ('past_due','provider_stale','legacy_grace')
    and new.status in ('past_due','provider_stale','legacy_grace')
    and (new.grace_started_at is distinct from old.grace_started_at or new.grace_expires_at is distinct from old.grace_expires_at) then
    raise exception using errcode='23514',message='venue_billing_fixed_grace';
  end if;
  if old.first_activated_at is not null and new.first_activated_at is distinct from old.first_activated_at then
    raise exception using errcode='23514',message='venue_billing_first_activation_immutable';
  end if;
  new.updated_at := statement_timestamp();
  return new;
end;
$function$;
create trigger venue_billing_guard_history before update on private.venue_billing_entitlements
for each row execute function private.guard_venue_billing_history();
create trigger venue_checkout_set_updated_at before update on private.venue_billing_checkout_attempts
for each row execute function private.set_updated_at();

create function private.seed_new_venue_billing_entitlement()
returns trigger language plpgsql security definer set search_path='' as $function$
begin
  insert into private.venue_billing_entitlements(venue_id) values(new.id);
  return new;
end;
$function$;
create trigger venues_seed_billing_entitlement after insert on public.venues
for each row execute function private.seed_new_venue_billing_entitlement();
create function private.backfill_legacy_venue_billing_entitlements(input_cutover_at timestamptz)
returns void language plpgsql security definer set search_path='' as $function$
begin
  if input_cutover_at is null or not pg_catalog.isfinite(input_cutover_at) then
    raise exception using errcode='P0001',message='VALIDATION_FAILED';
  end if;
  insert into private.venue_billing_entitlements(venue_id,status,grace_started_at,grace_expires_at)
  select id,'legacy_grace',input_cutover_at,input_cutover_at+interval '168 hours' from public.venues
  on conflict(venue_id) do nothing;
end;
$function$;
select private.backfill_legacy_venue_billing_entitlements(statement_timestamp());

-- Membership remains independent of payment and archive for recovery/history.
create function private.actor_has_venue_membership(input_actor_id uuid,input_venue_id uuid)
returns boolean language sql security definer stable set search_path='' as $function$
  select private.profile_is_common_eligible(input_actor_id) and exists(
    select 1 from public.venue_memberships m where m.venue_id=input_venue_id and m.user_id=input_actor_id
      and m.status='active' and m.revoked_at is null and m.role in ('owner','admin')
  );
$function$;
create function private.actor_is_venue_billing_owner(input_actor_id uuid,input_venue_id uuid)
returns boolean language sql security definer stable set search_path='' as $function$
  select private.actor_has_venue_membership(input_actor_id,input_venue_id) and exists(
    select 1 from public.venues v where v.id=input_venue_id and v.owner_id=input_actor_id
  );
$function$;

create function private.venue_billing_effective_state(input_venue_id uuid,input_now timestamptz)
returns text language sql security definer stable set search_path='' as $function$
  select case
    when input_now is null then 'expired'
    when e.status in ('past_due','provider_stale','legacy_grace') and input_now>=e.grace_expires_at then 'expired'
    when e.status='canceling' and input_now>=e.paid_through_at then 'expired'
    when e.status='active' and input_now>=e.paid_through_at+interval '168 hours' then 'expired'
    when e.status='active' and input_now>=e.paid_through_at then 'provider_stale'
    when e.status='inactive' and exists(select 1 from private.venue_billing_checkout_attempts a
      where a.venue_id=e.venue_id and a.state in ('reserved','uncertain','attached')) then 'confirming'
    when e.status='inactive' then 'payment_required'
    else e.status::text end
  from private.venue_billing_entitlements e where e.venue_id=input_venue_id;
$function$;
create function private.venue_allows_public_presence(input_venue_id uuid,input_now timestamptz)
returns boolean language sql security definer stable set search_path='' as $function$
  select coalesce(private.venue_billing_effective_state(input_venue_id,input_now) in ('active','canceling'),false)
    and exists(select 1 from public.venues v where v.id=input_venue_id and v.archived_at is null
      and v.suspended_at is null and v.verification_status<>'suspended');
$function$;
create function private.venue_allows_publishing(input_venue_id uuid,input_starts_at timestamptz,input_now timestamptz)
returns boolean language sql security definer stable set search_path='' as $function$
  select coalesce(private.venue_allows_public_presence(input_venue_id,input_now) and input_starts_at>input_now
    and exists(select 1 from private.venue_billing_entitlements e where e.venue_id=input_venue_id
      and (e.status='active' or input_starts_at<e.paid_through_at)),false);
$function$;
-- The UUID here is an EVENT id: acquisition is constrained by that event's start.
create function private.venue_allows_event_acquisition(input_event_id uuid,input_now timestamptz)
returns boolean language sql security definer stable set search_path='' as $function$
  select exists(select 1 from public.events e where e.id=input_event_id and e.host_venue_id is not null
    and e.status='published' and private.venue_allows_publishing(e.host_venue_id,e.starts_at,input_now));
$function$;
create function private.venue_allows_draft_work(input_venue_id uuid,input_now timestamptz)
returns boolean language sql security definer stable set search_path='' as $function$
  select coalesce(private.venue_billing_effective_state(input_venue_id,input_now)<>'expired',false)
    and exists(select 1 from public.venues v where v.id=input_venue_id and v.archived_at is null
      and v.suspended_at is null and v.verification_status<>'suspended');
$function$;

create function private.apply_venue_billing_deadline_for_venue(input_venue_id uuid,input_now timestamptz)
returns void language plpgsql security definer volatile set search_path='' as $function$
declare
  entitlement private.venue_billing_entitlements%rowtype;
begin
  if input_now is null or not pg_catalog.isfinite(input_now) then
    raise exception using errcode='P0001',message='VALIDATION_FAILED';
  end if;
  -- Callers enter actor serialization first when authenticated. Reacquiring the
  -- transaction lock is safe and makes this primitive independently lock-safe.
  perform private.lock_venue_billing(input_venue_id);
  select * into entitlement from private.venue_billing_entitlements where venue_id=input_venue_id for update;
  if not found then return; end if;
  if entitlement.status='active' and input_now>=entitlement.paid_through_at then
    update private.venue_billing_entitlements set status='provider_stale',
      grace_started_at=entitlement.paid_through_at,grace_expires_at=entitlement.paid_through_at+interval '168 hours'
    where venue_id=input_venue_id returning * into entitlement;
  end if;
  if (entitlement.status in ('past_due','provider_stale','legacy_grace') and input_now>=entitlement.grace_expires_at)
    or (entitlement.status='canceling' and input_now>=entitlement.paid_through_at) then
    update private.venue_billing_entitlements set status='expired',grace_started_at=null,grace_expires_at=null where venue_id=input_venue_id;
    update public.events set status='cancelled',cancelled_at=input_now,cancel_reason='This event has been cancelled.'
    where host_venue_id=input_venue_id and status='published' and starts_at>input_now;
  end if;
end;
$function$;

create function public.get_venue_billing_context(input_venue_id uuid)
returns jsonb language plpgsql security definer volatile set search_path='' as $function$
declare
  actor_id uuid := private.assert_common_actor();
  checked_at timestamptz := statement_timestamp();
  e private.venue_billing_entitlements%rowtype;
  v public.venues%rowtype;
  effective_state text;
  is_owner boolean;
  pending boolean;
  drafts boolean;
begin
  perform private.lock_venue_billing(input_venue_id);
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

create function public.reserve_venue_billing_checkout(input_venue_id uuid,input_interval public.venue_billing_interval,input_request_id uuid)
returns table(attempt_id uuid,generation bigint,created_by_this_call boolean)
language plpgsql security definer volatile set search_path='' as $function$
declare
  actor_id uuid := private.assert_common_actor();
  attempt private.venue_billing_checkout_attempts%rowtype;
  e private.venue_billing_entitlements%rowtype;
begin
  if input_interval is null then raise exception using errcode='P0001',message='VALIDATION_FAILED'; end if;
  perform private.lock_venue_billing(input_venue_id);
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
comment on function public.reserve_venue_billing_checkout(uuid,public.venue_billing_interval,uuid) is
  'Only created_by_this_call may create at Polar. Immutable attempt UUID is the callback generation token; bigint orders venue generations. Request ID is reserved for sanitized audit correlation.';

-- Service callbacks resolve the untrusted token without row locks, then lock the
-- venue and recheck the same immutable generation, owner, archive, and binding.
create function private.assert_current_venue_checkout(input_attempt_id uuid)
returns private.venue_billing_checkout_attempts language plpgsql security definer volatile set search_path='' as $function$
declare
  venue_id_to_lock uuid;
  attempt private.venue_billing_checkout_attempts%rowtype;
begin
  select a.venue_id into venue_id_to_lock from private.venue_billing_checkout_attempts a where a.id=input_attempt_id;
  if venue_id_to_lock is null then raise exception using errcode='P0001',message='INVALID_TRANSITION'; end if;
  perform private.lock_venue_billing(venue_id_to_lock);
  perform 1 from private.venue_billing_entitlements e where e.venue_id=venue_id_to_lock for update;
  select * into strict attempt from private.venue_billing_checkout_attempts where id=input_attempt_id for update;
  if attempt.state not in ('reserved','uncertain','attached') or attempt.erased_at is not null
    or not exists(select 1 from public.venues v where v.id=attempt.venue_id and v.owner_id=attempt.owner_id
      and v.archived_at is null and v.suspended_at is null)
    or not private.actor_is_venue_billing_owner(attempt.owner_id,attempt.venue_id)
    or exists(select 1 from private.venue_billing_entitlements e where e.venue_id=attempt.venue_id and e.polar_subscription_id is not null)
    or exists(select 1 from private.venue_billing_checkout_attempts a where a.venue_id=attempt.venue_id and a.generation>attempt.generation) then
    raise exception using errcode='P0001',message='INVALID_TRANSITION';
  end if;
  return attempt;
end;
$function$;

create function public.attach_venue_billing_checkout(
  input_attempt_id uuid,input_checkout_id text,input_checkout_expires_at timestamptz,
  input_organization_id text,input_product_id text,input_product_price_id text,input_amount integer,
  input_currency text,input_interval public.venue_billing_interval,input_interval_count integer,
  input_external_customer_id text,input_request_id uuid
)
returns void language plpgsql security definer volatile set search_path='' as $function$
declare attempt private.venue_billing_checkout_attempts%rowtype;
begin
  attempt:=private.assert_current_venue_checkout(input_attempt_id);
  if input_interval is distinct from attempt.interval or input_interval_count is distinct from 1
    or input_currency is distinct from 'ils' or input_external_customer_id is distinct from attempt.owner_id::text
    or input_amount is distinct from (case when attempt.interval='month' then 1500 else 15000 end)
    or input_checkout_expires_at is null or not pg_catalog.isfinite(input_checkout_expires_at)
    or input_checkout_expires_at<=statement_timestamp()
    or input_checkout_id is null or input_organization_id is null or input_product_id is null or input_product_price_id is null then
    raise exception using errcode='P0001',message='VALIDATION_FAILED';
  end if;
  if attempt.state='attached' then
    if (attempt.polar_checkout_id,attempt.checkout_expires_at,attempt.polar_organization_id,attempt.polar_product_id,attempt.polar_product_price_id)
      is distinct from (input_checkout_id,input_checkout_expires_at,input_organization_id,input_product_id,input_product_price_id) then
      raise exception using errcode='P0001',message='INVALID_TRANSITION';
    end if;
    return;
  end if;
  update private.venue_billing_checkout_attempts set state='attached',polar_checkout_id=input_checkout_id,
    checkout_expires_at=input_checkout_expires_at,polar_organization_id=input_organization_id,
    polar_product_id=input_product_id,polar_product_price_id=input_product_price_id,amount=input_amount,
    currency=input_currency,interval_count=input_interval_count,external_customer_id=input_external_customer_id
  where id=input_attempt_id;
end;
$function$;

create function public.fail_venue_billing_checkout(input_attempt_id uuid,input_failure_code public.venue_billing_checkout_failure_code,input_request_id uuid)
returns void language plpgsql security definer volatile set search_path='' as $function$
declare attempt private.venue_billing_checkout_attempts%rowtype;
begin
  attempt:=private.assert_current_venue_checkout(input_attempt_id);
  if attempt.state not in ('reserved','uncertain') or input_failure_code is null
    or input_failure_code not in ('request_rejected','not_created_after_timeout') then
    raise exception using errcode='P0001',message='INVALID_TRANSITION';
  end if;
  if input_failure_code='not_created_after_timeout' and statement_timestamp()<attempt.created_at+interval '15 minutes' then
    raise exception using errcode='P0001',message='VENUE_BILLING_PENDING';
  end if;
  update private.venue_billing_checkout_attempts set state='failed',failure_code=input_failure_code,closed_at=statement_timestamp() where id=input_attempt_id;
end;
$function$;
create function public.close_venue_billing_checkout(input_attempt_id uuid,input_checkout_id text,input_failure_code public.venue_billing_checkout_failure_code,input_request_id uuid)
returns void language plpgsql security definer volatile set search_path='' as $function$
declare attempt private.venue_billing_checkout_attempts%rowtype;
begin
  attempt:=private.assert_current_venue_checkout(input_attempt_id);
  if attempt.state<>'attached' or input_checkout_id is distinct from attempt.polar_checkout_id
    or input_failure_code is null or input_failure_code not in ('expired','provider_failed') then
    raise exception using errcode='P0001',message='INVALID_TRANSITION';
  end if;
  update private.venue_billing_checkout_attempts set state=case when input_failure_code='expired' then 'expired' else 'failed' end,
    failure_code=input_failure_code,closed_at=statement_timestamp() where id=input_attempt_id;
end;
$function$;

create function public.complete_polar_account_erasure_cleanup(input_actor_id uuid,input_request_id uuid)
returns void language plpgsql security definer volatile set search_path='' as $function$
declare owned_venue_id uuid;
begin
  if input_actor_id is null then raise exception using errcode='P0001',message='VALIDATION_FAILED'; end if;
  -- Service completion cannot use auth.uid(); use the same actor key derivation
  -- as the authenticated erasure preparation, followed by sorted venue locks.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(input_actor_id::text,4104));
  for owned_venue_id in select v.id from public.venues v where v.owner_id=input_actor_id order by v.id loop
    perform private.lock_venue_billing(owned_venue_id);
  end loop;
  if not exists(select 1 from public.profiles p where p.id=input_actor_id and p.deleted_at is not null)
    or not exists(select 1 from private.polar_account_erasure_cleanup c where c.actor_id=input_actor_id)
    or exists(select 1 from public.venues v where v.owner_id=input_actor_id and v.archived_at is null)
    or exists(select 1 from private.venue_billing_entitlements e join public.venues v on v.id=e.venue_id
      where v.owner_id=input_actor_id and (e.status<>'expired' or e.polar_customer_id is not null or e.polar_subscription_id is not null
        or e.last_paid_order_id is not null or e.last_webhook_id is not null))
    or exists(select 1 from private.venue_billing_checkout_attempts a where a.owner_id=input_actor_id
      and (a.erased_at is null or a.polar_checkout_id is not null or a.external_customer_id is not null))
    or exists(select 1 from private.polar_webhook_events w join public.venues v on v.id=w.venue_id
      where v.owner_id=input_actor_id and (w.polar_subscription_id is not null or w.polar_order_id is not null)) then
    raise exception using errcode='P0001',message='INVALID_TRANSITION';
  end if;
  update private.polar_account_erasure_cleanup set completed_at=statement_timestamp(),outcome='erasure_cleanup_complete'
  where actor_id=input_actor_id and completed_at is null;
end;
$function$;

-- Explicitly revoke default PUBLIC execute and Supabase default grants. Private
-- functions are callable only as postgres-owned implementation internals.
revoke all on function private.lock_venue_billing(uuid),private.guard_venue_billing_history(),
  private.seed_new_venue_billing_entitlement(),private.backfill_legacy_venue_billing_entitlements(timestamptz),
  private.actor_has_venue_membership(uuid,uuid),private.actor_is_venue_billing_owner(uuid,uuid),
  private.venue_billing_effective_state(uuid,timestamptz),private.venue_allows_public_presence(uuid,timestamptz),
  private.venue_allows_publishing(uuid,timestamptz,timestamptz),private.venue_allows_event_acquisition(uuid,timestamptz),
  private.venue_allows_draft_work(uuid,timestamptz),private.apply_venue_billing_deadline_for_venue(uuid,timestamptz),
  private.assert_current_venue_checkout(uuid)
from public,anon,authenticated,service_role;
grant execute on function private.backfill_legacy_venue_billing_entitlements(timestamptz) to postgres;
revoke all on function public.get_venue_billing_context(uuid),
  public.reserve_venue_billing_checkout(uuid,public.venue_billing_interval,uuid),
  public.attach_venue_billing_checkout(uuid,text,timestamptz,text,text,text,integer,text,public.venue_billing_interval,integer,text,uuid),
  public.fail_venue_billing_checkout(uuid,public.venue_billing_checkout_failure_code,uuid),
  public.close_venue_billing_checkout(uuid,text,public.venue_billing_checkout_failure_code,uuid),
  public.complete_polar_account_erasure_cleanup(uuid,uuid)
from public,anon,authenticated,service_role;
grant execute on function public.get_venue_billing_context(uuid),public.reserve_venue_billing_checkout(uuid,public.venue_billing_interval,uuid) to authenticated;
grant execute on function public.attach_venue_billing_checkout(uuid,text,timestamptz,text,text,text,integer,text,public.venue_billing_interval,integer,text,uuid),
  public.fail_venue_billing_checkout(uuid,public.venue_billing_checkout_failure_code,uuid),
  public.close_venue_billing_checkout(uuid,text,public.venue_billing_checkout_failure_code,uuid),
  public.complete_polar_account_erasure_cleanup(uuid,uuid) to service_role;

commit;
