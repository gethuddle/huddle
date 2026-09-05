# Polar Sandbox Venue Subscriptions Design

**Approved product direction:** 3 September 2026

**Status:** Approved product direction; Tasks 1–10 passed local acceptance as of 4 September 2026. This includes owner checkout/recovery, signed webhook activation/reconciliation, application-wide entitlement enforcement, participant-preserving grace access, billing-aware account erasure, broader owner billing controls, deadline processing, offline browser fixtures, and release documentation. The isolated aggregate gate passed the complete local database, application, build, browser, static, and security suite with Polar transport denied. The user separately authorized Task 11 hosted configuration, publication, merge after CI, and deployment. Sandbox preconfiguration is in progress; the [acceptance record](../../evidence/vb01/ACCEPTANCE.md) distinguishes completed setup from pending deployed runtime checks.

## Goal

Keep Huddle free for fans, supporter groups, and private hosts while requiring one recurring subscription for each commercial venue that wants a public business presence, Explore visibility, and the ability to publish venue watch events.

This is a university-project pilot. Every checkout uses Polar Sandbox, no real money is processed, and payment does not verify that the operator represents the business. The existing truthful self-attestation and visible **Unverified** venue label remain separate from billing.

## Product model and the Untappd comparison

Untappd separates free consumer accounts from paid Untappd for Business venue accounts. Its official help material says ordinary users can discover and interact socially, while a paid business relationship gives a venue management tools and additional published information. It also treats additional locations as additional subscriptions:

