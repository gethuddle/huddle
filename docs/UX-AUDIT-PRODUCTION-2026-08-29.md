# Huddle production UX audit

**Date:** 29 August 2026
**Target:** `https://huddle-navy-five.vercel.app`
**Mode:** Thorough production dogfood; audit only
**Viewport coverage:** Desktop and 375 × 812 mobile
**Primary persona:** A newly activated supporter who wants to find a match, meet people, and host or manage a huddle
**Secondary personas:** A group owner/admin; a venue creator; a signed-out visitor

## Executive conclusion

Huddle's core domain and safety rules are present, but the product currently behaves like a set of database administration screens rather than one coherent social experience. The user has to understand internal concepts—attendance rows, lifecycle synchronization, publication gates, group-review states, audience rules, and retained history—before they can complete ordinary actions.

The central UX failure is not styling. It is the information architecture:

1. **Objects do not have stable homes.** Venues cannot be recovered at all; events and groups appear in several overlapping places.
2. **Different jobs are mixed together.** Discovery, ownership, invitations, attendance, moderation, and audit history share the same feeds and cards.
3. **The system exposes its implementation model.** Internal state names and course/architecture language replace plain-language outcomes and next actions.
4. **Simple actions become multi-page scavenger hunts.** Inviting a person, making a group discoverable, finding a friend, or managing an event requires remembering IDs, switching surfaces, and reconstructing context.
5. **Historical integrity is mistaken for visible product residue.** It is correct for the database to retain cancelled/removed/left records; it is not correct for those records to dominate active user surfaces.
6. **A commercial venue is treated as a fan-owned record, not a business account.** Any eligible personal account is offered venue creation, while actual venue operators receive no dedicated dashboard, reusable operating defaults, or fixture-planning calendar.

The correct redesign is an **object-and-task model**:

- **Home** answers “What is happening next?” and “What needs me?”
- **Explore** contains fixtures, public/discoverable groups, and events the viewer does not already own or attend.
- **My Huddle** contains stable libraries for **Events, Groups, Venues, and Saved/Following**, with Active/Archived filters.
- **Venue workspace** is a separate business-facing mode with its own dashboard, venue profile, calendar, event drafts, scheduled events, and reusable operating defaults.
- Each event, group, and venue has one overview page with role-aware actions and a compact management area.
- Invitations, applications, and reviews appear as task rows with counts and direct actions—not as a maze of generic tabs.

## Method and limits

The audit used the deployed product, not local assumptions. It covered signed-in and signed-out navigation, discovery, fixtures, event creation/detail/management, group creation/detail/management, venues, people/friends, profile, interests, safety, data-source pages, mobile reflow, refresh resilience, and console output.

After explicit approval, the two activated accounts were tested in isolated browser sessions. The audit submitted a test friend request, event invitation, and discoverable-group application; accepted each from the second account; then removed the attendee, left the group, and removed the friendship to test cleanup. Reversible state was restored where the product allowed it. The event invitation/attendance history remains because the product deliberately retains it and exposes no erasure flow.

No deployment, infrastructure change, database administration, code change, event/group/venue creation, publication, cancellation, ban, or report was performed. One long-form interruption test entered a clearly labelled audit title and refreshed before submission. No private address, credential, token, email, event ID, or other sensitive value is reproduced in this report.

## User journey and emotional arc

| Moment | What the user tries to do | What happens | Likely feeling |
|---|---|---|---|
| First signed-in landing | Understand what Huddle is for today | Home repeats the same event/group cards as My Huddle and mixes live, pending, and cancelled objects | “Which page is my real home, and what matters now?” |
| Find something to attend | Browse Discover | The main result is the user's own invite-only event; the signed-out feed is empty | “Am I exploring, or looking at my own content again?” |
| Host an event | Choose a fixture, place, audience, and publish | Five expanded sections, 45-option fixture list, raw coordinates, disabled audience, and no refresh recovery | Anxiety about doing something wrong; fear of losing work |
| Invite someone | Find a person and invite them | Exact handle is required; Find people leaves the event and cannot return a selection | Irritation; the app makes the user act as the integration layer |
| Grow a group | Invite people and become searchable | Invite people leads to a page saying invitations are unavailable; search visibility itself requires more members | Stuck and blamed by a circular rule |
| Run a group event | Publish an admin-authored event | The same owner must approve their own submission | Busywork; the safety step feels performative |
| Return later | Recover created work | Events/groups are visible in multiple places, cancelled state dominates, venue is absent everywhere | Low trust that the app remembers the right things |

### Click-efficiency outcomes

- **Recover an owned venue:** impossible through the UI.
- **Invite a person whose handle is unknown:** at least five context changes/interactions, plus memorizing the handle; there is no completion path from People back to the event.
- **Check whether a group needs work:** enter Manage, then inspect up to six unlabeled-count tabs; the readiness wall repeats before the task.
- **Find a hosted event:** easy, but duplicated on both Home and My Huddle and mixed with archive states.
- **Find a new event to attend:** nominally one click to Discover, but the result set does not distinguish new opportunities from owned/invited objects.

