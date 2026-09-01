# Cityless Location Model Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Subagent dispatch is disabled for this run. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove city as a selected or eligibility concept, make events and venues coordinate/address based, make groups globally discoverable by membership size, and prove the provider-crest path works through a green Vercel pull-request preview.

**Architecture:** Keep the existing Next.js/Supabase modular monolith and PR #43 location-origin foundation. One ordered forward migration removes active city dependencies, replaces affected security-definer RPC signatures, and preserves all existing product objects. A city-independent Photon adapter feeds one reusable address combobox; Explore submits an ephemeral coordinate origin, while public and protected event location storage remain separated by the existing RLS/audit boundary.

**Tech Stack:** Next.js 16 App Router, React 19, strict TypeScript, Tailwind CSS 4, Radix/shadcn components, Zod 4, TanStack Query for discovery, Supabase PostgreSQL/PostGIS/RLS, football-data.org scheduled synchronization, Vitest/RTL, pgTAP, Playwright, GitHub Actions, Vercel.

**Spec:** `docs/superpowers/specs/2026-08-31-cityless-location-model-design.md`

## Global Constraints

- No active UI asks for or displays a standalone city; a municipality may appear only inside a geocoder-provided formatted address.
- Profiles and groups have no location. Events and venues use confirmed coordinates and formatted addresses.
- Explore origins are current browser coordinates or an autocompleted Israel address and never enter the URL, profile, analytics, or logs.
- Exact home address/coordinate storage remains limited to `event_private_locations`; direct reads stay denied and every authorized read remains audited and revocable.
- The approved private-home search path may call Photon, but it persists no query, result, address, or coordinate outside the final protected event write.
- Private people remain limited to `group`, `friends`, or `invite_only`; venues remain limited to `public` or `team_followers`.
- Discoverable groups are global and immediately searchable; unlisted groups remain invitation/link only.
- Group search orders by active-member count descending, normalized name ascending, and ID ascending using the same keyset cursor.
- Normal page requests never call football-data.org; synchronized HTTPS crest URLs render through the shared team mark with initials fallback.
- Existing attendance, one-account-one-seat, capacity, block, suspension, moderation, invitation, and history-retention invariants remain unchanged.
- Write a failing behavioral test and observe the intended failure before each production behavior change.
- Run focused tests during implementation and the complete acceptance gate once after integration.
- Preserve existing records and historical evidence. Do not mutate production Supabase or merge the writer's own pull request.

## Planned File Map

### Database and types

- Create `supabase/migrations/20260831210000_cityless_location_model.sql` for cityless columns, controlled functions, group ordering/lifecycle, ephemeral geocode quota, and discovery projections.
- Create `supabase/tests/database/260_cityless_location_model_test.sql` for schema, RLS, global groups, distance discovery, protected locations, legacy preservation, and function-grant coverage.
- Modify `types/database.generated.ts` only through `npm run db:types` after the migration stabilizes.

### Location and discovery

- Modify `features/locations/{types,schemas,provider,photon,nominatim}.ts`.
- Modify `features/locations/components/{address-search,map-pin-picker}.tsx` and their tests.
- Modify `app/api/locations/search/route.ts` and `route.test.ts`.
- Modify `features/discovery/{catalog,schemas,query,types,cursor}.ts`, their tests, `features/discovery/components/{discovery-filters,discovery-feed,discovery-event-card,discovery-map}.tsx`, and `app/{discover/page.tsx,api/discovery/route.ts}` with tests.

### Profiles, groups, events, venues, and projections

- Modify `features/profiles/{schemas,actions,state,dto,viewer}.ts`, `features/profiles/components/profile-form.tsx`, onboarding/settings pages, and tests.
- Modify `features/auth/actor.ts` plus friendship/subscription/group viewer completion checks and tests.
- Modify `features/groups/{schemas,search-schemas,search,actions,detail,discovery,viewer}.ts`, group components/pages, and tests.
- Modify `features/events/{schemas,state,drafts,actions,queries}.ts`, event creation/detail/list components/pages, and tests.
- Modify `features/venues/{schemas,actions,queries,viewer}.ts`, `features/venues/workspace/{schemas,actions,queries,types}.ts`, venue forms/pages, and tests.
- Modify attendance, people, home, My Huddle, and event-history projections/components that currently require or display city.

### Evidence and documentation

