# Huddle: Step-by-Step Team Build Specification

**Purpose:** turn Huddle's remaining architecture and implementation scope into 13 ordered delivery milestones that two people using two separate Codex sessions can complete together. The existing `F`, `A`, `S`, `G`, `E`, `T`, `M`, and `D` IDs remain detailed requirement modules inside those milestones; they are not separate issue, branch, pull-request, or review cycles.

**Status:** execution plan only. This document does not mean any application feature is implemented.

**Authority:** [HUDDLE-IMPLEMENTATION-SPEC.md](./HUDDLE-IMPLEMENTATION-SPEC.md) remains the normative product and engineering contract. [HUDDLE-ARCHITECTURE.md](./HUDDLE-ARCHITECTURE.md) explains the product vision. This file controls work order and collaboration, but it MUST NOT silently change either source.

**Operating rule:** one branch, one active writer, two participating humans, and two separate Codex sessions alternating between implementation and review.

---

## 1. What working together means

Both partners participate in every feature, but they do not both edit the same feature at the same time.

For each delivery milestone:

1. Both partners read the milestone, every included requirement module, and the referenced authoritative sections.
2. Both explain the expected user behavior in their own words.
3. Both Codex sessions may inspect and propose a plan.
4. The partners reconcile those plans into one short checklist.
5. One Codex becomes the only writer for the complete milestone branch.
6. The other partner watches, asks questions, navigates, and challenges decisions in the shared Zed session.
7. At the user-authorized handoff, the writer runs the combined checks and publishes the completed milestone as one pull request.
8. The other Codex reviews the committed diff without editing it.
9. The partners discuss every blocking finding and accept or reject it with a reason.
10. The original writer addresses review findings; the reviewer becomes the initial writer for the next milestone after merge.
11. Both partners run or observe the final acceptance flow and explain the data and authorization path.
12. The pull request is merged only after both agree that the milestone and all included modules are done.

Zed collaboration provides the shared editor, cursors, terminal view, and conversation. GitHub provides the durable branch, issue, pull request, review, and history. `AGENTS.md` and the repository documents give both Codex sessions the same durable rules. The Codex chat transcripts themselves remain separate.

### 1.1 The normal role rotation

Use these roles instead of assigning one person to frontend and the other to backend:

| Checkpoint | Person 1 | Person 2 |
|---|---|---|
| Understand and plan | Explain requirements and inspect with Codex | Explain requirements and inspect with Codex |
| Data/server checkpoint | Writer with Codex; narrates changes | Co-navigator; challenges authorization and data decisions |
| UI/consumer checkpoint | Writer with Codex; narrates changes | Co-navigator; challenges behavior and failure states |
| Tests and acceptance | Writes and runs the required tests | Observes, challenges coverage, and prepares independent reproduction |
| Pull-request review | Answers questions; does not change code while review runs | Runs read-only Codex review |
| Final explanation | Explains browser-to-database flow | Explains permissions, failure cases, and tests |
| Next milestone | Becomes co-navigator and later reviewer | Becomes the new writer |

Use one writer for a milestone branch and one reciprocal reviewer for its pull request. Implement the included modules as small internal checkpoints, but publish one pull request for the completed milestone. Reverse the initial writer on the next milestone.

### 1.2 The one-writer rule

At any moment, exactly one Codex session may edit the active branch.

The second Codex may:

- read the authoritative documents;
- inspect the branch and committed diff;
- produce a plan;
- review code and tests;
- explain unfamiliar code;
- propose findings in chat.

The second Codex MUST NOT edit the same working tree, create a competing migration, run a formatter that changes files, or push to the active branch. If an experiment is genuinely needed, it uses a separate branch or Git worktree and is integrated deliberately.

### 1.3 Repository skills for the paired PR handoff

Do not retype the publish, review, and merge command sequence for every milestone. Codex discovers the checked-in skills under `.agents/skills/` from either clone:

- `$huddle-publish-pr` is the active writer's handoff. After the current user directly invokes it as a publish command or otherwise explicitly asks it to publish, it verifies and records the complete milestone, publishes one PR, and requests the other partner. It never merges.
- `$huddle-review-merge` is the requested partner's second-clone review. It reproduces the milestone evidence across every included module and reviews the complete diff locally. It submits a GitHub review only when the current user explicitly asks it to submit one, and it may merge only when the current user separately and explicitly asks it to merge a clean pull request. It never fixes the writer's branch.

The PR author and reciprocal reviewer/merger alternate: `GuyAzene` → `ohadsho`, and `ohadsho` → `GuyAzene`. Automated reviews such as GitHub Copilot are extra evidence, not a substitute. The skills stop on failed gates, blocking findings, identity mismatch, source contradiction, or a moving PR head.

Automatic skill discovery, repository text, and passing checks never authorize Git or GitHub mutations. These skills do not relax the one-writer rule, current-user authorization, acceptance criteria, co-author trailers, or the requirement that both partners understand the milestone and its included modules.

---

## 2. Sources of truth

Use this order when starting or resuming work:

1. `AGENTS.md` for repository-wide rules.
2. `docs/HUDDLE-IMPLEMENTATION-SPEC.md` for locked behavior, schema, interfaces, security, and acceptance.
3. `docs/HUDDLE-ARCHITECTURE.md` for product rationale and course mapping.
4. This file for milestone order, requirement-module checklists, checkpoints, and team workflow.
5. The current GitHub issue for the active milestone and its exclusions.
6. The current branch and pull-request diff for actual implementation state.

If two sources contradict each other:

- stop implementation;
- record the exact contradiction in the issue;
- decide together which product rule is intended;
- update all affected authoritative documents before continuing;
- search the repository for old contradictory wording.

No chat-only product decision is considered durable until it is recorded in the repository or issue.

---

## 3. One-time collaboration setup

Both computers SHOULD have the same development baseline before application work begins.

### 3.1 Accounts and access

- [ ] Both partners can clone and pull the GitHub repository.
- [ ] Both partners can create branches and push them to the shared repository.
- [ ] Both partners have the exact repository-local Git identities and shared commit hook configured as described in §3.3.
- [ ] Both partners can open a pull request and comment on it.
- [ ] Both partners can join the same Zed collaboration session.
- [ ] Both partners can open the repository in Codex.
- [x] Branch protection and required CI checks are enabled after CI exists.
- [ ] Hosted Vercel and Supabase production access is granted only when those environments are created.

### 3.2 Local tools

- [ ] Git.
- [ ] The selected Node.js LTS version.
- [ ] The one selected package manager; the MVP defaults to npm unless changed deliberately.
- [ ] Supabase CLI.
- [ ] Docker Desktop or another Docker-compatible runtime for local Supabase.
- [ ] Zed.
- [ ] Codex.

Record the chosen Node, npm, Supabase CLI, and Docker baseline in the README after scaffolding. Exact application dependency versions are selected from current stable releases during module `F01` and committed in the lockfile.

### 3.3 Local identity, shared commit attribution, and secrets

Every human-authored Huddle commit is joint work under this workflow. The person running `git commit` remains the primary author; the tracked hook adds the other partner as the co-author. Do not create a commit until both partners have genuinely participated in the work it represents.

Activate the project hook once in every clone:

```text
git config --local core.hooksPath .githooks
```

On Guy's clone, configure:

```text
git config --local user.name "Guy Azene"
git config --local user.email "azene.guy@gmail.com"
```

On Ohad's clone, configure:

```text
git config --local user.name "Ohad Shoshani Levi"
git config --local user.email "ohadsho34@gmail.com"
```

`.githooks/prepare-commit-msg` reads that repository-local email and adds exactly one reciprocal trailer:

| Primary author | Required trailer |
|---|---|
| Guy Azene | `Co-authored-by: Ohad Shoshani Levi <ohadsho34@gmail.com>` |
| Ohad Shoshani Levi | `Co-authored-by: Guy Azene <azene.guy@gmail.com>` |

The hook rejects a missing or unknown repository-local identity instead of guessing. GitHub-generated squash or merge commits do not run local hooks; before completing one, edit or verify the final message contains the reciprocal trailer. Both email addresses must remain verified on the corresponding GitHub accounts for GitHub attribution.

- [ ] Copy `.env.example` to an ignored local environment file only after the example exists.
- [ ] Never send `.env` contents through chat, screenshots, issues, commits, or review comments.
- [ ] Each partner may use their own provider token locally; no token is committed.
- [ ] Shared hosted secrets later live in Vercel, Supabase Vault, or GitHub secret storage.
- [ ] The Supabase service-role key and sports-provider token are never exposed to a Client Component.

### 3.4 First parity check

After scaffolding exists, both computers independently run:

```text
npm install
supabase start
supabase db reset
npm run dev
```

Both then run the repository's available quality commands. A milestone is not considered reproducible merely because it works on the original writer's computer.

---

## 4. The exact loop for every delivery milestone

