# Submission hardening implementation plan

> **For agentic workers:** Use test-driven implementation with independent task review, followed by a whole-change review. The user approved the audit remediation on 4 September 2026. Do not reopen product design or publish without separate authorization.

**Goal:** Correct every actionable finding in the 4 September audit, reduce avoidable loading work, and produce fresh isolated submission-readiness evidence.

**Architecture:** Keep the existing Next.js modular monolith and Supabase authorization boundaries. Correct narrow UI/DTO defects and add forward SQL migrations for access/history/draft recovery; use request-scoped caching only. Keep provider automation offline.

**Tech Stack:** Next.js 16.3.2, React 19.2.8, strict TypeScript, Zod, Supabase PostgreSQL/RLS, Vitest/RTL, pgTAP, Playwright.

**Spec:** `docs/HUDDLE-IMPLEMENTATION-SPEC.md`; approved remediation details and reproductions in `docs/qa-audit-2026-09-04.md`.

## Global constraints

- Fan, friendship, supporter-group, RSVP, and private-hosting features remain free.
- Polar Sandbox only; no real money, new payment tiers or production-payment switch.
- Membership never by itself grants public visibility or publishing. Billing remains exact-owner-only.
- Preserve entitlement, tombstone, suspension, block, group-membership and exact-home-location boundaries. No shared cache of private decisions.
- One registered account represents one attendee; retain attendance and safety history.
- No commits, pushes, PR mutations, hosted changes or deployments in this task. Work on `codex/submission-hardening` from current main.
- Preserve pre-existing `tmp/` and all ordinary local/live data. Acceptance uses a distinct disposable local Supabase project and ports.
- Use apply_patch for edits, tests before implementation, and pinned Node 24.19/npm 11.17.
- Root coordinates integrations and exclusively owns migrations/generated types/acceptance infrastructure. Workers own disjoint source/test paths and report overlap before editing.

## Task 1: Venue lifecycle and workspace UX (F01, F04, F09–F11, F15)

**Files:** `features/venues/workspace/**`, `features/workspaces/components/venue-onboarding-form*`, `app/events/[eventId]/**`, new venue event editor under `features/venues/workspace/components/`; existing `features/events/actions.ts` is read-only unless root transfers ownership.

**Interfaces:** Consume existing `saveVenueEventAction`, authorized event/venue projections and structured action errors. Produce visible owner/admin management and draft-edit/publish paths without bypassing database validation. Any missing SQL/read projection must be requested from root.

- [x] Add failing RTL/page tests: public/open-door owner can reach Manage; draft can reach editor/publisher; valid slug save replaces old route; each invalid onboarding/settings/planner field receives associated error; reservations-default capacityless area can select open door before Review; Venue-origin return stays in workspace.
- [x] Run targeted test files; capture the failed behavioral assertions.
- [x] Implement minimal accessible controls, an authorized venue event editor using existing mutations, safe internal return destinations, structured field feedback, and reachable attendance-mode correction. Do not display billing to fans.
- [x] Run affected tests and typecheck; self-review permissions, pending/failure states and no fake controls. Report paths and red/green evidence.

## Task 2: Database access/history hardening (F03, F07, F08)

**Files:** new `supabase/migrations/20260904160000_submission_access_history.sql`; new `supabase/tests/database/300_submission_access_history_test.sql`; `types/database.generated.ts` only after generation.

**Interfaces:** Preserve current signatures of `private.event_is_visible_to_actor`, `private.actor_manages_event`, and `public.list_my_events`. Existing approved attendees retain event access during the event, never new acquisition; expired published events appear in history without destructive status rewrites.

- [x] Write pgTAP scenarios with fixed relative timestamps: approved private attendee before/at/during/after event; revoked/blocked/ineligible attendees; tombstoned host JWT; elapsed published and cancelled history; unrelated private viewer denial.
- [x] Run regressions against the disposable baseline and confirm expected failures.
- [x] Add a forward migration with narrow reusable authorization/history changes, preserving lock ordering and billing policy.
- [x] Run focused and full database tests, schema lint and generated-type parity. Review final function definitions and callers, not only migration text.

## Task 3: Identity-safe social administration and complete queues (F02, F06, F13; interests bound)

**Files:** `features/moderation/**`, `features/groups/**`, `app/groups/**`, `features/subscriptions/catalog*`, `app/settings/interests/**`. No SQL or generated types without root coordination.

