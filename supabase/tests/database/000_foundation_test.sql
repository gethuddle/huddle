begin;

create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public, pg_catalog;

select plan(8);

select is(
  (
    select string_agg(extension_name, ',' order by extension_name)
    from (
      select extname as extension_name
      from pg_extension
      where extname in ('citext', 'pg_trgm', 'postgis')
    ) as installed_extensions
  ),
  'citext,pg_trgm,postgis',
  'the required F03 extensions are installed'
);

select is(
  (
    select string_agg(namespace_name, ',' order by extension_name)
    from (
      select extension.extname as extension_name, namespace.nspname as namespace_name
      from pg_extension as extension
      join pg_namespace as namespace on namespace.oid = extension.extnamespace
      where extension.extname in ('citext', 'pg_trgm', 'postgis')
    ) as extension_namespaces
  ),
  'extensions,extensions,extensions',
  'the required extensions stay outside the public schema'
);

select ok(to_regnamespace('private') is not null, 'the private helper schema exists');

select ok(
  to_regprocedure('private.set_updated_at()') is not null,
  'the shared updated_at trigger function exists'
);

select is(
  (
    select procedure.prosecdef
    from pg_proc as procedure
    join pg_namespace as namespace on namespace.oid = procedure.pronamespace
    where namespace.nspname = 'private'
      and procedure.proname = 'set_updated_at'
  ),
  false,
  'the updated_at helper is not security definer'
);

select is(
  (
    select procedure.proconfig
    from pg_proc as procedure
    join pg_namespace as namespace on namespace.oid = procedure.pronamespace
    where namespace.nspname = 'private'
      and procedure.proname = 'set_updated_at'
  ),
  array['search_path=""']::text[],
  'the updated_at helper has an empty fixed search_path'
);

select ok(
  not has_function_privilege('anon', 'private.set_updated_at()', 'execute'),
  'anonymous users cannot execute the private helper'
);

select is(
  (
    select count(*)
    from pg_class as relation
    join pg_namespace as namespace on namespace.oid = relation.relnamespace
    where namespace.nspname = 'public'
      and relation.relkind in ('r', 'p')
  ),
  0::bigint,
  'F03 does not create speculative public product tables'
);

select * from finish();
rollback;
