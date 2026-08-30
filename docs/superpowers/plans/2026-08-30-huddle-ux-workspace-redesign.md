# Huddle UX and Workspace Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close every production UX-audit finding F01–F40 with an authorization-enforced Fan/Venue workspace model and a coherent, responsive Huddle interface, then prove it through the full acceptance suite and repeated two-account audits.

**Architecture:** Keep the existing Next.js modular monolith and Supabase security boundary. Add context-aware Fan/Venue eligibility, venue memberships and reusable venue areas/defaults, bounded current-state projections, protected event drafts, and server-proxied public-address search. Rebuild the interface as a small set of task-led Fan and Venue surfaces while retaining the existing event, group, attendance, moderation, and private-location invariants.

**Tech Stack:** Next.js 16 App Router, React 19, strict TypeScript, Tailwind CSS 4, repository-owned shadcn/Radix primitives, TanStack Query for discovery/attendance only, Zod 4, Supabase Auth/PostgreSQL/PostGIS/RLS, MapLibre GL 6.6.0 with OpenStreetMap tiles/data attribution, Vitest/RTL, pgTAP, Playwright.

**Spec:** `docs/superpowers/specs/2026-08-30-huddle-ux-workspace-redesign-design.md`

## Global Constraints

- One Supabase login represents one human; Fan and each Venue are separately authorized workspaces.
- The selected workspace cookie is presentation state only and never grants authorization.
- Fan primary navigation is exactly Home, Explore, My Huddle, People, Account.
- Venue primary navigation is exactly Today, Calendar, Events, Venue, Account. The full Huddle
  wordmark stays left; Venue identity/workspace switching stays right; Plan events is contextual
  page content rather than a persistent header control.
- Court Green is restrained to one primary/current/live emphasis per component group; retain the approved Huddle logo, palette, and Familjen Grotesk.
- Primary controls use at least 44 by 44 CSS-pixel targets; current navigation exposes `aria-current="page"`.
- No ordinary form exposes latitude or longitude.
- Never send an exact home address to public Nominatim; exact home data remains in protected tables and controlled functions.
- Invite-only, owned, attending, pending, declined, left, removed, and archived events do not appear as new Explore opportunities.
- Database history remains retained; closed social relationships do not appear in ordinary active UI.
- No user approves their own group submission; owner/admin-authored events publish atomically and member submissions still require review.
- Do not add Express, Prisma, Redis, Socket.IO, Zustand, payments, messaging, NBA/live scores, media upload, or a holding-company hierarchy.
- Every database change uses a committed migration eventually, forced RLS, controlled functions, indexes, generated types, and pgTAP evidence.
- Work only on the dedicated local goal branch. Local commits are authorized only once reciprocal partner participation is truthful under `AGENTS.md`; do not invent participation to satisfy the hook. Do not push, publish a PR, deploy, or mutate hosted Supabase/Vercel without a later explicit instruction.
- Preserve unrelated worktree changes. The existing audit and design documents are intentional local artifacts.

## Bounded run ledger

| Work | Status | Review policy |
|---|---|---|
| Tasks 1–6 and 8 | closed | Preserved; not restarted or re-reviewed. |
| Task 7 | closed | Current fix completed and one clean re-review recorded. |
| Tasks 9–13 | closed | Implemented as one integration wave, then one combined independent review; only blocking/scoped corrections were applied. |
| Task 14 | closed | Complete deterministic two-account journey passed at 1280, 768, and 375 px. |
| Task 15 | closed | One bounded correction pass completed, including the public discovery map, real filter modal, stable shell placement, and Venue Events directory. The final full acceptance run passed 146 Vitest files / 717 tests, 34 pgTAP files / 1559 assertions, and all 22 Playwright scenarios. |

Non-blocking cosmetic ideas do not reopen closed tasks. The implementation and audit loop remained
local; publication and hosted rollout require a separate explicit instruction.

## Planned File Map

### Source-of-truth and evidence

- Modify `AGENTS.md`, `docs/HUDDLE-IMPLEMENTATION-SPEC.md`, `docs/HUDDLE-ARCHITECTURE.md`, `docs/HUDDLE-STEP-BY-STEP-BUILD-SPEC.md`, and `README.md` to encode the approved workspace contract.
- Create `docs/evidence/ux-redesign/README.md` as the F01–F40 evidence ledger; final screenshots live beside it.
- Modify `docs/submission/TRACEABILITY.md`, `docs/submission/TEST-PLAN.md`, and `docs/operations/PRODUCTION-ACCEPTANCE.md` only after runtime/test evidence is truthful.

### Database

- Create `supabase/migrations/20260830090000_workspace_foundation.sql` for Fan activation, venue memberships, common/Fan eligibility, workspace RPCs, and backfill.
- Create `supabase/migrations/20260830100000_venue_spaces_defaults.sql` for viewing areas, venue defaults, event area snapshots, and venue workspace projections.
- Create `supabase/migrations/20260830110000_current_state_attention.sql` for attention, My Huddle/People projections, and current-state classification.
- Create `supabase/migrations/20260830115000_discovery_acquisition_boundary.sql` for acquisition-only discovery exclusions.
- Create `supabase/migrations/20260830120000_protected_event_drafts.sql` for persisted drafts, private draft locations, and admin-authored publication.
- Create `supabase/migrations/20260830130000_public_address_cache.sql` for public-address cache/rate claims.
- Create `supabase/migrations/20260830130500_common_onboarding.sql` for the standalone common-safety acceptance phase required before Venue address lookup.
- Create `supabase/migrations/20260830140000_venue_planner.sql` for transactional multi-fixture planning.
- Create `supabase/migrations/20260830150000_fixture_coverage.sql` for truthful local-catalog coverage projection.
- Create pgTAP files `120_workspace_foundation_test.sql`, `130_venue_spaces_defaults_test.sql`, `140_current_state_attention_test.sql`, `145_discovery_acquisition_boundary_test.sql`, `150_protected_event_drafts_test.sql`, `160_public_address_cache_test.sql`, `165_common_onboarding_test.sql`, `170_venue_planner_test.sql`, and `180_fixture_coverage_test.sql`.
- Regenerate `types/database.generated.ts` after every schema group stabilizes.

### Shared application foundations

- Create `features/workspaces/{types,schemas,queries,actions,state}.ts` and `features/workspaces/components/{workspace-switcher,venue-workspace-header,fan-bottom-navigation}.tsx`.
- Create `features/attention/{types,queries}.ts` and `features/attention/components/attention-list.tsx`.
- Create `features/locations/{types,schemas,provider,nominatim}.ts` and `features/locations/components/{address-search,map-pin-picker}.tsx`.
- Create `components/ui/{dialog,combobox}.tsx`; modify existing button/card/badge/input/pagination primitives only through shared variants.
- Modify `components/layout/{app-shell,site-header,mobile-navigation,account-navigation}.tsx` and `app/globals.css`.

### Fan surfaces

- Modify `app/page.tsx`, `app/discover/page.tsx`, `app/dashboard/page.tsx`, `app/people/page.tsx`, and their feature modules.
- Create `app/account/page.tsx`, `app/onboarding/page.tsx`, `app/onboarding/fan/page.tsx`, and `app/onboarding/venue/page.tsx`.
- Modify event, group, profile, interests, friendship, and Safety pages/components in their existing feature directories.
- Replace the monolithic event form with `features/events/components/event-create-flow.tsx`, `fixture-combobox.tsx`, `event-place-step.tsx`, and `event-review-step.tsx`.

### Venue surfaces

- Task 4 creates the authorized Venue workspace layout plus truthful minimal Today, Calendar,
  Events, and Venue pages so workspace selection never leads to a dead destination.
