# Polar Sandbox venue billing runbook

**Status:** local implementation and the authorized hosted Sandbox happy path passed
on 4 September 2026. The [acceptance record](../evidence/vb01/ACCEPTANCE.md) records
the deployed commit, migrations, genuine activation, two independent subscriptions,
future-fixture publication, and signing-secret maintenance. Remaining hosted lifecycle
drills and whole-application B13 acceptance are not claimed complete. This document
itself does not authorize a hosted mutation.

## Scope and fixed inventory

Huddle uses Polar **Sandbox** only. There is no production-payment mode and no real
money is charged. The approved live-demo inventory is:

| Resource | Expected value or setting |
|---|---|
| Sandbox organization | `Huddle` |
| Monthly product | `Huddle Venue — Monthly`, ILS 15/month |
| Annual product | `Huddle Venue — Annual`, ILS 150/year |
| Trial / promotions / discounts | none |
| Webhook endpoint | `https://huddle.co.il/api/polar/webhooks`, final HTTPS URL, Raw payload format |
| Scheduler | Supabase job `huddle-venue-billing-deadlines`, configured only after all six VB01 migrations |

Before any hosted action, stop for explicit authorization and confirm the Polar
dashboard is `sandbox.polar.sh`, the `Huddle` organization is selected, Sandbox's
no-real-money banner is visible, and currency is ILS. Inspect and reuse one matching
monthly and annual product when they already exist; otherwise, create only the missing
expected resource after that authorization. Reject duplicates, extra prices/variants,
and any production counterpart. Multiple subscriptions are disabled by default in Polar;
enable them only under later explicit authorization so one owner can hold independent
subscriptions for distinct venues. Keep the customer portal's seat management, email
change, plan change, and pause/resume controls off for this pilot; payment-method
updates and ordinary cancellation remain the portal's limited recovery paths.

The server access token must have exactly these least-privilege scopes:
`checkouts:read`, `checkouts:write`, `customer_sessions:write`,
`subscriptions:read`, and `customers:write`. The last scope is used only to delete a
customer by authenticated account external ID during account erasure; it is not a
general customer-management capability. Endpoint creation is manual authorized work,
so the application token needs no webhook-management scope.

## Environment boundary

The six billing configuration names are `POLAR_ACCESS_TOKEN`,
`POLAR_WEBHOOK_SECRET`, `POLAR_ORGANIZATION_ID`,
`POLAR_VENUE_MONTHLY_PRODUCT_ID`, `POLAR_VENUE_YEARLY_PRODUCT_ID`, and
`HUDDLE_AUTOMATION_BLOCK_POLAR_NETWORK`. Never place values, checkout URLs, provider
IDs, signatures, payloads, customer email, or screenshots containing them in Git,
logs, evidence, or chat.

Only the live Huddle host at `huddle.co.il`, its matching production Supabase project,
and the one signed endpoint may conduct an authorized Sandbox demo. It remains
Sandbox, not Polar Production. Preview, local, and CI must use distinct synthetic,
schema-valid placeholder configuration and set
`HUDDLE_AUTOMATION_BLOCK_POLAR_NETWORK=true`; they must not demonstrate checkout,
portal, provider cleanup, or call the shared Sandbox organization. Local quality
scripts force this denial. Later authorization must explicitly check the Preview
guard; this runbook does not configure it.

Sandbox customer email is delivered only to Polar organization members. Do not use an
arbitrary customer inbox as a demo or acceptance check. Polar documents no
time-travel/test-clock facility; local tests use injected timestamps instead.

## Initial authorized rollout order

1. Stop for authorization before each Polar, Supabase, Vercel, GitHub, deployment, or
   production mutation. Confirm a backup/recovery point, exact repository commit,
   exact Supabase project, and live host.
2. In Polar Sandbox, create only a missing expected product and the least-privilege
   token. The dashboard and versioned create-endpoint schema checked on 4 September
   2026 generate the signing secret; they expose no custom-secret input, despite the
   older general setup guide. Privately generate a high-entropy temporary bootstrap
   webhook secret and store all six names in the approved managed environment with
   `HUDDLE_AUTOMATION_BLOCK_POLAR_NETWORK=true`. This permits the initial build but
   does not connect Polar or permit checkout. Transfer secrets through the managed
   UI or directly through CLI stdin with output suppressed; never print their values.
3. Apply, in timestamp order, the reviewed committed forward migrations:
   `20260903090000_polar_venue_billing_foundation.sql`,
   `20260903091500_polar_venue_checkout_context.sql`,
   `20260903093000_polar_venue_billing_webhooks.sql`,
   `20260903100000_polar_venue_billing_enforcement.sql`,
   `20260903110000_polar_venue_billing_deadlines.sql`, and
   `20260904060000_polar_billing_integrated_review_fixes.sql`. The final migration
   separates subscription/order clocks and fences external cleanup acknowledgments;
   deploy its matching application contracts together. Never use hosted `db reset`,
   direct active SQL, or a migration replay.
4. Deploy the verified application build. Confirm the final HTTPS webhook route is
   reachable without a redirect before creating or enabling the endpoint.
