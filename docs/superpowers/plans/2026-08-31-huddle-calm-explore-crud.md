# Huddle Calm Explore and CRUD Completion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Subagent dispatch is intentionally disabled for this run. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver a light, calm Huddle interface with one unified Explore experience, coherent Friends/Groups/Invite-only acquisition, repository-owned team marks, working venue closure, and verified end-to-end outcomes for every exposed action.

**Architecture:** Keep the modular Next.js/Supabase monolith. Shared semantic UI primitives establish the light hierarchy; Explore composes the existing local fixture and event catalogs; secure invite links and venue closure are transactional database boundaries implemented by one tracked migration. Existing private-location, attendance, block, and RLS invariants remain unchanged.

**Tech Stack:** Next.js 16 App Router, React 19, strict TypeScript, Tailwind CSS 4, Radix/shadcn primitives, Supabase PostgreSQL/RLS/PostGIS, Zod, TanStack Query, Vitest/RTL, pgTAP, Playwright.

**Spec:** `docs/superpowers/specs/2026-08-31-huddle-calm-explore-crud-design.md`

## Global Constraints

- Court Green is used for one primary action or positive state per task area; current navigation is Forest text plus a quiet indicator.
- Product surfaces are light-first with AA text contrast, visible keyboard focus, and at least 44px product touch targets.
- Provider crest assets remain forbidden; `TeamMark` is repository-owned initials/TLA artwork.
- A private person's event audience remains exactly `group`, `friends`, or `invite_only`; a venue remains `public` or `team_followers`.
- Invite-only ordinary event URLs never grant access. Only a targeted invitation or controlled token redemption can create visibility eligibility.
- Event-link tokens are high entropy, stored only as SHA-256 digests, expiring, revocable, usage-limited, block-aware, and capacity-safe.
- Venue “Close” is audited archive, not hard delete; future events close while security and attendance history remain.
- Protected home coordinates never enter Explore or logs.
- Write a failing behavioral test and observe the intended failure before every production behavior change.
- Run focused tests during implementation and the full `npm run test:acceptance` gate once after the integrated wave.
- Do not commit until the repository's genuine reciprocal-participation rule is satisfied. Do not push, create the PR, deploy, or mutate hosted Supabase before the final publication gate.

---

### Task 1: Action inventory and regression contract

**Files:**
- Create: `docs/evidence/calm-explore/ACTION-MATRIX.md`
- Modify: `docs/HUDDLE-IMPLEMENTATION-SPEC.md`
- Modify: `docs/HUDDLE-ARCHITECTURE.md`
- Modify: `docs/HUDDLE-BRAND.md`

**Interfaces:**
- Consumes: exported Server Actions, app routes, controlled RPCs, and the approved design spec.
- Produces: one row per user-visible control with stable action IDs such as `EVT-INVITE-PERSON`, `VEN-CLOSE`, and `FRIEND-ACCEPT` used by tests and the final audit.

- [x] **Step 1: Inventory actions without changing runtime behavior**

Run:

```bash
find app -name 'page.tsx' -o -name 'route.ts' | sort
rg -n '^export async function .*Action' features app -g '*.ts' -g '*.tsx'
rg -n 'create or replace function public\.' supabase/migrations/*.sql
```

Record actor, entry route, label, outcome, success destination, invalid/unauthorized behavior, reversal, and automated evidence for every exposed action.

- [x] **Step 2: Reconcile the approved contract changes**

Document these exact approved target outcomes in the normative specification, architecture, and brand guide without claiming that the runtime is already complete:

```text
Fixtures are searched inside Explore; /matches is no longer a primary index.
Groups may have a nullable team association and product copy says Groups.
Invite-only access may begin through a targeted invitation or secure token redemption.
Closing a venue is an owner-only audited archive.
The interface is light-first while preserving the Huddle palette and identity.
```

- [x] **Step 3: Verify source consistency**

Run:

```bash
rg -n 'dark-first|Explore fixtures|Supporter groups|provider crest|invite.only|Close venue|hard delete' README.md docs AGENTS.md
```