- Task 11 enriches those routes and creates `app/venues/[slug]/workspace/plan/page.tsx`.
- Create `features/venues/workspace/{types,queries,actions,schemas}.ts` and components for Today, Calendar/Agenda, planner, viewing areas, and settings.
- Keep `app/venues/[slug]/page.tsx` as the public page and make `/manage` redirect to the workspace settings route for authorized operators.

### Tests

- Keep unit/component tests colocated with each feature.
- Extend `tests/e2e/auth.spec.ts` only for short existing regression flows; create `tests/e2e/ux-redesign.spec.ts` for the coherent two-account journey.
- Expand `tests/production/smoke.spec.ts` to cover Home, Explore, My Huddle, People, and a Venue workspace without mutating production.

---

### Task 1: Reconcile the Product Contract and Establish the Audit Ledger

**Files:**
- Modify: `AGENTS.md`
- Modify: `docs/superpowers/plans/2026-08-30-huddle-ux-workspace-redesign.md` (Task 1 scope and the controller-approved `AGENTS.md` reconciliation record only)
- Modify: `docs/HUDDLE-IMPLEMENTATION-SPEC.md`
- Modify: `docs/HUDDLE-ARCHITECTURE.md`
- Modify: `docs/HUDDLE-STEP-BY-STEP-BUILD-SPEC.md`
- Modify: `README.md`
- Create: `docs/evidence/ux-redesign/README.md`

**Interfaces:**
- Consumes: approved design specification and audit F01–F40.
- Produces: one non-contradictory product contract and an evidence row format used by every later task.

- [ ] **Step 1: Inventory the existing contract contradiction**

Read `AGENTS.md` and the four authority documents, then use a focused `rg` inventory to locate every statement about venue creation, completed profiles, Fan eligibility, group-event publication, and unverified venues. Record the contradictory line references in the task report before editing. This is human-facing contract prose, so do not add a source-text assertion test that would merely detect wording changes.

- [ ] **Step 2: Update all authority documents together**

Record the exact approved rules: common safety eligibility, optional Fan activation, active venue membership, venue-only operators, self-serve Unverified activation, venue-as-non-attendee, atomic admin-authored group publication, and review of an ordinary-member submission only by a different current owner/admin whose user ID differs from `created_by`. Promotion after submission never permits self-approval or self-rejection. Preserve the existing safety rules and explicitly mark this as the approved post-B12 redesign rather than rewriting historical evidence.

- [ ] **Step 3: Create the evidence ledger**

Use one row per finding with these exact columns:

```markdown
| Finding | Runtime status | Automated evidence | Browser evidence | Notes |
|---|---|---|---|---|
| F01 | open | — | — | Venue recovery path |
```

Populate F01 through F40 as `open`; later tasks may mark a row `closed` only with a passing command or saved browser artifact.

- [ ] **Step 4: Re-read the contract and run formatting**

Repeat the focused inventory, inspect the edited sections together for contradiction, and run: `npm exec prettier -- --check docs README.md`
Expected: no obsolete permission remains in the inspected contract sections and formatting passes.

- [ ] **Step 5: Local checkpoint**

Run: `git diff --check && git status --short`
Expected: clean diff hygiene; no commit or external mutation.

### Task 2: Add Context-Aware Fan and Venue Authorization

**Files:**
- Create: `supabase/migrations/20260830090000_workspace_foundation.sql`
- Create: `supabase/tests/database/120_workspace_foundation_test.sql`
- Modify: `features/auth/actor.ts`
- Modify: `features/auth/actor.test.ts`
- Modify: `features/profiles/actions.ts`
- Modify: `features/profiles/schemas.ts`
- Modify: every existing `requireActor`/`actorGateCode` call site and its focused expectation under `app/` and `features/`, limited to classifying the existing operation as authenticated, common, Fan, safety, or Venue-authorized
- Regenerate: `types/database.generated.ts`

**Interfaces:**
- Consumes: current `profiles`, `venues.owner_id`, Auth claims, rules version, suspension fields.
- Produces: `private.profile_is_common_eligible(uuid)`, `private.profile_is_fan_eligible(uuid)`, `private.actor_manages_venue(uuid,uuid)`, `public.list_my_workspaces()`, `public.activate_fan_workspace(text,text,text,text,boolean,integer)`, `venue_memberships`, and `requireActor("common" | "fan" | { venueId: string })`.

- [ ] **Step 1: Write pgTAP failures for the authorization matrix**

Cover these identities: complete existing Fan, venue-only common-eligible operator, active Fan+Venue operator, revoked venue admin, suspended account, and unrelated Fan. Assert:

```sql
select ok(private.profile_is_common_eligible(venue_only_id), 'venue-only operator is common eligible');
select ok(not private.profile_is_fan_eligible(venue_only_id), 'venue-only operator is not a Fan');
select ok(private.actor_manages_venue(operator_id, venue_id), 'active owner manages venue');
select ok(not private.actor_manages_venue(revoked_id, venue_id), 'revoked admin does not manage venue');
```

Also assert forced RLS, no direct client inserts/updates, exact one active owner, and existing completed profiles receive Fan activation.

- [ ] **Step 2: Run database tests and confirm the new relations/functions are absent**

Run: `npm run db:reset && npm run test:db`
Expected: the new pgTAP file fails on missing columns, table, and functions.

- [ ] **Step 3: Implement the workspace foundation migration**

Add `profiles.fan_enabled_at timestamptz`, backfill it from `profile_completed_at`, and enforce that Fan activation implies a completed profile. Add `venue_member_role` and `venue_membership_status` enums plus:

```sql
create table public.venue_memberships (
  venue_id uuid not null references public.venues(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role public.venue_member_role not null,
  status public.venue_membership_status not null default 'active',
  revoked_at timestamptz,
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  primary key (venue_id, user_id)
);
```

Backfill each `venues.owner_id` as the active owner. Add an owner partial unique index, forced RLS, deny-all direct writes, safe self-readable membership projection, and controlled audit-writing functions. Keep `owner_id` synchronized as the canonical primary owner during this migration.

- [ ] **Step 4: Split common and Fan eligibility in SQL**

Common eligibility checks verified Auth email, current adult/rules acceptance, and suspension/restriction state. Fan eligibility additionally requires `fan_enabled_at` and `profile_completed_at`. Keep `private.profile_is_community_eligible` as a compatibility wrapper to Fan eligibility until every caller is deliberately classified.

- [ ] **Step 5: Refactor the server actor API**

Use this discriminated requirement:

```ts
export type ActorRequirement =
  | "authenticated"
  | "common"
  | "fan"
  | "safety"
  | { venueId: string };

export async function requireActor(requirement: ActorRequirement): Promise<{
  supabase: Awaited<ReturnType<typeof createClient>>;
  user: { id: string };
}>;
```

Map existing `"community"` callers to `"fan"` only after reviewing whether they are Fan or venue mutations. Venue operations must pass a venue ID and never infer authorization from a cookie or form owner ID.

Preserve `"safety"` as the narrow verified-account gate that keeps confidential reporting and appeals available while suspended/restricted. Map legacy `"onboarding"` callers to `"authenticated"`; safe exit/revocation actions may use that gate, while attendance acceptance and private social actions require `"fan"`. Existing context consumers may continue receiving the loaded profile in addition to the minimum return fields above.

- [ ] **Step 6: Make Fan completion explicit**

Add `public.activate_fan_workspace(text,text,text,text,boolean,integer)` as the canonical function and make the existing `complete_profile` signature a compatibility wrapper during the transition. `activateFanWorkspaceAction` must set `fan_enabled_at` only after all Fan fields validate. Venue-only common onboarding updates adult/rules through `create_venue_workspace` and must not create a public handle.

- [ ] **Step 7: Regenerate types and run focused gates**

Run: `npm run db:reset && npm run test:db && npm run db:types && npm test -- features/auth/actor.test.ts features/profiles/actions.test.ts && npm run typecheck`
Expected: PASS.

- [ ] **Step 8: Local checkpoint**