### Would a new user come back?

Not reliably. A user arriving through a direct event invitation might complete that single task, but the product does not yet teach a stable mental model for returning. The strongest retention risk is not a missing feature; it is that the app remembers implementation history more visibly than it remembers the user's intent.

## Verification of the reported concerns

| # | Concern | Result | Production evidence | UX conclusion |
|---|---|---|---|---|
| 1 | Created venues cannot be found | **Confirmed** | My Huddle and Account contain no owned-venue list. `/venues` returns the generic not-found page; only Create venue exists. | A created commercial object has no recovery path. This is a critical information-architecture gap. |
| 2 | Discover shows events the user made | **Confirmed** | The signed-in Discover result included the current user's hosted event. | Owned objects belong in My Huddle, not in a discovery feed whose purpose is finding something new. |
| 3 | Discover shows the user's invite-only event | **Confirmed** | The hosted result was labelled Invite only. The same URL correctly returned not found to a signed-out visitor. | Authorization is working, but placement is wrong. Invite-only items should arrive through My Huddle/invitations/direct links, not general Discover. |
| 4 | Longitude and latitude must be abolished from normal UI | **Confirmed** | Event creation asks for Longitude then Latitude; venue creation asks for Latitude then Longitude. | Raw coordinates are developer inputs, and even their order is inconsistent. Users should enter/search an address and confirm a pin. |
| 5 | Group admins approve their own events | **Confirmed** | A group-owner-authored event appeared in the same owner's Event reviews tab with Approve and publish/Reject controls. | This is safety theatre: either auto-publish trusted admin-authored events or require a genuinely independent reviewer. |
| 6 | Invite people links to the wrong group-management section | **Confirmed** | Invite people opens `manage?section=invites`, whose content says invitations are not used for discoverable groups. | The CTA promises an action the destination explicitly refuses. |
| 7 | “Lifecycle synchronized / Current lifecycle: forming” is strange | **Confirmed** | The readiness block presents both phrases alongside five activation requirements. | Database/process terminology is being presented as user guidance. Replace it with a short, actionable checklist. |
| 8 | “Invite one registered supporter” is cumbersome | **Confirmed** | Event management requires an exact handle and sends users to Find people if they do not know it; Find people cannot return the user to the event with a selection. | The invite task is fragmented across unrelated pages and depends on memorization. |
| 9 | Removed/cancelled activity leaves visible residue | **Confirmed from both sides** | After the host removed the second account, the attendee still saw the invite-only event as Past activity in My Huddle, as Removed in Attendance, and in Discover's “eligible nearby events.” The event detail remained open with a safe summary and removed status; the protected exact location was correctly revoked. The host simultaneously retained accepted-invitation and removed-attendance history. | Retain history in the database, but exclude closed relationships from active/discovery surfaces and move them to an Archive/History disclosure. |
| 10 | Venues need a dedicated account and operating dashboard | **Confirmed** | The ordinary fan account exposes Create venue without a business-account choice or business onboarding. After creation there is no venue dashboard, calendar, future-event planner, or reusable venue defaults. | A venue is being modeled as another object owned by a fan, when the operator needs a separate commercial workspace and workflow. |

## Scenario-test results

| Scenario | Result | Evidence |
|---|---|---|
| New-user onboarding | **2/5 self-explanatory** | The empty account explains individual sections, but the user cannot infer the difference between Home/My Huddle, how to bootstrap friends/groups, or where created venues will live. |
| Interrupted workflow | **Fail** | Refreshing the long event form erased entered work without warning or recovery. |
| Wrong-turn recovery | **Fail in key flows** | Invite people opens an unavailable feature; `/venues` is a 404; People search cannot return a selection to the event being managed. |
| Day two efficiency | **No meaningful improvement** | No recent-items model, attention queue, remembered work, or owned-venue directory. Returning users still inspect the same duplicated cards and hidden tabs. |
| Explain it to a colleague | **Only the simple read flows fit two minutes** | “Browse fixtures” is easy. “Invite someone,” “make a group searchable,” and “recover a venue” require caveats or have no complete explanation. |
| What changed? | **1/5 awareness** | A real friend request and group application generated no Home/Account signal. The event invitation appeared, but mixed into the same activity area as removed/cancelled history. |

### Two-minute-guide stress test

- **Find an event:** Open Discover, choose city/date/team, then open an eligible result. *Caveat: Discover may show events you own, already attended, or were removed from.*
- **Invite a supporter:** Open event management, leave for People search if you do not know the exact handle, remember it, return manually, retype it, and send. *This cannot be explained as one continuous flow.*
- **Grow a forming group:** Share the direct link outside Huddle and wait for applications, then remember to inspect Applications. *The in-product Invite people action is a dead end and the owner receives no alert.*
- **Manage a venue:** Create it, then use its saved deep link. *There is no owned-venue directory, so this workflow cannot be explained truthfully without telling users to bookmark URLs.*

