# Mobile Ask Huddle and Workspace Navigation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move assisted discovery into an ephemeral Ask Huddle conversation page, correct mobile navigation/workspace behavior, automatically resolve named public areas, and reserve the 14-day default for truly date-free queries.

**Architecture:** The existing authenticated assisted-discovery route remains the only transport and Supabase remains the authorization/ranking boundary. A deterministic local date parser and injected public-origin resolver enrich the existing service before database search. The responsive shell exposes a shared workspace switcher and route-aware navigation, while a repository-owned shadcn conversation surface presents only the current one-shot exchange.

**Tech Stack:** Next.js App Router, React 19, strict TypeScript, Tailwind CSS, repository-owned shadcn/Radix components, `@shadcn/react@0.3.1`, Zod, Cloudflare Workers AI, Supabase/PostGIS, Vitest/RTL, Playwright.

**Spec:** `docs/superpowers/specs/2026-09-02-mobile-ask-workspace-navigation-design.md`

**Implementation status:** Complete and locally verified on 2 September 2026. `npm run test:acceptance` passes 943 Vitest assertions plus the skipped opt-in live test, 1,681 pgTAP assertions, the production build, all 32 Playwright journeys, the secret audit, and diff hygiene. The result is ready for reciprocal partner review; Git and GitHub remain the authority for its publication state.

## Global Constraints

- Use `Asia/Jerusalem` for deterministic calendar math.
- Keep Cloudflare input limited to the current sentence and current Israel time; never send identity, relationships, coordinates, events, or results.
- Keep Supabase as the sole authorization, visibility, filtering, and ranking boundary.
- Return no more than three safe result cards and never expose an exact home location.
- Keep raw queries, place names, actor IDs, coordinates, and provider payloads out of logs and persistence.
- Do not add chat history, streaming, the AI SDK, an agent, tools, RAG, or another state library.
- Use the 14-day default only when the query has no recognizable date intent.
- Do not commit, push, publish, deploy, or mutate hosted services without a separate current user instruction.

---

### Task 1: Deterministic natural-date resolution

**Files:**
- Create: `features/assisted-discovery/query-date.ts`
- Create: `features/assisted-discovery/query-date.test.ts`
- Modify: `features/assisted-discovery/date-range.ts`
- Modify: `features/assisted-discovery/date-range.test.ts`
- Modify: `features/assisted-discovery/service.ts`
- Modify: `features/assisted-discovery/service.test.ts`
- Modify: `features/assisted-discovery/evaluation-corpus.ts`
- Modify: `features/assisted-discovery/evaluation-corpus.test.ts`
- Modify: `features/assisted-discovery/live-evaluation.manual.test.ts`

**Interfaces:**
- Produces: `resolveQueryDateRange(query: string, now: Date): QueryDateRangeResult` where the result is `absent`, `resolved`, or `invalid` with the existing date-failure reasons.
- Changes: `resolveIntentDateRange(input, now, query?)` so callers may ground date resolution in the current sentence.
- Preserves: existing `IntentDraft` and Cloudflare structured-output schema.

- [ ] **Step 1: Write failing parser tests**

Cover the approved semantics directly:

```ts
expect(resolveQueryDateRange("anything in October", now)).toEqual({
  kind: "resolved",
  fromDate: "2026-10-01",
  toDate: "2026-10-31",
})
expect(resolveQueryDateRange("anything on 5 October", now)).toEqual({
  kind: "resolved",
  fromDate: "2026-10-05",
  toDate: "2026-10-05",
})
expect(resolveQueryDateRange("anything Wednesday", wednesday)).toEqual({
  kind: "resolved",
  fromDate: "2026-09-02",
  toDate: "2026-09-02",
})
expect(resolveQueryDateRange("anything next Wednesday", wednesday)).toEqual({
  kind: "resolved",
  fromDate: "2026-09-09",
  toDate: "2026-09-09",
})
```

Also cover current-month clamping, omitted-year rollover, explicit year, ISO date, invalid day/month, past explicit date, and recognizable unresolved date language.

- [ ] **Step 2: Run the focused tests and confirm RED**

Run:

```bash
npx vitest run features/assisted-discovery/query-date.test.ts features/assisted-discovery/date-range.test.ts
```

Expected: failure because `query-date.ts` and query-aware fallback behavior do not exist.

- [ ] **Step 3: Implement the local parser and date-range integration**

Implement English month aliases, weekday aliases, single-date parsing, future-month selection, and calendar validation with UTC date arithmetic over Israel-local date strings. Explicit provider ranges remain bounded by 31 calendar dates. Return `invalid` rather than `absent` when recognizable date syntax is malformed.

- [ ] **Step 4: Add a service regression test for the reported query**

Use a fake draft with `temporal: "unspecified"` and query `anything in jerusalem in october`; assert that database search receives `2026-10-01` through `2026-10-31`, never `2026-09-02` through `2026-09-16`.

- [ ] **Step 5: Update evaluation coverage and run GREEN**

Add synthetic month, single-date, bare-weekday, invalid-date, and truly date-free cases. Pass each corpus query into `resolveIntentDateRange`. Run:

```bash
npx vitest run features/assisted-discovery/query-date.test.ts features/assisted-discovery/date-range.test.ts features/assisted-discovery/service.test.ts features/assisted-discovery/evaluation-corpus.test.ts
```

Expected: all focused tests pass.

---

### Task 2: Automatic named-place resolution

**Files:**
- Modify: `features/assisted-discovery/contracts.ts`
- Modify: `features/assisted-discovery/copy.ts`
- Modify: `features/assisted-discovery/service.ts`
- Modify: `features/assisted-discovery/service.test.ts`
- Modify: `app/api/assisted-discovery/route.ts`
- Modify: `app/api/assisted-discovery/route.test.ts`

**Interfaces:**
- Produces: `ResolvedNamedOrigin = { origin: AssistedDiscoveryOrigin; label: string }`.
- Adds dependency: `resolveNamedOrigin(place: string): Promise<ResolvedNamedOrigin | null>`.
- Adds response context: nullable public `locationLabel` on `results` and `no_results` responses.
- Adds clarification reason: `unresolved_location`.

- [ ] **Step 1: Write failing service tests**

Assert that a verified `locationMention: "Jerusalem"`:

```ts
expect(resolveNamedOrigin).toHaveBeenCalledWith("Jerusalem")
expect(search).toHaveBeenCalledWith(intent, { lat: 31.778, lng: 35.235 })
expect(response).toMatchObject({ status: "results", locationLabel: "Jerusalem, Israel" })
```

Also assert that the named area overrides a supplied remembered origin, zero suggestions produce `unresolved_location`, geocoder failure does not broaden the query, and a location-free query still returns the ordinary continuation response.

- [ ] **Step 2: Run focused tests and confirm RED**

Run:

```bash
npx vitest run features/assisted-discovery/service.test.ts app/api/assisted-discovery/route.test.ts
```

Expected: failures because named places always return `needs_location` and the dependency/response fields do not exist.

- [ ] **Step 3: Implement service behavior**

After intent/date/entity validation, resolve a named place before continuation handling. Search with the highest-ranked valid Israel suggestion returned by the existing Photon adapter. Never put the phrase or origin in a token or URL. Keep `needs_location` only for a query requiring location that supplied neither a named place nor a session origin.

- [ ] **Step 4: Wire the production dependency**

In the route dependency factory, call `searchPublicAddress(createPhotonPublicGeocoder(), place)` and map `suggestions[0]` to the bounded origin and public label. Do not log inputs or labels.

- [ ] **Step 5: Run focused tests and confirm GREEN**

Run the same focused command and expect all tests to pass.

---

### Task 3: Consistent responsive shell and navigation

**Files:**
- Modify: `components/layout/site-header.tsx`
- Modify: `components/layout/mobile-navigation.tsx`
- Modify: `components/layout/app-shell.tsx`
- Modify: `components/layout/app-shell.test.tsx`
- Modify: `components/layout/mobile-navigation.test.tsx`
- Modify: `features/workspaces/components/workspace-switcher.tsx`
- Modify: `features/workspaces/components/workspace-switcher.test.tsx`
- Modify: `features/workspaces/components/fan-bottom-navigation.tsx`
- Modify: `features/workspaces/components/fan-bottom-navigation.test.tsx`
- Modify: `features/workspaces/components/venue-workspace-header.tsx`