- [Untappd account types](https://help.untappd.com/hc/en-us/articles/360034389711-Untappd-Account-Types)
- [What is a Verified Venue?](https://help.untappd.com/hc/en-us/articles/360034387071-What-is-a-Verified-Venue)
- [Signing up additional venues](https://help.untappd.com/hc/en-us/articles/30082199020308-Signing-Up-Additional-Venues)

Huddle adopts the free-fan/paid-business and per-location boundaries, not Untappd's exact venue semantics:

| Area | Untappd pattern | Huddle pilot decision |
| --- | --- | --- |
| Consumer use | Free social/discovery account | Fan, friendship, group, RSVP, and private-hosting features stay free |
| Business billing unit | Venue/location subscription | One independent subscription per Huddle venue |
| Unpaid venue data | A place may still exist outside the paid business product | A Huddle venue may exist only as a private management draft; it has no public business presence |
| Paid capability | Business management and enhanced venue publishing | Public venue page, Explore visibility, and venue-event publishing |
| Verification | Paid locations are called Verified Venues | Payment never changes Huddle's `unverified` status |
| Business tooling | Menus, boards, badges, analytics, promotions, and more | Only the existing venue profile, schedule, event, and attendee tools are in scope |

No menu, offer, promotion, analytics, badge, paid ranking, ticket, or business-verification feature is approved by this design.

## Pilot commercial offer

There is one capability set with two billing intervals and no trial or tiering:

| Polar Sandbox product | Price | Interval |
| --- | ---: | --- |
| `Huddle Venue — Monthly` | ₪15 | Monthly |
| `Huddle Venue — Annual` | ₪150 | Yearly |

Polar requires a separate recurring product for each interval because a product's recurring interval cannot be changed. The prices are represented as ILS 1,500 and ILS 15,000 minor units. Discount codes and trials are disabled.

The ₪15/₪150 amounts are pilot choices, not validated production economics. A future move to real payment processing requires a new review of pricing, tax, merchant-of-record fees, refunds, consumer law, receipts, and operational support.

## Current external state

A Polar **Sandbox** organization named `Huddle` now exists at `sandbox.polar.sh/dashboard/huddle` with Israeli New Shekel as its default currency. Its dashboard explicitly states that changes do not affect the live account and payments are not processed.

The organization currently has no Huddle products, organization access token, webhook endpoint, or changed subscription settings. Those are later configuration steps and require a separate explicit authorization before they are created or changed.

## Non-negotiable boundaries

- Polar Sandbox is the only payment environment. The code hard-codes `environment: "sandbox"`; there is no production-payment switch in this milestone.
- A recurring subscription belongs to exactly one Huddle venue. One owner may hold separate subscriptions for several venues.
- Polar is the billing source of truth. Supabase stores a local, per-venue projection used for authorization and visibility.
- A checkout success redirect never grants access. Only a signed, validated, idempotently applied Polar billing webhook can activate or restore a venue.
- Venue membership and billing answer different questions. Membership answers who may operate a venue; entitlement answers what the venue may publish or expose publicly.
- Billing is owner-only. Active admins may run venue operations but cannot start checkout, open a pre-authenticated billing portal, cancel, or otherwise manage payment.
- Billing never upgrades `verification_status`; paying venues remain visibly **Unverified** in this trust-based pilot.
- Fan-facing DTOs and copy never expose payment status, grace periods, invoices, or provider names.
- Existing attendance, invitations, events, audit records, and venue history are retained. Billing transitions never hard-delete them.
- Account erasure is the explicit privacy exception for provider identity: Huddle locally terminalizes every owned venue, then deletes/anonymizes the Polar customer by the account's external ID before deleting Supabase Auth. No demo subscription may outlive its owner.
- Automated tests never call Polar. Live Sandbox is used only for the authorized pilot happy path; saved sanitized webhook fixtures cover failure and timing cases.

## Venue journey

The approved creation flow is:

`enter venue details → save hidden venue draft → choose monthly or yearly → Polar Sandbox checkout → signed active webhook → public venue`

1. A commonly eligible operator provides the existing venue information and truthful business-representation attestation.
2. Huddle atomically creates the Unverified venue, owner membership, workspace, and an inactive local billing entitlement.
3. The venue is available in the owner's workspace switcher but absent from public venue reads and every discovery surface.
4. Huddle redirects the owner to the venue's Billing page. The page labels the payment as a Polar Sandbox demo and states that no real money is charged.
5. The owner chooses Monthly or Annual. Huddle reserves one checkout attempt for that venue before calling Polar.
6. Huddle creates the checkout from trusted server state, using an allowlisted product ID. The organization is implied by the access token rather than accepted by the checkout request. Browser input never supplies a Polar product, customer, amount, owner, or metadata value.
7. Polar returns to a venue-bound confirmation page. The page may show checkout progress but remains private and non-authoritative.
8. A valid `subscription.active` webhook commits the entitlement in Supabase. Only then does the venue become public and gain publishing rights.

Existing venues receive a one-time `legacy_grace` state for seven days from the VB01 cutover. Public venue presence, discovery, and every new-acquisition path stop immediately, but owners/admins may continue every event operation that the existing event rules already allow, manage existing attendees and pending requests, edit private venue/space settings, and prepare drafts. Existing requested or approved participants retain private event access. If the venue has not activated by the fixed cutover deadline, its future published events are cancelled without deleting drafts, attendance, invitations, or history. A newly created venue starts in `payment_required` instead and has no legacy grace.

## Polar identity and resource mapping

- `external_customer_id` is the authenticated Huddle account UUID of the venue owner. Every entitlement-granting webhook requires that exact non-null value; only a terminal `subscription.revoked` for a locally retained erased-owner marker may omit it after Polar anonymization has cleared the external ID.
- One Polar customer may therefore own several subscriptions. Polar's **Allow multiple subscriptions** organization setting must be enabled.
- Checkout metadata is generated server-side and contains:
  - `huddle_venue_id`
  - `huddle_checkout_attempt_id`
  - `huddle_schema_version: "1"`
- Every entitlement-granting webhook must match the configured Sandbox organization, an allowlisted Monthly/Annual product, a recorded checkout attempt, the attempt's venue and owner, the non-null external customer ID, and the current subscription binding. The erased terminal exception above can only confirm cleanup and never grants entitlement.
- A second pending or active subscription for the same venue is rejected locally even though multiple subscriptions are allowed for the customer as a whole.
- The checkout response must match the configured organization and exactly one expected product price, amount, `ils` currency, and monthly/yearly interval before Huddle stores the checkout/price binding or redirects. Later subscription and paid-order events must match that binding; a product ID alone is insufficient.
- Huddle's venue-specific Billing page is the primary place for identifying a subscription. Polar does not document whether arbitrary subscription metadata is visible in its hosted portal, so identical subscriptions for several venues must be manually checked before any live Sandbox walkthrough.

## Billing lifecycle

The stored provider projection and current timestamps produce one of these user-facing workspace states:

| State | Public venue / Explore | New acquisition | Venue publishing | Workspace operations | Billing actions |
| --- | --- | --- | --- | --- | --- |
| `payment_required` | Hidden | Blocked | Blocked | Profile and unpublished draft preparation allowed | Owner may start checkout |
| `confirming` | Hidden | Blocked | Blocked | Same as `payment_required` | Owner sees progress/retry path |
| `active` | Visible | Allowed | Allowed for any future fixture | Allowed | Owner may open portal |
| `canceling` before paid end | Venue visible; only events before paid end remain public | Allowed only for events starting before paid end | Allowed only for events starting before paid end | Allowed | Owner may undo cancellation in portal if Polar permits |
| `past_due` before seven-day deadline | Hidden immediately | Blocked | Blocked | Existing event/attendee operations, private profile/space work, and unpublished drafts allowed | Owner is directed to payment recovery |
| `provider_stale` before seven-day deadline | Hidden immediately | Blocked | Blocked | Same as `past_due` | Owner sees neutral confirmation/recovery guidance |
| `legacy_grace` before cutover deadline | Hidden immediately | Blocked | Blocked | Same as `past_due` | Owner may start checkout |
| `expired` | Hidden | Blocked | Blocked | Read/history, archive, and billing recovery only | Portal while a bound subscription is nonterminal; new checkout when no current provider binding exists, including legacy-expired, or after a signed terminal state releases the prior binding |

### Active renewal

An active recurring subscription permits publishing a distant fixture even when the event occurs after the current paid-through date. Huddle assumes renewal while the subscription is active; it does not impose a rolling event-date horizon that would prevent early RSVPs for a World Cup final or another major match.

Entitlement is still evaluated continuously at the time of every public read and acquisition or publishing mutation. If a current active period passes without a new Polar snapshot, Huddle enters a distinct local `provider_stale` safety state anchored to the previous paid-through time. The venue and events hide and new acquisition/publishing stop, while existing operations and drafts remain available for seven days. Internal copy says Huddle is confirming the demo subscription; it does not claim that a payment failed. Only a fully bound signed `order.paid` renewal proof can restore this locally derived state; an `active` subscription snapshot alone cannot. If the state remains unresolved at the fixed deadline, future published events are cancelled as they are for an expired payment grace.

### Failed renewal and seven-day grace

Polar marks a failed renewal `past_due` and uses its own retry schedule. Polar's configurable benefit grace only controls Polar Benefits; it cannot express Huddle's mixed policy. Huddle therefore owns a separate seven-day application deadline.

At the first valid `past_due` transition:

- public venue presence, Explore, public match listings, saved-venue links, map points, Ask results, new RSVP/join requests, new direct invitations, and new publishing stop immediately;
- the deadline is fixed at signed `past_due_at` plus seven days (falling back only to the signed event timestamp when absent) and cannot be extended by delayed, duplicate, or repeated `past_due` deliveries;
- owner/admin warnings explain internally that the venue and events are hidden;
- the owner/admin may edit or cancel existing events, approve or decline already-pending requests, remove attendees, and create or edit unpublished drafts;
- an already-requested or approved fan can still open the event, but an unaccepted direct invitation cannot be accepted; and
- fans see no billing explanation. The event continues to appear normally to an existing participant while it is still scheduled.

At the seven-day deadline:

- the venue enters restricted recovery mode;
- future published venue events are changed to the ordinary cancelled state;
- unpublished drafts remain stored but locked until a later activation;
- attendance and invitation history remains stored;
- already-started and past events are not rewritten; and
- affected fans see only the existing neutral message: `This event has been cancelled.`

A later valid recovery webhook from the still-bound subscription restores the venue's entitlement and public visibility. It never silently republishes or uncancels event records already cancelled at grace expiry. Preserved drafts become editable again. Because Polar may continue retrying after Huddle's seven-day application grace, an expired venue with a nonterminal bound subscription can open the portal but cannot start another checkout. A new checkout becomes available only after a signed terminal provider state releases that binding.

### Voluntary cancellation

When the owner schedules cancellation in Polar's hosted portal:

- the subscription remains active until `current_period_end`;
- the venue page remains public until that time;
- already-published events starting before that time remain discoverable and accept RSVPs;
- events starting at or after that time immediately leave public discovery and stop accepting new RSVPs;
- already-requested or approved participants retain private detail, My Huddle, and authorized calendar access to those still-scheduled hidden events until the paid period actually ends;
- new publication for an event at or after that time is rejected; and
- at the paid-period end, future published events are cancelled and the venue becomes private.

If cancellation is undone before the period ends, the venue returns to ordinary active behavior and still-published rows can reappear. Event rows already cancelled by a completed deadline never revive automatically.

### Unexpected provider states

The products have no trials, pauses, seats, or plan changes. `trialing`, `paused`, `unpaid`, `incomplete_expired`, an unknown product, a mismatched organization/customer/venue, or an unsupported state must not grant entitlement. It is recorded as a sanitized ignored/configuration outcome for operator diagnosis.

Polar documentation describes terminal failed-payment status as both `canceled` and `unpaid` in different places. Huddle treats either as inactive and treats `subscription.revoked` as definitive.

## Fan experience

Fans care only whether an event is available or cancelled:

- A fan with no existing relationship receives the normal not-found/unavailable behavior for a hidden venue event.
- A fan who already requested or was approved may still open the scheduled event during payment-failure, provider-stale, or legacy-cutover grace.
- A requested or approved participant also retains private access to a still-scheduled event hidden by a future cancellation cutoff until the paid period ends.
- A hidden venue name on such an event renders as ordinary text rather than a broken public-venue link.
- At grace or paid-period expiry, the related future event is shown in the fan's history with `This event has been cancelled.`
- Explore cards, event DTOs, venue DTOs, Ask results, calendars, and public error messages never contain billing state.

## Application architecture

### Polar server boundary

Use the official TypeScript SDK with an exact version and the versioned `2026-04` API import. The implementation plan starts with a compile-time contract test because the documented SDK track is currently public preview. In the pinned alpha, API request and response fields are snake_case and webhook verification is the async `webhooks.validateEvent` namespace export from `@polar-sh/sdk/2026-04`; the unexported `@polar-sh/sdk/webhooks` path shown elsewhere in Polar's combined documentation must not be used.

The Polar client exists only in a `server-only` module and always uses Sandbox. The organization access token is least-privilege and limited to checkout read/write, customer-session creation, subscription read for rare reconciliation, and `customers:write` solely for idempotent account erasure. Products and prices are configured manually in the dashboard; runtime code cannot create or change them.

Huddle uses a custom Server Action for checkout rather than Polar's convenience GET checkout handler. The generic handler accepts customer/product/metadata query parameters, which is incompatible with Huddle's venue ownership and allowlist boundary.

### Checkout reservation

Before an external checkout is created, a database function obtains the venue transaction lock, verifies the exact owner, rejects an already-entitled venue, and reserves the only open attempt for that venue. A retry reuses the recorded Polar checkout when possible instead of creating another subscription.

The pinned `2026-04` checkout request uses snake_case fields and does not accept an organization field; the Sandbox token selects the organization. Before redirect, Huddle validates the response's organization, external customer, product, selected `product_price_id`, amount, currency, recurring interval/count exactly one, and checkout expiry against trusted local plan state and stores that bounded binding on the attempt. Subscription and paid-renewal events must match it exactly.

Only a definitive validated 4xx request rejection marks a reservation failed immediately. A timeout, network interruption, rate limit, 5xx, or process exit after reservation has an unknown creation outcome, so the reservation remains open and prevents a second checkout. Only the request that atomically created a fresh reservation may call `checkouts.create`; every retry of a pre-existing `reserved` or `uncertain` attempt first lists a bounded recent Sandbox checkout window by the exact external customer and allowlisted product, then accepts only a checkout whose server-authored attempt metadata and complete organization/product/price/amount/currency/interval binding match. A unique match is attached and reused. With zero matches, Huddle waits a server-owned 15-minute reconciliation window from the immutable reservation timestamp, performs one fresh exact lookup, and only then may close that same generation as `not_created_after_timeout`; this is a conservative Huddle policy, not a Polar consistency guarantee. Multiple matches require operator reconciliation.

An already-attached attempt is reconciled with `checkouts.get` outside every database lock. `open` reuses the provider URL; `confirmed` or `succeeded` remains attached and non-entitled until the signed subscription webhook arrives; and only provider-confirmed `expired` or `failed` permits a guarded local close and a fresh reservation. A not-found response, timeout, or transport error is not terminal proof and cannot release the attempt prematurely. The Billing action repeats this reconciliation on demand, so an abandoned checkout can recover without risking two subscriptions. Every provider read has a five-second request timeout, separate from the 15-minute reservation-reconciliation window. The confirmation page polls local entitlement every two seconds for at most 60 seconds, then shows a safe still-confirming state; that UI timeout never releases an attempt or grants access. Every attach, close, or release transaction rechecks the exact attempt generation, venue, owner, archive state, and subscription binding before committing. The Billing page never blindly creates a duplicate.

### Webhook endpoint

`POST /api/polar/webhooks`:

1. reads the raw body;
2. obtains `webhook-id`, `webhook-timestamp`, and `webhook-signature` from the request headers;
3. validates the signature with Polar's SDK and `POLAR_WEBHOOK_SECRET`;
4. parses only the subscribed event shapes through Zod;
5. verifies Sandbox organization, product, checkout attempt, owner customer, venue, and subscription binding;
6. applies the transition and records the sanitized webhook receipt in one database transaction; and
7. returns success only after commit, including for a known duplicate.

Invalid signatures return `403`. Invalid recognized payloads return `400`. A correctly signed event unknown to the pinned SDK is safely acknowledged `202` with a bounded diagnostic. Transient database or reconciliation failure returns a retryable non-2xx response. No response or log includes a webhook body, signature, access token, customer email, card data, or provider error body.

Subscribe to `subscription.created`, `subscription.active`, `subscription.canceled`, `subscription.uncanceled`, `subscription.cycled`, `subscription.past_due`, `subscription.revoked`, and `order.paid`. `subscription.created` and checkout redirects may show confirmation progress but never activate the venue; neither may clear or mask an existing venue's fixed legacy-cutover deadline. A fully bound `subscription.active` is authoritative for initial activation and for recovery from a previously signed `past_due` transition, because Polar emits it when a failed payment recovers. It does not prove a routine still-active renewal and cannot recover Huddle's locally derived `provider_stale` state. `subscription.cycled` fires before renewal collection and is therefore non-authoritative: it never advances local paid-through access. Only an `order.paid` whose `billing_reason` is `subscription_cycle` and whose full customer/product/subscription/price/metadata binding matches the already-current venue subscription may advance a routine renewal period or recover `provider_stale`; it may also recover `past_due` to the nested subscription's active or canceling state. Polar renewal orders may have no checkout ID, so Huddle resolves the original checkout attempt from the current subscription plus signed venue/attempt metadata and uses any non-null nested checkout ID only as an additional equality check.

Webhook receipts are unique by `webhook-id`. For subscription snapshots, the ordering key is provider `modified_at` when present and otherwise the signed event timestamp, because the pinned subscription model permits a null modification time. Paid-order timestamps are tracked separately and are never compared as versions of the subscription object; a renewal may only advance to a strictly later paid-through period and each order ID is applied once. A late event for superseded subscription A cannot overwrite current subscription B. If two conflicting subscription states have the same provider timestamp, Huddle commits a bounded `reconciliation_required` outcome, releases every database lock, fetches the canonical subscription snapshot with a short timeout, and then enters a second guarded transaction. The same two-phase path may complete a signed `order.paid` whose top-level binding is complete but nested subscription details are incomplete; the first transaction persists the paid-order proof and grants nothing. No provider network call occurs while a database transaction or venue lock is open. A subscription snapshot alone never proves that a cycled renewal was paid.

### Customer portal

The owner opens billing management through a Server Action that rechecks exact venue ownership and creates a fresh, short-lived Polar Customer Session. Huddle never stores or exposes the returned portal token/URL. Admins see status but no portal action.

The portal is used for payment-method updates and cancellation. Plan changes, pause/resume, seats, and customer email changes remain disabled for the pilot wherever Polar settings allow. Polar may email organization-member addresses in Sandbox; the demo must not depend on email delivery to arbitrary test users.

## Database design

Do not reuse `public.subscriptions`, which already stores Fan follows for sports, competitions, and teams.

### `private.venue_billing_entitlements`

One current projection per venue:

- `venue_id` primary key;
- stored lifecycle state (`inactive`, `confirming`, `active`, `past_due`, `canceling`, `provider_stale`, `legacy_grace`, or terminal `expired`) and billing interval;
- current Polar customer, subscription, product, and selected price IDs plus the validated amount/currency and recurring interval/count;
- `paid_through_at`;
- fixed `grace_started_at` and `grace_expires_at` for `past_due`, `provider_stale`, or `legacy_grace`;
- subscription-snapshot modification time, last paid-order ID/time, and last webhook ID;
- first activation and ordinary created/updated timestamps.

Checks require coherent identifiers and deadlines for every state. `inactive` is reserved for a never-activated post-VB01 venue; every completed grace/cancellation/terminal-provider path persists `expired`, including a legacy venue with no provider identifiers, so it cannot accidentally regain draft/settings rights. Customer ID is indexed but not unique because one customer may subscribe to several venues. Current subscription ID is unique when present. Deadline indexes support bounded sweeps.

### `private.venue_billing_checkout_attempts`

Records a server-authorized owner, venue, plan, product, attempt state, Polar checkout ID, expiry, and timestamps. A partial unique index permits only one open attempt per venue.

### `private.polar_webhook_events`

Records only webhook ID, event type, venue/subscription IDs, provider modification time, received/processed time, and a bounded processing outcome. It never stores raw bodies, signatures, customer emails, payment details, or secrets.

All tables remain outside exposed Data API schemas, have direct privileges revoked, and use forced deny-by-default RLS as defense in depth. Browser/service code reaches them only through narrow `SECURITY DEFINER` functions with empty search paths and exact grants.

An `AFTER INSERT` trigger gives every post-VB01 venue its inactive row in the same transaction. The upgrade uses a postgres-only, idempotent backfill primitive with one captured cutover timestamp to insert only missing pre-VB01 venues as `legacy_grace`; rerunning it cannot duplicate a row or extend a deadline.

## Database capability functions

Central SQL predicates—not React conditionals—must answer:

- whether an actor has active membership in a venue;
- whether the actor is the exact billing owner (`venues.owner_id = auth.uid()` rather than the current admin-compatible ownership wrapper);
- whether the venue may appear publicly now;
- whether a specific event may be publicly acquired now;
- whether a venue may publish an event with a particular start time;
- whether drafts and existing operations remain editable; and
- whether a current participant may still read an otherwise-hidden event.

The workspace switcher, billing recovery, history, and internal status reads use membership-only authorization. Existing generic membership checks must not be globally changed into payment checks, because doing so would lock owners out of recovery and violate grace-period management.

Every authenticated mutation first obtains the existing actor transaction token, then the affected venue billing advisory lock, then entitlement/venue/event rows. A multi-venue account erasure takes all owned venue locks in sorted UUID order. Provider callbacks have no actor and begin at the venue lock. This single global order avoids actor-versus-venue deadlocks while serializing checkout reservation/attachment, provider transitions, publication/acquisition, follows, venue settings, archive, and deadline expiry. Provider calls remain outside transactions, so the later guarded transaction must recheck the venue is not archived and that the same attempt/subscription generation is still current.

## Public and mutation enforcement

Billing predicates are applied to every commercial entry point, including:

- normal, open-door, owner-aware, map, match, venue, and assisted discovery;
- public venue and venue-event lists;
- saved venues and venue follows;
- event detail and calendar export;
- direct venue publishing and batch fixture planning;
- join/request, direct invitation, and direct-invitation acceptance; and
- cached projections that could otherwise retain a hidden event.

Owner-only discovery is not an exception: `discover_owned_venue_events` must not put the owner's hidden venue back into Explore. The workspace remains the private management surface.

Public reads evaluate current timestamps directly, so a delayed sweep cannot leak expired access. At or after a grace/paid deadline, a prior requested or approved participant's private summary/detail projects the affected future event as cancelled with the neutral message even if the persistence sweep is delayed; it must not disappear temporarily or look scheduled. Billing-sensitive public projections remain dynamic and uncached so correctness does not depend on application invalidation that a database scheduler cannot trigger. Venue-hosted ICS responses are always `private, no-store`, even while active, because an already-cached calendar cannot be allowed to outlive an immediate entitlement change. A participant-specific hidden event response is also private/no-store.

## Deadline enforcement

Derived checks are paired with an idempotent database sweep:

- `past_due`, `provider_stale`, or `legacy_grace` at or beyond `grace_expires_at` becomes stored `expired`/restricted;
- `canceling` at or beyond `paid_through_at` becomes stored `expired`/restricted;
- an `active` row whose paid-through time elapsed without a new provider snapshot becomes `provider_stale`, anchored to that time, rather than remaining public forever or asserting a payment failure; and
- only not-yet-started, published venue events are cancelled. Drafts, attendance, audit history, and past/started events remain.

The sweep captures one timestamp, obtains the same venue lock as mutations/webhooks, processes a bounded batch, and writes minimal audit counts. A recovery that acquires the venue lock before expiry prevents cancellation. If expiry commits first, a later valid recovery restores entitlement but never uncancels rows, even when the provider's effective timestamp was earlier.

Supabase `pg_cron` runs the private sweep every minute in the hosted pilot through reviewed `supabase/production/configure-venue-billing-sweep.sql` and a matching verification script. The schedule is operational configuration, not a substitute for timestamp-aware authorization.

## Venue closure

An archived venue remains non-public regardless of entitlement. Huddle permits the exact owner to archive under the existing closure rules even while the Sandbox subscription is active, but the internal confirmation warns that archiving does not cancel the demo subscription and links the owner to Billing. Archive acquires the common venue billing lock before venue/event rows and closes any still-open local checkout attempt; checkout attachment and webhook application recheck archive state and can never activate an archived venue. A narrow exact-owner archived-billing route may open the portal for an already-bound subscription; an archived venue can never start or restart checkout. Huddle does not silently mutate Polar during archive and does not request broad `subscriptions:write` authority for this pilot.

## Account erasure

Account deletion is different from ordinary venue closure. After password reauthentication, the existing local preparation transaction takes the actor token, then every owned venue lock in sorted order, before any entitlement/venue/event row. It archives the venues, cancels their future events, closes open checkout generations, terminalizes entitlements, and records only a private bounded cleanup state. The action calls the pinned SDK's external-ID deletion with the authenticated Huddle UUID and `anonymize: true`. Polar documents that this immediately cancels the customer's active subscriptions, revokes benefits, clears the external ID, and anonymizes personal data; `404` is idempotent success. Supabase Auth deletion occurs only after provider cleanup and the guarded local completion both succeed. A transient Polar failure leaves the already-local erasure retryable and never deletes Auth first.

An external checkout may have been accepted just before local erasure even though attachment is later rejected. Any later signed subscription/order event whose exact attempt metadata belongs to the erased actor is recorded as cleanup-required, grants no entitlement, and resolves the cleanup actor from that guarded local marker before triggering the same external-ID delete outside database locks. The route never depends on the webhook external ID for this cleanup. Because Polar clears that field during anonymization, a signed `subscription.revoked` may carry a null external ID only when its organization, product, venue/attempt metadata, and retained erasure marker match; completed cleanup is then acknowledged without another provider call. This makes a late-created Sandbox customer self-cleaning without permitting an archived venue to reappear or weakening normal customer binding. Ordinary venue archive still never mutates Polar; this provider deletion exists only for account erasure.

## Security and privacy

- `POLAR_ACCESS_TOKEN` and `POLAR_WEBHOOK_SECRET` stay server-only and never enter Client Components, Supabase tables, logs, redirects, or public environment variables.
- Checkout product and amount selection is server allowlisted.
- Owner UUID/email come from the verified server session, never submitted browser fields.
- Webhook signature verification precedes parsing or database writes.
- Organization, product, customer, attempt, venue, and current-subscription binding are all checked.
- Replay and duplicate delivery are harmless; stale subscription events cannot regress state.
- No card information passes through Huddle.
- No raw provider payload is retained.
- All business data remains subject to the existing suspension, membership, venue archive, event audience, block, and moderation rules.

## Demonstration and testing

The live Sandbox happy path uses the Huddle Sandbox organization and Polar's documented successful test card `4242 4242 4242 4242`, any future expiry, and any CVC. The screen states that no real payment occurs.

Saved sanitized payload fixtures and a known test webhook secret cover:

- created/confirming versus active authority;
- valid and invalid signatures;
- duplicate and stale delivery;
- wrong organization, product, customer, owner, venue, and checkout attempt;
- independent subscriptions for two venues under one customer;
- failed renewal, fixed seven-day deadline, and recovery before/after expiry;
- non-authoritative cycle events versus bound `order.paid` renewal proof;
- provider-stale fail-closed handling without false payment-failure copy;
- one-time existing-venue cutover grace and expiry;
- voluntary cancel, undo, period end, and distant-event filtering;
- requested/approved participant visibility during grace and post-cutoff cancellation, with neutral cancellation afterward;
- blocked acceptance of a previously issued but unaccepted direct invitation while acquisition is disabled;
- no event resurrection;
- checkout double-click/concurrency;
- process exit after checkout reservation and attached checkout expiry/failure recovery;
- archive versus checkout/publish ordering;
- account erasure versus follow/checkout across several owned venues, including retryable external-customer deletion, a late checkout webhook, and the null-external-ID `subscription.revoked` emitted after completed anonymization;
- publish/join versus failure races; and
- sweep versus recovery ordering.

There is no documented Sandbox test clock. Time-dependent tests inject or pass a controlled database timestamp rather than waiting or calling Polar.

## Historical pre-Task 1 documentation contradiction

Before Task 1, the repository contract said the course MVP had no billing, created an immediately usable venue, deferred Stripe/subscriptions/webhooks, and prohibited payment infrastructure. `README.md` repeated that implementation status. The approved direction deliberately supersedes those historical statements; Tasks 1–10 now have local acceptance evidence, while the deployed application remains pre-`VB01` until later hosted evidence exists.

Task 1 reconciled this contract in `AGENTS.md`, `docs/HUDDLE-IMPLEMENTATION-SPEC.md`, `docs/HUDDLE-ARCHITECTURE.md`, `docs/HUDDLE-STEP-BY-STEP-BUILD-SPEC.md`, `docs/superpowers/specs/2026-09-03-account-erasure-design.md`, and `README.md`, adding one bounded post-B12 `VB01` module before B13 without renumbering B13. Independent documentation review passed with no findings. Application code, dependency installation, and hosted billing configuration remain outside Task 1 and require their own authorization.

## Local implementation acceptance through Task 10

Tasks 1–10 passed local acceptance for Sandbox configuration, private billing foundations, owner checkout/Billing handoff, signed webhook normalization and transactional entitlement changes, renewal reconciliation, application-wide enforcement, account erasure, owner controls, deadline processing/cancelled-calendar behavior, offline signed browser fixtures, and release documentation. In the isolated disposable project, the aggregate gate passed a clean install, six forward billing migrations, schema lint, 48 pgTAP files / 2,423 assertions, canonical type parity, 223 application files / 1,308 tests plus one intentional skip (80.42% statements, 71.87% branches, 83.53% functions, 84.62% lines), production build, 37 browser tests, security audit, and diff hygiene. Polar transport was denied throughout automation.

No current live behavior or hosted configuration changed; this intermediate branch is not independently deployable. Hosted Task 11/demo acceptance remains pending separate authorization. Automated verification used only the disposable local database and blocked Polar network access. Intended-public fixtures are per-run; the ordinary demo seed and hosted database remain unchanged.

## Polar references

The implementation plan was derived from Polar's supplied [complete documentation](https://polar.sh/docs/llms-full.txt), especially:

- [Sandbox](https://polar.sh/docs/integrate/sandbox)
- [Products](https://polar.sh/docs/features/products)
- [Checkout sessions](https://polar.sh/docs/features/checkout/session)
- [Subscriptions](https://polar.sh/docs/features/subscriptions/introduction)
- [Failed payments](https://polar.sh/docs/features/subscriptions/failed-payments)
- [Customer Portal](https://polar.sh/docs/features/customer-portal/introduction)
- [Navigate customers to the portal](https://polar.sh/docs/features/customer-portal/navigate-customers)
- [Customer management and deletion by external ID](https://polar.sh/docs/features/customer-management)
- [TypeScript SDK](https://polar.sh/docs/integrate/sdk/typescript)
- [Webhook delivery](https://polar.sh/docs/integrate/webhooks/delivery)
- [Webhook events](https://polar.sh/docs/integrate/webhooks/events)