## Ranked findings

### Critical

#### F01 — Owned venues have no home or recovery path

**Where:** My Huddle, Account menu, `/venues`
**Evidence:** A user can create a venue but cannot list their venues. The natural `/venues` route is a generic 404.
**Impact:** A newly created venue effectively disappears. This breaks the venue-owner journey and undermines the project's future-customer story.
**Recommendation:** Add **My Huddle → Venues** and `/venues` with Owned and Following sections. Every creation confirmation should redirect to the saved venue and expose Manage venue.

#### F02 — Discovery mixes “new opportunities” with already-owned content

**Where:** `/discover`
**Evidence:** The only signed-in result was the viewer's own hosted event.
**Impact:** Discover cannot answer its core question: “What can I join?” It behaves like another My Huddle view.
**Recommendation:** Exclude events the viewer hosts, already attends, has declined/left, or has archived. Add a small “Your events are in My Huddle” link rather than cards.

#### F03 — Invite-only objects are presented as discoverable feed items

**Where:** `/discover`
**Evidence:** A host's invite-only event appeared in Discover, while anonymous direct access was correctly denied.
**Impact:** The boundary is technically secure but conceptually confusing. “Invite only” and “Discover” communicate opposite acquisition models.
**Recommendation:** Route invite-only events through My Huddle, invitations, notifications, and direct share links only. Reserve Discover for public or relationship-discoverable items the viewer has not already acquired.

#### F04 — Event creation silently loses work on refresh

**Where:** `/events/new`
**Evidence:** An audit title entered into the long form was empty after refresh.
**Impact:** A user can lose several minutes of fixture, place, audience, and safety work without warning. This is especially likely on mobile or after authentication/session interruption.
**Recommendation:** Persist an explicit draft server-side or at minimum locally, restore it on return, and warn before abandoning unsaved changes. Use a review/confirmation step before publication.

#### F05 — Discoverable-group activation is circular

**Where:** `/groups/[slug]`, `/groups/[slug]/manage`, `/groups`
**Evidence:** A discoverable group needs five members before appearing in search, but its Invite people CTA leads to a page explaining that discoverable groups do not use invitations.
**Impact:** A new owner is told to grow a group that the app neither lists nor helps them invite people into. The only workable path is manually sharing a deep link outside the product.
**Recommendation:** Provide one explicit forming-group growth flow: share link, copy invite link, invite known Huddle users, and a progress checklist. If direct invitations remain forbidden by policy, say so before creation and make sharing the primary action.

### High

#### F06 — Group owners review and publish their own submissions

**Where:** `/groups/[slug]/manage?section=events`
**Evidence:** The owner who submitted an event also sees Approve and publish and Reject.
**Impact:** Adds delay and cognitive burden without adding independent review.
**Recommendation:** Auto-publish owner/admin-authored submissions, or change the product rule so a different admin must approve. Do not preserve a meaningless self-review step.

#### F07 — “Invite people” is a dead-end CTA

**Where:** `/groups/[slug]` → `manage?section=invites`
**Evidence:** Destination says invitations are not used here.
**Impact:** Breaks trust and leaves the owner unable to infer the correct next action.
**Recommendation:** Replace with the real available action: **Share group**, **Copy application link**, or an actual invite picker.

#### F08 — Event invitation requires exact-handle memorization and context switching

**Where:** `/events/[id]/manage`, `/people`
**Evidence:** The invite form requires an exact handle. “Find people” opens a generic search surface that does not carry the event context or offer “Invite to this event.”
**Impact:** A simple social action becomes search → profile → remember handle → navigate back → retype → submit.
**Recommendation:** Embed a searchable people picker in the event page, prioritize friends/group members/recent contacts, show eligibility inline, and invite without leaving the event.

#### F09 — Audit history overwhelms current-state UI

**Where:** My Huddle, event management
**Evidence:** Cancelled events remain primary cards; accepted invitations and removed attendance appear simultaneously; copy emphasizes retaining every participation state. In the two-account test, a removed attendee continued to see the invite-only event in My Huddle, Attendance, Discover, and event detail.
**Impact:** Users cannot tell what is current. Removed relationships feel socially “sticky” and potentially hostile.
**Recommendation:** Keep immutable history in the database, but primary lists should use current effective state. Move cancelled/removed/left/declined records to **Archive** or **History**, collapsed by default and accessible to authorized users when actually needed.

#### F10 — Raw geographic coordinates are normal form fields

**Where:** `/events/new`, `/venues/new`
**Evidence:** Both flows expose latitude/longitude; their order differs between flows.
**Impact:** Most users do not know coordinates, copy/paste errors are likely, and an incorrect pin can undermine discovery or disclose the wrong place.
**Recommendation:** Use address search plus a map-pin confirmation. Keep coordinates generated and validated server-side; expose manual pin movement only as an advanced correction.