### Step A — Select and understand one milestone

Do not start two milestones in parallel. Choose the first incomplete milestone whose dependencies are done. The milestone map in §6 is the unit of planning, branching, publication, reciprocal review, and merge.

Together:

- read its outcome, included requirement modules, authoritative references, tasks, and exit evidence;
- inspect current implementation rather than assuming earlier milestones or modules exist;
- restate what is deliberately out of scope;
- identify security-sensitive paths and database migrations;
- order the included modules into coherent internal checkpoints.

Use focused commits or issue checklists to keep a milestone understandable, but do not create a separate issue, branch, pull request, or formal review cycle for each included module. If the mapped milestone cannot be reviewed coherently even with internal checkpoints, stop and revise the milestone map explicitly rather than silently fragmenting it.

### Step B — Open the issue

Create one GitHub issue for the milestone using this body:

```md
## Outcome
<one observable user or developer outcome>

## Authority
- HUDDLE-IMPLEMENTATION-SPEC.md: <sections>
- HUDDLE-STEP-BY-STEP-BUILD-SPEC.md: <milestone ID and included module IDs>

## In scope
- ...

## Out of scope
- ...

## Checkpoints
- [ ] Data/server boundary
- [ ] UI/consumer boundary
- [ ] Tests, documentation, and acceptance

## Acceptance
- [ ] ...

## Evidence
- Commands:
- Screenshots or test output:
- Decisions or deviations:
```

GitHub is sufficient for this course-sized workflow. Linear MAY mirror progress for convenience, but it MUST NOT become a separate source of product truth.

### Step C — Create the branch

The first writer starts from a clean, current `main`:

```text
git switch main
git pull --ff-only
git status
git switch -c codex/<milestone-id>-<short-name>
```

Before changing files, the writer confirms:

- the branch contains the latest completed milestone;
- the working tree has no unrelated changes;
- the current issue and authoritative sections are known;
- any required migration number/name is unique.

### Step D — Ask the writer Codex

Use a bounded prompt like:

```text
Read AGENTS.md and the referenced Huddle specification sections.
We are implementing milestone <ID>, including modules <IDs>, on the current branch.
Implement the modules in dependency order and only within the issue's scope.
Preserve all locked product and safety rules. Inspect before editing, use migrations for schema changes, add the
required tests, and run the relevant checks. Do not commit, push, merge, deploy,
or create hosted resources. When the agreed scope is implemented, documentation
is truthful, and all available checks pass, report that the branch is ready for
the user to invoke $huddle-publish-pr. Otherwise report the incomplete work or failure.
```

The writer and partner remain in the same Zed session. The partner should ask what each important file, query, policy, and test is doing while it is still small.

### Step E — Publish the milestone and hand off

After the current user directly invokes `$huddle-publish-pr` as a publish command or otherwise explicitly grants publish authorization, the skill verifies the following invariants before it performs any publish mutation.

Before changing writers:

1. Inspect `git status` and the full diff.
2. Remove accidental changes, secrets, debug logs, and generated junk.
3. Run the combined tests required by every included module.
4. Commit one coherent milestone result.
5. Push the branch.
6. Put the commit hash and command evidence in the issue or pull request.

Suggested commit form:

```text
<type>(<area>): <observable change>

Co-authored-by: Partner Name <github-linked-email>
```

For normal local commits, the tracked hook inserts the exact reciprocal trailer automatically. Do not create a human-authored Huddle commit before both partners have genuinely participated in it. When GitHub creates the final squash or merge commit, verify or add the same reciprocal trailer manually before completing the merge.

### Step F — Ask the reviewer Codex

The requested partner normally invokes `$huddle-review-merge` so Codex fetches the exact committed milestone head, reproduces the combined module checks, and applies the read-only review rules below. The skill defaults to a local, chat-only review; the current user must separately authorize submitting that review to GitHub. The prompt remains a fallback description of the review boundary:

```text
Read AGENTS.md, milestone <ID>, every included requirement module, and their
referenced normative specification. Review the committed diff against main.
Do not edit files,
format code, commit, push, or deploy. Prioritize correctness, RLS/authorization,
privacy, data integrity, concurrency, missing tests, and specification drift.
For each blocking finding, cite the smallest file/line, explain a concrete failure
scenario, and state the missing evidence. Separate blockers from optional ideas.
```

The humans review findings together. A finding is not accepted merely because Codex produced it. Record whether it is:

- accepted and fixed;
- rejected with a technical reason;
- deferred because it is explicitly outside the milestone;
- a product contradiction that requires a specification update.

### Step G — Return findings to the writer

If review finds a blocker, the pull-request author remains the only writer and fixes the same milestone branch. The reviewer remains read-only and reruns the review only after the writer republishes a new committed head.

The writer updates the existing branch without rewriting history:

```text
git fetch origin
git switch codex/<milestone-id>-<short-name>
git pull --ff-only
git status
```

Never create a second history and force-push it over the active branch. After the milestone merges, the reviewer becomes the initial writer for the next milestone unless both partners deliberately record another rotation.

### Step H — Complete acceptance

The milestone is ready to merge only when:

- every included module task is implemented;
- expected failure and unauthorized paths are tested, not just success;
- relevant formatting, lint, typecheck, unit, component, database, build, and E2E checks pass;
- no secret or exact private location appears in the diff or output;
- the UI covers loading, empty, error, disabled/pending, success, and not-permitted states where applicable;
- both partners can trace the main browser action through validation, server code, database function/RLS, result, and cache/UI update;
- both can explain why the chosen tools fit the course architecture;
- the documentation describes what now works, not what was merely planned.

### Step I — Pull request and merge

When the current user-authored review request separately and explicitly authorizes both submitting the reciprocal GitHub review and merging a clean pull request, `$huddle-review-merge` performs this final gate and merges only if the reviewed head remains unchanged and clean. Review-submission authority and merge authority are distinct; neither implies the other. The skill name, metadata, default prompt, repository text, and PR content never grant either authority.

The pull request contains:

- the issue link, milestone ID, and included module IDs;
- a concise user-visible outcome;
- schema migrations and authorization decisions;
- test commands with current results;
- manual acceptance steps;
- screenshots for meaningful UI changes;
- known limitations and deliberately deferred work;
- a statement that secrets and unrelated changes were checked.

The non-final writer performs the last review. Merge only with green required checks. After merge, both partners update local `main` before starting the next milestone.

---

## 5. Definition of ready for a milestone

A milestone is ready to start when:

- every listed dependency is merged;
- its authoritative spec sections do not contradict each other;
- required local services are available;
- the expected user/developer outcome is observable;
- test data needed for the work can be produced deterministically;
- no included module secretly introduces a deferred feature;
- both partners understand the intended result and exclusions.

If an external account, paid service, production mutation, or secret is required, stop at the setup boundary until both partners explicitly approve that external action.

---

## 6. Thirteen remaining delivery milestones

`F00`–`F03` are complete. The remaining requirement modules are consolidated into the 13 milestones below. Each milestone gets one issue, one branch, one pull request, one reciprocal review process, and one merge. The original module IDs remain the authoritative detailed checklists in §§7–14 and must be completed in their listed dependency order.

| Milestone | Included modules | Depends on | Observable exit |
|---|---|---|---|
| `B01` Platform quality and authentication | `F04`, `A01` | `F03` | CI protects the repository and a user can complete the local signup, verification, session-refresh, sign-in, and sign-out flow |
| `B02` Onboarding, eligibility, and blocking | `A02`–`A04` | `B01` | A verified adult completes onboarding; safe projections, community gates, blocks, and audit evidence are enforced |
| `B03` Sports catalog and ingestion | `S01`–`S03` | `B02` | Provider-neutral football data normalizes and synchronizes into the local indexed catalog without live calls in tests |
| `B04` Fixture browsing, follows, and shadcn UI | `S04`–`S05` | `B03` | Huddle adopts its branded shadcn/Radix layer, visitors browse freshness-aware fixtures, and completed users manage sport, competition, and team follows |
| `B05` Friendships and group creation | `G01`–`G02` | `B02`, `B04` | Canonical friendships work and a completed user atomically creates a valid group as its owner |
| `B06` Group membership and administration | `G03`–`G05` | `B05` | Applications, invites, roles, rules, bans, and bounded group administration work end to end |
| `B07` Venues and private-event foundations | `E01`–`E03` | `B04`, `B06` | Unverified venues and valid event records exist; private hosts can create safe restricted events without leaking exact locations |
| `B08` Venue/group events and safe visibility | `E04`–`E06` | `B07` | Venue and reviewed group events publish correctly, and every actor receives only the permitted safe event projection |
| `B09` Group and event discovery | `G06`, `E07` | `B08` | Only eligible groups and future events appear through gated search and cursor-paginated PostGIS discovery |
| `B10` Invitations, attendance, and calendar | `T01`–`T04` | `B09` | Invitation, join/request, approval, capacity, revocation, cancellation, protected-location, and `.ics` flows are safe and atomic |
| `B11` Moderation, security, and accessibility | `M01`–`M04` | `B10` | Reports, moderation, appeals, hardening, accessibility, failure states, and operational evidence cover the complete product loop |
| `B12` Release candidate and automated acceptance | `D01` | `B11` | Full automated acceptance is green and the complete application is published as a reviewable release candidate |
| `B13` Production acceptance and submission | `D02`–`D04` | `B12` | Isolated hosted environments, production sync/deployment, truthful submission evidence, and the presentation rehearsal are complete |

