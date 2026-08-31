begin;

create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public, pg_catalog;

select no_plan();

select hasnt_column(
  'public',
  'profiles',
  'city_id',
  'Fan profiles no longer store a selected city'
);
select hasnt_column(
  'public',
  'groups',
  'city_id',
  'groups have no geographic field or local-group concept'
);
select hasnt_column(
  'public',
  'venues',
  'city_id',
  'venues use their confirmed public address and coordinate'
);
select hasnt_column(
  'public',
  'events',
  'city_id',
  'events use their public, Venue, or protected coordinate'
);
select hasnt_table('public', 'cities', 'the redundant city catalog is removed');

select has_function(
  'public',
  'claim_ephemeral_location_search',
  array['text'],
  'origin and protected-home suggestions use a no-result-storage rate claim'
);

select has_table(
  'private',
  'location_search_rate_limits',
  'ephemeral location search retains only bounded actor rate metadata'
);

select ok(
  has_function_privilege(
    'authenticated',
    'public.update_venue(uuid,text,text,text,double precision,double precision,text,integer,integer,uuid)',
    'execute'
  ),
  'authenticated Venue managers can reach the cityless venue update boundary'
);

select ok(
  not has_function_privilege(
    'anon',
    'public.update_venue(uuid,text,text,text,double precision,double precision,text,integer,integer,uuid)',
    'execute'
  ),
  'anonymous callers cannot invoke the cityless venue update boundary'
);

select * from finish();
rollback;