**Interfaces:**
- Produces: `fanNavigation(assistedDiscoveryEnabled: boolean)` with separate compact and desktop labels where needed.
- Changes: `MobileNavigation` and `SiteHeader` accept `assistedDiscoveryEnabled` from server-rendered `AppShell`.
- Preserves: route-aware Venue workspace override and existing workspace-selection action.

- [ ] **Step 1: Write failing navigation tests**

Assert:

```ts
expect(fanLabels).toEqual(["Home", "Explore", "Ask", "My Huddle", "People"])
expect(venueLabels).toEqual(["Today", "Calendar", "Events", "Venue"])
expect(screen.queryByRole("link", { name: "Account" })).not.toBeInTheDocument()
expect(screen.getByRole("button", { name: "Switch workspace" })).toBeVisible()
```

Cover Fan and Venue top-right switchers on mobile, `Ask Huddle` in desktop Fan navigation when enabled, omission when disabled, and a public-menu trigger placed in the right-side header container.

- [ ] **Step 2: Run focused shell tests and confirm RED**

Run:

```bash
npx vitest run components/layout/app-shell.test.tsx components/layout/mobile-navigation.test.tsx features/workspaces/components/fan-bottom-navigation.test.tsx features/workspaces/components/workspace-switcher.test.tsx
```

- [ ] **Step 3: Implement the navigation model and shell layout**

Use a mobile `flex` header with `justify-between` and switch to the existing three-column centered desktop grid at `lg`. Render one shared workspace switcher for every active signed-in workspace. Give the trigger the same responsive appearance for Fan and Venue; the active workspace initial may change, but the control shape and position may not.

- [ ] **Step 4: Implement bottom-navigation changes**

Remove Account from both arrays, emphasize the center Ask item with existing Huddle tokens, use four grid columns for Venue, and update current-route matching for `/ask`.

- [ ] **Step 5: Run focused shell tests and confirm GREEN**

Run the focused command from Step 2 and expect all tests to pass.

---

### Task 4: Repository-owned shadcn conversation primitives and Ask UI

**Files:**
- Create: `components/ui/message.tsx`
- Create: `components/ui/bubble.tsx`
- Create: `components/ui/message-scroller.tsx`
- Modify: `package.json`
- Modify mechanically: `package-lock.json`
- Create: `features/assisted-discovery/components/assisted-discovery-result.tsx`
- Create: `features/assisted-discovery/components/assisted-discovery-chat.tsx`
- Create: `features/assisted-discovery/components/assisted-discovery-chat.test.tsx`
- Delete: `features/assisted-discovery/components/assisted-discovery.tsx`
- Delete: `features/assisted-discovery/components/assisted-discovery.test.tsx`

**Interfaces:**
- Adds exact dependency: `@shadcn/react@0.3.1`.
- Produces: `AssistedDiscoveryResult` for the complete shared result response.
- Produces: `AssistedDiscoveryChat`, a local-state single-turn client with no persistence.

- [ ] **Step 1: Write failing chat tests**

Test the empty greeting, single user bubble, pending marker, complete assistant result, later-query replacement, no storage writes, Enter submission, all error/empty response variants, full existing result metadata, and remount reset.

- [ ] **Step 2: Run the chat test and confirm RED**

Run:

```bash
npx vitest run features/assisted-discovery/components/assisted-discovery-chat.test.tsx
```

Expected: module-not-found failure for the new chat component.

- [ ] **Step 3: Add the official Radix-compatible shadcn primitives**

Copy and adapt the official `radix-nova` registry implementations for Message, Bubble, and MessageScroller into `components/ui/`. Replace registry aliases with Huddle aliases and preserve existing global CSS and named brand tokens. Install only `@shadcn/react@0.3.1`; do not install the AI SDK or a second design system.

- [ ] **Step 4: Extract the complete result renderer**

Move the current crest/host/group/location/attendance/facility/participation/action row without dropping fields. Both legacy component tests and new chat tests import the same renderer.

- [ ] **Step 5: Implement the single-turn chat**