Expected: historical evidence is explicitly labeled; current normative sources agree with the new contract; provider crests remain forbidden.

- [x] **Step 4: Keep a local checkpoint only**

Run `git diff --check`. Do not commit yet.

### Task 2: Light semantic foundation and team marks

**Files:**
- Modify: `app/globals.css`
- Modify: `components/ui/button.tsx`
- Modify: `components/ui/card.tsx`
- Modify: `components/ui/badge.tsx`
- Modify: `components/ui/alert.tsx`
- Modify: `components/layout/site-header.tsx`
- Modify: `features/workspaces/components/fan-bottom-navigation.tsx`
- Modify: `features/sports/components/team-initials.tsx`
- Modify: `features/sports/components/match-card.tsx`
- Test: `components/layout/app-shell.test.tsx`
- Test: `components/layout/mobile-navigation.test.tsx`
- Create: `features/sports/components/team-initials.test.tsx`

**Interfaces:**
- Produces: `TeamMark({ name, tla, size?, className? })`, light semantic tokens, quiet selected navigation, neutral default badges.
- Consumers: Explore, fixture detail, event detail, interests, planners, and selection results.

- [x] **Step 1: Write and run failing semantic tests**

Add assertions that current navigation uses `aria-current` without a filled primary class, and that the team mark derives `ARS` from Arsenal and exposes the full team name to assistive technology.

```tsx
render(<TeamMark name="Arsenal FC" tla="ARS" />);
expect(screen.getByLabelText("Arsenal FC")).toHaveTextContent("ARS");
```

Run:

```bash
npm test -- components/layout/app-shell.test.tsx components/layout/mobile-navigation.test.tsx features/sports/components/team-initials.test.tsx
```

Expected: FAIL because `TeamMark` and quiet active styles do not exist.

- [x] **Step 2: Implement semantic light tokens and primitives**

Set `color-scheme: light`, canvas/surface/ink/border roles from the spec, and change primitive defaults:

```ts
default: "bg-primary text-primary-foreground hover:bg-primary/88"
outline: "border-input bg-card text-foreground hover:bg-muted"
ghost: "text-muted-foreground hover:bg-muted hover:text-foreground"
```

Cards use white surface, one hairline border, and no mandatory footer fill. Badge default becomes neutral; positive green is explicit.

- [x] **Step 3: Replace dark-role utility leakage mechanically**

Across `app/`, `components/`, and `features/`, replace visual-role utilities with semantic roles (`text-linen` → `text-foreground`, `text-muted-dark` → `text-muted-foreground`, `bg-surface-raised` → `bg-card`, `bg-surface-deep` → `bg-muted`, `border-border-dark` → `border-border`, `border-border-strong` → `border-input`, `bg-ink` → `bg-background`, text-only `text-court` → `text-forest`). Review every remaining raw role usage manually.

- [x] **Step 4: Implement and adopt TeamMark on sports primitives**

Rename the component while preserving a compatibility export:

```tsx
export function TeamMark({ name, tla, size = "md", className }: TeamMarkProps) {
  return <span aria-label={name} className={cn(teamMarkVariants({ size }), className)}>{teamInitials(name, tla)}</span>;
}
export const TeamInitials = TeamMark;
```

- [x] **Step 5: Run the focused gate**

```bash
npm test -- components/layout/app-shell.test.tsx components/layout/mobile-navigation.test.tsx features/sports/components/team-initials.test.tsx features/sports/components/fixture-browser.test.tsx
npm run typecheck
```

Expected: PASS with no warnings.

### Task 3: Unified Explore and recoverable filters

**Files:**
- Modify: `features/workspaces/components/fan-bottom-navigation.tsx`
- Modify: `app/page.tsx`
- Modify: `app/discover/page.tsx`
- Modify: `app/groups/page.tsx`
- Modify: `app/matches/page.tsx`
- Modify: `app/matches/[matchId]/page.tsx`
- Modify: `features/discovery/schemas.ts`
- Modify: `features/discovery/components/discovery-filters.tsx`
- Modify: `features/discovery/components/discovery-feed.tsx`
- Modify: `features/discovery/components/discovery-event-card.tsx`
- Create: `features/discovery/components/discovery-filter-error.tsx`
- Create: `components/navigation/context-back-link.tsx`
- Test: `app/discover/page.test.tsx`
- Test: `app/matches/page.test.tsx`
- Test: `app/matches/[matchId]/page.test.tsx`
- Test: `app/groups/page.test.tsx`
- Test: `features/discovery/components/discovery-feed.test.tsx`

