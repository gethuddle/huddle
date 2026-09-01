# Huddle: Implementation-Ready Specification

**Document purpose:** define the submitted MVP precisely enough that implementation can begin without reopening its main product, privacy, data, or architecture decisions.

**Status:** normative implementation plan. No application code, accounts, API registration, schema, or deployment is created by this document.

**Companion overview:** [Huddle: Product and Architecture Vision](./HUDDLE-ARCHITECTURE.md)

**Official requirements:** [project instructions](<../course-roadmap/project instructions.pdf>)

**Planning baseline:** 23 August 2026

**Approved post-B12 revision:** 30 August 2026. The workspace contract below deliberately supersedes the B01–B12 assumption that every completed personal profile may create a venue, that every group-organized event must wait for a separate owner/admin review, and that every venue listing must operate a capacity-backed guest list. Historical milestone evidence remains evidence of what was merged before this redesign; it is not the current permission contract.

**Approved discovery consistency revision:** 31 August 2026. A described discoverable group with an active owner is searchable without artificial member, moderator, rule, or event quotas. Eligible signed-in Fans may discover its published public-place events as acquisition previews, but must become active group members before attending; group home events remain private. Fan Explore also includes public listings from Venues the same human manages, fixture details list every event currently visible to that viewer, and an owner may delete a group through an audited archival transition that cancels live group events and revokes usable invites while retaining safety history.

**Approved cityless location and catalog revision:** 31 August 2026. Explore accepts a privacy-safe session origin from browser location or a confirmed OpenStreetMap/Photon address suggestion and ranks eligible results by coordinate distance across municipal borders. Profiles and groups have no location; events and Venues use confirmed coordinates, with exact homes isolated in the protected location domain. The scheduled football-data sync may store a tightly validated provider crest URL for display with an accessible Huddle initials fallback; normal page requests still never call the sports provider.

**Approved AI-assisted discovery revision:** 1 September 2026. Active Fans may describe a desired watch event in one short sentence on Home. Cloudflare Workers AI extracts only a bounded search intent; it receives no account, relationship, location, attendance, event, or private-address data. Huddle validates and resolves that intent against its local sports catalog, while one authenticated Supabase function remains the sole authorization, filtering, and ranking boundary. This revision does not approve generative answers, chat history, autonomous tools, RAG, AI event creation, or AI moderation.

The keywords **MUST**, **MUST NOT**, **SHOULD**, and **MAY** express implementation priority. A MUST is part of acceptance for the submitted MVP unless this specification is deliberately revised.

---

## 1. Outcome and scope

### 1.1 Product outcome

Huddle MUST let a person:

1. create and verify an adult account;
2. attest that they are 18+, accept the community rules, and activate an optional Fan identity or a self-serve Venue workspace;
3. discover safe, relevant future watch events near a session origin chosen through browser location or a confirmed Israel address;
4. form trust through accepted friendships or moderated social/team-linked groups;
5. request or accept attendance without exposing a home address prematurely;
6. host and manage a private, group, public-place, or venue event;
7. export an authorized event to a standards-based calendar file.

The system MUST also let a venue-only operator activate an Unverified venue workspace without first publishing a Fan identity, demonstrate the commercial listing loop, and let a platform moderator process reports.

### 1.2 Submitted MVP

- English UI targeting an Israel pilot.
- Email/password authentication with common safety eligibility (verified email, 18+ attestation, current community-rules acceptance, and a non-suspended account), optional Fan activation, and self-serve Venue activation.
- Anonymous browsing of safe public business-venue event, group, match, and venue information.
- Football-first catalog using synchronized provider data.
- Follows for sports, competitions, teams, and venues.
- Mutual friendships; no friends-of-friends access.
- Discoverable and unlisted groups with optional team association.
- Group applications, `owner`/`admin`/`member` roles, bans, invite links, atomic owner/admin-authored event publication, and review of ordinary-member event submissions by a different current owner/admin.
- Private-person events restricted to `group`, `friends`, or `invite_only`.
- Business-venue events using `public` or `team_followers`.
- Location discovery using a selected public origin from Photon/OpenStreetMap address suggestions or browser geolocation, with PostGIS distance ranking across municipal borders and no saved profile location.
- One-shot AI-assisted discovery for active Fans, returning at most three authorization-filtered event summaries from a validated, deterministic search intent.
- Venue `public` events may be `open_door`, with no Huddle RSVP, invitation, queue, guest list, or capacity claim, or `reservations`, using the registered-account attendance flows below.
- Reservation attendance request, accept/approve, decline, host removal, and leave flows with atomic capacity enforcement and no unregistered guests.
- RFC 5545 `.ics` event download.
- Basic reporting, moderation, audit records, tests, CI, Vercel deployment, and Supabase hosting.

### 1.3 Deferred explicitly

- numeric endorsements, reputation, ratings, and reviews;
- friends-of-friends visibility;
- chat, realtime messaging, and live match threads;
- notifications or reminders;
- Google Calendar OAuth;
- NBA integration and live scores;
- route planning and paid address autocomplete beyond the implemented Photon/OpenStreetMap search and public-event map;
- Stripe billing or subscription enforcement;
- venue menus, offers, analytics, and promoted ranking;
- ticket/payment handling;
- generative recommendations, automatic content/event creation, and AI moderation beyond the bounded intent-extraction seam above.

Deferred behavior MUST NOT be represented by fake controls, placeholder entitlements, or unused schema in the submitted app. Later interfaces are documented only where an explicit seam avoids coupling.

---

## 2. Product rules that are locked

### 2.1 Accounts and trust

- Supabase Auth MUST own credentials and email verification; Huddle MUST NOT store password hashes.
- The submitted MVP is 18+. Onboarding MUST record `adult_attested_at`; it MUST NOT collect a full date of birth merely to implement this attestation.
- Anonymous visitors MAY read explicitly public projections.
- Authentication is required for any mutation.
- Common safety eligibility requires a verified email, `adult_attested_at`, `rules_accepted_at` for the current rules version, and a non-suspended account.
- Fan activation is optional. A Fan is active only after the human explicitly enables the Fan workspace and supplies a unique handle and display name in addition to common safety eligibility. Profiles store no default city or location.
- Fan activation is required to follow, befriend, apply to or join a group, attend, host a private event, or create a group. Venue-only onboarding MAY leave Fan identity fields incomplete and non-public.
- Venue activation requires common safety eligibility, venue information, and a truthful business-representation attestation. It MUST NOT require Fan activation.
- One account represents one attendee. The MVP MUST NOT support anonymous guests or plus-ones.
- A block MUST be immediate, private from the blocked person, and independent of reporting. It removes any friendship, prevents new friend requests/invitations, hides future private events hosted by either person from the other, and revokes attendance/address access when the two users are host and attendee of the same future home event.
- A numeric trust score MUST NOT be calculated. Request-review UI SHOULD show only factual context: verified account, account age, mutual accepted friends, shared active groups, and relevant team follows.

### 2.2 Friendships

- Friendship is one canonical unordered user pair.
- One user requests; the other accepts or declines.
- Only `accepted` grants friends-only visibility.
- Either user may remove an accepted friendship.
- A user MUST NOT request themselves, create a duplicate pair, or request a blocked user.
- No query or policy may expand visibility through friends of friends.

### 2.3 Groups

- Roles are `owner`, `admin`, and `member`.
- Membership states are `pending`, `active`, `rejected`, `left`, and `banned` (with the durable ban also recorded in `group_bans`).
- A discoverable group always uses an application reviewed by an owner/admin.
- An unlisted group is absent from global search. It requires a hashed, expiring, revocable, usage-limited invite token to start an application.
- Possessing an invite token MUST NOT activate membership automatically.
- A discoverable group starts as `forming` and becomes `active`/searchable when it has an active owner and a non-empty description. Member count, additional admins, rules, and events are useful group content but MUST NOT be search prerequisites.
- Unlisted groups MAY operate immediately and do not need the discovery gate.
- A group's team association is optional. Product copy MUST say “Groups” when referring to the complete domain; “supporter group” is appropriate only when the group actually identifies with a team.
- Groups have no location, city, home area, local/global mode, or geographic membership boundary. Discoverable groups are globally searchable and sorted by active-member count before normalized name and ID; unlisted groups remain outside global search.
- Creation SHOULD show groups with the same optional team and similarly normalized names. Similarity warns; it does not block creation.
- An owner/admin MAY invite one eligible registered Fan directly. Only that recipient may accept or decline; acceptance activates membership after rechecking current safety, block, ban, and membership state. This is separate from a reusable unlisted-group link, which starts an application and remains expiring, revocable, and usage-limited.
- An active ordinary member MAY submit a group event for owner/admin review. An event authored by a current group owner/admin MUST publish atomically; an ordinary-member submission MUST remain pending until a current owner/admin whose user ID differs from `created_by` publishes or rejects it. Promotion after submission MUST NOT let an author review their own pending event.
- Platform moderators do not routinely approve group creation. They handle reports and suspensions.
- A group ban prevents content access, invitation use, and reapplication until removed by an authorized group admin or platform action.
- An owner/admin MAY remove an active non-owner member without banning them. Removal records `left`, revokes current member-only access, and permits a later valid application or invitation; Ban is a separate durable safety action.
- Only the active owner may delete a group. Product “delete” is an audited archive: the group disappears from live product reads, usable invite links are revoked, future live group events are cancelled, and membership/attendance/security history is retained.

### 2.4 Event audiences

| Host type | Allowed audience | Summary visibility | Attendance eligibility |
|---|---|---|---|
| Private person | `group` | Active, non-banned members; additionally, eligible signed-in Fans may preview a public-place event for an active discoverable group | Active, non-banned membership is still required to attend; host approval applies unless directly invited |
| Private person | `friends` | Host and host's accepted direct friends | Same accepted-friend rule, always subject to host approval unless directly invited |
| Private person | `invite_only` | Host and current invitees, including an eligible account that redeemed a current secure event-invite token | A current invitee only |
| Business venue | `public` | Anyone, including anonymous visitors | `open_door`: no Huddle attendance state; `reservations`: any eligible active Fan |
| Business venue | `team_followers` | Anyone, including anonymous visitors | User follows `audience_team_id`, unless directly invited |

- Host type, not place type, controls the allowed audience. A private person using a public place remains limited to `group`, `friends`, or `invite_only`.
- A private person MUST NOT create a `public` or `team_followers` event.
- A business venue MUST NOT use `group`, `friends`, or `invite_only` in the submitted MVP.
- Direct invitation is an explicit exception to the team-follow requirement for reservation-mode venue events, but not to Fan activation, adult/completion, block, suspension, cancellation, one-account-per-seat, or capacity rules. Open-door events have no invitation mutation at all.
- An invite-only host MAY create a high-entropy, expiring, revocable, usage-limited event-invite token. The database stores only its SHA-256 digest. Redemption requires an authenticated eligible Fan, creates a targeted pending invitation rather than attendance, and never makes the ordinary event URL an access capability. Acceptance remains the only token-derived path that reserves one place.
- An `organizing_group_id` identifies a group whose admins review the listing. It is distinct from `audience_group_id`; for a group-only event they will normally be equal.
- Only venue events may be anonymously visible. A private-person public-place event for an active discoverable group MAY appear to an eligible signed-in Fan as a safe acquisition preview; it remains absent for anonymous visitors and does not make the Fan attendance-eligible before approved group membership. Other private-person event existence follows its relationship audience.

### 2.5 Place and privacy