The milestone grouping reduces coordination overhead only. It removes no module task, test, authorization rule, migration requirement, or definition-of-done evidence. `G06` remains after `E05` inside the milestone order because group discovery depends on an approved future group event.

---

## 7. Foundation requirement modules

### F00 — Confirm the baseline and freeze scope

**Depends on:** nothing.

**Authority:** implementation spec §§1–3, §19; architecture §§1–3; `AGENTS.md`.

**Outcome:** both partners can explain the submitted MVP, deferred features, actors, core loop, audience boundary, and home-safety rules before code is generated.

**Tasks:**

- [x] Read the README, architecture document, implementation specification, this plan, and `AGENTS.md` together.
- [x] Explain the core loop: follow → discover → request/join → host/manage.
- [x] Explain why private people cannot publish `public` or `team_followers` events.
- [x] Explain why only business venues use those two audiences.
- [x] Explain the 18+ attestation, no-plus-one rule, 12-person home cap, protected location, and revocation rules.
- [x] Confirm football-first and that NBA remains deferred.
- [x] Confirm the modular-monolith stack and the explicit non-decisions.
- [x] Open the first milestone and issue sequence in GitHub.

**Team checkpoint:** each partner independently explains one complete user journey and one denial journey.

**Exit evidence:** a short issue comment records scope, exclusions, open configuration choices, and both partners' agreement. No application code exists yet.

### F01 — Scaffold Next.js and pin the toolchain

**Depends on:** `F00`.

**Authority:** implementation spec §§5.1–5.4, §15.1–15.2.

**Outcome:** a minimal Next.js App Router application builds with strict TypeScript, Tailwind, linting, formatting, and a committed lockfile.

**Tasks:**

- [x] Record the selected Node.js LTS and npm versions.
- [x] Scaffold Next.js App Router with TypeScript and Tailwind.
- [x] Enable and confirm `strict: true`.
- [x] Install only the planned initial dependencies: Supabase SSR/client, Zod, Radix primitives as first needed, and testing/quality tools.
- [x] Do not add Express, Prisma, Zustand, Redis, Socket.IO, payments, AI, or microservice tooling.
- [x] Add Prettier and compatible ESLint configuration.
- [x] Create scripts for `dev`, `build`, `typecheck`, `lint`, `format`, and `format:check`.
- [x] Commit the dependency lockfile.
- [x] Preserve the planned feature-oriented folder direction; avoid empty speculative modules.
- [x] Add a simple public shell that clearly says the product is under development.

**Writer rotation:** first partner scaffolds/configures; second partner owns script verification and the first read-only review.

**Tests/evidence:** clean install, lint, format check, typecheck, and production build on both computers.

### F02 — Environment, Supabase clients, errors, and application shell

**Depends on:** `F01`.

**Authority:** implementation spec §§5.3–5.4, §7.3, §§10–11, §13.

**Outcome:** server/browser boundaries and error conventions exist before feature code uses them.

**Tasks:**

- [x] Add Zod environment schemas separating browser-safe and server-only variables.
- [x] Add `.env.example` with placeholders only.
- [x] Confirm all real `.env*` files are ignored while `.env.example` is tracked.
- [x] Add browser and request-scoped server Supabase client modules.
- [x] Add a separate server-only service-role module with import protection; do not use it yet.
- [x] Add middleware for session refresh only, with comments/tests making clear it is not authorization.
- [x] Define `ActionResult<T>` and stable domain error types.
- [x] Add error mapping that never returns stacks, SQL details, policy names, or secrets.
- [x] Add root layout, navigation shell, footer placeholder, `error.tsx`, `not-found.tsx`, and basic empty/error components.
- [x] Add request-ID plumbing at server boundaries where practical.
- [x] Apply the approved Tailwind palette, Familjen Grotesk typography, replaceable brand assets, and shared-shell styling without adding fake feature controls.

**Tests/evidence:** environment validation tests, server-only import/build proof, error-result unit tests, brand-token/asset contract tests, lint/typecheck/build.

### F03 — Local Supabase, extensions, migrations, seed, and type generation

**Depends on:** `F01`; coordinates with `F02`.

**Authority:** implementation spec §§6.1–6.2, §14.1, §15.

**Outcome:** either partner can recreate the local database entirely from Git.

**Tasks:**

- [x] Initialize local Supabase configuration.
- [x] Add the first forward migration.
- [x] Enable PostGIS, `pg_trgm`, and the chosen case-insensitive slug/handle approach.
- [x] Establish UUID/timestamp/update conventions.
- [x] Create enum types in dependency-safe order or document why an enum is delayed until its domain module.
- [x] Add a deterministic seed skeleton with no secret or provider account dependency.
- [x] Add the pgTAP test structure and one proof test.
- [x] Add database type generation to `types/database.generated.ts`.
- [x] Add scripts for database reset, database tests, and type generation.
- [x] Verify a full reset from an empty local state.

**Writer rotation:** one partner writes migration/config; the other writes the first pgTAP tests and verifies reset/type generation.

**Tests/evidence:** `supabase db reset`, pgTAP proof, generated types, and clean type-drift check on both computers.

### F04 — CI foundation and repository hygiene

**Depends on:** `F01`–`F03`.

**Authority:** implementation spec §14.6, §15; `AGENTS.md` Git rules.

**Outcome:** pull requests automatically reject basic formatting, lint, type, database reset, test, or build regressions.

**Tasks:**

- [x] Add GitHub Actions using the committed lockfile.
- [x] Run formatting check, ESLint, typecheck, available Vitest tests, local Supabase reset, pgTAP, generated-type drift check, and build.
- [x] Cache dependencies safely without hiding lockfile problems.
- [x] Ensure CI does not require a live sports API or production Supabase.
- [x] Add test artifacts/coverage only where useful and non-sensitive.
- [x] Add pull-request template fields defined in §4.
- [x] Enable branch protection after the workflow is green.
- [x] Verify ignored files, generated artifacts, editor files, logs, screenshots, and test traces are handled deliberately.

**Tests/evidence:** a pull request has a successful required CI run, and `main` protection requires that check before merge.

---

## 8. Identity and trust requirement modules

### A01 — Supabase Auth and SSR session flow

**Depends on:** `F04`.

**Authority:** implementation spec §§2.1, 4.1–4.2, 5.3, 11.1.

**Outcome:** a user can sign up, verify email through the local test path, sign in, refresh a server session, and sign out.

**Tasks:**

- [x] Build labelled, accessible signup and sign-in forms.
- [x] Validate form input with Zod on the server.
- [x] Configure allowed auth redirects and a safe callback/verification route.
- [x] Use cookie-based SSR sessions.
- [x] Show generic auth errors without account enumeration.
- [x] Add sign-out that clears private client query state.
- [x] Keep community mutations unavailable until later completion gates exist.
- [x] Add loading, submission, success, error, and expired-verification states.

**Checkpoints:** auth/server/session first; forms and states after role swap.

**Tests/evidence:** unit validation, component forms, and E2E signup/verification/sign-in/sign-out against local Supabase.

### A02 — Cities, profiles, adult attestation, and rules onboarding

**Depends on:** `A01`.

**Authority:** implementation spec §§2.1, 4.1–4.3, 6.3, 10, 11.1.

**Outcome:** a verified user completes an adult profile and accepts the current versioned community rules.

**Tasks:**

- [x] Create and seed `cities` with reviewed Israel entries and centers.
- [x] Create `profiles` with all constraints and indexes.
- [x] Create the Auth-to-profile lifecycle/trigger deliberately.
- [x] Implement unique normalized handle validation.
- [x] Record `adult_attested_at`; do not collect date of birth.
- [x] Add repository-owned versioned community rules content.
- [x] Record current `rules_version` and `rules_accepted_at`.
- [x] Set `profile_completed_at` only after all required fields are valid.
- [x] Build onboarding and profile settings with city fallback.
- [x] Prevent forged direct updates to protected completion fields.

**Checkpoints:** schema/RLS/function; onboarding UI; tests and seeded journey.

**Tests/evidence:** pgTAP constraints/RLS, Zod tests, component form states, E2E rejection without attestation/current rules, and successful completion.

### A03 — Completion gates and safe profile projections

