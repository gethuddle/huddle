# Huddle: Step-by-Step Team Build Specification

**Purpose:** turn Huddle's architecture and implementation specification into small, ordered work packages that two people using two separate Codex sessions can complete together.

**Status:** execution plan only. This document does not mean any application feature is implemented.

**Authority:** [HUDDLE-IMPLEMENTATION-SPEC.md](./HUDDLE-IMPLEMENTATION-SPEC.md) remains the normative product and engineering contract. [HUDDLE-ARCHITECTURE.md](./HUDDLE-ARCHITECTURE.md) explains the product vision. This file controls work order and collaboration, but it MUST NOT silently change either source.

**Operating rule:** one branch, one active writer, two participating humans, and two separate Codex sessions alternating between implementation and review.

---

## 1. What working together means

Both partners participate in every feature, but they do not both edit the same feature at the same time.

For each work package:

1. Both partners read the package and the referenced authoritative sections.
2. Both explain the expected user behavior in their own words.
3. Both Codex sessions may inspect and propose a plan.
4. The partners reconcile those plans into one short checklist.
5. One Codex becomes the only writer for the first checkpoint.
6. The other partner watches, asks questions, navigates, and challenges decisions in the shared Zed session.
7. The writer runs the required checks, commits, and pushes the checkpoint.
8. The other Codex reviews the committed diff without editing it.
9. The partners discuss every blocking finding and accept or reject it with a reason.
10. The roles swap for the next checkpoint wherever the package has another coherent implementation surface.
11. Both partners run or observe the final acceptance flow and explain the data and authorization path.
12. The pull request is merged only after both agree that the package is done.

Zed collaboration provides the shared editor, cursors, terminal view, and conversation. GitHub provides the durable branch, issue, pull request, review, and history. `AGENTS.md` and the repository documents give both Codex sessions the same durable rules. The Codex chat transcripts themselves remain separate.

### 1.1 The normal role rotation

Use these roles instead of assigning one person to frontend and the other to backend:

| Checkpoint | Person 1 | Person 2 |
|---|---|---|
| Understand and plan | Explain requirements and inspect with Codex | Explain requirements and inspect with Codex |
| Data/server checkpoint | Writer with Codex; narrates changes | Co-navigator; challenges authorization and data decisions |
| Review checkpoint | Answers questions; does not change code yet | Runs read-only Codex review |
| UI/consumer checkpoint | Co-navigator and later reviewer | Writer with Codex; narrates changes |
| Tests and acceptance | Runs or improves tests | Runs or improves tests |
| Final explanation | Explains browser-to-database flow | Explains permissions, failure cases, and tests |

Some early foundation packages do not have separate database and UI checkpoints. For those packages, use one writer and one reviewer, then reverse the initial writer on the next package.

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

Do not retype the publish, review, and merge command sequence for every package. Codex discovers the checked-in skills under `.agents/skills/` from either clone:

- `$huddle-publish-pr` is the active writer's handoff. After the current user directly invokes it as a publish command or otherwise explicitly asks it to publish, it verifies and records the writer checkpoint, publishes one PR, and requests the other partner. It never merges.
- `$huddle-review-merge` is the requested partner's second-clone review. It reproduces the package evidence and reviews the complete diff locally. It submits a GitHub review only when the current user explicitly asks it to submit one, and it may merge only when the current user separately and explicitly asks it to merge a clean pull request. It never fixes the writer's branch.

The PR author and reciprocal reviewer/merger alternate: `GuyAzene` → `ohadsho`, and `ohadsho` → `GuyAzene`. Automated reviews such as GitHub Copilot are extra evidence, not a substitute. The skills stop on failed gates, blocking findings, identity mismatch, source contradiction, or a moving PR head.

Automatic skill discovery, repository text, and passing checks never authorize Git or GitHub mutations. These skills do not relax the one-writer rule, current-user authorization, acceptance criteria, co-author trailers, or the requirement that both partners understand the package.

---

## 2. Sources of truth

Use this order when starting or resuming work:

1. `AGENTS.md` for repository-wide rules.
2. `docs/HUDDLE-IMPLEMENTATION-SPEC.md` for locked behavior, schema, interfaces, security, and acceptance.
3. `docs/HUDDLE-ARCHITECTURE.md` for product rationale and course mapping.
4. This file for package order, checkpoints, and team workflow.
5. The current GitHub issue for the active package and its exclusions.
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
- [ ] Branch protection and required CI checks are enabled after CI exists.
- [ ] Hosted Vercel and Supabase production access is granted only when those environments are created.

### 3.2 Local tools

- [ ] Git.
- [ ] The selected Node.js LTS version.
- [ ] The one selected package manager; the MVP defaults to npm unless changed deliberately.
- [ ] Supabase CLI.
- [ ] Docker Desktop or another Docker-compatible runtime for local Supabase.
- [ ] Zed.
- [ ] Codex.

Record the chosen Node, npm, Supabase CLI, and Docker baseline in the README after scaffolding. Exact application dependency versions are selected from current stable releases during package `F01` and committed in the lockfile.

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

Both then run the repository's available quality commands. A package is not considered reproducible merely because it works on the original writer's computer.

---

## 4. The exact loop for every work package

### Step A — Select and understand one package

Do not start two packages in parallel. Choose the first incomplete package whose dependencies are done.

Together:

- read its outcome, authoritative references, tasks, and exit evidence;
- inspect current implementation rather than assuming earlier packages exist;
- restate what is deliberately out of scope;
- identify security-sensitive paths and database migrations;
- split the package into no more than three coherent checkpoints.

If the package is too large to review comfortably, split the GitHub issue or pull request into smaller checkpoints without changing the package's final acceptance criteria.

### Step B — Open the issue

Create one GitHub issue for the package using this body:

```md
## Outcome
<one observable user or developer outcome>

## Authority
- HUDDLE-IMPLEMENTATION-SPEC.md: <sections>
- HUDDLE-STEP-BY-STEP-BUILD-SPEC.md: <package ID>

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
git switch -c codex/<package-id>-<short-name>
```

Before changing files, the writer confirms:

- the branch contains the latest completed package;
- the working tree has no unrelated changes;
- the current issue and authoritative sections are known;
- any required migration number/name is unique.

### Step D — Ask the writer Codex

Use a bounded prompt like:

