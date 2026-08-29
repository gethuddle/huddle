-- Run only in the reviewed production project after the two named Vault
-- secrets exist. This file contains secret names, never secret values.

create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;

do $block$
declare
  app_url_count integer;
  sync_secret_count integer;
begin
  select count(*) into app_url_count
  from vault.decrypted_secrets
  where name = 'huddle_production_app_url'
    and decrypted_secret ~ '^https://';

  select count(*) into sync_secret_count
  from vault.decrypted_secrets
  where name = 'huddle_sports_sync_secret'
    and char_length(decrypted_secret) >= 32;

  if app_url_count <> 1 then
    raise exception 'Expected exactly one HTTPS huddle_production_app_url Vault secret.';
  end if;

  if sync_secret_count <> 1 then
    raise exception 'Expected exactly one huddle_sports_sync_secret Vault secret of at least 32 characters.';
  end if;
end;
$block$;

select cron.unschedule(jobid)
from cron.job
where jobname = 'huddle-sports-sync';

select cron.schedule(
  'huddle-sports-sync',
  '17 */6 * * *',
  $job$
    select net.http_post(
      url := rtrim(
        (
          select decrypted_secret
          from vault.decrypted_secrets
          where name = 'huddle_production_app_url'
        ),
        '/'
      ) || '/api/internal/sports-sync',
      body := '{"reason":"scheduled"}'::jsonb,
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-huddle-sync-secret', (
          select decrypted_secret
          from vault.decrypted_secrets
          where name = 'huddle_sports_sync_secret'
        )
      ),
      timeout_milliseconds := 120000
    ) as request_id;
  $job$
);
