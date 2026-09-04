# Polar Sandbox Venue Subscriptions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Require one recurring Polar Sandbox subscription per commercial venue before that venue can appear publicly, appear in Explore, or publish watch events, while keeping every Fan/private-host feature free and protecting existing attendees during a seven-day failed-payment recovery window.

**Architecture:** Venue creation becomes a private draft. Owner-authorized Server Actions create trusted Polar Sandbox checkout and portal sessions; a signed webhook is the only activation authority. Polar remains the provider source of truth, while private Supabase tables and centralized SQL capability predicates enforce per-venue public presence, publishing, acquisition, grace, cancellation, and recovery. Timestamp-aware predicates fail closed even if a bounded `pg_cron` deadline sweep is delayed.

**Tech Stack:** Next.js 16 App Router, React 19, strict TypeScript, Supabase Auth/PostgreSQL/RLS, Zod, Polar TypeScript SDK pinned to the `2026-04` API, Polar Sandbox hosted checkout/portal/webhooks, repository-owned shadcn/Radix components, Vitest/RTL, pgTAP, and Playwright.

**Spec:** `docs/superpowers/specs/2026-09-03-polar-venue-subscriptions-design.md`

## Remaining delivery plan — 3 phases

On 4 September 2026, the user asked to consolidate the five remaining tasks into fewer steps. Tasks 1–6 remain complete. The remaining work is now delivered in these three phases; task numbers 7–11 below remain stable technical references and internal checklists, not five separate user-facing steps.

- [x] **Phase 1 — Finish the feature (Tasks 7 + 8).** Complete venue-owner Billing screens, warnings and capability-aware controls together with deadline processing, retained fan history, cancelled-calendar output and safe venue closure. Implement and verify the lifecycle as one local feature batch. Prepare scheduler SQL locally; do not run it against hosted services.
- [x] **Phase 2 — Make the demo release-ready (Tasks 9 + 10).** Complete deterministic fixtures and end-to-end journeys, run all local release/security gates, and finish the runbook, acceptance evidence and presentation documentation. No hosted changes or automatic Git publication.
- [x] **Phase 3 — Connect the live Sandbox and demonstrate it (Task 11).** The authorized hosted happy path passed on 4 September 2026: reviewed migrations, configured Sandbox resources, signed activation, two independent subscriptions, public/Explore visibility, distant publication, scheduler, and rotated-key redelivery. Final evidence publication is the remaining handoff; broader B13 lifecycle/rehearsal checks are separately pending. It still processes no real money.

Execution follows these phases in order. A request to start or continue a named phase covers its included local tasks as one batch; do not end the turn merely to ask for another confirmation between those internal tasks. Retain all detailed requirements, TDD, verification and independent-review gates below. Stop for a genuine blocker or any new authority requirement. Report completion at the phase boundary. This consolidation request itself authorizes plan/status-document edits only, not implementation, commits, publication, deployment or hosted mutations.

**Combined local execution evidence — 4 September 2026:** Phases 1 and 2 passed the isolated local aggregate acceptance gate. It completed a clean install; six VB01 migrations; schema lint; 48 pgTAP files / 2,423 assertions; canonical generated-type parity; 223 application files / 1,308 tests plus one intentional skip; 80.42%/71.87%/83.53%/84.62% coverage; production build; 37 Playwright tests; security audit; and diff hygiene. Polar transport was denied throughout automation. The [Sandbox runbook](../../operations/POLAR-SANDBOX-BILLING.md) records the six-migration inventory. The user subsequently authorized Phase 3/Task 11 hosted configuration and deployment, then explicitly confirmed commit, push, PR, and merge after CI. The [acceptance record](../../evidence/vb01/ACCEPTANCE.md) tracks completed preconfiguration separately from pending hosted runtime checks.

## Global Constraints

- This milestone is `VB01`, a bounded post-B12 module before B13. Do not renumber B13 or fold unrelated deferred venue features into it.
- Historical pre-Task 1 constraint: the normative documents explicitly prohibited billing and webhooks. Tasks 1–6 are now separately authorized, completed locally, and independently reviewed: contract revision, server/database foundations, owner checkout/onboarding handoff, signed webhook activation/reconciliation, entitlement consumer enforcement, and billing-aware erasure. Remaining Tasks 7–11 are grouped into the three delivery phases above; local phase execution needs a user continuation, and the hosted phase retains its explicit external-action authorization gate.
- The integration is Polar **Sandbox only**. Hard-code the SDK environment to `sandbox`; do not add a production-payment mode or production Polar credentials.
- Products are `Huddle Venue — Monthly` at ILS 1,500 minor units/month and `Huddle Venue — Annual` at ILS 15,000 minor units/year. There is no tier, trial, coupon, seat, pause, plan-change, menu, offer, promotion, analytics, ticket, refund, or tax-management scope.
- One subscription grants rights to one venue. One Huddle owner/Polar customer may hold independent subscriptions for several venues.
- Only a verified signed webhook can activate or restore entitlement. Checkout redirects, query parameters, client state, and Customer State never grant access.
- Keep membership, billing, and business verification independent. Owners/admins retain membership-based recovery access; only the exact venue owner manages billing; payment never changes the visible `unverified` status.
- Public venue/event discovery, publishing, and new acquisition are database-authorized. A disabled React control is never the enforcement boundary.
- Active subscriptions may publish distant fixtures regardless of the current paid-through date. Once cancellation is scheduled, events at or after the known paid-period end are the one exception: hide them and reject new publication/acquisition immediately.
- `past_due` hides the venue and all acquisition immediately. Seven-day grace preserves existing event/attendee operations and unpublished drafts, not public reach or new demand generation.
- A missed renewal snapshot is the distinct fail-closed `provider_stale` state, not an asserted payment failure. It has the same seven-day private operating window and neutral internal confirmation copy; only a signed current webhook restores it.
- Existing venues receive one fixed seven-day `legacy_grace` at VB01 cutover: public/acquisition access stops immediately, existing management and participant access remain private, and unresolved future published events cancel at the deadline. New venues receive no legacy grace.
- Every authenticated database mutation takes the actor transaction token before any venue billing lock; multi-venue account erasure takes owned venue locks in sorted UUID order before entitlement/venue/event rows. Provider callbacks begin at the venue lock because they have no actor.
- Scheduled cancellation immediately hides post-cutoff events from acquisition, but already-requested or approved participants retain private detail, My Huddle, and authorized calendar access until those events are actually cancelled at paid-period end.
- Preserve attendance, invitation, event, draft, audit, and venue history. Deadline processing cancels future **published** events but does not hard-delete anything or silently restore cancelled events later.
- Fan copy communicates only ordinary availability or `This event has been cancelled.` It never mentions billing, payment failure, Polar, grace, invoices, or plan state.
- Never name a billing table or module simply `subscriptions`; `public.subscriptions` and `features/subscriptions/` already represent Fan sports follows.
- Never store or log a Polar access token, webhook secret/signature, raw webhook body, customer email from a webhook, card data, portal token/URL, or unfiltered provider error response.
- Automated tests never access Polar. Use sanitized saved fixtures and a known test secret. Live Sandbox is reserved for the authorized presentation smoke path.
- Do not mutate the hosted Huddle Polar organization, Supabase, Vercel, GitHub, or production application while executing local tasks unless the current user separately authorizes that exact external action.
- No Git commit, push, pull request, merge, or deployment is authorized by this plan.

## Pre-implementation starting point (historical snapshot)