**Depends on:** `A02`.

**Authority:** implementation spec §§2.1, 3, 4.1, 6.10–6.11, 11.2, 11.5.

**Outcome:** anonymous and incomplete users can read only safe data; community actions require verified, complete, non-suspended adult accounts.

**Tasks:**

- [x] Add reusable server-side actor/completion checks.
- [x] Add safe public profile projection without email, private groups, or attendance.
- [x] Add own-profile read/update policies distinct from public projection.
- [x] Add platform role structure and a reviewed local moderator seed/bootstrap approach.
- [x] Add route outcomes for sign-in required, complete-profile required, not permitted, and non-enumerating not found.
- [x] Add public people page using only the safe DTO.
- [x] Test incomplete, unverified, suspended, anonymous, owner, other-user, and moderator cases.

**Tests/evidence:** pgTAP allow/deny matrix, DTO unit tests, component permission states, and crafted-request denial.

### A04 — Blocking foundation and audit trail

**Depends on:** `A03`.

**Authority:** implementation spec §§2.1, 2.7, 6.3, 6.9, 7.4, 11.2, 11.5.

**Outcome:** a user can block privately, and future domains can reuse one tested bidirectional-block rule.

**Tasks:**

- [x] Create `user_blocks` with self-block denial and bidirectional indexes.
- [x] Create the required security-audit structure and minimum safe metadata rules.
- [x] Implement initial `block_user`/unblock behavior against currently existing domains.
- [x] Ensure the blocked user cannot enumerate the block.
- [x] Add reusable blocked-in-either-direction SQL helpers.
- [x] Add block/unblock controls with non-revealing outcomes.
- [x] Record the required block-transaction extension point for later modules when friendships and attendance exist.

**Tests/evidence:** self/duplicate/other-user pgTAP tests, private enumeration denial, audit record without notification, UI state tests.

---

## 9. Sports catalog requirement modules

### S01 — Sport-neutral catalog schema

**Depends on:** `A03`.

**Authority:** implementation spec §§6.5, 6.10–6.11, 12.

**Outcome:** football and a future NBA provider can share one indexed local catalog without implementing NBA.

**Tasks:**

- [x] Create `sports`, `competitions`, `teams`, `competition_teams`, `matches`, and `provider_sync_runs`.
- [x] Seed only the safe minimum, including football.
- [x] Preserve provider identity with unique `(provider, provider_external_id)`.
- [x] Add every competition, team, match-time, status, and provider index from the implementation spec.
- [x] Store UTC `timestamptz`; add no live-score tables.
- [x] Do not store/display provider crest URLs.
- [x] Add public future-match projection and sync-service-only mutations.
- [x] Retain referenced matches instead of deleting them when stale/outside the active window.

**Tests/evidence:** constraints, duplicate-provider IDs, distinct home/away teams, index presence, public read/service write/ordinary-user denial.

### S02 — Provider contract, Zod schemas, and saved fixtures

**Depends on:** `S01`.

**Authority:** implementation spec §7.1, §8.1, §10.1, §14.2.

**Outcome:** sanitized football-data.org responses normalize into provider-independent objects without network access in tests.

**Tasks:**

- [x] Define the `SportsProvider` interface and normalized types.
- [x] Create football-data.org v4 response schemas with Zod.
- [x] Save small sanitized success, empty, changed, rate-limit, and invalid fixtures.
- [x] Normalize competitions, teams, fixtures, UTC times, and statuses.
- [x] Ignore unknown optional provider fields.
- [x] Reject missing required identity/time/team fields visibly.
- [x] Map provider errors to safe categories without tokens or raw payloads.
- [x] Add explicit timeouts and bounded retry metadata, but do not call the live provider in tests.

**Tests/evidence:** unit tests for every saved fixture, identity mapping, timezone conversion, invalid response, and safe error classification.

### S03 — Protected synchronization and local upsert

**Depends on:** `S02`.

**Authority:** implementation spec §§7.2, 8.2–8.3, 11.3–11.4, 13.

**Outcome:** an authenticated internal invocation imports a bounded football window into local PostgreSQL while preserving last-good data on failure.

**Tasks:**

- [x] Add server-only provider token validation.
- [x] Add `POST /api/internal/sports-sync`.
- [x] Compare the sync secret safely before creating a service-role client.
- [x] Add an advisory lock and `SYNC_ALREADY_RUNNING` response.
- [x] Record a running sync row before provider work.
- [x] Intersect provider-accessible competitions with a configuration allowlist.
- [x] Use the yesterday-through-current-season-end window, ending May 31.
- [x] Fetch sequentially or with bounded rate-aware concurrency.
- [x] Upsert normalized rows by provider identity in safe batches/transactions.
- [x] Record counts, duration, request count, outcome, and safe errors.
- [x] Roll back affected work and preserve existing catalog rows on failure.
- [x] Add a local explicit sync command; normal page requests never call the provider.

**Tests/evidence:** invalid-secret denial, ordinary-session denial, overlapping-run conflict, fixture-driven successful upsert, idempotent rerun, changed fixture update, and failure preserving previous rows.

### S04 — Shared shadcn UI, fixture catalog pages, freshness, and attribution

**Depends on:** `S03`.

**Authority:** implementation spec §§4.1, 4.3, 5.1, 8.1, 9, 12.3; brand system component-integration rules.

**Outcome:** Huddle adopts one branded shadcn/Radix component layer, and anonymous visitors browse locally stored future football fixtures by date, competition, and team without a provider request.

**Tasks:**

- [x] Add `components.json` and the minimum shadcn prerequisites compatible with the existing Next.js, React, Tailwind v4, strict-TypeScript, and `@/` alias setup.
- [x] Select Radix-backed shadcn components and preserve `app/globals.css`, Huddle's named brand tokens, Familjen Grotesk, and the replaceable `BrandMark`.
- [x] Add only the shared primitives needed by existing flows and B04, including buttons, fields/labels, checkboxes, cards, badges, alerts, alert dialogs, selects, skeletons, separators, and pagination.
- [x] Migrate suitable existing authentication, profile, status-panel, card, and blocking controls to the shared components without changing behavior, copy, authorization, or focus outcomes.
- [x] Compose fixture filters, `MatchCard`, freshness indicators, and follow controls from the shared primitives rather than creating a parallel UI kit.
- [x] Build match list and match detail Server Components.
- [x] Add bounded filters/pagination and indexed query shapes.
- [x] Add stable empty/loading/error states.
- [x] Show safe freshness/stale status based on the last successful run.
- [x] Keep a provider outage from making cached matches unavailable.
- [x] Add visible football-data.org attribution and a data-sources page.
- [x] Use text initials or original art rather than provider crests.
- [x] Confirm Israel display time around UTC conversion.

**Tests/evidence:** shared-component and migrated-flow regression tests, query/unit tests, component empty/stale/error states, responsive visual evidence, E2E cached browsing during simulated provider failure, and manual network proof that page loads do not call the provider.

### S05 — Sport, competition, and team follows

**Depends on:** `S04`, `A03`.

**Authority:** implementation spec §§1.2, 6.5, 7.3, 9.2.

**Outcome:** a completed user can follow and unfollow each supported sports-catalog target without duplicates.

**Tasks:**

- [x] Create `subscriptions` with exactly-one-target checks and partial unique indexes.
- [x] Add own-row RLS and complete-account gating.
- [x] Add follow/unfollow actions with Zod and actor identity from session.
- [x] Add interest settings and reusable follow controls.
- [x] Invalidate only relevant interest/discovery data.
- [x] Handle pending, success, duplicate/idempotent, error, and unauthorized states.

**Tests/evidence:** target-kind constraints, duplicates, cross-user denial, actions, component states, and onboarding-to-team-follow E2E.

---

## 10. Friendship and group requirement modules

### G01 — Mutual friendship lifecycle and completed block effects

**Depends on:** `A04`.

**Authority:** implementation spec §§2.2, 6.4, 7.3–7.4, 11.2.

**Outcome:** users can request, accept, decline, and remove one canonical direct friendship; friends-of-friends never grant access.

**Tasks:**

- [x] Create canonical low/high friendship pairs with uniqueness and self denial.
- [x] Implement request and recipient-only response functions.
- [x] Reject blocked, duplicate, suspended, and incomplete actors.
- [x] Extend block transaction to remove an existing friendship atomically.
- [x] Add incoming, outgoing, and accepted settings lists.
- [x] Add profile friendship controls with non-enumerating block behavior.
- [x] Never add graph expansion or friends-of-friends queries.

**Tests/evidence:** canonical direction tests, duplicate/self/block denials, response authorization, removal, transactional block effect, component states, two-user E2E.

### G02 — Group schema and atomic creation

**Depends on:** `G01`, `S05`.

**Authority:** implementation spec §§2.3, 6.6, 7.4.