5. Create or enable the one Raw-payload endpoint with these eight events:
   `subscription.created`, `subscription.active`,
   `subscription.canceled`, `subscription.uncanceled`, `subscription.cycled`,
   `subscription.past_due`, `subscription.revoked`, and `order.paid`. Privately copy
   its generated signing secret into `POLAR_WEBHOOK_SECRET` and redeploy while the
   network guard stays `true`. Verify the final receiver rejects an unsigned POST
   with `403` without redirect, then accepts a correctly signed unsupported-event
   smoke with `202` and no database/provider mutation. This proves the installed
   application secret and receiver, **not** a Polar-originated delivery; the current
   provider documentation does not promise a generic test/ping event. Never send
   fabricated supported billing events. Only after these checks set the Production
   guard to `false`, redeploy, and run the authorized Sandbox checkout. Its real
   selected-event delivery is the provider-origin acceptance evidence. No entitlement
   is granted before the real signed activation. `subscription.created` and
   `subscription.cycled` are
   non-authoritative; a fully bound `subscription.active` can initially activate or
   recover `past_due`, while fully bound `order.paid` is the renewal/stale-recovery
   authority.
6. Configure and verify the reviewed deadline scheduler SQL only after all six migrations.
   The bounded sweep processes 100 rows per minute. Inspect only safe delivery and
   application logs.

For an authorized live happy-path demonstration, start from a hidden Unverified venue,
show the Sandbox/no-real-money billing surface, and use Sandbox's successful test card
`4242 4242 4242 4242` with a future expiry and any CVC. The return page is
non-authoritative: wait for signed delivery before showing public presence, Explore,
or publishing. Demonstrate independent subscriptions for two venues and the
per-venue duplicate guard. Never record card data, provider identifiers, or a checkout
URL in evidence.

## Incident and recovery procedures

Duplicate delivery is expected: retain no raw payload, validate the original bytes and
signature, and let the idempotent receipt/current-binding checks decide the result.
Never manufacture entitlement state. On invalid, replayed, stale, organization,
product, customer, attempt, or venue mismatch, preserve safe failure evidence and
fail closed.

On failed renewal or provider-stale state, public presence, Explore, acquisition, and
new publishing fail closed immediately. Existing protected participant access and
limited management follow the entitlement rules; fan-facing copy stays neutral and
never discloses billing. A valid later renewal/recovery restores only the permitted
state and never resurrects cancelled events. Cancellation remains effective through
the paid end, then future events are cancelled without deleting attendance/history.

Polar's delivery documentation was checked on 2026-09-04 and then described up to ten
retries with exponential backoff, a ten-second timeout, and disabling after ten
consecutive non-2xx outcomes. Treat that as provider behavior observed on that date,
not a permanent Huddle guarantee. Redirects are failures. If an endpoint is disabled,
it receives no new events: stop checkout, do not assume missed events are retained,
manually re-enable only with authorization, redeliver available failures, and
inventory/reconcile the gap through provider-supported redelivery or support. Do not
write direct active SQL, disable signature validation, or grant a fake entitlement.

For account erasure, the authenticated account's external customer ID is anonymized
before Auth deletion. A `404` is Huddle's idempotency interpretation of an already
complete cleanup, not a claim about every provider response. Retry provider cleanup
before Auth deletion; a failure leaves the account retryable. A late matching checkout
delivery must repeat guarded anonymization/local completion without creating an
entitlement. Each external deletion acknowledges only the opaque cleanup fence
captured before that call. A newer late receipt invalidates older completion—even
after an older `404`—so Auth deletion remains blocked and the delivery stays retryable.
A terminal erased-owner `subscription.revoked` with null external ID
confirms cleanup and makes no further provider call. Provider I/O stays outside
database locks.

## Rotation and rollback

Access-token rotation requires explicit authorization: create a replacement with the
same five scopes, privately store/deploy it, validate it, then revoke the prior token.
Never print either token.

There is no documented atomic zero-downtime webhook-secret rotation. For an existing
endpoint, use an approved maintenance window: stop checkout, privately reset/copy the
new secret to the managed environment, deploy, verify signed delivery, re-enable and
redeliver failed deliveries if required, then reconcile any delivery gap. A temporary
mismatch fails closed. This does not promise that events sent while disabled are
retained.

Also inventory immutable deployment URLs that retain the retired secret: changing
the current domain's environment does not update old receivers. Verify the live
domain points to the replacement deployment, then protect or retire only the exact
obsolete deployments under the maintenance authorization. Never remove the project,
current deployment, or database. Verify old receivers are inaccessible and the live
receiver still rejects unsigned requests. Rebuild historical code with current
secrets if needed; do not roll back to a retired credential.

If an application or migration defect is found, stop the rollout and make a reviewed
forward fix. Do not roll back by exposing an unpaid venue, weakening entitlement
checks, deleting history, or restoring a database snapshot without separate explicit
approval and a verified backup.

## Evidence boundary

Record only date, authorized environment, route outcome, event name/outcome, scheduler
status, and sanitized screenshots in
[`docs/evidence/vb01/ACCEPTANCE.md`](../evidence/vb01/ACCEPTANCE.md). Distinguish
completed preconfiguration from the still-required deployed runtime checks; neither
local tests nor resource creation alone proves the live checkout journey.

Sources checked 2026-09-04: Polar's [Sandbox guide](https://polar.sh/docs/integrate/sandbox),
[webhook endpoints](https://polar.sh/docs/integrate/webhooks/endpoints),
[versioned endpoint creation](https://polar.sh/docs/api-reference/2026-04/webhooks/create-webhook-endpoint.md),
[delivery behavior](https://polar.sh/docs/integrate/webhooks/delivery),
[customer portal settings](https://polar.sh/docs/features/customer-portal/settings),
and the versioned API references recorded in the Task 10 provider notes.
