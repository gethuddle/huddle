begin;
create extension if not exists pgtap with schema extensions;
create extension if not exists dblink with schema extensions;
set local search_path = extensions, public, pg_catalog;
select no_plan();

-- Real transactions on the same disposable database. Each run owns freshly
-- generated accounts and a unique name; cleanup never targets ordinary data.
create function pg_temp.identifier_collision_result() returns jsonb
language plpgsql as $race$
declare
  first_actor uuid := gen_random_uuid();
  second_actor uuid := gen_random_uuid();
  venue_name text := 'Identifier304 '||left(replace(gen_random_uuid()::text,'-',''),16);
  base_slug text := lower(replace(venue_name,' ','-'));
  connection_text text := format('host=%s port=5432 dbname=postgres user=postgres password=postgres sslmode=disable',host(inet_server_addr()));
  create_query text;
  cleanup_query text;
  first_result record;
  second_result record;
  second_pid integer;
  collision_waited boolean := false;
  poll integer;
  result jsonb;
  failure text;
begin
  cleanup_query := format($cleanup$
    delete from private.venue_billing_entitlements entitlement using public.venues venue
      where entitlement.venue_id=venue.id and venue.owner_id in (%L::uuid,%L::uuid);
    delete from public.venues where owner_id in (%L::uuid,%L::uuid);
    delete from auth.users where id in (%L::uuid,%L::uuid);
  $cleanup$,first_actor,second_actor,first_actor,second_actor,first_actor,second_actor);
  create_query := format($create$
    select * from public.create_venue_workspace_auto(
      %L,'Synthetic collision-test venue',34.8,32.1,'Synthetic collision-test description',
      'Main screen',20,'{}','Respect others','reservations',true,true,true,1,null)
  $create$,venue_name);

  begin
    perform extensions.dblink_connect('identifier304_first',connection_text);
    perform extensions.dblink_connect('identifier304_second',connection_text);
    perform extensions.dblink_exec('identifier304_first','set statement_timeout = ''5s''');
    perform extensions.dblink_exec('identifier304_second','set statement_timeout = ''5s''');
    perform extensions.dblink_exec('identifier304_first',format($setup$
      insert into auth.users(instance_id,id,aud,role,email,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
      values ('00000000-0000-0000-0000-000000000000',%L,'authenticated','authenticated',%L,now(),'{}','{}',now(),now()),
             ('00000000-0000-0000-0000-000000000000',%L,'authenticated','authenticated',%L,now(),'{}','{}',now(),now());
    $setup$,first_actor,'identifier304-'||first_actor::text||'@example.test',second_actor,'identifier304-'||second_actor::text||'@example.test'));
    select pid into second_pid from extensions.dblink('identifier304_second','select pg_backend_pid()') as backend(pid integer);
    perform extensions.dblink_exec('identifier304_first','begin');
    perform extensions.dblink_exec('identifier304_second','begin');
    perform extensions.dblink_exec('identifier304_first',format('set local "request.jwt.claim.sub" = %L',first_actor::text));
    perform extensions.dblink_exec('identifier304_second',format('set local "request.jwt.claim.sub" = %L',second_actor::text));
    perform extensions.dblink_exec('identifier304_first','set local role authenticated');
    perform extensions.dblink_exec('identifier304_second','set local role authenticated');

    select * into first_result from extensions.dblink('identifier304_first',create_query)
      as created(venue_id uuid,slug text,verification_status text);
    perform extensions.dblink_send_query('identifier304_second',create_query);
    -- The first row remains uncommitted. Observe an actual lock wait, not just
    -- an asynchronously scheduled query, before allowing the first commit.
    for poll in 1..100 loop
      perform pg_stat_clear_snapshot();
      select coalesce(bool_or(wait_event_type='Lock'),false) into collision_waited
      from pg_stat_activity where pid=second_pid;
      exit when collision_waited or extensions.dblink_is_busy('identifier304_second')=0;
      perform pg_sleep(0.01);
    end loop;
    perform extensions.dblink_exec('identifier304_first','commit');
    select * into second_result from extensions.dblink_get_result('identifier304_second')
      as created(venue_id uuid,slug text,verification_status text);
    perform * from extensions.dblink_get_result('identifier304_second')
      as created(venue_id uuid,slug text,verification_status text);
    perform extensions.dblink_exec('identifier304_second','commit');

    result := jsonb_build_object(
      'base',base_slug,'firstSlug',first_result.slug,'secondSlug',second_result.slug,
      'waited',collision_waited,'differentIds',first_result.venue_id<>second_result.venue_id,
      'venueCount',(select count(*) from public.venues where owner_id in (first_actor,second_actor)),
      'ownersCorrect',(select count(*)=2 from public.venue_memberships membership join public.venues venue on venue.id=membership.venue_id
        where venue.owner_id in (first_actor,second_actor) and membership.user_id=venue.owner_id and membership.role='owner' and membership.status='active'),
      'inactiveCount',(select count(*) from private.venue_billing_entitlements entitlement join public.venues venue on venue.id=entitlement.venue_id
        where venue.owner_id in (first_actor,second_actor) and entitlement.status='inactive' and entitlement.polar_subscription_id is null),
      'unverifiedCount',(select count(*) from public.venues where owner_id in (first_actor,second_actor) and verification_status='unverified'),
      'fanCount',(select count(*) from public.profiles where id in (first_actor,second_actor) and (fan_enabled_at is not null or profile_completed_at is not null or handle is not null))
    );
  exception when others then
    failure := sqlstate||': '||sqlerrm;
  end;

  -- Cleanup is committed remotely; a cleanup in this outer transaction would
  -- be undone by the test's final rollback and leak its committed fixtures.
  if 'identifier304_second'=any(coalesce(extensions.dblink_get_connections(),'{}')) then
    if failure is not null then
      if extensions.dblink_is_busy('identifier304_second')=1 then
        perform extensions.dblink_cancel_query('identifier304_second');
      end if;
      begin
        perform * from extensions.dblink_get_result('identifier304_second',false)
          as created(venue_id uuid,slug text,verification_status text);
        perform * from extensions.dblink_get_result('identifier304_second',false)
          as created(venue_id uuid,slug text,verification_status text);
      exception when others then null;
      end;
      perform extensions.dblink_exec('identifier304_second','rollback');
    end if;
    perform extensions.dblink_disconnect('identifier304_second');
  end if;
  if 'identifier304_first'=any(coalesce(extensions.dblink_get_connections(),'{}')) then
    if failure is not null then
      perform extensions.dblink_exec('identifier304_first','rollback');
    end if;
    perform extensions.dblink_exec('identifier304_first',cleanup_query);
    perform extensions.dblink_disconnect('identifier304_first');
  end if;
  if failure is not null then raise exception '%',failure; end if;
  return result||jsonb_build_object('remainingAccounts',(select count(*) from auth.users where id in (first_actor,second_actor)));
end;
$race$;

create temporary table collision_result(value jsonb);
select lives_ok($$insert into collision_result select pg_temp.identifier_collision_result()$$,'two actors concurrently activate the same venue name without slug error or deadlock');
select is((select value->>'firstSlug' from collision_result),(select value->>'base' from collision_result),'first concurrent venue keeps the base slug');
select is((select value->>'secondSlug' from collision_result),(select (value->>'base')||'-2' from collision_result),'second concurrent venue retries to the next available slug');
select is((select value->>'waited' from collision_result),'true','second actor actually waits on the uncommitted name collision');
select is((select value->>'differentIds' from collision_result),'true','concurrent actors receive different venue objects');
select is((select value->>'venueCount' from collision_result),'2','retry creates exactly two venues, with no partial duplicates');
select is((select value->>'ownersCorrect' from collision_result),'true','each resulting venue belongs to its authenticated creator');
select is((select value->>'inactiveCount' from collision_result),'2','both concurrent venues retain inactive unbound billing');
select is((select value->>'unverifiedCount' from collision_result),'2','automatic naming never upgrades venue verification');
select is((select value->>'fanCount' from collision_result),'0','concurrent venue-only activation never creates Fan identities');
select is((select value->>'remainingAccounts' from collision_result),'0','committed concurrency fixtures are removed before the test rolls back');
select * from finish();
rollback;