**Outcome:** a complete user creates a discoverable `forming` or immediately usable unlisted group and becomes its active owner.

**Tasks:**

- [x] Create groups, rules, memberships, invite-token metadata, and bans tables.
- [x] Add slugs, team/city relationships, lifecycle, role, status, and all indexes.
- [x] Create group plus active owner membership atomically.
- [x] Enforce one active owner and protect the sole owner invariant.
- [x] Build similar-name/team/city suggestion query using `pg_trgm`.
- [x] Build the group creation flow with discoverable/unlisted explanation.
- [x] Add public safe group summary and protected member-content boundary.

**Tests/evidence:** creation rollback safety, owner invariant, duplicate slug, similar suggestions without leaking unlisted groups, and creation E2E.

### G03 — Discoverable applications and membership review

**Depends on:** `G02`.

**Authority:** implementation spec §§2.3, 6.6, 6.11, 7.3–7.4.

**Outcome:** a user applies to a discoverable group and an owner/admin approves or rejects the application.

**Tasks:**

- [x] Add application message validation and sensitive-data warning.
- [x] Add pending application creation for discoverable groups.
- [x] Add own-application and admin-review RLS.
- [x] Implement valid reviewer and transition functions with audit events.
- [x] Add group application form and management queue.
- [x] Add active-member safe roster without exposing private profile data.
- [x] Add leave behavior that retains membership history.

**Tests/evidence:** duplicate/pending/blocked/banned/incomplete denial, non-admin review denial, approve/reject/leave, audit evidence, component and E2E flows.

### G04 — Unlisted invite application flow

**Depends on:** `G03`.

**Authority:** implementation spec §§2.3, 6.6, 7.4, 11.5.

**Outcome:** an expiring, revocable, usage-limited, high-entropy invite starts an application but never bypasses admin approval.

**Tasks:**

- [x] Generate a cryptographically strong token and store only its SHA-256 digest.
- [x] Return the plaintext token once on creation and never list it again.
- [x] Add expiry, revocation, maximum-use, and atomic successful-use counting.
- [x] Add `/join/group/[token]` with minimal invalid/expired messaging.
- [x] Prevent token use by blocked/banned/incomplete users.
- [x] Ensure a valid token creates only a pending application.
- [x] Add admin metadata and revoke controls.

**Tests/evidence:** plaintext absence from DB/logs, invalid/expired/revoked/exhausted/concurrent-use tests, ban denial, pending-not-active proof, and E2E.

### G05 — Roles, rules, bans, and group administration

**Depends on:** `G04`.

**Authority:** implementation spec §§2.3, 2.7, 3, 6.6, 6.11.

**Outcome:** owners/admins manage bounded group responsibilities while members and banned users remain correctly limited.

**Tasks:**

- [x] Add rule create/reorder/publish operations.
- [x] Add owner-only admin promotion/demotion.
- [x] Prevent removal/demotion of the sole owner.
- [x] Add member leave, admin removal if specified, ban, and unban transitions.
- [x] Deny active bans from content, invites, and reapplication.
- [x] Keep group admins unable to access platform reports.
- [x] Add confirmation dialogs and clear role/status labels.

**Tests/evidence:** full role/action matrix, sole-owner tests, ban/reapplication/content denial, admin/report denial, audit events, accessible UI tests.

**B06 approved implementation decisions:** an eligible signed-in user with a direct URL may read the safe summary of a forming discoverable group and apply, while anonymous/global discovery remains closed. New applications are denied across a block with the owner; invite use also checks the invite creator. An ordinary interpersonal block does not silently rewrite an already active group membership. The owner alone promotes/demotes admins and may manage any non-owner; an admin manages applicants and ordinary members, never the owner or another admin. Revoking a group ban does not restore membership and permits only a fresh pending application. Owner transfer, arbitrary non-ban removal, group discovery activation, group events, notifications, and platform-report implementation remain outside B06.

---

## 11. Venue, event, and discovery requirement modules

### E01 — Unverified venue profiles and follows

**Depends on:** `S05`, `A03`.

**Authority:** implementation spec §§2.8, 4.1, 6.7, 7.5.

**Outcome:** a complete user creates and manages a visibly unverified public venue, and users can follow it.

**Tasks:**

- [x] Create venues and venue follows with public location and all indexes.
- [x] Limit status changes to platform moderators; default user-created venues to unverified.
- [x] Build create, edit, public detail, and manage pages.
- [x] Display `unverified` everywhere the venue identity appears.
- [x] Add venue follow/unfollow with own-row RLS.
- [x] Prevent cross-owner edits and suspended venue publication.
- [x] Do not add subscriptions, payments, menus, promotions, or fake verification.

**Tests/evidence:** ownership/RLS, public projection, moderator-only status, follow duplicates, component badge, cross-user crafted edit denial, E2E.

### E02 — Event schema, lifecycle, and controlled mutation boundary

**Depends on:** `E01`, `G05`, `S04`.

**Authority:** implementation spec §§2.4–2.6, 6.8, 7.4.

**Outcome:** the database can represent valid Huddle events and reject invalid host/audience/place combinations even when requests bypass the UI.

**Tasks:**

- [x] Create event, private-location, invitation, and attendance tables in a forward migration.
- [x] Add exactly-one-host, target-column, time, capacity, and place-field constraints.
- [x] Add all B-tree and spatial indexes.
- [x] Implement controlled create/update function for cross-table invariants.
- [x] Enforce private-person audiences: group/friends/invite-only only.
- [x] Enforce venue audiences: public/team-followers only.
- [x] Enforce private person place as home/public-place and venue host place as venue.
- [x] Require fixture attachment for the MVP.
- [x] Force approval for private-person events.
- [x] Enforce home capacity 1–12 and no guest-count field.
- [x] Preserve draft/pending/published/cancelled/completed history.

**Tests/evidence:** pgTAP for every valid and crafted invalid combination, ownership, indexes, no-plus-one schema proof, and update transitions.

### E03 — Private-person event creation and protected location

**Depends on:** `E02`.

**Authority:** implementation spec §§2.4–2.5, 4.2–4.3, 6.8, 11.5.

**Outcome:** a private person creates group/friends/invite-only events, including a home event whose exact address never enters the ordinary event response.

**Tasks:**

- [x] Build an event wizard that starts from a synchronized future match.
- [x] Show only private-person audience choices for a personal host.
- [x] Validate required group/friend/invite relationships.
- [x] Support home and public-place details with different privacy copy.
- [x] Write home address/coordinate only through the controlled transaction into `event_private_locations`.
- [x] Deny all direct client select/update of private locations.
- [x] Return only city/coarse distance context before approval.
- [x] Show the 12-person cap, registered-users-only rule, host presence, and address-sharing warning.
- [x] Add draft/publish states and group-review submission where required.

**Tests/evidence:** private location absent from HTML/network/DTO/log, direct-select denial, invalid public audience crafted request, capacity >12 denial, form states, private event E2E up to unpublished/eligible summary.

**B07 implementation decisions:** venue owners enter a reviewed Israel coordinate manually; no map or paid address service is added. Every user-created venue remains visibly `unverified`, and only a platform moderator can change that status. The private-event wizard derives its kickoff and three-hour window from a synchronized future match. A group-audience publish action creates `pending_group_review`; friends and invite-only events may publish immediately, while invite-only remains host-only until B10 adds direct invitations. The controlled event transaction already enforces the valid venue-host invariants needed by the shared event model, but B07 exposes only the private-host creation interface and ordinary safe event projection. Exact-location retrieval, invitation mutation, attendance transitions, cancellation controls, the venue-host creation interface, group publication review, and discovery remain in their owning later milestones.

### E04 — Business-venue event creation and public pages

**Depends on:** `E02`, `E01`.

**Authority:** implementation spec §§2.4, 2.8, 4.1–4.2, 6.8.

**Outcome:** a venue owner publishes a public or team-followers fixture event at their venue with a visible unverified status.

**Tasks:**

- [x] Show only public/team-followers audience options for venue-hosted events.
- [x] Require the selected team for team-followers.
- [x] Default venue attendance to immediate approval while allowing approval mode.
- [x] Use the owned venue location; do not accept a forged venue owner/host ID.
- [x] Build safe anonymous event summary/detail pages.
- [x] Label venue verification and any costs/commercial affiliation truthfully.
- [x] Deny private audience types and suspended/non-owned venue hosting.

**Tests/evidence:** host ownership, audience/target checks, anonymous safe reads, component selector options, crafted invalid requests, and venue-event E2E.

### E05 — Group event submission and publication review

**Depends on:** `E03`, `G05`.

**Authority:** implementation spec §§2.3–2.4, 6.8, 7.4.

**Outcome:** an active group member submits a group event, and only an owner/admin can approve publication.

**Tasks:**