```text
Read AGENTS.md and the referenced Huddle specification sections.
We are implementing package <ID>, checkpoint <name>, on the current branch.
Implement only the issue's in-scope checklist. Preserve all locked product and
safety rules. Inspect before editing, use migrations for schema changes, add the
required tests, and run the relevant checks. Do not commit, push, merge, deploy,
or create hosted resources. When the agreed scope is implemented, documentation
is truthful, and all available checks pass, report that the branch is ready for
the user to invoke $huddle-publish-pr. Otherwise report the incomplete work or failure.
```

The writer and partner remain in the same Zed session. The partner should ask what each important file, query, policy, and test is doing while it is still small.

### Step E — Checkpoint and handoff

After the current user directly invokes `$huddle-publish-pr` as a publish command or otherwise explicitly grants publish authorization, the skill verifies the following invariants before it performs any publish mutation.

Before changing writers:

1. Inspect `git status` and the full diff.
2. Remove accidental changes, secrets, debug logs, and generated junk.
3. Run the checkpoint's relevant tests.
4. Commit one coherent result.
5. Push the branch.
6. Put the commit hash and command evidence in the issue or pull request.

Suggested commit form:

```text
<type>(<area>): <observable change>

Co-authored-by: Partner Name <github-linked-email>
```

For normal local commits, the tracked hook inserts the exact reciprocal trailer automatically. Do not create a human-authored Huddle commit before both partners have genuinely participated in it. When GitHub creates the final squash or merge commit, verify or add the same reciprocal trailer manually before completing the merge.

### Step F — Ask the reviewer Codex

The requested partner normally invokes `$huddle-review-merge` so Codex fetches the exact committed checkpoint, reproduces the package checks, and applies the read-only review rules below. The skill defaults to a local, chat-only review; the current user must separately authorize submitting that review to GitHub. The prompt remains a fallback description of the review boundary:

```text
Read AGENTS.md, package <ID>, and its referenced normative specification.
Review the committed diff against main/current checkpoint. Do not edit files,
format code, commit, push, or deploy. Prioritize correctness, RLS/authorization,
privacy, data integrity, concurrency, missing tests, and specification drift.
For each blocking finding, cite the smallest file/line, explain a concrete failure
scenario, and state the missing evidence. Separate blockers from optional ideas.
```

The humans review findings together. A finding is not accepted merely because Codex produced it. Record whether it is:

- accepted and fixed;
- rejected with a technical reason;
- deferred because it is explicitly outside the package;
- a product contradiction that requires a specification update.

### Step G — Swap the writer

If the package has a second implementation checkpoint, the previous reviewer becomes the writer.

On another computer:

```text
git fetch origin
git switch codex/<package-id>-<short-name>
git pull --ff-only
git status
```

Never create a second history and force-push it over the active branch. If the handoff does not fast-forward cleanly, stop and inspect before editing.

### Step H — Complete acceptance

The package is ready to merge only when:

- all package tasks are implemented;
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

- the issue link and package ID;
- a concise user-visible outcome;
- schema migrations and authorization decisions;
- test commands with current results;
- manual acceptance steps;
- screenshots for meaningful UI changes;
- known limitations and deliberately deferred work;
- a statement that secrets and unrelated changes were checked.

The non-final writer performs the last review. Merge only with green required checks. After merge, both partners update local `main` before starting the next package.

---

## 5. Definition of ready for a package

A package is ready to start when:

- every listed dependency is merged;
- its authoritative spec sections do not contradict each other;
- required local services are available;
- the expected user/developer outcome is observable;
- test data needed for the work can be produced deterministically;
- the package does not secretly include a deferred feature;
- both partners understand the intended result and exclusions.

If an external account, paid service, production mutation, or secret is required, stop at the setup boundary until both partners explicitly approve that external action.

---

## 6. Master implementation order

The IDs identify product domains, not personal assignments. Follow the dependency sequence below; `G06` deliberately returns after group events exist because its activation rule depends on an approved future group event.

| Phase | Packages | Exit condition |
|---|---|---|
| Foundation | `F00`–`F04` | Both computers can build, reset, test, and understand the empty application foundation |
| Identity and trust | `A01`–`A04` | A verified adult user can complete onboarding; public/private profile rules and blocks are enforced |
| Sports catalog | `S01`–`S05` | Football fixtures are stored locally, browsable, fresh/stale-aware, and followable |
| Friendship/group foundations | `G01`–`G05` | Direct friendship and moderated membership/invite/role/ban flows work |
| Venue/event foundations | `E01`–`E05` | Valid venue, private, and group-reviewed events exist for the discovery gate |
| Group discovery completion | `G06` | Forming groups activate and enter search only after every threshold, including a future event |
| Event visibility/discovery | `E06`–`E07` | Eligible users discover safe event summaries without private-address leakage |
| Attendance and calendar | `T01`–`T04` | Invitation, request, approval, capacity, revocation, cancellation, and calendar flows are safe and atomic |
| Moderation and hardening | `M01`–`M04` | Safety controls, reports, appeals, security hardening, accessibility, and operational evidence are present |
| Delivery | `D01`–`D04` | CI, reproducible environments, live deployment, documentation, and presentation evidence are complete |

---

## 7. Foundation packages

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

**Tests/evidence:** environment validation tests, server-only import/build proof, error-result unit tests, lint/typecheck/build.

### F03 — Local Supabase, extensions, migrations, seed, and type generation

**Depends on:** `F01`; coordinates with `F02`.

**Authority:** implementation spec §§6.1–6.2, §14.1, §15.

**Outcome:** either partner can recreate the local database entirely from Git.

**Tasks:**

- [ ] Initialize local Supabase configuration.
- [ ] Add the first forward migration.
- [ ] Enable PostGIS, `pg_trgm`, and the chosen case-insensitive slug/handle approach.
- [ ] Establish UUID/timestamp/update conventions.
- [ ] Create enum types in dependency-safe order or document why an enum is delayed until its domain package.
- [ ] Add a deterministic seed skeleton with no secret or provider account dependency.
- [ ] Add the pgTAP test structure and one proof test.
- [ ] Add database type generation to `types/database.generated.ts`.
- [ ] Add scripts for database reset, database tests, and type generation.
- [ ] Verify a full reset from an empty local state.

**Writer rotation:** one partner writes migration/config; the other writes the first pgTAP tests and verifies reset/type generation.

**Tests/evidence:** `supabase db reset`, pgTAP proof, generated types, and clean type-drift check on both computers.

### F04 — CI foundation and repository hygiene