**Interfaces:** Consume nullable identities and existing paged RPCs; produce neutral non-linkable tombstones without resurrecting deleted identity. Preserve different-reviewer rules and authorization. Resolve total counts into actual visible paging controls.

- [x] Add failing tests using null reporter/appellant/invitation/ban/submission identities; seven mixed-status review items; fifty-one invitations; a team beyond first hundred searchable.
- [x] Confirm each failure against current code.
- [x] Implement safe projections, bounded paging/filtering and reachable continuation/search. Do not weaken strict validation of other fields or expose confidential report data.
- [x] Run affected tests and typecheck; report exactly which large-list and erased-identity cases are covered.

## Task 4: Redirect, transport and Ask correctness (F05, F12, F16; React key warning)

**Files:** `features/venue-billing/components/**`, `features/attendance/components/**`, `features/assisted-discovery/{query-date,date-range,service}*`, necessary narrow helpers/tests under those domains. Do not change provider configuration or event pages owned by Task 1.

**Interfaces:** Preserve framework redirect control flow while displaying real errors. Mutation dialogs close only after successful acknowledgement. Date parser returns a supported exact interval or clarification, not accidental defaulting.

- [x] Add failing tests for successful redirect sentinel vs transport failure, rejected attendance actions with preserved reason/dialog, stable list keys, and raw-query date phrases.
- [x] Fixed-clock expectations: on 4 September, tonight=this evening=4 September; day after tomorrow=6 September; Friday–Sunday=4–6 September. Yesterday/last Friday must not silently become future; unsupported compound language must clarify without executing a search.
- [x] Observe failing tests, then implement bounded parsing and safe error handling. Prefer documented Next control-flow handling verified against installed version. Preserve repeat-click prevention and no optimistic seat success.
- [x] Run affected tests and typecheck; no live Polar/AI requests.

## Task 5: Recoverable private drafts and accurate audience copy (F14, F17)

**Files:** `features/events/drafts*`, `features/events/actions*`, `features/events/components/event-create-flow*`, `features/events/components/event-place-step*`, `app/events/new/**`, `app/people/**`, new draft-list component and forward SQL/RLS test as needed.

**Interfaces:** Existing owner-bound `get_event_draft`, `discard_event_draft`, save/finalize remain authority. A paged owner-only draft summary must never include exact address or protected coordinates. People return destination is a strictly internal draft route.

- [x] Add failing tests for save→leave→list→resume/discard; non-owner denial; friend-search return preservation; home versus discoverable-public-place audience copy.
- [x] Confirm failures before implementing reachable draft recovery controls and an owner-only bounded draft projection.
- [x] Preserve wizard state and surface autosave clearly; confirm before discard; show transport failures and keep controls usable.
- [x] Run component/page/database tests. No live draft creation.

## Task 6: Loading performance and workspace transition robustness

**Files:** `app/page.tsx`, `app/loading.tsx`, `components/layout/app-shell*`, `features/workspaces/queries*`, workspace switcher/actions, `features/dashboard/queries*`, `features/discovery/query*`, `features/discovery/components/discovery-feed*`, `app/layout.tsx` or `vercel.json` only if a reviewed region configuration belongs in source.

**Interfaces:** Request-scoped cache may deduplicate authorized reads; never cache across actors or requests. Region selection is prepared in source only, not applied to hosted infrastructure. Preserve canonical workspace redirects and session/query isolation.

- [x] Reproduce duplicate request counts, unnecessary team-visual reads, independent serialized enrichment, and hidden map mounting in focused tests. Add workspace-switch tests from Explore for both layouts and back/forward-sensitive behavior.
- [x] Implement narrow deduplication and independent parallel reads, measured loading feedback, and one map instance per visible viewport. Do not remove safety locks for speed. Evaluate feed-cache retention only with explicit user/workspace isolation and invalidation tests.
- [x] Add reviewed Frankfurt function-region configuration if supported by current deployment; no hosted deployment action.
- [x] Run focused tests, build and compare controlled local navigation/request metrics; distinguish structural reductions from unmeasured production gains.

## Task 7: Integrated acceptance, independent review, and submission evidence

**Files:** the existing `tests/e2e/{auth,calm-crud,ux-redesign,venue-billing}.spec.ts` harnesses, `docs/evidence/submission-hardening/ACCEPTANCE.md`, audit resolution table, README/build-spec current local evidence.

