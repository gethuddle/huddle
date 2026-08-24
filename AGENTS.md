# Huddle Agent Instructions

These repository instructions are the durable shared context for both project partners and every Codex task. Chat transcripts and personal memories are not shared; repository files, Git history, issues, and pull requests are the common record.

## Required reading and authority

Before planning or changing Huddle, read the relevant parts of:

1. `docs/HUDDLE-IMPLEMENTATION-SPEC.md` — normative product and engineering contract.
2. `docs/HUDDLE-ARCHITECTURE.md` — human-readable product and architecture rationale.
3. `docs/HUDDLE-STEP-BY-STEP-BUILD-SPEC.md` — implementation order, package checklists, and the two-person/two-Codex handoff.
4. `README.md` — public project summary.
5. The current GitHub issue and pull request, when present — the active slice and acceptance criteria.

When sources disagree, stop and report the contradiction. Do not silently choose one. The implementation specification is authoritative only when the other documents have not deliberately recorded a newer approved decision.

Do not assume the application is implemented merely because behavior is specified. Inspect the repository and distinguish planned behavior from working code.

## Product outcome

Huddle is an English-language Israel pilot that helps sports fans follow interests, discover eligible nearby watch events, request or join them safely, and host or manage gatherings. The future paying customer is the commercial venue; fan, friendship, supporter-group, and private-hosting features remain free in the MVP.

The core submitted loop is:

`follow interests → discover fixtures/events → request or join → host/manage attendance`

Keep implementation slices tied to this loop and the official course deliverables. Do not add deferred product features merely because the architecture could support them.

## Required architecture

- Next.js App Router, React, and strict TypeScript form one modular-monolith application.
- Next.js Server Components handle server reads; Server Actions handle application mutations; narrow Route Handlers provide discovery JSON, sports synchronization, and calendar files.
- Tailwind CSS and Radix UI primitives provide the interface.
- TanStack Query is limited to location-aware discovery, cursor pagination, and attendance mutations. Use local React state for ordinary forms and dialogs; do not add Zustand.
- Zod validates all untrusted form, route, environment, and provider data.
- Supabase owns Auth, PostgreSQL, Row Level Security, PostGIS, SQL migrations, and generated database types.
- Vercel hosts Next.js. Supabase hosts Auth and PostgreSQL.
- Vitest, React Testing Library, Playwright, pgTAP, ESLint, Prettier, and GitHub Actions provide the planned quality gates.
- Do not add Express, Prisma, Redis, Socket.IO, microservices, payment infrastructure, or another state library unless the approved specifications are revised first.

## Locked product and safety rules

- Authentication uses Supabase Auth. Huddle never stores password hashes.
- Community mutations require verified email, an 18+ attestation, acceptance of the current community-rules version, a completed profile, and a non-suspended account.
- One registered account represents one attendee. There are no anonymous guests or plus-ones.
- Friendships require request and acceptance. Friends-of-friends never grant visibility.
- Private people may create only `group`, `friends`, or `invite_only` events, even at a café or other public place.
- Only business venues may create `public` or `team_followers` events. Venue status remains visibly unverified in the course MVP.
- Home events have a hard maximum capacity of 12 registered accounts.
- Exact home addresses and coordinates exist only in the protected `event_private_locations` domain. Friendship or group membership alone never reveals them.
- Private-location access must be authorized and audited, and must be recalculated after leaving, host removal, blocking, a group ban or eligibility loss, suspension, or cancellation.
- Blocks are immediate and private. Reporting is not required to block someone.
- Pending attendance does not consume capacity. Approval is an atomic database operation that prevents duplicate attendance and over-capacity races.
- Cancelling or leaving retains attendance history; ordinary product flows do not hard-delete it.
- Reports remain confidential from the reported user and group administrators. Moderation actions are auditable and appealable.
- Row Level Security is enabled and forced on every exposed Supabase table. Deny by default and authorize every object and transition server-side.
- Client-side visibility or disabled controls are never authorization.

Treat a change to any rule above as a product-contract change. It requires explicit approval and corresponding updates to schema constraints, RLS/functions, tests, architecture/specification documents, and the README.

## Sports-data contract