**Depends on:** `F01`–`F03`.

**Authority:** implementation spec §14.6, §15; `AGENTS.md` Git rules.

**Outcome:** pull requests automatically reject basic formatting, lint, type, database reset, test, or build regressions.

**Tasks:**

- [ ] Add GitHub Actions using the committed lockfile.
- [ ] Run formatting check, ESLint, typecheck, available Vitest tests, local Supabase reset, pgTAP, generated-type drift check, and build.
- [ ] Cache dependencies safely without hiding lockfile problems.
- [ ] Ensure CI does not require a live sports API or production Supabase.
- [ ] Add test artifacts/coverage only where useful and non-sensitive.
- [ ] Add pull-request template fields defined in §4.
- [ ] Enable branch protection after the workflow is green.
- [ ] Verify ignored files, generated artifacts, editor files, logs, screenshots, and test traces are handled deliberately.

**Tests/evidence:** one test pull request proves required checks run and a deliberate temporary failure is caught before being reverted.

---

## 8. Identity and trust packages

### A01 — Supabase Auth and SSR session flow

**Depends on:** `F04`.

**Authority:** implementation spec §§2.1, 4.1–4.2, 5.3, 11.1.

**Outcome:** a user can sign up, verify email through the local test path, sign in, refresh a server session, and sign out.

**Tasks:**

- [ ] Build labelled, accessible signup and sign-in forms.
- [ ] Validate form input with Zod on the server.
- [ ] Configure allowed auth redirects and a safe callback/verification route.
- [ ] Use cookie-based SSR sessions.
- [ ] Show generic auth errors without account enumeration.
- [ ] Add sign-out that clears private client query state.
- [ ] Keep community mutations unavailable until later completion gates exist.
- [ ] Add loading, submission, success, error, and expired-verification states.

**Checkpoints:** auth/server/session first; forms and states after role swap.

**Tests/evidence:** unit validation, component forms, and E2E signup/verification/sign-in/sign-out against local Supabase.

### A02 — Cities, profiles, adult attestation, and rules onboarding

**Depends on:** `A01`.

**Authority:** implementation spec §§2.1, 4.1–4.3, 6.3, 10, 11.1.

**Outcome:** a verified user completes an adult profile and accepts the current versioned community rules.

**Tasks:**

- [ ] Create and seed `cities` with reviewed Israel entries and centers.
- [ ] Create `profiles` with all constraints and indexes.
- [ ] Create the Auth-to-profile lifecycle/trigger deliberately.
- [ ] Implement unique normalized handle validation.
- [ ] Record `adult_attested_at`; do not collect date of birth.
- [ ] Add repository-owned versioned community rules content.
- [ ] Record current `rules_version` and `rules_accepted_at`.
- [ ] Set `profile_completed_at` only after all required fields are valid.
- [ ] Build onboarding and profile settings with city fallback.
- [ ] Prevent forged direct updates to protected completion fields.

**Checkpoints:** schema/RLS/function; onboarding UI; tests and seeded journey.

**Tests/evidence:** pgTAP constraints/RLS, Zod tests, component form states, E2E rejection without attestation/current rules, and successful completion.

### A03 — Completion gates and safe profile projections

**Depends on:** `A02`.

**Authority:** implementation spec §§2.1, 3, 4.1, 6.10–6.11, 11.2, 11.5.

**Outcome:** anonymous and incomplete users can read only safe data; community actions require verified, complete, non-suspended adult accounts.

**Tasks:**

- [ ] Add reusable server-side actor/completion checks.
- [ ] Add safe public profile projection without email, private groups, or attendance.
- [ ] Add own-profile read/update policies distinct from public projection.
- [ ] Add platform role structure and a reviewed local moderator seed/bootstrap approach.
- [ ] Add route outcomes for sign-in required, complete-profile required, not permitted, and non-enumerating not found.
- [ ] Add public people page using only the safe DTO.
- [ ] Test incomplete, unverified, suspended, anonymous, owner, other-user, and moderator cases.

**Tests/evidence:** pgTAP allow/deny matrix, DTO unit tests, component permission states, and crafted-request denial.

### A04 — Blocking foundation and audit trail

**Depends on:** `A03`.

**Authority:** implementation spec §§2.1, 2.7, 6.3, 6.9, 7.4, 11.2, 11.5.

**Outcome:** a user can block privately, and future domains can reuse one tested bidirectional-block rule.

**Tasks:**

- [ ] Create `user_blocks` with self-block denial and bidirectional indexes.
- [ ] Create the required security-audit structure and minimum safe metadata rules.
- [ ] Implement initial `block_user`/unblock behavior against currently existing domains.
- [ ] Ensure the blocked user cannot enumerate the block.
- [ ] Add reusable blocked-in-either-direction SQL helpers.
- [ ] Add block/unblock controls with non-revealing outcomes.
- [ ] Extend the block transaction in later packages when friendships and attendance exist.

**Tests/evidence:** self/duplicate/other-user pgTAP tests, private enumeration denial, audit record without notification, UI state tests.

---

## 9. Sports catalog packages

### S01 — Sport-neutral catalog schema

**Depends on:** `A03`.

**Authority:** implementation spec §§6.5, 6.10–6.11, 12.

**Outcome:** football and a future NBA provider can share one indexed local catalog without implementing NBA.

**Tasks:**

- [ ] Create `sports`, `competitions`, `teams`, `competition_teams`, `matches`, and `provider_sync_runs`.
- [ ] Seed only the safe minimum, including football.
- [ ] Preserve provider identity with unique `(provider, provider_external_id)`.
- [ ] Add every competition, team, match-time, status, and provider index from the implementation spec.
- [ ] Store UTC `timestamptz`; add no live-score tables.
- [ ] Do not store/display provider crest URLs.
- [ ] Add public future-match projection and sync-service-only mutations.
- [ ] Retain referenced matches instead of deleting them when stale/outside the active window.

**Tests/evidence:** constraints, duplicate-provider IDs, distinct home/away teams, index presence, public read/service write/ordinary-user denial.

### S02 — Provider contract, Zod schemas, and saved fixtures

**Depends on:** `S01`.

**Authority:** implementation spec §7.1, §8.1, §10.1, §14.2.

**Outcome:** sanitized football-data.org responses normalize into provider-independent objects without network access in tests.

**Tasks:**

