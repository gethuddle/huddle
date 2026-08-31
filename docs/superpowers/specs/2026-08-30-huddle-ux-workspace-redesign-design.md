# Huddle UX and workspace redesign

**Status:** Approved design direction
**Date:** 30 August 2026
**Inputs:** production UX audit F01–F40, the approved Huddle product-design sheet, the implementation and architecture specifications, and the user-approved Fan/Venue decisions in this task

## 1. Outcome

Huddle will become one coherent, task-led product instead of a collection of administration screens. The redesign must close every finding in `docs/UX-AUDIT-PRODUCTION-2026-08-29.md`, preserve the established Huddle identity, and make the submitted product understandable to a first-time fan or venue operator without knowledge of its database model.

The product has two separately authorized workspaces behind one Supabase login:

- **Fan** — discover and attend events, follow interests, use friendships and groups, and host private/group events.
- **Venue** — operate one business venue, maintain reusable venue information, plan fixture events, and manage attendance.

The workspace switcher changes presentation only. Every read and mutation remains independently authorized in PostgreSQL.

## 2. Approved contract changes

These decisions deliberately supersede the older assumption that every completed personal profile may create a venue. The normative implementation specification, architecture, README, build checklist, generated types, migrations, RLS, functions, and tests must be reconciled before the runtime change is considered complete.

1. A generic Fan profile cannot create or manage a venue. Commercial operations require an active Venue workspace membership.
2. A venue-only operator may complete common safety onboarding and manage a venue without first publishing a Fan identity.
3. A human must enable a completed Fan profile before acting as an attendee, friend, group member, or private host. A venue is never an attendee.
4. An event created by a current group owner/admin may publish atomically without a meaningless self-review. An ordinary member submission still requires an owner/admin decision.
5. Venue activation is self-serve for the course demonstration, immediately usable, and visibly **Unverified**. It includes a truthful-representation attestation and does not grant platform verification.

No other locked safety or privacy rule changes. In particular, private-location isolation, capacity locking, registered-attendee-only rules, blocks, confidential reports, suspension enforcement, and retained database history remain intact.

## 3. Design principles

### 3.1 Simplicity before surface count

- A new page is allowed only for a distinct, repeatable job that benefits from its own URL.
- Invitations, approvals, applications, filters, and confirmations use an inline control, dialog, or drawer when they do not need a durable destination.
- The same complete collection never appears on two top-level pages.
- One primary action leads each task area. Secondary actions are outline or text actions.
- A status is one plain-language phrase plus, when applicable, one next action.
- Internal lifecycle, provider, milestone, database, and synchronization language never appears in product copy.

### 3.2 Stable mental model

- **Home:** What is next and what needs me?
- **Explore:** What new thing can I join or follow?
- **My Huddle:** What do I already own, belong to, attend, or save?
- **People:** Who can I find or manage a relationship with?
- **Account:** Identity, preferences, safety, and workspace switching.

### 3.3 Airbnb-inspired, recognizably Huddle

The interface adopts Airbnb's product qualities—clear hierarchy, generous whitespace, search-led discovery, calm card composition, direct language, and obvious task completion—without copying its brand.

The approved Huddle product sheet is the visual reference:

- Ink `#0B1210`, Raised `#151D18`, Court Green `#2CE07B`, Forest `#0F7A42`, Linen `#F2EEE4`, Sand `#C9B48F`, Muted `#8A948E`, Border `#232B27`.
- Familjen Grotesk with no more than three visible typographic levels per screen.
- The repository Huddle aperture mark and lockups remain unchanged.
- Court Green is restrained to the primary action, current selection, or one live/confirmed status in a component group.
- Cards use one hairline border, 22px outer radii, no nested-card stacks, and heavy shadow only for dialogs.
- Important controls have at least a 44 by 44 CSS-pixel hit area.
- Small or muted text from the mock must be enlarged or strengthened wherever contrast or readability is insufficient.

## 4. Information architecture

### 4.1 Fan workspace

Desktop and mobile use the same five primary destinations:

1. Home
2. Explore
3. My Huddle
4. People
5. Account