Run: `git diff --check && git status --short`.

### Task 3: Add Venue Areas, Defaults, and Workspace Projections

**Files:**
- Create: `supabase/migrations/20260830100000_venue_spaces_defaults.sql`
- Create: `supabase/tests/database/130_venue_spaces_defaults_test.sql`
- Modify: `features/venues/schemas.ts`
- Modify: `features/venues/actions.ts`
- Modify: `features/venues/queries.ts`
- Create: `features/venues/workspace/types.ts`
- Create: `features/venues/workspace/schemas.ts`
- Create: `features/venues/workspace/queries.ts`
- Create: `features/venues/workspace/actions.ts`
- Regenerate: `types/database.generated.ts`

**Interfaces:**
- Consumes: Task 2 active venue memberships.
- Produces: `venue_spaces`, venue default fields, `events.venue_space_id`, `create_venue_workspace(text,text,uuid,text,numeric,numeric,text,text,integer,text[],text,boolean,boolean,boolean,integer,uuid)`, `get_venue_workspace`, `list_venue_calendar`, `update_venue_workspace`, and `save_venue_space`.

The activation signature names its arguments, in order: `input_name`, `input_slug`, `input_city_id`, `input_address_text`, `input_longitude`, `input_latitude`, `input_description`, `input_main_space_name`, `input_main_space_capacity`, `input_facilities`, `input_house_information`, `input_default_requires_approval`, `input_adult_attested`, `input_representation_attested`, `input_rules_version`, `audit_request_id`. Require a positive capacity and bounded non-empty space name for a newly activated Venue. Require adult and representation booleans with `IS DISTINCT FROM TRUE`, and treat the exact current rules version as acceptance only after the Server Action schema validates the current-rules checkbox.

- [ ] **Step 1: Write the venue-default and backfill pgTAP cases**

Assert one Main screen per existing venue, stated capacity copied into that screen, no fabricated extra areas when `screen_count > 1`, active member-only management, public projection omission of membership records, event capacity snapshot independence, and blocked/suspended operator denial.

- [ ] **Step 2: Run the database suite and observe the intended failures**

Run: `npm run db:reset && npm run test:db`
Expected: FAIL on missing venue area/default structures.

- [ ] **Step 3: Add normalized venue defaults**

Create `venue_spaces(id, venue_id, name, capacity, active, sort_order, timestamps)` with a case-insensitive active-name uniqueness constraint. Add bounded `house_information`, `venue_facility[]` with exactly `wheelchair_accessible`, `step_free_access`, `accessible_toilet`, `hearing_loop`, `parking`, `food`, and `drinks`, `default_requires_approval`, and `business_representation_attested_at/by` to the venue domain. Add `events.venue_space_id` with a same-venue validation trigger/function.

- [ ] **Step 4: Backfill without inventing data**

For each existing venue, create exactly one active `Main screen` using `stated_capacity`. If capacity is null, leave the area incomplete and expose `needs_capacity=true`; if screen count is greater than one, expose `needs_area_setup=true` instead of inventing names/capacities.

- [ ] **Step 5: Replace owner checks in venue RPCs**

Update `create_venue`, `update_venue`, `get_venue_for_management`, `list_managed_venue_events`, and event manager helpers to call `private.actor_manages_venue`. Preserve moderator verification power and the visible Unverified state.

- [ ] **Step 6: Add strict TypeScript projections**

Define:

```ts
export type VenueWorkspace = Readonly<{
  id: string;
  slug: string;
  name: string;
  role: "owner" | "admin";
  verificationStatus: "unverified" | "verified" | "suspended";
  needsAreaSetup: boolean;
  spaces: readonly VenueSpace[];
}>;

export type VenueSpace = Readonly<{
  id: string;
  name: string;
  capacity: number | null;
  active: boolean;
}>;
```

Parse all RPC data with strict Zod schemas before returning it to pages.

- [ ] **Step 7: Run focused gates and regenerate types**

Run: `npm run db:reset && npm run test:db && npm run db:types && npm test -- features/venues && npm run typecheck`
Expected: PASS.

- [ ] **Step 8: Local checkpoint**

Run: `git diff --check && git status --short`.

### Task 4: Build the Workspace Shell and First-Run Routing

**Files:**
- Create: `features/workspaces/types.ts`
- Create: `features/workspaces/schemas.ts`
- Create: `features/workspaces/queries.ts`
- Create: `features/workspaces/actions.ts`
- Create: `features/workspaces/state.ts`
- Create: `features/workspaces/components/workspace-switcher.tsx`
- Create: `features/workspaces/components/fan-bottom-navigation.tsx`
- Create: `features/workspaces/components/venue-workspace-header.tsx`
- Create: `app/onboarding/page.tsx`
- Create: `app/onboarding/fan/page.tsx`
- Create: `app/onboarding/venue/page.tsx`
- Create: `app/account/page.tsx`
- Create: `app/venues/[slug]/workspace/layout.tsx`
- Create: `app/venues/[slug]/workspace/page.tsx`
- Create: `app/venues/[slug]/workspace/calendar/page.tsx`
- Create: `app/venues/[slug]/workspace/settings/page.tsx`
- Create: `supabase/migrations/20260830130500_common_onboarding.sql`
- Create: `supabase/tests/database/165_common_onboarding_test.sql`
- Modify: `app/auth/verify/callback/route.ts`
- Modify: `components/layout/app-shell.tsx`
- Modify: `components/layout/site-header.tsx`
- Replace: `components/layout/mobile-navigation.tsx`
- Modify: `components/layout/account-navigation.tsx`
- Test: corresponding colocated tests and `app/auth/verify/callback/route.test.ts`

**Interfaces:**
- Consumes: `public.list_my_workspaces()`, Task 2 eligibility, and Task 8 address/pin controls.
- Produces: `WorkspaceSummary`, `getWorkspaceShellContext()`, `selectWorkspaceAction()`, five-destination Fan chrome, four-destination Venue chrome, and deterministic onboarding redirects.

- [ ] **Step 1: Write shell and routing tests first**

Cover signed-out, no-workspace, Fan-only, Venue-only, Fan+Venue, revoked last-selected venue, and moderator cases. Assert exact nav labels/counts, logo Home semantics, selected route state, no Create venue in Fan navigation, no dead Venue navigation destinations, and verification callback redirects to onboarding or the valid last workspace. Add pgTAP coverage proving that the standalone common-safety step cannot activate a Fan or Venue, rejects unverified/restricted actors and stale rules, and enables the already-common-gated public-address lookup before Venue activation.

- [ ] **Step 2: Run focused tests and confirm failure**

Run: `npm test -- components/layout app/auth/verify/callback/route.test.ts features/workspaces`
Expected: FAIL because the workspace modules/routes do not exist.

- [ ] **Step 3: Implement the workspace types and query**

Use:

```ts
export type WorkspaceSummary = Readonly<{
  kind: "fan" | "venue";
  id: string;
  slug: string | null;
  label: string;
  role: "fan" | "owner" | "admin";
}>;

export type WorkspaceShellContext = Readonly<{
  active: WorkspaceSummary | null;
  available: readonly WorkspaceSummary[];
  isModerator: boolean;
}>;
```

Remember `{ kind, id }` in a secure, same-site, HTTP-only `huddle-workspace` cookie only after confirming it appears in the current `list_my_workspaces()` result.

- [ ] **Step 4: Implement verification and onboarding routing**

The callback exchanges the token for a session, reads workspaces, and redirects: zero workspaces → `/onboarding`; one valid workspace → its landing; multiple → remembered valid workspace or Fan. Venue setup is a focused two-phase flow: first persist only adult/current-rules common-safety acceptance through a narrowly authorized SQL function, then allow Task 8 public-address search and atomically activate the Venue with venue information and truthful representation attestation. The first phase must never publish a Fan identity or create a Venue. Fan setup reuses the simplified profile form.