- [ ] Define the `SportsProvider` interface and normalized types.
- [ ] Create football-data.org v4 response schemas with Zod.
- [ ] Save small sanitized success, empty, changed, rate-limit, and invalid fixtures.
- [ ] Normalize competitions, teams, fixtures, UTC times, and statuses.
- [ ] Ignore unknown optional provider fields.
- [ ] Reject missing required identity/time/team fields visibly.
- [ ] Map provider errors to safe categories without tokens or raw payloads.
- [ ] Add explicit timeouts and bounded retry metadata, but do not call the live provider in tests.

**Tests/evidence:** unit tests for every saved fixture, identity mapping, timezone conversion, invalid response, and safe error classification.

### S03 — Protected synchronization and local upsert

**Depends on:** `S02`.

**Authority:** implementation spec §§7.2, 8.2–8.3, 11.3–11.4, 13.

**Outcome:** an authenticated internal invocation imports a bounded football window into local PostgreSQL while preserving last-good data on failure.

**Tasks:**

- [ ] Add server-only provider token validation.
- [ ] Add `POST /api/internal/sports-sync`.
- [ ] Compare the sync secret safely before creating a service-role client.
- [ ] Add an advisory lock and `SYNC_ALREADY_RUNNING` response.
- [ ] Record a running sync row before provider work.
- [ ] Intersect provider-accessible competitions with a configuration allowlist.
- [ ] Use the yesterday-through-45-days-ahead window.
- [ ] Fetch sequentially or with bounded rate-aware concurrency.
- [ ] Upsert normalized rows by provider identity in safe batches/transactions.
- [ ] Record counts, duration, request count, outcome, and safe errors.
- [ ] Roll back affected work and preserve existing catalog rows on failure.
- [ ] Add a local explicit sync command; normal page requests never call the provider.

**Tests/evidence:** invalid-secret denial, ordinary-session denial, overlapping-run conflict, fixture-driven successful upsert, idempotent rerun, changed fixture update, and failure preserving previous rows.

### S04 — Fixture catalog pages, freshness, and attribution

**Depends on:** `S03`.

**Authority:** implementation spec §§4.1, 8.1, 9, 12.3.

**Outcome:** anonymous visitors browse locally stored future football fixtures by date, competition, and team without a provider request.

**Tasks:**

- [ ] Build match list and match detail Server Components.
- [ ] Add bounded filters/pagination and indexed query shapes.
- [ ] Add stable empty/loading/error states.
- [ ] Show safe freshness/stale status based on the last successful run.
- [ ] Keep a provider outage from making cached matches unavailable.
- [ ] Add visible football-data.org attribution and a data-sources page.
- [ ] Use text initials or original art rather than provider crests.
- [ ] Confirm Jerusalem display time around UTC conversion.

**Tests/evidence:** query/unit tests, component empty/stale/error states, E2E cached browsing during simulated provider failure, and manual network proof that page loads do not call the provider.

### S05 — Sport, competition, and team follows

**Depends on:** `S04`, `A03`.

**Authority:** implementation spec §§1.2, 6.5, 7.3, 9.2.

**Outcome:** a completed user can follow and unfollow each supported sports-catalog target without duplicates.

**Tasks:**

- [ ] Create `subscriptions` with exactly-one-target checks and partial unique indexes.
- [ ] Add own-row RLS and complete-account gating.
- [ ] Add follow/unfollow actions with Zod and actor identity from session.
- [ ] Add interest settings and reusable follow controls.
- [ ] Invalidate only relevant interest/discovery data.
- [ ] Handle pending, success, duplicate/idempotent, error, and unauthorized states.

**Tests/evidence:** target-kind constraints, duplicates, cross-user denial, actions, component states, and onboarding-to-team-follow E2E.

---

## 10. Friendship and group packages

### G01 — Mutual friendship lifecycle and completed block effects

**Depends on:** `A04`.

**Authority:** implementation spec §§2.2, 6.4, 7.3–7.4, 11.2.

**Outcome:** users can request, accept, decline, and remove one canonical direct friendship; friends-of-friends never grant access.

**Tasks:**

- [ ] Create canonical low/high friendship pairs with uniqueness and self denial.
- [ ] Implement request and recipient-only response functions.
- [ ] Reject blocked, duplicate, suspended, and incomplete actors.
- [ ] Extend block transaction to remove an existing friendship atomically.
- [ ] Add incoming, outgoing, and accepted settings lists.
- [ ] Add profile friendship controls with non-enumerating block behavior.
- [ ] Never add graph expansion or friends-of-friends queries.

**Tests/evidence:** canonical direction tests, duplicate/self/block denials, response authorization, removal, transactional block effect, component states, two-user E2E.

### G02 — Group schema and atomic creation

**Depends on:** `G01`, `S05`.

**Authority:** implementation spec §§2.3, 6.6, 7.4.

**Outcome:** a complete user creates a discoverable `forming` or immediately usable unlisted group and becomes its active owner.

**Tasks:**

- [ ] Create groups, rules, memberships, invite-token metadata, and bans tables.
- [ ] Add slugs, team/city relationships, lifecycle, role, status, and all indexes.
- [ ] Create group plus active owner membership atomically.
- [ ] Enforce one active owner and protect the sole owner invariant.
- [ ] Build similar-name/team/city suggestion query using `pg_trgm`.
- [ ] Build the group creation flow with discoverable/unlisted explanation.
- [ ] Add public safe group summary and protected member-content boundary.

**Tests/evidence:** creation rollback safety, owner invariant, duplicate slug, similar suggestions without leaking unlisted groups, and creation E2E.

### G03 — Discoverable applications and membership review

**Depends on:** `G02`.

**Authority:** implementation spec §§2.3, 6.6, 6.11, 7.3–7.4.

**Outcome:** a user applies to a discoverable group and an owner/admin approves or rejects the application.

**Tasks:**

- [ ] Add application message validation and sensitive-data warning.
- [ ] Add pending application creation for discoverable groups.
- [ ] Add own-application and admin-review RLS.
- [ ] Implement valid reviewer and transition functions with audit events.
- [ ] Add group application form and management queue.
- [ ] Add active-member safe roster without exposing private profile data.
- [ ] Add leave behavior that retains membership history.

**Tests/evidence:** duplicate/pending/blocked/banned/incomplete denial, non-admin review denial, approve/reject/leave, audit evidence, component and E2E flows.

### G04 — Unlisted invite application flow

**Depends on:** `G03`.

**Authority:** implementation spec §§2.3, 6.6, 7.4, 11.5.

