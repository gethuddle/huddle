-- No provider identifiers, job command strings, or product table contents.
select jobname,schedule,active from cron.job where jobname='huddle-venue-billing-deadlines';
select to_regprocedure('public.run_venue_billing_deadline_sweep(timestamp with time zone,integer,uuid)') is not null as deadline_function_present;