- Place types are `home`, `venue`, and `public_place`.
- A private person's place may be `home` or `public_place`; their audience remains group/friends/invite-only in either case.
- A business-venue event uses a venue place and public/team-followers audience.
- Home events have a hard submitted-MVP capacity limit of 12 registered Huddle accounts.
- Exact home address and coordinate MUST exist only in `event_private_locations`.
- The ordinary event record MUST NOT contain a selected city or an exact home address/coordinate. Venue and public-place events use confirmed public coordinates; exact home coordinates remain only in the protected location domain.
- Before approval, an eligible requester MAY receive a coarse distance band calculated inside the database, never the exact coordinate.
- Friendship and group membership alone MUST NOT reveal a home address.
- A home request requires host approval unless the requester accepts a direct invitation.
- An accepted direct invitation is treated as pre-approved attendance, subject to capacity.
- An exact private location is readable only through an audited database function by the host or an approved, currently authorized attendee.
- Leaving, host removal, blocking, event cancellation, account suspension, or loss of the required group eligibility MUST revoke future private-location reads. The product MUST disclose that it cannot make a previously viewed address unknown.
- After the first approval, an event's host type, audience, place kind, and private address are immutable. A material change requires cancellation and a new event so attendees consent again.
- Business-venue addresses and coordinates MAY be public. A private person's public-place address is visible only through that event's authorized audience or the signed-in discoverable-group acquisition preview above; it is never treated as a secret home address. Home coordinates remain protected without exception.
- A public business-venue event MAY use `open_door`. In that mode capacity is null and the listing must not imply that Huddle reserves, counts, approves, or guarantees physical admission. `team_followers` and every private-person event remain reservation-mode.
- Dates MUST be stored as `timestamptz` in UTC and rendered as Israel time by default. The implementation MUST use the canonical IANA identifier `Asia/Jerusalem` for daylight-saving correctness without presenting that identifier as user-facing location copy.

### 2.6 Attendance and capacity

- `attendance_mode` is either `reservations` or `open_door`. Existing events and all private/team-follower events use `reservations`; only a public business-venue event may use `open_door`.
- An `open_door` event is a discoverable fixture listing, not a Huddle guest list. It MUST reject request/join, invitation, approval, decline, removal, and attendee-list mutations; capacity MUST be null and `requires_approval` MUST be false.
- Open-door product copy MUST say that fans can come along without a reservation and MUST NOT claim a place, attendance count, or admission guarantee.
- Attendance states are `requested`, `approved`, `declined`, `left`, and `removed`.
- Each event/user pair has at most one attendance row; transitions update it rather than inserting duplicates.
- One attendance row reserves one place. No guest-count field exists.
- Pending requests do not consume capacity.
- Reservation-mode business-venue events default to immediate approval but MAY require host approval.
- All private-person events require host approval unless the attendee accepted a direct invitation.
- Approval MUST run in one database transaction that locks the event, checks event status/time, validates the reviewer, validates attendee eligibility, counts approved rows, checks capacity, and changes the state.
- When no place remains, the operation returns `EVENT_FULL` and changes nothing.
- Leaving an event retains the row as `left`.
- An event host may remove an attendee with the row retained as `removed`; removal immediately revokes future private-location access.
- Cancelling an event retains invitations and attendance history and blocks new attendance changes except harmless leave/history reads.
- Reservation-mode capacity is a positive integer. Open-door capacity is null. `approved_count` is derived; it MUST NOT be a mutable counter column.

### 2.7 Community safety and moderation

- Community rules MUST prohibit threats/planned fights, physical violence, harassment, stalking, sexual misconduct, hate/discriminatory abuse, doxxing or address sharing, impersonation/venue fraud, scams, illegal goods, weapons/dangerous activity, block/ban evasion, unapproved guests, and hidden commercial costs or affiliations.
- Sports rivalry does not excuse threats, slurs, harassment, or organizing violence.
- Every event MUST accurately state its host, location type, expected activity, costs, rules, and commercial affiliation. A named host or venue contact MUST be physically present.
- Group applications and attendance-request notes MUST NOT ask for sensitive data such as home address, phone number, financial/health data, sexual orientation, or full legal identity.
- A user may block without reporting and may report a profile, group, venue, or event before or after an event.
- Report categories are `immediate_danger`, `harassment_stalking_sexual_misconduct`, `hate_discrimination`, `privacy_exposure`, `impersonation_fraud`, `dangerous_illegal_activity`, `spam_scam`, and `other`.
- Reporter identity MUST NOT be shown to the reported user. A reporter may see received/reviewing/closed status but not private investigation details.
- Huddle is not an emergency service. The report flow for imminent danger MUST direct the user to local emergency services while still allowing a platform report.
- Platform actions progress according to severity: content correction/removal, warning, feature restriction, temporary suspension, event cancellation or group/venue suspension, and permanent account ban for severe or repeated violations.
- Moderation decisions require a reason and audit record. Affected users MUST have a simple appeal/review path; appeals are handled by a different moderator where practical.
- Group admins control group membership and group bans but cannot read or resolve platform reports.
- The canonical rules are a versioned, repository-owned document. A material rules update increments `rules_version`; users must accept the new version before their next community mutation, while retaining read/access needed to leave events or seek safety help.

### 2.8 Commercial boundary

- Fan features, friendships, groups, and private hosting are free.
- In the course MVP, a commonly eligible venue operator may self-serve venue activation without payment or Fan activation. Activation MUST create the immediately usable `unverified` venue, one active owner membership, and its Venue workspace atomically.
- Venue activation MUST record a truthful business-representation attestation and MUST NOT imply platform verification.
- `unverified` MUST be visible wherever a venue is represented.
- A generic Fan profile MUST NOT create or manage a venue. Every commercial venue mutation requires an active `owner` or `admin` Venue membership.
- A venue is never an attendee and never consumes capacity. The same human MAY attend only through a separately activated Fan identity, where the one-account-per-attendee rule applies normally.
- Production commercial publishing will later require a venue subscription entitlement.
- The MVP MUST NOT create Stripe customers, checkout sessions, subscription tables, webhooks, or fake paid states.
- Future promotion must be labelled and may reorder only already eligible results.

---

## 3. Actors and authorization summary

| Actor | Main permissions |
|---|---|
| Anonymous visitor | Read published public/team-follower business-venue event summaries, future matches, discoverable active groups, and non-suspended public venue summaries |
| Authenticated but not commonly eligible user | Read public data; manage own session, email verification, adult attestation, current-rules acceptance, and suspension-safe account actions only |
| Commonly eligible account without Fan activation | Activate/manage an authorized Venue workspace; complete Fan activation later; block and report through safe account actions |
| Active Fan | Follow, request friends, apply to groups, respond to invitations, attend, create allowed private events/groups, block and report |
| Event host | Edit eligible fields before lock and cancel; reservation-mode hosts may invite/review/remove attendees; private hosts may read their event's protected location |
| Active Venue owner/admin | Edit the authorized venue and manage its commercial events; no platform-verification power and no venue attendance identity |
| Group member | Read group content, submit group event, leave group |
| Group admin | Review ordinary-member group event submissions only when their user ID differs from `created_by`, atomically publish events they author, review applications, create/revoke invites, manage members and bans, edit group content |
| Group owner | All group-admin powers, admin promotion/demotion, and audited group deletion/archive; cannot remove the sole-owner invariant from a live group |
| Platform moderator | Review reports and suspend content/accounts according to moderation flow; no routine private-address access |
| Sync service | Upsert sports catalog and sync-run records only; no normal social mutation |

Authorization MUST be enforced twice for sensitive transitions: application logic gives a useful error, and RLS/database functions enforce the actual boundary.

---

## 4. UX and page contract

### 4.1 Route map

| Route | Access | Purpose |
|---|---|---|
| `/` | Public with workspace-aware signed-in view | Value proposition for visitors; direct continuation into the last valid Fan or Venue workspace |
| `/discover` | Public with richer signed-in view | Unified event/fixture discovery by area, date, competition, team, or specific fixture, with list/map results and venue listings |
| `/matches` | Public redirect | Compatibility redirect into `/discover`; not a separate primary destination |
| `/matches/[matchId]` | Public | Stable fixture object inside the Explore navigation context, with all linked events currently visible to the viewer |
| `/events` | Active Fan | Personal invitation and attendance dashboard |
| `/events/[eventId]` | Audience policy | Event summary, attendance state/action, permitted attendee context, calendar link |
| `/events/new` | Active Fan or active Venue member | Workspace-authorized event creation flow |
| `/events/[eventId]/manage` | Host/group reviewer | Edit, invite, review attendance, submit/approve/cancel |
| `/groups` | Public with personal signed-in view | Search active discoverable groups; show the viewer own forming and unlisted groups separately |
| `/groups/new` | Active Fan | Similar-group check then group creation |
| `/groups/[slug]` | Group visibility rules | Public summary or member content, application state, approved events |
| `/groups/[slug]/manage` | Owner/admin | Applications, members, roles, bans, rules, invites, submitted events; owner-only audited deletion/archive |
| `/join/group/[token]` | Active Fan | Validate unlisted invite and submit membership application |
| `/join/event/[token]` | Authenticated/Active Fan | Sign in if needed, atomically redeem a secure invite-only event token into a targeted invitation, then accept or decline on the event |
| `/venues/[slug]` | Public | Venue summary, unverified badge, follow action, future event listings |
| `/venues/new` | Commonly eligible account | Self-serve an Unverified venue, active owner membership, and Venue workspace with business-representation attestation |
| `/venues/[slug]/manage` | Active Venue owner/admin | Edit the authorized venue and manage venue event links |
| `/people/[handle]` | Public/signed-in safe projection | Safe profile, friendship/block state; never email/private attendance |
| `/people` | Active Fan | Bounded safe search by display name or handle, excluding self, suspended profiles, and blocked pairs |
| `/settings/profile` | Signed-in | Activate/edit optional Fan identity and common account settings |
| `/settings/interests` | Active Fan | Manage sport/competition/team follows |
| `/settings/friends` | Active Fan | Incoming/outgoing/accepted friendships |
| `/dashboard` | Active Fan or active Venue member | Workspace-specific current tasks and owned/authorized objects |
| `/moderation` | Platform moderator | Report queue and moderation actions |
| `/auth/sign-up` | Anonymous | Email/password signup |
| `/auth/sign-in` | Anonymous | Sign in |
| `/auth/verify` | Public callback/instruction | Verification result and next action |

Unauthorized access MUST render a clear `not found`, `sign in`, `finish safety setup`, `activate Fan`, `switch workspace`, or `not permitted` outcome as appropriate; it MUST NOT reveal that a private event exists through different error detail.

### 4.2 Main user journeys

**Onboarding:** sign up → verify email → attest 18+ → accept the current community rules → choose Fan or Venue setup. Fan setup adds handle/display name and optional interests; Venue setup adds a confirmed public address, venue information, and a truthful business-representation attestation without publishing a Fan identity.

**Discover and attend:** use current location or choose a confirmed address → filter by date/team/competition/specific fixture → see who is showing it nearby → open event → sign in/activate Fan if needed → request or join → see stable result → download calendar when authorized.

**Private home event:** choose fixture → home → choose group/friends/invite-only → enter protected address → set capacity up to 12 → publish/submit → invite or review registered users → approved attendee receives exact details. No plus-ones are available.

**Group:** search → open the safe summary → apply (or open invite) → admin reviews → member sees group content → ordinary member submits event → a different current owner/admin approves. An event authored by a current owner/admin publishes atomically without self-review; later promotion never lets the creator approve or reject their own pending submission. A published public-place event may introduce an eligible Fan to an active discoverable group, but attendance waits for active membership.

**Venue:** complete common safety eligibility → attest truthful business representation → atomically create an Unverified venue, active owner membership, and Venue workspace → choose synchronized fixtures whose dates and kickoff times are inherited → assign viewing areas → publish as open-door or reservation events. Fans either read “come along; no reservation” or attend/request through an active Fan identity. The venue itself is never an attendee.

### 4.3 UI component boundaries

Server Components SHOULD own page composition and initial reads. Client Components SHOULD be limited to interactive boundaries:

- `DiscoveryFilters` and `DiscoveryResults`;
- `LocationConsent`;
- `FollowButton`;
- `FriendshipControl`;
- `AttendanceControl`;
- `EventForm` steps and address fields;
- `ApplicationForm` and admin review controls;
- `InviteManager`;
- confirmation dialogs and accessible menus.