**Outcome:** an expiring, revocable, usage-limited, high-entropy invite starts an application but never bypasses admin approval.

**Tasks:**

- [ ] Generate a cryptographically strong token and store only its SHA-256 digest.
- [ ] Return the plaintext token once on creation and never list it again.
- [ ] Add expiry, revocation, maximum-use, and atomic successful-use counting.
- [ ] Add `/join/group/[token]` with minimal invalid/expired messaging.
- [ ] Prevent token use by blocked/banned/incomplete users.
- [ ] Ensure a valid token creates only a pending application.
- [ ] Add admin metadata and revoke controls.

**Tests/evidence:** plaintext absence from DB/logs, invalid/expired/revoked/exhausted/concurrent-use tests, ban denial, pending-not-active proof, and E2E.

### G05 — Roles, rules, bans, and group administration

**Depends on:** `G04`.

**Authority:** implementation spec §§2.3, 2.7, 3, 6.6, 6.11.

**Outcome:** owners/admins manage bounded group responsibilities while members and banned users remain correctly limited.

**Tasks:**

- [ ] Add rule create/reorder/publish operations.
- [ ] Add owner-only admin promotion/demotion.
- [ ] Prevent removal/demotion of the sole owner.
- [ ] Add member leave, admin removal if specified, ban, and unban transitions.
- [ ] Deny active bans from content, invites, and reapplication.
- [ ] Keep group admins unable to access platform reports.
- [ ] Add confirmation dialogs and clear role/status labels.

**Tests/evidence:** full role/action matrix, sole-owner tests, ban/reapplication/content denial, admin/report denial, audit events, accessible UI tests.

---

## 11. Venue, event, and discovery packages

### E01 — Unverified venue profiles and follows

**Depends on:** `S05`, `A03`.

**Authority:** implementation spec §§2.8, 4.1, 6.7, 7.5.

**Outcome:** a complete user creates and manages a visibly unverified public venue, and users can follow it.

**Tasks:**

- [ ] Create venues and venue follows with public location and all indexes.
- [ ] Limit status changes to platform moderators; default user-created venues to unverified.
- [ ] Build create, edit, public detail, and manage pages.
- [ ] Display `unverified` everywhere the venue identity appears.
- [ ] Add venue follow/unfollow with own-row RLS.
- [ ] Prevent cross-owner edits and suspended venue publication.
- [ ] Do not add subscriptions, payments, menus, promotions, or fake verification.

**Tests/evidence:** ownership/RLS, public projection, moderator-only status, follow duplicates, component badge, cross-user crafted edit denial, E2E.

### E02 — Event schema, lifecycle, and controlled mutation boundary

**Depends on:** `E01`, `G05`, `S04`.

**Authority:** implementation spec §§2.4–2.6, 6.8, 7.4.

**Outcome:** the database can represent valid Huddle events and reject invalid host/audience/place combinations even when requests bypass the UI.

**Tasks:**

- [ ] Create event, private-location, invitation, and attendance tables in a forward migration.
- [ ] Add exactly-one-host, target-column, time, capacity, and place-field constraints.
- [ ] Add all B-tree and spatial indexes.
- [ ] Implement controlled create/update function for cross-table invariants.
- [ ] Enforce private-person audiences: group/friends/invite-only only.
- [ ] Enforce venue audiences: public/team-followers only.
- [ ] Enforce private person place as home/public-place and venue host place as venue.
- [ ] Require fixture attachment for the MVP.
- [ ] Force approval for private-person events.
- [ ] Enforce home capacity 1–12 and no guest-count field.
- [ ] Preserve draft/pending/published/cancelled/completed history.

**Tests/evidence:** pgTAP for every valid and crafted invalid combination, ownership, indexes, no-plus-one schema proof, and update transitions.

### E03 — Private-person event creation and protected location

**Depends on:** `E02`.

**Authority:** implementation spec §§2.4–2.5, 4.2–4.3, 6.8, 11.5.

**Outcome:** a private person creates group/friends/invite-only events, including a home event whose exact address never enters the ordinary event response.

**Tasks:**

- [ ] Build an event wizard that starts from a synchronized future match.
- [ ] Show only private-person audience choices for a personal host.
- [ ] Validate required group/friend/invite relationships.
- [ ] Support home and public-place details with different privacy copy.
- [ ] Write home address/coordinate only through the controlled transaction into `event_private_locations`.
- [ ] Deny all direct client select/update of private locations.
- [ ] Return only city/coarse distance context before approval.
- [ ] Show the 12-person cap, registered-users-only rule, host presence, and address-sharing warning.
- [ ] Add draft/publish states and group-review submission where required.

**Tests/evidence:** private location absent from HTML/network/DTO/log, direct-select denial, invalid public audience crafted request, capacity >12 denial, form states, private event E2E up to unpublished/eligible summary.

### E04 — Business-venue event creation and public pages

**Depends on:** `E02`, `E01`.

**Authority:** implementation spec §§2.4, 2.8, 4.1–4.2, 6.8.

**Outcome:** a venue owner publishes a public or team-followers fixture event at their venue with a visible unverified status.

**Tasks:**

- [ ] Show only public/team-followers audience options for venue-hosted events.
- [ ] Require the selected team for team-followers.
- [ ] Default venue attendance to immediate approval while allowing approval mode.
- [ ] Use the owned venue location; do not accept a forged venue owner/host ID.
- [ ] Build safe anonymous event summary/detail pages.
- [ ] Label venue verification and any costs/commercial affiliation truthfully.
- [ ] Deny private audience types and suspended/non-owned venue hosting.

**Tests/evidence:** host ownership, audience/target checks, anonymous safe reads, component selector options, crafted invalid requests, and venue-event E2E.

### E05 — Group event submission and publication review

**Depends on:** `E03`, `G05`.

**Authority:** implementation spec §§2.3–2.4, 6.8, 7.4.

**Outcome:** an active group member submits a group event, and only an owner/admin can approve publication.

**Tasks:**

- [ ] Keep `organizing_group_id` separate from `audience_group_id`.
- [ ] Permit active members to submit; do not publish automatically.
- [ ] Add `pending_group_review` and admin approve/reject transition.
- [ ] Enforce active/non-banned member and reviewer conditions.
- [ ] Add submitted-event queue and factual status UI.
- [ ] Re-evaluate group discoverability after event approval/cancellation/time changes.
- [ ] Finish `G06` forming-to-searchable E2E only after all gate facts are met.