**Interfaces:**
- Produces: `parseDiscoveryFiltersResult(raw): { ok: true; filters } | { ok: false; values; fieldErrors }`, safe `returnTo` handling, `/matches` redirect, Explore route-family matching.

- [x] **Step 1: Write failing route and validation tests**

Cover:

```ts
expect(fanDestinationIsCurrent("/groups", "/discover")).toBe(true);
expect(fanDestinationIsCurrent("/matches/fixture-id", "/discover")).toBe(true);
expect(parseDiscoveryFiltersResult({ from: "2026-09-14", to: "2026-08-31" })).toMatchObject({ ok: false });
```

Assert `/matches` calls `redirect("/discover")`, Home contains “Find somewhere to watch” and no “Explore fixtures,” and invalid dates render a field-specific recovery component rather than throwing.

- [x] **Step 2: Run RED**

```bash
npm test -- app/discover/page.test.tsx app/matches/page.test.tsx app/matches/[matchId]/page.test.tsx app/groups/page.test.tsx features/discovery/components/discovery-feed.test.tsx
```

Expected: FAIL on route-family, redirect, and invalid-range behavior.

- [x] **Step 3: Implement one Explore destination**

Treat `/discover`, `/groups`, and `/matches/*` as the Explore route family. Render quiet Events/Groups tabs. Redirect only the fixture index; keep match details stable.

- [x] **Step 4: Implement two-boundary date recovery**

The client prevents submission and links errors to fields. The server uses `safeParse`, preserves values, and renders:

```tsx
<DiscoveryFilterError
  errors={{ to: "Choose an end date on or after the start date." }}
  resetHref={`/discover?city=${citySlug}`}
/>
```

- [x] **Step 5: Preserve Explore context**

Every result appends an allowlisted relative `returnTo` beginning with `/discover` or `/groups`. Event and fixture details render “Back to Explore” when present and use a stable object fallback otherwise. Reject external, protocol-relative, and unrelated paths.

- [x] **Step 6: Add TeamMarks and fixture grouping**

Use `TeamMark` in every fixture header and discovery listing; group adjacent listings by `match.id` without changing API authorization.

- [x] **Step 7: Run GREEN**

Run the RED command plus `npm run typecheck`. Expected: PASS.

### Task 4: Secure event invite links

**Files:**
- Create: `supabase/migrations/20260831170000_event_invite_links_venue_archive.sql`
- Create: `supabase/tests/database/210_event_invite_links_venue_archive_test.sql`
- Modify: `types/database.generated.ts`
- Create: `features/attendance/invite-links.ts`
- Modify: `features/attendance/actions.ts`
- Create: `features/attendance/components/event-invite-link-control.tsx`
- Create: `app/join/event/[token]/page.tsx`
- Create: `app/join/event/[token]/page.test.tsx`
- Modify: `app/events/[eventId]/manage/page.tsx`
- Modify: `features/attendance/components/event-management-controls.tsx`
- Test: `features/attendance/actions.test.ts`
- Test: `features/attendance/components/event-management-controls.test.tsx`

**Interfaces:**
- Produces SQL RPCs:
  - `create_event_invite_token(input_event_id, input_expires_at, input_max_uses, audit_request_id)`
  - `list_event_invite_tokens(input_event_id)`
  - `revoke_event_invite_token(input_invite_token_id, audit_request_id)`
  - `redeem_event_invite_token(input_token, audit_request_id)`
- Produces route `/join/event/[token]`; consumes existing invitation response and capacity functions.

- [x] **Step 1: Write failing pgTAP tests**

