# Production acceptance record

Do not fill a checkbox from intention. Record the date, exact Git/deployment ID, and
secret-safe evidence after the check runs. Never paste credentials, session values,
private addresses, report content, invite tokens, or raw provider payloads here.

## Deployment and authentication

- [x] Final HTTPS URL is recorded in the root README.
- [ ] Deployed Git SHA equals the accepted `main` commit.
- [x] Hosted migration history equals the 12 migrations in accepted B12 SHA
  `94c99156011ae20fdcdbe14b807b5884cfe77555`; generated types had no drift at
  that baseline.
- [x] The post-B12 account-erasure migration `20260903033000_account_erasure.sql`
  is deployed and verified against production.
- [x] The hosted reference catalog contains all 13 active reviewed Israel cities.
- [x] Signed-out home/fixtures/discovery work in a clean browser.
- [ ] Verification email is one branded document, survives a passive GET/prefetch, requires explicit Continue, and leaves no token in browser history or the final URL.
- [ ] Password recovery is generic, survives passive GET/prefetch, switches an ambient different-account session only after explicit Continue, rejects direct ordinary-session reset, replaces the password through a bound grant, requests global session revocation, always clears local state, shows an honest warning if revocation is unconfirmed, sends the branded change notice, and permits a fresh sign-in.
- [ ] Exact duplicate signup remains generic and sends no confirmation message; no privileged account lookup is used for browser copy.
- [x] On 2026-09-03, the separately authorized guarded production Auth configuration
      apply completed and the immediate exact `npm run auth:config:check` reported no
      automatable drift, including the deliberate 100-email/hour project cap; production
      redirects contain no Preview wildcard. This is configuration evidence, not fresh
      email/browser proof.
- [ ] The shared Resend account remains within its provider allowance.
- [ ] Supabase Studio's distinct **Require current password when updating** switch is enabled; built-in CAPTCHA remains disabled because Huddle verifies Turnstile itself.
- [ ] Turnstile is enabled for signup, sign-in, and password-reset request with exact hostname/action validation and replay rejection.
- [ ] The email body loads the Huddle icon; the exact `no-reply@auth.huddle.co.il` Google profile has the approved avatar where supported, without claiming universal inbox support.
- [ ] Two dedicated complete accounts establish independent sessions.
- [ ] After the account-erasure migration is deployed, one dedicated account completes
      current-password plus exact `DELETE` deletion in a fresh browser; the browser returns
      to isolated sign in, Huddle-owned tab state is absent while unrelated storage remains, the
      one-time cleanup marker is consumed without erasing new anonymous state, old sessions fail,
      former public identity is absent, and retained pseudonymous history is checked without
      recording sensitive content.
- [x] Preview uses a different Supabase project and cannot mutate production.
- [ ] `npm run test:production:session` passes (Auth-session metadata may update; no product mutation).
- [ ] One explicitly authorized fresh-event `npm run test:production` passes.

## VB01 Polar Sandbox billing

Task 11's authorized live happy path ran on 4 September 2026; see the dated
[VB01 acceptance evidence](../evidence/vb01/ACCEPTANCE.md). Only independently
completed checks are marked below. Remaining lifecycle and B13 checks are not
inferred from local tests, historical B12 evidence, or Vercel deployment.

- [x] The six reviewed forward migrations are present in hosted migration history in
  timestamp order; no hosted reset, direct SQL substitute, or migration replay occurred.
- [x] The six named billing configuration values are scoped correctly without recording
  values; only `huddle.co.il` is allowed to contact Sandbox and Preview/local/CI are
  explicitly network-blocked.
- [x] The final HTTPS webhook route has no redirect. A signed unsupported-event smoke
  validated the installed secret before checkout; genuine activation and later
  duplicate redelivery separately proved the one Raw provider endpoint.
- [ ] The eight selected event names have sanitized success/denial/duplicate evidence;
  no raw payload, signature, provider identifier, customer email, checkout URL, or card
  data appears in evidence.
- [x] Hidden draft → Sandbox checkout → non-authoritative return → signed activation →
  public/Explore/publication is demonstrated, while the Unverified label remains.
  Activation had already arrived when the return was observed; a transient
  confirming screen was not captured or claimed.
- [ ] Failed renewal, recovery, cancellation/paid-end, endpoint disable/reconciliation,
  two independent venue subscriptions, and guarded account-erasure cleanup are recorded.