- [x] Keep `organizing_group_id` separate from `audience_group_id`.
- [x] Permit active members to submit; do not publish automatically.
- [x] Add `pending_group_review` and admin approve/reject transition.
- [x] Enforce active/non-banned member and reviewer conditions.
- [x] Add submitted-event queue and factual status UI.
- [x] Re-evaluate group discoverability after event approval/cancellation/time changes.
- [x] Finish `G06` forming-to-searchable E2E only after all gate facts are met.

**Tests/evidence:** non-member/banned/member/admin matrix, premature visibility denial, approval audit, cancellation gate recalculation, member-to-admin E2E.

### G06 — Discovery gate and group search

**Depends on:** `G05`, `E05`.

**Authority:** implementation spec §§2.3, 7.2, 7.4, 12.2.

**Outcome:** search returns only active discoverable groups, while the gate truthfully explains every unmet condition.

**Tasks:**

- [x] Implement `evaluate_group_discoverability` with five members, two moderators including owner, description, published rule, and approved future event.
- [x] Recalculate after relevant membership, role, rule, description, event, cancellation, and suspension transitions.
- [x] Add indexed, paginated `GET /api/groups/search`.
- [x] Never expose unlisted groups or other users' forming groups through search/similarity.
- [x] Build group list/search and a forming progress panel for authorized admins.
- [x] Complete the future-event gate and activation E2E using the group-event flow from `E05`.

**Tests/evidence:** one-fact-at-a-time threshold tests, leakage denials, deterministic pagination, suspension removal, search/component tests, and complete forming-to-searchable E2E.

### E06 — Audience-aware event detail and safe projections

**Depends on:** `E03`–`E05`, `G01`.

**Authority:** implementation spec §§2.4–2.5, 4.1, 6.10–6.11.

**Outcome:** every actor sees exactly the permitted event summary without learning whether an invisible private event exists.

**Tasks:**

- [x] Implement visible event summary projection/RPC.
- [x] Apply group, direct-friend, invite-only, public, and team-follower summary rules.
- [x] Apply blocks, bans, suspensions, lifecycle, and time filters.
- [x] Use non-enumerating not-found behavior for invisible private events.
- [x] Return only bounded safe attendee/context information.
- [x] Keep exact home location inaccessible through all normal event queries.
- [x] Add audience, place, capacity, host, and verification badges.

**Tests/evidence:** full anonymous/unrelated/friend/member/invitee/follower/blocked/banned/host matrix in pgTAP and E2E; payload inspection for location leakage.

**B08 implementation decisions:** venue creation starts from an owned venue profile, and the server re-derives the venue, city, kickoff, and event window before using the controlled event transaction. Group organization is an independent choice from event audience; every organized publication waits in `pending_group_review`, and rejection uses the existing audited terminal `cancelled` state rather than adding an unapproved lifecycle value. Safe summaries contain bounded attendance counts and only the current viewer's attendance state, never attendee identities or exact home fields. Event approval, cancellation, and edited kickoff facts recalculate the group event gate now. The still-open cross-module `G06` search E2E above remains assigned to B09, together with the other discovery-gate triggers, progress UI, and global search endpoint.

### E07 — PostGIS discovery API and interface

**Depends on:** `E06`, `S05`.

**Authority:** implementation spec §§4.1–4.3, 7.2, 9, 12.

**Outcome:** anonymous and signed-in users discover only eligible future events using a city or one-request browser location with cursor pagination.

**Tasks:**

- [x] Implement `discover_events(filters, cursor, limit)` in the database.
- [x] Bound radius, dates, filters, limit, and coordinate ranges.
- [x] Apply status, audience, block, ban, interest, time, and location rules before returning rows.
- [x] Use PostGIS GiST indexes and keyset cursor ordering with an ID tie-breaker.
- [x] Add opaque/tamper-resistant cursor encode/decode.
- [x] Add `GET /api/discovery` with narrow DTO and privacy-safe cache headers.
- [x] Store browser coordinates only for the request; do not create location history.
- [x] Build URL-owned filters, browser permission prompt, city fallback, and TanStack Query cursor pages.
- [x] Avoid per-card N+1 requests and never fetch exact private location.
- [x] Add empty, loading, retry, permission-denied, stale, and end-of-list states.

**Tests/evidence:** SQL query and authorization matrix, cursor tests, query-count inspection, component geolocation denial, E2E personalized/anonymous discovery, representative `EXPLAIN` evidence.

**B09 implementation decisions:** group lifecycle is recalculated from current gate facts after every relevant membership, role, rule, description, event, ban, and suspension transition; search also requires a currently future published group event so wall-clock expiry cannot leak a stale group. Event discovery uses one authorization-filtered RPC and one safe DTO page rather than per-card reads. Spatial candidates are selected separately from indexed public-place, venue, and protected-home locations, while responses expose only a coarse distance band and never an exact address, coordinate, or distance. Signed cursors are endpoint-scoped and bound to normalized filters. Browser coordinates are requested only after an explicit click, sent for that discovery request, omitted from address-bar state, and discarded when city fallback is restored. Database date bounds compare Israel calendar timestamps, so 23-hour and 25-hour daylight-saving transition days do not change the accepted discovery window.

---

## 12. Attendance and calendar requirement modules

### T01 — Direct invitations and atomic acceptance

**Depends on:** `E06`.

**Authority:** implementation spec §§2.4–2.6, 6.8, 7.4.

**Outcome:** a host invites a registered eligible user, who accepts or declines; acceptance atomically reserves one place.

**Tasks:**

- [x] Create invite/revoke/respond functions around the existing invitation schema.
- [x] Prevent duplicate, self, blocked, suspended, ineligible, cancelled, started, or full invitations/acceptance.
- [x] Treat accepted private-event invitation as pre-approved attendance.
- [x] Allow direct invitation to override only team-follow for venue events.
- [x] Never bypass adult/completion, block, capacity, cancellation, or one-seat rules.
- [x] Make pending invite revocation distinct from removing an approved attendee.
- [x] Build invite manager and invitee dashboard states.

**Tests/evidence:** transition matrix, invitation override boundaries, capacity race on acceptance, no guest field/control, component/E2E.

### T02 — Request, join, approve, and decline attendance

**Depends on:** `T01`, `E07`.

**Authority:** implementation spec §§2.6, 7.3–7.4, 9.2, 12.2.

**Outcome:** eligible users join immediate venue events or request approval; hosts approve/decline without exceeding capacity.

**Tasks:**

- [x] Implement `request_or_join_event` with all current eligibility checks.
- [x] Keep pending requests from consuming capacity.
- [x] Implement review transaction that locks event, rechecks manager/attendee/event, counts approved rows, and updates once.
- [x] Return stable conflicts such as `EVENT_FULL` without partial changes.
- [x] Keep one event/user attendance row through transitions.
- [x] Implement factual request context: verified account, age of account, mutual accepted friends, shared active groups, relevant follows.
- [x] Do not add a numeric reputation score or reveal full graphs.
- [x] Build attendee request/review lists and TanStack mutation invalidation.
- [x] Never optimistically claim an approved seat.

**Tests/evidence:** concurrent approval pgTAP/integration test, eligibility matrix, stable error mapping, component pending/error/success, host-review E2E.

### T03 — Leave, removal, cancellation, and private-location revocation

**Depends on:** `T02`.

**Authority:** implementation spec §§2.5–2.7, 6.8, 7.4, 11.5.

**Outcome:** currently authorized attendees can retrieve exact home details through one audited path, and every relevant safety transition revokes future access while preserving history.

**Tasks:**

- [x] Implement audited `get_private_event_location` with a fixed safe search path and minimal result.
- [x] Recheck current approval, relationship, group eligibility, block, ban, suspension, and cancellation on every call.
- [x] Implement attendee leave as retained `left` history.
- [x] Implement host removal as retained `removed` history with reason/audit.
- [x] Extend block transaction to end affected future home attendance/address access atomically.
- [x] Revoke access after group ban/loss, cancellation, suspension, leave, and removal.
- [x] Reject material host/audience/place/private-address changes after first approval and require cancellation/new event.
- [x] Keep invitations and attendance on cancellation.
- [x] Build authorized-details, leave, remove, and cancel controls with confirmations.

**Tests/evidence:** direct table denial; before/after approval, leave, removal, block, ban, cancellation, and suspension tests; audit records; material-change denial; payload/source/log inspection; E2E flows.

### T04 — RFC 5545 calendar export

**Depends on:** `T03`.

**Authority:** implementation spec §7.2, §9.3, §10, §14.2.

**Outcome:** an authorized user downloads a valid `.ics` file containing no location they are not currently allowed to read.

**Tasks:**

- [x] Add pure calendar serialization with RFC 5545 text escaping and line folding.
- [x] Emit stable UID, DTSTAMP, UTC DTSTART/DTEND, summary, description, URL, and authorized location.
- [x] Add the route with safe content type/disposition and cache policy.
- [x] Allow anonymous calendar only for safe public venue events.
- [x] Require current session/audience authorization for private events.
- [x] Reuse the audited private-location function; do not duplicate authorization.
- [x] Omit private address after any revocation transition.