- [ ] **Step 5: Replace the navigation shell**

Fan header/bottom navigation contains Home `/`, Explore `/discover`, My Huddle `/dashboard`, People `/people`, Account `/account`. Venue header/bottom navigation contains Today, Calendar, Events, Venue, Account under `/venues/[slug]/workspace`. Task 4 supplies membership-authorized, truthful minimal Today, Calendar, Events, and Venue pages backed by the existing Task 3 workspace/calendar projections; Task 11 enriches them with planner-specific data and controls. The full Huddle wordmark stays left in both contexts, the workspace switcher stays right, and the planner action lives in Venue page content. Use route-aware links with `aria-current="page"`, 44px targets, no crowded desktop overflow, no dead destinations, and no menu containing the old 15 destinations.

- [ ] **Step 6: Add Account as a compact hub**

Show workspace switcher first, then Fan profile/interests when Fan is enabled, Venue setup when permitted, Safety center, moderator entry when authorized, and sign out. Do not duplicate full forms.

- [ ] **Step 7: Run focused responsive/component gates**

Run: `npm test -- components/layout features/workspaces app/auth/verify/callback/route.test.ts && npm run typecheck && npm run lint`
Expected: PASS.

- [ ] **Step 8: Local checkpoint**

Run: `git diff --check && git status --short`.

### Task 5: Add Current-State Libraries, Attention, and People Projections

**Files:**
- Create: `supabase/migrations/20260830110000_current_state_attention.sql`
- Create: `supabase/tests/database/140_current_state_attention_test.sql`
- Create: `features/attention/types.ts`
- Create: `features/attention/queries.ts`
- Create: `features/attention/components/attention-list.tsx`
- Modify: `features/dashboard/queries.ts`
- Modify: `features/dashboard/components/my-huddle-overview.tsx`
- Modify: `features/people/search.ts`
- Modify: `features/people/search.test.ts`
- Modify: `app/page.tsx`
- Modify: `app/dashboard/page.tsx`
- Modify: `app/people/page.tsx`

**Interfaces:**
- Consumes: Fan eligibility and existing invitations, attendance, friendships, group memberships/applications/events.
- Produces: `list_attention_items(limit)`, `list_my_events(bucket,limit,offset)`, `list_my_group_relationships(bucket,limit,offset)`, `list_my_saved_items(bucket,limit,offset)`, `list_people_hub(query,bucket,limit,offset)`, and Fan Home/My Huddle/People screens.

- [ ] **Step 1: Write two-account pgTAP scenarios**

Create deterministic users and assert friend request, event invitation, attendance request, group application, and member event submission each generate one appropriate manager/recipient attention item. Resolve each transition and assert it disappears. Assert removed/declined/left rows never enter active lists, a pending discoverable-group application is recoverable through a minimal safe projection, and a pending unlisted applicant does not receive member-only fields.

- [ ] **Step 2: Run database tests and confirm the new projections fail**

Run: `npm run db:reset && npm run test:db`.

- [ ] **Step 3: Implement bounded current-state RPCs**

Use one canonical attention result:

```ts
export type AttentionItem = Readonly<{
  key: string;
  kind:
    | "event_invitation"
    | "attendance_request"
    | "friend_request"
    | "group_application"
    | "group_event_submission"
    | "workspace_setup";
  resourceId: string;
  href: string;
  title: string;
  description: string;
  createdAt: string;
}>;
```

The SQL projection returns only currently actionable rows, checks blocks/bans/suspension, uses deterministic ordering, and contains no email, private address, coordinate, invite token, or report detail. A Fan with no followed team or competition may receive one bounded `workspace_setup` item linking to Interests; it disappears once a relevant follow exists.

- [ ] **Step 4: Rebuild Home around next + attention + one suggestion**

Remove the duplicated My Huddle collection and counts card. Query the next effective event, attention items, and one bounded discovery suggestion in parallel. Until Task 6 canonicalizes event acquisition, the suggestion is a locally stored upcoming fixture prioritized by the Fan's followed interests, never an event from the known-broad pre-Task-6 discovery feed. Provide a first-run state with Explore and Plan a huddle actions.

- [ ] **Step 5: Rebuild My Huddle as Events, Groups, Saved**

Use accessible filter controls, not URL-navigation tabs. Events expose Upcoming/Hosting/Pending and an explicit collapsed History filter. Groups expose Owner/Admin/Member/Applying. Saved uses a bounded union projection over existing sport/team/competition subscriptions and venue follows. History contains completed/cancelled events only when the Fan actually attended or hosted; declined, left, removed, revoked, and merely invited residue never appears. Invitations remain in attention rather than a fourth collection.

- [ ] **Step 6: Combine people discovery and relationship management**

Search names/handles and show authorization-safe reasons such as shared followed team, city, or a group visible to the viewer through active membership. Use explicit `suggested`, `search`, `accepted`, `incoming`, and `sent` buckets on one page. Always filter blocks and disabled/non-Fan profiles.

- [ ] **Step 7: Run focused app tests**

Run: `npm run db:reset && npm run test:db && npm run db:types && npm test -- features/attention features/dashboard features/people app/page.tsx app/dashboard app/people && npm run typecheck`
Expected: PASS.

- [ ] **Step 8: Local checkpoint**

Run: `git diff --check && git status --short`.

### Task 6: Correct Discovery Acquisition Boundaries

**Files:**
- Create: `supabase/migrations/20260830115000_discovery_acquisition_boundary.sql`
- Create: `supabase/tests/database/145_discovery_acquisition_boundary_test.sql`
- Modify: `app/api/discovery/route.ts`
- Modify: `app/api/discovery/route.test.ts`
- Modify: `features/discovery/query.ts`
- Modify: `features/discovery/query.test.ts`
- Modify: `features/discovery/components/discovery-feed.tsx`
- Modify: `features/discovery/components/discovery-event-card.tsx`
- Modify: `features/discovery/components/discovery-filters.tsx`
- Modify: `app/discover/page.tsx`
- Modify: `app/discover/page.test.tsx`

**Interfaces:**
- Consumes: current `discover_events` cursor/filter contract and Task 5 current-state rules.
- Produces: one acquisition-only Explore result set that preserves cursor signing and private-location safety.

- [ ] **Step 1: Add failing discovery matrix tests**

For the same viewer, create hosted, venue-managed, attending, requested, invited-only, declined, left, removed, archived, and genuinely eligible events. Assert only the genuinely new eligible group/friends/public/team event appears. Repeat anonymously and for a venue-only account.

- [ ] **Step 2: Run the database and route tests**

Run: `npm run db:reset && npm run test:db && npm test -- app/api/discovery/route.test.ts features/discovery app/discover/page.test.tsx`
Expected: the pre-change discovery projection fails the new exclusions.

- [ ] **Step 3: Tighten `discover_events` without weakening visibility**

Add `not exists` exclusions for hosting/venue membership and every existing invitation/attendance state that means the viewer already acquired or closed the relationship. Exclude `invite_only` categorically from feed acquisition. Preserve the relationship audience checks, block checks, cursor binding, PostGIS candidate selection, coarse distance, deterministic ordering, and no-coordinate return type.

- [ ] **Step 4: Simplify the Explore UI**

Use one Where/When/Match search surface with lightweight category chips. Results show one status and one action. Remove engineering copy and links to owned objects; a small static hint may say owned items live in My Huddle.

- [ ] **Step 5: Verify pagination and cursor behavior**

Run: `npm test -- features/discovery app/api/discovery/route.test.ts app/discover/page.test.tsx && npm run typecheck`
Expected: PASS including empty/error/retry states.

- [ ] **Step 6: Local checkpoint**

Run: `git diff --check && git status --short`.

### Task 7: Add Protected Persisted Event Drafts and Group Publication Rules

