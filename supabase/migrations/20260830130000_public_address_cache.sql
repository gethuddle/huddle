begin;

create extension if not exists pgcrypto with schema extensions;

comment on extension pgcrypto is
  'Cryptographic digest support for non-reversible Huddle public-address cache keys.';

create table private.public_address_cache (
  query_digest text primary key
    check (query_digest ~ '^[0-9a-f]{64}$'),
  result_payload jsonb not null
    check (jsonb_typeof(result_payload) = 'array')
    check (jsonb_array_length(result_payload) <= 5),
  expires_at timestamptz not null,
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp()
);

comment on table private.public_address_cache is
  'Server-only cache of bounded public geocoder DTOs keyed by a SHA-256 digest. It stores no user identity or raw query.';

create index public_address_cache_expiry_idx
  on private.public_address_cache (expires_at);

create trigger public_address_cache_set_updated_at
before update on private.public_address_cache
for each row execute function private.set_updated_at();

create table private.public_geocoder_rate_limit (
  singleton boolean primary key default true check (singleton),
  next_allowed_at timestamptz not null default '-infinity'::timestamptz,
  updated_at timestamptz not null default statement_timestamp()
);

comment on table private.public_geocoder_rate_limit is
  'Singleton row serializing public Nominatim claims to an absolute maximum of one upstream request per second.';

insert into private.public_geocoder_rate_limit (singleton)
values (true)
on conflict (singleton) do nothing;

create trigger public_geocoder_rate_limit_set_updated_at
before update on private.public_geocoder_rate_limit
for each row execute function private.set_updated_at();

create or replace function private.normalize_public_address_term(input_value text)
returns text
language sql
immutable
strict
set search_path = ''
as $function$
  select pg_catalog.lower(
    pg_catalog.regexp_replace(pg_catalog.btrim(input_value), '[[:space:]]+', ' ', 'g')
  )
$function$;

comment on function private.normalize_public_address_term(text) is
  'Normalizes a public query component only for digest construction; callers must never provide private-home values.';

create or replace function public.claim_public_address_search(
  input_query text,
  input_city text,
  input_country_code text,
  input_location_kind text
)
returns table (
  query_digest text,
  result_payload jsonb,
  cache_hit boolean,
  claim_granted boolean,
  retry_after_ms integer
)
language plpgsql
security definer
set search_path = ''
as $function$
declare
  normalized_query text;
  normalized_city text;
  normalized_country text;
  normalized_kind text;
  target_digest text;
  cached_payload jsonb;
  allowed_at timestamptz;
  claimed_at timestamptz;
begin
  normalized_kind := pg_catalog.lower(pg_catalog.btrim(coalesce(input_location_kind, '')));
  if normalized_kind = 'home' then
    raise exception using errcode = 'P0001', message = 'LOCATION_NOT_AUTHORIZED';
  end if;
  if normalized_kind not in ('venue', 'public_place') then
    raise exception using errcode = 'P0001', message = 'VALIDATION_FAILED';
  end if;

  normalized_query := private.normalize_public_address_term(input_query);
  normalized_city := private.normalize_public_address_term(input_city);
  normalized_country := private.normalize_public_address_term(input_country_code);
  if pg_catalog.char_length(normalized_query) not between 3 and 160
     or pg_catalog.char_length(normalized_city) not between 2 and 80
     or normalized_country <> 'il' then
    raise exception using errcode = 'P0001', message = 'VALIDATION_FAILED';
  end if;

  target_digest := pg_catalog.encode(
    extensions.digest(
      pg_catalog.convert_to(
        normalized_query || pg_catalog.chr(31) || normalized_city || pg_catalog.chr(31) || normalized_country,
        'UTF8'
      ),
      'sha256'
    ),
    'hex'
  );

  select cache.result_payload
  into cached_payload
  from private.public_address_cache as cache
  where cache.query_digest = target_digest
    and cache.expires_at > pg_catalog.clock_timestamp();

  if found then
    return query select target_digest, cached_payload, true, false, 0;
    return;
  end if;

  delete from private.public_address_cache as cache
  where cache.query_digest = target_digest
    and cache.expires_at <= pg_catalog.clock_timestamp();

  select rate.next_allowed_at
  into allowed_at
  from private.public_geocoder_rate_limit as rate
  where rate.singleton
  for update;

  if not found then
    raise exception using errcode = 'P0001', message = 'INTERNAL_ERROR';
  end if;

  claimed_at := pg_catalog.clock_timestamp();
  if allowed_at > claimed_at then
    return query
    select
      target_digest,
      null::jsonb,
      false,
      false,
      greatest(
        1,
        pg_catalog.ceil(pg_catalog.date_part('epoch', allowed_at - claimed_at) * 1000)::integer
      );
    return;
  end if;

  update private.public_geocoder_rate_limit
  set next_allowed_at = claimed_at + interval '1 second'
  where singleton;

  return query select target_digest, null::jsonb, false, true, 0;
