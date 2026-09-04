begin;

create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public, pg_catalog;

select no_plan();

select is(
  (
    select count(*)
    from pg_catalog.pg_proc as procedure
    join pg_catalog.pg_namespace as namespace on namespace.oid = procedure.pronamespace
    where namespace.nspname = 'public'
      and procedure.oid = any (array[
        'public.list_attention_items(integer)'::regprocedure,
        'public.list_my_events(text,integer,integer)'::regprocedure,
        'public.get_fan_home()'::regprocedure,
        'public.list_my_group_relationships(text,integer,integer)'::regprocedure,
        'public.list_my_saved_items(text,integer,integer)'::regprocedure,
        'public.list_people_hub(text,text,integer,integer)'::regprocedure,
        'public.list_my_groups(integer,integer)'::regprocedure,
        'public.list_my_group_invitations()'::regprocedure,
        'public.get_venue_workspace(uuid)'::regprocedure,
        'public.list_venue_calendar(uuid,integer)'::regprocedure,
        'public.get_venue_for_management(text)'::regprocedure,
        'public.list_managed_venue_events(uuid,integer)'::regprocedure,
        'public.get_venue_today(uuid,integer)'::regprocedure,
        'public.get_venue_settings(uuid)'::regprocedure,
        'public.list_venue_calendar_page(uuid,text,integer,integer)'::regprocedure
      ])
      and procedure.provolatile = 's'
      and procedure.prosecdef
      and procedure.proconfig = array['search_path=""']::text[]
  ),
  15::bigint,
  'navigation projections are stable read-only security-definer functions'
);

select is(
  (
    select count(*)
    from unnest(array[
      'public.list_attention_items(integer)'::regprocedure,
      'public.list_my_events(text,integer,integer)'::regprocedure,
      'public.get_fan_home()'::regprocedure,
      'public.list_my_group_relationships(text,integer,integer)'::regprocedure,
      'public.list_my_saved_items(text,integer,integer)'::regprocedure,
      'public.list_people_hub(text,text,integer,integer)'::regprocedure,
      'public.list_my_groups(integer,integer)'::regprocedure,
      'public.list_my_group_invitations()'::regprocedure,
      'public.get_venue_workspace(uuid)'::regprocedure,
      'public.list_venue_calendar(uuid,integer)'::regprocedure,
      'public.get_venue_for_management(text)'::regprocedure,
      'public.list_managed_venue_events(uuid,integer)'::regprocedure,
      'public.get_venue_today(uuid,integer)'::regprocedure,
      'public.get_venue_settings(uuid)'::regprocedure,
      'public.list_venue_calendar_page(uuid,text,integer,integer)'::regprocedure
    ]) as target(procedure_oid)
    where pg_catalog.has_function_privilege('authenticated', target.procedure_oid, 'execute')
      and not pg_catalog.has_function_privilege('anon', target.procedure_oid, 'execute')
      and not pg_catalog.has_function_privilege('public', target.procedure_oid, 'execute')
  ),
  15::bigint,
  'read-only optimization preserves authenticated-only execution privileges'
);

select is(
  (
    select procedure.provolatile
    from pg_catalog.pg_proc as procedure
    where procedure.oid = 'public.get_venue_billing_context(uuid)'::regprocedure
  ),
  'v'::"char",
  'billing context keeps its explicit actor and venue lock ordering'
);

select ok(
  position(
    'transaction_read_only' in
    pg_catalog.pg_get_functiondef('private.serialize_actor_transaction()'::regprocedure)
  ) > 0,
  'the shared actor guard still locks writes and skips the lock only in read-only transactions'
);

select * from finish();
rollback;