**Files:**
- Create: `supabase/migrations/20260830120000_protected_event_drafts.sql`
- Create: `supabase/tests/database/150_protected_event_drafts_test.sql`
- Modify: `features/events/actions.ts`
- Modify: `features/events/schemas.ts`
- Modify: `features/events/state.ts`
- Create: `features/events/drafts.ts`
- Modify: `features/groups/actions.ts`
- Modify: `features/groups/management.ts`
- Regenerate: `types/database.generated.ts`

**Interfaces:**
- Consumes: existing controlled event transaction and private-location domain.
- Produces: `save_event_draft`, `get_event_draft`, `discard_event_draft`, `finalize_event_draft`, and atomic admin-authored group publication.

- [ ] **Step 1: Write draft and group-role pgTAP failures**

Assert owner-only draft reads, direct table denial, exact home fields absent from the generic payload and direct selects, author-controlled protected location retrieval, refresh/finalize preservation, final event capacity/audience constraints, draft cleanup, member-created pending review, owner/admin-created published status with an audit row, `reviewer_id <> created_by` for pending approval/rejection, denial after the member creator is promoted to admin, and a successful decision by a different current owner/admin.

- [ ] **Step 2: Run database tests and observe failure**

Run: `npm run db:reset && npm run test:db`.

- [ ] **Step 3: Add the protected draft domain**

Create forced-RLS `event_drafts` with owner, current step (1–3), safe validated JSON payload, optional organizing group, and timestamps. Create `event_draft_private_locations` with address, directions, and geography, paired one-to-one and inaccessible directly. Revoke all table grants; expose only controlled functions.

- [ ] **Step 4: Implement save/get/finalize functions**

`save_event_draft` validates allowed keys and bounds, strips unknown keys, and writes protected home fields separately. `get_event_draft` returns the safe payload and, only to its owner through the controlled function, the private fields required to resume. `finalize_event_draft` revalidates all current authorization/catalog facts, calls the event transaction, writes the audit row, and removes the draft atomically.

- [ ] **Step 5: Remove self-review**

Inside `create_group_event`, inspect the current active group role. `owner`/`admin` uses `published` and writes the same approval audit facts in the creation transaction; `member` remains `pending_group_review`. Every later approval or rejection enforces `reviewer_id <> created_by`, even if the member creator has since become an admin. Existing pending admin-authored rows remain pending; their creator may cancel/recreate under the atomic path, but only a different current owner/admin may decide the existing submission.

- [ ] **Step 6: Refactor server actions around draft IDs**

Use:

```ts
export type EventDraftState = Readonly<{
  id: string;
  step: 1 | 2 | 3;
  values: EventDraftValues;
  savedAt: string;
}>;
```

Each step action saves then returns the authoritative draft. Finalization redirects to `/events/{eventId}?created=1`. Never place private address or coordinates in action-state errors, logs, URL state, or generic draft values.

- [ ] **Step 7: Run focused gates and regenerate types**

Run: `npm run db:reset && npm run test:db && npm run db:types && npm test -- features/events features/groups && npm run typecheck`
Expected: PASS.

- [ ] **Step 8: Local checkpoint**

Run: `git diff --check && git status --short`.

### Task 8: Implement Public-Address Search and Private Pin Selection

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Create: `supabase/migrations/20260830130000_public_address_cache.sql`
- Create: `supabase/tests/database/160_public_address_cache_test.sql`
- Create: `features/locations/types.ts`
- Create: `features/locations/schemas.ts`
- Create: `features/locations/provider.ts`
- Create: `features/locations/nominatim.ts`
- Create: `features/locations/nominatim.test.ts`
- Create: `features/locations/components/address-search.tsx`
- Create: `features/locations/components/address-search.test.tsx`
- Create: `features/locations/components/map-pin-picker.tsx`
- Create: `app/api/locations/search/route.ts`
- Create: `app/api/locations/search/route.test.ts`

**Interfaces:**
- Consumes: authenticated common/Fan actors, selected Israel city, public-only address input.
- Produces: `AddressSuggestion`, `searchPublicAddress()`, POST `/api/locations/search`, address confirmation, private browser-location/manual-pin selection, and OpenStreetMap attribution.

- [ ] **Step 1: Add the pinned map dependency**

Run: `npm install --save-exact maplibre-gl@6.6.0`
Expected: only `package.json` and `package-lock.json` dependency changes; inspect lifecycle output and do not approve unrelated scripts.

- [ ] **Step 2: Write provider and route tests with mocked fetch**

Use this public DTO:

```ts
export type AddressSuggestion = Readonly<{
  id: string;
  label: string;
  city: string;
  latitude: number;
  longitude: number;
}>;
```

Test query length/bounds, Israel country filtering, five-result limit, response Zod validation, timeout/upstream/429 mapping, cache hit, global rate claim, authentication, and rejection of any request marked `locationKind: "home"`.

- [ ] **Step 3: Run the focused tests and confirm failure**

Run: `npm test -- features/locations app/api/locations/search/route.test.ts`.

- [ ] **Step 4: Add server-only cache and rate claiming**

The migration creates a private/server-only public-address cache keyed by a SHA-256 digest of normalized query+city+country, with expiry and no user identity. A security-definer claim function returns a fresh cache hit or grants at most one upstream request per second globally. It rejects home/private mode. No address or coordinate enters the security audit metadata.

- [ ] **Step 5: Implement the provider adapter and POST route**

`PublicGeocoder.search(query, city)` is provider-neutral. The Nominatim implementation sends a deliberate submit-triggered request with `countrycodes=il`, bounded results, `format=jsonv2`, and a Huddle user agent. The route requires common-safety eligibility before consuming service quota, checks cache/rate claim, fetches only on a granted miss, validates, caches, and returns the DTO. The product path accepts only `venue`/`public_place`; Huddle cannot semantically classify maliciously mislabeled free text without an authoritative public-place source.

- [ ] **Step 6: Build accessible address and map controls**

Public mode provides input → Search → listbox selection → pin confirmation. Private mode provides protected address input plus **Use my current location** or pointer/keyboard pin movement; it never calls the public search route. It accepts only the reviewed active pilot-city slug selected from the database catalog, resolves the matching fixed camera center inside the Task 8 catalog, and fails closed for unsupported/inactive slugs rather than accepting caller coordinates or using a default. Exact browser/manual/keyboard points must remain within the conservative selected-city radius, move only a local marker, and never change the camera or tile viewport. A valid-city change or valid-to-unsupported transition remounts the city-scoped picker, clears the protected address/point and UI state, notifies the parent with `{ addressText: "", point: null }`, and destroys any delayed old-city controller without replay. Delayed browser-geolocation callbacks are scoped to the mounted city/request generation; unmount invalidates them and a later same-city request supersedes every earlier callback. The focusable labelled map explains its arrow-key interaction and includes a coordinate-free confirmation/recovery summary plus visible `© OpenStreetMap contributors` attribution.

- [ ] **Step 7: Run focused and policy gates**

Run: `npm run db:reset && npm run test:db && npm test -- features/locations app/api/locations/search/route.test.ts && npm run typecheck && npm run lint`
Expected: PASS and no sensitive values in captured output.

- [ ] **Step 8: Local checkpoint**

Run: `git diff --check && git status --short`.

### Task 9: Rebuild Fan Event Creation, Detail, and Invitations

**Files:**
- Create: `components/ui/dialog.tsx`
- Create: `components/ui/combobox.tsx`
- Create: `features/events/components/event-create-flow.tsx`
- Create: `features/events/components/fixture-combobox.tsx`
- Create: `features/events/components/event-place-step.tsx`
- Create: `features/events/components/event-review-step.tsx`
- Modify: `features/events/components/private-event-form.tsx`
- Modify: `features/events/components/event-card.tsx`
- Modify: `features/events/components/event-badges.tsx`
- Modify: `app/events/new/page.tsx`
- Modify: `app/events/[eventId]/page.tsx`
- Modify: `app/events/[eventId]/manage/page.tsx`
- Modify: `features/attendance/components/event-management-controls.tsx`
- Modify: `features/attendance/components/event-participation-controls.tsx`
- Modify: `features/attendance/actions.ts`
- Modify: `features/people/search.ts`
- Test: all corresponding colocated test files

