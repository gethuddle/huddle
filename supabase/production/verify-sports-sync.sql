-- Safe production evidence. This query never selects Vault secret values,
-- provider tokens, raw upstream payloads, private addresses, or user content.

select jobid, jobname, schedule, active
from cron.job
where jobname = 'huddle-sports-sync';

select status_code, error_msg, created
from net._http_response
order by created desc
limit 5;

select
  id,
  provider,
  started_at,
  finished_at,
  status,
  window_start,
  window_end,
  request_count,
  retry_count,
  competitions_changed,
  teams_changed,
  matches_changed,
  duration_ms,
  error_code,
  trigger_source
from public.provider_sync_runs
order by started_at desc
limit 10;