- [x] Create a disposable local project with unique database/API/mail ports and no production credentials. Never reset the ordinary `huddle` project. Verify target before reset.
- [x] Add visible-UI E2E journeys for venue draft publish/management, private draft recovery, workspace return, validation, errors and date intent. Preserve deterministic provider fixtures and denied Polar network.
- [x] Run clean install, formatting, lint, typecheck, full coverage, isolated database reset/lint/pgTAP/types, production build, full Playwright, security audit and diff hygiene.
- [x] Independently review each task and the combined diff for spec compliance, security, regression gaps and scope. Address blocking findings and rerun affected gates.
- [x] Record exact commands/results, each audit finding's resolution, performance evidence and remaining hosted/manual presentation gates. Do not claim production readiness until new migrations/code are separately deployed and verified, or claim a partner rehearsal happened when it did not.

## Execution record

### User additions approved during implementation (4 September)

- Task8: remove Billing's self-navigation prompt; automatic atomic name-derived venue Huddle URLs with numeric suffixes; optional settings URL edit with clear nontechnical copy and debounced database availability. Preserve all existing venue/draft/entitlement authorization.
- Task9: debounced username availability at Fan creation/profile edit; easy-to-find account username/password/email controls; add current-password-reauthenticated email change through Supabase secure dual-address confirmation and the existing passive-fragment/explicit-POST safety pattern. Availability never enumerates emails and never replaces final uniqueness. No hosted settings or real emails in automation.
- Root owns SQL/types/spec/evidence and full acceptance; fix_social_admin owns Task8 venue forms/actions/availability, audit_navigation_billing owns the billing banner, fix_venue_workflows owns Task9 profile/auth/account implementation. Final acceptance must include these additions after existing audit regressions pass.

## Acceptance-discovered correction: fixture watch-plan pagination

Investigation of repeated populated-database browser acceptance found a fixture-selection mistake in the test and a genuine fixed first-20 limit in match details. Correct the test to select the intended date/kickoff rather than the first same-team fixture and traverse actual Explore/fixture controls. Pagination follows the existing growing-collection requirement, not new scope: use a same-policy bounded offset RPC and index, 21-row lookahead/20-row pages with real Previous/Next links, safe return context, and negative/large-list tests. Root owns the fifth forward migration/types/E2E; fix_social_admin owns match-page/query UI; audit_navigation_billing independently owns305 pgTAP/review. Do not raise a fixed limit or reset data to hide either problem.
- Browser test additions reuse the established auth/UX/calm-crud harnesses instead of duplicating fixture setup in a new spec file.
- The proposed new root loading boundary was removed after A/B measurements showed worse content latency despite earlier first byte. Existing route loading feedback remains; the retained optimizations reduce actual reads and parallelize independent work.
- A final console investigation verified a production-bundle map worker failure, not merely a warning: MapLibre's inferred worker URL resolved to the page HTML, and a hashed worker lacked its sibling import. Both map factories now use version-matched local worker/shared assets prepared before build/dev, following the library's Next.js guidance. The added browser regression first failed on the old build, then verified both actual worker initialization and JavaScript asset responses after rebuilding. No dependency, CDN, API, or location-policy expansion.

- Baseline: current main `b07f542d798c45fd3cea25482b2473bebcdeb09f`; audit source is content-equivalent.
- Preflight: Tasks 1/5 share event action interfaces but not write ownership; root mediates. Tasks 2/5 require migrations/types exclusively written by root. Tasks 1/4 share event management behavior; Task 1 owns pages/links and Task 4 owns attendance controls. Task 3/6 share dashboard consumers; Task 3 owns group/catalog readers and Task 6 owns dashboard parsing. Test infrastructure is root-only.
- Scope ruling: user approved correction of existing audited workflows, not new product features. Preserve current discovery/audience contracts and correct misleading copy.
- Isolation ruling: implementation stays on a new unshared feature branch; independent workers receive non-overlapping paths. Disposable acceptance has its own project/runtime. No additional user-owned worktree or remote task is created.
- Publication ruling: no commit/push/merge/deploy is authorized by this request; retain all local changes and evidence for explicit release handoff.

## Final local outcome

Tasks 1–9 and the acceptance-discovered pagination/map corrections are implemented and independently reviewed. Current gates pass: 1,482 unit/component tests, 2,606 database assertions after all 49 migrations, generated-type parity, production build, 41 browser journeys, formatting/lint/typecheck/security audit and diff hygiene. See [acceptance evidence](../../evidence/submission-hardening/ACCEPTANCE.md). Publication, hosted configuration/migrations/deployment, live verification and partner rehearsal remain separate; none is marked complete here.
