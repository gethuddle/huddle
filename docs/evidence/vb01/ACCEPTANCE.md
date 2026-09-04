# VB01 acceptance evidence

**Status: local acceptance passed; authorized hosted rollout in progress.** The
isolated local aggregate gate passed. The user separately authorized Task 11 hosted
configuration, publication, merge after CI, and deployment on 4 September 2026.
The live Sandbox walkthrough has not passed yet.

## Hosted preconfiguration — 4 September 2026

- Confirmed the Huddle organization in Polar Sandbox, its no-real-money banner,
  and ILS currency.
- Created the two expected private products: `Huddle Venue — Monthly` at ILS
  15/month and `Huddle Venue — Annual` at ILS 150/year, without trials or benefits.
  Private catalogue visibility keeps purchasing behind Huddle's venue-bound checkout.
- Enabled multiple independent subscriptions. Customer-portal metered usage, seat
  management, unit changes, email changes, plan changes, and pausing are off.
- Added all six billing configuration names to Vercel Preview using synthetic
  values and `HUDDLE_AUTOMATION_BLOCK_POLAR_NETWORK=true`.
- Verified Preview's saved network guard is `true` and its public database URL
  targets the separate preview project, not Production.
- With explicit user confirmation, created one 365-day Sandbox organization token
  with exactly the five runbook scopes and saved it as the private
  `POLAR_ACCESS_TOKEN` secret in Vercel Production only. The dashboard reports an
  expiry of 4 September 2027.
- Saved the Sandbox organization and both product bindings in Vercel Production.
  Its network guard is temporarily `true`; checkout remains blocked during setup.
  A high-entropy bootstrap webhook secret is also saved; verified all six
  configuration names without printing values. The endpoint's generated secret
  will replace the bootstrap value after the receiver is deployed.
- Reconciled the runbook's initial setup with the observed Raw-endpoint form and
  versioned API: the provider generates the secret. Bootstrap deployment keeps
  checkout blocked, then installs the generated secret and verifies the receiver
  before enabling Sandbox transport. A direct signed smoke is not represented as a
  provider-origin delivery. No app-token scope or signature-validation change.
- Confirmed Vercel is connected to this repository, tracks `main` for Production,
  and automatically assigns the production domains. Migrations and Production
  configuration must therefore precede merge.
- The Production project has no managed backups on its current plan. Before any
  migration, exported roles, schema, data (including Auth), and migration history
  into an ignored, owner-readable-only local backup directory. All five exports
  completed and their sizes, permissions, and hashes were checked. No restore was
  performed or claimed to be tested; any restore requires separate authorization.
- Repeated the logical exports immediately before rollout and prepared the same
  private backup set for Preview. The migration dry runs show exactly eight pending
  Preview migrations (two already-main prerequisites plus six VB01 migrations) and
  exactly six pending Production VB01 migrations, with no seeds or roles to replay.
  Neither dry run applied a migration.
- The generated endpoint secret and matching deployment, hosted migrations, signed
  provider delivery, scheduler, and live checkout/activation walkthrough remain pending.
- The user completed signed commit `08208342`; its author and reciprocal coauthor
  were checked. After the user authorized GitHub's required workflow scope, the
  branch was pushed and [PR #56](https://github.com/gethuddle/huddle/pull/56) opened.
  Its Preview build passed; required exact-head CI and hosted rollout remain pending.

## Remaining evidence

As authorized checks run, record only:

- date, accepted commit/deployment identifier, and authorized environment;
- the final webhook route outcome (without a checkout URL, provider ID, signature,
  raw payload, secret, customer email, or card data);
- each selected event name and its safe outcome, including duplicate handling;
- hidden draft → non-authoritative return → signed activation → public/Explore result;
- failed renewal, recovery, cancellation/paid-end, and endpoint-disable/reconciliation
  results; and
- scheduler configuration/verification outcome and the privacy review result.

Do not attach provider/dashboard screenshots until they have been sanitized. Do not
describe a pending check as passed. The operational order and incident rules are in
[`POLAR-SANDBOX-BILLING.md`](../../operations/POLAR-SANDBOX-BILLING.md).
