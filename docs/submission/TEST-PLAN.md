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

The current UX-redesign inventory contains 147 Vitest files / 724 tests,
29 ordered migrations, 35 pgTAP files / 1585 assertions, and 22 Playwright scenarios.
The current Vitest and full pgTAP runs pass this inventory; the complete acceptance command
records the final combined gate. The B12 numbers above are
retained as historical accepted evidence rather than presented as the current repository
inventory. Hosted migration and production acceptance remain separately evidenced operations.

## Twenty-two deterministic Playwright scenarios

All numbered journeys are in `tests/e2e/auth.spec.ts`. Provider input is a saved,
normalized fixture inserted through the real sync transaction; identifiers are
random values used only to prevent test collisions. Product assertions do not
depend on execution order, wall-clock equality, a provider network, or hosted data.

| # | Acceptance journey | Principal enforcement |
|---:|---|---|
| 01 | Sign up, verify email, complete mandatory profile, follow a team | Supabase Auth, profile RPC, subscription RPC |
| 02 | Use browser location once without persisting coordinates | discovery route/query and no-store response |
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

The 17 numbered contract journeys plus two supporting unnumbered journeys run once
in the acceptance project. One complete Fan/Venue journey runs independently at
1280, 768, and 375 px, producing 22 Playwright scenarios in total. The supporting
journeys exercise reversible blocking and both venue/private event creation paths.
Production smoke tests are deliberately separate under
`tests/production/`: `npm run test:production:session` creates only ordinary Auth
sessions (which may update Auth sign-in metadata), while `npm run test:production`
includes a one-time product request/approval/calendar mutation against dedicated
accounts and a fresh event.

## Database coverage

The 35 pgTAP files under `supabase/tests/database/` cover all exposed-table RLS
inventory, CHECK/unique/FK invariants, minimum grants, safe reads, denied reads and
mutations, lifecycle transitions, cooldowns, exact-address authorization, capacity,
moderation, workspace membership, protected drafts, current-state projections,
public-address caching, fixture coverage, open-door venue events, the public map
projection, managed-Venue discovery continuity, fixture/event consistency, and audited group
archive. Dedicated two-connection regressions cover friendship/block,
application/block, group invite, event creation, group review/block, attendance,
onboarding/workspace activation, protected drafts, and suspension/mutation races.

## Manual and hosted acceptance

The final pass adds keyboard-only and VoiceOver checks, phone/desktop review,
Israel-time DST display, public attribution, unauthorized HTML/network/cache/log
inspection, and the production smoke described in
[`PRODUCTION-ACCEPTANCE.md`](../operations/PRODUCTION-ACCEPTANCE.md). Hosted checks
are evidence, not CI dependencies.