- [x] The bounded billing deadline scheduler is configured and verified after all six
  migrations, with successful hosted executions recorded.
- [ ] A separately authorized hosted failure/forward-fix drill confirms no unpaid
  venue becomes public; the local deterministic fail-closed tests are not a hosted drill.

Follow [`POLAR-SANDBOX-BILLING.md`](./POLAR-SANDBOX-BILLING.md); it is the operational
source for this section.

## Privacy and security

- [x] Production HTTPS, HSTS, CSP, frame denial, content-type and referrer headers match
  the B11 inventory.
- [x] No service-role/provider/sync/cursor secret appears in HTML, JavaScript bundles,
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

- [x] Invalid sync secret is denied and writes only safe audit evidence.
- [x] One scheduled call returns success and a `provider_sync_runs` ID/count summary.
- [x] No browser page request contacts the football-data API host; the separately allowlisted
      crest asset host may serve synchronized team artwork.
- [ ] A controlled failed/retry run leaves last-good fixtures browsable and stale. One safe
      failure and later recovery were observed, but the live stale browse was not captured.
- [ ] Rotate sync/provider secrets using the B11 runbook and verify the new values
  before revoking the old values.

Supabase documents `pg_net` as asynchronous and notes response evidence is retained
for only six hours by default, so capture the safe status promptly. Vault queries in
the scheduled command decrypt at execution time; the Cron command stores only secret
names, never values. Sources: [Supabase Cron](https://supabase.com/docs/guides/cron),
[`pg_net`](https://supabase.com/docs/guides/database/extensions/pg_net), and
[Vault](https://supabase.com/docs/guides/database/vault).

## Quotas and sign-off

- [ ] Record selected Vercel/Supabase/provider plans plus current dashboard usage.
- [ ] Second computer completes a fresh clone, environment setup, reset, and acceptance run.
- [ ] Final repository/privacy review and green `main` CI are recorded.

| Evidence | Value |
|---|---|
| Accepted Git SHA | Pending |
| Production deployment ID/URL | Pending |
| B12 migration parity timestamp | 2026-08-29 14:27 IDT; `koeqawpgxevfhuieqtcq`; all 12 versions match and a follow-up dry run is up to date |
| Production Auth configuration | Guarded apply and immediate exact check passed 2026-09-03; fresh email/browser acceptance remains pending |
| Account-erasure migration deployment | Deployed and verified with matching application parity on 2026-09-04 |
| Session/full smoke timestamp | Pending |
| Latest successful sync run ID | `8fd46689-d754-4d62-a994-7e60a8b8228b` at 2026-09-05 06:17 UTC; 3 requests, 0 retries |

## 5 September 2026 B13 technical-lock pre-release audit

- Local, Preview, and Production remain isolated. Preview and Production use distinct
  Supabase projects and environment labels; Preview keeps Polar network transport blocked.
- Production Vercel deployment `dpl_FieKikoEZiVHsJnPUiR2LHdjMAd5` was Ready in `fra1`
  for accepted baseline `bde88f93bd12db6fc0d0443c2ed202d28d918bdc` before this
  corrective release. The final accepted SHA/deployment row remains pending until issue
  [#66](https://github.com/gethuddle/huddle/issues/66) merges and deploys.
- All 53 committed migrations through `20260905020000` matched Production; a linked dry
  run reported the remote database up to date. No migration is added by the B13 correction.
- `huddle-sports-sync` runs at minute 17 every sixth hour. Its latest retained success was
  `8fd46689-d754-4d62-a994-7e60a8b8228b`; the prior safe `INVALID_RESPONSE` failure
  recovered on later scheduled runs without replacing the last-good catalog. The catalog
  retained 503 future fixtures through 30 May 2027.
- The billing-deadline job remained active with 1,112 consecutive successful retained
  executions at the audit checkpoint.
- Anonymous route, TLS, security-header, attribution, bundle, source-map, and invalid-sync-
  secret checks passed. The browser requested public crest assets only, never the sports API.
- Exact-source local acceptance passed 1,530 application tests, 2,667 database assertions,
  all 42 Playwright journeys, the production build, schema/type parity, dependency audit,
  secret audit, and diff hygiene. Final exact-head CI, deployment parity, and post-deployment
  production smoke remain release gates rather than inferred results.
- The course no longer requires a presentation. Ignored submission documents remain local
  and are deferred to a separate session.