Desktop uses a compact header. Mobile uses a persistent bottom navigation. The current destination is visually selected and exposes `aria-current="page"`.

Secondary actions live in context:

- Plan a huddle: My Huddle and eligible fixture/event surfaces.
- Create a group: My Huddle → Groups.
- Enable or switch to a Venue workspace: Account.
- Interests and profile editing: Account.
- Safety center: Account and contextual Block/Report actions.

There is no primary Fixtures, Groups, Attendance, Friends, Create venue, Create group, Host event, Profile, or Safety navigation item.

### 4.2 Venue workspace

Each venue is a workspace. A user managing multiple venues sees each one separately in the switcher. The primary destinations are:

1. Today
2. Calendar
3. Events
4. Venue
5. Account

Events is the durable status-filtered directory; Calendar remains the chronological
view, and event detail provides management. The full Huddle wordmark remains fixed
at the left of the shell, while the active Venue/workspace switcher stays at the
right just as Fan identity does. **Plan events** is a contextual page action on
Today and Events, not a global header control.

Venue chrome contains no friendships, private groups, Fan recommendations, or private-hosting tools.

### 4.3 Public object pages

Events, groups, fixtures, venues, and profiles keep stable public or authorization-gated URLs. Each page provides:

- one overview before management controls;
- a role-aware status and primary action;
- links to related authorized objects;
- contextual management only for authorized users;
- history collapsed and secondary;
- privacy-preserving recovery when the requested object cannot be shown.

## 5. Fan experience

### 5.1 Authentication and first run

1. Signup creates a Supabase Auth identity only.
2. Email verification returns through the callback with a real session.
3. If no workspace is ready, the user chooses **Use Huddle as a fan** or **Set up a venue account**.
4. Fan onboarding asks only for display name, handle, Israel city, optional bio, adult attestation, and the current rules acceptance.
5. Venue onboarding asks for common eligibility plus venue information and the business-representation attestation. It does not publish a Fan profile.
6. A user may enable the other workspace later from Account.

Returning users land in their last valid workspace. If that workspace has become unauthorized, Huddle selects another valid workspace or returns to workspace setup.

### 5.2 Home

Home contains only:

- the next attending or hosted event;
- a bounded **Needs your attention** queue;
- at most one concise discovery section based on followed teams, city, and availability;
- a meaningful first-run empty state.

The attention queue is derived from current actionable records, not a permanent notification ledger. It may contain event invitations, attendance requests, friend requests, group applications, member event submissions, and workspace setup tasks. Completing an action removes it immediately.

Home does not duplicate the full My Huddle event or group collections.

### 5.3 Explore

Explore is one search-led surface with:

- Where: city fallback or explicitly shared browser location;
- When: date/range shortcuts;
- Match: searchable team or competition;
- one compact Where/When/Match summary that opens a focused editor for city, distance,
  date range, competition, and team;
- list-first results and an optional map view where useful.

Only working controls are styled as filters. Audience labels such as public Venue,
group, or friends are result properties rather than decorative filter-like pills.

Event discovery excludes events when the viewer:

- owns or hosts them, including through a Venue workspace;
- is already attending;
- has a pending attendance request;
- declined, left, or was removed;
- has archived the relationship; or
- received an invite-only invitation.

Invite-only events never appear in Explore. Invitations appear on Home and My Huddle and remain accessible by their authorized direct link.

### 5.4 My Huddle

My Huddle is the stable library for acquired objects. It has three durable collections:

- **Events:** Upcoming/Hosting/Pending, with History as a collapsed filter.
- **Groups:** Owner/Admin/Member/Applying.
- **Saved:** followed teams, competitions, and venues.

Invitations and review work are not additional tabs; they are attention items. Venue ownership is recovered through the prominent workspace switcher rather than mixed into Fan social collections.

Ordinary users do not see removed, declined, expired, or rejected relationship residue. Completed events may appear in personal History only when the user actually attended or hosted them. Hosts may access a compact authorized audit history from event management.

### 5.5 People

People combines discovery and relationship management:

- search by display name or handle;
- suggested people from shared city, teams, visibility-authorized active groups, and recent authorized context, always filtered for blocks and profile visibility;
- accepted friends;
- incoming and sent requests;
- context-aware Invite/Add actions.