#### F11 — Home and My Huddle duplicate each other

**Where:** `/`, `/dashboard`
**Evidence:** Both show the same event and group cards. Home adds counts but does not establish a different purpose.
**Impact:** Two primary destinations compete for the same mental model, making navigation feel arbitrary.
**Recommendation:** Make Home a concise next-action/timeline dashboard; make My Huddle a complete object library. Do not duplicate full card collections.

#### F12 — There is no unified “needs your attention” inbox

**Where:** My Huddle, Events, group management
**Evidence:** Friend requests, attendance, group applications, group event reviews, invitations, and activation tasks live in separate pages/tabs without aggregate counts. A real incoming friend request produced no Home or Account signal, and a real group application produced no alert for the owner.
**Impact:** Users must remember where each type of work lives and repeatedly inspect empty sections.
**Recommendation:** Add a small **Needs your attention** queue on Home/My Huddle with counts and direct actions: attendance request, event review, group application, invitation, friend request.

#### F13 — The five-step event “wizard” is actually one enormous page

**Where:** `/events/new`
**Evidence:** Steps 01–05 are all expanded simultaneously on mobile. The fixture control contains 45 options before the rest of the form.
**Impact:** The step treatment promises progress but supplies none; users cannot tell what is complete and face a long, fragile transaction.
**Recommendation:** Use three real screens: **Match**, **Place & audience**, **Review & publish**, with back/next, preserved answers, visible progress, and a final check page.

#### F14 — Fixture selection uses a 45-item unsearchable dropdown

**Where:** `/events/new`
**Evidence:** Every future fixture is rendered as one native select list.
**Impact:** Slow scanning, especially on mobile; users cannot type a team or filter followed competitions.
**Recommendation:** Use an accessible combobox when there are more than 15 options, prefilter to followed teams/competitions, and allow date/team search.

#### F15 — The fixture catalog claims to be current while covering only to October

**Where:** `/matches`, `/discover`
**Evidence:** Catalog status says current and recently updated, but the 45 listed fixtures end on 12 October although the league season continues.
**Impact:** Freshness is confused with completeness. Users assume later fixtures do not exist.
**Recommendation:** Display **Coverage through 12 Oct** separately from **Updated 5 hours ago**, and repair the sync/import window so the published horizon matches the promised season scope.

#### F16 — Primary navigation has no current-location state

**Where:** Desktop and mobile header
**Evidence:** The current route has no visible selected treatment and no `aria-current`.
**Impact:** Deep and duplicated surfaces become harder to orient within.
**Recommendation:** Keep four or five stable top-level destinations and visibly/programmatically mark the current one.

#### F17 — Mobile navigation hides 15 destinations in one menu

**Where:** 375 px header menu
**Evidence:** Menu contained Home, Fixtures, Discover, Groups, My Huddle, Attendance, Interests, Friends, Find people, Safety, Create group, Create venue, Host event, Profile, plus sign-out outside it.
**Impact:** The menu is an undifferentiated site map rather than a usable primary navigation.
**Recommendation:** Keep 4–5 primary destinations; group secondary account/settings and creation actions inside their relevant object homes.

#### F18 — Touch targets are too small for reliable mobile use

**Where:** Mobile header, fixtures, footer
**Evidence:** Menu/Sign out controls were about 36 px high; fixture “Match details” links about 20 px high; footer links about 18 px high.
**Impact:** Difficult one-handed use and greater chance of mistaps.
**Recommendation:** Make primary interactive targets at least 44 × 44 px as a product convention, while at minimum satisfying WCAG 2.2's 24 × 24 px or spacing rule.

#### F19 — Disabled Friends audience has no recovery action

**Where:** `/events/new`
**Evidence:** Friends is disabled with “Requires at least one accepted direct friend,” but no Find people/Add a friend action.
**Impact:** A user learns they are blocked but not how to proceed; disabled controls are also skipped by keyboard users.
**Recommendation:** Keep it explainable and actionable: “Add your first friend to use this audience” with a contextual link, or hide it until relevant.

#### F20 — People search requires prior knowledge instead of aiding discovery

**Where:** `/people`, `/settings/friends`
**Evidence:** Users must search by display name/handle and are told to ask for a handle. Friends is a separate destination with its own three empty tabs.
**Impact:** The product cannot bootstrap a social graph for a new user.
**Recommendation:** Combine people and friend management. Add recommendations from shared teams/groups/city, recent contacts, accepted friends, pending requests, and in-context actions.

#### F21 — Removed attendance remains an “eligible” Discover result

**Where:** `/discover`, My Huddle, `/events`
**Evidence:** After the host confirmed removal, the second account's Discover feed still listed the invite-only event under “Eligible nearby events,” showed “Your attendance: removed,” and advertised all six places remaining. The same closed event remained in My Huddle and Attendance.
**Impact:** Discover advertises an event the viewer cannot rejoin, while the capacity copy makes it look newly available. This is both misleading and socially uncomfortable.
**Recommendation:** Exclude `removed`, `left`, `declined`, cancelled, owned, and already-attending records from discovery. Preserve a separately authorized history view if required.