Use `MessageScroller` for the bounded transcript, `Message` plus `Bubble` for user/application rows, the existing `Marker` for pending status, and a bottom composer built from `InputGroup`. A submit clears the previous response immediately and replaces the sole submitted query. Do not send rendered messages to the API.

- [ ] **Step 6: Run component tests and confirm GREEN**

Run:

```bash
npx vitest run features/assisted-discovery/components/assisted-discovery-chat.test.tsx features/assisted-discovery/components/assisted-discovery.test.tsx
```

---

### Task 5: Dedicated Ask Huddle page and Home removal

**Files:**
- Create: `app/ask/page.tsx`
- Create: `app/ask/page.test.tsx`
- Modify: `app/page.tsx`
- Modify: `app/page.test.tsx`

**Interfaces:**
- Produces: authenticated active-Fan `/ask` page.
- Removes: Home dependency on `AssistedDiscovery` and the assisted-discovery environment read used only for that component.

- [ ] **Step 1: Write failing page tests**

Assert enabled active Fans see `Ask Huddle`, disabled deployments return the safe unavailable state, non-Fan workspaces receive the existing recovery/not-permitted presentation, and Home no longer contains `What kind of huddle are you after?`.

- [ ] **Step 2: Run page tests and confirm RED**

Run:

```bash
npx vitest run app/ask/page.test.tsx app/page.test.tsx
```

- [ ] **Step 3: Implement the page and remove Home embedding**

Use `requireActor("fan")`, `getServerEnvironment()`, `fanRecovery`, and `ProfileAccessState` patterns already used by protected Fan pages. Render a concise heading plus `AssistedDiscoveryChat`; use responsive height that leaves room for the fixed bottom navigation and safe-area inset.

- [ ] **Step 4: Run page tests and confirm GREEN**

Run the command from Step 2.

---

### Task 6: Contract documentation and end-to-end regression coverage

**Files:**
- Modify: `docs/HUDDLE-IMPLEMENTATION-SPEC.md`
- Modify: `docs/HUDDLE-ARCHITECTURE.md`
- Modify: `docs/HUDDLE-STEP-BY-STEP-BUILD-SPEC.md`
- Modify: `docs/HUDDLE-BRAND.md`
- Modify: `README.md`
- Modify: `tests/e2e/assisted-discovery.spec.ts`
- Modify: `tests/e2e/auth.spec.ts`
- Modify: `tests/e2e/ux-redesign.spec.ts`

**Interfaces:**
- Revises AI01 presentation from Home form to `/ask` single-turn conversation.
- Revises named-place confirmation to automatic highest-ranked valid Israel resolution.
- Revises responsive navigation and exact date-default semantics.

- [ ] **Step 1: Update E2E expectations before runtime behavior**

Cover the five-item Fan bar, four-item Venue bar, shared top-right workspace switcher, public-menu right alignment, navigation to `/ask`, no retained response after leaving/re-entering, `anything in Jerusalem in October` without a suggestion click, and exact October interpretation.

- [ ] **Step 2: Run focused E2E and confirm RED**

Run:

```bash
node scripts/with-local-supabase-env.mjs playwright test tests/e2e/assisted-discovery.spec.ts tests/e2e/layout-regression.spec.ts
```

Expected: failures at the old Home/navigation/location behavior.

- [ ] **Step 3: Revise authoritative documentation**

Update every contradictory Home, confirmation, navigation, and date-default statement. Keep the AI described as one-shot intent extraction despite its chat-like presentation. Add the new route to the route inventory and preserve the no-history/deferred-chat boundary.

- [ ] **Step 4: Run focused E2E and confirm GREEN**

Run the same focused Playwright command and require zero failures.

- [ ] **Step 5: Run complete local verification**

With Node `24.19.0` and npm `11.17.0`, run:

```bash
npm test
npm run format:check
npm run lint
npm run typecheck
npm run build:local
npm run db:lint
npm run test:db
npm run db:types:check
npm run security:audit
npm run test:e2e
git diff --check
```

Inspect the complete diff for unrelated edits, secrets, query/location logging, lost result fields, and stale documentation. Leave the verified changes uncommitted until publication is separately authorized.
