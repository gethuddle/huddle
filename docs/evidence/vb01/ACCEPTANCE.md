# VB01 acceptance evidence

**Status: local acceptance and hosted Sandbox happy path passed on 4 September
2026; signing-secret rotation and duplicate redelivery verified.** This is
the university pilot, not real-payment or whole-application production acceptance.
The user separately authorized Task 11 hosted configuration, publication, merge
after CI, deployment, two labelled demo venues/subscriptions, one demo event, and
acceptance of Polar Buyer Terms for those Sandbox subscriptions.

## Hosted happy-path evidence — 4 September 2026

- [PR #56](https://github.com/gethuddle/huddle/pull/56) merged as
  `83555e1c8ca9cb23ca6fe745872a708e69637391`. Its exact feature head
  `5a40aa3446dce0d3bd4e258e3ca0c19fac32c364` passed required
  [CI run 33871924858](https://github.com/gethuddle/huddle/actions/runs/33871924858).
  The squash commit contains the reciprocal partner attribution exactly once.
- The live walkthrough ran at `https://huddle.co.il` on Ready Production deployment
  `dpl_3QDHWeE5NZADcDQqaDLogbAwK6hk`. Only Sandbox transport was enabled. Preview's
  separately inspected guard remained `true` with synthetic billing configuration
  and its separate Supabase project.
- Production applied exactly the six reviewed VB01 forward migrations; Preview
  applied the same six plus its two already-main prerequisites. Both hosted ledgers
  match all 44 repository migrations through `20260904060000`. No hosted reset,
  migration replay, fabricated active entitlement, or ordinary local-demo reset.
- The four pre-existing venues were retained with one fixed seven-day
  `legacy_grace` cutover, with no missing entitlement. They were not used for demo
  checkout, publication, cancellation, or other test mutations.
- The final HTTPS receiver rejected unsigned POST with `403` and accepted a signed
  unsupported-event smoke with `202`, both without redirect. That smoke proved the
  installed receiver secret, not a provider-origin delivery.
- Exactly two private, Unverified venues were created through normal onboarding:
  `Huddle Sandbox Demo A` and `Huddle Sandbox Demo B`. Each uses only the confirmed
  public city Tel Aviv, one open-door Demo screen, no capacity/facilities claims,
  and explicit university-demo/no-gathering/do-not-attend copy. Anonymous public
  pages initially reached Next.js not-found boundaries and exposed neither demo
  description; streamed HTTP `200` alone was not treated as visibility evidence.
- Both owner Billing pages showed Sandbox/no-real-money copy and the monthly and
  annual options. Two real Sandbox monthly checkouts completed under the same
  owner. Both return pages showed **Your venue is ready** after signed activation.
  Activation won the race before the return page was observed: no transient
  confirming screen or polling timing is claimed. The return is not an entitlement
  authority; that boundary also has deterministic local coverage.
- A read-only database check confirmed two active entitlements, two distinct
  subscription bindings, one owner, and two unchanged `unverified` values. Receipt
  evidence was `subscription.created / observed = 2` and
  `subscription.active / applied = 2`. Polar's delivery dashboard showed those
  four deliveries returning `200`, plus two initial `order.paid` deliveries returning
  `202`. Initial orders are intentionally non-authoritative: the parser accepts
  renewal orders only for `subscription_cycle`. This is not renewal evidence.
- Both anonymous venue pages then exposed their demo descriptions and the
  **Self-listed venue · business identity not checked by Huddle** label. The exact
  owner's billing portal opened in Sandbox without another sign-in. Active billing
  showed the portal action and no **Continue to demo checkout** action. No third
  checkout or fabricated duplicate subscription was created.
- Exactly one open-door event was published for Demo A:
  **DEMO ONLY — Arsenal vs Leeds (no gathering)**, 10 October 2026 at 14:30 Israel
  time. The date is beyond its initial paid-through period. SQL confirmed one live
  published Demo A event and zero Demo B events. The public venue page, Fan Explore
  list/map, and event detail all displayed it. Event detail retained the self-listed
  label and no billing-status/provider disclosure. No RSVP or physical gathering
  was represented as taking place.
- Polar **Products** showed exactly the expected private ILS 15/month and ILS
  150/year products. **Sales → Subscriptions** showed two active monthly
  subscriptions. The annual product was inspected, not purchased in this walkthrough.
- The reviewed `huddle-venue-billing-deadlines` scheduler is active, every minute,
  with a bounded 100-row sweep. At 13:42 UTC it had 65 successful runs and zero
  non-success runs. Scheduler verification and hosted migration parity were
  independently rechecked read-only.

## Signing-secret maintenance

A dashboard accessibility read exposed the original Sandbox signing secret in tool
output because a redaction helper removed field values but missed a field's label.
No credential value is included in this repository. The user was told immediately.
Checkout was blocked through a Ready deployment before the existing endpoint's
secret was reset. Polar confirmed that reset invalidates the prior secret; a
private comparison confirmed a different replacement, saved to the existing
Sensitive Production variable. The matching guarded deployment
`dpl_DnDddzRvBQBPGnyPvNpwQXN8CiVZ` became Ready. A genuine
`subscription.active` redelivery returned `200` at 13:49 UTC using the replacement
secret; the receipt totals remained two observed creations and two applied
activations, demonstrating idempotent replay without another subscription or grant.
Unsigned POST still returned `403`, no redirect, and `Cache-Control: no-store`.
A bounded runtime-log inspection observed only the expected `signature` denial
category and withheld raw log output. Production Sandbox transport was restored
only after that real signed delivery passed. Final deployment
`dpl_GpuZBCkNwyj7ytYA3okuD4V7wBdf` is Ready and assigned to `huddle.co.il`.
The owner portal was opened again after that deployment and successfully reached
the Sandbox subscription view without another sign-in, confirming restored transport.
Three obsolete immutable deployments still exposed receivers configured with the
retired secret. After verifying the current domain/aliases, those exact builds were
removed with the deployment CLI's safe mode. Their receiver URLs now return
`404 DEPLOYMENT_NOT_FOUND`; the live receiver still returns its expected unsigned
`403`. No current deployment, project, database, venue, event, or subscription was
removed. The historical code remains in Git and can be rebuilt with current secrets;
the obsolete deployment URLs are not restore targets.
Future provider reads use allowlisted counts/statuses, never general accessibility
dumps or provider screenshots. The obsolete secret must never be reused.

## Remaining broader acceptance

The live happy path does **not** establish hosted failed-renewal/recovery,
cancellation/paid-end, endpoint-disable/reconciliation, account-erasure cleanup,
or all eight supported event types. Duplicate activation delivery was exercised
during signing-secret maintenance above. The other lifecycle cases have
deterministic local coverage where applicable; no hosted time-travel, direct active
SQL, account deletion, or existing-venue lifecycle test was performed. Record any
future authorized drills separately in
[`PRODUCTION-ACCEPTANCE.md`](../../operations/PRODUCTION-ACCEPTANCE.md).
Whole-application B13 security, accessibility, and production smoke remain
separate obligations. The course presentation and rehearsal requirement was
retired on 5 September 2026. Private logical backups were
verified as exports, not restore-tested backups.

## Historical preconfiguration — 4 September 2026

The entries below record the setup sequence at that checkpoint. Their pending
items and temporary bootstrap/guard values are superseded by the dated outcomes
above; they are not current configuration claims.

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