- Create `tests/e2e/cityless-location.spec.ts` and `docs/evidence/cityless-location/ACCEPTANCE.md`.
- Modify `docs/HUDDLE-{IMPLEMENTATION-SPEC,ARCHITECTURE,STEP-BY-STEP-BUILD-SPEC}.md`, `README.md`, `docs/submission/{TEST-PLAN,TRACEABILITY}.md`, and relevant operational notes.

---

### Task 1: Cityless database contract and global groups

**Files:**
- Create: `supabase/tests/database/260_cityless_location_model_test.sql`
- Create: `supabase/migrations/20260831210000_cityless_location_model.sql`
- Modify: `types/database.generated.ts`

**Interfaces:**
- Produces: cityless public tables/projections and these controlled signatures:
  - `activate_fan_workspace(text,text,text,boolean,integer,uuid default null)`
  - `create_group(text,text,uuid,text,text,uuid default null)`
  - `suggest_similar_groups(text,uuid,integer default 5)`
  - `search_groups(text,uuid,bigint,text,uuid,integer default 20)`
  - cityless venue/event create/update functions retaining their existing non-city arguments
  - `claim_ephemeral_location_search(text)` returning `claim_granted boolean`
  - `discover_events(double precision,double precision,integer,timestamptz,timestamptz,uuid,uuid,uuid,text,integer)` without city ID
- Consumers: Tasks 2–6 application actions and queries.

- [ ] **Step 1: Write failing pgTAP assertions**

Add assertions equivalent to:

```sql
select hasnt_column('public', 'profiles', 'city_id');
select hasnt_column('public', 'groups', 'city_id');
select hasnt_column('public', 'venues', 'city_id');
select hasnt_column('public', 'events', 'city_id');
select hasnt_table('public', 'cities');
select function_returns('public', 'claim_ephemeral_location_search', array['text'], 'TABLE(claim_granted boolean)');
```

Create two discoverable groups with different active-member counts and assert `search_groups` returns the larger first. Assert a newly created discoverable group is `active` and searchable immediately. Assert an unlisted group is absent. Snapshot legacy object IDs before migration setup and assert the objects still exist after the new contract.

- [ ] **Step 2: Run the database test and observe the contract failure**

Run:

```bash
fnm exec --using=24.19.0 npm run db:start
fnm exec --using=24.19.0 npm run db:reset
fnm exec --using=24.19.0 npx supabase test db --local supabase/tests/database/260_cityless_location_model_test.sql
```

Expected: FAIL because city columns/functions still exist and the new migration/function signatures do not.

- [ ] **Step 3: Implement the ordered forward migration**

In one transaction:

1. Recreate every dependent view/function without city fields or parameters.
2. Set existing discoverable non-archived groups to `active`; create new discoverable groups as `active`.
3. Replace group search with count-descending keyset pagination:

```sql
order by active_member_count desc, lower(group_name), group_id
```

and continuation predicate:

```sql
active_member_count < input_after_member_count
or (active_member_count = input_after_member_count and lower(group_name) > input_after_name)
or (active_member_count = input_after_member_count and lower(group_name) = input_after_name and group_id > input_after_id)
```

4. Add `private.location_search_rate_limits(actor_id, window_started_at, request_count)` with forced RLS/no client grants and `claim_ephemeral_location_search(input_purpose text)` accepting only `origin` and `private_home`, recording no submitted text or coordinates.
5. Drop city foreign keys/indexes/columns and finally `public.cities` after all dependencies are gone.
6. Revoke old overloads, grant only the new signatures to `authenticated`/`anon` where the previous boundary allowed them, and preserve fixed empty search paths.

- [ ] **Step 4: Reset, lint, test, and regenerate types**

Run:

```bash
fnm exec --using=24.19.0 npm run db:reset
fnm exec --using=24.19.0 npm run db:lint
fnm exec --using=24.19.0 npm run test:db
fnm exec --using=24.19.0 npm run db:types
fnm exec --using=24.19.0 npm run db:types:check
```

Expected: all existing and new pgTAP assertions pass; generated types contain no active `cities` table or domain `city_id` fields.

- [ ] **Step 5: Record the local checkpoint**

Run `git diff --check`; do not push.

### Task 2: Cityless profile completion and projections