- Historical preflight snapshot: the plan was drafted when local `main` was `3e499d99` and `origin/main` was `5e084bc7` (merged PR #54). The current user-selected `codex/vb01-polar-venue-subscriptions` branch is the Task 1 documentation workspace; do not treat this historical snapshot as a current contract blocker.
- That upstream commit adds `20260903033000_account_erasure.sql` plus pgTAP files `280_account_erasure_test.sql` and `281_account_erasure_concurrency_test.sql`; VB01 uses test numbers `290`–`293` and preserves/updates those upstream tests where entitlement changes their venue fixtures.
- Existing untracked `tmp/` is user-owned and must remain untouched.
- Before Task 2 there was no Polar dependency or billing code. Tasks 2–4 now provide local server/database foundations and owner checkout/Billing surfaces; signed webhook application and integration of entitlement rules into public/application surfaces remain unimplemented.
- Before Task 4, venue onboarding called `create_venue_workspace_v2` and redirected into the ordinary workspace. Task 4 preserves the atomic creation RPC and redirects to the minimal Billing page; only later enforcement makes the inactive draft inaccessible through public surfaces.
- `requireActor({ venueId })` and `private.actor_manages_venue` currently express membership/operations only. Do not globally replace them with a paid check.
- Explore merges ordinary, open-door, and owner-only venue discovery; the owner-only source is a specific leak path for unpaid venues.
- Polar Sandbox organization `Huddle` exists with ILS as default currency. Products, token, webhook, and multiple-subscription settings remain untouched.
- There is no open issue or pull request. Create those only as part of a later explicitly authorized publication workflow.

---

### Preflight: synchronize the stable base

- [x] Confirm only expected planning files and the user-owned `tmp/` are untracked; stop for any overlapping worktree change.
- [x] Current Task 1 preflight: work only in the user-selected `codex/vb01-polar-venue-subscriptions` branch at the merged PR #54 baseline; do not switch branches/worktrees or mutate Git state for documentation-only work.
- [x] Re-read the account-erasure migration/tests and rerun the required-reading contradiction scan before Task 1. Do not copy or edit from the stale `3e499d99` tree.

### Task 1: Revise the product contract and register `VB01`

**Status:** Complete locally on 3 September 2026. Independent documentation review passed with no findings; contradiction scans, formatting, added relative links, and `git diff --check` passed. No commit, application implementation, or hosted configuration was performed during Task 1; Task 2 was subsequently authorized separately.

**Files:**
- Modify: `AGENTS.md`
- Modify: `docs/HUDDLE-IMPLEMENTATION-SPEC.md`
- Modify: `docs/HUDDLE-ARCHITECTURE.md`
- Modify: `docs/HUDDLE-STEP-BY-STEP-BUILD-SPEC.md`
- Modify: `docs/superpowers/specs/2026-09-03-account-erasure-design.md`
- Modify: `README.md`
- Reference: `docs/superpowers/specs/2026-09-03-polar-venue-subscriptions-design.md`

**Interfaces:**
- Produces: one consistent normative statement that venue creation yields a private Unverified draft and that `VB01` adds Polar Sandbox per-venue entitlement before B13.
- Preserves: free Fan/private-hosting scope, membership authorization, trust-only venue attestation, Unverified presentation, and every existing safety/privacy rule.

- [x] **Step 1: Inventory every contradictory statement before editing**

Run:

```bash
rg -n -i "Stripe|billing|payment system|subscription enforcement|without payment|immediately usable|future venue customer|deferred paid" AGENTS.md README.md docs --glob '!docs/superpowers/**'
rg -n -i "provider|prepare_account_erasure|Auth deletion|venue" docs/superpowers/specs/2026-09-03-account-erasure-design.md
```

Record the exact statements that say payment is absent, Stripe is future scope, or venue activation is immediately public. Do not silently leave one source behind.

- [x] **Step 2: Update the normative contract without claiming implementation is complete**

In the implementation specification and architecture, add the complete state/capability rules from the design spec, the owner/admin split, hidden-draft journey, webhook authority, payment-failure/provider-stale/legacy-cutover grace, voluntary cancellation behavior, participant exceptions, and Sandbox-only boundary. Replace Stripe-specific future language with a narrow statement that real payments remain deferred. Update the approved account-erasure design so its Server Action order includes Polar external-customer anonymization/local cleanup between database preparation and Auth deletion, plus the late-checkout cleanup rule; do not leave its former direct prepare → Auth sequence as contradictory authority.

In `AGENTS.md`, replace the blanket payment-infrastructure prohibition with an exception only for approved `VB01` Polar Sandbox work and add the entitlement rules to Locked product and safety rules.

In the step-by-step build spec:

- add `VB01 — Polar Sandbox venue subscriptions` after the approved post-B12 modules and before B13;
- leave historical E01/B07 evidence intact but mark its immediate-public activation rule as superseded by VB01;
- make B13 depend on completed VB01 hosted/demo acceptance without renumbering B13; and
- add a detailed VB01 checklist for schema, RLS, checkout, webhook, visibility, grace, tests, and presentation evidence.

In `README.md`, distinguish the currently deployed behavior from the approved VB01 branch until implementation passes. Do not state that paid gating is live during this documentation-only step.

- [x] **Step 3: Prove the contradiction is gone and the exclusions remain**

Run the Step 1 search again. Remaining matches must be either historical/superseded context or explicit exclusions of **real** production payment. Then run:

```bash
rg -n "VB01|Polar Sandbox|per-venue|seven-day|Unverified" AGENTS.md README.md docs/HUDDLE-*.md
npm run format:check
git diff --check
```

- [x] **Step 4: Stop on any new disagreement**

Read the five sources in repository authority order. If any still prescribe a different public/grace/cancellation rule, stop implementation and reconcile it with the user before Task 2.

### Task 2: Pin the Polar server boundary and environment contract

**Status:** Complete locally on 3 September 2026. The exact SDK, narrow Sandbox adapters, environment/build validation, test-network guard, and security checks are implemented and independently reviewed. Review's case-variant duplicate-product finding was fixed with regression tests and re-reviewed. Checkout actions, webhook processing, entitlement enforcement, billing UI, account-erasure orchestration, and hosted configuration remain pending; no commit or deployment was performed.

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Create: `features/venue-billing/types.ts`
- Create: `features/venue-billing/constants.ts`
- Create: `features/venue-billing/constants.test.ts`
- Create: `features/venue-billing/plans.ts`
- Create: `features/venue-billing/plans.test.ts`
- Create: `features/venue-billing/polar.ts`
- Create: `features/venue-billing/polar.test.ts`
- Modify: `lib/env/schema.ts`
- Modify: `lib/env/schema.test.ts`
- Modify: `lib/env/server.ts`
- Modify: `next.config.ts` (separate build-time server environment input)
- Modify: `vitest.config.mts` (mandatory test-only network denial and placeholders)
- Create: `tests/fixtures/polar-environment.ts`
- Modify: `.env.example`
- Modify: `.env.preview.example`
- Modify: `.env.production.example`
- Modify: `scripts/local-quality-environment.mjs`
- Modify: `scripts/local-quality-environment.test.mjs`
- Modify: `scripts/security-audit.mjs`
- Modify: `scripts/security-audit.test.mjs`
- Modify: `tests/boundaries/server-only.test.ts`

**Interfaces:**

```ts
export type VenueBillingPlanKey = "monthly" | "yearly";

export const POLAR_API_TIMEOUT_SECONDS = 5;
export const CHECKOUT_RECONCILIATION_TIMEOUT_MS = 15 * 60_000;
export const CHECKOUT_CONFIRMATION_POLL_INTERVAL_MS = 2_000;
export const CHECKOUT_CONFIRMATION_POLL_TIMEOUT_MS = 60_000;

export type VenueBillingPlan = Readonly<{
  key: VenueBillingPlanKey;
  name: string;
  amountMinor: 1500 | 15000;
  currency: "ILS";
  interval: "month" | "year";
  intervalCount: 1;
  polarProductId: string;
}>;

export function getVenueBillingPlan(
  key: VenueBillingPlanKey,
  environment?: ServerEnvironment,
): VenueBillingPlan;

function getPolarClient(
  environment?: ServerEnvironment,
): ReturnType<typeof createPolar>;
```

`getPolarClient` remains private to `features/venue-billing/polar.ts`; other modules use narrow adapter functions for checkout create/list/get, customer-session creation, subscription get, and external-customer erasure. This gives every provider network call one fail-closed boundary. The erasure wrapper uses the pinned SDK's exact `customers.deleteExternal(externalId, { anonymize: true })` signature and is unavailable to ordinary billing actions.

Required server variables:

```text
POLAR_ACCESS_TOKEN
POLAR_WEBHOOK_SECRET
POLAR_ORGANIZATION_ID
POLAR_VENUE_MONTHLY_PRODUCT_ID
POLAR_VENUE_YEARLY_PRODUCT_ID
```

- [x] **Step 0: Create the feature directory**

Run:

```bash
mkdir -p features/venue-billing
```

- [x] **Step 1: Write failing plan/configuration and boundary tests**

Assert that:

- only `monthly` and `yearly` parse;
- the server-owned five-second API timeout, 15-minute reservation-reconciliation window, and 2-second/60-second UI poll cadence are exact constants; Polar SDK `RequestOptions.timeout` receives `POLAR_API_TIMEOUT_SECONDS` as `5` because that field is measured in seconds, while the reconciliation and UI timers remain milliseconds and the UI timeout cannot close an attempt;
- displayed amounts/currency/interval are code-owned constants;
- the two product IDs are required, non-empty, and distinct;
- hosted/local quality environments supply all five variables without exposing values in errors;
- `getPolarClient` passes `environment: "sandbox"` unconditionally;
- local quality and automation environments set the optional server-only `HUDDLE_AUTOMATION_BLOCK_POLAR_NETWORK=true`, and every network adapter method rejects before invoking the SDK while it is set;
- a browser module cannot import `features/venue-billing/polar.ts`;
- no application module imports the Polar SDK outside `polar.ts` and the local-only webhook signature verifier in `webhook.ts`;
- security audit rejects Polar secrets in Client Components, `NEXT_PUBLIC_*`, logs, or committed values; and
- no input API accepts a raw amount/product/customer/organization value;
- compile-time fixtures use the pinned SDK's exact snake_case checkout/session fields and async webhook namespace export; and
- compile-time fixtures also pin `customers.deleteExternal(userId, { anonymize: true })`; only a reauthenticated account-erasure path may invoke it, and `404` is treated as already complete.

- [x] **Step 2: Run focused tests and confirm red state**

Run:

```bash
npm test -- features/venue-billing/constants.test.ts features/venue-billing/plans.test.ts features/venue-billing/polar.test.ts lib/env/schema.test.ts scripts/local-quality-environment.test.mjs scripts/security-audit.test.mjs tests/boundaries/server-only.test.ts
```

Expected: missing module/variable assertions fail.

- [x] **Step 3: Install one exact SDK version and add the server-only adapter**

Under the repository's pinned Node/npm runtime, install exact `@polar-sh/sdk@1.0.0-alpha.19` (never the floating `next` tag). Use the versioned client import:

```ts
import { createPolar } from "@polar-sh/sdk/2026-04";
```

Later import `webhooks` from that same versioned module; do not use the unexported `@polar-sh/sdk/webhooks` subpath that appears in older/combined Polar examples. Put `import "server-only"` first in `polar.ts`. Do not install the generic Next.js checkout adapter; Huddle needs custom owner and metadata authorization.

Pass `{ timeout: POLAR_API_TIMEOUT_SECONDS }` to every checkout create/list/get, customer-session create, subscription get, and external-customer delete SDK call. In this pinned SDK the request timeout unit is seconds, so tests must inspect the adapter arguments and prove the value is exactly `5`, never `5_000`.

If this exact package does not expose the documented API on Node 24.19, stop and revise the dependency choice in the spec/plan rather than silently mixing the stable adapter and preview API.

- [x] **Step 4: Implement conditional-free, fail-closed environment parsing**

All five provider variables are server-only and required in every repository quality environment. Local/CI scripts supply deterministic non-secret placeholders and valid distinct UUID-like IDs. They also set the optional deny-only `HUDDLE_AUTOMATION_BLOCK_POLAR_NETWORK` flag, which defaults false in normal Sandbox use and can only make the adapter reject external calls. The live token/secret remain ignored environment values. Build errors list variable names only.

The application does not expose `POLAR_ENVIRONMENT`; `getPolarClient` always selects Sandbox. Product labels and amounts come from `plans.ts`, while environment values provide only the two configured product IDs.

- [x] **Step 5: Run focused tests and compile the SDK contract**

Run the Step 2 command, then:

```bash
npm run typecheck
npm run security:audit
npm run build:local
git diff --check
```

Inspect the client bundle/build logs to confirm no Polar credential or server module crossed the boundary.

### Task 3: Add the private entitlement, checkout-attempt, and webhook-ledger foundation

**Status:** Complete locally on 3 September 2026. The migration, private authorization/capability helpers, guarded checkout persistence, bounded cleanup state, domain errors, and generated types passed independent review. One time-dependent test finding was fixed and re-reviewed, including historical/future-date verification. Final gates passed 44 database files / 1,870 assertions (124 billing assertions), 1,121 application tests, typecheck, lint, formatting, security audit, and local build. All migration/reset tests used a separate disposable Supabase project; the existing demo and hosted databases were unchanged. No commit, checkout/webhook wiring, or deployment was performed.

**Verification isolation:** The commands below were run from disposable `/tmp/huddle-vb01-db.Nfo88C`, project `huddlevb01test`, with separate ports and copied concurrency-test hostnames. Never reset the ordinary `huddle` stack to reproduce this evidence without checking its data and authorization. Generated types were copied back deliberately; other application gates ran in the working checkout.

**Files:**
- Create: `supabase/migrations/20260903090000_polar_venue_billing_foundation.sql`
- Create: `supabase/tests/database/290_venue_billing_entitlements_test.sql`
- Modify: `supabase/tests/database/167_workspace_activation_concurrency_test.sql` (only synthetic entitlement cleanup before existing fixture-venue deletion)
- Modify: `supabase/tests/database/281_account_erasure_concurrency_test.sql` (only synthetic entitlement cleanup before existing fixture-venue deletion)
- Modify: `lib/errors/domain.ts`
- Modify: `lib/errors/database.test.ts`
- Modify: `lib/errors/map-error.test.ts`
- Modify: `lib/errors/map-error.ts` (exhaustive status mapping for the new domain errors)
- Modify: `types/database.generated.ts` (generated)

**Database objects:**

```sql
public.venue_billing_status  -- inactive, confirming, active, past_due, canceling, provider_stale, legacy_grace, expired
public.venue_billing_interval -- month, year
public.venue_billing_checkout_failure_code -- request_rejected, not_created_after_timeout, expired, provider_failed
public.polar_venue_billing_event_type -- the eight subscribed event names
public.venue_billing_apply_outcome -- applied, duplicate, stale, observed, ignored, reconciliation_required, erasure_cleanup_required, erasure_cleanup_complete
private.venue_billing_entitlements
private.venue_billing_checkout_attempts
private.polar_webhook_events
private.polar_account_erasure_cleanup
private.lock_venue_billing(input_venue_id uuid) returns void
private.seed_new_venue_billing_entitlement()
private.backfill_legacy_venue_billing_entitlements(timestamptz)
private.apply_venue_billing_deadline_for_venue(uuid, timestamptz)
private.venue_billing_effective_state(uuid, timestamptz)
private.venue_allows_public_presence(uuid, timestamptz)
private.venue_allows_event_acquisition(uuid, timestamptz)
private.venue_allows_publishing(uuid, timestamptz, timestamptz)
private.venue_allows_draft_work(uuid, timestamptz)
public.get_venue_billing_context(uuid)
public.reserve_venue_billing_checkout(uuid, venue_billing_interval, uuid)
public.attach_venue_billing_checkout(
  uuid, text, timestamptz, text, text, text, integer, text,
  venue_billing_interval, integer, text, uuid
)
public.fail_venue_billing_checkout(uuid, venue_billing_checkout_failure_code, uuid)
public.close_venue_billing_checkout(uuid, text, venue_billing_checkout_failure_code, uuid)
public.complete_polar_account_erasure_cleanup(uuid, uuid)
```

The final UUID arguments are existing request/audit IDs where applicable. The checkout attachment scalars are attempt, checkout ID/expiry, organization, product, product-price, amount, normalized currency, interval, interval count, and external customer ID before the audit ID. Attachment/failure/close functions are service-role-only; reservation is exact-owner authenticated and returns whether this transaction created the reservation. Close accepts only the bounded `expired` or `provider_failed` evidence codes. `private.lock_venue_billing` uses one documented advisory-lock key derivation for every checkout, webhook, event, attendance, settings, archive, and deadline path and is never granted to browser roles. Authenticated functions call the existing actor serializer/assertion before this lock; service-role callbacks start here. Multi-venue erasure obtains the same venue locks in sorted UUID order.

- [x] **Step 1: Write the failing pgTAP contract first**

Cover:

- all private tables are outside exposed schemas, forced RLS, and unreadable/unwritable by `anon`, `authenticated`, and direct `service_role` table access;
- every newly created venue receives exactly one inactive entitlement in the same transaction, while pre-VB01 venues are backfilled once into a fixed seven-day `legacy_grace`;
- an `AFTER INSERT` venue trigger creates the inactive row for future venues, while the migration backfill alone creates immutable legacy deadlines for rows that already existed at cutover;
- the idempotent, postgres-only backfill primitive can be exercised with a fixed test timestamp after removing a test entitlement, inserts only missing rows, and never moves an existing deadline;
- customer ID is not unique while current subscription and Polar checkout IDs are unique when present;
- only one open checkout attempt can exist per venue;
- only the caller that atomically creates a reservation receives `created_by_this_call = true`; a retry sees the same generation but cannot independently create at Polar;
- closing or releasing an attempt rechecks its generation, checkout ID when attached, venue owner, archive state, and lack of a newer subscription binding under the common venue lock;
- exact owner may reserve checkout while an admin/member/non-member may not;
- an active/current/pending venue cannot reserve a duplicate checkout;
- public context returns no provider IDs and gives billing actions only to `venues.owner_id`;
- context permits portal but not checkout after local grace expiry while a provider subscription remains nonterminal, and permits a fresh checkout only after a signed terminal state releases the binding;
- effective state uses one supplied timestamp, is exclusive at deadline equality, distinguishes provider staleness from an actual `past_due` webhook, and maps an elapsed legacy/grace/canceling state to stored/effective `expired` rather than back to never-paid `inactive`;
- an open checkout derives `confirming` only for a newly inactive venue; legacy grace retains deadline precedence and reports `checkoutPending` separately;
- state/deadline/identifier constraints reject incoherent rows;
- checkout failure persistence accepts only a bounded code, never an SDK/provider error string;
- billing-event and apply-outcome enums contain only the documented bounded values;
- account-erasure cleanup state is private, idempotent, and can expose no provider identifier to browser roles;
- no database object collides with Fan `public.subscriptions`.

- [x] **Step 2: Run the focused database test and confirm red state**

Run:

```bash
npm run db:start
npm run db:reset
./node_modules/.bin/supabase test db --local supabase/tests/database/290_venue_billing_entitlements_test.sql
```

- [x] **Step 3: Implement the private tables and coherent constraints**

`private.venue_billing_entitlements` is one current projection per `venue_id`. Include status, interval/count, current Polar customer/subscription/product/selected-price IDs, validated amount and normalized currency, `paid_through_at`, fixed `grace_started_at`, `grace_expires_at`, subscription-snapshot modification time, last paid-order ID/time, last webhook ID, first activation, and timestamps.

Rules:

- provider-derived `confirming`, `active`, `past_due`, `canceling`, and `provider_stale` rows require coherent provider/customer/product/price/amount/currency/interval identity with interval count exactly one;
- `active` and `canceling` require `paid_through_at`;
- `past_due`, `provider_stale`, and `legacy_grace` require both grace timestamps and exactly seven days between them;
- repeated failure, stale evaluation, or cutover processing may not move `grace_started_at` or extend grace;
- rows outside those three grace states clear grace timestamps;
- `legacy_grace` retains the pre-VB01 venue without inventing provider identifiers;
- `inactive` means a never-activated post-VB01 venue and maps to `payment_required`; once legacy grace, payment grace, provider-stale grace, a paid cancellation period, or a terminal provider state ends, persist `expired` so the venue cannot regain draft/settings capability merely because it has no provider identifiers;
- `expired` may retain sanitized provider IDs for reconciliation, but a legacy-expired row is valid without them and may start checkout while remaining locked for all non-billing mutations;
- current subscription is unique, customer is deliberately not unique; and
- deadline indexes include venue ID for bounded ordered sweeps.

`private.venue_billing_checkout_attempts` stores attempt/venue/owner/plan/generation, a bounded `reserved | uncertain | attached | completed | failed | expired` state/failure code, and the validated Polar checkout response: checkout ID/expiry, organization, product, selected product-price ID, amount, normalized currency, recurring interval/count, and external customer ID. A partial unique index treats reserved, uncertain, and attached as open and permits only one per venue. A fresh reservation is distinguishable from a pre-existing attempt so only its creating request may call Polar. Guarded failure/close functions compare the same generation and never release a newer binding. Starting checkout for a `legacy_grace` venue must not replace, clear, extend, or visually mask its cutover deadline. Before the first subscription webhook, a newly inactive venue's workspace `confirming` state is derived from the bound open checkout attempt while the entitlement row stays inactive. A legacy venue remains `legacy_grace` and exposes only a separate safe `checkoutPending` boolean.

`private.polar_webhook_events` stores only signed webhook ID/type, venue/subscription/order IDs where applicable, the event-kind-specific provider modification timestamp, receipt/processing timestamps, and bounded outcome. Never store payload JSON.

`private.polar_account_erasure_cleanup` stores only the erased actor UUID, pending/completed timestamps, and a bounded outcome needed to retry provider cleanup before Auth deletion. Checkout attempts gain an erasure marker so an in-flight provider checkout can be matched later without ever restoring entitlement. Local erasure immediately clears provider customer/subscription/checkout/order identifiers from entitlement, attempt, and webhook projections while retaining the local attempt ID, venue, erased owner, plan, and bounded timestamps/outcomes needed to reject and clean a late webhook. `complete_polar_account_erasure_cleanup` is service-role-only, uses the global actor-then-sorted-venue lock order, and marks the external-ID deletion complete without reintroducing a provider identifier.

Create the trigger before any later task changes onboarding: future venue inserts receive inactive entitlement automatically inside the venue transaction. Define an idempotent `private.backfill_legacy_venue_billing_entitlements(input_cutover_at)` that inserts only venues missing entitlement, grants execution only to `postgres`, and is called once by the migration with one captured cutover timestamp. The pgTAP harness removes only its own test entitlement, invokes the primitive with a fixed timestamp, and reruns it to prove it neither duplicates nor extends the deadline; it does not pretend test-created post-migration venues are legacy rows. Also define the lock-requiring single-venue deadline primitive now. It transitions elapsed active rows to `provider_stale`, expires any due grace/canceling state, cancels only future published venue events, and preserves history. Task 5 uses it before applying late recovery; Task 8 later wraps it in the bounded batch scheduler.

- [x] **Step 4: Add centralized membership, ownership, and capability helpers**

Keep a membership-only helper for workspace switching/recovery. Add an exact owner helper based on `public.venues.owner_id`, because the legacy `private.actor_owns_venue` deliberately treats admins as owners for compatibility.

The safe billing-context RPC returns:

```ts
type VenueBillingContext = Readonly<{
  state:
    | "payment_required"
    | "confirming"
    | "active"
    | "past_due"
    | "provider_stale"
    | "legacy_grace"
    | "canceling"
    | "expired";
  interval: "month" | "year" | null;
  checkoutPending: boolean;
  paidThroughAt: string | null;
  graceExpiresAt: string | null;
  publishCutoffAt: string | null;
  isPublic: boolean;
  canPublish: boolean;
  canPrepareDrafts: boolean;
  canOperateExistingEvents: boolean;
  canManageBilling: boolean;
  canStartCheckout: boolean;
  canOpenPortal: boolean;
}>;
```

Do not return customer, subscription, product, price, checkout, webhook, or owner IDs.

- [x] **Step 5: Add exact domain failures and safe copy**

Add reviewed internal errors such as `VENUE_SUBSCRIPTION_REQUIRED`, `VENUE_BILLING_OWNER_REQUIRED`, `VENUE_BILLING_PENDING`, and `VENUE_BILLING_UNAVAILABLE`. Their messages are business-facing and must never be returned from public fan reads; fan routes retain `NOT_FOUND`, `NOT_ALLOWED`, or normal cancellation copy.

- [x] **Step 6: Regenerate types and run database gates**

Run:

```bash
npm run db:reset
npm run db:lint
npm run test:db
npm run db:types
npm run db:types:check
npm test -- lib/errors/database.test.ts lib/errors/map-error.test.ts
npm run typecheck
git diff --check
```

Review generated types: only public enums and RPC signatures should be visible; private table rows must not become ordinary browser-query types.

### Task 4: Implement owner-bound checkout reservation and onboarding handoff

**Status:** Complete locally on 4 September 2026. Independent review and scoped test review passed; owner checkout/recovery, onboarding Billing handoff, and minimal confirmation UI are implemented. Final full application suite: 1,177 passing tests plus one intentional skip; disposable DB: 44 files / 1,894 assertions. Public-only types, lint, security, formatting, browser smoke and local build passed. No provider checkout, normal-demo migration, hosted change, commit or deployment. Tasks 5–11 remain pending.

**Sequencing ruling:** Pull the minimal Billing landing page and safe context query forward from Task 7 so onboarding has a working destination. Task 7 extends that surface with portal/status/management integration. This intermediate task is local-only and not independently shippable: Task 3 creates inactive entitlements but Task 6 wires public visibility, acquisition, and publishing enforcement. The integrated no-public-venue-before-webhook regression belongs to Task 6. No deployment is permitted before the complete VB01 contract is implemented and verified.

**Files:**
- Create: `supabase/migrations/20260903091500_polar_venue_checkout_context.sql`
- Modify: `supabase/tests/database/290_venue_billing_entitlements_test.sql`
- Modify: `types/database.generated.ts` (generated)
- Create: `features/venue-billing/schemas.ts`
- Create: `features/venue-billing/schemas.test.ts`
- Create: `features/venue-billing/database.ts`
- Create: `features/venue-billing/database.test.ts`
- Create: `features/venue-billing/actions.ts`
- Create: `features/venue-billing/actions.test.ts`
- Modify: `features/venue-billing/types.ts`
- Modify: `features/venue-billing/polar.ts`
- Modify: `features/venue-billing/polar.test.ts`
- Create: `features/venue-billing/queries.ts`
- Create: `features/venue-billing/queries.test.ts`
- Create: `app/venues/[slug]/workspace/billing/page.tsx`
- Create: `app/venues/[slug]/workspace/billing/page.test.tsx`
- Create: `features/venue-billing/components/venue-plan-picker.tsx`
- Create: `features/venue-billing/components/venue-plan-picker.test.tsx`
- Create: `features/venue-billing/components/checkout-confirmation.tsx`
- Create: `features/venue-billing/components/checkout-confirmation.test.tsx`
- Create: `app/venues/[slug]/workspace/billing/return/page.tsx`
- Create: `app/venues/[slug]/workspace/billing/return/page.test.tsx`
- Modify: `features/workspaces/actions.ts`
- Modify: `features/workspaces/actions.test.ts`
- Modify: `features/workspaces/components/venue-onboarding-form.tsx`
- Modify: `features/workspaces/components/venue-onboarding-form.test.tsx`
- Modify: `app/onboarding/venue/page.tsx`
- Create: `app/onboarding/venue/page.test.tsx`
- Modify: `app/venues/new/page.test.tsx`

**Interfaces:**

```ts
export const startVenueCheckoutSchema = z.object({
  venueId: z.uuid(),
  plan: z.enum(["monthly", "yearly"]),
});

export async function startVenueCheckoutAction(
  rawInput: unknown,
): Promise<ActionResult<never>>; // redirects on success

export async function getVenueCheckoutReturn(
  venueId: string,
  checkoutId: string,
): Promise<"confirming" | "active" | "failed">;
```

- [x] **Step 1: Write failing action, onboarding, reservation, and return-page tests**

Assert:

- onboarding still atomically creates venue + owner membership, but the new entitlement is inactive and the result points to Billing;
- the minimal Billing destination renders the safe context, offers checkout only to the exact owner, and explains Sandbox/no real money without claiming public enforcement is already connected;
- only the exact owner can start checkout;
- server state supplies owner UUID, verified email, venue ID, product, metadata, `allow_trial: false`, and `allow_discount_codes: false` using the pinned SDK's exact request shape;
- a submitted raw Polar product/amount/customer/metadata value is impossible or ignored;
- metadata contains `huddle_venue_id`, `huddle_checkout_attempt_id`, and schema version `1`;
- one open attempt is reserved before the Polar call;
- only the request whose RPC result says it created that reservation may call `checkouts.create`; a retry of a pre-existing `reserved` attempt first reconciles it like `uncertain`, covering a process exit before or after the original provider call;
- a double click/retry reuses a recorded open checkout or returns a safe pending state instead of creating a second subscription;
- local expiry cannot reserve another checkout while the bound Polar subscription is still nonterminal, even though public entitlement has ended;
- a definitive validated 4xx checkout rejection closes the attempt with a bounded code, while timeout/network/429/5xx leaves an `uncertain` open attempt and never exposes provider detail;
- uncertain-attempt recovery lists only a bounded recent window by exact external customer and product, accepts only complete attempt-metadata/binding matches, reuses one match, waits before releasing zero matches, and escalates multiple matches without creating another checkout;
- attached-attempt recovery uses `checkouts.get`: `open` reuses its URL, `confirmed`/`succeeded` waits for the authoritative webhook, `expired`/`failed` closes only the same guarded attempt, and not-found/transport failure releases nothing;
- a narrow service-role-only checkout-context RPC supplies immutable reservation time, stored plan/state/generation, and bounded attached binding only after matching the trusted actor, venue, and attempt; browser roles cannot execute it and direct private-table access stays revoked;
- the response's `organization_id`, `product_id`, `product_price_id`, amount, currency, recurring interval/count, and `external_customer_id` are validated against trusted plan/owner state and persisted with the checkout ID before redirect;
- return page verifies membership plus venue/attempt/checkout binding; and
- completed checkout without an active webhook still says it is being confirmed and grants nothing.

- [x] **Step 2: Run focused tests and confirm red state**

Run:

```bash
npm test -- features/venue-billing/schemas.test.ts features/venue-billing/database.test.ts features/venue-billing/actions.test.ts features/venue-billing/components/venue-plan-picker.test.tsx features/venue-billing/components/checkout-confirmation.test.tsx features/workspaces/actions.test.ts features/workspaces/components/venue-onboarding-form.test.tsx app/onboarding/venue/page.test.tsx 'app/venues/[slug]/workspace/billing/return/page.test.tsx' app/venues/new/page.test.tsx
```

- [x] **Step 3: Connect inactive venue onboarding to Billing**

Rely on Task 3's `AFTER INSERT` trigger so `create_venue_workspace_v2` still commits venue, owner membership, main space, audit record, and the new inactive entitlement in one transaction. Do not add a second entitlement insert. Preserve common eligibility, attestation, Unverified state, slug uniqueness, and no required Fan activation.

Change onboarding copy from “immediately usable/ready” to a concise next step. On success select the new workspace and redirect to `/venues/{slug}/workspace/billing`, not the public page or planner.

Implement `getVenueBillingContext` against the existing safe authenticated RPC, validate its 13-field projection with Zod, and add the minimal private Billing route using shared brand/UI primitives and the plan picker. Preserve the existing four-destination workspace navigation until Task 7; onboarding and confirmation return links provide entry now. Never expose provider identifiers in this context or client props. While an attempt is pending, a retry must honor its immutable stored plan regardless of the newly submitted plan key.

- [x] **Step 4: Create checkout from trusted server state**

First add the forward checkout-context migration and pgTAP coverage. Task 3's owner-authenticated reservation returns only the attempt ID, generation, and `created_by_this_call`; the public billing context intentionally contains no provider identifiers. Reconciliation and return verification therefore use a separate narrow service-role-only getter, never direct private-table queries or expanded browser RPC payloads. It validates the trusted authenticated actor against exact current ownership and venue/attempt identity, rejects erased, archived, stale-owner, or mismatched attempts, and returns only the immutable reservation timestamp, plan/state/generation, and stored checkout binding needed by the server. Regenerate types and run the focused database tests before wiring the Server Action. Keep provider tokens, URLs, raw payloads, and error strings out of this projection.

The getter accepts a trusted actor/venue plus exactly one selector: local attempt UUID for action reconciliation, or Polar checkout ID for the return route. Reject both/neither selector, enforce current generation and eligibility, and return the same bounded projection in both cases. Do not add the internal attempt ID to the browser return URL. Keep any typed SDK-error classifier inside `polar.ts`, the existing SDK import boundary, and cover it in `polar.test.ts`; arbitrary thrown status-shaped objects are never definitive provider evidence.

Recovery boundary correction: Task 3's normal attachment requires a future checkout expiry. A response lost before attachment can later reconcile to an elapsed `confirmed`/`succeeded` or provider-terminal `expired`/`failed` checkout. Add a separate service-role-only reconciliation attachment RPC in this forward migration, accepting the same complete validated binding plus a bounded provider checkout status. Reuse the current-attempt lock/owner/archive/generation/subscription guards. It may retain an elapsed confirmed/succeeded checkout as attached and non-entitled, or atomically retain and terminalize a fully validated expired/failed checkout so the action may reserve a new generation. It never grants entitlement, handles arbitrary status, releases a 404/unknown, or runs through GET. Keep Task 3's normal attach contract unchanged. Also permit a narrow guarded service-only marker for the existing uncertain state; crash-left reserved attempts still reconcile identically. Cover grants, stale/racing bindings, elapsed success pending, and terminal recovery with tests.

The Server Action:

1. parses only `venueId` and plan key;
2. loads the authenticated actor and verified email;
3. calls the owner-only reservation RPC under the venue lock;
4. chooses the product from `getVenueBillingPlan`;
5. calls `polar.checkouts.create` with `external_customer_id: actor.id`, `customer_email`, fixed metadata, `products: [allowlistedProductId]`, `allow_trial: false`, `allow_discount_codes: false`, and an absolute trusted-app `success_url` ending in `/venues/{slug}/workspace/billing/return?checkout_id={CHECKOUT_ID}`; the organization is inferred from the Sandbox token because `CheckoutCreate` has no organization field;
6. validates the returned `organization_id`, product/selected-price identity, amount, normalized currency, recurring interval/count exactly one, and external customer, then attaches those values with the Polar checkout ID/expiry through a service-role-only RPC; and
7. redirects to the provider URL only after attachment commits.

Classify failures conservatively. The reservation RPC returns both the attempt generation and `createdByThisCall`; only that holder may call `checkouts.create`. Every pre-existing `reserved` or `uncertain` attempt first uses `checkouts:read` with the SDK option `{ timeout: POLAR_API_TIMEOUT_SECONDS }` to list a bounded recent window for the exact `external_customer_id` and product, then requires the exact attempt metadata plus complete response binding. This covers a process exit before the provider call, after the provider accepted it, or before local state could be marked uncertain. Attach/reuse one match. With zero matches, wait until the immutable reservation age reaches `CHECKOUT_RECONCILIATION_TIMEOUT_MS` (15 minutes), perform a fresh exact lookup, and only then let the guarded RPC close that generation as `not_created_after_timeout`; this is Huddle's conservative window, not a claimed Polar guarantee. Stop for operator reconciliation if more than one matches. Only a definitive validated 4xx request rejection can call the bounded failure RPC immediately; timeout, network interruption, rate limit, or 5xx stays open.

For an `attached` attempt, call `checkouts.get` outside the database transaction. Revalidate the complete stored binding. Reuse the URL only for `open`; keep `confirmed` or `succeeded` attached and show confirmation pending until a signed subscription webhook arrives; for provider-confirmed `expired` or `failed`, call the guarded close RPC and then reserve a new generation. A 404, timeout, or transport error is not proof of terminal state and leaves the attempt open until bounded consistency/expiry reconciliation can establish it. All post-network attach/fail/close RPCs reacquire the common lock and compare the exact attempt generation, venue owner, archive state, and subscription binding. Never create a second checkout while the outcome is unknown.

Do not forward an arbitrary `x-forwarded-for`. If tax location forwarding is retained, accept only Vercel's documented trusted connecting-IP header through a strict single-IP parser; otherwise omit it for this ILS-only demo.

- [x] **Step 5: Implement the private confirmation surface**

The return page checks the checkout belongs to the current user's venue attempt, optionally reads that checkout by ID with a short timeout, and primarily reads local entitlement. It renders one of:

- `Confirming your demo subscription…`
- `Your venue is ready.` with a workspace link after local active state; or
- `Checkout was not completed.` with a safe Billing return.

Keep the async route page server-only for membership, attempt, and entitlement checks. Render the small `CheckoutConfirmation` Client Component only while confirming; it refreshes every `CHECKOUT_CONFIRMATION_POLL_INTERVAL_MS` for at most `CHECKOUT_CONFIRMATION_POLL_TIMEOUT_MS`, then shows a safe still-confirming message and Billing link. That 60-second UI wait is distinct from the 15-minute reservation reconciliation window and never closes an attempt. Never mutate through GET and never expose checkout/provider/customer data.

- [x] **Step 6: Run focused and foundation tests to green**

Run the Step 2 command, then:

```bash
./node_modules/.bin/supabase test db --local supabase/tests/database/290_venue_billing_entitlements_test.sql
npm run typecheck
npm run lint
npm run security:audit
git diff --check
```

### Task 5: Validate, normalize, and idempotently apply Polar billing webhooks

**Files:**
- Create: `tests/fixtures/polar/subscription-created.json`
- Create: `tests/fixtures/polar/subscription-active.json`
- Create: `tests/fixtures/polar/subscription-past-due.json`
- Create: `tests/fixtures/polar/subscription-recovered.json`
- Create: `tests/fixtures/polar/subscription-canceling.json`
- Create: `tests/fixtures/polar/subscription-uncanceled.json`
- Create: `tests/fixtures/polar/subscription-cycled.json`
- Create: `tests/fixtures/polar/subscription-revoked.json`
- Create: `tests/fixtures/polar/subscription-revoked-erased.json`
- Create: `tests/fixtures/polar/order-paid-renewal.json`
- Create: `features/venue-billing/webhook.ts`
- Create: `features/venue-billing/webhook.test.ts`
- Create: `app/api/polar/webhooks/route.ts`
- Create: `app/api/polar/webhooks/route.test.ts`
- Create: `supabase/migrations/20260903093000_polar_venue_billing_webhooks.sql`
- Modify: `features/venue-billing/database.ts`
- Modify: `features/venue-billing/database.test.ts`
- Modify: `supabase/tests/database/290_venue_billing_entitlements_test.sql`
- Modify: `types/database.generated.ts` (generated)

**Interfaces:**

```ts
type NormalizedPolarSubscriptionEvent = Readonly<{
  kind: "subscription";
  webhookId: string;
  type:
    | "subscription.created"
    | "subscription.active"
    | "subscription.canceled"
    | "subscription.uncanceled"
    | "subscription.cycled"
    | "subscription.past_due"
    | "subscription.revoked";
  organizationId: string;
  subscriptionId: string;
  checkoutId: string;
  checkoutAttemptId: string;
  venueId: string;
  customerId: string;
  externalCustomerId: string;
  productId: string;
  priceId: string;
  amountMinor: number;
  currency: string;
  interval: "month" | "year";
  intervalCount: 1;
  providerStatus: string;
  cancelAtPeriodEnd: boolean;
  currentPeriodEnd: string | null;
  pastDueAt: string | null;
  eventTimestamp: string;
  providerModifiedAt: string;
}>;

type NormalizedPolarErasedSubscriptionTerminalEvent = Readonly<
  Omit<NormalizedPolarSubscriptionEvent, "kind" | "type" | "externalCustomerId"> & {
    kind: "erased_subscription_terminal";
    type: "subscription.revoked";
    externalCustomerId: null;
  }
>;

type NormalizedPolarRenewalPaidEvent = Readonly<{
  kind: "renewal_paid";
  webhookId: string;
  type: "order.paid";
  orderId: string;
  billingReason: "subscription_cycle";
  eventTimestamp: string;
  providerModifiedAt: string;
  organizationId: string;
  subscriptionId: string;
  checkoutId: string | null;
  checkoutAttemptId: string;
  venueId: string;
  customerId: string;
  externalCustomerId: string;
  productId: string;
  priceId: string;
  amountMinor: number;
  currency: string;
  interval: "month" | "year";
  intervalCount: 1;
  providerStatus: string;
  cancelAtPeriodEnd: boolean;
  currentPeriodEnd: string;
}>;

type NormalizedPolarRenewalReconciliationEvent = Readonly<{
  kind: "renewal_reconciliation";
  webhookId: string;
  type: "order.paid";
  orderId: string;
  billingReason: "subscription_cycle";
  eventTimestamp: string;
  providerModifiedAt: string;
  organizationId: string;
  subscriptionId: string;
  checkoutId: string | null;
  checkoutAttemptId: string;
  venueId: string;
  customerId: string;
  externalCustomerId: string;
  productId: string;
  signedCurrentPeriodEnd: string | null;
  interval: "month" | "year";
}>;

export type NormalizedPolarBillingEvent =
  | NormalizedPolarSubscriptionEvent
  | NormalizedPolarErasedSubscriptionTerminalEvent
  | NormalizedPolarRenewalPaidEvent
  | NormalizedPolarRenewalReconciliationEvent;

export async function validateAndNormalizePolarWebhook(
  rawBody: string,
  headers: Headers,
  environment?: ServerEnvironment,
): Promise<NormalizedPolarBillingEvent>;

export async function applyPolarBillingEvent(
  event: NormalizedPolarBillingEvent,
): Promise<
  | Readonly<{
      outcome:
        | "applied"
        | "duplicate"
        | "stale"
        | "observed"
        | "ignored"
        | "reconciliation_required";
      cleanupActorId: null;
    }>
  | Readonly<{
      outcome: "erasure_cleanup_required";
      cleanupActorId: string;
    }>
  | Readonly<{
      outcome: "erasure_cleanup_complete";
      cleanupActorId: null;
    }>
>;
```

```sql
public.apply_polar_venue_billing_event(
  input_webhook_id text,
  input_event_type public.polar_venue_billing_event_type,
  input_event_timestamp timestamptz,
  input_provider_modified_at timestamptz,
  input_organization_id text,
  input_subscription_id text,
  input_checkout_id text,
  input_checkout_attempt_id uuid,
  input_venue_id uuid,
  input_customer_id text,
  input_external_customer_id text,
  input_product_id text,
  input_price_id text,
  input_amount_minor integer,
  input_currency text,
  input_interval public.venue_billing_interval,
  input_interval_count integer,
  input_provider_status text,
  input_cancel_at_period_end boolean,
  input_current_period_end timestamptz,
  input_past_due_at timestamptz,
  input_order_id text,
  input_billing_reason text,
  input_signed_period_end timestamptz,
  input_audit_request_id uuid
) returns table (
  outcome public.venue_billing_apply_outcome,
  cleanup_actor_id uuid
);

public.complete_polar_venue_billing_reconciliation(
  input_webhook_id text,
  input_subscription_id text,
  input_provider_modified_at timestamptz,
  input_checkout_id text,
  input_customer_id text,
  input_external_customer_id text,
  input_product_id text,
  input_price_id text,
  input_amount_minor integer,
  input_currency text,
  input_interval public.venue_billing_interval,
  input_interval_count integer,
  input_provider_status text,
  input_cancel_at_period_end boolean,
  input_current_period_end timestamptz,
  input_audit_request_id uuid
) returns public.venue_billing_apply_outcome;
```

Fields not present for one discriminated event kind are passed as SQL `NULL`; the function rejects any event-type/field combination outside the documented union. Both functions accept only the normalized scalar fields above, revoke execution from `public`, `anon`, and `authenticated`, grant execution only to `service_role`, and acquire `private.lock_venue_billing(input_venue_id)` before any row lock. No JSON payload or arbitrary error text crosses either RPC. The apply result may expose the erased Huddle actor UUID only to the trusted service-role route and only with `erasure_cleanup_required`; every other result has a null cleanup target. The reconciliation function resolves venue ID from the pending receipt/binding rather than accepting it again.

Paid renewal proof is also bound to its signed nested subscription period. Complete renewals pass that period in `input_signed_period_end`; the reconciliation variant preserves it as nullable `signedCurrentPeriodEnd` when the nested detail lacks prices or other full subscription fields. Persist only this bounded scalar with the pending receipt. The completion RPC must require a non-null signed period and an exactly matching canonical period before granting access: an old paid order must not authorize a later unpaid cycle. A proof with no signed period stays retryable and grants nothing; fetching a current subscription alone cannot supply missing historical payment proof.

**Provider-to-local mapping:**

No subscription-snapshot event may advance a routine renewal period or recover `provider_stale`; those transitions require the fully bound paid-renewal proof below. Within that constraint:

- `subscription.created` / `incomplete` → `confirming` for a new inactive venue, never public; for `legacy_grace`, update only the attempt/receipt and preserve the immutable legacy state/deadline until activation.
- a fully bound `subscription.active` with `cancel_at_period_end=false` → initial `active`, or recovery from a previously signed `past_due` state (including its locally expired form); it may adopt that recovery event's later period end because Polar emits this event when failed payment recovers, but it cannot by itself recover `provider_stale` or prove a routine still-active renewal.
- an active snapshot with `cancel_at_period_end=true`, including the named canceled event → `canceling` for an initially activating/past-due-recovering subscription or within an already-proven current period; it records but does not repair `provider_stale`.
- `past_due` → `past_due`, fixing first failure time and deadline once.
- `uncanceled` may transition only stored/effective `canceling` → `active` when the already-proven `paid_through_at` is still in the future at the transaction's one captured current timestamp; in every other state it is observation-only, so it cannot repair `provider_stale` or an elapsed/expired period.
- `cycled` → record a non-authoritative observation only; never advance `paid_through_at` because Polar emits it before payment succeeds.
- `order.paid` with `billing_reason=subscription_cycle`, `paid=true`, and a complete match to the already-bound subscription/customer/product/price/amount/currency/interval/count/metadata → advance `paid_through_at` from the nested subscription period and recover `provider_stale` or `past_due` to `active`/`canceling` according to the nested subscription's validated status and `cancel_at_period_end`, without changing already-cancelled events. This is the required proof for routine renewal and `provider_stale`; `past_due` may also recover through the explicit bound `subscription.active` transition above.
- other `order.paid` billing reasons → acknowledge/ignore for entitlement; initial activation still waits for `subscription.active`.
- `revoked`, `canceled` terminal status, `unpaid`, `paused`, or `incomplete_expired` → stored/effective `expired`; never collapse a formerly entitled or legacy-grace venue back to never-paid `inactive`.
- `trialing` and every unsupported product/state → ignored configuration failure, never entitled.

- [x] **Step 0: Create the fixture directory**

Run:

```bash
mkdir -p tests/fixtures/polar
```

- [x] **Step 1: Save sanitized representative payloads and write failing normalization tests**

Fixtures may contain only invented UUIDs, owner IDs, venue IDs, product/price IDs, timestamps, and non-secret metadata. Remove real emails, names, checkout URLs, tokens, signatures, and card/payment data.

Tests compute Standard Webhooks headers with a known local secret instead of saving a real signature. Cover valid signatures, altered body, missing/duplicate/oversized headers, stale timestamp, malformed JSON, unsupported event, wrong metadata schema, nullable subscription `modified_at`, `past_due_at`, every state mapping, a pre-payment cycled event, a paid renewal, and non-renewal `order.paid`. Normalize the ordering key as `data.modified_at ?? event.timestamp`, retain the signed event timestamp separately, and anchor failure grace to `data.past_due_at ?? event.timestamp`—never local receipt time. For a complete `order.paid`, derive plan binding and paid-through from its nested subscription and exactly one recurring price item; do not compare the tax-inclusive order total as the plan amount. A renewal order's `checkout_id` and its nested subscription checkout ID are nullable, so neither normalized renewal variant requires one. Resolve the original checkout attempt from the already-current subscription plus signed venue/attempt metadata; when the nested checkout ID is non-null, require it to equal the local binding. If the signed paid order has complete organization/customer/product/subscription/metadata binding but its nested subscription detail is absent/incomplete, normalize the narrower `renewal_reconciliation` proof instead of failing Zod before reconciliation. Missing core top-level binding is still an invalid payload.

Normal subscription activation/recovery/reconciliation requires a non-null external customer ID equal to the venue owner UUID. The only nullable exception is a signed `subscription.revoked` normalized as `erased_subscription_terminal`: it must still contain the configured organization, an allowlisted product, and exact Huddle venue/attempt metadata. The guarded apply transaction may accept that exception only when those values match a retained erasure marker. This accommodates Polar clearing the customer's external ID during anonymizing deletion without weakening any entitlement-granting path.

- [x] **Step 2: Write failing route and transactional database tests**

Assert:

- signature validation happens before Zod parsing or any service-role call;
- organization and Monthly/Annual product IDs must match configuration;
- attempt lifecycle, stored Polar checkout ID, venue, exact owner external customer, product, selected price, amount, normalized currency, interval/count, and subscription bindings match; renewal orders resolve that existing binding without requiring a non-null order checkout ID;
- receipt insert and state transition are one transaction;
- duplicate `webhook-id` returns success/no-change;
- an older `modified_at` records stale/no-change;
- repeated `past_due` cannot extend grace;
- `subscription.created` cannot clear or mask an existing legacy deadline;
- `subscription.cycled` and catch-all active snapshots cannot extend paid access before matching renewal payment proof;
- only a fully bound `order.paid` with `billing_reason=subscription_cycle` can prove routine renewal, advance an already-active period, or recover `provider_stale`; a fully bound `subscription.active` may separately activate a new subscription or recover a previously signed `past_due` state;
- a signed paid renewal with complete top-level binding but incomplete nested subscription persists a reconciliation proof and grants nothing until a separately fetched subscription passes the second guarded RPC;
- subscription snapshot versions and paid-order versions are tracked separately; each order ID applies once and can only move `paid_through_at` strictly forward;
- old subscription A cannot change active resubscription B;
- an event for an erased owner or archived-by-erasure venue returns `erasure_cleanup_required` with its server-only cleanup actor, grants nothing, and cannot be mistaken for a normal activation;
- a signed null-external-ID `subscription.revoked` is accepted only through the retained erased-owner marker; if cleanup is already complete it returns `erasure_cleanup_complete`, acknowledges without another provider call, and cannot create a retry storm;
- redelivery of a receipt still marked `erasure_cleanup_required` remains actionable and returns the same cleanup actor instead of collapsing to an inert duplicate;
- `subscription.created` and checkout success never activate;
- invalid signature is `403`, invalid recognized payload is `400`, and transient database/provider reconciliation error is retryable non-2xx;
- a correctly signed event unknown to the pinned SDK is acknowledged `202` with a bounded safe diagnostic so an API addition cannot create an endless retry storm;
- a successful/duplicate commit returns `200` with no internal IDs; and
- log calls contain only request ID, event type, provider object ID suffix/hash if needed, and safe outcome.

- [x] **Step 3: Run focused tests and confirm red state**

Run:

```bash
npm test -- features/venue-billing/webhook.test.ts features/venue-billing/database.test.ts app/api/polar/webhooks/route.test.ts
./node_modules/.bin/supabase test db --local supabase/tests/database/290_venue_billing_entitlements_test.sql
```

- [x] **Step 4: Implement the raw-body route and strict event parser**

Use:

```ts
import { webhooks } from "@polar-sh/sdk/2026-04";
```

Pass the untouched `await request.text()`, an explicit record containing the original `webhook-id`, `webhook-timestamp`, and `webhook-signature` values, and the server secret to `await webhooks.validateEvent(...)`. Handle `webhooks.PolarWebhookVerificationError`, `webhooks.PolarWebhookUnknownTypeError`, and `webhooks.PolarWebhookError` distinctly; a validly signed unknown/unsubscribed type receives `202` plus only a bounded safe diagnostic. Then parse the typed result again through Huddle's narrow Zod discriminated union so only approved fields reach the database.

Do not use Polar's generic Next.js webhook callback because Huddle needs the raw `webhook-id` as its durable idempotency key and a venue-bound transactional apply step.

- [x] **Step 5: Implement the service-role-only apply transaction**

`public.apply_polar_venue_billing_event(...)` accepts sanitized scalar arguments, acquires the common venue transaction lock, and:

1. inserts the receipt or returns duplicate;
2. verifies the checkout attempt, owner, venue, product, customer, and current subscription relation;
3. calls Task 3's single-venue deadline primitive before applying a late recovery;
4. ignores older subscription-snapshot versions and events for a superseded subscription, while handling paid-order idempotency/strictly-forward period advancement in its separate ordering lane;
5. fixes the first `grace_started_at` and `grace_expires_at` exactly once for `past_due` without extending an existing grace window;
6. applies the coherent local projection;
7. marks the attempt completed only for the matching subscription; and
8. writes minimal security audit evidence without provider payload fields.

At equal subscription `providerModifiedAt` with a conflicting state or an incomplete embedded subscription, do not invent an ordering and never call Polar while a SQL transaction/advisory lock is open. The first RPC commits a bounded `reconciliation_required` receipt outcome and releases all locks. Fetch the canonical subscription by ID with `subscriptions:read` under a short timeout, revalidate its complete binding, then call the second guarded RPC referencing the same webhook ID. A pending reconciliation row is retryable rather than treated as a completed duplicate. If reconciliation is unavailable, return retryable failure. A fetched active subscription may resolve status/cancellation conflicts but cannot by itself advance a cycled renewal; that still requires the matching `order.paid` proof.

Before any normal activation, the apply RPC checks the retained attempt erasure marker and archived/deleted owner state. It records `erasure_cleanup_required`, resolves the erased actor UUID from that marker, returns it only to the service-role route, releases every database lock, and grants nothing. The route calls `customers.deleteExternal(result.cleanupActorId, { anonymize: true })`; it never relies on the webhook's external customer ID for cleanup. Success or `404` is followed by the guarded cleanup-completion RPC, which marks pending erasure receipts complete, and then a normal acknowledgment. A transient provider failure returns retryable non-2xx so Polar redelivers and the pending receipt remains actionable. After Polar has cleared the external ID, a matching signed `subscription.revoked` with null external ID follows the erased terminal variant; already-completed cleanup returns `erasure_cleanup_complete` and is acknowledged without calling Polar again. No nullable-external-ID event can grant or recover entitlement. This is the only webhook path with customer deletion, and no network call occurs while a transaction is open.

- [x] **Step 6: Run the webhook gates to green**

Create the forward webhook-transition migration rather than editing Task 3's already-applied foundation migration. Then reset/reapply before the database and generated-type gates:

```bash
npm run db:reset
npm run db:lint
./node_modules/.bin/supabase test db --local supabase/tests/database/290_venue_billing_entitlements_test.sql
npm run db:types
npm run db:types:check
npm test -- features/venue-billing/webhook.test.ts features/venue-billing/database.test.ts app/api/polar/webhooks/route.test.ts
npm run typecheck
npm run lint
npm run security:audit
git diff --check
```

Use a test spy to prove checkout/webhook test execution makes zero requests whose parsed hostname is exactly `polar.sh` or ends with `.polar.sh`.

### Task 6: Enforce entitlement across publishing, discovery, event visibility, and acquisition

Execution preflight (4 September 2026): Existing TypeScript wrappers/pages that already delegate to these authoritative RPCs and preserve safe DTO/cache boundaries may remain unchanged after inspection; do not add cosmetic lifecycle guards. Include timestamp-expired cancellation projection in private `list_venue_calendar`, `get_venue_today`, and `list_managed_venue_events` readers as needed, preserving membership-only access. Bring forward only the necessary intended-public pgTAP fixture updates from Task 9 so Task 6's full database suite remains runnable; activate exact synthetic venues explicitly, preserve original assertions, and leave seed/E2E/harness work deferred. Eligibility helpers acquire profile row locks, so authenticated mutations take the actor serializer and venue lock before invoking those helpers. Detailed execution rulings and unchanged-file evidence are retained in the local Task 6 brief/report.

**Files:**
- Create: `supabase/migrations/20260903100000_polar_venue_billing_enforcement.sql`
- Create: `supabase/tests/database/291_venue_billing_visibility_test.sql`
- Modify: `features/venues/actions.ts`
- Modify: `features/venues/actions.test.ts`
- Modify: `features/venues/queries.ts`
- Modify: `features/venues/queries.test.ts`
- Modify: `features/venues/workspace/actions.ts`
- Modify: `features/venues/workspace/actions.test.ts`
- Modify: `features/events/actions.ts`
- Modify: `features/events/actions.test.ts`
- Modify: `features/events/queries.ts`
- Modify: `features/events/queries.test.ts`
- Modify: `features/discovery/query.ts`
- Modify: `features/discovery/query.test.ts`
- Modify: `features/assisted-discovery/database.ts`
- Modify: `features/assisted-discovery/database.test.ts`
- Modify: `features/attendance/actions.ts`
- Modify: `features/attendance/actions.test.ts`
- Modify: `features/account-erasure/actions.ts`
- Modify: `features/account-erasure/actions.test.ts`
- Modify: `app/venues/[slug]/page.tsx`
- Create: `app/venues/[slug]/page.test.tsx`
- Modify: `app/events/[eventId]/page.tsx`
- Modify: `app/events/[eventId]/page.test.tsx`
- Modify: `app/matches/[matchId]/page.test.tsx`
- Modify: `app/api/discovery/route.test.ts`
- Modify: `app/api/assisted-discovery/route.test.ts`
- Modify: `app/api/events/[eventId]/calendar.ics/route.ts`
- Modify: `app/api/events/[eventId]/calendar.ics/route.test.ts`
- Modify: `supabase/tests/database/280_account_erasure_test.sql`
- Modify: `supabase/tests/database/281_account_erasure_concurrency_test.sql`
- Modify: `types/database.generated.ts` (generated)

**SQL definitions to replace in the new forward migration:**

- `private.discover_event_page` and `private.search_assisted_events_core` (latest definitions are in `20260902210000_attendance_rediscovery.sql`);
- `discover_events`, `discover_open_door_events`, and `discover_owned_venue_events`;
- `get_public_event_map_points`, `list_match_events`, `list_venue_events`, and `get_venue_by_slug`;
- `venue_follow_is_allowed`, a new `follow_venue` RPC, the `venue_follows` insert policy/grant, and `list_my_saved_items`;
- `get_venue_billing_context` and `reserve_venue_billing_checkout`, retaining their contracts while moving row-locking common eligibility after actor serialization and the venue lock;
- `private.event_is_visible_to_actor`, `get_event_summary`, `get_calendar_event`, `list_my_event_participation`, and `list_my_events`;
- `create_or_update_event`/its private core and `plan_venue_events`;
- `request_or_join_event`, `create_event_invitation`, `revoke_event_invitation`, and `respond_to_event_invitation`;
- `private.attendance_review_state` and `review_attendance`;
- `remove_attendee`, `cancel_event`, `update_venue`, `update_venue_workspace_v2` plus its compatibility wrapper, and `save_venue_space`; and
- `prepare_account_erasure`, preserving its existing product-erasure behavior and return contract while adding billing terminalization, cleanup state, and the global actor-then-sorted-venue lock order, plus the new private core and versioned wrapper described below.

Do not edit old committed migration files; copy and replace their final signatures in this forward migration with matching revoke/grant/comment statements.

The forward migration must preserve the existing RPC's boolean success/idempotency contract and add a versioned wrapper for the billing-aware action:

```sql
public.prepare_account_erasure(text, uuid)
returns boolean;

public.prepare_account_erasure_v2(text, uuid)
returns table (prepared boolean, polar_cleanup_required boolean);
```

Move the shared implementation behind a private core that browser roles cannot execute. Both public wrappers retain authenticated-only grants. V2 returns `prepared = true` plus the safe cleanup flag and is the only wrapper allowed to commit a preparation that requires Polar cleanup. V1 preserves its `boolean` shape and existing `true` success/idempotency result only when no Polar cleanup is pending or provider cleanup already completed; if cleanup would be required, it raises the already-reviewed `UPSTREAM_UNAVAILABLE` token before commit so an old action or direct authenticated caller cannot tombstone locally and strand a Polar customer. Provider IDs never cross either boundary. Regenerate both public TypeScript signatures, and test the unchanged V1 return type plus this fail-closed compatibility behavior.

- [x] **Step 1: Write the failing billing visibility/acquisition pgTAP matrix**

For an otherwise-identical venue event, prove:

- a newly onboarded venue with its atomic inactive entitlement is absent from public venue/Explore/acquisition paths and cannot publish before a valid activating webhook; onboarding-to-Billing is not itself authorization;
- active is present in every ordinary/open-door/owned/map/match/venue/Ask source and accepts join/request/invite/follow/public calendar;
- active may publish a fixture months after current `paid_through_at`;
- canceling remains public now but excludes/rejects an event whose `starts_at >= paid_through_at` while retaining an earlier event;
- a requested or approved participant can still privately read/My Huddle/export a still-scheduled post-cutoff canceling event even though it is absent from public acquisition;
- past due, provider stale, and legacy grace disappear immediately from every public/owned source and block new publish/join/request/direct invite/direct-invite acceptance/follow;
- an existing requested or approved actor can still read the scheduled event during any grace state;
- an already-pending request may be approved or declined, but an unaccepted direct invitation cannot be accepted and no new invitation/request is created;
- existing invitation revocation, attendee removal, and event cancellation remain available to an authorized manager during grace, under the same lock, but are rejected after expiry except for any narrower existing safety right;
- an unrelated actor cannot read the hidden event;
- payment-required/confirming/expired are absent and non-acquirable;
- payment-required/confirming/grace may update private venue/space setup, while expired rejects those direct RPC mutations even if a client bypasses disabled controls;
- direct table insertion cannot bypass the follow entitlement or race a terminal transition; the new follow RPC acquires the common venue lock, while ordinary unfollow remains available;
- account erasure archives and terminalizes every owned venue, closes every open attempt, records provider cleanup without exposing identifiers, and remains idempotent;
- Fan/private/group-hosted events are unchanged; and
- suspension, archive, block, audience, capacity, and common eligibility remain stricter when applicable.

- [x] **Step 2: Add failing application boundary and cache tests**

Keep public DTO schemas unchanged—there must be no billing field to parse. Assert hidden venue events do not re-enter through `discover_owned_venue_events`, map points, match pages, venue pages, saved items, Ask, or a shared cached ICS response. Participant-specific hidden event and ICS responses are private/no-store. Replace the current active public venue-calendar `s-maxage=300` expectation with `private, no-store`; venue-hosted ICS is never shared-cacheable, even while active. Update upstream account-erasure tests now—not in the later fixture sweep—because this task revokes direct venue-follow insertion. Give their intended public venue fixtures explicit active entitlements and replace authenticated direct follow inserts/races with `follow_venue` while preserving the original erasure assertions.

- [x] **Step 3: Run focused tests and confirm red state**

Run:

```bash
./node_modules/.bin/supabase test db --local supabase/tests/database/291_venue_billing_visibility_test.sql
./node_modules/.bin/supabase test db --local supabase/tests/database/280_account_erasure_test.sql
./node_modules/.bin/supabase test db --local supabase/tests/database/281_account_erasure_concurrency_test.sql
npm test -- features/venues/actions.test.ts features/venues/queries.test.ts features/venues/workspace/actions.test.ts features/events/actions.test.ts features/events/queries.test.ts features/discovery/query.test.ts features/assisted-discovery/database.test.ts features/attendance/actions.test.ts features/account-erasure/actions.test.ts 'app/venues/[slug]/page.test.tsx' 'app/events/[eventId]/page.test.tsx' 'app/matches/[matchId]/page.test.tsx' app/api/discovery/route.test.ts app/api/assisted-discovery/route.test.ts 'app/api/events/[eventId]/calendar.ics/route.test.ts'
```

- [x] **Step 4: Add explicit commercial predicates to every public projection**

All venue public rows require `private.venue_allows_public_presence`. A venue event additionally requires the event-specific acquisition predicate, especially for canceling subscriptions. Do not exempt owners in Explore; their hidden events belong only in workspace queries.

Replace authenticated direct `venue_follows` insertion with `public.follow_venue(input_venue_id, audit_request_id)`. Revoke direct insert privilege/use a deny policy, obtain the existing actor transaction token first, then acquire the common venue lock, recheck Fan/common eligibility and current public entitlement, and insert idempotently. Preserve own-row unfollow even after a venue hides. Apply that actor-then-venue order to every authenticated billing-sensitive mutation; service-role webhook/deadline functions have no actor and start at the venue lock.

Keep management reads membership-authorized. A hidden venue's public page returns the normal not-found result even to its owner; owner preview remains a private workspace concern.

- [x] **Step 5: Gate transitions, not merely submitted intent**

For `create_or_update_event` and `plan_venue_events`:

- active can create/publish any distant event;
- canceling can create/publish only events before the paid-end cutoff;
- payment-required/confirming and every grace state can create/edit unpublished drafts;
- during `past_due`, `provider_stale`, or `legacy_grace`, billing adds no extra restriction to an operation on an existing event that the event's existing invariants already allow: managers may edit or cancel it, review already-pending requests, remove attendees, and manage its ordinary operational details while it remains hidden;
- no grace operation may newly create a published row, move a draft to published, or duplicate/re-publish a hidden published event;
- draft → published and new published rows require current publishing entitlement; and
- expired can only read retained history/billing state, not edit or create.

Apply the common venue lock before entitlement and event row locks so webhook, publishing, and attendance cannot race.

For private venue settings, allow `update_venue`, both workspace-update signatures/wrappers, and `save_venue_space` in payment-required, confirming, active, canceling, and pre-deadline grace states. Reject them in expired/restricted state. Each acquires the common venue lock before entitlement or venue/space row locks and still enforces every existing membership, ownership, archive, validation, and space constraint.

- [x] **Step 6: Separate existing commitments from new acquisition**

Add an explicit venue-event acquisition predicate instead of overloading `event_is_visible_to_actor`:

- new join/request and direct invite creation require acquisition entitlement;
- direct-invitation acceptance also requires acquisition entitlement, so an unaccepted invitation cannot be accepted during grace; declining it remains available;
- already-pending requests may be approved/declined and attendees removed;
- current requested/approved actors retain detail, My Huddle, and authorized private calendar visibility during grace;
- current requested/approved actors retain those same private paths for a post-cutoff `canceling` event until paid-period expiry actually cancels it;
- leaving/cancelling one's own attendance remains available; and
- none of these exceptions make the event discoverable to anyone else.

Apply the same decision in `private.attendance_review_state`, `review_attendance`, `remove_attendee`, `cancel_event`, and `revoke_event_invitation` under the common venue lock: permitted existing-management operations work before a grace deadline, but not at/after expiry. Event invite-token RPCs remain private-person-only and outside VB01. Make `get_calendar_event.public_cacheable` entitlement-aware so a hidden participant response can never be labeled shared-cacheable.

- [x] **Step 7: Coordinate account erasure with Polar before Auth deletion**

Refactor `prepare_account_erasure` behind a private core in the forward enforcement migration without editing the upstream migration. Preserve the original public function's exact arguments, authenticated-only grant, boolean return type, confirmation, cancellation, invitation, group, location, audit, and idempotency behavior. Add `prepare_account_erasure_v2(text, uuid) returns table (prepared boolean, polar_cleanup_required boolean)` for the updated Server Action; its authenticated-only wrapper invokes the same core and exposes no provider identifier. The shared core must:

1. take the actor transaction token;
2. collect all owned venue IDs, acquire their billing advisory locks in sorted UUID order, and only then lock/update entitlement, venue, event, follow, and membership rows;
3. archive owned venues, terminalize their entitlements, close every open attempt, clear provider identifiers from billing/webhook projections, and retain only a minimal local erased-at attempt marker for an in-flight checkout webhook;
4. upsert the private Polar cleanup state; and
5. return the safe cleanup decision to V2; V1 returns `true` only when that decision is false, and otherwise raises `UPSTREAM_UNAVAILABLE` so the whole V1 transaction rolls back before any local erasure commits.

After the existing password reauthentication, `deleteAccountAction` calls V2 and requires `prepared = true`. It calls `customers.deleteExternal(user.id, { anonymize: true })` only when cleanup is required. Polar success and `404` are idempotent completion; any other provider failure returns the existing generic retryable error and stops before Auth deletion. Then call the service-role-only local cleanup-completion RPC to scrub retained provider bindings, and only after that succeeds call `auth.admin.deleteUser`. On retry, locally prepared/provider-completed states remain idempotent. A Fan who never reached Polar skips the provider call entirely.

Test both RPC signatures/grants and generated types, V1's unchanged `true` result for a no-cleanup account, V1 rollback/error when a Polar interaction makes cleanup necessary, V2's safe cleanup flag, a no-billing Fan, one customer with two owned venues, existing active/past-due subscriptions, a reserved/uncertain/attached checkout, provider success, already-deleted `404`, provider timeout, local completion failure, Auth failure after provider completion, and a checkout that succeeds after local erasure. The late signed webhook must invoke the same external-ID anonymizing deletion outside locks, return retryable failure if cleanup fails, and never activate the venue. Two-connection pgTAP tests prove erasure versus follow/checkout across several venues cannot deadlock and that the lock order is actor token → sorted venue locks → rows.

- [x] **Step 8: Make caching fail closed**

Do not rely on Next.js invalidation for billing correctness: the database predicates evaluate one current timestamp on every dynamic public read and mutation, including after a `pg_cron` transition when no Next.js process exists to revalidate a path. Do not add shared route/data caching around those projections. Because a paid venue can become hidden immediately while an existing public ICS response otherwise remains at a CDN for up to ten minutes, every venue-hosted ICS response uses `private, no-store` even while active. A viewer-specific participant response is also private/no-store so a cached response cannot reveal it to another visitor. Fan/private-host calendar behavior remains governed by its existing rules. App-driven transitions may revalidate affected paths as a UI freshness optimization, but authorization and fan truth never depend on it.

- [x] **Step 9: Run visibility gates and regenerate types**

Reset first so the new forward enforcement migration is actually applied, then run the focused and full gates:

```bash
npm run db:reset
npm run db:lint
./node_modules/.bin/supabase test db --local supabase/tests/database/291_venue_billing_visibility_test.sql
npm test -- features/venues/actions.test.ts features/venues/queries.test.ts features/venues/workspace/actions.test.ts features/events/actions.test.ts features/events/queries.test.ts features/discovery/query.test.ts features/assisted-discovery/database.test.ts features/attendance/actions.test.ts features/account-erasure/actions.test.ts 'app/venues/[slug]/page.test.tsx' 'app/events/[eventId]/page.test.tsx' 'app/matches/[matchId]/page.test.tsx' app/api/discovery/route.test.ts app/api/assisted-discovery/route.test.ts 'app/api/events/[eventId]/calendar.ics/route.test.ts'
npm run test:db
npm run db:types
npm run db:types:check
npm run typecheck
npm run security:audit
git diff --check
```

### Task 7: Add the venue Billing workspace and capability-aware management UI

Task 4 already created the minimal Billing landing page and safe context query to support onboarding; extend those files here rather than creating a second surface.

**Files:**
- Modify: `features/venue-billing/types.ts`
- Modify: `features/venue-billing/actions.ts`
- Modify: `features/venue-billing/actions.test.ts`
- Modify: `features/venue-billing/queries.ts`
- Modify: `features/venue-billing/queries.test.ts`
- Create: `features/venue-billing/components/billing-status-banner.tsx`
- Create: `features/venue-billing/components/billing-status-banner.test.tsx`
- Create: `features/venue-billing/components/venue-billing-panel.tsx`
- Create: `features/venue-billing/components/venue-billing-panel.test.tsx`
- Modify: `app/venues/[slug]/workspace/billing/page.tsx`
- Modify: `app/venues/[slug]/workspace/billing/page.test.tsx`
- Modify: `app/venues/[slug]/workspace/layout.tsx`
- Create: `app/venues/[slug]/workspace/layout.test.tsx`
- Modify: `app/venues/[slug]/workspace/page.tsx`
- Create: `app/venues/[slug]/workspace/page.test.tsx`
- Modify: `app/venues/[slug]/workspace/plan/page.tsx`
- Modify: `app/venues/[slug]/workspace/plan/page.test.tsx`
- Modify: `app/venues/[slug]/workspace/calendar/page.tsx`
- Create: `app/venues/[slug]/workspace/calendar/page.test.tsx`
- Modify: `app/venues/[slug]/workspace/events/page.tsx`
- Create: `app/venues/[slug]/workspace/events/page.test.tsx`
- Modify: `app/venues/[slug]/workspace/settings/page.tsx`
- Create: `app/venues/[slug]/workspace/settings/page.test.tsx`
- Modify: `app/events/[eventId]/manage/page.tsx`
- Modify: `app/events/[eventId]/manage/page.test.tsx`
- Modify: `features/workspaces/queries.ts`
- Modify: `features/workspaces/queries.test.ts`
- Modify: `features/workspaces/types.ts`
- Modify: `features/workspaces/components/venue-workspace-header.tsx`
- Modify: `features/workspaces/components/venue-workspace-header.test.tsx`
- Modify: `features/venues/workspace/queries.ts`
- Modify: `features/venues/workspace/queries.test.ts`
- Modify: `features/venues/workspace/types.ts`
- Modify: `features/venues/workspace/components/fixture-planner.tsx`
- Modify: `features/venues/workspace/components/fixture-planner.test.tsx`
- Modify: `features/venues/workspace/components/today-dashboard.tsx`
- Modify: `features/venues/workspace/components/today-dashboard.test.tsx`
- Modify: `features/venues/workspace/components/venue-settings-form.tsx`
- Modify: `features/venues/workspace/components/venue-settings-form.test.tsx`
- Modify: `features/venues/workspace/components/venue-space-editor.tsx`
- Create: `features/venues/workspace/components/venue-space-editor.test.tsx`
- Modify: `features/attendance/components/event-management-controls.tsx`
- Modify: `features/attendance/components/event-management-controls.test.tsx`
- Modify: `features/attendance/components/event-invitation-picker.tsx`
- Modify: `features/attendance/components/event-invitation-picker.test.tsx`
- Modify: `features/events/components/venue-event-form.tsx`
- Modify: `features/events/components/venue-event-form.test.tsx`

**Interfaces:**

```ts
export async function getVenueBillingContext(
  venueId: string,
): Promise<VenueBillingContext>;

export async function openVenueBillingPortalAction(
  rawInput: unknown,
): Promise<ActionResult<never>>; // redirects on success, safe result on failure

type FixturePlannerBillingCapabilities = Readonly<{
  canPublish: boolean;
  canPrepareDrafts: boolean;
  publishCutoffAt: string | null;
  blockedReason: string | null;
}>;
```

- [x] **Step 1: Write failing query, page, banner, panel, header, and planner tests**

Cover every context state and owner/admin role at desktop and mobile widths. Assert:

- all active venue members retain the workspace and see one consistent state warning;
- Billing is a venue-specific navigation destination;
- owner sees plan/portal actions; admin sees status plus “Only the venue owner can manage billing” and no action;
- all payment screens say `Polar Sandbox` and `No real money will be charged`;
- active has no noisy global warning;
- public-page links are disabled/replaced with private-state copy when hidden;
- past due states exactly that the venue/events are hidden and shows the deadline in Israel-local display;
- provider stale says Huddle is confirming the demo subscription and never claims that payment failed;
- legacy grace explains the one-time cutover deadline and checkout action without exposing anything to fans, and an open checkout never replaces that deadline warning;
- canceling explains the paid end and affected event cutoff;
- managers can edit/cancel existing events, review already-pending requests, and remove attendees during every grace state, while controls for new direct invitations and publishing remain unavailable;
- expired UI leaves history/Billing/archive reachable while edit/publish controls are unavailable, offers the portal while an old subscription remains nonterminal, and never offers a second checkout until a signed terminal state releases it;
- planner still saves drafts during payment-required/confirming/grace, but publish is disabled and server failure remains handled; and
- no public/fan component renders any billing copy; and
- route-level Server Component tests prove the shell removes or replaces hidden public links and that plan, calendar, events, settings, and dashboard pages receive the safe capability projection rather than assuming active access. The expired events empty state must not retain its current actionable `Plan events` link.

- [x] **Step 2: Run focused tests and confirm red state**

Run:

```bash
npm test -- features/venue-billing/actions.test.ts features/venue-billing/queries.test.ts features/venue-billing/components/billing-status-banner.test.tsx features/venue-billing/components/venue-billing-panel.test.tsx 'app/venues/[slug]/workspace/billing/page.test.tsx' 'app/venues/[slug]/workspace/layout.test.tsx' 'app/venues/[slug]/workspace/page.test.tsx' 'app/venues/[slug]/workspace/plan/page.test.tsx' 'app/venues/[slug]/workspace/calendar/page.test.tsx' 'app/venues/[slug]/workspace/events/page.test.tsx' 'app/venues/[slug]/workspace/settings/page.test.tsx' 'app/events/[eventId]/manage/page.test.tsx' features/workspaces/queries.test.ts features/workspaces/components/venue-workspace-header.test.tsx features/attendance/components/event-management-controls.test.tsx features/attendance/components/event-invitation-picker.test.tsx features/events/components/venue-event-form.test.tsx features/venues/workspace/queries.test.ts features/venues/workspace/components/fixture-planner.test.tsx features/venues/workspace/components/today-dashboard.test.tsx features/venues/workspace/components/venue-settings-form.test.tsx features/venues/workspace/components/venue-space-editor.test.tsx
```

- [x] **Step 3: Load one safe capability projection in the workspace shell**

Extend venue workspace queries/types with the safe RPC result, not provider identifiers. Wrap the server query with React `cache()` for request-local deduplication and call it from the layout and any Server Component page that needs capabilities; an App Router layout cannot inject arbitrary props into its child route. Pass only needed scalar capabilities into Client Components. Keep `requireActor({ venueId })` membership-based so inactive owners/admins can recover.

- [x] **Step 4: Build the Billing page and owner-only portal action**

Use existing Card, Button, Badge, and Alert/Dialog primitives. The panel shows fixed Monthly/Annual plan copy, current safe status/dates, and either plan checkout or customer-portal action. The portal action:

1. parses the venue ID;
2. rechecks exact ownership and current subscription/customer binding in Supabase;
3. creates a fresh Polar Customer Session server-side using the pinned SDK's snake_case request fields;
4. redirects immediately to the returned `customer_portal_url`; and
5. never stores or renders that URL/token.

Render actions only from `canStartCheckout` and `canOpenPortal`, never from a loose `expired` label. A never-paid or terminally released owner sees plan checkout; an owner whose locally expired subscription is still retrying sees only the portal. This prevents old and new subscriptions from both recovering.

- [x] **Step 5: Make venue tools capability-aware without weakening the database**

Feed `canPublish`, `canPrepareDrafts`, and canceling cutoff into every venue-event creation surface. Keep all event edits already allowed by existing event invariants, cancellation, already-pending request review, attendee removal, and attendance/calendar management accessible during grace. Hide or disable new direct-invitation controls because they generate new acquisition; the database remains authoritative. Event invite tokens belong to private-person `invite_only` events, which venue events cannot create, so VB01 does not alter their RPCs or UI. In expired mode render retained information and recovery navigation rather than submitting disabled mutations. Keep settings information visible but prevent locked mutations such as venue-space creation.

Business warning examples:

- payment required: `Your venue is private. Choose a demo plan to publish it.`
- confirming: `We're confirming your demo subscription. Your venue is still private.`
- past due: `Your venue and events are hidden. Update the demo payment method by {date} to keep managing this workspace.`
- provider stale: `We're confirming your demo subscription. Your venue and events are hidden for now. Check Billing by {date}.`
- legacy grace: `Your venue and events are now private. Choose a demo plan by {date} to keep your existing schedule.`
- canceling: `Your demo subscription ends on {date}. Events from that date onward are hidden and will be cancelled when access ends.`
- expired with a nonterminal binding: `This venue is private and editing is locked. Open Billing to recover the existing demo subscription.`
- expired after a signed terminal state: `This venue is private and editing is locked. Choose a demo plan to continue.`

These strings remain inside authenticated venue UI only.

- [x] **Step 6: Run UI/accessibility gates to green**

Run the Step 2 command, then:

```bash
npm run typecheck
npm run lint
npm run format:check
npm run build:local
git diff --check
```

Manually verify keyboard focus, loading, empty, error, owner/admin, 375 px overflow, and disabled-versus-read-only semantics before moving on.

### Task 8: Enforce deadlines, preserve fan history, and warn on venue closure

Local source/review checkpoint (4 September 2026): all listed Task8 gates passed, including 47 database files /2,337 assertions and 223 application files /1,295 tests plus one intentional live skip. Independent review and the closure-navigation fix review are clear. Controller browser verification reached owner recovery and admin denial, but the complete run was interrupted by Mac sleep/network suspension; reliable final browser/build/aggregate verification remains in the combined local batch. No hosted scheduler or deployment was executed.

**Files:**
- Create: `supabase/migrations/20260903110000_polar_venue_billing_deadlines.sql`
- Create: `supabase/tests/database/292_venue_billing_deadlines_test.sql`
- Create: `supabase/tests/database/293_venue_billing_concurrency_test.sql`
- Create: `supabase/production/configure-venue-billing-sweep.sql`
- Create: `supabase/production/verify-venue-billing-sweep.sql`
- Modify: `features/venue-billing/webhook.ts`
- Modify: `features/venue-billing/webhook.test.ts`
- Modify: `features/venue-billing/database.ts`
- Modify: `features/venue-billing/database.test.ts`
- Modify: `features/venue-billing/queries.ts`
- Modify: `features/venue-billing/queries.test.ts`
- Modify: `features/venue-billing/actions.ts`
- Modify: `features/venue-billing/actions.test.ts`
- Modify: `features/dashboard/queries.ts`
- Modify: `features/dashboard/queries.test.ts`
- Modify: `features/attention/queries.ts`
- Modify: `features/attention/queries.test.ts`
- Modify: `features/attendance/queries.ts`
- Modify: `features/attendance/queries.test.ts`
- Modify: `features/calendar/ics.ts`
- Modify: `features/calendar/ics.test.ts`
- Modify: `app/events/[eventId]/page.tsx`
- Modify: `app/events/[eventId]/page.test.tsx`
- Modify: `app/api/events/[eventId]/calendar.ics/route.ts`
- Modify: `app/api/events/[eventId]/calendar.ics/route.test.ts`
- Modify: `features/venues/workspace/actions.ts`
- Modify: `features/venues/workspace/actions.test.ts`
- Modify: `features/venues/workspace/components/venue-closure-control.tsx`
- Modify: `features/venues/workspace/components/venue-closure-control.test.tsx`
- Create: `app/venues/[slug]/billing/page.tsx`
- Create: `app/venues/[slug]/billing/page.test.tsx`
- Modify: `types/database.generated.ts` (generated)

**Database interfaces:**

```sql
private.expire_venue_billing_entitlements(
  input_now timestamptz,
  input_limit integer
) returns table (
  venue_id uuid,
  previous_status public.venue_billing_status,
  next_status public.venue_billing_status,
  cancelled_event_count integer
);

public.run_venue_billing_deadline_sweep(
  input_now timestamptz,
  input_limit integer,
  audit_request_id uuid
); -- service_role/postgres only
```

- [x] **Step 1: Write failing deadline and fan-history tests**

Use injected timestamps; never sleep. Cover:

- `past_due` is operational before but not at `grace_expires_at`;
- `provider_stale` and `legacy_grace` have the same exact private operating deadline without being presented as failed payments;
- repeated failure, stale evaluation, or cutover processing cannot shift that timestamp;
- any grace expiry persists `expired`/restricted, cancels only not-yet-started `published` venue events, revokes their still-pending invitations, and leaves drafts/past/started/completed/already-cancelled rows unchanged;
- canceling is entitled before but not at `paid_through_at`, and period expiry cancels remaining future published events;
- requested/approved participants retain private access to still-scheduled post-cutoff canceling events before paid-period expiry;
- active with an elapsed `paid_through_at` and no new snapshot becomes hidden `provider_stale` anchored at paid-through, receiving seven management days instead of indefinite public access, immediate cancellation, or a false payment-failure claim;
- at/after a grace or paid deadline, a requested/approved participant's private read projects an affected future event as cancelled with the neutral reason even before the sweep persists it, avoiding a temporary disappearance or stale scheduled state;
- that authorized participant's private ICS also projects `STATUS:CANCELLED` and the neutral description at the deadline, without billing/provider text, before or after persistence;
- current requested/approved participants retain a cancelled venue event in My Huddle/history and can open its neutral cancelled detail;
- attendance and invitation history are never deleted;
- a later recovery activates the venue but never changes cancelled event rows;
- a recovery that wins the venue lock before an expiry sweep prevents cancellation;
- if expiry commits first, a later recovery restores entitlement but does not resurrect events;
- each automatic transition writes only bounded audit counts/status/source, with no provider/customer/payment data; and
- an archived venue stays hidden, its exact owner may open the portal for an existing bound subscription, and no archived venue can start/restart checkout;
- archive closes the current open attempt and its stale attach/webhook generation can never reactivate the archived venue.

- [x] **Step 2: Write failing two-connection race tests**

Follow the repository's existing `dblink` patterns from `061`, `151`, and `167`. Cover:

- duplicate and stale webhook delivery;
- old subscription A terminal event racing new subscription B activation;
- publish versus `past_due` transition;
- join/invite versus `past_due` transition;
- venue follow versus terminal/grace transition;
- venue/profile/workspace/space settings writes versus terminal/deadline transition;
- archive versus checkout reservation/attachment and archive versus publish;
- sweep versus recovery;
- two sweep workers selecting the same venue; and
- consistent venue advisory lock then entitlement/event row-lock order with no deadlock.

- [x] **Step 3: Run the focused database tests and confirm red state**

Run:

```bash
./node_modules/.bin/supabase test db --local supabase/tests/database/292_venue_billing_deadlines_test.sql
./node_modules/.bin/supabase test db --local supabase/tests/database/293_venue_billing_concurrency_test.sql
```

- [x] **Step 4: Implement a bounded, idempotent sweep plus dynamic fallback**

Capture one `input_now`. Select at most `input_limit` candidate venue IDs in `(deadline, venue_id)` order without taking entitlement row locks. For each candidate, acquire/try the common venue advisory transaction lock first, then lock and re-read that venue's entitlement, skip it if no longer due, and call Task 3's single-venue deadline primitive. Never take an entitlement/event row lock before the venue lock. Two workers may nominate the same candidate, but only one can acquire and process it.

When an otherwise-active row first reaches `paid_through_at` without a newer provider snapshot, persist `provider_stale` with `grace_started_at = paid_through_at` and one immutable seven-day deadline. This transition hides access but does not cancel events or claim a failed payment. Only the fully bound paid-renewal proof defined in Task 5 may restore it; an `active` subscription snapshot alone is insufficient. Recovery before expiry prevents cancellation, while recovery after stored `expired` restores entitlement without reviving cancelled events.

For true expiry, update the entitlement to stored `expired` first, preserving enough bounded provider binding/status to distinguish portal recovery from a fresh checkout and preserving `expired` even for a no-provider legacy row. Then cancel matching future published rows with:

```sql
status = 'cancelled',
cancelled_at = input_now,
cancel_reason = 'This event has been cancelled.'
```

Revoke only still-pending invitations for those event IDs. Do not alter attendance rows or drafts. Ensure event transition triggers/constraints remain satisfied and write one bounded audit record per venue rather than raw per-attendee/provider detail.

Every public/publish/acquisition predicate independently derives expired access from timestamps. Participant summary/detail functions likewise derive the neutral effective cancellation at the deadline until persistence catches up. The sweep persists lifecycle outcomes; it is not the security or fan-truth gate.

- [x] **Step 5: Preserve ordinary fan cancellation truth**

Extend `list_my_events`/event-summary relationship checks so a prior requested or approved attendee can see a cancelled venue event without making it public again. The page uses the existing event status and exact neutral sentence. A non-participant still receives ordinary not-found behavior. Extend the calendar database DTO/query and `CalendarEvent` serializer with a bounded status. An authorized participant receives a private/no-store event with the same UID plus `STATUS:CANCELLED` and the neutral cancellation description at or after effective expiry, even before the sweep persists the row; an unauthorized actor receives the existing not-found response. No calendar output contains billing text.

- [x] **Step 6: Preserve archive and warn about separate billing**

Keep archived venues hidden regardless of entitlement. Redefine `archive_venue` in the deadline migration so it obtains the actor transaction token, then `private.lock_venue_billing(input_venue_id)`, before locking the venue or any event row; it rechecks exact ownership/archive state and closes any open local checkout attempt in the same transaction. Reservation, attachment, publication, and webhook paths use the compatible global order and recheck `archived_at`, so neither a stale attempt nor an in-flight post-network attach can activate the archived venue. Preserve the existing exact-owner archive action in every billing state; do not require Polar cancellation first and do not mutate Polar as a side effect. The confirmation warns internally that archiving does not cancel the demo subscription and links to Billing. Add `/venues/{slug}/billing` as a narrow exact-owner archived-billing recovery route backed by dedicated query/action/RPC paths that do not use or relax `actor_manages_venue`, `list_my_workspaces`, or ordinary workspace authorization (all correctly exclude archived venues). It exposes only safe status plus the portal action for an existing bound subscription. An archived venue can never start or restart checkout. Admins and non-owners receive normal not-found behavior.

- [x] **Step 7: Add reviewed hosted scheduler SQL**

`configure-venue-billing-sweep.sql`:

- enables/reuses `pg_cron` without Vault or HTTP;
- validates the target function signature;
- unschedules only the exact `huddle-venue-billing-deadlines` job name; and
- schedules a direct database call every minute with a bounded batch.

`verify-venue-billing-sweep.sql` reports only job name/schedule/active state and function presence. It must not print table contents or provider identifiers. Do not run either hosted script without current explicit authorization.

- [x] **Step 8: Run deadline, history, and closure gates to green**

Run:

```bash
npm run db:reset
npm run db:lint
npm run test:db
npm run db:types
npm run db:types:check
npm test -- features/venue-billing/webhook.test.ts features/venue-billing/database.test.ts features/venue-billing/queries.test.ts features/dashboard/queries.test.ts features/attention/queries.test.ts features/attendance/queries.test.ts features/calendar/ics.test.ts 'app/events/[eventId]/page.test.tsx' 'app/api/events/[eventId]/calendar.ics/route.test.ts' 'app/venues/[slug]/billing/page.test.tsx' features/venues/workspace/actions.test.ts features/venues/workspace/components/venue-closure-control.test.tsx
npm run typecheck
npm run security:audit
git diff --check
```

### Task 9: Update deterministic fixtures and prove the complete local journey

**Files:**
- Modify: `supabase/seed.sql`
- Modify: `supabase/tests/database/060_venues_private_events_test.sql`
- Modify: `supabase/tests/database/070_venue_group_events_visibility_test.sql`
- Modify: `supabase/tests/database/080_group_event_discovery_test.sql`
- Modify: `supabase/tests/database/090_invitations_attendance_calendar_test.sql`
- Modify: `supabase/tests/database/100_moderation_security_accessibility_test.sql`
- Modify: `supabase/tests/database/120_workspace_foundation_test.sql`
- Modify: `supabase/tests/database/121_workspace_authorization_review_test.sql`
- Modify: `supabase/tests/database/130_venue_spaces_defaults_test.sql`
- Modify: `supabase/tests/database/140_current_state_attention_test.sql`
- Modify: `supabase/tests/database/145_discovery_acquisition_boundary_test.sql`
- Modify: `supabase/tests/database/165_common_onboarding_test.sql`
- Modify: `supabase/tests/database/167_workspace_activation_concurrency_test.sql`
- Modify: `supabase/tests/database/170_venue_planner_test.sql`
- Modify: `supabase/tests/database/190_open_door_venue_events_test.sql`
- Modify: `supabase/tests/database/200_discovery_map_projection_test.sql`
- Modify: `supabase/tests/database/210_production_consistency_group_archive_test.sql`
- Modify: `supabase/tests/database/220_event_invite_links_venue_archive_test.sql`
- Modify: `supabase/tests/database/270_assisted_discovery_test.sql`
- Create: `tests/e2e/venue-billing.spec.ts`
- Modify: `tests/e2e/auth.spec.ts`
- Modify: `tests/e2e/ux-redesign.spec.ts`
- Modify: `tests/e2e/calm-crud.spec.ts`
- Modify: `tests/e2e/assisted-discovery.spec.ts`
- Modify: `features/venue-billing/polar.ts`
- Modify: `features/venue-billing/polar.test.ts`
- Modify: `tests/boundaries/server-only.test.ts`
- Modify: `vitest.config.mts`
- Modify: `playwright.config.ts`
- Modify: `scripts/local-quality-environment.mjs`
- Modify: `scripts/local-quality-environment.test.mjs`
- Modify: `scripts/run-acceptance.mjs`

**Fixture rule:** Existing tests that are proving ordinary public venue behavior must explicitly create an active deterministic entitlement after creating their venue. Production migration backfills pre-VB01 venues into one fixed `legacy_grace`, while the insert trigger gives later venues inactive entitlement; only deliberate test/seed setup grants active fixture entitlement.

- [x] **Step 1: Reset the database and capture every expected regression**

Run the complete pgTAP and Playwright suites once after enforcement lands. Classify failures as:

- a venue fixture that now correctly needs explicit entitlement;
- a test whose old immediately-public expectation is obsolete; or
- a real billing regression.

Do not weaken production defaults merely to make legacy fixtures pass.

- [x] **Step 2: Update seed and pgTAP setup deliberately**

Use invented Sandbox-like IDs in `supabase/seed.sql` to make only the intended demo venue active. In each listed pgTAP file, set the venue state required by that test case explicitly. Avoid a global helper that silently makes every venue paid, because hidden-by-default behavior must remain visible in tests.

- [x] **Step 3: Build an offline end-to-end billing journey**

`venue-billing.spec.ts` covers:

1. venue onboarding ends at a private Billing page;
2. an admin sees status but cannot start checkout/open portal;
3. an owner sees two Sandbox plan choices and no-real-money copy;
4. a service-role test setup attaches an invented checkout to an owner-reserved attempt;
5. the test sends a locally signed saved `subscription.active` fixture to the real webhook route;
6. the venue becomes public and can publish a distant fixture;
7. a signed `past_due` fixture hides it from a different Fan while its existing attendee and manager retain the approved paths;
8. a controlled deadline RPC cancels the future published event and the fan sees only normal cancellation; and
9. recovery activates the venue without reviving that event.

Do not call `startVenueCheckoutAction` in Playwright unless the Polar client is injected with an in-process test double. Never add an environment-controlled external API base URL or production-access bypass solely for E2E.

- [x] **Step 4: Update existing browser journeys**

Where auth/calm/UX/Ask journeys need a public venue, use the deterministic active seed. Add assertions that owner workspace navigation remains available while the public venue is hidden. Preserve the three required viewports and existing privacy/safety checks.

- [x] **Step 5: Prove no automated test reaches Polar**

Wire the guard at all automation boundaries, not only in a browser listener:

- `vitest.config.mts`, `scripts/local-quality-environment.mjs`, and `scripts/run-acceptance.mjs` set `HUDDLE_AUTOMATION_BLOCK_POLAR_NETWORK=true` for unit/component, local-build, browser, and aggregate acceptance processes;
- `playwright.config.ts` refuses to reuse an already-running web server while that flag is set, ensuring the tested Next.js process inherited it;
- every narrow provider method in `features/venue-billing/polar.ts` checks the flag before invoking the SDK and throws a bounded local-only error; tests spy on the SDK transport to prove it was never reached;
- `tests/boundaries/server-only.test.ts` permits Polar SDK imports only in the adapter and local signature verifier, preventing a feature from bypassing the guarded gateway; and
- the billing Playwright test fails on any browser request whose parsed hostname is exactly `polar.sh` or ends in `.polar.sh`.

The flag is deny-only and never changes entitlement or provider responses. The only accepted Polar interaction in automation is local SDK signature verification and explicitly mocked client methods. Production-smoke tests do not invoke billing mutations.

- [x] **Step 6: Run the full local data and browser suite**

Run:

```bash
npm run db:reset
npm run db:lint
npm run test:db
npm run db:types:check
npm test
npm run test:e2e
npm run test:acceptance
git diff --check
```

Record actual new test/assertion/journey counts only after these commands finish; never copy the old README counts forward.

### Task 10: Complete local release gates and truthful documentation

**Files:**
- Create: `docs/operations/POLAR-SANDBOX-BILLING.md`
- Create: `docs/evidence/vb01/ACCEPTANCE.md`
- Modify: `docs/operations/DEPLOYMENT.md`
- Modify: `docs/operations/PRODUCTION-ACCEPTANCE.md`
- Modify: `docs/submission/TEST-PLAN.md`
- Modify: `docs/submission/TRACEABILITY.md`
- Modify: `docs/submission/PRESENTATION.md`
- Modify: `docs/submission/SECURITY.md`
- Modify: `docs/submission/README.md`
- Modify: `README.md`
- Modify: `docs/HUDDLE-STEP-BY-STEP-BUILD-SPEC.md`
- Modify: `docs/B11-SECURITY-CHECKLIST.md`
- Modify: `.github/workflows/ci.yml`

- [x] **Step 0: Create the evidence directory**

Run:

```bash
mkdir -p docs/evidence/vb01
```

- [x] **Step 1: Write the runbook before touching hosted settings**

The runbook must contain:

- the exact Sandbox-only resource inventory and expected names;
- least-privilege token scopes: `checkouts:read`, `checkouts:write`, `customer_sessions:write`, `subscriptions:read`, and `customers:write`; the last is used only for account erasure by external ID;
- the selected webhook event list;
- environment-variable names but never values;
- product price/interval/trial/discount checks;
- multiple-subscription and portal-setting checks;
- migration/deploy/webhook/scheduler ordering;
- duplicate delivery, failed renewal, recovery, cancellation, and endpoint-disable response procedures;
- account-erasure provider cleanup, idempotent `404`, late-checkout cleanup, and retry-before-Auth-deletion procedures;
- how to rotate token/webhook secret without printing either;
- the fact that Sandbox email reaches organization members only;
- a forward-fix rollback posture that never makes unpaid venues public; and
- explicit authorization stops before every Polar, Supabase, Vercel, GitHub, and production mutation.

- [x] **Step 2: Update documentation to match implemented local truth**

Mark VB01 locally complete only after all local gates pass. State hosted Sandbox configuration/live walkthrough as pending until Task 11. Replace old test counts with current command output. Update the B11 security checklist's calendar route row: every venue-hosted ICS is now `private, no-store`, including active public events. Make the CI browser-test step label count-agnostic so adding or removing an E2E journey cannot leave a false hard-coded count. Update the presentation to demonstrate the free Fan versus paid-per-venue distinction and the Sandbox banner without pretending money or business verification is real.

- [x] **Step 3: Run the entire repository quality sequence from the pinned runtime**

Run each command separately with Node 24.19/npm 11.17:

```bash
npm ci
npm run db:start
npm run db:reset
npm run db:lint
npm run test:db
npm run db:types:check
npm run test:coverage
npm run typecheck
npm run lint
npm run format:check
npm run security:audit
npm run build:local
npm run test:e2e
npm run test:acceptance
git diff --check
git status --short
```

- [x] **Step 4: Review the complete diff for scope and secrets**

Run:

```bash
git diff --stat
git diff -- AGENTS.md README.md .env.example .env.preview.example .env.production.example .github docs package.json package-lock.json lib features app supabase scripts tests types
git status --short
rg -l "(polar_(oat|whs|whsec)_|whsec_)[A-Za-z0-9_-]+" AGENTS.md README.md .env.example .env.preview.example .env.production.example .github docs package.json package-lock.json lib features app supabase scripts tests types --hidden --glob '!**/*.local' --glob '!tmp/**'
rg -l "4242([[:space:]]4242){3}" AGENTS.md README.md .env.example .env.preview.example .env.production.example .github app features lib scripts supabase tests types
```

Ordinary `git diff` does not show untracked files. From the `git status --short` output, review every planned `??` file separately with `git diff --no-index -- /dev/null '<path>'` (exit code 1 means a diff exists); do not stage files merely to inspect them. The filename-only secret scan must return no real-secret candidates and intentionally excludes local environment files and user-owned `tmp/` so their contents cannot be printed. The test-card scan must return no application/test file; the number may appear only in the reviewed design and demo runbook. Verify unrelated `tmp/` and pre-existing user changes are absent from the diff.

- [x] **Step 5: Perform a read-only security and product review**

Review the final branch specifically for:

- checkout parameter substitution;
- admin-as-owner confusion;
- unsigned/replayed/stale webhook acceptance;
- subscription A overwriting subscription B;
- grace-extension abuse;
- publish/join races;
- owner-only Explore leakage;
- private cache leakage;
- fan-facing billing copy;
- event/attendance history deletion;
- Auth deletion before Polar external-customer anonymization, or a late checkout reviving an erased owner's venue;
- actor/venue lock-order inversion in follow, checkout, archive, or multi-venue erasure;
- accidental production Polar mode; and
- a documented statement that payment means verification.

Fix every blocking finding as the original writer, rerun affected gates, and leave the work uncommitted until the paired Huddle workflow and current user authorize publication.

### Task 11: Configure the Huddle Sandbox organization and perform the live demo smoke test

**Hosted outcome — 4 September 2026:** happy path passed. PR #56 deployed the reviewed
implementation after CI; both hosted databases match all 44 migrations. Two labelled
demo venues activated through genuine signed Sandbox callbacks, remain Unverified,
and have independent subscriptions under one owner. One clearly labelled October
fixture was published beyond its initial paid period and appeared in public/Explore.
The owner portal, duplicate UI guard, scheduler, and rotated-secret real redelivery
passed. See [sanitized evidence](../../evidence/vb01/ACCEPTANCE.md). Activation was
already complete when the return page was observed; no transient confirming screen
is claimed. Hosted failure/renewal/cancellation/erasure drills remain separate from
this happy-path result and their local deterministic coverage.

**Authorization gate:** This entire task mutates hosted Polar/Supabase/Vercel/production state. Execute it only after the user explicitly asks for those actions. The creation of the `Huddle` Sandbox organization already completed does not authorize any remaining step.

**External resources (no repository secrets):**

- Polar Sandbox organization: `Huddle`
- Polar Sandbox products: `Huddle Venue — Monthly`, `Huddle Venue — Annual`
- Webhook endpoint: `https://huddle.co.il/api/polar/webhooks`
- Vercel server variables: the five Polar names from Task 2 plus the explicit deny-only network guard; live Sandbox demo and Preview settings follow the reviewed runbook
- Supabase scheduled job: `huddle-venue-billing-deadlines`

- [x] **Step 1: Reverify the organization before mutation**

Confirm the dashboard is `sandbox.polar.sh`, organization is exactly `Huddle`, default currency is ILS, and the no-real-payments Sandbox banner is present. Stop if any screen is production.

- [x] **Step 2: Configure subscription and portal behavior**

Enable **Allow multiple subscriptions** so one Huddle owner can subscribe several venues. Keep trials, discounts, pauses, plan changes, seats, and customer email changes off wherever the dashboard exposes those controls. Do not create Polar Benefits; Huddle's local entitlement is authoritative.

- [x] **Step 3: Create and verify the two recurring products**

Create exactly:

- `Huddle Venue — Monthly`: ILS 15.00, monthly, no trial;
- `Huddle Venue — Annual`: ILS 150.00, yearly, no trial.

Both products were verified in the Sandbox catalogue on 4 September 2026. Their identifiers remain private; transfer to Production Vercel configuration belongs to Step 4. Do not create a second price/variant or real production copy.

- [x] **Step 4: Prepare least-privilege credentials and matching webhook secret**

Create one Sandbox organization access token with only the five runbook scopes. `customers:write` is present solely for account-erasure `deleteExternal(..., { anonymize: true })`; do not expose general customer mutation elsewhere. The current dashboard and [2026-04 create schema](https://polar.sh/docs/api-reference/2026-04/webhooks/create-webhook-endpoint.md) generate the signing secret, superseding the older general guide's custom-secret setup assumption. Privately prepare a high-entropy temporary bootstrap secret and keep the Production network guard true for the initial deployment. After the final route exists, create the endpoint, privately install its generated secret and redeploy before enabling checkout. Store credentials/bindings through the appropriate Vercel secret UI or direct CLI stdin with output suppressed; never paste values into chat, terminal output, docs, screenshots, or the repository. Only the authorized live host may call Sandbox; Preview/local/CI remain blocked with synthetic configuration. Existing-endpoint changes and secret rotation follow the separate approved maintenance procedure, not this first-setup sequence.

- [x] **Step 5: Apply the approved hosted rollout in runbook order**

After confirming a backup/recovery point and correct project/host:

1. add secrets before deploying code that requires them;
2. apply the reviewed, committed VB01 migration inventory listed in the runbook, including the deadline migration;
3. deploy the verified application build;
4. confirm the webhook route is reachable without redirect;
5. create or enable the endpoint in **Raw** format with all eight Task5 events, privately store its generated secret, redeploy with the guard still true, and verify unsigned rejection plus a signed unsupported-event `202` with no mutation. This is application-signature evidence, not a provider test. Then enable the Production guard's Sandbox transport, redeploy, and use the real checkout delivery as provider-origin evidence;
6. run the reviewed scheduler configuration and verification SQL; and
7. inspect Polar webhook delivery health and application safe logs.

Existing hosted venues intentionally leave public/acquisition surfaces at cutover and enter the single fixed seven-day `legacy_grace`; their existing management and participant paths remain private until activation or deadline expiry. Do not insert a fake active entitlement to preserve appearance or extend the cutover deadline.

- [x] **Step 6: Run the live Sandbox happy path**

With a presentation owner account:

1. create or select one hidden venue;
2. show the no-real-money Billing screen;
3. choose one plan;
4. complete Polar Sandbox checkout with the documented successful test card from the reviewed demo runbook, a future expiry, and any CVC;
5. verify that the return does not grant entitlement: the live return was already
   ready after signed activation, while deterministic local tests prove it remains
   confirming before a webhook; do not claim an unobserved transient live state;
6. verify the venue then appears in public venue view and Explore and can publish a distant fixture;
7. confirm the subscription appears in Polar **Sales → Subscriptions** and the product in **Products**; and
8. verify an owner with two venues can hold two independent subscriptions while a duplicate for one venue is blocked.

Do not rely on an arbitrary Sandbox customer receiving email; Polar documents Sandbox email delivery only to organization members.

- [x] **Step 7: Record truthful, sanitized acceptance evidence**

Update `docs/evidence/vb01/ACCEPTANCE.md` with date, environment, route/outcome, webhook event names/outcomes, scheduler status, and secret-safe presentation evidence. No provider screenshot is retained: the final evidence uses allowlisted outcomes and public demo UI instead of capturing a credential-bearing dashboard. Never include a token, secret, signature, customer email, checkout URL, or full provider identifier. Mark the hosted happy path complete only after its live checks pass; retain unrun broader acceptance checks as pending.

- [ ] **Step 8: Complete separately authorized publication and handoff**

The user separately confirmed commit/push/PR, merge after CI, and deployment on 4 September 2026. Use `$huddle-publish-pr` and the merge-only verification path, preserve both partners' commit attribution, and complete Production migration/configuration before the merge that automatically deploys `main`. Report verified local and hosted results and remaining gaps without claiming completion before the live acceptance checks pass.

## Completion criteria

This plan is complete only when:

- the repository contract explicitly approves VB01 and no source still claims payment is absent;
- new and existing commercial venues are private until a signed active Sandbox webhook;
- one owner/customer can subscribe several venues but one venue cannot acquire duplicates;
- public presence, Explore, all discovery variants, publishing, and acquisition are SQL-enforced;
- active subscriptions allow early publication of distant fixtures;
- scheduled cancellation applies the paid-end event cutoff immediately;
- payment failure hides immediately while preserving seven days of existing operations/drafts;
- provider staleness fails closed under neutral internal copy, and existing venues receive only one fixed cutover grace;
- requested/approved participants retain private access while a hidden event is still scheduled, including after a cancellation cutoff;
- grace/paid expiry cancels future published events without deleting history;
- fans see only ordinary availability/cancellation behavior;
- recovery never silently revives a cancelled event;
- no test calls Polar and all repository gates pass with current output;
- hosted resources, if authorized, are Sandbox-only and documented without secrets; and
- both partners can explain the checkout → webhook → Supabase entitlement → capability enforcement path during the presentation.
