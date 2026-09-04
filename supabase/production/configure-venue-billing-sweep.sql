-- Reviewed operator script. Run only after explicit hosted authorization.
-- Direct database scheduling: no HTTP, secrets, Vault, or provider requests.
begin;
create extension if not exists pg_cron;
do $configure$
declare existing_job bigint;
begin
  if to_regprocedure('public.run_venue_billing_deadline_sweep(timestamp with time zone,integer,uuid)') is null then
    raise exception 'Venue billing deadline function is missing';
  end if;
  for existing_job in select jobid from cron.job where jobname='huddle-venue-billing-deadlines' loop
    perform cron.unschedule(existing_job);
  end loop;
  perform cron.schedule('huddle-venue-billing-deadlines','* * * * *',
    'select * from public.run_venue_billing_deadline_sweep(statement_timestamp(),100,gen_random_uuid());');
end;
$configure$;
commit;