#### F22 — A pending group application cannot be recovered

**Where:** My Huddle, `/groups`, direct group detail
**Evidence:** After the second account applied to a forming discoverable group, neither My Huddle nor Groups showed the application. Only the previously known deep link displayed “Application: pending.”
**Impact:** A user who navigates away cannot check status or return to the group unless they remember/bookmark the URL.
**Recommendation:** Add **Group applications** to My Huddle with Pending/Accepted/Declined status and a direct group link. Keep pending applicants out of protected member projections.

#### F23 — Cross-account work arrives without actionable notification

**Where:** Home, Account, group owner dashboard
**Evidence:** A friend request produced no Home or Account badge for its recipient. A group application produced no Home/My Huddle signal for the owner. Event invitations appeared as cards, but there was no shared attention count across these task types.
**Impact:** Time-sensitive social work is discoverable only if users already know which dedicated page or management tab to inspect.
**Recommendation:** Surface role-aware task notifications with direct actions and counts, while keeping read-only activity separate.

#### F24 — Removal confirmation leaves contradictory stale state

**Where:** `/events/[id]/manage`
**Evidence:** After confirming attendee removal, the page announced “Attendee removed” while still rendering that account as Approved with a Remove attendee button. A full navigation/reload then showed Removed correctly.
**Impact:** The host cannot trust whether the safety-sensitive removal actually took effect and may click again or leave the page uncertain.
**Recommendation:** Update/invalidate the attendance query atomically with the successful mutation; render one effective state and disable duplicate actions until it is settled.

#### F25 — Removing a friend has no confirmation or undo

**Where:** `/settings/friends?bucket=accepted`
**Evidence:** Remove friend executed immediately after one click and then showed an empty list, without a confirmation step or persistent undo.
**Impact:** An accidental tap can change friends-only visibility and related eligibility. The immediate security rule should remain, but the user needs confidence about the consequence.
**Recommendation:** Use a specific confirmation explaining visibility effects, or perform immediately with a short safe undo where the authorization model permits it.

#### F40 — Venue operators are modeled as fans instead of businesses

**Where:** Signup/onboarding, Account menu, `/venues/new`, venue management, event creation
**Evidence:** The same completed personal account used for friendships, groups, and private hosting is offered **Create venue**. Creating a venue adds a public record owned by that personal profile; it does not establish a distinct business identity or open a venue operating dashboard. Event creation then asks the operator to re-enter information that should already belong to the venue, and there is no calendar or fixture-planning surface for scheduling several future events.
**Impact:** The model makes venue impersonation trivially available, mixes personal and commercial work, and turns a recurring business workflow into repeated long-form event creation. A real operator cannot quickly answer “What are we showing this week?”, “Which fixtures still need an event?”, or “What requires attention?”
**Recommendation:** Introduce a dedicated **Venue business workspace**. A human login administers the workspace as owner/admin, but ordinary Fan mode cannot create venues or publish public/team-follower events. The venue profile supplies reusable defaults—public address, map position, description, normal capacity, screens, house information, and standard attendance settings—so an event normally needs only a fixture, any event-specific override, and publish confirmation. Its dashboard should provide:

- upcoming and draft events in a calendar/list;
- a fixture planner that can create several future event drafts in one session;
- clear Published, Draft, Full, Cancelled, and Needs attention states;
- venue-profile and reusable-default management;
- follower and attendance summaries;
- direct event editing without crossing into the fan's private social surfaces.

Safety and truthfulness rules remain server-enforced. Reusing venue defaults must not allow the operator to bypass audience restrictions, capacity validation, event cancellation rules, moderation, or the visibly unverified status.

### Medium

#### F26 — Group readiness is expressed in database language

**Where:** Group detail and management
**Evidence:** “Lifecycle synchronized,” “Current lifecycle: forming,” “Published rule,” and “Approved future event.”
**Impact:** Users must interpret implementation states instead of seeing a clear outcome.
**Recommendation:** Use “Your group will appear in search after:” followed by action rows: Invite 3 more members, Add one rule, Publish one upcoming event. Hide synchronization and lifecycle terminology.

#### F27 — Group management repeats the same setup wall on every tab

**Where:** All six group-management sections
**Evidence:** Readiness and description content precede Event reviews, Applications, Members, Invitations, Bans, and Rules.
**Impact:** The actual task is pushed below repeated material; every page feels longer than it is.
**Recommendation:** Put compact status once in Overview. Each management destination should lead with its task.

#### F28 — Six management tabs have no counts or urgency

**Where:** `/groups/[slug]/manage`
**Evidence:** Event reviews, Applications, Members, Invitations, Bans, Rules all look equally important, including empty sections.
**Impact:** Admins must open tabs to discover whether work exists.
**Recommendation:** Use Overview plus task rows/counts. Hide empty/unsupported tabs or show them as low-priority links.