**Files:**
- Modify: `features/profiles/{schemas,actions,state,dto,viewer}.ts`
- Modify: `features/profiles/components/profile-form.tsx`
- Modify: `features/auth/actor.ts`
- Modify: `app/onboarding/fan/page.tsx`
- Modify: `app/settings/profile/page.tsx`
- Modify: `app/people/[handle]/page.tsx`
- Modify: `features/{friendships/list,groups/viewer,subscriptions/viewer}.ts`
- Test: colocated tests and affected page tests.

**Interfaces:**
- Produces: `fanWorkspaceInputSchema` with `{handle, displayName, bio, adultAttested, rulesAccepted, rulesVersion}` and completed-actor checks independent of city.
- Consumes: Task 1 `activate_fan_workspace` signature.

- [ ] **Step 1: Make profile tests express the cityless contract**

Remove `citySlug` from valid fixtures. Add:

```tsx
expect(screen.queryByRole("combobox", { name: /city/i })).not.toBeInTheDocument();
```

Assert the action RPC call omits `input_city_slug`, and an otherwise complete profile with no former city field passes `requireActor("common")`/`requireActor("fan")` as appropriate.

- [ ] **Step 2: Run focused tests and observe failures**

Run:

```bash
fnm exec --using=24.19.0 npx vitest run features/profiles app/onboarding/fan app/settings/profile features/auth features/friendships features/subscriptions
```

Expected: FAIL on required city schema/UI/RPC arguments and completion checks.

- [ ] **Step 3: Remove city from profile runtime**

Delete `citySlugSchema`, `citySlug` form state/controls, catalog reads, and city DTO fields. Change the action call to:

```ts
supabase.rpc("activate_fan_workspace", {
  input_handle: parsed.data.handle,
  input_display_name: parsed.data.displayName,
  input_bio: parsed.data.bio,
  input_adult_attested: parsed.data.adultAttested,
  input_rules_version: parsed.data.rulesVersion,
});
```

Make completed actor checks depend on handle/display name, common safety fields, completion timestamp, enabled workspace, and suspension/restriction state only.

- [ ] **Step 4: Run focused tests**

Run the Step 2 command. Expected: PASS.

### Task 3: City-independent autocomplete and map selection

**Files:**
- Modify: `features/locations/{types,schemas,provider,photon,nominatim}.ts`
- Modify: `features/locations/components/{address-search,map-pin-picker}.tsx`
- Modify: `app/api/locations/search/route.ts`
- Test: corresponding unit/component/route tests.

**Interfaces:**
- Produces:

```ts
type LocationSearchPurpose = "origin" | "public_address" | "private_home";
type AddressSuggestion = {
  id: string;
  label: string;
  latitude: number;
  longitude: number;
};
interface Geocoder {
  search(query: string): Promise<readonly AddressSuggestion[]>;
}
```

- Consumes: Task 1 public cache claim for `public_address` and ephemeral claim for `origin`/`private_home`.

- [ ] **Step 1: Write failing provider, route, and combobox tests**

Assert Photon receives `q=<typed query>, Israel` without a selected city. Assert route input is exactly `{query,purpose}`. Assert `private_home` succeeds through the ephemeral claim and never invokes `store_public_address_search`. Render `AddressSearch` without a `city` prop and verify arrow/enter selection plus edit invalidation.

- [ ] **Step 2: Run focused tests and observe failures**

Run:

```bash
fnm exec --using=24.19.0 npx vitest run features/locations app/api/locations/search
```

- [ ] **Step 3: Implement the minimal shared location contract**

Remove city input/validation/output fallback. Keep Israel bounds, five-result maximum, timeout, country filtering, accessible listbox behavior, no-store headers, and safe structured logging. Route cache behavior must be:

```ts
if (input.purpose === "public_address") {
  // bounded digest/cache claim and store
} else {
  // claim_ephemeral_location_search; provider call; never persist response
}
```

Refactor `MapPinPicker` to accept an optional initial point and Israel bounds rather than `citySlug`; selecting current location or a map point returns a coordinate and never exposes latitude/longitude text inputs.

- [ ] **Step 4: Run focused tests**

Run the Step 2 command. Expected: PASS.

### Task 4: Address-first event and venue creation

