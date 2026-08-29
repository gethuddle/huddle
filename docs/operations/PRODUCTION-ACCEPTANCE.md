# Production acceptance record

Do not fill a checkbox from intention. Record the date, exact Git/deployment ID, and
secret-safe evidence after the check runs. Never paste credentials, session values,
private addresses, report content, invite tokens, or raw provider payloads here.

## Deployment and authentication

- [ ] Final HTTPS URL is recorded in the root README and submission index.
- [ ] Deployed Git SHA equals the accepted `main` commit.
- [x] Hosted migration history equals the 12 migrations in accepted B12 SHA
  `94c99156011ae20fdcdbe14b807b5884cfe77555`; generated types had no drift at
  that baseline.
- [x] The hosted reference catalog contains all 13 active reviewed Israel cities.
- [ ] Signed-out home/fixtures/discovery work in a clean browser.
- [ ] Verification email returns to the production origin with no token in the final URL.
- [ ] Two dedicated complete accounts establish independent sessions.
- [ ] Preview uses a different Supabase project and cannot mutate production.
- [ ] `npm run test:production:session` passes (Auth-session metadata may update; no product mutation).
- [ ] One explicitly authorized fresh-event `npm run test:production` passes.

## Privacy and security

- [ ] Production HTTPS, HSTS, CSP, frame denial, content-type and referrer headers match
  the B11 inventory.
- [ ] No service-role/provider/sync/cursor secret appears in HTML, JavaScript bundles,
  source maps, browser storage, network responses, logs, screenshots, or artifacts.
- [ ] Unauthorized user receives neither the private event nor address/calendar data.
- [ ] Approved attendee receives an `.ics` location; leave/removal/block/cancel revokes it.
- [ ] Reported user and group administrator cannot identify the reporter.
- [ ] Unverified venue badge, registered-account/no-plus-one copy, safety copy, and
  football-data.org attribution are visible.
- [ ] Keyboard-only and VoiceOver pass covers menus, forms, errors, and destructive
  Radix dialogs on phone and desktop widths.

## Scheduled sports sync

1. Reconfirm the live football-data.org plan and that `PL` and `CL` remain covered.
2. Store the provider token and service role only in Vercel Production secrets.
3. In Supabase Vault, create exactly one secret named
   `huddle_production_app_url` and one named `huddle_sports_sync_secret`. The latter
   must exactly match Vercel's `SPORTS_SYNC_SECRET`; never select its value for evidence.
4. Enable Cron and `pg_net`, then run the reviewed
   `supabase/production/configure-sports-sync.sql`. The job runs at minute 17 every
   sixth hour; four calls/day are deliberately outside page traffic.
5. Query only `supabase/production/verify-sports-sync.sql` for the job, HTTP status,
   and safe provider-run fields.

- [ ] Invalid sync secret is denied and writes only safe audit evidence.
- [ ] One scheduled call returns success and a `provider_sync_runs` ID/count summary.
- [ ] No browser page request contacts football-data.org.
- [ ] A controlled failed/retry run leaves last-good fixtures browsable and stale.
- [ ] Rotate sync/provider secrets using the B11 runbook and verify the new values
  before revoking the old values.

Supabase documents `pg_net` as asynchronous and notes response evidence is retained
for only six hours by default, so capture the safe status promptly. Vault queries in
the scheduled command decrypt at execution time; the Cron command stores only secret
names, never values. Sources: [Supabase Cron](https://supabase.com/docs/guides/cron),
[`pg_net`](https://supabase.com/docs/guides/database/extensions/pg_net), and
[Vault](https://supabase.com/docs/guides/database/vault).

## Quotas, rehearsal, and sign-off

- [ ] Record selected Vercel/Supabase/provider plans plus current dashboard usage.
- [ ] Second computer completes a fresh clone, environment setup, reset, and acceptance run.
- [ ] Both partners rehearse the core demo, request trace, address denial, capacity race,
  and provider-outage proof in 10–15 minutes.
- [ ] Final repository/privacy review and green `main` CI are recorded.

| Evidence | Value |
|---|---|
| Accepted Git SHA | Pending |
| Production deployment ID/URL | Pending |
| Migration parity timestamp | 2026-08-29 14:27 IDT; `koeqawpgxevfhuieqtcq`; all 12 versions match and a follow-up dry run is up to date |
| Session/full smoke timestamp | Pending |
| Latest successful sync run ID | Pending |
| Guy rehearsal duration/date | Pending |
| Ohad rehearsal duration/date | Pending |