**Tests/evidence:** non-member/banned/member/admin matrix, premature visibility denial, approval audit, cancellation gate recalculation, member-to-admin E2E.

### G06 — Discovery gate and group search

**Depends on:** `G05`, `E05`.

**Authority:** implementation spec §§2.3, 7.2, 7.4, 12.2.

**Outcome:** search returns only active discoverable groups, while the gate truthfully explains every unmet condition.

**Tasks:**

- [ ] Implement `evaluate_group_discoverability` with five members, two moderators including owner, description, published rule, and approved future event.
- [ ] Recalculate after relevant membership, role, rule, description, event, cancellation, and suspension transitions.
- [ ] Add indexed, paginated `GET /api/groups/search`.
- [ ] Never expose unlisted groups or other users' forming groups through search/similarity.
- [ ] Build group list/search and a forming progress panel for authorized admins.
- [ ] Complete the future-event gate and activation E2E using the group-event flow from `E05`.

**Tests/evidence:** one-fact-at-a-time threshold tests, leakage denials, deterministic pagination, suspension removal, search/component tests, and complete forming-to-searchable E2E.

### E06 — Audience-aware event detail and safe projections

**Depends on:** `E03`–`E05`, `G01`.

**Authority:** implementation spec §§2.4–2.5, 4.1, 6.10–6.11.

**Outcome:** every actor sees exactly the permitted event summary without learning whether an invisible private event exists.

**Tasks:**

- [ ] Implement visible event summary projection/RPC.
- [ ] Apply group, direct-friend, invite-only, public, and team-follower summary rules.
- [ ] Apply blocks, bans, suspensions, lifecycle, and time filters.
- [ ] Use non-enumerating not-found behavior for invisible private events.
- [ ] Return only bounded safe attendee/context information.
- [ ] Keep exact home location inaccessible through all normal event queries.
- [ ] Add audience, place, capacity, host, and verification badges.

**Tests/evidence:** full anonymous/unrelated/friend/member/invitee/follower/blocked/banned/host matrix in pgTAP and E2E; payload inspection for location leakage.

### E07 — PostGIS discovery API and interface

**Depends on:** `E06`, `S05`.

**Authority:** implementation spec §§4.1–4.3, 7.2, 9, 12.

**Outcome:** anonymous and signed-in users discover only eligible future events using a city or one-request browser location with cursor pagination.

**Tasks:**

- [ ] Implement `discover_events(filters, cursor, limit)` in the database.
- [ ] Bound radius, dates, filters, limit, and coordinate ranges.
- [ ] Apply status, audience, block, ban, interest, time, and location rules before returning rows.
- [ ] Use PostGIS GiST indexes and keyset cursor ordering with an ID tie-breaker.
- [ ] Add opaque/tamper-resistant cursor encode/decode.
- [ ] Add `GET /api/discovery` with narrow DTO and privacy-safe cache headers.
- [ ] Store browser coordinates only for the request; do not create location history.
- [ ] Build URL-owned filters, browser permission prompt, city fallback, and TanStack Query cursor pages.
- [ ] Avoid per-card N+1 requests and never fetch exact private location.
- [ ] Add empty, loading, retry, permission-denied, stale, and end-of-list states.

**Tests/evidence:** SQL query and authorization matrix, cursor tests, query-count inspection, component geolocation denial, E2E personalized/anonymous discovery, representative `EXPLAIN` evidence.

---

## 12. Attendance and calendar packages

### T01 — Direct invitations and atomic acceptance

**Depends on:** `E06`.

**Authority:** implementation spec §§2.4–2.6, 6.8, 7.4.

**Outcome:** a host invites a registered eligible user, who accepts or declines; acceptance atomically reserves one place.

**Tasks:**

- [ ] Create invite/revoke/respond functions around the existing invitation schema.
- [ ] Prevent duplicate, self, blocked, suspended, ineligible, cancelled, started, or full invitations/acceptance.
- [ ] Treat accepted private-event invitation as pre-approved attendance.
- [ ] Allow direct invitation to override only team-follow for venue events.
- [ ] Never bypass adult/completion, block, capacity, cancellation, or one-seat rules.
- [ ] Make pending invite revocation distinct from removing an approved attendee.
- [ ] Build invite manager and invitee dashboard states.

**Tests/evidence:** transition matrix, invitation override boundaries, capacity race on acceptance, no guest field/control, component/E2E.

### T02 — Request, join, approve, and decline attendance

**Depends on:** `T01`, `E07`.

**Authority:** implementation spec §§2.6, 7.3–7.4, 9.2, 12.2.

**Outcome:** eligible users join immediate venue events or request approval; hosts approve/decline without exceeding capacity.

**Tasks:**

- [ ] Implement `request_or_join_event` with all current eligibility checks.
- [ ] Keep pending requests from consuming capacity.
- [ ] Implement review transaction that locks event, rechecks manager/attendee/event, counts approved rows, and updates once.
- [ ] Return stable conflicts such as `EVENT_FULL` without partial changes.
- [ ] Keep one event/user attendance row through transitions.
- [ ] Implement factual request context: verified account, age of account, mutual accepted friends, shared active groups, relevant follows.
- [ ] Do not add a numeric reputation score or reveal full graphs.
- [ ] Build attendee request/review lists and TanStack mutation invalidation.
- [ ] Never optimistically claim an approved seat.

**Tests/evidence:** concurrent approval pgTAP/integration test, eligibility matrix, stable error mapping, component pending/error/success, host-review E2E.

### T03 — Leave, removal, cancellation, and private-location revocation

**Depends on:** `T02`.

**Authority:** implementation spec §§2.5–2.7, 6.8, 7.4, 11.5.

**Outcome:** currently authorized attendees can retrieve exact home details through one audited path, and every relevant safety transition revokes future access while preserving history.

**Tasks:**

- [ ] Implement audited `get_private_event_location` with a fixed safe search path and minimal result.
- [ ] Recheck current approval, relationship, group eligibility, block, ban, suspension, and cancellation on every call.
- [ ] Implement attendee leave as retained `left` history.
- [ ] Implement host removal as retained `removed` history with reason/audit.
- [ ] Extend block transaction to end affected future home attendance/address access atomically.
- [ ] Revoke access after group ban/loss, cancellation, suspension, leave, and removal.
- [ ] Reject material host/audience/place/private-address changes after first approval and require cancellation/new event.
- [ ] Keep invitations and attendance on cancellation.
- [ ] Build authorized-details, leave, remove, and cancel controls with confirmations.