#### F29 — Tabs are being used as page navigation

**Where:** Group management
**Evidence:** Each tab maps to a URL query section and functions like a separate admin page.
**Impact:** Hidden content, weak mobile scanning, and unclear back/history behavior.
**Recommendation:** For first-time/casual admins, use an overview with clearly named links; reserve tabs for frequent switching among closely related data.

#### F30 — User-facing copy contains course and engineering commentary

**Where:** Match detail, venue creation, interests, data sources, group/event management
**Evidence:** Examples include “course MVP,” “B09,” “provider-neutral identities,” “raw payloads,” “last good local catalog,” and milestone limitations.
**Impact:** Makes the product feel unfinished and asks the grader/user to understand implementation history.
**Recommendation:** Move architecture and attribution detail to documentation. Product copy should answer what the user can do, what happens next, and what is private.

#### F31 — Group creation promises an unavailable next step

**Where:** `/groups/new`
**Evidence:** Creation copy promises the user can invite people immediately, while discoverable-group management says invitations are not used.
**Impact:** The first post-creation expectation is violated.
**Recommendation:** Make the promise visibility-specific and redirect to the real next action.

#### F32 — Event detail mixes attendee and host mental models

**Where:** Hosted event detail
**Evidence:** The host sees “Join this huddle,” followed by a management action, instead of a clear “You're hosting” state.
**Impact:** The page does not adapt to the viewer's role.
**Recommendation:** Use role-aware headings and primary actions: You're hosting → Manage event; You're invited → Accept/Decline; Request pending → Pending; Attending → View details/Leave.

#### F33 — Event status vocabulary is duplicated

**Where:** My Huddle event cards
**Evidence:** One card simultaneously says “awaiting group review” and “pending group review.”
**Impact:** Adds noise without new information.
**Recommendation:** One plain-language status and one next action: “Waiting for a group admin” / “Review submission.”

#### F34 — Related objects do not link to each other

**Where:** Event detail
**Evidence:** The organizing group is shown as plain text, not a link. Similar discontinuities exist between people search and invitations.
**Impact:** Users lose context and must return to global navigation.
**Recommendation:** Every relationship label should be navigable when authorization permits: event ↔ group ↔ venue ↔ person.

#### F35 — Routine profile editing repeats onboarding/legal burden

**Where:** `/settings/profile`
**Evidence:** Basic profile fields share a very long page with adult attestation and the full community rules.
**Impact:** “Change my bio/city” feels like repeating account setup and discourages maintenance.
**Recommendation:** Show saved eligibility as compact status; put rules in a dedicated page or disclosure and require re-acceptance only when the version changes.

#### F36 — Interests is an unprioritized catalog, not personalization

**Where:** `/settings/interests`
**Evidence:** Sports, competitions, and roughly twenty teams appear as a single long list with Follow buttons and internal data-source commentary.
**Impact:** New users cannot quickly express intent or see what is already followed.
**Recommendation:** Add search, Followed filter, sections for suggested/popular teams, and visual recognition. Remove implementation notes.

#### F37 — Generic 404 conflates missing and unauthorized content

**Where:** `/venues`, private event URL as signed-out user, `/moderation` as a normal user
**Evidence:** All show the same “may have moved, may not exist, or may not be visible” message and Return home.
**Impact:** Safe non-disclosure is good, but recovery is poor; users cannot tell what legitimate next action to take.
**Recommendation:** Preserve privacy while tailoring recovery: Sign in to continue, Browse events, Open My Huddle, or return to the referring object. Do not reveal whether private content exists.

#### F38 — Safety, reports, and appeals use inconsistent labels

**Where:** Header/Account versus `/reports`
**Evidence:** Navigation says Safety while the destination leads with reports/actions/appeals.
**Impact:** Users may not know where to report, block, or review an appeal.
**Recommendation:** Use one stable label, such as **Safety center**, and make Block/Report contextual actions link back to it.

#### F39 — Small polish defects reinforce “prototype” perception

**Where:** Group cards and repeated card/status layouts
**Evidence:** “1 active members,” lowercase user-created titles, repeated status pills, and dense explanatory copy.
**Impact:** Individually minor, collectively damaging to confidence—especially for a grader's first five minutes.
**Recommendation:** Add pluralization, normalize display formatting where appropriate, reduce badges, and reserve helper text for actual uncertainty.

## What worked

- The signed-out user could not open the tested invite-only event; the privacy boundary behaved correctly.
- Accepting a direct invitation granted the second account its approved attendance state, and host removal immediately hid the exact protected location again. No private location was reproduced in this report.
- Thirteen Israel pilot cities were available in the tested forms and filters; the earlier empty-city failure was not present.
- No horizontal overflow appeared on the tested 375 px pages.
- Loading, empty, unauthorized, and error states generally exist rather than failing blank.
- The tested production pages produced no application console errors or warnings; observed console messages were from a browser extension.
- Event and group objects are now recoverable in My Huddle; the remaining missing object type is venues.