Test owner-only creation, hashed-only storage, invite-only restriction, expiry, revocation, use limit, duplicate redemption idempotence, blocks, suspension, event cancellation/start, and concurrent final use. Assert anonymous/plain event URL access remains denied.

- [x] **Step 2: Run RED database test**

```bash
npm run db:start
npm run db:reset
supabase test db --local supabase/tests/database/210_event_invite_links_venue_archive_test.sql
```

Expected: FAIL because table/RPCs do not exist.

- [x] **Step 3: Implement the transactional token boundary**

Store only `digest(input_token, 'sha256')`; lock the token and event rows before checking limits; create one pending `event_invitations` row for the authenticated redeemer; increment use count only for a newly created invitation; never return private location data.

- [x] **Step 4: Write and run failing UI/action tests**

Assert invite-only management offers “Invite people” and “Create invite link,” public open-door events offer neither, and redemption requires sign-in before showing protected event content.

- [x] **Step 5: Implement UI and plain-language delivery copy**

Show plaintext once, copy it with an explicit warning, list only metadata later, and explain:

```text
They'll see this in Home and My Huddle and can accept or decline.
Redeeming this link does not reserve a place until they accept.
```

- [x] **Step 6: Regenerate types and run GREEN**

```bash
npm run db:types
npm run db:types:check
supabase test db --local supabase/tests/database/210_event_invite_links_venue_archive_test.sql
npm test -- features/attendance/actions.test.ts features/attendance/components/event-management-controls.test.tsx app/join/event/[token]/page.test.tsx
```

Expected: PASS.

### Task 5: Coherent Friends, Groups, and review actions

**Files:**
- Modify: `app/people/page.tsx`
- Modify: `features/friendships/components/friendship-control.tsx`
- Modify: `features/attendance/components/event-invitation-picker.tsx`
- Modify: `app/groups/page.tsx`
- Modify: `app/groups/new/page.tsx`
- Modify: `features/groups/components/group-create-form.tsx`
- Modify: `features/groups/components/group-card.tsx`
- Modify: `features/groups/management.ts`
- Modify: `features/groups/components/group-management-controls.tsx`
- Modify: `features/groups/membership-actions.ts`
- Modify: `app/groups/[slug]/page.tsx`
- Test: related `.test.tsx` and `.test.ts` files

**Interfaces:**
- Produces `GroupEventSubmission.canReview` and `.isOwnSubmission`; `withdrawGroupEventSubmissionAction`; optional-team copy throughout Groups; no exact-handle invitation input.

- [x] **Step 1: Write failing tests for every relationship state**

Cover send, cancel outgoing, accept, decline, remove, block, and unblock labels/outcomes. Verify event picker searches display names and handles but never asks users to type a handle.

- [x] **Step 2: Write failing group-review tests**

For the event creator, assert no Approve/Reject and one “Withdraw submission” action. For a different admin, assert Approve/Reject. For owner/admin-authored new events, assert direct publication remains unchanged.

- [x] **Step 3: Run RED**

```bash
npm test -- features/friendships/components/friendship-control.test.tsx features/attendance/components/event-invitation-picker.test.tsx features/groups/management.test.ts features/groups/components/group-management-controls.test.tsx app/groups/[slug]/page.test.tsx
```

- [x] **Step 4: Implement relationship and group copy**

Use “Groups” globally. Team fields remain optional. Unlisted copy says “Private group — people apply through your invite link.” Discoverable copy says “Appears in Explore Groups.”

- [x] **Step 5: Implement correct review projection and withdrawal**

Project submitter identity and current actor comparison server-side. Withdrawal calls the existing audited `cancel_event` boundary with a bounded product reason and only for the event's creator while pending.

- [x] **Step 6: Run GREEN**

Run the RED command plus `npm run typecheck`. Expected: PASS.

### Task 6: Owner-controlled venue closure