People search never requires users to know an exact handle. Event and group invitation pickers reuse the same search component without leaving the current object.

### 5.6 Fan event creation

Fan event creation stays on one route and presents three real, persisted phases:

1. **Match** — searchable combobox, followed items first, date/team filtering.
2. **Place and audience** — home/public place, human-readable location, group/friends/invite-only audience, capacity and necessary safety choices.
3. **Review and publish** — a check-answers view with Edit links and a single publish/submit action.

Back, forward, refresh, session renewal, and return from an eligibility action preserve the draft. Leaving with unsaved local changes receives a warning. Successful creation redirects to the saved event with explicit confirmation.

If Friends is unavailable, Huddle offers **Find your first friend** rather than exposing an unexplained disabled control.

### 5.7 Event detail and management

The page adapts to the viewer:

- Host: **You're hosting** → Manage event.
- Venue operator: **Published/Draft** → Manage event.
- Invited: Accept or Decline.
- Pending: Waiting for host.
- Attending: You're going → details/leave.
- Eligible: Join or Ask to join.

Invite friends opens a searchable picker over friends, eligible group members, recent contacts, and direct search. Eligibility is explained inline. Removal and cancellation use specific confirmation dialogs. A successful mutation returns and renders the new effective state atomically.

### 5.8 Groups

Creating a group is one concise form. The next screen is the saved group, not a generic management console.

The group page shows:

- overview and upcoming approved events;
- role-aware primary action;
- a share action that matches the group's visibility rules;
- a short **Appear in search after** task list when forming;
- pending applications or member submissions only when work exists.

There are no six equal management tabs and no repeated readiness wall. One compact settings page contains members, rules, and visibility. Empty or unsupported administration sections are omitted.

Owner/admin-authored events publish atomically. Member-authored events enter pending review and appear in the admins' attention queue.

## 6. Venue experience

### 6.1 Venue activation

**Set up a venue account** collects:

- venue name;
- public address search and confirmed pin;
- public description;
- named viewing areas and capacities, beginning with Main screen;
- facilities/accessibility;
- normal joining policy;
- standard house information;
- truthful-representation attestation and current rules acceptance.

Creation produces an Unverified venue, an owner membership, and its workspace. It redirects to Today with any incomplete optional setup expressed as one actionable task.

### 6.2 Today

Today answers:

- What is next?
- How many people are confirmed or waiting?
- What requires action?
- What else is happening today?

It contains one next-event summary, a bounded attention queue, and a chronological remainder-of-day list. It does not duplicate the complete calendar.

### 6.3 Calendar

Calendar provides Month and Agenda views over Draft, Published, Full, Cancelled, and Completed events. Filters modify one surface; they are not separate pages. Selecting an event opens its detail/management page.

### 6.4 Plan events

Venue planning has two task phases:

1. Select one or more synchronized future fixtures and a viewing area for each.
2. Review inherited defaults, make only event-specific overrides, then publish or save the batch as drafts.

The system detects overlapping fixtures in the same viewing area. The create operation is transactional so a failed item cannot leave an unexplained partial batch.

### 6.5 Venue profile and defaults

Venue holds the information reused by events:

- public address and confirmed point;
- public description and the existing Huddle visual treatment;
- named viewing areas and capacity;
- facilities/accessibility;
- house information;
- default joining policy;
- visible verification state.

Events store authorization-critical and historical snapshots such as capacity, timing, selected audience, and event-specific overrides. Changing a venue default does not silently rewrite an already published event.

## 7. Location and geocoding

No ordinary form exposes latitude or longitude.

### 7.1 Public venue and public-place locations

- A provider-neutral server adapter performs Israel-biased address search.
- The initial provider is a cached, rate-limited Nominatim-compatible OpenStreetMap service for submit-triggered public-address lookup.
- Client-side autocomplete must not call the public Nominatim endpoint.
- Results show a human-readable address and pin confirmation.
- Raw provider identity is not stored as product identity.
- The UI displays required OpenStreetMap attribution.