Shared presentational components include `MatchCard`, `EventCard`, `VenueCard`, `GroupCard`, `AudienceBadge`, `VenueVerificationBadge`, `DistanceBand`, `CapacityStatus`, `EmptyState`, `ErrorState`, and `PaginationSentinel`.

Generic reusable controls MUST use repository-owned shadcn components under `components/ui/` when a maintained component exists. Select the Radix-backed variants so dialogs, menus, selects, and similar controls retain tested keyboard, focus, and ARIA behavior. Huddle-specific feature components compose and brand these primitives; shadcn defaults never replace the approved Tailwind tokens, Familjen Grotesk, global surface treatment, or replaceable brand assets. Simple semantic HTML remains preferred when no interactive primitive or reusable component boundary is needed.

B04 establishes this shared component layer and progressively migrates existing reusable buttons, fields, cards, status panels, and confirmation dialogs without changing their product behavior or authorization boundaries. Later milestones use the shared layer by default instead of creating parallel hand-built component systems.

All forms MUST have labels, keyboard access, visible focus, inline field errors, a submission status, and a non-color-only status indicator. Destructive transitions require confirmation. Location permission denial MUST fall back to a keyboard-accessible confirmed-address search, never a city catalog.

---

## 5. Technical architecture

### 5.1 Selected stack

| Layer | Decision |
|---|---|
| Framework | Next.js App Router and React |
| Language | TypeScript with `strict: true` |
| UI | Tailwind CSS with repository-owned shadcn components backed by Radix UI primitives |
| Server state | TanStack Query only for discovery cursor pages and attendance mutations/invalidation |
| Client state | Local React state; URL search parameters for shareable filters; no Zustand |
| Validation | Zod for forms, route inputs, environment, and provider responses |
| Auth | Supabase Auth using cookie-based SSR sessions via `@supabase/ssr` |
| Database | Supabase PostgreSQL with RLS, PostGIS, SQL migrations, and generated TypeScript types |
| Server reads | Direct service/database reads from Server Components |
| Mutations | Server Actions calling domain services/database functions |
| HTTP/file endpoints | Route Handlers for discovery JSON, group search, sports sync, and `.ics` |
| AI intent extraction | Cloudflare Workers AI REST API, called only from a Vercel Route Handler |
| Tests | Vitest, React Testing Library, Playwright, and pgTAP |
| Quality | ESLint and Prettier |
| Delivery | GitHub Actions, Vercel, and Supabase |

Exact package versions MUST be pinned from stable releases at scaffolding time. The dependency lockfile MUST be committed.

### 5.2 Explicit non-decisions

- No separate Express server: Next.js is the backend-for-frontend and mutation layer.
- No Prisma: schema, RLS, PostGIS, functions, and migrations remain explicit SQL; generated Supabase types provide row typing.
- No Redis: database indexes, synchronized catalog data, and selective framework caching are sufficient initially.
- No Socket.IO/WebSockets: the MVP has no realtime feature.
- No Zustand: there is no complex global client-only state.
- No client-side service-role key or sports-provider token.
- No microservices, message broker, search cluster, object storage, or Dockerized production app.
- No AI agent, AI Gateway, vector database, RAG, model-written event copy, or AI authorization/ranking.

### 5.3 Logical flow

1. Middleware refreshes the Supabase session cookie; it MUST NOT be the only authorization layer.
2. Server Components query through a request-scoped Supabase server client and RLS.
3. Domain services contain application orchestration and map database/provider records into DTOs.
4. Server Actions parse Zod input, require the correct actor state, call a database function or scoped query, revalidate affected paths/tags, and return a typed result.
5. Route Handlers validate query/header/session input and return narrow DTOs/files.
6. PostgreSQL constraints and RLS protect invariants even when application code is wrong.
7. Only the internal sync route creates a service-role client, and that module MUST never be imported by a Client Component.
8. The assisted-discovery route sends only the bounded sentence plus current Israel date/time to Cloudflare, validates the returned JSON intent, then searches through the caller's ordinary Supabase session and database authorization.

### 5.4 Planned folder structure

```text
app/
  (public)/
    page.tsx
    discover/page.tsx
    matches/...
    events/[eventId]/page.tsx
    groups/...
    venues/...
  (auth)/auth/...
  (app)/
    dashboard/page.tsx
    events/new/page.tsx
    events/[eventId]/manage/page.tsx
    groups/[slug]/manage/page.tsx
    venues/new/page.tsx
    venues/[slug]/manage/page.tsx
    settings/...
  (moderation)/moderation/page.tsx
  api/
    assisted-discovery/route.ts
    discovery/route.ts
    groups/search/route.ts
    internal/sports-sync/route.ts
    events/[eventId]/calendar.ics/route.ts
  layout.tsx
  error.tsx
  not-found.tsx
components/
  ui/
  layout/
content/
  community-guidelines.ts
features/
  auth/
  profiles/
  sports/
  follows/
  friends/
  groups/
  venues/
  events/
  attendance/
  assisted-discovery/
  discovery/
  moderation/
lib/
  env/
  supabase/client.ts
  supabase/server.ts
  supabase/service-role.ts
  errors/
  validation/
  calendar/
providers/
  sports/types.ts
  sports/football-data.ts
  sports/normalizers.ts
supabase/
  config.toml
  migrations/
  seed.sql
  tests/
tests/
  fixtures/football-data/
  e2e/
types/
  database.generated.ts
  dto.ts
middleware.ts
```

Feature folders MAY contain `actions.ts`, `queries.ts`, `schemas.ts`, `service.ts`, `types.ts`, `components/`, and colocated unit tests. Dependency direction is `app/components → features → lib/providers`; features MUST NOT import from `app`, and `lib` MUST NOT import from a feature.

---

## 6. Database specification

### 6.1 Conventions

- Primary keys are UUIDs generated by PostgreSQL.
- All timestamps are `timestamptz`; all mutable tables have `created_at` and `updated_at` where useful.
- Public slugs/handles are normalized lowercase and enforced case-insensitively (using `citext` or a unique index on `lower(value)`).
- Coordinates use `geography(Point, 4326)`.
- User-owned foreign keys reference `auth.users(id)` through `profiles(id)`.
- Hard delete is limited to account-erasure workflows. Product removal normally uses status/revocation fields to preserve audit/history.
- RLS is enabled and forced on every exposed table. New migrations MUST fail review if they add an exposed table without policies.
- Enable PostGIS for geography and `pg_trgm` for similar-group-name suggestions in the initial extension migration.
- Security-definer functions MUST set a fixed empty `search_path`, schema-qualify objects, validate `auth.uid()`, and expose the minimum result.

### 6.2 Enums

| Enum | Values |
|---|---|
| `platform_role` | `moderator`, `admin` |
| `friendship_status` | `pending`, `accepted`, `declined` |
| `subscription_kind` | `sport`, `competition`, `team` |
| `group_visibility` | `discoverable`, `unlisted` |
| `group_lifecycle` | `forming`, `active`, `suspended`, `archived` |
| `group_role` | `owner`, `admin`, `member` |
| `group_membership_status` | `pending`, `active`, `rejected`, `left`, `banned` |
| `venue_verification_status` | `unverified`, `verified`, `suspended` |
| `event_place_kind` | `home`, `venue`, `public_place` |
| `event_audience` | `public`, `team_followers`, `group`, `friends`, `invite_only` |
| `event_status` | `draft`, `pending_group_review`, `published`, `cancelled`, `completed` |
| `invitation_status` | `pending`, `accepted`, `declined`, `revoked` |
| `attendance_status` | `requested`, `approved`, `declined`, `left`, `removed` |
| `attendance_source` | `self_request`, `direct_invite` |
| `report_category` | `immediate_danger`, `harassment_stalking_sexual_misconduct`, `hate_discrimination`, `privacy_exposure`, `impersonation_fraud`, `dangerous_illegal_activity`, `spam_scam`, `other` |
| `report_status` | `open`, `reviewing`, `resolved`, `dismissed` |
| `appeal_status` | `open`, `reviewing`, `upheld`, `modified`, `reversed` |

Provider match status is stored as a normalized string/enum appropriate to the adapter (`scheduled`, `timed`, `postponed`, `cancelled`, `finished`) without implementing live-score behavior.

### 6.3 Identity domain

#### `profiles`

| Column | Contract |
|---|---|
| `id` | UUID PK/FK to `auth.users(id)` |
| `handle` | nullable until Fan activation; unique, normalized, 3–30 allowed characters when active |
| `display_name` | nullable until Fan activation; 2–60 characters when active |
| `bio` | optional, max 500 plain-text characters |
| `adult_attested_at` | required for common safety eligibility; assertion of 18+, not identity verification |
| `rules_version`, `rules_accepted_at` | current accepted rules version and time, required for common safety eligibility |
| `profile_completed_at` | retained B01–B12 completion evidence; existing completed profiles are backfilled as enabled Fans |
| `fan_enabled_at` | explicit optional Fan-workspace activation; set only when common eligibility and required Fan identity fields are valid |
| `suspended_at` | nullable platform action |

Email is read from Auth only where needed and MUST NOT be part of public profile queries. Public Fan DTOs exist only for activated Fans and expose handle, display name, short bio, and factual trust context only. Venue-only operators have no public Fan projection.

Indexes: partial unique `lower(handle)` where non-null, `fan_enabled_at`, `profile_completed_at`, `suspended_at`.

#### `platform_roles`

Composite PK `(profile_id, role)`, granted/revoked by platform admins only. The first platform admin is bootstrapped by an explicit reviewed SQL/admin operation after their Auth user exists, never by a public signup field. Ordinary users cannot read the full role table; helper functions answer only necessary authorization questions.

#### `user_blocks`

PK `(blocker_id, blocked_id)`, `CHECK blocker_id <> blocked_id`, with indexes in both directions. Only the blocker may create/delete/read their own records; the blocked person cannot enumerate who blocked them. `block_user` atomically inserts the block, removes any friendship, prevents future direct interaction, and changes attendance to `removed`/`left` when one user hosts a future home event attended by the other. Policies and helper functions treat either direction as blocked for new private interaction.

### 6.4 Friend domain

#### `friendships`

| Column | Contract |
|---|---|
| `id` | UUID PK |
| `user_low_id`, `user_high_id` | canonical pair, CHECK low < high |
| `requested_by` | one member of pair |
| `status` | `friendship_status` |
| `responded_at` | nullable |

Unique `(user_low_id, user_high_id)`. Mutations MUST call a database function that canonicalizes IDs and checks block/suspension. Both participants may read; only the recipient can accept/decline a pending request; either can remove the pair.

### 6.5 Sports domain

#### `sports`

`id`, unique `slug`, `name`, `active`. Seed `football`.

#### `competitions`

`id`, `sport_id`, `provider`, `provider_external_id`, `code`, `name`, `country_name`, `active`, `last_synced_at`. Unique `(provider, provider_external_id)`; indexes on `(sport_id, active)` and `code`.

#### `teams`

`id`, `sport_id`, `provider`, `provider_external_id`, `name`, `short_name`, `tla`, `country_name`, nullable `crest_url`, `active`, `last_synced_at`. Unique `(provider, provider_external_id)`; indexes on `sport_id`, `lower(name)`, and `tla`.

The scheduled football-data adapter MAY persist a nullable crest URL only when it is HTTPS and belongs to the allowlisted `crests.football-data.org` host. Interfaces render it as provider-supplied artwork, never Huddle-owned artwork, and MUST preserve a repository-owned live-text `TeamMark` fallback derived from `tla` or the team name when it is absent or fails. Normal page requests never fetch the provider API.

#### `competition_teams`

PK `(competition_id, team_id, season_label)`. This is provider-upserted catalog membership, not a user-editable relationship.

#### `matches`