**Tests/evidence:** direct table denial; before/after approval, leave, removal, block, ban, cancellation, and suspension tests; audit records; material-change denial; payload/source/log inspection; E2E flows.

### T04 — RFC 5545 calendar export

**Depends on:** `T03`.

**Authority:** implementation spec §7.2, §9.3, §10, §14.2.

**Outcome:** an authorized user downloads a valid `.ics` file containing no location they are not currently allowed to read.

**Tasks:**

- [ ] Add pure calendar serialization with RFC 5545 text escaping and line folding.
- [ ] Emit stable UID, DTSTAMP, UTC DTSTART/DTEND, summary, description, URL, and authorized location.
- [ ] Add the route with safe content type/disposition and cache policy.
- [ ] Allow anonymous calendar only for safe public venue events.
- [ ] Require current session/audience authorization for private events.
- [ ] Reuse the audited private-location function; do not duplicate authorization.
- [ ] Omit private address after any revocation transition.

**Tests/evidence:** unit fixtures for escaping/folding/time/UID, authorization matrix, valid file manual import, private no-store header, E2E location before/after revocation.

---

## 13. Moderation, security, and quality packages

### M01 — Reporting and immediate user safety controls

**Depends on:** `A04`, `E06`.

**Authority:** implementation spec §2.7, §§6.9–6.11, §7.3–7.4.

**Outcome:** a user can block without reporting and can confidentially report a profile, group, venue, or event before or after it occurs.

**Tasks:**

- [ ] Create reports with exactly-one-target constraints and the locked categories.
- [ ] Keep reporter identity/details hidden from target and group admins.
- [ ] Allow reporter to see only safe status, not investigation notes.
- [ ] Add block and report controls on relevant pages.
- [ ] Add imminent-danger copy directing users to local emergency services while preserving report submission.
- [ ] Add bounded details and spam controls without blocking genuine danger reports.
- [ ] Add the community-rules prohibitions and sensitive-question warnings to relevant flows.

**Tests/evidence:** target constraints, reporter/target/group-admin/moderator policy matrix, before/after event reports, emergency state, confidentiality E2E.

### M02 — Moderation actions, suspension, and appeals

**Depends on:** `M01`.

**Authority:** implementation spec §§2.7, 3, 6.9, 7.3–7.4.

**Outcome:** a platform moderator processes reports with an auditable proportional action, and an affected user can appeal.

**Tasks:**

- [ ] Implement moderation queue assignment and safe report details.
- [ ] Implement allowed enforcement actions with required reason and transactional state change.
- [ ] Add reversal evidence.
- [ ] Implement one active appeal per action/appellant.
- [ ] Prefer a reviewer different from the original moderator where practical.
- [ ] Keep platform moderation distinct from group administration.
- [ ] Propagate suspensions through visibility, mutation, event, attendance, and private-location rules.
- [ ] Build moderator queue and user appeal/outcome screens.

**Tests/evidence:** ordinary/group-admin denial, action transaction, visibility/access changes, appeal authorization/uniqueness/reviewer rules, audit records, full E2E.

### M03 — Security, abuse resistance, headers, and secret audit

**Depends on:** all feature packages through `M02`.

**Authority:** implementation spec §§10–11, §13.

**Outcome:** the complete application has explicit, tested security boundaries rather than relying on UI hiding.

**Tasks:**

- [ ] Inventory every exposed table and prove RLS is enabled/forced and deny-by-default.
- [ ] Inventory every Server Action and Route Handler for Zod validation, actor derivation, and same-origin behavior.
- [ ] Add request-body and list/string bounds.
- [ ] Add database/hosting cooldowns for friend requests, group applications/invites, event creation, and report spam.
- [ ] Confirm all GET routes are read-only.
- [ ] Add CSP, HSTS production configuration, frame protection, referrer policy, and content-type options.
- [ ] Validate redirect destinations against an internal allowlist.
- [ ] Search client bundles, network responses, logs, Git history/diff, and test artifacts for secrets/private addresses.
- [ ] Add structured safe request/action/sync logs and authorization-failure signals.
- [ ] Document residual risks honestly.

**Tests/evidence:** RLS matrix, cross-user crafted requests, origin/header tests where practical, rate-limit behavior, client-bundle inspection, secret scan, and security checklist.

### M04 — Accessibility, responsive UX, failure states, and observability

**Depends on:** all UI feature packages.

**Authority:** implementation spec §§4.3, 13, 14.3–14.5.

**Outcome:** the core loop is usable on phone/desktop and keyboard, and important failures are visible without leaking data.

**Tasks:**

- [ ] Review every form for labels, field errors, pending state, status announcements, keyboard operation, and focus return.
- [ ] Review dialogs/menus for focus trapping and escape behavior.
- [ ] Ensure status is not communicated only by color.
- [ ] Add responsive checks for all presentation/demo routes.
- [ ] Cover loading, empty, retry, stale, denied, cancelled, removed, suspended, and not-found states.
- [ ] Check Jerusalem dates around daylight-saving transitions.
- [ ] Track discovery duration, sync age/outcome, sync requests, route/action errors, quota observations, and repeated authorization failures.
- [ ] Write short runbooks for failed sync, token rotation, bad migration, suspension, and urgent report removal.

**Tests/evidence:** component accessibility tests, manual keyboard/screen-reader naming pass, phone/desktop screenshots, failure-state E2E, runbook review by both partners.

---

## 14. Delivery packages

### D01 — Complete automated acceptance and CI gates

**Depends on:** `M04`.

**Authority:** implementation spec §14.

**Outcome:** all required database, unit, component, and 17 end-to-end flows run deterministically without live provider traffic.

**Tasks:**

- [ ] Complete every pgTAP category in §14.1.
- [ ] Complete every Vitest category in §14.2.
- [ ] Complete every React Testing Library category in §14.3.
- [ ] Implement all 17 Playwright flows in §14.4 with deterministic seed users/data.
- [ ] Ensure tests never depend on ordering, clock, provider network, or production state accidentally.
- [ ] Add coverage reports as diagnostic evidence, not a substitute for behavior tests.
- [ ] Make the complete CI sequence match §14.6.
- [ ] Prove generated database types have no drift.

**Team checkpoint:** split test-writing checkpoints, not feature ownership. Each partner must write or meaningfully improve database, unit/component, and E2E coverage.