**Files:**
- Modify: `features/events/{schemas,state,drafts,actions}.ts`
- Modify: `features/events/components/{event-create-flow,event-place-step,event-review-step}.tsx`
- Modify: `features/venues/{schemas,actions}.ts`
- Modify: `features/workspaces/{schemas,actions}.ts`
- Modify: `features/workspaces/components/venue-onboarding-form.tsx`
- Modify: `features/venues/components/venue-form.tsx`
- Modify: `features/venues/workspace/{schemas,actions}.ts`
- Modify: `features/venues/workspace/components/venue-settings-form.tsx`
- Test: affected schema/action/component tests.

**Interfaces:**
- Produces confirmed `{label,longitude,latitude}` public/private location submissions and no `cityId`.
- Consumes: Tasks 1 and 3 cityless RPC/geocoder contracts.

- [ ] **Step 1: Write failing event and venue tests**

Assert no City control exists. For home and public-place flows, select a mocked autocomplete suggestion and assert the action receives its label/point. Edit the text and assert review/publish disables until reconfirmed. Assert a venue event RPC receives no city and inherits the stored venue point.

- [ ] **Step 2: Run focused tests and observe failures**

Run:

```bash
fnm exec --using=24.19.0 npx vitest run features/events features/venues features/workspaces
```

- [ ] **Step 3: Replace city and free-text location state**

Remove `cityId` from draft/schema/action state. Use `AddressSearch purpose="private_home"` for home and `purpose="public_address"` for public place/venue. Keep exact home values in the protected draft/location mutation only. Venue events read the venue address/point server-side and submit no location fields from the client.

- [ ] **Step 4: Run focused tests**

Run the Step 2 command. Expected: PASS.

### Task 5: Coordinate-only Explore and catalog-wide dates

**Files:**
- Modify: `features/discovery/{catalog,schemas,query,types,cursor}.ts`
- Modify: `features/discovery/components/{discovery-filters,discovery-feed,discovery-event-card,discovery-map}.tsx`
- Modify: `app/discover/page.tsx`
- Modify: `app/api/discovery/route.ts`
- Test: affected discovery/page/route tests.

**Interfaces:**
- Produces: `DiscoveryFilters` without `citySlug`; server discovery requires a validated coordinate pair for distance results and retains radius/date/team/competition/match/cursor/limit.
- Consumes: Task 1 `discover_events` and Task 3 origin autocomplete.

- [ ] **Step 1: Write failing cityless Explore tests**

Assert parser input and generated URLs contain no `city`. Assert current location/manual origin are sent only in private `POST` bodies. Assert a range from `2026-08-31` through `2026-10-21` succeeds. Assert creator-owned eligible events remain present. Assert event DTOs contain formatted public address or protected-location copy, not `cityName`.

- [ ] **Step 2: Run focused tests and observe failures**

Run:

```bash
fnm exec --using=24.19.0 npx vitest run features/discovery app/discover app/api/discovery
```

- [ ] **Step 3: Implement coordinate-only discovery**

Remove city catalog/profile fallback and city URL/reset behavior. The initial page renders an origin prompt when the session has none; non-location fixture/group navigation remains usable. Date validation enforces valid ISO dates, `to >= from`, and local catalog coverage rather than an elapsed-day maximum. Keep cursor filter keys tied to radius/date/team/competition/match and the server-held origin.

- [ ] **Step 4: Run focused tests**

Run the Step 2 command. Expected: PASS.

### Task 6: Groups without geography or forming residue

**Files:**
- Modify: `features/groups/{schemas,search-schemas,search,actions,detail,discovery,viewer}.ts`
- Modify: `features/groups/components/{group-create-form,group-search-filters,group-card,group-discovery-progress,group-settings-form}.tsx`
- Modify: `app/groups/page.tsx`
- Modify: `app/groups/[slug]/page.tsx`
- Modify: My Huddle group projection/components.
- Test: affected group tests and pages.

**Interfaces:**
- Produces: group create input `{name,slug,teamId,visibility,description}` and search filters `{query,teamId,cursor,limit}` with count-descending cursor.
- Consumes: Task 1 group RPCs.

- [ ] **Step 1: Write failing group tests**

Assert creation/search/settings contain no city/home-area control or metadata. Assert a new discoverable group is searchable immediately. Assert default results are `12 members`, `4 members`, `1 member` regardless of name. Assert unlisted groups remain excluded and optional team filtering still works.

- [ ] **Step 2: Run focused tests and observe failures**

Run:

```bash
fnm exec --using=24.19.0 npx vitest run features/groups app/groups app/dashboard
```

- [ ] **Step 3: Remove geography and readiness UI**

