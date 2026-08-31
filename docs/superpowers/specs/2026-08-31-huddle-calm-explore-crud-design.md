# Huddle calm interface, unified Explore, and complete flow design

**Status:** Approved for implementation
**Date:** 31 August 2026
**Supersedes:** Visual and interaction details in `2026-08-30-huddle-ux-workspace-redesign-design.md` where this document is more specific
**Inputs:** Production reports on 31 August, the F01–F40 audit, the approved Fan/Venue workspace model, and the user-approved audience and invite-link decisions in this task

## 1. Outcome

Huddle will become a calm, light-first product whose main job is immediately legible:

> Find a match, see who is showing it nearby, and join the right people.

Fixtures are catalog data inside Explore rather than a competing destination. Events, groups, venues, friendships, invitations, attendance, and workspace actions each have one obvious home, one primary action, and a complete recovery path. Every visible control must lead to a working and truthful outcome.

The work remains one bounded branch and pull request. Focused tests run during implementation; the full acceptance suite and one complete two-account UX audit run after all implementation tasks.

## 2. Why the current interface fails

The production UI improved its top-level information architecture but retained an aggressive visual grammar:

- filled Court Green navigation, tabs, badges, and actions compete with one another;
- large display headings and uppercase eyebrow labels make ordinary pages feel promotional;
- bordered cards are nested inside more bordered cards, giving every detail equal weight;
- status vocabulary and safety implementation details are visible before the user's task;
- related actions are spread across Explore, Fixtures, My Huddle, event pages, management pages, People, and hidden inbox routes;
- generic error screens replace field-level recovery;
- identity handles and raw links are used as workflow inputs instead of being useful context.

The correction is not “make every component white.” It is to use layout, copy, disclosure, and color to express priority.

## 3. Research basis

The implementation applies these external design rules:

1. Nielsen Norman Group's [ten usability heuristics](https://www.nngroup.com/articles/ten-usability-heuristics/): keep system state visible, use real-world language, give users control and reversal, prevent errors, prefer recognition over recall, and remove non-essential information.
2. Nielsen Norman Group's [progressive disclosure guidance](https://www.nngroup.com/articles/progressive-disclosure/): keep the common task visible and defer advanced or historical details.
3. Apple's [layout guidance](https://developer.apple.com/design/human-interface-guidelines/layout): place the important task first, align content for scanning, group related controls, and use whitespace instead of undifferentiated containers.
4. Apple's [disclosure-control guidance](https://developer.apple.com/design/human-interface-guidelines/disclosure-controls): keep likely actions visible and hide advanced details by default.
5. GOV.UK's [validation pattern](https://design-system.service.gov.uk/patterns/validation/): preserve input, explain exactly what is wrong beside the field, and tell the user how to fix it instead of showing a service-failure page.
6. WCAG 2.2 [target-size guidance](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html) and [contrast requirements](https://www.w3.org/TR/WCAG22/): controls remain easy to activate, focus remains visible, text contrast remains sufficient, and destructive submissions are checked or confirmed.

These sources define testable product rules below; they are not decorative references.

## 4. Light-first Huddle design language

### 4.1 Palette

Huddle keeps its logo, Familjen Grotesk, and green identity, but changes surface roles:

| Role | Value | Use |
| --- | --- | --- |
| Canvas | `#F7F8F6` | page background |
| Surface | `#FFFFFF` | header, dialogs, object cards |
| Raised subtle | `#F0F3F0` | selected rows and grouped secondary content |
| Ink | `#0B1210` | primary text |
| Muted ink | `#5C665F` | secondary text with AA contrast |
| Border | `#DDE3DE` | hairline separators and inputs |
| Court Green | `#2CE07B` | one primary action or positive state per task area |
| Forest | `#0F6F3D` | links, current navigation text, focus-supporting accents |
| Sand | `#8A6A38` on pale sand | warnings and destructive confirmation context |

`color-scheme` is light. Dark mode is not added in this bounded submission pass.

### 4.2 Hierarchy rules

- One filled green action per visible task area. Other actions use text, ghost, outline, menu, or disclosure treatments.
- Current navigation uses Forest text and a two-pixel underline or quiet background, never a filled green capsule.
- A page uses at most three visible type levels. Desktop page titles cap at 40px and mobile titles at 32px.
- Uppercase eyebrow copy is removed from product screens.
- Cards represent actual objects or focused tasks. Ordinary sections use whitespace and dividers; cards do not nest.
- Status is one plain-language sentence. Multiple internal states are not rendered as a badge collection.
- Secondary metadata and audit history live under one descriptive disclosure such as “More details” or “History.”
- Destructive actions live in a quiet final section or overflow menu and always require a specific confirmation.
- Skeleton, empty, success, validation, unavailable, and authorization states use the same page rhythm as successful content.

### 4.3 Team marks

The scheduled football-data sync may store a nullable provider crest URL only from the allowlisted HTTPS crest host. `TeamMark` renders that cached provider image at fixed dimensions without a page-time sports API request and falls back after a load failure to a compact repository-owned emblem derived from the team's TLA or initials. The adjacent accessible team name carries meaning; neither color nor third-party artwork is the only label.

## 5. Unified Explore

### 5.1 Destination model

**Explore** is the only primary catalog destination. It answers:

1. Which match do I care about?
2. Who is showing it near me?
3. Can I attend or request a place?

`/matches` redirects to `/discover`. Existing `/matches/[matchId]` URLs remain stable object links but render inside the Explore navigation context and return to the caller's preserved Explore query. Home removes “Explore fixtures” residue and uses one “Find somewhere to watch” action.

Explore has two quiet views:

- **Events** — event and venue listings grouped by fixture.
- **Groups** — discoverable groups, with team association shown only when present.

Both `/discover` and `/groups` mark the global Explore destination current.

### 5.2 Search model

The compact search editor supports:

- area: current city, another city, or one-shot browser location;
- distance;
- date shortcut or custom range;
- competition;
- team;
- a specific fixture selected through a searchable result list.

The result heading restates the active query in ordinary language. Date ranges are validated before navigation and again on the server. An invalid range preserves the entered values, opens the editor, identifies the fields, and offers “Reset dates”; it never reaches the global error boundary.

### 5.3 Results

List results group listings beneath a compact fixture row with both `TeamMark`s, team names, competition, and Israel-local kickoff. A selected fixture displays every eligible venue/event showing it. A no-listing state says that nobody has listed it yet and, when the viewer is eligible, offers one contextual “Plan a huddle” action.

Map view shows public venue/public-place coordinates only. Protected home locations never enter the map projection. Selecting a map marker and selecting its list result remain synchronized.

Explore excludes events the viewer hosts, already attends, has requested, declined, left, was removed from, or receives only through an invite-only relationship. Venue events are visible to everyone; reservation eligibility remains separately enforced.

## 6. Audience and acquisition model

### 6.1 Invite only

An invite-only event is absent from Explore and invisible through its ordinary event URL to unauthorized viewers. Access can begin in two ways:

1. the host selects a registered person in the in-context invite picker; or
2. the host creates a secure invite link.

An invite link is a high-entropy plaintext token whose database stores only its SHA-256 digest. It is expiring, revocable, usage-limited, capacity-aware, and valid only before the event starts. The recipient must sign in and satisfy Fan/safety/block eligibility. Redeeming a token creates an invitation for that account; it does not silently reserve a place. The recipient then sees the event and chooses Accept or Decline. Acceptance atomically reserves one place.

A normal event URL never grants access. Product copy uses **Invite people**, **Create invite link**, and **Copy event link** as three different actions only where each is valid.

### 6.2 Friends

“Friends” means one accepted direct friendship; friends-of-friends never count. A friends event appears in Explore to the host's current accepted friends. Friends may request attendance unless directly invited. Removing the friendship removes future visibility and eligibility according to the existing safety contract.

### 6.3 Groups

The product term is **Groups**, not always “Supporter groups.” A group can have an optional team association:

- team-associated discoverable group;
- general discoverable social group;
- team-associated unlisted group; or
- general unlisted/private group.

An unlisted group may act as a private social circle. Its invite link starts a membership application and never bypasses admin approval. A group-audience event appears in Explore only to active, non-banned members. The discoverable group itself, rather than its private event, is how a stranger discovers and applies to the community.

### 6.4 Venues

Every active venue event appears in Explore for everyone, including anonymous visitors. Open-door events state “Just come along” and expose no invitation, RSVP, capacity, or guest-list controls. Reservation events expose only the attendance actions valid for the viewer. Team-follower rules may constrain attendance but never hide the listing.

## 7. Friendships and invitations

People owns the friendship lifecycle:

- search by display name or handle without exact-handle recall;
- send friend request;
- cancel outgoing request;
- accept or decline incoming request;
- remove accepted friendship;
- block or unblock through the connected safety control.

Home's attention queue and People both expose incoming work; completing it updates both. `@handle` remains visible identity context but is never the required input to invite someone.

Event invitations remain in context. The picker searches eligible people and explains why an ineligible person cannot be selected. Success copy says where the invitation appears: “They'll see this in Home and My Huddle and can accept or decline.”

The submitter of a pending group event never sees misleading Approve/Reject controls. They see “Waiting for another admin” and may withdraw their own submission. A different active owner/admin sees Approve and Reject.

## 8. Object homes and destructive actions

- **Events:** Explore acquires; My Huddle retains current relationships; event detail acts; management handles people and cancellation; History is collapsed.
- **Groups:** Explore finds discoverable groups; My Huddle retains memberships; group detail acts; settings handles members/rules/visibility; owner-only Delete performs audited archive.
- **Venues:** the workspace switcher recovers owned venues; public venue page represents the venue; workspace settings edits it; owner-only **Close venue** performs audited archive.
- **Friendships:** People owns current, incoming, and outgoing relationships.
- **Invitations and approvals:** Home attention and the relevant object expose the same current task, not separate hidden inboxes.

Closing a venue does not hard-delete referenced data. It hides the venue and workspace from live reads, cancels future live events, revokes usable invitations, prevents new commercial mutations, and retains membership/attendance/security history. Only the active owner may close it.

## 9. Complete action-flow audit

Before implementation is declared complete, the repository must contain a living action matrix that maps every visible button/link/form and every exported Server Action/RPC to:

- actor and eligibility;
- entry route and label;
- object and intended outcome;
- success destination and visible confirmation;
- empty/unavailable behavior;
- validation and authorization behavior;
- back, refresh, and direct-link recovery;
- reversal, withdrawal, archive, or destructive confirmation;
- automated and manual evidence.

The audit covers:

1. account, onboarding, profile, workspace switching, and sign-out;
2. Explore search, filters, map/list, fixture selection, and result opening;
3. event draft/create/read/manage/cancel, invite, join/request, accept/decline, approve/reject, leave/remove, share, calendar, and report;
4. group create/read/update/archive, search, apply, invite-link create/redeem/revoke, approve/reject, leave, roles, rules, ban/unban, share, event submit/review/withdraw;
5. venue activate/read/update/close, follow/unfollow, areas, defaults, plan/publish/cancel event, calendar, and workspace recovery;
6. people search, friendship request/cancel/accept/decline/remove, block/unblock, and event/group selection from People context;
7. event invitation create/revoke/redeem/accept/decline and secure-link expiry/exhaustion;
8. moderation/report actions already exposed to the demonstration accounts.

No visible dead button, misleading enabled action, generic validation crash, unexplained disabled control, or context-losing back path may remain.

## 10. Verification and exit gate

Implementation uses test-first red/green cycles. Focused Vitest/pgTAP/Playwright tests run while changing each boundary. After the integrated wave:

1. run formatting, lint, typecheck, generated database types, build, database lint/tests, unit/component tests, security audit, and the complete Playwright acceptance suite;
2. run the deterministic two-account journey at 1280px, 768px, and 375px;
3. manually audit every action-matrix row in local production-build mode;
4. run one independent production-style UX audit using the approved persona;
5. perform one bounded correction pass for Critical/Important findings, privacy/security/data-integrity failures, or broken acceptance behavior;
6. re-run the complete acceptance gate after any correction;
7. inspect the full diff for secrets, private data, screenshots with credentials, generated junk, and unrelated changes;
8. only then commit, push, open the single pull request, and request reciprocal review from `ohadsho`.

The writer never approves or merges this pull request. Deployment and hosted migrations remain out of scope for this branch handoff.

## 11. Approved location, group, and sports extension

The location selector is a reusable search-origin combobox, not a pilot-city gate. It accepts cities, neighborhoods, streets, and public addresses, offers keyboard-operable OpenStreetMap suggestions after three characters, and returns a validated coordinate through a replaceable server-side provider adapter. Huddle uses an already-granted browser coordinate by default, then a session-scoped last choice, then the Fan profile city. It never triggers a browser permission prompt without a user gesture, exposes a precise origin in a URL or log, or submits protected-home address text to a third-party geocoder.

Explore ranks eligible public events and venues by distance across city borders. City remains display/fallback metadata for events and venues, not a boundary around the search. The accepted date range follows the locally synchronized season window through 31 May rather than an arbitrary 45-day ceiling.

Groups are global communities. A group may retain an optional home-area city for descriptive context, but city is not required at creation, does not filter membership eligibility, and does not prevent discovery or application. Public group search is global; when a group has a nearby upcoming public event, that proximity may improve its ranking. My Huddle always exposes both `Create group` and `Find groups` regardless of existing ownership.

Group sharing has two explicit modes. `Invite a person` creates a recipient-bound in-app invitation which that member can accept or decline. `Create share link` creates the existing reusable, expiring application link and never displays a person selector. Active members may be removed without being banned; removal ends membership, is audited, and permits a later fresh application unless another safety rule prevents it.

The synchronized sports catalog may persist the football-data.org team `crest` URL as nullable `crest_url`. Only HTTPS URLs on the expected crest host are accepted. Product pages render the synchronized URL without making provider API requests and fall back to the repository-owned accessible `TeamMark` when the URL is absent or fails. Documentation identifies provider artwork accurately and does not claim it as a Huddle-owned asset.

Workspace switching always navigates to the selected workspace home. Event creation reports exact field errors, focuses the first invalid field, and never renders a protected-home marker until the user explicitly selects a pin. Explore continues to omit the viewer's own/current events and provides a quiet route back to My Huddle for management.
