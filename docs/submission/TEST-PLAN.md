# Huddle test plan

## Test strategy

Huddle tests the same rule at the narrowest useful layers: Vitest for pure domain,
validation, route, action, and component behavior; pgTAP for constraints, grants,
RLS, security-definer functions, and transaction races; Playwright for the user
journey across the built Next.js app and a reset local Supabase stack. CI never
uses production state or a live sports provider.

The complete local gate is:

```bash
npm run test:acceptance
```

It performs the pinned clean install, formatting, lint, typecheck, coverage,
database reset/schema lint, pgTAP, generated-type drift, production build, all Playwright
journeys, secret audit, and diff hygiene. Coverage is diagnostic evidence, not a
replacement for behavior tests.

The 2026-08-29 B12 run passed 90 Vitest files / 403 tests (78.7% statements,
66.97% branches, 83.49% functions, 82.4% lines), 18 pgTAP files / 975 assertions,
and all 17 Playwright journeys. The PR/main CI run and second-computer reproduction
remain separate evidence.

The 2026-09-04 isolated disposable acceptance run passed the complete local gate:
223 Vitest files / 1,308 tests plus one intentional skip; 80.42% statements, 71.87%
branches, 83.53% functions, and 84.62% lines; all six VB01 migrations; 48 pgTAP files
/ 2,423 assertions; canonical generated-type parity; production build; and 37 executed
Playwright tests. `npm run test:acceptance` finished with all repository gates passed.
Polar transport was denied throughout automation. This is local acceptance evidence,
not hosted configuration, a live Sandbox walkthrough, PR/main CI, or B13 evidence.
Historical B12 numbers above remain dated accepted evidence, not current inventory.
Hosted migration and production acceptance remain separately evidenced operations.

The separately authorized 4 September 2026 VB01 rollout is recorded in
[`ACCEPTANCE.md`](../evidence/vb01/ACCEPTANCE.md): PR #56 exact-head CI passed,
Production/Preview reached 44-migration parity, two genuine Sandbox subscriptions
activated independent demo venues, and one distant fixture appeared publicly and
in Explore. Owner portal, duplicate activation redelivery, and the scheduler were
also verified. This manual hosted result does not imply that every lifecycle or
B13 scenario ran against hosted services; automated tests still never call Polar.

## Thirty-seven deterministic Playwright scenarios

Numbered journeys 01–17 and 19 are in `tests/e2e/auth.spec.ts`; journey 18 is in
`tests/e2e/assisted-discovery.spec.ts`. Provider input is a saved, normalized fixture inserted
through the real sync transaction; identifiers are random values used only to prevent test
collisions. Product assertions do not depend on execution order, wall-clock equality, a provider
network, or hosted data.

| # | Acceptance journey | Principal enforcement |
|---:|---|---|
| 01 | Sign up, verify email, complete mandatory profile, follow a team | Supabase Auth, profile RPC, subscription RPC |
| 02 | Use browser location for the current session without exposing coordinates in the URL | discovery POST route/query and no-store response |
| 03 | Friend sees friends-only event; stranger receives no event or address | audience function and safe event projection |
| 04 | Crafted private-public and venue-private host/audience requests fail | event transaction constraints and authorization |
| 05 | A described owner-backed group becomes searchable without activity quotas; application and event review stay enforced | group lifecycle/readiness and review functions |
| 06 | Group ban ends membership and blocks reapplication | group-ban transaction and `GROUP_BANNED` denial |
| 07 | Member proposal requires a different group administrator's approval | group event review transaction |
| 08 | Home address is absent before approval and present only after approval | protected location table and audited reader |
| 09 | Home cap is 12, no plus-one exists, and duplicate attendance cannot create another seat | checks, unique attendance row, UI contract |
| 10 | Team follow permits attendance; non-follower is denied; direct invitation overrides only that follow gate | audience eligibility and invitation functions |
| 11 | Two simultaneous joins reserve only one remaining seat | event row lock and derived approved count |
| 12 | Host removal retains history and immediately revokes event/address/calendar access | attendance transition and location recalculation |
| 13 | Blocking a future participant ends friendship, attendance, and address access without blocker disclosure | canonical pair lock and block transaction |
| 14 | Crafted cross-user event, group, and venue edits fail | ownership/role checks in database functions |
| 15 | RFC 5545 calendar includes location only while currently authorized | calendar route and audited location function |
| 16 | Confidential report, proportional action, independent appeal, and responsive/accessible moderation | moderation functions and Radix confirmation UI |
| 17 | Provider failure preserves last-good fixtures and exposes stale state | sync transaction and freshness projection |
| 18 | The three approved assisted-discovery examples return authorized seeded huddles without live AI | fake interpreter, real authorized search RPC, safe result projection |
| 19 | Account Security rejects wrong password/non-exact confirmation, erases the account, clears Huddle tab state, retains pseudonymous history, and denies stale reads/mutations | same-user reauthentication, erasure transaction, marker-backed cleanup, RLS and Auth invalidation |