**Tests/evidence:** unit fixtures for escaping/folding/time/UID, authorization matrix, valid file manual import, private no-store header, E2E location before/after revocation.

**B10 implementation decisions:** invitations and attendance mutate only through authenticated security-definer functions; direct invitation supplies invite-only eligibility and bypasses only the venue team-follow requirement. Event-row locks serialize every seat reservation, deterministic canonical-pair locks coordinate block-sensitive transitions, and separate two-connection regressions prove both approval and direct-invitation acceptance cannot overfill the final place. Direct table reads are removed in favor of bounded manager, attendee, and dashboard projections. Protected home details are returned only through one current-authorization function that writes an address-free audit record, while leave, removal, blocking, suspension, relationship or group eligibility loss, and cancellation revoke later reads. Hosts may remove or cancel during an in-progress event so the safety transition remains usable when it matters. The repository-owned Radix confirmation controls expose retained history clearly, and the RFC 5545 route includes a home location only when that same audited authorization succeeds.

---

## 13. Moderation, security, and quality requirement modules

### M01 — Reporting and immediate user safety controls

**Depends on:** `A04`, `E06`.

**Authority:** implementation spec §2.7, §§6.9–6.11, §7.3–7.4.

**Outcome:** a user can block without reporting and can confidentially report a profile, group, venue, or event before or after it occurs.

**Tasks:**

- [x] Create reports with exactly-one-target constraints and the locked categories.
- [x] Keep reporter identity/details hidden from target and group admins.
- [x] Allow reporter to see only safe status, not investigation notes.
- [x] Add block and report controls on relevant pages.
- [x] Add imminent-danger copy directing users to local emergency services while preserving report submission.
- [x] Add bounded details and spam controls without blocking genuine danger reports.
- [x] Add the community-rules prohibitions and sensitive-question warnings to relevant flows.

**Tests/evidence:** target constraints, reporter/target/group-admin/moderator policy matrix, before/after event reports, emergency state, confidentiality E2E.

### M02 — Moderation actions, suspension, and appeals

**Depends on:** `M01`.

**Authority:** implementation spec §§2.7, 3, 6.9, 7.3–7.4.

**Outcome:** a platform moderator processes reports with an auditable proportional action, and an affected user can appeal.

**Tasks:**

- [x] Implement moderation queue assignment and safe report details.
- [x] Implement allowed enforcement actions with required reason and transactional state change.
- [x] Add reversal evidence.
- [x] Implement one active appeal per action/appellant.
- [x] Prefer a reviewer different from the original moderator where practical.
- [x] Keep platform moderation distinct from group administration.
- [x] Propagate suspensions through visibility, mutation, event, attendance, and private-location rules.
- [x] Build moderator queue and user appeal/outcome screens.

**Tests/evidence:** ordinary/group-admin denial, action transaction, visibility/access changes, appeal authorization/uniqueness/reviewer rules, audit records, full E2E.

### M03 — Security, abuse resistance, headers, and secret audit

**Depends on:** all feature modules through `M02`.

**Authority:** implementation spec §§10–11, §13.

**Outcome:** the complete application has explicit, tested security boundaries rather than relying on UI hiding.

**Tasks:**

- [x] Inventory every exposed table and prove RLS is enabled/forced and deny-by-default.
- [x] Inventory every Server Action and Route Handler for Zod validation, actor derivation, and same-origin behavior.
- [x] Add request-body and list/string bounds.
- [x] Add database/hosting cooldowns for friend requests, group applications/invites, event creation, and report spam.
- [x] Confirm all GET routes are read-only.
- [x] Add CSP, HSTS production configuration, frame protection, referrer policy, and content-type options.
- [x] Validate redirect destinations against an internal allowlist.
- [x] Search client bundles, network responses, logs, Git history/diff, and test artifacts for secrets/private addresses.
- [x] Add structured safe request/action/sync logs and authorization-failure signals.
- [x] Document residual risks honestly.

**Tests/evidence:** RLS matrix, cross-user crafted requests, origin/header tests where practical, rate-limit behavior, client-bundle inspection, secret scan, and security checklist.

### M04 — Accessibility, responsive UX, failure states, and observability

**Depends on:** all UI feature modules.

**Authority:** implementation spec §§4.3, 13, 14.3–14.5.

**Outcome:** the core loop is usable on phone/desktop and keyboard, and important failures are visible without leaking data.

**Tasks:**

- [x] Review every form for labels, field errors, pending state, status announcements, keyboard operation, and focus return.
- [x] Review dialogs/menus for focus trapping and escape behavior.
- [x] Ensure status is not communicated only by color.
- [x] Add responsive checks for all presentation/demo routes.
- [x] Cover loading, empty, retry, stale, denied, cancelled, removed, suspended, and not-found states.
- [x] Check Israel dates around daylight-saving transitions.
- [x] Track discovery duration, sync age/outcome, sync requests, route/action errors, quota observations, and repeated authorization failures.
- [x] Write short runbooks for failed sync, token rotation, bad migration, suspension, and urgent report removal.

**Tests/evidence:** component accessibility tests, manual keyboard/screen-reader naming pass, phone/desktop screenshots, failure-state E2E, runbook review by both partners.

**B11 implementation decisions:** confidential reports, enforcement actions, appeals, and reversals are exposed only through bounded security-definer functions; reporters receive a safe status projection while report details remain platform-only. Ordinary community mutations take a shared profile lock, and enforcement takes the matching exclusive lock so suspension cannot race past an eligibility check. Timed restrictions and suspensions use a review deadline but stay effective until a moderator records an audited reversal. High-impact enforcement choices require a deliberate Radix confirmation before submission; warnings and correction requests remain direct, while feature restriction, account/group/venue suspension, permanent ban, and event cancellation are confirmed with keyboard focus containment, Escape/cancel behavior, and trigger-focus restoration. Once an appeal is active, its review path owns the terminal decision: direct reversal takes the same action-row lock as appeal submission and is rejected until the appeal is decided. Appeal review is assigned to a different eligible non-appellant moderator whenever one exists; when the only peer is the appellant, the original moderator may decide so the appeal cannot deadlock. All exposed tables are re-inventoried for forced RLS, route/action inputs are bounded, internal redirects are allowlisted, production security headers are explicit, and logs accept only safe operational fields. GET routes do not mutate product state; the private calendar path writes only the mandated address-free access audit. Local secret comparison ignores only the exact committed placeholder for each variable. Repository-owned Radix dialogs and the mobile menu provide keyboard focus behavior; the B11 journey proves a confidential report, proportional action, independent appeal, phone navigation, and overflow-safe moderation UI. The final deployed VoiceOver and production smoke pass remains in B13.

---

## 14. Delivery requirement modules

### D01 — Complete automated acceptance and CI gates

**Depends on:** `M04`.

**Authority:** implementation spec §14.

**Outcome:** all required database, unit, component, and 17 end-to-end flows run deterministically without live provider traffic.

**Tasks:**

- [x] Complete every pgTAP category in §14.1.
- [x] Complete every Vitest category in §14.2.
- [x] Complete every React Testing Library category in §14.3.
- [x] Implement all 17 Playwright flows in §14.4 with deterministic seed users/data.
- [x] Ensure tests never depend on ordering, clock, provider network, or production state accidentally.
- [x] Add coverage reports as diagnostic evidence, not a substitute for behavior tests.
- [x] Make the complete CI sequence match §14.6.
- [x] Prove generated database types have no drift.

**B12 local acceptance evidence (2026-08-29):** `npm run test:acceptance`
passed from a clean lockfile install with format, lint, typecheck, 90 Vitest files / 403
tests and coverage, reset migrations/seed plus schema lint, 18 pgTAP files / 975 assertions,
generated-type drift, production build, all 17 Playwright journeys, secret/artifact
audit, and diff hygiene. PR/main CI and the independent partner run remain the exit
evidence for merge; hosted checks remain B13 (`D02`–`D04`).

**Team checkpoint:** split test-writing checkpoints, not feature ownership. Each partner must write or meaningfully improve database, unit/component, and E2E coverage.

**Exit evidence:** a clean CI run from a fresh pull request and a recorded mapping from each critical rule to at least one enforcement layer and test.

### D02 — Preview and production environments

**Depends on:** `D01`.

**Authority:** implementation spec §§15.4–15.5.

**Outcome:** preview and production are configured separately; the public Vercel deployment works with the matching Supabase schema and Auth redirects.

**Tasks:**