Delete city IDs/names, home-area labels, locality hints, and `forming` progress controls from ordinary group flows. Keep archived/suspended management, block/ban boundaries, active-member counts, invitations, links, and optional team association. Parse/encode cursor values as `{memberCount,name,id}`.

- [ ] **Step 4: Run focused tests**

Run the Step 2 command. Expected: PASS.

### Task 7: Remove residual city copy, verify crests, and reconcile sources

**Files:**
- Modify: remaining files returned by `rg` under `app/`, `features/`, and `components/`.
- Modify: normative/public/submission documentation listed in the file map.
- Test: impacted page/query/component tests.

**Interfaces:**
- Produces: no active city dependency; truthful crest rollout requirements and shared `TeamMark` use.
- Consumes: Tasks 1–6.

- [ ] **Step 1: Create the residue assertion**

Run and save the candidate inventory:

```bash
rg -n 'citySlug|city_id|city_name|Choose.*city|Home area|profile city|city fallback' app features components
```

Classify timezone/provider response property names separately; every active domain/UI hit must be removed or replaced.

- [ ] **Step 2: Add/adjust failing projection and crest tests**

Remove city fields from people, friendship, attendance, event list/detail, venue, dashboard, and home fixtures. Assert shared team surfaces render a provider crest URL and expose initials when the image is absent or errors.

- [ ] **Step 3: Reconcile runtime and documentation**

Update all current normative statements identified in design §5. Preserve historical counts/accepted behavior as historical. Document that hosted crest visibility requires the committed crest migration plus one protected synchronization run.

- [ ] **Step 4: Run focused repository gates**

Run:

```bash
fnm exec --using=24.19.0 npm run format
fnm exec --using=24.19.0 npm run lint
fnm exec --using=24.19.0 npm run typecheck
fnm exec --using=24.19.0 npm run build:local
fnm exec --using=24.19.0 npm run security:audit
git diff --check
```

Expected: PASS and no unsafe active city residue.

### Task 8: Browser acceptance, self-audit, and publication

**Files:**
- Create: `tests/e2e/cityless-location.spec.ts`
- Create: `docs/evidence/cityless-location/ACCEPTANCE.md`
- Modify: production smoke only if its current non-mutating coverage requires city removal.

**Interfaces:**
- Produces: exact-head acceptance evidence, one coherent commit series, reciprocal-review PR, and green Vercel Preview.

- [ ] **Step 1: Write and run the new browser journeys**

Implement the ten journeys from design §6.3 using deterministic generated handles and sanitized fixture data. Run at 1280px, 768px, and 375px through the repository's local Supabase wrapper.

- [ ] **Step 2: Run the complete acceptance suite once**

Run:

```bash
fnm exec --using=24.19.0 npm run test:acceptance
```

Record exact current totals and failures. Fix only contract, security/privacy/data-integrity, acceptance, or Important/Critical UX defects, then rerun the failed focused gate and finally the complete suite once clean.

- [ ] **Step 3: Perform the acceptance-criteria self-audit**

In `docs/evidence/cityless-location/ACCEPTANCE.md`, map every design §6 criterion to file/line evidence and current command output. Include:

```text
No visible city selector
Coordinate/address origins
Address suggestion confirmation
Protected home persistence and revocation
Coordinate-ranked Explore
Catalog-spanning dates
Global member-count group ordering
Unlisted exclusion
Provider crest plus fallback
Legacy object preservation
```

Run secrets/private-location/debug/generated-junk scans and `git diff origin/main...HEAD --check`.

- [ ] **Step 4: Commit the verified implementation**

Stage only scoped files. Verify primary author `Guy Azene <azene.guy@gmail.com>`, `.githooks`, and exactly one Ohad co-author trailer on each new commit.

- [ ] **Step 5: Publish one issue and pull request**

Push `codex/cityless-location-model`, create the bounded implementation issue if none exists, and open one PR into `main` that closes it. Include schema/safety decisions, exact acceptance evidence, limitations, and reciprocal review pending. Request `ohadsho`.

- [ ] **Step 6: Require green exact-head checks**

Inspect GitHub Actions and Vercel at the pushed head. If Vercel fails, inspect its exact deployment logs, fix the branch, rerun local relevant gates, push, and wait again. Stop only when Repository gates and Vercel are `SUCCESS`, or report a genuinely external blocker without touching production.
