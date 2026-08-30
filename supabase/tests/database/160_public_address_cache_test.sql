begin;

create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public, pg_catalog;

select no_plan();

select has_extension('pgcrypto', 'Public-address digests use pgcrypto SHA-256');
select has_table('private', 'public_address_cache', 'Public-address cache stays private');
select has_table(
  'private', 'public_geocoder_rate_limit',
  'The upstream geocoder has one database-backed global rate gate'
);
select ok(
  (
    select relation.relrowsecurity and relation.relforcerowsecurity
    from pg_class as relation
    join pg_namespace as namespace on namespace.oid = relation.relnamespace
    where namespace.nspname = 'private' and relation.relname = 'public_address_cache'
  ),
  'the private public-address cache has RLS enabled and forced'
);
select ok(
  (
    select relation.relrowsecurity and relation.relforcerowsecurity
    from pg_class as relation
    join pg_namespace as namespace on namespace.oid = relation.relnamespace
    where namespace.nspname = 'private' and relation.relname = 'public_geocoder_rate_limit'
  ),
  'the private global geocoder gate has RLS enabled and forced'
);
select ok(
  not has_table_privilege('anon', 'private.public_address_cache', 'select')
  and not has_table_privilege('authenticated', 'private.public_address_cache', 'select')
  and not has_table_privilege('service_role', 'private.public_address_cache', 'select'),
  'no API role reads the cache table directly'
);
select ok(
  not has_table_privilege('anon', 'private.public_geocoder_rate_limit', 'select')
  and not has_table_privilege('authenticated', 'private.public_geocoder_rate_limit', 'select')
  and not has_table_privilege('service_role', 'private.public_geocoder_rate_limit', 'select'),
  'no API role reads the rate table directly'
);
select is(
  (
    select array_agg(column_name::text order by ordinal_position)
    from information_schema.columns
    where table_schema = 'private' and table_name = 'public_address_cache'
  ),
  array['query_digest', 'result_payload', 'expires_at', 'created_at', 'updated_at']::text[],
  'the cache stores only a digest, bounded public result payload, and expiry metadata'
);
select isnt(
  to_regprocedure('public.claim_public_address_search(text,text,text,text)'),
  null::regprocedure,
  'the server has a controlled cache-hit/global-rate claim function'
);
select isnt(
  to_regprocedure('public.store_public_address_search(text,jsonb,integer)'),
  null::regprocedure,
  'the server has a controlled cache store function'
);
select ok(
  (
    select count(*) = 2
    from pg_proc as procedure
    join pg_namespace as namespace on namespace.oid = procedure.pronamespace
    where namespace.nspname = 'public'
      and procedure.proname in ('claim_public_address_search', 'store_public_address_search')
      and procedure.prosecdef
      and procedure.proconfig = array['search_path=""']::text[]
  ),
  'both address-cache functions are security definer functions with an empty search path'
);
select ok(
  has_function_privilege(
    'service_role', 'public.claim_public_address_search(text,text,text,text)', 'execute'
  )
  and has_function_privilege(
    'service_role', 'public.store_public_address_search(text,jsonb,integer)', 'execute'
  ),
  'only the server service role can use the public-address cache boundary'
);
select ok(
  not has_function_privilege(
    'anon', 'public.claim_public_address_search(text,text,text,text)', 'execute'
  )
  and not has_function_privilege(
    'authenticated', 'public.claim_public_address_search(text,text,text,text)', 'execute'
  )
  and not has_function_privilege(
    'anon', 'public.store_public_address_search(text,jsonb,integer)', 'execute'
  )
  and not has_function_privilege(
    'authenticated', 'public.store_public_address_search(text,jsonb,integer)', 'execute'
  ),
  'browser roles cannot claim, read, or write the server cache through RPCs'
);

create temporary table first_address_claim on commit drop as
select *
from public.claim_public_address_search(
  '10 Herzl Street', 'Haifa', 'il', 'venue'
);

select results_eq(
  $$select cache_hit, claim_granted, retry_after_ms from first_address_claim$$,
  $$values (false, true, 0::integer)$$,
  'the first uncached query claims the one global upstream slot'
);
select is(
  (select length(query_digest) from first_address_claim),
  64,
  'the cache key is a SHA-256 digest rather than raw query text'
);

select lives_ok(
  $$select public.store_public_address_search(
    (select query_digest from first_address_claim),
    '[{"id":"101","label":"10 Herzl Street, Haifa, Israel","city":"Haifa","latitude":32.815,"longitude":34.989}]'::jsonb,
    3600
  )$$,
  'the service boundary stores a bounded public result payload by digest'
);
select results_eq(
  $$select cache_hit, claim_granted, result_payload from public.claim_public_address_search(
    '  10   HERZL street  ', ' haifa ', 'IL', 'public_place'
  )$$,
  $$values (
    true,
    false,
    '[{"id":"101","city":"Haifa","label":"10 Herzl Street, Haifa, Israel","latitude":32.815,"longitude":34.989}]'::jsonb
  )$$,
  'normalization makes repeated query/city/country variants a fresh cache hit'
);

update private.public_geocoder_rate_limit
set next_allowed_at = statement_timestamp() + interval '1 minute'
where singleton;
select results_eq(
  $$select cache_hit, claim_granted, (retry_after_ms > 0) from public.claim_public_address_search(
    '20 Allenby Street', 'Tel Aviv-Yafo', 'il', 'venue'
  )$$,
  $$values (false, false, true)$$,
  'a different cache miss cannot claim another global upstream request inside one second'
);

update private.public_geocoder_rate_limit
set next_allowed_at = statement_timestamp() - interval '1 second'
where singleton;
select results_eq(
  $$select cache_hit, claim_granted from public.claim_public_address_search(
    '20 Allenby Street', 'Tel Aviv-Yafo', 'il', 'venue'
  )$$,
  $$values (false, true)$$,
  'the next global request is granted only after the shared window has elapsed'
);

create temporary table cache_count_before_home on commit drop as
select count(*) as row_count from private.public_address_cache;
select throws_ok(
  $$select * from public.claim_public_address_search(
    'PRIVATE-HOME-ADDRESS-MUST-NOT-BE-CACHED', 'Haifa', 'il', 'home'
  )$$,
  'P0001', 'LOCATION_NOT_AUTHORIZED',
  'the server boundary rejects private-home mode before digesting or caching it'
);
select is(
  (select count(*) from private.public_address_cache),
  (select row_count from cache_count_before_home),
  'a rejected private-home request leaves no cache residue'
);
select ok(
  not exists (
    select 1
    from public.security_audit_events
    where metadata::text like '%Herzl%'
       or metadata::text like '%PRIVATE-HOME-ADDRESS%'
       or metadata::text like '%32.815%'
       or metadata::text like '%34.989%'
  ),
  'address text and coordinates never enter security-audit metadata'
);
select throws_ok(
  $$select public.store_public_address_search(
    repeat('a',64),
    '[1,2,3,4,5,6]'::jsonb,
    3600
  )$$,
  'P0001', 'VALIDATION_FAILED',
  'the cache boundary rejects more than five results'
);
select throws_ok(
  $$select public.store_public_address_search(
    'not-a-sha256-digest', '[]'::jsonb, 3600
  )$$,
  'P0001', 'VALIDATION_FAILED',
  'the cache boundary rejects an invalid digest key'
);

select * from finish();
rollback;