- Normal page requests never call an external sports provider.
- A protected server-only synchronization route imports provider data approximately every six hours.
- Validate provider responses with Zod, normalize them, and upsert them into local PostgreSQL catalog tables.
- Football fixtures and future NBA games share the provider-independent `sports`, `competitions`, `teams`, and `matches` model. Preserve provider identity with `(provider, provider_external_id)`.
- Index match access by competition and start time, home team and start time, away team and start time, status/time, and provider identity.
- A failed synchronization preserves the last good catalog and records a safe stale/failure state. Never log tokens or raw sensitive payloads.
- The submitted MVP implements football-data.org first. NBA integration and live scores remain deferred unless the product scope is explicitly revised.
- Keep provider tokens and the Supabase service-role key server-only.

## Two-person, two-Codex workflow

Both project partners participate in every feature. Do not divide the product into isolated personal ownership areas.

For each small vertical slice:

1. Select the next dependency-ready package from `docs/HUDDLE-STEP-BY-STEP-BUILD-SPEC.md` and agree on its outcome, exclusions, and acceptance criteria.
2. Both Codexes may inspect and propose plans independently.
3. The partners reconcile the plans before implementation.
4. One Codex is the writer on the active working tree; the other is a read-only reviewer against a committed diff or pull request.
5. The partners review the implementation together, run tests, and address valid findings.
6. Driver and reviewer roles rotate between slices or coherent checkpoints.
7. Merge only when both partners can explain the data flow, authorization boundary, important schema decisions, and tests.

Never run two write-enabled Codex tasks against the same files or database migration simultaneously. If the second Codex needs to experiment, use an isolated Git worktree or branch and integrate the result explicitly.

## Git and collaboration rules

- Treat GitHub as the source of truth and `main` as the stable branch.
- Implement application slices on small feature branches created from an up-to-date `main`.
- Before switching the writing computer, commit and push the checkpoint; the next writer must pull or fetch it before continuing.
- Do not push competing histories to the same feature branch.
- Do not commit, push, merge, deploy, create external resources, or mutate hosted services unless the user explicitly requests it.
- Never use destructive Git commands to remove changes unless the user explicitly authorizes the exact action.
- Preserve unrelated and pre-existing worktree changes.
- Use co-authored commit trailers when both partners genuinely paired on the committed work, using each partner's GitHub-linked email.
- Keep secrets in ignored local environment files and managed secret stores. Commit only safe examples such as `.env.example` with placeholder values.

## Implementation discipline

- Build one small vertical slice through database, authorization, backend, UI, tests, and documentation where applicable.
- Before a risky or multi-file change, identify the relevant specification sections and intended files.
- Prefer database constraints, RLS, and transactional functions for invariants and concurrency; do not rely on UI checks.
- Every database change uses a committed Supabase migration. Never make an unrecorded hosted-database edit.
- Regenerate and check database TypeScript types after schema changes once the command exists.
- Avoid speculative abstractions, unused tables, fake controls, and partially implemented deferred features.
- Use saved, sanitized sports-provider fixtures in automated tests. CI must not call live sports APIs.
- Store dates as UTC `timestamptz`; display them using `Asia/Jerusalem` by default.
- React-render user text; do not introduce raw user HTML.
- Paginate potentially growing collections and use the indexes specified by the implementation plan.
- Run the relevant repository scripts after changes. Do not claim a test, lint, typecheck, migration, build, or deployment passed without current command output.
- If tooling has not been scaffolded yet, say so clearly instead of inventing a successful verification result.

## Definition of done

A slice is complete only when:

- behavior matches the acceptance criteria and authoritative specification;
- input validation and server-side authorization are present;
- database invariants and RLS are covered where relevant;
- appropriate unit, component, database, and/or end-to-end tests exist and pass;
- loading, empty, error, and unauthorized states are handled;
- the complete diff has been reviewed for unrelated changes and exposed secrets;
- documentation remains truthful;
- both project partners understand and can present the implementation.

## Code Review Rules

Prioritize correctness, privacy, security, data integrity, and missing tests over formatting preferences.

Flag any change that:

- contradicts the locked host/audience or home-location rules;
- trusts client-side authorization or bypasses RLS;
- exposes a private address, provider token, service-role key, invite token, session value, or confidential report data;
- permits attendance duplication, capacity races, mutable attendee counters, or destructive history deletion;
- calls a sports provider from a normal page request or couples product identity directly to one provider;
- adds a schema change without a migration, constraint, index, RLS policy, and relevant pgTAP coverage;
- introduces deferred scope or an unapproved architecture dependency;
- changes behavior without appropriate tests or leaves documentation claiming behavior that does not exist.

Review findings should cite the smallest useful file and line range, explain the concrete failure scenario, and distinguish a blocking defect from an optional improvement.