**Files:**
- Modify: `supabase/migrations/20260831170000_event_invite_links_venue_archive.sql`
- Modify: `supabase/tests/database/210_event_invite_links_venue_archive_test.sql`
- Modify: `features/venues/workspace/schemas.ts`
- Modify: `features/venues/workspace/actions.ts`
- Create: `features/venues/workspace/components/close-venue-control.tsx`
- Modify: `app/venues/[slug]/workspace/settings/page.tsx`
- Test: `features/venues/workspace/actions.test.ts`
- Create: `features/venues/workspace/components/close-venue-control.test.tsx`

**Interfaces:**
- Produces columns `venues.archived_at`, `venues.archived_by`; RPC `archive_venue(input_venue_id, input_confirmation, audit_request_id)`; live-query helper `private.venue_is_live(uuid)`.

- [x] **Step 1: Add failing pgTAP archive tests**

Assert only the current active owner can close; admins/non-members cannot; exact name confirmation is required; future draft/published events become cancelled; invitations revoke; attendance/history remain; public venue/discovery/workspace queries stop returning it; commercial mutations fail afterward; repeated close is idempotently denied.

- [x] **Step 2: Run RED**

```bash
supabase test db --local supabase/tests/database/210_event_invite_links_venue_archive_test.sql
```

- [x] **Step 3: Implement archive and replace every live venue boundary**

Add the archive fields and helper, update current public/workspace/discovery/planner RPC definitions in the new migration, cancel future events in one transaction, and write one security audit entry. Do not misuse `verification_status = 'suspended'`.

- [x] **Step 4: Add failing component/action tests**

Assert only owners see “Close venue,” the dialog requires the venue name, and success returns to the next valid workspace with explicit confirmation.

- [x] **Step 5: Implement and run GREEN**

```bash
npm run db:reset
npm run test:db
npm run db:types
npm test -- features/venues/workspace/actions.test.ts features/venues/workspace/components/close-venue-control.test.tsx
```

Expected: PASS.

### Task 7: Calm primary journeys and correct action density

**Files:**
- Modify: `app/page.tsx`
- Modify: `app/dashboard/page.tsx`
- Modify: `app/events/[eventId]/page.tsx`
- Modify: `app/events/[eventId]/manage/page.tsx`
- Modify: `features/attendance/components/event-management-controls.tsx`
- Modify: `app/groups/[slug]/page.tsx`
- Modify: `app/groups/[slug]/manage/page.tsx`
- Modify: venue workspace pages/components
- Modify: shared empty/error/loading states
- Test: corresponding page/component tests

**Interfaces:**
- Produces: one primary action per page role, one `Details` disclosure, quiet status sentences, consistent success/error treatment.

- [x] **Step 1: Write failing hierarchy tests**

For each role-aware page, assert one element marked `data-primary-action="true"`, no duplicate venue-verification badge, no internal words (`lifecycle`, `synchronized`, `provider`, `verified account`) in ordinary product copy, and destructive actions outside the primary action cluster.

- [x] **Step 2: Run RED page suites**

```bash
npm test -- app/page.test.tsx app/dashboard/page.test.tsx app/events/[eventId]/page.test.tsx app/events/[eventId]/manage/page.test.tsx app/groups/[slug]/page.test.tsx app/groups/[slug]/manage/page.test.tsx features/venues/workspace/components/today-dashboard.test.tsx
```

- [x] **Step 3: Flatten object and management pages**

Remove nested Card stacks; use white object cards only for event/group/venue objects; use dividers for details; move audit/history and advanced metadata into one native/Radix disclosure. Replace “Unverified venue” badge collections with one quiet line:

```text
Self-listed venue · ownership not checked by Huddle
```

- [x] **Step 4: Consolidate event management**

Use one People section with Invited, Requests, and Going views; keep invite picker in context; put cancellation in the final danger section. Open-door events show none of these controls.

- [x] **Step 5: Run GREEN and intermediate viewport checks**

Run the RED command and component tests at 375px, 768px, and 1280px using the local browser. Expected: no horizontal overflow, clipped controls, or competing filled actions.

### Task 8: Complete automated CRUD journeys

**Files:**
- Modify: `tests/e2e/ux-redesign.spec.ts`
- Create: `tests/e2e/calm-crud.spec.ts`
- Modify: `tests/production/smoke.spec.ts`
- Modify: `docs/evidence/calm-explore/ACTION-MATRIX.md`