| Column | Contract |
|---|---|
| `id` | UUID PK |
| `provider`, `provider_external_id` | unique provider identity |
| `competition_id` | FK competition |
| `home_team_id`, `away_team_id` | FK teams, distinct |
| `starts_at` | UTC `timestamptz` |
| `status` | normalized provider state |
| `matchday`, `stage`, `season_label` | nullable provider metadata |
| `last_synced_at` | freshness timestamp |

Indexes: unique `(provider, provider_external_id)`, `(starts_at, status)`, `(competition_id, starts_at)`, `(home_team_id, starts_at)`, `(away_team_id, starts_at)`.

#### `subscriptions`

`id`, `user_id`, `kind`, nullable `sport_id`, `competition_id`, `team_id`, `created_at`.

`CHECK` requires exactly one target and requires it to match `kind`. Partial unique indexes prevent duplicates for each kind; target/user indexes support feed and RLS queries. Users manage only their own rows.

#### `provider_sync_runs`

`id`, `provider`, `started_at`, `finished_at`, `status`, `window_start`, `window_end`, `request_count`, `competitions_changed`, `teams_changed`, `matches_changed`, `error_code`, `error_summary`, `trigger_source`.

Never store tokens or full sensitive responses. Public freshness derives from the last successful run; only platform operators read detailed errors.

### 6.6 Group domain

#### `groups`

| Column | Contract |
|---|---|
| `id` | UUID PK |
| `slug`, `name` | unique slug; name 3–80 chars |
| `owner_id` | FK profile |
| `team_id` | optional FK team |
| `visibility` | discoverable/unlisted |
| `lifecycle` | forming/active/suspended/archived |
| `description` | required before discovery, max 2,000 plain-text chars |
| `activated_at`, `suspended_at` | nullable transition timestamps |

Indexes: unique `lower(slug)`, live visibility/lifecycle, optional team, `owner_id`, active-member search ordering, and a GIN `pg_trgm` index on normalized name. The creator transaction inserts an active owner membership.

#### `group_rules`

`id`, `group_id`, `position`, `text` (1–500 chars), `published_at`, timestamps. Unique `(group_id, position)`. Only group admins mutate; eligible readers follow group visibility.

#### `group_memberships`

| Column | Contract |
|---|---|
| `group_id`, `user_id` | composite unique identity |
| `role` | owner/admin/member |
| `status` | membership state |
| `application_message` | optional, max 1,000 chars |
| `invite_id` | nullable source invite |
| `reviewed_by`, `reviewed_at` | nullable decision evidence |

Indexes: `(group_id, status, role)`, `(user_id, status)`, `(reviewed_by, reviewed_at)`. Database functions enforce one active owner, owner membership, valid reviewer, and ban checks.

#### `group_invite_tokens`

`id`, `group_id`, `token_hash`, `created_by`, `expires_at`, `max_uses`, `use_count`, `revoked_at`, timestamps. Store only a SHA-256 digest of a cryptographically random high-entropy token; unique `token_hash`. High entropy prevents practical offline guessing, while the digest supports exact lookup. `use_count` increments atomically only when an invite successfully starts an application. Admins can list metadata but never recover a token after creation.

#### `group_invitations`

`id`, `group_id`, `invitee_id`, `invited_by`, `status`, `responded_at`, `revoked_at`, timestamps. One recipient sees and responds to their own pending invitation; current owners/admins may list or revoke pending invitations for their group. Controlled functions enforce eligibility, blocks, bans, role authority, and one live invitation per group/recipient. Direct table access remains denied.

#### `group_bans`

PK `(group_id, user_id)`, plus `banned_by`, `reason` (bounded plain text), `created_at`, `revoked_by`, `revoked_at`. Active means `revoked_at IS NULL`. Policies deny group content and new applications when an active ban exists.

### 6.7 Venue domain

#### `venues`

| Column | Contract |
|---|---|
| `id` | UUID PK |
| `owner_id` | FK profile |
| `slug`, `name` | unique slug; bounded display name |
| `address_text` | public bounded text |
| `location` | public `geography(Point,4326)` |
| `description` | max 2,000 plain-text chars |
| `screen_count` | nullable positive integer |
| `stated_capacity` | nullable positive integer |
| `verification_status` | defaults `unverified` |
| `business_representation_attested_at` | required self-serve activation attestation; not platform verification |
| `suspended_at` | nullable |
| `archived_at`, `archived_by` | nullable owner-initiated terminal live-product state and actor evidence; never substitutes for moderator suspension |

Indexes: unique `lower(slug)`, GiST `location`, `(verification_status, archived_at)`, and `owner_id`. The confirmed public address and coordinate are authoritative; no separate city is stored. `owner_id` remains the canonical primary owner during the redesign migration, but it is not sufficient workspace authorization. Only platform moderators change verification/suspension status; only the current active owner may archive the live venue through the controlled function.

#### `venue_memberships`

| Column | Contract |
|---|---|
| `venue_id`, `user_id` | composite unique membership identity |
| `role` | `owner` or `admin` |
| `activated_at` | required active-state timestamp |
| `revoked_at`, `revoked_by` | nullable audited revocation evidence |

Indexes: `(venue_id, revoked_at, role)` and `(user_id, revoked_at)`. Every existing `venues.owner_id` is backfilled as one active owner membership. Controlled activation creates the venue, truthful-representation attestation, active owner membership, and workspace atomically. Database constraints/functions preserve exactly one active owner. Every commercial mutation rechecks active membership; a remembered workspace cookie and `owner_id` alone never authorize it.

#### `venue_follows`

PK `(user_id, venue_id)`, with reverse `(venue_id, created_at)` index. User controls only their own follow.

### 6.8 Event domain

#### `events`

| Column | Contract |
|---|---|
| `id` | UUID PK |
| `created_by` | submitting profile |
| `host_user_id`, `host_venue_id` | exactly one non-null host |
| `organizing_group_id` | optional group that reviews the event |
| `match_id` | required FK match for submitted MVP |
| `title`, `description` | bounded plain text |
| `starts_at`, `ends_at` | UTC; end > start; event start should align with match but may differ |
| `place_kind` | home/venue/public_place |
| `venue_id` | required only for venue place |
| `public_place_name`, `public_address_text`, `public_location` | required only for public place; location is geography |
| `audience` | event audience enum |
| `audience_team_id` | required only for team-followers |
| `audience_group_id` | required only for group audience |
| `attendance_mode` | `reservations` or `open_door`; open door is valid only for public business-venue events |
| `capacity` | positive integer for reservations; null for open door |
| `requires_approval` | false for open door; forced true for private-person reservations; configurable for business-venue reservations |
| `status` | event lifecycle |
| `published_at`, `cancelled_at`, `cancel_reason` | transition evidence |

Checks enforce:

- exactly one host;
- a business host uses the selected venue and the acting user has an active Venue owner/admin membership at every commercial mutation;
- a private-person host (`host_user_id`) uses only group/friends/invite-only, may use home or public place, and always requires approval unless attendance comes from a direct invitation;
- a business-venue host (`host_venue_id`) uses only public/team-followers and uses a venue place;
- open door requires a business-venue host, public audience, null capacity, and no approval; team-followers always uses reservations;
- home has no public address/location/venue and has capacity from 1 through 12;
- venue place has a venue and no private/public-place fields;
- public place has name/address/location and no venue/private-location conflict and cannot make a private-person event publicly visible;
- audience target columns match exactly the chosen audience;
- `audience_group_id` refers to an active membership relationship at creation;
- team audience has one team;
- `ends_at > starts_at`; reservation capacity is positive and open-door capacity is null.

After the first approved attendance row exists, controlled update functions reject changes to host identity/type, audience/target, place kind, or the private address/location with `MATERIAL_CHANGE_REQUIRES_NEW_EVENT`. The host must cancel and recreate instead.

Some cross-table ownership/audience conditions require a controlled database function/trigger rather than a simple CHECK. All event create/update actions MUST use that function.

Indexes: `(status, starts_at, id)`, `(match_id, status)`, `(created_by, status)`, `(host_user_id, status)`, `(host_venue_id, status)`, `(organizing_group_id, status)`, `(audience_group_id, status)`, `(audience_team_id, status)`, and GiST on public-place `public_location` (or an expression/partial spatial index). Explore ranks venue, public-place, and eligible protected-home results from a session origin across municipal borders; no event city is stored or selected.

#### `event_private_locations`

`event_id` PK/FK, `address_text`, optional structured directions, exact `location geography(Point,4326)`, timestamps. Only home events may have a row. Add GiST `location`. Deny direct client select/update. Hosts set it through the event transaction; authorized reads use `get_private_event_location` and write an audit event. That function rechecks current event, attendance, block, suspension, cancellation, and group-ban eligibility on every call; a prior approval is not a permanent authorization.

#### `event_invitations`

`id`, `event_id`, `invitee_id`, `invited_by`, `status`, `responded_at`, timestamps. Unique `(event_id, invitee_id)`. There is no guest-count/plus-one field. Invitees and event managers can read the relevant row. Acceptance calls the same capacity-safe attendance function; revocation cannot silently remove already approved attendance and instead requires an explicit host-removal action allowed by policy.

#### `event_invite_tokens`

`id`, `event_id`, `token_hash`, `created_by`, `expires_at`, `max_uses`, `use_count`, `revoked_at`, timestamps. Store only a SHA-256 digest of a cryptographically random high-entropy token; unique `token_hash`. Only an invite-only event's current manager may create/list metadata/revoke. Plaintext is returned exactly once at creation. Redemption locks the token and event, rechecks current Fan/block/suspension/cancellation/time/capacity eligibility, creates at most one pending `event_invitations` row for the redeemer, and increments `use_count` only for a newly created invitation. It never returns protected location data or creates attendance.

#### `event_attendance`

`id`, `event_id`, `user_id`, `status`, `source`, `requested_at`, `reviewed_by`, `reviewed_at`, `left_at`, `removed_by`, `removed_at`, optional bounded `removal_reason`, timestamps. Unique `(event_id, user_id)`. No guest-count column exists. Indexes `(event_id, status, created_at)` and `(user_id, status, event_id)`. Attendance creation requires the human's active Fan identity; no venue or Venue workspace can occupy `user_id` or consume a seat. Only an event manager may set `removed`; only the attendee may set `left`; both retain history and immediately end private-location eligibility.

### 6.9 Safety and audit domain

#### `reports`

`id`, `reporter_id`, `target_type`, nullable typed target FKs (`profile_id`, `group_id`, `venue_id`, `event_id`), `category report_category`, `details`, `status`, `assigned_to`, `resolution_note`, timestamps. A CHECK requires exactly one target matching `target_type`. Reports remain possible before and after an event. Reporter sees their own status but not internal notes; moderators see the queue; the reported user cannot read the report or reporter identity.

#### `moderation_actions`

`id`, `report_id` nullable, `moderator_id`, `target_type/id`, `action`, `reason`, `created_at`, `reversed_by`, `reversed_at`. Allowed actions are content removal/correction request, warning, feature restriction, temporary suspension, event cancellation, group/venue suspension, and permanent account ban. Only platform moderators read/write. Product state changes and action log happen transactionally.

#### `moderation_appeals`

`id`, `moderation_action_id`, `appellant_id`, `reason`, `status`, `reviewed_by`, `reviewed_at`, `outcome_reason`, timestamps. Unique active appeal per action/appellant. The appellant sees their own appeal and outcome; platform moderators review it, with a different reviewer from the original action where practical.

#### `security_audit_events`

`id`, `actor_id` nullable for service action, `action`, `resource_type`, `resource_id`, `outcome`, `request_id`, minimal JSON metadata, `created_at`. Record blocks, attendance approvals/removals, group membership decisions, bans, moderation/appeals, sync authorization failures, and private-location reads. Never log session cookies, invite tokens, precise home addresses, passwords, or provider secrets.

### 6.10 Safe projections/views

Create narrow views or database functions rather than returning `SELECT *`:

- `public_profile_summaries`;
- `public_future_matches`;
- `public_venue_summaries`;
- `discoverable_group_summaries`;
- `visible_event_summaries`;
- `event_attendance_summaries` with policy-appropriate attendee fields.

Views MUST use invoker semantics where supported so RLS is not bypassed. Where a security-definer function is required, its contract and tests must prove that it returns less data than the base table.

### 6.11 RLS policy matrix

| Resource | Read | Insert/update/delete |
|---|---|---|
| Sports catalog | Public active rows | Sync service/platform migration only |
| Profile | Safe projection only for active Fans; full own human trust row; limited factual context through functions | Own bounded fields through common-safety/Fan-activation functions; adult/rules/Fan activation fields cannot be forged by direct row update; suspension/roles platform only |
| Subscription/follow | Own rows; aggregate counts only if deliberately exposed | Own rows only, active Fan required |
| Friendship | Pair participants | Controlled pair functions only |
| Group | Active discoverable summary public; unlisted/member content for eligible users; banned denied | Creator/admin functions according to role |
| Membership/application | Applicant sees own; admins see their group's; active members see safe roster | Controlled application/review/role functions |
| Group invite | Admin metadata; token validation function returns minimal result | Admin functions only |
| Venue | Non-suspended public summary | Self-serve activation function; active Venue member content fields; moderator status fields |
| Venue membership | Own active workspace memberships; authorized venue members see bounded coworker rows | Controlled owner/admin role and revocation functions; exactly one active owner |
| Event | Public/team business-venue summaries public; private-person audiences only per relationship; manager access | Controlled event functions; current group owner/admin authors publish atomically, ordinary-member submissions require a different current owner/admin reviewer (`reviewer_id <> created_by`) |
| Private event location | No direct client read | Controlled host write; audited authorized read function only |
| Invitation | Invitee and event manager | Invite/respond/revoke functions only |
| Attendance | User's own, event manager, and safe approved-attendee list permitted by event | Atomic request/approve/decline/leave/remove functions only |
| Report | Reporter sees own status; moderators see queue | Reporter creates; moderator resolves |
| Audit/moderation/appeal | Relevant appellant sees own appeal outcome; otherwise platform role only | Dedicated functions/service only |

Every policy MUST include block, suspension, and ownership considerations where relevant. Tests MUST cover both allowed and denied cases; testing only successful reads is insufficient.

---

## 7. Interfaces

### 7.1 Sports-provider contract

The application-level contract is provider independent:

```ts
type DateRange = { from: string; to: string };

interface SportsProvider {
  readonly name: string;
  listCompetitions(): Promise<NormalizedCompetition[]>;
  listFixtures(
    dateRange: DateRange,
    competitionExternalIds: string[],
  ): Promise<NormalizedFixture[]>;
}
```

Normalized competition/team/fixture objects MUST contain only fields Huddle uses semantically: provider identity, name/code, optional allowlisted crest URL, competition, home/away team, UTC start, and normalized status. Zod parses the provider response before normalization. Unknown optional fields are ignored; missing required identity/time/team fields fail that item/run visibly rather than entering malformed data.

An adapter error is categorized as `AUTH`, `RATE_LIMIT`, `UPSTREAM_4XX`, `UPSTREAM_5XX`, `TIMEOUT`, `INVALID_RESPONSE`, or `UNKNOWN` and must not include the token.

### 7.2 Route Handlers

#### `POST /api/discovery`

The bounded private request body accepts:

- paired `lat`/`lng` from browser location or a confirmed address origin;
- `radiusKm`: allowlisted bounded options, default 15 km;
- `from`, `to`: future dates bounded by the locally synchronized football-season end;
- optional `team`, `competition`, `match` IDs;
- `cursor`: opaque signed/base64url cursor containing last sort keys, not raw SQL;
- `limit`: default 20, maximum 50.

`GET` rejects discovery requests so precise coordinates cannot enter the URL. `POST` validates paired `lat`/`lng` in a bounded JSON body, returns `private, no-store`, and never logs or persists the precise origin. Address text is resolved through the location-search route and is not sent to discovery or stored as an origin.

Response `200`:

```ts
type DiscoveryResponse = {
  items: EventSummaryDto[];
  nextCursor: string | null;
  locationMode: "browser";
  generatedAt: string;
};
```

Sort is deterministic: eligible published future events by match/interest relevance for signed-in users, then distance/time, then ID tie-breaker. Signed-in Fan results merge ordinary eligible events, open-door listings, and public listings from Venues the same account manages, deduplicated by event ID. Anonymous users receive only public business-venue events, ordered deterministically by distance/time without personalization. Eligible signed-in home results include only a safe coarse distance summary before approval.

#### `POST /api/assisted-discovery`

The private, no-store route is available only to an authenticated active Fan. It accepts either a bounded `interpret` request containing a maximum-400-character sentence and optional session origin, or a `continue` request containing a five-minute actor-bound signed intent token plus an origin. `GET` is rejected, and neither the sentence nor origin may enter URLs, application logs, database rows, or caches.

Cloudflare receives only the sentence, current Israel date/time, and the fixed intent schema. It MUST NOT receive an actor identifier, profile, friendship/group data, attendance, coordinates, event rows, or private location. Model output is untrusted and MUST pass a strict Zod schema before Huddle resolves team/competition aliases, date semantics, relationship mode, host kind, proximity, and the existing venue-facility enum.

The route returns exactly one of `results`, `needs_location`, `clarification`, `unsupported`, or `no_results`. It never invents event copy, silently relaxes a filter, or asks the model to rank database rows. Results contain at most three safe event summaries produced by `search_assisted_events`; explanation strings and matched reasons are deterministic application copy.

#### `GET /api/groups/search`

Validates `q`, optional `team`, `cursor`, and `limit`. Returns only `active + discoverable` groups globally, ordered by active-member count before normalized name and ID. Groups carry no geographic metadata. Group-creation similarity MAY reuse a signed-in mode that includes the creator's own forming groups but never another unlisted group.

#### `POST /api/internal/sports-sync`

- No browser session route.
- Requires a constant-time comparison of `x-huddle-sync-secret` against the server environment secret.
- Rejects missing/invalid secrets with a generic `401` and audit record.
- Creates the service-role Supabase client only after authentication.
- Applies a single-run advisory lock; concurrent call returns `409 SYNC_ALREADY_RUNNING`.
- Optional body may specify an allowlisted sync reason but cannot expand beyond configured competitions/date horizon.
- Returns run ID and summary, never raw provider data or secrets.

#### `GET /api/events/{id}/calendar.ics`

- Applies ordinary event visibility and private-location rules.
- A public business-venue event calendar MAY be anonymous.
- Private audience requires a valid session.
- Sets `Content-Type: text/calendar; charset=utf-8`, safe `Content-Disposition`, and privacy-appropriate cache headers.
- Escapes RFC 5545 text, folds long lines, emits UTC date-times, stable UID, DTSTAMP, DTSTART/DTEND, SUMMARY, DESCRIPTION, URL, and authorized LOCATION.

### 7.3 Server Action contract

Server Actions are internal application interfaces, not a public API. Each MUST return a discriminated result and MUST NOT throw expected validation/authorization errors into the UI:

```ts
type ActionResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: { code: DomainErrorCode; message: string; fields?: Record<string, string[]> } };
```

Mutation groups:

- auth/onboarding: signup, sign in/out, record adult attestation/current rules acceptance, save profile;
- follows: follow/unfollow sport, competition, team, venue;
- friends: request, accept, decline, remove, block/unblock;
- groups: create, apply, review, change role, leave, ban/unban, create/revoke invite, save rules;
- venues: activate venue plus owner membership atomically, update through active membership, manage membership, follow/unfollow as an active Fan;
- events: create draft, update, atomically publish current-owner/admin-authored group event, submit ordinary-member event for review by a different current owner/admin, approve/reject that pending event, publish, cancel, invite;
- attendance: request/join, accept invitation, approve/decline request, leave, remove attendee;
- safety: block/unblock, report, assign, resolve, dismiss, restrict/suspend/reverse, appeal/review.

Every community action follows: parse → authenticate → require common safety eligibility → authorize the active workspace and relationship → execute constrained database operation → map error → revalidate only affected paths/tags. Fan attendance/private-social mutations additionally require Fan activation; every commercial venue mutation additionally requires active Venue membership. Auth/session and onboarding actions apply only the gates that can logically precede them: signup and sign-in may begin anonymously, Fan activation may complete Fan identity fields, and venue-only onboarding intentionally allows those Fan fields to remain incomplete and non-public.

### 7.4 Required database functions

| Function | Required behavior |
|---|---|
| `block_user(target_user_id)` | Reject self; insert private block; remove friendship; end affected future home-event attendance/address access atomically; audit without notifying target |
| `request_friendship(target_user_id)` | Canonicalize pair; reject self/block/duplicate; insert pending |
| `respond_to_friendship(friendship_id, decision)` | Recipient-only valid transition |
| `create_group(input)` | Create group and active owner membership atomically; initial lifecycle based on visibility |
| `review_group_membership(group_id, user_id, decision)` | Admin-only, ban-aware transition with audit |
| `consume_group_invite(token, message)` | Hash/compare, check expiry/revocation/use limit/ban, create pending application, increment use atomically |
| `create_event_invite_token(event_id, expires_at, max_uses)` | Invite-only event manager; return plaintext once, store digest, bound expiry/uses, audit without logging token |
| `redeem_event_invite_token(token)` | Eligible authenticated Fan; lock/check digest, event, block, expiry/revocation/use limit, create one pending invitation, increment use only once |
| `revoke_event_invite_token(invite_token_id)` | Invite-only event manager; revoke future redemption without deleting existing invitations/history |
| `evaluate_group_discoverability(group_id)` | Return gate facts and activate only when all thresholds pass |
| `activate_venue(input)` | Require common safety eligibility and truthful-representation attestation; create an Unverified venue, active owner membership, and workspace atomically without requiring Fan activation |
| `archive_venue(venue_id, confirmation)` | Current active owner only; exact-name confirmation; atomically hide venue/workspace from live reads, cancel future live events, revoke usable invitations, retain history, and audit |
| `create_or_update_event(input)` | Enforce active Fan or Venue-membership authority, private-versus-business audience, open-door versus reservation invariants, venue-as-non-attendee, 12-person home cap, no guest count, group author role/publication behavior, and private location; reject material changes after approval |
| `publish_group_event(event_id, decision)` | Current owner/admin authors publish atomically in the creation transaction; an ordinary-member pending event may be approved/rejected only by a current owner/admin whose user ID differs from `created_by`, with the identity check and decision audited |
| `discover_events(filters, cursor, limit)` | Apply visibility, status, location, time, interest, block, and keyset pagination rules |
| `request_or_join_event(event_id)` | Reservation-only eligibility and approval decision; immediate path capacity-safe; reject open-door events |
| `respond_to_event_invitation(invitation_id, decision)` | Invitee-only; accepting reserves capacity atomically |
| `review_attendance(attendance_id, decision)` | Event-manager only; locks event and enforces capacity |
| `remove_attendee(attendance_id, reason)` | Event-manager only; retain `removed` state and revoke future private-location access atomically |
| `get_private_event_location(event_id)` | Host/currently authorized approved attendee only; recheck block/ban/suspension/cancellation, return minimum, and audit |
| `request_context(event_id, requester_id)` | Return bounded mutual-friend/shared-group/follow facts, not private network graphs |
| `submit_report(target, category, details)` | Accept before/after event, hide reporter from target, create private moderation item |
| `submit_moderation_appeal(action_id, reason)` | Affected user only; one active appeal; assign reviewer other than original where practical |

Functions return stable domain error codes for expected failures.

### 7.5 CRUD ownership matrix