**Interfaces:**
- Consumes: Task 7 drafts, Task 8 location controls, Task 5 People search, existing attendance/invitation RPCs.
- Produces: three-phase one-route creation, role-aware event detail, inline invitation picker, and immediate authoritative mutation state.

- [ ] **Step 1: Write component tests for the complete task**

Cover fixture typing/keyboard selection, phase progress, preserved answers, private/public location mode, Friends recovery action, review Edit links, publish redirect, host/invitee/pending/attendee/eligible role states, invitation selection, capacity explanation, dialog focus restoration, and canonical recovery from empty in-window high pages on the attendance inbox, event detail attendee list, and management queue.

- [ ] **Step 2: Run focused tests and confirm the old form fails**

Run: `npm test -- features/events features/attendance components/ui`.

- [ ] **Step 3: Implement the accessible shared controls**

The combobox uses input `role="combobox"`, `aria-expanded`, `aria-controls`, active descendant, listbox/options, Escape, arrows, Enter, and an empty state. The dialog wraps the repository Radix package and guarantees labelled title/description, focus trap, Escape/cancel, and trigger-focus restoration.

- [ ] **Step 4: Replace the monolithic form with one persisted flow**

Only one phase renders at a time on mobile; desktop keeps a compact progress rail without exposing all fields. Each Next/Back action saves the Task 7 draft. Fixture results prioritize follows and support text/date filtering. Review shows human-readable values only.

- [ ] **Step 5: Make event detail role-aware**

Derive one `EventViewerRole` on the server and map it to exactly one status and primary action. Link the authorized organizing group, venue, fixture, and public profile. Do not show Join to a host or management controls to an attendee.

- [ ] **Step 6: Embed the invitation picker**

Open from event detail/management without route navigation. Query friends/group members/recent authorized people first, allow name/handle search, show eligibility, prevent selecting more people than available places, and submit selected user IDs through the existing controlled invitation function.

- [ ] **Step 7: Fix mutation freshness**

After removal, approval, leave, invitation response, or cancellation, disable duplicate submission, await the controlled result, revalidate event/Home/My Huddle/attention paths, and render the new effective state without requiring reload.

- [ ] **Step 8: Run focused gates**

Run: `npm test -- components/ui features/events features/attendance features/people && npm run typecheck && npm run lint`
Expected: PASS.

- [ ] **Step 9: Local checkpoint**

Run: `git diff --check && git status --short`.

### Task 10: Simplify Groups into Overview, Tasks, and Settings

**Files:**
- Modify: `app/groups/new/page.tsx`
- Modify: `app/groups/[slug]/page.tsx`
- Modify: `app/groups/[slug]/manage/page.tsx`
- Modify: `features/groups/components/group-create-form.tsx`
- Modify: `features/groups/components/group-discovery-progress.tsx`
- Modify: `features/groups/components/group-management-controls.tsx`
- Create: `features/groups/components/group-share-dialog.tsx`
- Create: `features/groups/components/group-settings-form.tsx`
- Modify: `features/groups/detail.ts`
- Modify: `features/groups/management.ts`
- Modify: `features/groups/actions.ts`
- Test: existing group page/component tests and new component tests

**Interfaces:**
- Consumes: Task 5 attention, Task 7 group publication behavior, existing invite-link/application/member functions.
- Produces: concise group creation, honest visibility-specific sharing, action-first forming checklist, inline work, and one settings surface.

- [ ] **Step 1: Write group journey tests**

Assert creation redirects to the group; discoverable and unlisted copy promise only supported next actions; Share dialog copies/opens the correct authorized link; forming checklist uses action language; no lifecycle/synchronized/published-rule engineering copy; pending applications/submissions appear only when non-empty; no six navigation tabs; owner/admin event behavior is clear.

- [ ] **Step 2: Run focused tests and confirm failure**

Run: `npm test -- features/groups app/groups`.

- [ ] **Step 3: Make group creation concise and truthful**

Collect name, team, city, visibility, and short description. Before submit, explain discoverable application review versus unlisted invitation access. Redirect to `/groups/{slug}?created=1`.

- [ ] **Step 4: Replace readiness jargon with action rows**

Map database gate facts to user tasks such as **Invite 3 more members**, **Add one rule**, and **Publish one upcoming event**. Show Completed/Incomplete/Cannot start yet only where a real dependency exists.

- [ ] **Step 5: Replace dead invitation navigation**

Use a Share dialog on the group page. For discoverable groups, primary action copies/opens the application link; for unlisted groups, expose the existing invite-link flow and an inline registered-supporter picker if authorized. Never route to a page that says the action is unavailable.

- [ ] **Step 6: Collapse management**

Group overview surfaces current applications and member event submissions as attention rows. `/manage` becomes one settings page with Members, Rules, Visibility sections and anchor links, not query-string tabs. Bans remain a secondary authorized section with explicit state.

- [ ] **Step 7: Run focused gates**

Run: `npm test -- features/groups app/groups && npm run typecheck && npm run lint`
Expected: PASS.

- [ ] **Step 8: Local checkpoint**

Run: `git diff --check && git status --short`.

### Task 11: Build Venue Today, Calendar, Events, Profile, and Planner

**Files:**
- Modify: `app/venues/[slug]/workspace/layout.tsx`
- Modify: `app/venues/[slug]/workspace/page.tsx`
- Modify: `app/venues/[slug]/workspace/calendar/page.tsx`
- Create: `app/venues/[slug]/workspace/events/page.tsx`
- Create: `app/venues/[slug]/workspace/plan/page.tsx`
- Modify: `app/venues/[slug]/workspace/settings/page.tsx`
- Modify: `app/venues/[slug]/manage/page.tsx`
- Modify: `app/venues/[slug]/page.tsx`
- Create: `features/venues/workspace/components/today-dashboard.tsx`
- Create: `features/venues/workspace/components/venue-calendar.tsx`
- Create: `features/venues/workspace/components/fixture-planner.tsx`
- Create: `features/venues/workspace/components/venue-settings-form.tsx`
- Create: `features/venues/workspace/components/venue-space-editor.tsx`
- Modify: `features/events/components/venue-event-form.tsx`
- Modify: `features/venues/workspace/{queries,actions,schemas,types}.ts`
- Create: `supabase/migrations/20260830140000_venue_planner.sql`
- Create: `supabase/tests/database/170_venue_planner_test.sql`
- Test: colocated Venue workspace tests

**Interfaces:**
- Consumes: venue memberships/spaces/defaults and existing venue event transaction.
- Produces: `public.plan_venue_events(jsonb,text,uuid)`, Today dashboard, chronological calendar,
  status-filtered Events directory, two-phase multi-fixture planner, default-based venue events,
  and a public-preview link.

- [ ] **Step 1: Write venue component and database tests**

Cover active member authorization, Unverified visibility, Today next event/counts/attention, empty state, month/agenda switching, status legend, overlapping-area conflict, multi-select fixtures, inherited defaults, optional overrides, all-or-none batch creation, snapshot capacity, and non-member denial.

- [ ] **Step 2: Run focused tests and confirm missing surfaces fail**

Run: `npm run db:reset && npm run test:db && npm test -- features/venues app/venues`.

- [ ] **Step 3: Add workspace route authorization and chrome**

The layout resolves the venue slug, validates active membership server-side, and supplies Venue navigation. Unauthorized viewers receive the privacy-safe recovery state; public venue pages remain separate and never inherit workspace controls.

- [ ] **Step 4: Implement Today**