This separation is enforced by Huddle-owned product paths: the public request accepts only `venue` or `public_place`, the private-home control has no public-search call, and both route and database reject an explicit `home` marker. Free-text content cannot prove semantic intent. A malicious user can deliberately paste personal information into a public-address field, and Huddle does not claim that a placebo client token or keyword detector can classify it reliably. A stronger semantic guarantee requires an authoritative public-place catalog or approved self-hosted classifier/geocoder.

### 7.2 Private home locations

Huddle's private-home product path never sends an exact address to the public Nominatim service. The user enters the protected address and sets the point using explicit browser location, a pointer, or keyboard arrow keys on the map. The private map accepts only one of the 13 reviewed active pilot-city slugs and resolves its third-party tile camera internally from that public catalog; callers cannot provide camera coordinates, and unsupported or inactive identifiers fail closed. An exact browser/manual/keyboard point must remain within the selected city's conservative radius, moves only a local marker, and never changes the tile viewport. The selected city is also a hard protected-state boundary: changing from a valid city to another valid or unsupported slug clears the private address and point, resets the picker, invalidates delayed map generations and browser-geolocation callbacks, and emits an empty safe selection so downstream drafts cannot retain old-city data. Within one city, each browser-location request supersedes the previous generation. Both protected values are submitted only to controlled Huddle functions and remain in the protected private-location domain. The ordinary event row, safe DTOs, logs, drafts, URLs, and public clients never contain the exact address or coordinates.

If a future self-hosted private geocoder is approved, it can implement the same provider interface without changing the product flow.

## 8. Data and authorization design

### 8.1 Human and Fan state

`profiles` remains the one-to-one human trust record linked to Supabase Auth. Add an explicit Fan-workspace activation field. Existing completed profiles are backfilled as enabled Fans. Public profile projections and Fan mutations require that flag plus the existing completed profile fields.

Venue-only onboarding may populate common adult/rules eligibility while leaving Fan identity fields incomplete and non-public. Venue mutations require common eligibility, not an invented Fan identity.

### 8.2 Venue membership

Add a forced-RLS `venue_memberships` table with at least:

- `venue_id`;
- `user_id`;
- `role` (`owner` or `admin`);
- active/revoked state and timestamps;
- immutable ownership/audit constraints.

Every existing `venues.owner_id` is backfilled as one active owner membership. `owner_id` may remain the canonical primary owner during the migration, but all workspace authorization must require an active membership and preserve exactly one owner invariant.

### 8.3 Viewing areas and defaults

Add `venue_spaces` with venue, name, capacity, active state, and stable ordering. Existing venues receive one Main screen using stated capacity. A screen count greater than one is not converted into fabricated areas; the operator receives a setup task.

Add or normalize venue-level house information, facilities, and default joining policy. Events gain an optional `venue_space_id` and retain the effective event capacity as a snapshot.

### 8.4 Draft persistence

Fan drafts use an owner-only, forced-RLS draft domain. Ordinary draft payloads and protected home location data are stored separately so exact home fields never enter a generic JSON payload or direct client-readable table. Controlled functions save, read, finalize, and discard drafts.

Venue batch planning can produce complete event draft rows from venue defaults and selected fixtures through one transactional function.

### 8.5 Derived attention and current state

Attention is a bounded authorization-filtered projection derived from current pending rows; it is not a second source of truth. It includes only actionable items and deterministic links/actions.

Primary lists use effective current state. Retained invitation, attendance, cancellation, and membership rows do not automatically qualify an object for Home, Explore, My Huddle, or People.

### 8.6 Server authorization

Controlled functions and RLS must enforce:

- Fan versus Venue host/audience rules;
- active Venue membership for every commercial mutation;
- Fan activation for attendance and private social mutations;
- group admin/member publication behavior;
- block, suspension, ban, and profile eligibility;
- capacity and duplicate-attendance serialization;
- private-location access and revocation;
- workspace-safe bounded projections;
- no reliance on the remembered workspace cookie.

## 9. State, errors, and recovery