end;
$function$;

comment on function public.claim_public_address_search(text, text, text, text) is
  'Service-only atomic cache lookup and global one-request-per-second public-geocoder claim. Private-home mode is rejected before hashing.';

create or replace function public.store_public_address_search(
  input_query_digest text,
  input_results jsonb,
  input_ttl_seconds integer
)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if input_query_digest is null
     or input_query_digest !~ '^[0-9a-f]{64}$'
     or pg_catalog.jsonb_typeof(input_results) <> 'array'
     or pg_catalog.jsonb_array_length(input_results) > 5
     or input_ttl_seconds not between 60 and 604800 then
    raise exception using errcode = 'P0001', message = 'VALIDATION_FAILED';
  end if;

  if exists (
    select 1
    from pg_catalog.jsonb_array_elements(input_results) as result(value)
    where pg_catalog.jsonb_typeof(result.value) <> 'object'
       or not (result.value ?& array['id', 'label', 'city', 'latitude', 'longitude'])
       or (
         select pg_catalog.count(*)
         from pg_catalog.jsonb_object_keys(result.value) as key
       ) <> 5
       or pg_catalog.jsonb_typeof(result.value -> 'id') <> 'string'
       or pg_catalog.jsonb_typeof(result.value -> 'label') <> 'string'
       or pg_catalog.jsonb_typeof(result.value -> 'city') <> 'string'
       or pg_catalog.jsonb_typeof(result.value -> 'latitude') <> 'number'
       or pg_catalog.jsonb_typeof(result.value -> 'longitude') <> 'number'
       or pg_catalog.char_length(result.value ->> 'id') not between 1 and 80
       or pg_catalog.char_length(result.value ->> 'label') not between 1 and 500
       or pg_catalog.char_length(result.value ->> 'city') not between 1 and 120
       or (result.value ->> 'latitude')::numeric not between 29.3 and 33.5
       or (result.value ->> 'longitude')::numeric not between 34.2 and 35.9
  ) then
    raise exception using errcode = 'P0001', message = 'VALIDATION_FAILED';
  end if;

  insert into private.public_address_cache (
    query_digest, result_payload, expires_at
  )
  values (
    input_query_digest,
    input_results,
    pg_catalog.clock_timestamp() + pg_catalog.make_interval(secs => input_ttl_seconds)
  )
  on conflict (query_digest) do update
  set
    result_payload = excluded.result_payload,
    expires_at = excluded.expires_at;
end;
$function$;

comment on function public.store_public_address_search(text, jsonb, integer) is
  'Service-only validation and storage of up to five public address suggestions under a previously claimed digest.';

alter table private.public_address_cache enable row level security;
alter table private.public_address_cache force row level security;
alter table private.public_geocoder_rate_limit enable row level security;
alter table private.public_geocoder_rate_limit force row level security;

revoke all on table private.public_address_cache from public, anon, authenticated, service_role;
revoke all on table private.public_geocoder_rate_limit from public, anon, authenticated, service_role;
revoke all on function private.normalize_public_address_term(text)
  from public, anon, authenticated, service_role;

revoke all on function public.claim_public_address_search(text, text, text, text)
  from public, anon, authenticated;
revoke all on function public.store_public_address_search(text, jsonb, integer)
  from public, anon, authenticated;
grant execute on function public.claim_public_address_search(text, text, text, text)
  to service_role;
grant execute on function public.store_public_address_search(text, jsonb, integer)
  to service_role;

commit;