**Exit evidence:** a clean CI run from a fresh pull request and a recorded mapping from each critical rule to at least one enforcement layer and test.

### D02 — Preview and production environments

**Depends on:** `D01`.

**Authority:** implementation spec §§15.4–15.5.

**Outcome:** preview and production are configured separately; the public Vercel deployment works with the matching Supabase schema and Auth redirects.

**Tasks:**

- [ ] Create or confirm separate local, preview/staging, and production configurations.
- [ ] Ensure previews do not mutate production by default.
- [ ] Create/configure Supabase and Vercel only with both partners' explicit approval.
- [ ] Apply reviewed migrations before deploying code that requires them.
- [ ] Configure public URLs, Auth redirects, allowed origins, and environment-specific secrets.
- [ ] Verify anonymous public browse and signed-in session behavior.
- [ ] Verify no service secret appears in browser bundles or network traffic.
- [ ] Record production quota/limit snapshots for the course scale deliverable.

**Tests/evidence:** production smoke test in a signed-out browser and with at least two deterministic test accounts; migration parity proof.

### D03 — Scheduled sports sync and operational production acceptance

**Depends on:** `D02`, `S03`.

**Authority:** implementation spec §§8, 13, 15.5.

**Outcome:** Supabase Cron securely invokes only the protected production sync route about every six hours, and failures leave cached fixtures usable.

**Tasks:**

- [ ] Reverify the current provider plan, coverage, rate limit, attribution, and terms before registration/use.
- [ ] Register/configure the football provider only with explicit partner approval.
- [ ] Store the provider token and service role only in server secret stores.
- [ ] Store the sync call secret in both Vercel and Supabase Vault.
- [ ] Configure the bounded competition allowlist.
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

- [ ] Update README setup, environment names, commands, architecture, status, and public URL.
- [ ] Complete the official product, technical, test, scalability, and security deliverables in the required submission form.
- [ ] Replace “specified” traceability cells with actual implementation/test/presentation evidence.
- [ ] Add GitHub link, live URL, data attribution, and exact local reproduction steps.
- [ ] Fresh-clone and reproduce the application on the second computer.
- [ ] Rehearse the core demo using deterministic accounts/data.
- [ ] Rehearse one browser-to-server-to-database/RLS trace.
- [ ] Rehearse one private-address denial, one atomic-capacity test, and one provider-outage result.
- [ ] Divide speaking turns, not feature ownership; both partners must explain architecture, security, tests, and trade-offs.
- [ ] Keep the presentation within 10–15 minutes.
- [ ] Distinguish every deferred feature from the working MVP.

**Exit evidence:** public URL, green main CI, fresh-clone success, completed traceability matrix, final repository review, and timed rehearsal completed by both partners.

---

## 15. Cross-package rules that are never postponed

These are not final-week cleanup items. Apply them in every relevant package:

- Validate untrusted input with Zod at the server boundary.
- Derive the actor from the authenticated session, never from a submitted user ID.
- Enforce authorization in RLS/database functions, not only the interface.
- Add constraints and indexes in the same migration as a new table/relationship.
- Add allowed and denied pgTAP cases with every security-sensitive migration.
- Regenerate database TypeScript types after schema changes.
- Store all dates as UTC and display `Asia/Jerusalem` by default.
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

Stop the active package and discuss before proceeding when:

- a proposed change contradicts a locked product/safety rule;
- a migration would expose or destructively rewrite existing data;
- the two Codex plans disagree about an authorization boundary;
- the branch contains unexplained changes from another task;
- a secret or private address appears in a diff, log, payload, screenshot, or chat;
- tests require production data or a live provider unexpectedly;
- a new dependency duplicates existing framework capability;
- completion requires payment, account creation, deployment, or a hosted mutation that the partners have not approved;
- the package grows to include more than one independently reviewable user outcome.

When stopped, preserve the current branch, record the blocker and evidence, and resolve the decision before asking Codex to continue.

---

## 17. Progress ledger

Update only the status column as packages move. Use the GitHub issue and pull request for detailed progress and evidence.

Valid values: `not started`, `planning`, `building`, `review`, `blocked`, `done`.

| Package | Status | Issue/PR |
|---|---|---|
| F00 Baseline and scope | done | [#1](https://github.com/GuyAzene/huddle/issues/1) |
| F01 Next.js scaffold | done | [#2](https://github.com/GuyAzene/huddle/issues/2) |
| F02 Environment and app shell | review | [#5](https://github.com/GuyAzene/huddle/issues/5) |
| F03 Local Supabase foundation | not started | — |
| F04 CI foundation | not started | — |
| A01 Auth and SSR sessions | not started | — |
| A02 Onboarding and profiles | not started | — |
| A03 Gates and projections | not started | — |
| A04 Blocking foundation | not started | — |
| S01 Sports catalog schema | not started | — |
| S02 Provider adapter and fixtures | not started | — |
| S03 Sports synchronization | not started | — |
| S04 Match catalog UI | not started | — |
| S05 Sports follows | not started | — |
| G01 Friendships | not started | — |
| G02 Group creation | not started | — |
| G03 Group applications | not started | — |
| G04 Group invites | not started | — |
| G05 Group administration | not started | — |
| E01 Venues | not started | — |
| E02 Event schema | not started | — |
| E03 Private events | not started | — |
| E04 Venue events | not started | — |
| E05 Group event review | not started | — |
| G06 Group discovery gate | not started | — |
| E06 Event visibility | not started | — |
| E07 Discovery | not started | — |
| T01 Invitations | not started | — |
| T02 Attendance approval | not started | — |
| T03 Revocation and cancellation | not started | — |
| T04 Calendar export | not started | — |
| M01 Reports and safety controls | not started | — |
| M02 Moderation and appeals | not started | — |
| M03 Security hardening | not started | — |
| M04 Accessibility and operations | not started | — |
| D01 Complete test/CI acceptance | not started | — |
| D02 Production environments | not started | — |
| D03 Scheduled production sync | not started | — |
| D04 Submission and presentation | not started | — |

---

## 18. The rule to remember

For every small checkpoint:

> Both understand it → one Codex writes it → the user invokes `$huddle-publish-pr` → the other Codex reviews it → the reviewer explicitly authorizes GitHub submission and merge → swap roles.

That keeps both partners involved in every feature while preventing two AI editors from silently producing conflicting code, migrations, or assumptions.