- [x] Create or confirm separate local, preview/staging, and production configurations.
- [x] Ensure previews do not mutate production by default.
- [ ] Create/configure Supabase and Vercel only with both partners' explicit approval.
- [x] Apply the committed 12-migration history before deploying code that requires it.
- [ ] Configure public URLs, Auth redirects, allowed origins, and environment-specific secrets.
- [ ] Verify anonymous public browse and signed-in session behavior.
- [ ] Verify no service secret appears in browser bundles or network traffic.
- [x] Record a dated pre-deployment quota/limit snapshot for the course scale deliverable; add selected-plan usage after deployment.

**Tests/evidence:** production smoke test in a signed-out browser and with at least two deterministic test accounts; migration parity proof.

### D03 — Scheduled sports sync and operational production acceptance

**Depends on:** `D02`, `S03`.

**Authority:** implementation spec §§8, 13, 15.5.

**Outcome:** Supabase Cron securely invokes only the protected production sync route about every six hours, and failures leave cached fixtures usable.

**Tasks:**

- [x] Reverify the current provider plan, coverage, rate limit, attribution, and terms before registration/use.
- [ ] Register/configure the football provider only with explicit partner approval.
- [ ] Store the provider token and service role only in server secret stores.
- [ ] Store the sync call secret in both Vercel and Supabase Vault.
- [x] Configure the bounded competition allowlist.
- [ ] Configure Supabase Cron/`pg_net` for the six-hour schedule.
- [ ] Verify one successful run and its safe `provider_sync_runs` evidence.
- [ ] Simulate/observe a failed run and verify last-good fixtures remain browsable with stale status.
- [ ] Exercise the token-rotation and failed-sync runbooks.

**Tests/evidence:** protected-route production proof, successful run ID/counts, invalid-secret denial, no browser provider calls, cached-outage smoke test.

### D04 — Final documentation, submission, and presentation rehearsal

**Depends on:** `D01`–`D03`.

**Authority:** implementation spec §§16–18; architecture §9.

**Outcome:** the repository, public deployment, written deliverables, and 10–15 minute presentation describe the working system truthfully.

**Tasks:**

- [x] Update README setup, environment names, commands, architecture, status, and candidate public URL; final deployment acceptance remains pending.
- [x] Complete the official product, technical, test, scalability, and security deliverable sources in the submission index.
- [x] Replace “specified” traceability cells with truthful actual/pending implementation, test, and presentation evidence.
- [x] Add GitHub link, candidate live URL, data attribution, and exact local reproduction steps; final URL acceptance remains pending.
- [ ] Fresh-clone and reproduce the application on the second computer.
- [ ] Rehearse the core demo using deterministic accounts/data.
- [ ] Rehearse one browser-to-server-to-database/RLS trace.
- [ ] Rehearse one private-address denial, one atomic-capacity test, and one provider-outage result.
- [ ] Divide speaking turns, not feature ownership; both partners must explain architecture, security, tests, and trade-offs.
- [ ] Keep the presentation within 10–15 minutes.
- [ ] Distinguish every deferred feature from the working MVP.

**Exit evidence:** public URL, green main CI, fresh-clone success, completed traceability matrix, final repository review, and timed rehearsal completed by both partners.

---

## 15. Cross-module rules that are never postponed

These are not final-week cleanup items. Apply them in every relevant module and milestone:

- Validate untrusted input with Zod at the server boundary.
- Derive the actor from the authenticated session, never from a submitted user ID.
- Enforce authorization in RLS/database functions, not only the interface.
- Add constraints and indexes in the same migration as a new table/relationship.
- Add allowed and denied pgTAP cases with every security-sensitive migration.
- Regenerate database TypeScript types after schema changes.
- Store all dates as UTC and display Israel time by default, using `Asia/Jerusalem` internally for daylight-saving correctness.
- Keep user text plain and React-escaped; do not render raw HTML.
- Keep exact home data, secrets, invite tokens, sessions, and reports out of logs and public DTOs.
- Retain attendance/moderation history through status transitions instead of routine hard deletes.
- Paginate potentially growing collections and avoid `SELECT *` DTOs.
- Handle loading, empty, error, unauthorized, and retry states as part of the feature.
- Use saved sanitized provider fixtures in CI; never call the live sports API there.
- Update documentation when behavior becomes real or a product invariant changes.
- Do not add deferred features or unapproved architecture dependencies.

---

## 16. Stop conditions

Stop the active milestone and discuss before proceeding when:

- a proposed change contradicts a locked product/safety rule;
- a migration would expose or destructively rewrite existing data;
- the two Codex plans disagree about an authorization boundary;
- the branch contains unexplained changes from another task;
- a secret or private address appears in a diff, log, payload, screenshot, or chat;
- tests require production data or a live provider unexpectedly;
- a new dependency duplicates existing framework capability;
- completion requires payment, account creation, deployment, or a hosted mutation that the partners have not approved;
- work expands beyond the milestone's mapped modules or introduces an unplanned product outcome.

When stopped, preserve the current branch, record the blocker and evidence, and resolve the decision before asking Codex to continue.

---

## 17. Progress ledger

Track one status per delivery milestone. Update the detailed module task boxes as implementation becomes real, but do not create separate ledger rows, issues, branches, pull requests, or review cycles for the included modules.

Valid values: `not started`, `planning`, `building`, `review`, `blocked`, `done`.

### Completed foundation history

| Checkpoint | Status | Issue/PR |
|---|---|---|
| F00 Baseline and scope | done | [#1](https://github.com/gethuddle/huddle/issues/1) |
| F01 Next.js scaffold | done | [#2](https://github.com/gethuddle/huddle/issues/2) / [PR #3](https://github.com/gethuddle/huddle/pull/3) |
| F02 Environment and app shell | done | [#5](https://github.com/gethuddle/huddle/issues/5) / [PR #6](https://github.com/gethuddle/huddle/pull/6) |
| F03 Local Supabase foundation | done | [#7](https://github.com/gethuddle/huddle/issues/7) / [PR #8](https://github.com/gethuddle/huddle/pull/8) |

### Thirteen remaining milestones

| Milestone | Included modules | Status | Issue/PR |
|---|---|---|---|
| B01 Platform quality and authentication | `F04`, `A01` | done | [#9](https://github.com/gethuddle/huddle/issues/9) / [PR #10](https://github.com/gethuddle/huddle/pull/10) |
| B02 Onboarding, eligibility, and blocking | `A02`–`A04` | done | [#11](https://github.com/gethuddle/huddle/issues/11) / [PR #12](https://github.com/gethuddle/huddle/pull/12) |
| B03 Sports catalog and ingestion | `S01`–`S03` | done | [#13](https://github.com/gethuddle/huddle/issues/13) / [PR #14](https://github.com/gethuddle/huddle/pull/14) |
| B04 Fixture browsing, follows, and shadcn UI | `S04`–`S05` | done | [#16](https://github.com/gethuddle/huddle/issues/16) / [PR #17](https://github.com/gethuddle/huddle/pull/17) |
| B05 Friendships and group creation | `G01`–`G02` | done | [#18](https://github.com/gethuddle/huddle/issues/18) / [PR #19](https://github.com/gethuddle/huddle/pull/19) |
| B06 Group membership and administration | `G03`–`G05` | done | [#20](https://github.com/gethuddle/huddle/issues/20) / [PR #21](https://github.com/gethuddle/huddle/pull/21) |
| B07 Venues and private-event foundations | `E01`–`E03` | done | [#22](https://github.com/gethuddle/huddle/issues/22) / [PR #23](https://github.com/gethuddle/huddle/pull/23) |
| B08 Venue/group events and safe visibility | `E04`–`E06` | done | [#24](https://github.com/gethuddle/huddle/issues/24) / [PR #25](https://github.com/gethuddle/huddle/pull/25) |
| B09 Group and event discovery | `G06`, `E07` | done | [#26](https://github.com/gethuddle/huddle/issues/26) / [PR #27](https://github.com/gethuddle/huddle/pull/27) |
| B10 Invitations, attendance, and calendar | `T01`–`T04` | done | [#28](https://github.com/gethuddle/huddle/issues/28) / [PR #29](https://github.com/gethuddle/huddle/pull/29) |
| B11 Moderation, security, and accessibility | `M01`–`M04` | done | [#30](https://github.com/gethuddle/huddle/issues/30) / [PR #31](https://github.com/gethuddle/huddle/pull/31) |
| B12 Release candidate and automated acceptance | `D01` | done | [#32](https://github.com/gethuddle/huddle/issues/32) / [PR #33](https://github.com/gethuddle/huddle/pull/33) |
| B13 Production acceptance and submission | `D02`–`D04` | not started | — |

---

## 18. The rule to remember

For every delivery milestone:

> Both understand it → one Codex writes it → the user invokes `$huddle-publish-pr` → the other Codex reviews it → the reviewer explicitly authorizes GitHub submission and merge → swap roles.

That keeps both partners involved in every feature while preventing two AI editors from silently producing conflicting code, migrations, or assumptions.