**Interfaces:**
- Consumes all action IDs and completed runtime behavior.
- Produces deterministic two-account evidence for every matrix row and three viewport snapshots without credentials or private locations.

- [x] **Step 1: Add failing integrated journeys**

Add deterministic tests for:

```text
Explore date/team/area/fixture → venue event → Back to preserved Explore
friends request/cancel/accept/decline/remove → friends event visibility
group create/edit/share/apply/approve/submit/withdraw/review/archive
invite-only person invite and secure-link redeem/accept/decline/revoke/expire
venue create/edit/area/plan/open-door/reservation/follow/close
event request/join/approve/reject/leave/remove/cancel/history
```

- [x] **Step 2: Run RED focused E2E**

```bash
node scripts/with-local-supabase-env.mjs playwright test tests/e2e/calm-crud.spec.ts --project=chromium --workers=1
```

Expected: failures identify any incomplete action flow.

- [x] **Step 3: Correct only runtime defects exposed by the journey**

For every failure, add or keep the smallest unit/pgTAP regression first, observe RED, implement, and re-run the focused journey.

- [x] **Step 4: Complete the action matrix**

Every row must name its automated test and manual evidence. No row may say TBD, planned, or not tested.

- [x] **Step 5: Run GREEN focused E2E**

Expected: all calm CRUD journeys pass with deterministic data and no tracked screenshot changes.

### Task 9: Full verification, bounded UX audit, and PR publication

**Files:**
- Modify: `docs/evidence/calm-explore/ACTION-MATRIX.md`
- Create: `docs/evidence/calm-explore/UX-AUDIT.md`
- Modify: `docs/evidence/ux-redesign/README.md`
- Modify: `docs/submission/TEST-PLAN.md`
- Modify: `docs/submission/TRACEABILITY.md`
- Modify: `README.md`

**Interfaces:**
- Produces one clean branch, exact verification evidence, and one reciprocal-review PR.

- [x] **Step 1: Run the complete acceptance gate fresh**

```bash
npm run format:check
npm run lint
npm run typecheck
npm run db:types:check
npm run build:local
npm run test:acceptance
```

Expected: every command exits 0 with zero failing tests/assertions/scenarios.

- [x] **Step 2: Run the complete manual UX audit**

Use two isolated signed-in accounts and anonymous mode at 1280px, 768px, and 375px. Execute every action-matrix row, back/refresh/direct-link recovery, keyboard navigation, 200% zoom, and map/list behavior. Record click count, outcome, emotional friction, and evidence.

- [x] **Step 3: Perform one bounded correction pass**

Fix only Critical/Important usability defects, contract regressions, broken action outcomes, accessibility failures, privacy/security/data-integrity issues, or acceptance failures. Add RED tests first and rerun the complete acceptance gate afterward.

- [x] **Step 4: Verify the diff and publication prerequisites**

First update README and submission evidence with the exact implemented behavior and fresh test counts; do not copy planned claims from the design spec.

```bash
git diff --check
git diff --stat origin/main...HEAD
git status --short
git grep -nE '(service_role|SUPABASE_SERVICE_ROLE_KEY|password[[:space:]]*=|api[_-]?key[[:space:]]*=)' -- . ':!package-lock.json'
git config --local user.name
git config --local user.email
git config --local core.hooksPath
gh auth status
```

Confirm scope, no secrets/private locations/generated junk, valid Guy identity, and genuine reciprocal participation before commit.

- [ ] **Step 5: Publish with the repository skill**

Only after all earlier steps pass, use `$huddle-publish-pr` to create the coherent commit with exactly one Ohad co-author trailer, push `codex/calm-explore-crud-audit`, open the single PR into `main`, and request `ohadsho`.

- [ ] **Step 6: Stop at reciprocal review handoff**

Return the PR URL, exact head SHA, verification counts, known exclusions, and instruction for Ohad to run `$huddle-review-merge`. Do not approve, merge, deploy, or mutate hosted Supabase.