Query the next event, today's chronological events, confirmed/remaining/waiting counts, current venue attention, and setup tasks in one bounded server query. Render one primary **Plan events** action and direct task actions.

- [ ] **Step 5: Implement Calendar/Agenda**

Use Israel calendar dates while storing UTC. Month shows compact event chips; Agenda is the accessible list fallback and the mobile default. Filters use Draft/Published/Full/Cancelled/Completed without new routes.

- [ ] **Step 6: Implement the two-phase fixture planner**

Phase 1 selects fixtures and one active venue space each; same-space overlap is rejected inline. Phase 2 shows inherited venue name/address/house info, capacity snapshot, default joining policy, and only optional overrides. Submit a bounded JSON array to a transaction that creates all drafts/published events or none.

- [ ] **Step 7: Implement Venue settings/defaults**

Use Task 8 public-address search, manage named spaces/capacities, facilities, house information, joining default, and visible Unverified state. Changing defaults never changes existing published event snapshots.

- [ ] **Step 8: Retire the old repetitive venue-event form**

Redirect old `/manage` to workspace settings and route old single-event creation into the planner with an optional preselected fixture. Keep stable public venue/event URLs.

- [ ] **Step 9: Run focused gates**

Run: `npm run db:reset && npm run test:db && npm run db:types && npm test -- features/venues features/events/components/venue-event-form.test.tsx app/venues && npm run typecheck && npm run lint`
Expected: PASS.

- [ ] **Step 10: Local checkpoint**

Run: `git diff --check && git status --short`.

### Task 12: Repair Fixture Trust, Search, and Pagination

**Files:**
- Create: `supabase/migrations/20260830150000_fixture_coverage.sql`
- Create: `supabase/tests/database/180_fixture_coverage_test.sql`
- Modify: `features/sports/sync.ts`
- Modify: `features/sports/sync.test.ts`
- Modify: `features/sports/freshness.ts`
- Modify: `features/sports/freshness.test.ts`
- Modify: `features/sports/browse.ts`
- Modify: `features/sports/components/provider-freshness.tsx`
- Modify: `features/sports/components/fixture-pagination.tsx`
- Modify: `features/sports/components/fixture-pagination.test.tsx`
- Modify: `app/matches/page.tsx`
- Modify: `tests/fixtures/football-data/matches-success.json` only if the sanitized fixture must prove a season-spanning horizon

**Interfaces:**
- Consumes: local normalized catalog and sports sync run windows.
- Produces: independent `updatedAt` and `coverageThrough` values, truthful horizon copy, searchable fixture reuse, and deterministic pagination with explicit ellipses.

- [ ] **Step 1: Write coverage/freshness tests first**

Assert that a fresh run ending in October renders **Updated …** and **Fixtures available through 12 Oct**, never **Catalog current** as a completeness claim. Assert season-spanning input reaches May, failed sync preserves prior coverage, no-results differs from incomplete coverage, and pagination returns `1, 2, 3, ellipsis, N` rather than `1, 2, N` without explanation.

- [ ] **Step 2: Diagnose the current provider fixture horizon with saved data only**

Run the provider unit test against a saved response containing at least one October and one May fixture. Confirm `getSportsSyncWindow()` already requests through 31 May and isolate any loss to response normalization/upsert/query. Do not call the live provider from tests.

- [ ] **Step 3: Add the public coverage projection**

Return the maximum future `starts_at` from the last good local catalog alongside provider run freshness. Do not infer completeness beyond the observed maximum. Preserve the last successful coverage on a failed sync.

- [ ] **Step 4: Separate UI concepts**

Render two labelled lines: `Updated {relative time}` and `Fixtures available through {Israel date}`. If stale, say so; if coverage is short, say later fixtures are not yet available. Remove provider-storage/course commentary from the product surface.

- [ ] **Step 5: Reuse fixture search and verify pagination**

Use the Task 9 fixture combobox for creation/planning and keep public fixture filters accessible. Confirm ellipses, Previous/Next disabled states, sequential URLs, 44px targets, and focus/current-page semantics.

- [ ] **Step 6: Run focused gates**

Run: `npm run db:reset && npm run test:db && npm test -- features/sports app/matches && npm run typecheck`
Expected: PASS.

- [ ] **Step 7: Local checkpoint**

Run: `git diff --check && git status --short`.

### Task 13: Apply the Coherent Visual System and Finish Secondary Flows

**Files:**
- Modify: `app/globals.css`
- Modify: `components/ui/{button,card,badge,input,native-select,pagination,skeleton}.tsx`
- Modify: `components/states/{empty-state,error-state}.tsx`
- Modify: `app/settings/profile/page.tsx`
- Modify: `features/profiles/components/profile-form.tsx`
- Modify: `app/settings/interests/page.tsx`
- Modify: `features/subscriptions/components/follow-control.tsx`
- Modify: `app/reports/page.tsx`
- Modify: `features/safety/components/block-control.tsx`
- Modify: `features/friendships/components/friendship-control.tsx`
- Modify: `app/not-found.tsx`
- Modify: loading/error files under affected routes
- Test: corresponding existing and new component/page tests

**Interfaces:**
- Consumes: approved product sheet, simplified surfaces from Tasks 4–12.
- Produces: shared visual hierarchy, compact profile/interests/Safety flows, confirmation behavior, contextual recovery, and consistent copy/status vocabulary.

- [ ] **Step 1: Write visual-contract and secondary-flow tests**

Extend brand tests to check approved tokens, no raw scattered green hex values, 44px primary targets, and current nav treatment. Add component tests for routine profile editing without full rules text, rules reacceptance only on version change, interests search/Followed filter, friendship removal confirmation, Safety center label, and signed-out/private contextual recovery.

- [ ] **Step 2: Run focused tests and capture baseline failures**

Run: `npm test -- tests/brand components app/settings features/profiles features/subscriptions features/friendships features/safety app/not-found.test.tsx`.

- [ ] **Step 3: Implement shared spacing/type/card/action rules**

Use a readable 16px body baseline, three visible type levels, 22px cards, 14px fields, fully rounded search/filter controls, one hairline border, no nested card shells, and restrained green. Preserve Huddle dark palette and logo. Ensure 200% zoom/reflow and intermediate-width header behavior.

- [ ] **Step 4: Simplify profile and eligibility**

Routine profile edit includes display name, handle, city, and bio. Adult/rules eligibility is a compact saved status with a link/disclosure; the full rules reappear only when the current version changes.

- [ ] **Step 5: Simplify interests and Safety**

Interests provides search, Followed filter, suggested/popular sections, and no provider commentary. Rename all relevant navigation/copy to **Safety center** and keep Block/Report contextual.

- [ ] **Step 6: Add specific destructive confirmations and recovery states**

Friend removal explains visibility consequences before mutation. Missing/private routes keep non-disclosure while offering Sign in, Browse events, Open My Huddle, or safe back-to-object actions based on known local context, never object existence.

- [ ] **Step 7: Run the forbidden-copy and accessibility-focused gates**

Add a test that scans rendered product copy/source constants for `course MVP`, milestone codes such as `B09`, `provider-neutral identities`, `raw payloads`, `lifecycle synchronized`, and `Current lifecycle`. Run: `npm test -- tests/brand components app/settings features/profiles features/subscriptions features/friendships features/safety && npm run typecheck && npm run lint`.

- [ ] **Step 8: Local checkpoint**

Run: `git diff --check && git status --short`.

### Task 14: Build the Complete Two-Account Acceptance Journey

**Files:**
- Create: `tests/e2e/ux-redesign.spec.ts`
- Modify: `tests/e2e/auth.spec.ts`
- Modify: `tests/production/smoke.spec.ts`
- Modify: `playwright.config.ts` only if projects require explicit 1280/768/375 viewport entries
- Create: `docs/evidence/ux-redesign/desktop-1280.png`
- Create: `docs/evidence/ux-redesign/tablet-768.png`
- Create: `docs/evidence/ux-redesign/mobile-375.png`
- Modify: `docs/evidence/ux-redesign/README.md`