- Loading uses stable skeleton geometry rather than replacing the page hierarchy.
- Empty states say what the area is for and offer one valid next action.
- Errors explain the failed task, whether work was saved, and a safe retry or recovery action.
- A missing city catalog, fixture catalog, or geocoder cannot render an empty required select; the form stops with a controlled availability state.
- Privacy-sensitive missing/unauthorized pages do not reveal whether an object exists, but actions adapt safely to authentication and referral context.
- Auth verification establishes a session before routing. Incomplete Fan or Venue onboarding resumes at the correct workspace step.
- Successful create/update operations redirect or refresh to the authoritative saved projection.
- Query caches are invalidated or updated atomically after attendance, friendship, invitation, application, and publication mutations.

## 10. Fixture trust

The protected synchronization continues to write the local provider-neutral sports catalog. Normal page requests never call the provider.

- Import the full future horizon available for the active season rather than a short accidental window.
- Display **Updated at** separately from **Coverage through**.
- A provider failure preserves the last good catalog and reports staleness without claiming completeness.
- Search and event creation use the same local catalog and searchable fixture component.
- Pagination remains sequential, deterministic, and accessible; it must not expose unexplained jumps such as `1, 2, 5` without an ellipsis.

## 11. Responsive and accessible interaction

- Mobile uses exactly five stable Fan destinations and five Venue destinations.
- No horizontal overflow at 375px or supported intermediate widths.
- Targets are at least 44px for primary actions and comfortably spaced elsewhere.
- Every current route is visually indicated and uses `aria-current` where appropriate.
- Dialogs trap focus, close with Escape/cancel, and restore focus.
- Searchable comboboxes expose labels, selected state, empty results, and keyboard operation.
- Status is never encoded by color alone.
- Maps and images have accessible alternatives; core tasks do not require map interaction.
- Reduced motion, readable contrast, zoom/reflow, and screen-reader landmarks are part of acceptance.

## 12. Audit crosswalk

| Finding | Designed resolution | Required evidence |
|---|---|---|
| F01 | Venue workspace switcher, Today, Calendar, Events, and public venue link | Existing/new venue recoverable in two clicks; ownership RLS tests |
| F02 | Explore excludes owned/hosted events | Discovery RPC pgTAP plus two-workspace E2E |
| F03 | Invite-only routed through attention/My Huddle/direct links | Anonymous and signed-in discovery matrix |
| F04 | Server-persisted protected drafts | Refresh/back/session-renewal E2E |
| F05 | One forming-group task list and truthful Share action | New discoverable-group E2E |
| F06 | Admin-authored atomic publication; member review retained | Role matrix pgTAP and E2E |
| F07 | CTA becomes a working Share/invite action in context | Link/picker component test and E2E |
| F08 | Inline searchable people picker | No-context-switch invitation E2E |
| F09 | Effective state in primary UI; authorized history secondary | Host/removed-user two-account E2E |
| F10 | Address search/pin; no coordinate fields | Form tests, DOM assertion, private-location leakage checks |
| F11 | Home is next/action; My Huddle is the library | Content-boundary component/E2E assertions |
| F12 | Derived attention queue with direct actions/counts | Cross-account request/application/invite E2E |
| F13 | One-route, three-phase persisted Fan event flow | Mobile/desktop step and recovery E2E |
| F14 | Searchable fixture combobox | Keyboard/component tests with more than 15 fixtures |
| F15 | Full available horizon plus separate freshness/coverage | Sync fixture, database assertion, production smoke copy |
| F16 | Selected navigation and `aria-current` | Component and accessibility tests |
| F17 | Five-item mobile Fan navigation | 375px E2E/screenshot and target inventory |
| F18 | 44px product target convention | Component CSS and browser measurement tests |
| F19 | Contextual Find first friend recovery | Empty social-graph E2E |
| F20 | Unified People search, suggestions, and relationships | Search/recommendation data and E2E coverage |
| F21 | Removed/left/declined excluded from discovery | Transition matrix pgTAP and two-account E2E |
| F22 | Applying groups appear in My Huddle | Pending application projection tests |
| F23 | Cross-account work enters attention immediately | Two-session request/application tests |
| F24 | Mutation returns authoritative state and invalidates cache | Remove-attendee component/E2E without reload |
| F25 | Specific friendship-removal confirmation | Dialog keyboard and consequence tests |
| F26 | Plain-language group activation tasks | Copy inventory and group E2E |
| F27 | Setup status only on group overview | Route/content assertions |
| F28 | Only actionable counts/tasks are prominent | Group owner empty/non-empty state tests |
| F29 | Overview/direct actions replace navigation tabs | Mobile navigation and history E2E |
| F30 | Remove course/database/provider implementation copy | Forbidden-copy repository/DOM check |
| F31 | Visibility-specific post-create promise and redirect | Group creation E2E |
| F32 | Role-aware event status and primary action | Host/invitee/pending/attendee matrix tests |
| F33 | Canonical one-status vocabulary | Status mapping unit tests and copy check |
| F34 | Authorized related objects are links | Event/group/venue/profile navigation E2E |
| F35 | Profile editing separated from eligibility/rules | Existing-user edit E2E; version-change rules test |
| F36 | Searchable, sectioned interests with Followed filter | Component and personalization E2E |
| F37 | Safe non-disclosure plus useful recovery | Signed-out/private/moderation route tests |
| F38 | Stable Safety center label and contextual actions | Navigation/copy tests |
| F39 | Grammar, casing, badge, and density polish | Copy/unit checks plus visual audit |
| F40 | Separate authorized Venue workspace and business flows | Migration/RLS matrix plus venue onboarding/planner E2E |