| Entity | Create | Read | Update | Remove/terminal transition |
|---|---|---|---|---|
| Profile | Auth trigger + owner onboarding | Safe public/own | Owner bounded fields | Account-erasure flow later; moderator suspension now |
| Follow | User | User/safe counts | N/A | User unfollow |
| Friendship | Requester | Pair | Recipient responds | Either removes |
| Group | Active Fan | Visibility/RLS | Owner/admin | Archive/suspend, not routine hard delete |
| Membership | Applicant/invite function | Applicant/admin/safe roster | Admin decision/role | Leave or ban |
| Venue | Commonly eligible operator through atomic activation | Public while not archived | Active Venue owner/admin | Owner archive or moderator suspension; no hard delete when referenced |
| Venue membership | Atomic activation creates owner | Self/authorized venue members | Active owner/admin through controlled functions | Audited revoke; exactly one active owner retained |
| Event | Eligible host/member | Audience/RLS | Host or group reviewer | Cancel, retain history |
| Invitation | Event manager | Invitee/manager | Invitee response | Manager revoke pending invite |
| Attendance | Eligible registered attendee/action | Self/manager/safe approved list | Controlled transitions | `left` by attendee or `removed` by host; retain history |
| Report | Authenticated account through safe reporting flow | Reporter/moderator | Moderator status | Resolve/dismiss, retain |
| Sports catalog | Sync service | Public | Sync service | Mark inactive; do not delete referenced records |

---

## 8. Sports data synchronization

### 8.1 Submitted provider