**Interfaces:**
- Consumes: all implemented runtime slices.
- Produces: deterministic browser evidence for every user journey and final F01–F40 closure mapping.

- [ ] **Step 1: Define deterministic identities and cleanup-safe test data**

Generate unique handles/titles from Playwright worker/test IDs. Never rely on static `Target Fan` text or randomized values in committed screenshots. Seed/clean through existing local test helpers and retain database history without polluting selectors. Every invitation fixture must name an actor who could validly manage the event when the invitation was issued, or explicitly model and assert the later loss of that authority.

- [ ] **Step 2: Write the failing Fan first-run journey**

At 1280, 768, and 375 widths: verify email callback session, Fan onboarding/cities, exact five-item navigation, Home/My Huddle distinction, interests, Explore, People discovery, friend request/acceptance, group create/share/apply/accept, Fan event draft refresh, publish, invite picker, attendance, removal current-state cleanup, and History behavior.

- [ ] **Step 3: Write the failing Venue journey**

With the same login: enable Venue, confirm workspace separation/Unverified status, address search mock and pin, spaces/defaults, Today, Calendar, Events directory, multi-fixture draft/publish, public venue/event view, workspace switch back, and owner-event exclusion from Fan Explore.

- [ ] **Step 4: Write resilience/accessibility assertions**

Test keyboard navigation, combobox, dialogs, focus restoration, `aria-current`, 44px target measurements, no horizontal overflow, back/refresh restoration, empty/error/loading states, safe 404 recovery, no console errors, and People search with composed/decomposed accented Latin plus Hebrew names.

- [ ] **Step 5: Expand production smoke read-only coverage**

The smoke suite must visit `/`, `/discover`, `/dashboard`, `/people`, fixtures, and one configured Venue workspace route. It must assert safe content only and perform no create/update/delete action.

- [ ] **Step 6: Run the complete local browser suite**

Run: `npm run test:e2e`
Expected: every journey passes without retries or tracked screenshot churn.

- [ ] **Step 7: Capture and record evidence**

Capture stable overview screenshots at the three required widths after assertions pass. Update each F01–F40 ledger row with the exact test name/command and applicable screenshot. Do not mark a row closed from visual appearance alone when it requires authorization/data evidence.

- [ ] **Step 8: Local checkpoint**

Run: `git diff --check && git status --short`.

### Task 15: Full Acceptance and the Finite UX Audit Loop

**Files:**
- Modify: `docs/evidence/ux-redesign/README.md`
- Modify: `docs/UX-AUDIT-PRODUCTION-2026-08-29.md` only by adding a dated local-redesign verification appendix; preserve the original production findings.
- Modify: `docs/submission/TRACEABILITY.md`
- Modify: `docs/submission/TEST-PLAN.md`
- Modify: `docs/operations/PRODUCTION-ACCEPTANCE.md`
- Modify: `README.md` only with truthful current status/counts.

**Interfaces:**
- Consumes: all tasks and evidence.
- Produces: a clean local release candidate with every scoped finding closed and no authorization to publish yet.

- [ ] **Step 1: Run the complete repository acceptance gate**

Run: `npm run test:acceptance`
Expected: clean install, formatting, lint, typecheck, coverage, database reset/lint/pgTAP, generated type check, production build, all Playwright journeys, security audit, and diff hygiene pass.

- [ ] **Step 2: Perform a fresh two-account UX audit at 1280px**

Use the UX-audit skill against the local production build. Start from signup/first-run and traverse Home, Explore, My Huddle, People, group, Fan event, Venue onboarding, Today, Calendar, planner, public object pages, Account, interests, and Safety. Record click count, confusion, recovery, and whether each action completes where it starts.

- [ ] **Step 3: Repeat at 768px and 375px**

Verify navigation stability, reflow, target size, overlays, scroll, keyboard paths, and interrupted workflows. Use both accounts for cross-account requests/invitations/removal.

- [ ] **Step 4: Apply the loop decision rule**

Continue implementation when any of these is true:

```text
an F01-F40 row lacks passing evidence
OR a documented finding recurs
OR a new defect blocks/confuses an approved onboarding, discovery, people,
   group, event, My Huddle, or Venue journey
OR any privacy, authorization, data-integrity, accessibility, loading,
   empty, error, or recovery state fails
OR npm run test:acceptance is not fully green
```

Do not extend the goal for unrelated enhancement ideas such as payments, chat, media uploads, advanced analytics, or additional sports.

- [ ] **Step 5: Fix each loop finding test-first**

For every finding, reproduce it with the smallest applicable pgTAP/Vitest/Playwright test, observe failure, implement the smallest coherent correction, rerun the focused test, then rerun the affected journey at all three widths. Update the evidence ledger with the result.

Task 15's single correction pass includes the user-approved addendum in the design specification:

- persist incomplete Fan and Venue onboarding input across refresh and history navigation;
- default My Huddle to the upcoming/current plan rather than an empty Hosting bucket;
- make attention links land on the intended People section after asynchronous navigation;
- align the Account workspace menu to its trigger;
- replace the date-plus-catalog fixture combobox with a bounded grouped fixture picker that searches
  the full local horizon without asking for duplicate date input;
- add Venue-only `open_door` and `reservations` attendance modes through migration, constraints,
  controlled functions, generated types, server adapters, mode-aware management, and pgTAP/E2E;
- project public Venue/place coordinates through a dedicated privacy-safe discovery RPC and render
  a real attributed list-plus-map Explore surface without exposing home locations;
- collapse Explore's duplicated inline refine panel into one compact summary and focused modal with
  only real city, distance, date, competition, and team controls;
- keep the full Huddle wordmark left and workspace identity right in both shells, move Plan events
  into Venue page content, and provide a dedicated Events directory;
- apply the supplied Huddle Product screen composition to Home, Explore, event detail, and Venue
  planning at 1280, 768, and 375 px without fake map/media controls.

Run focused red/green tests while applying this one correction wave. Run the complete acceptance
suite once after the wave, followed by one clean two-account/three-viewport re-audit. No additional
cosmetic loop follows; non-blocking polish is recorded separately.

- [ ] **Step 6: Re-run full acceptance after the final correction**

Run: `npm run test:acceptance`
Expected: PASS from a clean working tree with no flaky rerun and no screenshot drift.

- [ ] **Step 7: Verify the finite stop condition**

Stop the loop only when all are true:

```text
40 of 40 F01-F40 rows are closed with evidence
AND npm run test:acceptance passes
AND the fresh 1280/768/375 two-account audit has no unresolved scoped finding
AND source documents, migrations, generated types, tests, and runtime agree
AND no secret, exact private location, or unrelated artifact appears in the diff
```

- [ ] **Step 8: Update truthful final documentation**

Record exact current test/migration/assertion counts from command output. Do not claim hosted migration, production deployment, or production audit success; those remain a separate explicitly authorized phase.

- [ ] **Step 9: Local completion checkpoint**

Run: `git status --short && git diff --check && git diff --stat`
Expected: only intentional redesign files, no secret/environment values, no commit.

## Execution Order and Review Gates

Execute Tasks 1–3 first because they define the product and authorization foundation. Execute Task 8 next so public-address and private-pin controls exist before first-run Venue onboarding. Then execute Task 4, followed by Tasks 5–7 for current state, discovery, and drafts. Execute Tasks 9–13 as coherent vertical product slices, running their focused database and UI gates after each. Tasks 14–15 are the integrated acceptance and repeated-audit loop.

At the end of each task, review the complete local diff for that task's files before continuing. Do not create intermediate commits under this plan; publication and reciprocal review remain governed by `$huddle-publish-pr` after the user separately authorizes them.