## 13. Implementation boundaries

### Included

- source-of-truth reconciliation;
- schema migrations, RLS, controlled functions, generated types, and backfills;
- Fan and Venue onboarding/workspace authorization;
- the approved responsive design system and navigation;
- Home, Explore, My Huddle, People, group, event, fixture, profile, interests, and Safety simplification;
- Venue Today, Calendar/Agenda, planner, profile/defaults, and event management;
- public-address geocoding and private pin flow;
- fixture horizon/trust and pagination correction;
- unit, component, pgTAP, E2E, accessibility, and production-smoke coverage;
- repeated two-account UX audits until every F01–F40 criterion is closed.

### Excluded

- paid venue verification or identity verification;
- a multi-brand holding-company hierarchy;
- payments, reservations, POS, messaging, or advanced venue analytics;
- NBA/live scores or another sports provider;
- user-uploaded venue or event photography; approved brand placeholders remain until media storage is separately scoped;
- hard deletion of protected audit/history data;
- a self-hosted private geocoder unless separately approved and operationally supported.

## 14. Completion gate

The redesign is complete only when:

1. the authoritative product documents agree with the approved contract;
2. every F01–F40 crosswalk row has current automated and/or browser evidence;
3. all applicable unit, component, pgTAP, E2E, lint, format, type, build, security, migration, and diff-hygiene gates pass from a clean tree;
4. the full two-account Fan/Venue journey is re-audited at desktop and mobile widths;
5. no finding is closed merely through copy when the underlying flow or authorization remains broken;
6. a first-time user can explain Home, Explore, My Huddle, Fan, and Venue after one visit;
7. no commit, push, pull request, hosted migration, or deployment occurs without separate explicit authorization.

## 15. Task 15 approved correction addendum — 2026-08-30

The final audit found that the implemented shell had adopted Huddle's colors and assets without
faithfully carrying the approved product sheet's screen composition into the core journeys. The
following corrections are part of the existing redesign goal and its single bounded Task 15 pass;
they do not reopen Tasks 1–14.

### Fixture-first venue planning

- A fixture already owns its kickoff date and time. The planner MUST NOT ask the venue to enter or
  repeat an event date.
- The planner MUST NOT expose the complete multi-competition fixture catalog as one dropdown.
  It presents a bounded, chronological card list grouped by Israel calendar day, prioritizes
  followed/relevant fixtures, and provides team/competition search plus small useful filters.
- Selecting a row adds that exact fixture. Its kickoff date, kickoff time, competition, teams, and
  default event duration are inherited and shown for review.
- Search and pagination still reach the complete locally synced future horizon; the compact initial
  list is a presentation boundary, not a data truncation.

### Venue attendance modes

Every business-venue event has one explicit mode:

1. `open_door` — a public listing that tells fans the venue is showing the fixture. It has no RSVP,
   attendance request, invitation, approval queue, attendee roster, or capacity claim. Huddle does
   not represent physical walk-ins as registered attendees.
2. `reservations` — the existing registered-account attendance flow. It keeps a positive capacity,
   optional immediate joining or staff approval, atomic seat enforcement, invitations, and the
   one-account/one-attendee rule.

`open_door` is allowed only for an active business Venue and only with the public audience. Fan,
home, friends, group, invite-only, and team-follower events remain reservation-backed and retain
all existing safety, privacy, and capacity rules. Existing events and venues migrate to
`reservations`; a Venue may choose `open_door` as its default for new listings. A viewing area may
omit capacity when it is used only for open-door listings.

### Product-sheet fidelity

- Fan Home uses the supplied sheet's compact greeting, next-plan card, attention list, and nearby or
  followed recommendations rather than a generic marketing layout.
- Explore exposes one compact search summary whose modal contains the real filters; at 375px,
  event results appear in the initial viewport instead of below a full-page form.
- Event detail uses one strong fixture/venue hierarchy and a mode-aware sticky primary action. An
  open-door event says that no booking is needed and never shows join/invite/capacity controls.
- Venue Today, Calendar, planner, and settings use the denser Venue composition from the supplied
  sheet. The fixture planner is a selection surface, not a form-and-dropdown stack.
- The Huddle wordmark never changes sides or disappears between Fan and Venue. Venue identity uses
  the right-side workspace control, and **Plan events** belongs to the Venue page content rather
  than the global header.
- Huddle continues to use the approved Ink/Court Green/Forest/Linen/Sand palette, Familjen Grotesk,
  repository brand assets, restrained green emphasis, rounded cards, and clear whitespace.

### Final-audit recovery defects

The same correction pass also closes the reproduced onboarding draft loss, My Huddle's misleading
Hosting default, People attention deep-link failure, and detached Account workspace menu. These are
Important journey regressions and must have failing tests before implementation.

## 16. Production consistency and group-lifecycle correction — 2026-08-31

The deployed redesign exposed four connected information-architecture defects. Fan discovery uses
the account's complete ownership graph instead of the selected Fan perspective; fixture detail never
loads its linked events; group search is reachable only through a conditional empty state; and the
original group-discovery gate prevents ordinary new groups from ever entering that search. Group
owners also have no supported way to close a group.

### Fan discovery and fixture consistency

- A signed-in Fan MAY see a public or team-follower listing from a Venue they also manage. The card
  is a Fan-side view of a public opportunity, not Venue management data. Personally hosted private
  events, invitations, and existing attendance remain outside acquisition discovery.
- A fixture page lists every future published event whose safe summary is visible to the current
  viewer. It uses one bounded database projection and never infers visibility in React.
- A discoverable active group's published `public_place` event may expose a safe acquisition summary
  to an active Fan who is not yet a member. Home events remain relationship-private. Attendance still
  requires active group membership; a non-member is directed to the group application flow.

### Group finding and activation

- Explore provides two stable destinations: watch events and supporter groups. My Huddle always
  exposes **Find groups**, even when the viewer already owns or belongs to a group.
- A discoverable group enters search when its owner remains active and it has a non-empty description.
  Member count, moderator count, a published rule, and a future event are useful group-health facts,
  not search prerequisites. Joining still requires an owner/admin-reviewed application.
- Rules remain group expectations and may be shown on the group/application page, but publishing a
  rule is no longer a discovery requirement.

### Owner group deletion

- **Delete group** is an owner-only, explicitly confirmed product action backed by an audited
  transaction. It sets lifecycle to `archived`, revokes unused invitation links, and cancels future
  draft, pending, or published group events while retaining membership, attendance, invitation, and
  audit rows.
- Archived groups disappear from search, My Huddle, direct group reads, discovery, and future fixture
  listings. Administrators and members cannot delete a group, and repeated or unauthorized calls fail
  without revealing private group state.
- The UI describes the retained-history behavior before confirmation and returns the owner to My
  Huddle after success. No hard deletion is introduced.