Use [football-data.org v4](https://www.football-data.org/documentation/quickstart). At the planning baseline, its free plan advertises major competition fixtures/schedules and a 10 requests/minute limit; recheck [pricing](https://www.football-data.org/pricing), [coverage](https://www.football-data.org/coverage), and [terms/registration](https://www.football-data.org/client/register) before registering or launch.

Rules:

- `FOOTBALL_DATA_API_TOKEN` is server-only.
- Normal page requests never call the provider.
- The configured competition allowlist must fit the active provider plan.
- Provider attribution is visible in the footer and a `/data-sources` page.
- Accept only the adapter's allowlisted HTTPS crest host, attribute the provider, and retain initials/original artwork as the failure fallback. Do not claim provider artwork as Huddle-owned.

### 8.2 Schedule and window

- Supabase Cron/`pg_net` calls the protected Vercel route every six hours.
- The call secret is stored in Supabase Vault and mirrored as a Vercel server environment secret.
- Each regular run synchronizes accessible competitions and matches from yesterday through the current football season end on May 31.
- A configuration file/environment allowlist defines competition codes/IDs; request input cannot override it.
- A database advisory lock prevents overlapping runs.

### 8.3 Run algorithm

1. Authenticate the cron request.
2. Insert `provider_sync_runs(status='running')`.
3. Fetch the competitions accessible to the provider account, intersect them with Huddle's configured allowlist, and determine the bounded window.
4. Fetch fixtures only for that intersection, sequentially or with rate-aware bounded concurrency.
5. Parse every response with Zod.
6. Normalize competition/team/fixture records.
7. Upsert by `(provider, provider_external_id)` in transaction-sized batches.
8. Never delete referenced matches because they fall outside the window; mark catalog records inactive only by deliberate policy.
9. Commit changed data, update freshness, and mark run successful with counts/duration.
10. On failure, roll back the affected transaction/batch, mark the run failed, preserve existing catalog rows, and expose a non-sensitive stale indicator.

Logs record run ID, endpoint category, status, duration, request count, retry count, and row counts—not tokens or full payloads. Respect `429`/retry headers with bounded retries and jitter; do not retry provider authentication or schema errors blindly.

### 8.4 Alternatives, not implementations

- [Footballdata.io](https://footballdata.io/) advertises a free plan of 2,000 requests/month and five leagues at the planning baseline. It can become a replacement adapter but MUST NOT be integrated simultaneously for the MVP.
- [BALLDONTLIE](https://docs.balldontlie.io/) exposes NBA teams/players/games with a free rate tier at the planning baseline. A future NBA adapter implements the same normalized provider contract and adds basketball catalog data without changing event identity/audience logic.

All provider facts are time-sensitive and MUST be verified before implementation credentials are obtained.

---

## 9. State, caching, and data loading

### 9.1 State ownership

- URL search parameters own shareable discovery filters.
- Server Components own initial page data and authorization-sensitive reads.
- TanStack Query owns subsequent discovery pages and attendance mutation status/cache invalidation.
- React local state owns open dialogs, form steps, unsaved inputs, and disclosure controls.
- PostgreSQL owns durable business state.
- No authorization decision may rely on cached client state.

### 9.2 Query keys and invalidation

Use structured keys such as `['discovery', normalizedFilters]`, `['event', eventId]`, and `['attendance', eventId]`. After a successful attendance mutation, invalidate the event summary, current user's dashboard, and attendance list only. Follow changes invalidate interest settings and discovery; group decisions invalidate group/member/application views.

Optimistic UI MAY show a pending button state but MUST not optimistically claim an approved seat before the atomic database response.

### 9.3 Cache policy

- Stable sports/competition/team catalog pages MAY use short revalidation windows and tags.
- Personalized, private-audience, attendance, admin, and exact-location responses MUST be dynamic/private and not shared-cacheable.
- Discovery JSON uses privacy-safe cache headers: public business-venue results may be short-lived; personalized/private results are `private, no-store` unless a proven safe per-user cache is designed.
- `.ics` for a private-person event is `private, no-store`; public business-venue calendar data MAY have a short public cache.
- Provider freshness is explicit; stale cached fixtures are preferable to an unavailable page.

---

## 10. Validation and error handling

### 10.1 Validation boundaries

Zod schemas MUST validate:

- environment variables at server startup/build where possible;
- form and Server Action input;
- URL/query parameters and cursors;
- internal cron request body;
- sports-provider JSON;
- calendar/event text before serialization.

Database constraints repeat critical structural invariants. RLS/functions repeat authorization and state-transition invariants. Client validation exists for usability only.

Text is stored/rendered as plain text. The MVP MUST NOT accept raw HTML or Markdown that is rendered as HTML.

### 10.2 Domain errors

Stable codes include:

`AUTH_REQUIRED`, `EMAIL_NOT_VERIFIED`, `ADULT_ATTESTATION_REQUIRED`, `RULES_ACCEPTANCE_REQUIRED`, `PROFILE_INCOMPLETE`, `ACCOUNT_SUSPENDED`, `NOT_FOUND`, `NOT_ALLOWED`, `VALIDATION_FAILED`, `BLOCKED_RELATIONSHIP`, `INVALID_TRANSITION`, `GROUP_BANNED`, `INVITE_INVALID`, `INVITE_EXPIRED`, `EVENT_CANCELLED`, `EVENT_STARTED`, `EVENT_FULL`, `ALREADY_ATTENDING`, `MATERIAL_CHANGE_REQUIRES_NEW_EVENT`, `LOCATION_NOT_AUTHORIZED`, `SYNC_ALREADY_RUNNING`, `UPSTREAM_UNAVAILABLE`, and `INTERNAL_ERROR`.

Public messages are useful but non-enumerating. Server logs include request/run ID and safe context. Unexpected errors reach `error.tsx` boundaries and a generic response; no stack trace, SQL message, policy name, secret, private address, or provider payload is sent to the browser.

### 10.3 HTTP behavior

- `400` invalid request shape;
- `401` missing/invalid authentication;
- `403` authenticated but not permitted, only when revealing resource existence is safe;
- `404` absent or private/non-visible resource;
- `409` capacity/state/concurrency conflict;
- `422` valid shape but invalid business input where useful;
- `429` rate/abuse limit;
- `500` unexpected internal failure;
- `502/503` upstream/provider unavailable on internal operations.

---

## 11. Security specification

This design follows the [OWASP Authorization Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Authorization_Cheat_Sheet.html): deny by default, validate authorization on every request, and use relationship/attribute rules for social data.

### 11.1 Authentication and session

- Use `@supabase/ssr` cookie sessions and the current Supabase SSR guidance.
- Cookies must use secure production attributes (`HttpOnly` where controlled by the Auth flow, `Secure`, appropriate `SameSite`, narrow lifetime/scope).
- Middleware refreshes sessions but application/server/database checks authorize resources.
- Email verification, `adult_attested_at`, current `rules_version`, suspension, Fan activation, and active Venue membership gates are checked server-side according to the requested action.
- Sign-out clears the session and private query cache.

### 11.2 Authorization

- Enable/force RLS on all exposed tables.
- Deny by default; add narrow policies per actor/action.
- Use database functions for multi-row transitions and relationship checks.
- Use `auth.uid()` rather than accepting an actor ID from client input.
- Never trust hidden controls, route names, client roles, or form-supplied ownership.
- Test cross-user, blocked-user, removed-attendee, former-member, banned-member, suspended-content, incomplete/adult-attestation-missing, and anonymous cases.

### 11.3 CSRF and request abuse

- Cookie-authenticated mutations MUST be same-origin. Validate `Origin`/`Host` for Route Handler mutations and rely on current Next.js Server Action origin protections plus explicit allowed-origin configuration.
- Use POST/actions for mutations; GET endpoints are read-only.
- Add bounded per-user/database-backed cooldowns for friend requests, group applications/invite generation, event creation, and duplicate/report spam. Abuse controls MUST still leave an accessible path for a genuine immediate-danger report. The course MVP may use a PostgreSQL log/window function or hosting protection; Redis is a later distributed solution.
- Add request-body size limits and bounded strings/lists everywhere.
- Internal sync uses a separate high-entropy secret and cannot be triggered by a user session.

### 11.4 Secrets and integrations

| Variable | Exposure | Purpose |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Browser-safe | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Browser-safe | RLS-constrained public client key (use the current Supabase naming at implementation time) |
| `SUPABASE_SERVICE_ROLE_KEY` | Server-only | Sports sync/admin-only database access |
| `FOOTBALL_DATA_API_TOKEN` | Server-only | Provider authentication |
| `SPORTS_SYNC_SECRET` | Server-only + Supabase Vault copy | Authenticate cron call |
| `DISCOVERY_CURSOR_SECRET` | Server-only | Sign and verify filter-bound group/event pagination cursors |
| `ASSISTED_DISCOVERY_ENABLED` | Server-only | Default-off rollout gate for the assisted Home search |
| `ASSISTED_DISCOVERY_TOKEN_SECRET` | Server-only | Sign five-minute actor-bound resolved-intent continuations |
| `CLOUDFLARE_ACCOUNT_ID` | Server-only | Address the Workers AI REST endpoint |
| `CLOUDFLARE_WORKERS_AI_API_TOKEN` | Server-only | Invoke Workers AI from Vercel |
| `NEXT_PUBLIC_APP_URL` | Browser-safe | Canonical links and calendar URL |

`.env*` secrets MUST be ignored. CI/deploy secrets live in GitHub/Vercel/Supabase secret stores. Service-role/provider modules carry `server-only` protection and MUST NOT be exported from shared/client modules.

### 11.5 Privacy

- Exact home locations are separated, direct reads denied, outputs minimized, and reads audited.
- Private-location authorization is recalculated on every read and ends after leave, host removal, block, cancellation, suspension, or relevant group ban.
- Browser coordinates are request inputs, not retained location history.
- Public profiles omit email, exact address, private memberships, and attendance history.
- Invite tokens are high entropy, hashed at rest, expiring, revocable, and usage limited.
- Audit/log metadata excludes secrets and exact home data.
- Assisted-discovery logs and rate counters exclude sentences, extracted entity names, actor IDs, origins, model payloads, and event IDs. Cloudflare receives no private account context, and no AI Gateway/storage product is enabled.
- Reports are private from the reported user, and group admins cannot read platform reports merely because the target belongs to their group.
- Platform moderators do not automatically gain private-address access; exceptional access would require a separately audited policy not included in routine MVP moderation.

### 11.6 XSS, injection, and headers

- Render React text normally; no `dangerouslySetInnerHTML` for user content.
- Use parameterized Supabase/PostgreSQL calls; never construct SQL from user text.
- Validate redirect destinations against an internal allowlist.
- Configure a restrictive Content Security Policy compatible with Supabase/Vercel, HSTS in production, `frame-ancestors`/anti-clickjacking, `Referrer-Policy`, and `X-Content-Type-Options`.
- Calendar output requires its own text escaping to prevent malformed/injected properties.

### 11.7 Residual risks to document

- Email verification is not identity verification.
- Adult attestation is not age verification; a determined user may lie.
- Unverified venue ownership may be false; the label and reporting flow mitigate but do not prove ownership.
- A host or approved attendee may copy/share a home address outside Huddle; access revocation cannot erase knowledge already obtained.
- Determined users can misreport location or profile information.
- Database-backed abuse limits are less capable than a distributed edge/Redis system.
- Community moderation is limited and has no automated toxicity/media analysis.
- The course MVP is not staffed as a 24/7 emergency service and must say so clearly.
- External provider availability, terms, and data correctness remain dependencies.

---

## 12. Scalability and performance

### 12.1 Expected course scale

Design for tens to hundreds of active users, thousands of catalog matches, and a modest number of future events. Correct indexes and bounded responses matter even at this size; a distributed system does not.

### 12.2 Heavy-query risks and responses

| Risk | MVP response |
|---|---|
| Nearby future events | PostGIS GiST index, bounded radius/date, keyset cursor, narrow DTO |
| Home-event distance without leakage | security-definer discovery function filters internally and returns only a band |
| Audience/relationship checks | indexed membership/friend/follow pairs and reusable SQL helpers |
| Attendance count/race | indexed approved rows and atomic row-locking function; derive count |
| Personalized feed joins | bound date/radius, indexed follows, one discovery RPC, no per-card query |
| Group discovery gate | active-owner and non-empty-description facts; recalculate on relevant transitions, not every page render |
| Provider traffic | scheduled batch sync, local normalized cache, competition allowlist |
| Large lists | keyset pagination for discovery; bounded cursor/page lists elsewhere |
| RLS overhead | index all policy lookup columns; inspect `EXPLAIN (ANALYZE, BUFFERS)` with representative seed volumes |

### 12.3 Avoiding unnecessary loading

- Select DTO columns, never entire related rows.
- Server-render initial data; avoid browser waterfalls.
- Paginate events, groups, venues, matches, applications, members, and attendees.
- Do not fetch exact location until the user explicitly opens authorized details/calendar.
- Do not fetch full attendee identities for discovery cards.
- Cache stable catalog data selectively and invalidate by tag after sync.
- Use saved provider fixtures in CI rather than external network calls.

### 12.4 Free-tier baseline and upgrade triggers

At the planning date, Supabase documents Free-plan allowances including 500 MB database size, 50,000 monthly active users, 1 GB storage, 5 GB egress, 500,000 Edge Function invocations, and 2 million Realtime messages; inactive projects may pause. See [Supabase billing](https://supabase.com/docs/guides/platform/billing-on-supabase) and [pricing](https://supabase.com/pricing). Huddle does not depend on Realtime or Edge Functions for the MVP. Provider free limits are described in section 8.

Before launch, record current Vercel/Supabase/provider limits in the scale deliverable. Upgrade or redesign when any of these is true:

- sustained usage reaches 70% of a hard quota;
- database/index size or egress trajectory threatens the next billing period;
- p95 discovery latency exceeds the agreed target under representative load;
- provider sync cannot complete within its safe window/rate limit;
- connection/function limits cause observed failures;
- database-backed rate limiting becomes a material write/query burden;
- demo reliability is threatened by free-project pausing.

### 12.5 Growth path

1. Tune SQL/indexes and pay for appropriate Supabase/Vercel capacity.
2. Add Redis for shared rate limiting and hot computed-result cache only after measurement.
3. Move provider synchronization and notifications to a durable queue/worker.
4. Add read replicas for catalog/discovery reads if primary load warrants it.
5. Add dedicated search for fuzzy multi-entity search when PostgreSQL search is insufficient.
6. Split a service only when its load, deployment cadence, or ownership is genuinely independent.

---

## 13. Observability and operations

- Generate/propagate a request ID for actions/routes and a run ID for sync.
- Use structured server logs with event name, safe actor/resource IDs, duration, outcome, and error code.
- Vercel and Supabase logs are the MVP operational console; `provider_sync_runs`, moderation records, and security audit events provide durable product evidence.
- Track at minimum route/action error rate, discovery duration, sync age/outcome, sync request count, database/storage quota, and repeated authorization failures.
- Never put emails, access tokens, invite tokens, full descriptions, or home addresses in logs.
- Add Sentry/managed metrics later if the project needs alerts or longer retention; this is not required to prove the course MVP.

Operational runbooks MUST cover failed sync, leaked integration token rotation, bad migration rollback/forward fix, suspended venue/group, and a report requiring urgent removal.

---

## 14. Testing and acceptance

### 14.1 Database/pgTAP

MUST test:

- every CHECK/unique/FK invariant listed in section 6;
- RLS enabled and default denial on every exposed table;
- anonymous public projections and denied private rows;
- own-profile versus another-profile access and denial of completion without 18+/current rules acceptance;
- canonical friendship/self/duplicate rules and transactional block effects;
- group application, role, owner, invite, ban, and discovery-gate rules;
- private-person versus business-venue audience constraints, including crafted invalid inserts/updates;
- each valid audience's visible/invisible actors;
- 12-person home cap, absence of any guest-count path, and denial of direct private-location select;
- authorized/unauthorized audited private-location function before approval and after leave, removal, block, ban, cancellation, or suspension;
- material audience/place/address change rejection after first approval;
- event host/group-review permissions, including pgTAP proof that `reviewer_id <> created_by` and that promoting an ordinary-member author to admin still cannot authorize their own pending decision;
- invitation expiry/revocation/use limits;
- capacity with concurrent approval attempts;
- host removal/attendee leave/cancellation history retention;
- report confidentiality, group-admin denial, moderation action, and appeal policies;
- sync-service scope and ordinary-user denial.
- assisted-discovery Fan-only access, atomic per-Fan/global inference limits, friendship/group membership modes, facility filtering, stable top-three ranking, capacity behavior, and absence of protected-location fields.

### 14.2 Unit/Vitest

MUST test:

- all Zod input/environment/provider schemas;
- provider error classification and provider-to-normalized mapping;
- match/team identity and UTC conversion;
- host-type/audience eligibility and material-change rules;
- group discovery eligibility facts;
- request-context minimization;
- block, attendance removal, address-revocation, adult/completion, and no-guest rules;
- report-category, enforcement-ladder, and appeal transition schemas;
- cursor encode/decode/tamper rejection;
- error mapping;
- RFC 5545 escaping, line folding, UTC values, stable UID, and location omission/inclusion;
- stale-sync presentation logic.
- assisted intent/date/entity schemas, aliases and ambiguity, prompt-injection containment, Cloudflare error/malformed-output handling, and signed continuation expiry/actor binding.

Provider tests use committed, sanitized response fixtures and MUST NOT call a live provider in CI.

### 14.3 Component/React Testing Library

MUST test:

- signup/adult-attestation/rules/onboarding/event/group/venue form validation and server errors;
- keyboard/focus behavior for dialogs and menus;
- permission-aware actions without treating hidden controls as security;
- follow/friend/attendance pending/success/error/removed states;
- location denial, manual address autocomplete, selection invalidation, and retry;
- unverified venue, audience, capacity, and stale-data labels;
- private-address absence before approval and after authorization revocation;
- audience selector options appropriate to private person versus business venue;
- absence of plus-one controls and visibility of the 12-person home cap;
- block/report controls, report categories, emergency-service disclaimer, enforcement outcome, and appeal states;
- empty, loading, retry, and not-permitted states.
- assisted-discovery result, needs-location, clarification, unsupported, no-result, rate-limit, and provider-unavailable states.

### 14.4 End-to-end/Playwright

Seed deterministic users, relationships, groups, venues, matches, and events. Required flows:

1. Signup, email-verification test path, 18+ attestation, current-rules acceptance, onboarding, and team follow; omitted attestation is rejected.
2. Personalized fixture/event discovery with a session-only confirmed address and mocked browser geolocation.
3. Friend request/accept and friends-only event visibility; unrelated user denied.
4. Host/audience boundary: a private user cannot create public/team-followers even by crafted request; a venue cannot create group/friends/invite-only.
5. A described discoverable group with its active owner becomes searchable without member/rule/event quotas; unlisted, archived, blocked, and banned boundaries remain enforced.
6. Group application/approval, group ban/reapplication denial, and unlisted invite application.
7. Owner/admin-authored group event publishes atomically; an ordinary-member submission remains hidden until a different current owner/admin approves it. In a two-account E2E, promoting the creator to admin still denies their self-approval/self-rejection, while a different current owner/admin can decide it.
8. Home-event request: safe coarse distance context visible, exact address absent; address appears only after approval; material address/audience change then requires cancellation/new event.
9. Home event rejects capacity above 12 and offers no plus-one; each approved account consumes exactly one seat.
10. Venue-only onboarding creates an Unverified venue plus active owner membership without Fan activation; commercial mutations deny inactive/non-members; fixture planning inherits kickoff data; a public open-door event has no capacity, invitations, RSVP, queue, or residue; a reservation/team-followers event retains atomic seat and invitation behavior; the venue itself never attends.
11. Capacity race: simultaneous approvals result in only available seats and stable rejected/conflict response.
12. Host removes an approved attendee: history remains, event/address/calendar access is immediately denied.
13. User blocks a future home-event host/attendee: friendship/direct interaction and attendance/address access are atomically removed without revealing the blocker.
14. Unauthorized cross-user event/group/venue edits rejected even with crafted requests.
15. Correct `.ics`; private location included only for a currently authorized host/approved attendee and omitted after revocation.
16. Report a profile/event before and after the event; reported user and group admin cannot see reporter; moderator applies an action and affected user submits an appeal.
17. Provider outage/invalid response leaves cached fixtures browsable and marks stale/failure state.
18. The three approved assisted-discovery examples resolve through a deterministic fake interpreter and seeded database; CI never calls a live AI provider.

### 14.5 Manual acceptance

- Responsive phone and desktop review.
- Keyboard-only navigation and visible focus.
- Basic screen-reader naming/landmarks/forms.
- Israel-time date rendering around daylight-saving transitions.
- Real Vercel production smoke test with anonymous and two test accounts.
- Attribution/footer and unverified-venue labels visible.
- No exact address in HTML source, network payload, client cache, logs, or unauthorized `.ics`.
- Private-event pages clearly state registered-users-only, no plus-ones, host identity, capacity, rules, and address-sharing warning.
- Report flow remains usable, hides reporter identity, distinguishes immediate danger, and clearly says Huddle is not an emergency service.
- Community rules explicitly cover sports-rivalry harassment, threats/fights, doxxing, fraud, unapproved guests, and hidden commercial terms.

### 14.6 CI gates

GitHub Actions MUST run on pull requests:

1. dependency install from lockfile;
2. Prettier check;
3. ESLint;
4. TypeScript typecheck;
5. Vitest unit/component suites with coverage report;
6. local Supabase startup/reset and migrations/seed;
7. pgTAP database/RLS tests;
8. database type generation and clean-diff drift check;
9. Next.js production build;
10. Playwright against the built app/local Supabase.

No live sports network call occurs in CI. A failed required gate blocks merge/deployment.

---

## 15. Local development, migration, and deployment contract

### 15.1 Prerequisites

- supported Node.js LTS selected during scaffolding;
- npm (or one deliberately selected package manager) and committed lockfile;
- Supabase CLI;
- Docker-compatible runtime for local Supabase;
- Git.

### 15.2 Planned local command contract

The final README MUST make these workflows one-command or clearly sequenced:

```text
npm install
supabase start
supabase db reset
npm run dev
```

Quality commands MUST include `format:check`, `lint`, `typecheck`, `test`, `test:db`, `test:e2e`, and `build` (exact script names finalized at scaffolding). Local seed data MUST allow the core flows without external provider credentials. A separate explicit sync command MAY exercise the real API when a developer has a token.

Generated DB types are produced from local schema into `types/database.generated.ts`; CI regenerates and fails on drift. See the [Supabase local workflow](https://supabase.com/docs/guides/local-development/cli-workflows) and [type generation](https://supabase.com/docs/guides/api/rest/generating-types).

### 15.3 Migration rules

- Schema changes are forward SQL migrations under `supabase/migrations`.
- Seed is deterministic, non-secret, and safe to reset.
- Every security-sensitive migration ships with pgTAP allowed/denied tests.
- Test `supabase db reset` before merge.
- Production migrations are reviewed and applied before the app version that requires them.
- Destructive changes need backup/rollback or a staged expand-migrate-contract plan.

### 15.4 Environments

Use separate local, preview/staging, and production configuration. Preview deployments MUST NOT mutate the production database by default. Vercel hosts Next.js; Supabase hosts Auth/PostgreSQL/PostGIS. Environment URLs, Auth redirects, CORS/origin allowlists, secrets, and cron target must match the environment.

### 15.5 Production acceptance

- Public Vercel URL works on a signed-out browser.
- Supabase migrations match the committed schema.
- Auth email verification and redirect work on production domain.
- Cron reaches only the protected sync route and a successful run is visible.
- Production has provider attribution and no service secret in client bundles/network responses.
- GitHub repository includes setup/env documentation without secret values.
- Smoke tests cover anonymous browse, sign-in, discovery, event request, approval, and calendar.

---

## 16. Requirements traceability matrix

The design-to-requirement map below remains normative. Actual implementation,
test, presentation, and pending hosted evidence is maintained in the
[delivery traceability record](./submission/TRACEABILITY.md); a pending cell is never
treated as implemented merely because this specification describes it.

| Official requirement | Design location | Implementation evidence | Test evidence | Presentation proof |
|---|---|---|---|---|
| Clear problem, users, customer, business goals | Architecture §§1–3 | Product pages and venue loop | E2E core flows | 1-minute problem/persona/value opening |
| Product capabilities and main processes | Spec §§1–4 | Auth, follow, discover, group, event, attendance | E2E 1–9 | Live core-loop demo |
| System components/data flow | Architecture §4; Spec §5 | Deployed Next/Supabase integration | Build/integration tests | Architecture diagram |
| Database/entities | Spec §6 | SQL migrations/generated types | pgTAP and reset | ER diagram/key tables |
| Pages/components | Spec §4 | App routes/components | RTL/Playwright | Show discovery/event/admin UI |
| API routes/server actions | Spec §7 | Route Handlers/actions/functions | Unit/integration/E2E | Trace one request end to end |
| Permissions/users | Spec §§2–3, 6.11, 11 | RLS/functions | Denial and cross-user tests | Private-address example |
| External libraries/services and rationale | Spec §§5, 8 | Lockfile/adapters/config | Provider fixture tests | Decision table |
| Folder structure | Spec §5.4 | Repository tree | Dependency/lint checks | Brief code tour |
| CRUD and business logic | Spec §§2, 7 | Domain services/actions/RPCs | State/capacity flows | Join/approve/cancel demo |
| State management | Spec §9 | Server/Query/local/URL state | Component/E2E states | Explain ownership |
| Error and input handling | Spec §10 | Zod/result/error boundaries | Invalid and edge cases | Show one safe failure |
| UX planning | Spec §4 | Accessible responsive UI | RTL/manual accessibility | User-journey narration |
| Next.js + TypeScript | Spec §5 | App and strict config | Typecheck/build | Repository/code tour |
| Supabase DB/Auth | Spec §§5–6, 11 | Auth, migrations, RLS, PostGIS | reset/pgTAP | Auth + DB explanation |
| Vercel deployment/public URL | Spec §15 | Production deployment | Smoke test | Open live URL |
| Test specification and code | Spec §14 | Test suites | CI results | Test pyramid + critical tests |
| Basic scale | Spec §12 | indexes/cursors/RPC/cache | query plans/load spot checks | Bottleneck/growth slide |
| Basic security | Spec §11 | RLS, secrets, private table, headers | authorization matrix | Threat/control/residual-risk slide |
| Local instructions/env vars | Spec §15 and final README | scripts/example env | fresh-clone rehearsal | Mention reproducibility |
| GitHub link | Submission artifact | public/private course repo as required | green main CI | Open repository |
| 10–15 minute presentation | Spec §17 | completed deck/demo data | rehearsal | Final presentation |

The final submission may split product, test, scale, and security material into separate requested deliverables, but those documents MUST remain consistent with this source specification.

---

## 17. Presentation run-of-show (10–15 minutes)

1. **Problem, users, value (1.5 min):** lonely/scattered fandom, fan and venue use cases, future venue customer.
2. **Core demo (4 min):** follow team → discover fixture event → request/approve → protected details → calendar; briefly show group/venue.
3. **Architecture (2 min):** Next.js modular monolith, Supabase Auth/PostgreSQL/RLS/PostGIS, provider sync, Vercel.
4. **Database and permissions (2 min):** events/audiences, relationships, separate home location, atomic capacity.
5. **Tests, security, scale (2.5 min):** one pgTAP denial, one E2E flow, CI, indexes/pagination/cache, residual risks.
6. **Trade-offs and next steps (1 min):** why assisted discovery uses only bounded AI intent extraction, and why there is no Redis, Socket.IO, Stripe, agent, RAG, or generative recommendation layer; venue subscription and NBA adapter later.

The presenters MUST be able to explain each selected dependency, trace one browser action through server/database/RLS, and distinguish planned future features from the working submission.

---

## 18. Definition of done for the eventual application

The MVP is done only when:

- all MUST rules in this specification are implemented or consciously revised in the document;
- migrations and seed reproduce locally with `supabase db reset`;
- critical public/private paths are protected by RLS and tested as allowed and denied;
- the 17 Playwright flows pass against deterministic data;
- provider outages do not break cached browsing;
- no unauthorized output exposes an exact home address;
- adult/rules completion, host/audience restrictions, the 12-person home cap, no-plus-one rule, block/removal revocation, reporting confidentiality, and appeals are enforced and tested;
- CI is green and DB types have no drift;
- the Vercel production URL and Supabase production schema work together;
- setup, environment, product, tests, security, and scale documentation matches reality;
- both team members can explain the implementation and complete the presentation within 10–15 minutes.

---

## 19. Decision register

| Decision | Chosen answer | Consequence |
|---|---|---|
| Pilot | Israel, English, Israel display time | Country-bounded address search and consistent time UX |
| Sports | Football first | One provider adapter; NBA stays future-ready |
| Provider | football-data.org v4 | Six-hour sync and local cache under free-rate constraints |
| Auth | Supabase email/password SSR | No OAuth and no application password storage |
| Community eligibility | 18+ attestation and current rules acceptance | Avoid child-safety scope; do not claim identity/age verification |
| Backend | Next.js only | One deployable modular monolith |
| DB access | Supabase SQL/RPC, no Prisma | RLS/PostGIS/functions remain explicit |
| Location | Session-only browser coordinate or confirmed Photon/OpenStreetMap address; confirmed coordinates on venues/events; protected exact home coordinates | No city catalog or profile location, no paid geocoder or route planning, and protected homes never enter public discovery maps |
| Social | Direct mutual friends plus moderated groups | No friends-of-friends |
| Group creation | Active-owner plus description discovery gate | Avoid platform bottlenecks and fake activity quotas while keeping empty groups out of search |
| Audience boundary | Private people: group/friends/invite-only; business venues: public/team-followers; eligible signed-in Fans may preview public-place events of active discoverable groups | Anonymous visitors never discover private-person events, and group attendance/home privacy still require membership |
| Home safety | Restricted audience, approval, protected exact location, max 12, no plus-ones | Trust relationship alone does not reveal address; one account per seat |
| Blocking | Immediate private control with relationship/attendance/address revocation | User protection does not wait for moderation |
| Moderation | Confidential reports, proportional enforcement, and appeals | Group admins and platform moderators have distinct authority |
| Reputation | Factual context, no score | Avoid gameable cold-start metric |
| Venue MVP | Self-serve activated by a commonly eligible operator, membership-authorized, venue-as-non-attendee, and visibly Unverified | Demonstrates loop without billing/verification claim or invented Fan identity |
| Calendar | RFC 5545 download | Broad compatibility without OAuth |
| Realtime | None | No Socket.IO/Redis dependency |
| State | Server + URL + narrow TanStack Query + local React | No unnecessary global store |
| Scale | Indexed modular monolith | Optimize and split only from evidence |
| AI boundary | Cloudflare extracts a bounded intent; Huddle resolves, authorizes, filters, and ranks | No private account context, generative answer, agent, RAG, or model-written event data |

There are no unresolved product decisions required before scaffolding. Exact package versions, provider competition allowlist, and production quota snapshot are implementation-time configuration choices and must be recorded when selected.

---

## 20. References

- [Huddle README](../README.md)
- [Course roadmap](../course-roadmap/ROADMAP.md)
- [Official project instructions](<../course-roadmap/project instructions.pdf>)
- [Next.js App Router](https://nextjs.org/docs/app)
- [Next.js Route Handlers](https://nextjs.org/docs/app/getting-started/route-handlers)
- [Next.js backend-for-frontend guide](https://nextjs.org/docs/app/guides/backend-for-frontend)
- [Supabase Auth SSR](https://supabase.com/docs/guides/auth/server-side)
- [Supabase Row Level Security](https://supabase.com/docs/guides/database/postgres/row-level-security)
- [Supabase PostGIS](https://supabase.com/docs/guides/database/extensions/postgis)
- [Supabase Cron](https://supabase.com/docs/guides/cron)
- [Supabase scheduled functions](https://supabase.com/docs/guides/functions/schedule-functions)
- [Supabase local development](https://supabase.com/docs/guides/local-development/cli-workflows)
- [Supabase database testing](https://supabase.com/docs/guides/local-development/testing/overview)
- [Supabase type generation](https://supabase.com/docs/guides/api/rest/generating-types)
- [football-data.org quickstart](https://www.football-data.org/documentation/quickstart)
- [football-data.org pricing](https://www.football-data.org/pricing)
- [football-data.org coverage](https://www.football-data.org/coverage)
- [football-data.org policies](https://docs.football-data.org/general/v4/policies.html)
- [Footballdata.io](https://footballdata.io/)
- [BALLDONTLIE API](https://docs.balldontlie.io/)
- [OWASP Authorization Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Authorization_Cheat_Sheet.html)
- [OWASP Business Logic Security Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Business_Logic_Security_Cheat_Sheet.html)
- [eSafety Safety by Design: user empowerment](https://www.esafety.gov.au/industry/safety-by-design/foundations/empowering-users-to-stay-safe-online)
- [Meetup group and event safety policies](https://help.meetup.com/hc/en-us/articles/360002897712-Meetup-groups-and-events-policies)
- [Meetup reporting before and after events](https://help.meetup.com/hc/en-us/articles/39257846459789-Reporting-a-Meetup-group-or-event)
- [Meetup removal and banning](https://help.meetup.com/hc/en-us/articles/39256750778637-Remove-or-ban-a-member)
- [Meetup guidance on sensitive application/event questions](https://help.meetup.com/hc/en-us/articles/360022471332-Profile-and-event-questions)
- [Discord reporting and reporter privacy](https://discord.com/safety/360044103651-reporting-abusive-behavior-to-discord)
- [Discord enforcement actions](https://discord.com/safety/360044159011-What-actions-we-take)
- [RFC 5545: iCalendar](https://datatracker.ietf.org/doc/html/rfc5545)

External plans, quotas, APIs, and framework guidance are time-sensitive. Reverify them immediately before implementation or account setup; the product and privacy decisions remain the controlling design unless explicitly revised.