Fifteen tests in the acceptance project cover numbered journeys 01–17, including intentionally
combined lifecycle checks; one covers journey 19; and seven supporting Auth/product journeys cover
password recovery, duplicate signup, known-password security, blocking, correction persistence,
and both Venue/private event paths. Five focused Calm CRUD journeys add exact-fixture return
context; friendship cancellation, decline, acceptance, and removal; secure event-link
redemption/revocation; group submission withdrawal/rejection; and Venue closure. One complete
Fan/Venue journey runs independently at 1280, 768, and 375 px. A final anonymous 1364×1440
regression verifies full-width shell geometry, centring, overflow, and shadow treatment. One
fake-interpreter journey covers numbered journey 18 at phone width with authorized crests, group
context, capacity, facility detail, the five-item Fan navigation, a viewport-bounded transcript,
and a visible docked composer. Two additional assisted-discovery journeys prove distinct result
tickets plus named-place/date accuracy and ephemeral state. The local seam calls neither live AI
nor a live geocoder. The isolated acceptance run passed all 37 Playwright tests in six
files. The VB01 additions use
saved, locally signed fixtures and force Polar network denial. They cover owner-only
Billing/portal boundaries, active/past-due/recovery lifecycle, independent venue
entitlement behavior, existing participant preservation, no resurrection after
deadline cancellation, and desktop/phone copy/overflow checks. They made no Polar
network request.
Production smoke tests are deliberately separate under
`tests/production/`: `npm run test:production:session` creates only ordinary Auth
sessions (which may update Auth sign-in metadata), while `npm run test:production`
includes a one-time product request/approval/calendar mutation against dedicated
accounts and a fresh event.

## Database coverage

The current source adds VB01 entitlement, visibility, deadline, concurrency, and
integrated-regression pgTAP files to the earlier database matrix. The isolated local
acceptance run passed 48 files / 2,423 assertions. The earlier 43 pgTAP files under `supabase/tests/database/` cover all exposed-table RLS
inventory, CHECK/unique/FK invariants, minimum grants, safe reads, denied reads and
mutations, lifecycle transitions, cooldowns, exact-address authorization, capacity,
moderation, workspace membership, protected drafts, current-state projections,
public-address caching and autocomplete, global group discovery, direct group invitations and member removal, team crest normalization, fixture coverage, open-door venue events, the public map
projection, managed-Venue discovery continuity, fixture/event consistency, attend-then-leave
rediscovery across Explore and assisted search, assisted-event authorization and safe crest/group projection, secure event
invite links, audited group archive, audited Venue closure, and account-erasure cleanup, retained
pseudonymous history, stale-JWT denial, idempotency, the narrow location exception, and canonical
actor concurrency. Dedicated two-connection regressions cover friendship/block, application/block,
group invite, event creation, group review/block, attendance, onboarding/workspace activation,
protected drafts, suspension/mutation races, and account erasure.

## Manual and hosted acceptance

The final pass adds keyboard-only and VoiceOver checks, phone/desktop review,
Israel-time DST display, public attribution, password recovery, unauthorized HTML/network/cache/log
inspection, and the production smoke described in
[`PRODUCTION-ACCEPTANCE.md`](../operations/PRODUCTION-ACCEPTANCE.md). Hosted checks
are evidence, not CI dependencies.