## Research-backed redesign patterns

### 1. Use a small, stable primary navigation

Android/Material guidance recommends three to five equal, consistent destinations on compact screens and explicitly notes that larger drawers are less ideal because they require top-bar reach. Huddle should use **Home, Explore, My Huddle, People, Account** (or four destinations with People under My Huddle), visibly highlighting the current destination. [Android navigation guidance](https://developer.android.com/design/ui/mobile/guides/layout-and-content/layout-and-nav-patterns), [W3C `aria-current` technique](https://www.w3.org/WAI/WCAG22/Techniques/aria/ARIA26)

### 2. Turn group activation into an actionable task list

The GOV.UK task-list pattern recommends a small set of meaningful statuses, action-first task names, and clear Completed/Incomplete/Cannot start yet states. Huddle should show only tasks the owner can act on and explain dependencies in plain language. [GOV.UK complete-multiple-tasks pattern](https://design-system.service.gov.uk/patterns/complete-multiple-tasks/)

### 3. Use real steps and preserve answers for event creation

USWDS recommends step indicators for processes spread across several screens; GOV.UK recommends a final check-answers page and says previous answers should be pre-populated when users go back. Huddle's five always-open sections should become three persisted steps plus Review and publish. [USWDS step indicator](https://designsystem.digital.gov/components/step-indicator/), [GOV.UK check answers](https://design-system.service.gov.uk/patterns/check-answers/)

### 4. Replace long selects with searchable comboboxes

USWDS recommends a combobox when a dropdown has more than 15 options. The 45-fixture selector should support team/date text filtering and prioritize followed interests. [USWDS combo box](https://designsystem.digital.gov/components/combo-box/)

### 5. Hide internal detail, not essential actions

GOV.UK's details pattern is intended for optional information, not information most users need. Huddle should hide technical safety/audit explanations behind “How privacy works,” while leaving the actual task and result visible. [GOV.UK details guidance](https://design-system.service.gov.uk/components/details/)

### 6. Use tabs sparingly

GOV.UK warns that tabs hide content, are easy to miss, and should not be used as page navigation. The six-section group admin console should become an overview plus direct task links/counts. [GOV.UK tabs guidance](https://design-system.service.gov.uk/components/tabs/)

### 7. Meet mobile target sizing and location cues

WCAG 2.2 requires pointer targets to be at least 24 × 24 CSS pixels or sufficiently spaced; larger targets are recommended for important controls. Huddle should adopt 44 × 44 px as its product convention and mark the current navigation destination visually and with `aria-current`. [W3C target-size guidance](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum), [W3C location guidance](https://www.w3.org/WAI/WCAG22/Understanding/location.html)

## Open-source geocoding recommendation

The user should never type latitude or longitude.

Recommended interaction:

1. User enters a public venue/place address or a private home address in a normal address field.
2. Huddle searches only after deliberate input, restricted/biasable to Israel and the selected city.
3. User selects a human-readable result.
4. Huddle shows a small map or address confirmation with a movable pin.
5. The server stores validated coordinates; raw values remain an advanced/debug concern.
6. Home coordinates stay in the existing protected private-location domain and are never exposed to unauthorized clients or the geocoder after initial lookup beyond what is required.

Technology options:

- **Best product fit:** self-host [Photon](https://github.com/komoot/photon) or use a managed Photon/Nominatim-compatible provider. Photon is open source, uses OpenStreetMap data, and supports search-as-you-type, multilingual search, typo tolerance, location bias, and reverse geocoding.
- **Small pilot fallback for public venues/places only:** server-proxied, submit-triggered Nominatim search with caching and a replaceable provider adapter. Nominatim supports free-form and structured address search. [Nominatim search API](https://nominatim.org/release-docs/latest/api/Search/)
- **Do not build client-side autocomplete against the public Nominatim endpoint.** Its public policy caps use at 1 request/second, asks apps to proxy/cache and remain switchable, and explicitly forbids client-side autocomplete. [OSMF Nominatim usage policy](https://operations.osmfoundation.org/policies/nominatim/)
- **Do not send exact home addresses to the public Nominatim service.** Its policy says not to submit personal or confidential material. Private-home geocoding should use a Huddle-controlled/self-hosted service, or browser location plus an on-device pin confirmation that does not disclose the typed address to a public third party.
- **Attribution is mandatory.** Show “© OpenStreetMap contributors” near the map/address results and link to the license/copyright page. [OpenStreetMap attribution guide](https://www.openstreetmap.org/copyright/attribution-guide/)

For Huddle's course scope, the practical choice is a provider-neutral server route with an interface such as `searchAddress(query, city, countryCode)` and `reverseGeocode(lat, lon)`, backed initially by a rate-limited/cached service. This preserves the existing architecture principle that providers do not define product identity and makes later self-hosting possible.

## Proposed information architecture

### Home

- Next event
- Needs your attention (with counts)
- Recent invitations/requests
- One concise suggestion to discover something new

### Explore

- Events
- Fixtures
- Groups
- Venues
- Never show objects the viewer already owns as discovery results

### My Huddle

- Events: Hosting, Attending, Pending, Archived
- Groups: Owned/Admin, Member, Applying, Archived
- Venues: Owned, Following
- Saved/Following: Teams, competitions, venues

### Venue workspace

- Dashboard: today's/next event, needs attention, and venue status
- Calendar: Draft, Published, Full, Cancelled, and Completed events
- Fixture planner: select several future fixtures and create event drafts in one pass
- Events: quick editing with venue-owned defaults prefilled and only event-specific overrides requested
- Venue profile: public address/map, standard description, normal capacity, screens, house information, and attendance defaults
- Audience: followers and lightweight attendance summaries
- Account boundary: no friendships, private groups, or private-host tools inside the venue workspace

### People

- Search and recommendations
- Friends
- Incoming/sent requests
- Contextual invite/add actions

### Object pages

- Overview first
- Role-aware primary action
- Related objects linked
- Manage only when authorized
- History collapsed and secondary

## Implementation order for the next run

1. **Separate fan and venue work:** introduce a dedicated venue business workspace and dashboard; remove venue creation from ordinary Fan mode; migrate existing venue ownership safely.
2. **Fix information architecture:** venue directory; Home versus My Huddle; Explore exclusions; role-aware event states.
3. **Create one task inbox:** aggregate invitations, applications, friend requests, attendance, and group event reviews.
4. **Collapse historical residue:** current effective state in primary lists; archived/history filters for retained records.
5. **Rebuild event creation:** real persisted steps, searchable fixture, address geocoding, review/confirmation; prefill venue-hosted events from venue defaults.
6. **Add venue planning:** calendar/list management and a multi-fixture draft planner for future events.
7. **Rebuild invitations and group activation:** inline people picker, honest CTAs, actionable readiness list, eliminate self-review.
8. **Simplify product language:** remove course/database/provider language; consolidate statuses and badges.
9. **Accessibility/mobile pass:** current navigation state, touch targets, focus, tab behavior, and keyboard journeys.
10. **Finish catalog trust:** season coverage horizon and truthful freshness/completeness messaging.

## Acceptance criteria for the redesign

- A new user can explain the difference between Home, Explore, and My Huddle after one visit.
- Every created event, group, and venue is recoverable in two clicks or fewer.
- Fan accounts cannot create or manage venues; venue creation and commercial event publishing require an authorized Venue workspace.
- A venue operator lands on a dedicated dashboard showing upcoming events, drafts, status, and tasks requiring attention.
- Venue-hosted event creation reuses the venue's address, description, normal capacity, screens, and operating defaults instead of requesting them again.
- A venue operator can select multiple future fixtures and create reviewable event drafts without completing the full form repeatedly.
- Discover never shows an object the viewer owns; invite-only objects arrive through invitation/ownership surfaces.
- No ordinary form exposes latitude or longitude.
- Invite a person to an event without leaving the event page or memorizing a handle.
- A group owner sees an exact list of remaining activation tasks and a usable way to recruit members.
- No user is required to approve their own submission.
- Cancelled, declined, left, and removed records are absent from active lists but remain available in authorized history.
- Event creation survives refresh/back/navigation and ends on the saved event with explicit confirmation.
- Fixtures communicate both data freshness and coverage horizon.
- Mobile primary navigation has at most five stable destinations, a visible current state, and appropriately sized targets.
- Product pages contain no milestone, course, database, provider-storage, or synchronization jargon.

## Local redesign verification appendix — 2026-08-30

The original production observations above remain unchanged as historical evidence. The dedicated
local redesign branch now maps all F01–F40 findings to passing automated and/or browser evidence in
[`docs/evidence/ux-redesign/README.md`](./evidence/ux-redesign/README.md).

The bounded re-audit used two local accounts and the complete Fan/Venue journey at 1280, 768, and
375 px. It covered onboarding, Home, Explore, My Huddle, People, groups, Fan events, Venue Today,
Calendar, Events, planning, settings, public object pages, Account, interests, Safety, recovery,
keyboard interaction, target size, overflow, and console state. The final visual correction
confirmed one compact Explore search editor, an attributed public Venue/place map with real tiles
and pins, the full Huddle wordmark fixed left, workspace identity fixed right, and Plan events as a
contextual Venue action. No unresolved Critical or Important UX finding remained in that local
scope.

This appendix does not claim a hosted migration or production re-audit. The final local
`npm run test:acceptance` run passed 146 Vitest files / 717 tests, 34 pgTAP files / 1559 assertions,
the production build, security and diff checks, and all 22 Playwright scenarios. Publication and
hosted rollout remain separately evidenced operations.
