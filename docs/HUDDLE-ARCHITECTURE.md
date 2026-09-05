# Huddle: Product and Architecture Vision

**Document purpose:** explain what Huddle is, how its main pieces fit together, and why this is the right-sized architecture for the course project.

**Status:** implementation plan, not a claim that the application already exists.

**Pilot:** Israel, English interface, football first

**Default display time zone:** Israel time (implemented with the canonical IANA identifier `Asia/Jerusalem` for daylight-saving correctness)

**Required delivery stack:** Next.js, TypeScript, Supabase, and Vercel

**Approved submission-polish revision:** 4 September 2026; merged through [PR #58](https://github.com/gethuddle/huddle/pull/58) as [`9a485916`](https://github.com/gethuddle/huddle/commit/9a4859168201589da3d3ab2a743ab163cc620a58) and deployed after [passing local acceptance](./evidence/submission-hardening/ACCEPTANCE.md) and required CI. Venue setup allocates a hyphenated Huddle URL from the business name, with atomic numeric collision suffixes; only settings expose an optional editable Huddle URL with live availability hints. Fan handle fields provide equivalent exact-match hints while database uniqueness stays authoritative. Account Security retains password changes and adds current-password-reauthenticated email changes through Supabase's secure old/new-address confirmation. No real payments, provider-setting bypass, or email-account enumeration is authorized. Both maps use installed-version worker/shared assets prepared locally before build/dev; no CDN or location-policy change is introduced.

**Approved post-B12 revision:** 30 August 2026. Huddle now has separately authorized Fan and Venue workspaces behind one Supabase login. This deliberately supersedes the B01–B12 assumptions that every completed personal profile may create a venue, that every group-organized event must wait for a separate owner/admin review, and that every venue listing needs a capacity-backed guest list. Historical milestone evidence remains a record of the merged baseline, not the current permission contract.

**Approved discovery consistency revision:** 31 August 2026. Searchable groups need an active owner and a useful description, not manufactured membership/activity quotas. Eligible signed-in Fans can discover public-place events from those groups and then apply before attending; home events stay member-only. Fan Explore includes public listings from Venues the same person manages, fixture pages list every event visible to the current viewer, and owner-facing group deletion is an audited archive that retains safety history.

**Approved cityless location and catalog revision:** 31 August 2026. Public discovery starts from a browser coordinate or OpenStreetMap-backed address suggestion and ranks eligible results by distance across municipal borders. Profiles and groups store no location; groups are global communities ordered by active-member count. Events and venues use confirmed addresses and coordinates, including protected home coordinates. Scheduled football-data synchronization may retain a strictly allowlisted provider crest URL, while Huddle initials remain the resilient accessible fallback.

**Approved AI-assisted discovery revision:** 1 September 2026, with the Ask/navigation/date/location follow-up approved 2 September 2026. An active Fan may describe the desired fixture, timing, public place, relationship, venue type, or venue facility in one sentence on the dedicated Ask route. Cloudflare extracts only a bounded intent. Huddle deterministically resolves dates and public-place coordinates, while its local catalog and authenticated PostgreSQL boundary authorize, filter, and rank the results; private account context never enters the model.

**Approved account-erasure revision:** 3 September 2026. Account Security now covers both known-password changes and immediate, irreversible self-service deletion. The flow requires current-password reauthentication and exact `DELETE`, atomically removes identity/private state while retaining only required pseudonymous history, and uses a tightly isolated server-only Supabase Auth soft deletion after database preparation. `VB01` supersedes that final direct preparation-to-Auth ordering for billing-aware V2 erasure: Polar customer anonymization/local cleanup must complete first, while legacy V1 remains fail-closed. The account-erasure migration and matching application release were verified in production on 4 September 2026.

**Approved `VB01` revision:** 3 September 2026. Commercial venues become public and may publish only after a per-venue Polar Sandbox entitlement. Tasks 1–10 passed isolated local acceptance; the authorized hosted happy path passed on 4 September 2026 with two independent subscriptions and one distant demo event. The [acceptance record](./evidence/vb01/ACCEPTANCE.md) separates deployed evidence from remaining hosted lifecycle drills and broader B13 acceptance. No real payments are enabled.

The source of truth for the course deliverables is the local-only official project brief
(`course-roadmap/project instructions.pdf`). The local-only course roadmap is a wider
technology menu, not a requirement to use every tool mentioned in the lectures. Neither
course source is published in this repository.

---

## 1. The product in one sentence

Huddle helps sports fans find trustworthy people and places nearby that are watching the same match, then lets them safely request a place, host a gathering, or publish a venue event.

## 2. Problem, users, customer, and value

Sports are social, but fans often do not know who nearby follows the same team or which venue will show a particular match. This is especially painful for people who are new to a city, support a foreign club, or follow a less popular competition.

Huddle answers: **“Who near me is watching this match, and where may I join them?”**

| Person | Need | Huddle's value |
|---|---|---|
| Fan | Find a suitable gathering for a match | A personalized, location-aware list connected to followed teams and competitions |
| Private host | Bring trusted people together without publishing a home address | Controlled audiences, approval, invitations, capacity, and protected location details |
| Supporter-group member | Build a lasting local community | Searchable or unlisted groups, membership approval, roles, and group events |
| Group administrator | Keep a group relevant and safe | Applications, invitations, event review, moderation, and bans |
| Venue owner | Reach the exact supporters likely to attend | A reusable venue profile, fixture-first batch planner, open-door listings, optional reservations, and followers |
| Platform moderator | Handle serious abuse without running every community | Reports, suspensions, and an audit trail |

The users are fans, hosts, group members/admins, and venue operators. A human may activate either or both workspaces, but each workspace is independently authorized. The future paying customer is the commercial venue. Ordinary fans, friendships, social/team-linked groups, and private hosting remain free.

### Business model boundary

Fans, friendships, supporter groups, RSVP, and private hosting stay free. `VB01` adds exactly one Sandbox-only recurring entitlement **per venue**: ₪15 monthly or ₪150 yearly, with no tiers, trial, promotions, tickets, real money, or production-payment switch. A commonly eligible operator may activate Venue without publishing a Fan identity, but now creates a private, visibly **Unverified** draft plus owner membership and inactive entitlement—not a public business listing. The journey is `venue details → hidden draft → owner checkout → verified webhook → public venue`.

Membership answers who operates a venue; entitlement answers whether that venue may be public or publish. Owners and admins run ordinary venue/event work, while only the exact owner can start checkout, open the portal, or manage cancellation. Payment is never business verification: the truthful attestation and persistent **Unverified** label remain independent. Fans never see billing state or provider copy; they see normal availability or the neutral cancellation outcome. The full normative state/capability, participant, cache, grace, cancellation, and erasure rules are [implementation specification §2.8](./HUDDLE-IMPLEMENTATION-SPEC.md#28-commercial-boundary-and-vb01-venue-entitlement); the approved provider binding and implementation design is [the Polar design](./superpowers/specs/2026-09-03-polar-venue-subscriptions-design.md).

The fail-closed lifecycle is intentionally about venue publication, not social access: `payment_required`/`confirming` are hidden drafts; `active` is public; `canceling` limits events at or after the paid end; `past_due`, `provider_stale`, and `legacy_grace` before its fixed cutover deadline hide immediately but preserve limited management and existing-participant access for seven days; `expired` retains only history/recovery. Expiry cancels future published events without deleting drafts, attendance, invitations, audit history, or past/started events, and recovery never resurrects cancelled rows. Promotion still cannot bypass distance, audience, privacy, moderation, or match relevance rules.

---

## 3. Submitted MVP and future product

### Submitted MVP

- Email/password authentication, common safety eligibility, optional Fan activation, and locally accepted `VB01` self-serve hidden-draft Venue activation with a verified hosted Sandbox happy path; broader B13 acceptance remains pending.
- Immediate self-service account erasure with explicit removed/retained-data disclosure and no recovery window.
- Public browsing of information that is safe to expose.
- A football catalog and synchronized future fixtures.
- Follows for sports, competitions, teams, and venues.
- Mutual friendships, with no friends-of-friends access.
- Discoverable and unlisted groups, with optional team association.
- Group applications, roles, bans, invite links, atomic owner/admin-authored event publication, and review of ordinary-member submissions by a different current owner/admin.
- Fan-hosted events restricted to group, friend, or invite-only audiences.
- Venue-hosted events using public or team-follower audiences; public listings may be open-door with no Huddle reservation or guest list.
- Session-origin discovery from browser location or a confirmed address using PostGIS distance ranking.
- One-shot AI-assisted Ask discovery that returns up to three authorized events in a chat-shaped, single-exchange UI without conversational context or model-written content.
- Attendance request, approval, decline, host removal, leave, and capacity flows; no unregistered plus-one guests.
- A standards-based `.ics` calendar download.
- Minimal reports and platform moderation.
- Automated tests, CI, a Vercel deployment, and a Supabase database.

### Explicitly later

- chat, live threads, and realtime messaging;
- notifications and reminders;
- numeric reputation or endorsement scores;
- friends-of-friends visibility;
- live scores and NBA integration;
- route planning and paid address autocomplete beyond the implemented Photon/OpenStreetMap search and public-event map;
- Google Calendar OAuth;
- real-money/production payments, Stripe, ticketing, menus, offers, analytics, or promoted ranking;
- ratings, generative recommendations, automatic event creation, and AI moderation.

This boundary keeps the submission small enough to explain and test while preserving the full core loop: **follow → discover → request/join → host/manage**.

---

## 4. System at a glance

```mermaid
flowchart LR
    Person[Fan, host, group admin,<br/>venue owner]
    Browser[Browser UI<br/>React + Tailwind + shadcn/Radix]

    subgraph Vercel[Vercel]
        Next[Next.js App Router<br/>Server Components]
        Mutations[Server Actions<br/>business mutations]
        Routes[Route Handlers<br/>discovery, sync, ICS]
    end

    subgraph Supabase[Supabase]
        Auth[Auth<br/>email/password + SSR cookies]
        DB[(PostgreSQL<br/>RLS + PostGIS)]
        Cron[Supabase Cron + pg_net]
        Vault[Vault<br/>sync secret]
    end

    Provider[football-data.org v4]
    AI[Cloudflare Workers AI<br/>bounded intent only]
    CI[GitHub Actions<br/>quality and test gates]

    Person --> Browser
    Browser --> Next
    Browser --> Mutations
    Browser --> Routes
    Next --> Auth
    Mutations --> Auth
    Next --> DB
    Mutations --> DB
    Routes --> DB
    Cron -->|protected call every 6 hours| Routes
    Vault --> Cron
    Routes -->|server-only token| Provider
    Routes -->|sentence + Israel time only| AI
    CI -->|verified deployment| Vercel
    CI -->|migrations + tests| Supabase
```

### Normal request flow

1. The browser requests a page from Next.js.
2. A Server Component reads the signed-in session when needed and queries safe data from Supabase.
3. Supabase Row Level Security (RLS) independently checks which rows that user may read.
4. The server renders the initial page. Interactive filters and forms then run in small Client Components.
5. A mutation goes through a Server Action, which validates the input with Zod and applies the business transition.
6. Discovery JSON, sports synchronization, and calendar files use narrow Route Handlers.

There is no second Express application. Next.js is both the web frontend and the application backend.

### Sports-data flow

1. Supabase Cron calls a protected synchronization route every six hours.
2. The route calls football-data.org using a server-only token.
3. Provider responses are validated, normalized, and upserted into PostgreSQL.
4. Normal page requests read the local catalog; they never wait for the external provider.
5. If synchronization fails, cached fixtures remain usable and are marked stale.

---

## 5. The product blocks

### 5.1 Authentication and profiles

Supabase Auth owns passwords, email verification, and cookie-based sessions. Huddle owns the one-to-one human trust record: adult attestation, community-rules acceptance, suspension state, and optional public Fan identity. The course MVP is 18+; it records the attestation time rather than collecting a full birth date.

Password recovery stays inside the same boundary. Signup and recovery requests always return a generic, non-enumerating result. Branded emails place the bounded token hash after `#`, so the initial passive GET and mail scanners cannot consume it or send it to server logs. The browser removes the fragment and an explicit same-origin POST switches any ambient local session, verifies the credential, and issues a five-minute HMAC grant bound to the resulting Supabase user and session. Opaque PKCE exchanges are accepted only when Supabase's redirect purpose matches the verification or recovery boundary. Only the recovery grant can open or submit the recovery form; ordinary signed-in sessions use Account Security and must reauthenticate with the current password. A completed password replacement requests global session revocation, always clears local cookies and Huddle tab state, and emits a password-changed notification; if global revocation cannot be confirmed, sign in explains that honestly instead of presenting the irreversible update as a failure. Huddle never looks up, stores, or logs password material itself. Optional Cloudflare Turnstile gates the three public credential-entry forms and is verified server-side before Supabase is called.

Account Security also contains a separate deletion Danger zone. Its dialog explains what is removed and what pseudonymous history remains, then requires a bounded current password and exact uppercase `DELETE`. A Server Action resolves the current SSR user, reauthenticates that exact same email/user pair, invokes the authenticated product-data preparation RPC, and only then calls `auth.admin.deleteUser(user.id, true)` through the existing `server-only` service-role client. The soft-delete flag removes Auth identities and sessions while leaving a sanitized, non-reversible Auth tombstone for foreign-key history; Huddle retains neither the email nor an email digest. Success clears Supabase, recovery, and workspace cookies, sets a short-lived host-only HttpOnly completion marker, and returns to isolated sign in. That marker—not the forgeable status query—allows a client boundary to clear every namespaced Huddle `sessionStorage` value while preserving unrelated tab state; a narrow Server Action consumes it only after the browser verifies cleanup, so a blocked storage API can retry and later anonymous state survives after success. Ordinary sign-out guarantees local cookie clearing and redirect even when provider logout transport fails, and uses the same one-time cleanup mechanism on Home. A provider failure after database preparation exposes only a generic retryable error and leaves the profile erased and ineligible while the same live session can retry.

The product-data transaction cancels future live activity hosted directly or through owned groups/Venues; archives those owned objects instead of transferring them; leaves current attendance as retained `left` history; revokes pending invitations and only still-active invite tokens; deletes follows, relationships, blocks, roles/counters, drafts, and exact hosted-home locations; clears every group-membership application message; and replaces the public identity with `Deleted account` plus `deleted_at`. Required owner rows remain attached only to archived objects. Historical attendance, membership lifecycle, authorship, reports, moderation, appeals, and audit rows retain the profile UUID without the former identity or application prose.

Erasure and ordinary actor mutations share one canonical database serialization boundary, including subscription and Venue-follow writes. An idempotent retry reruns cleanup but never duplicates the preparation audit. The exact-location guards have only a narrow exception after the direct host is tombstoned in the erasure transaction; normal live-home invariants remain intact. Because a previously issued JWT may outlive Auth deletion, central mutation gates and direct RLS reads of retained group/Venue membership, invitation, and attendance history all require a non-deleted profile. The erased user can read only their sanitized own-profile tombstone and cannot reactivate it.

Common safety eligibility means verified email, adult attestation, current community-rules acceptance, and a non-suspended account. Fan activation is optional and adds a public display name and unique handle; it stores no city or default location. Following, attendance, friendships, groups, and private hosting require Fan activation. Venue-only onboarding may satisfy common safety eligibility while leaving Fan identity fields incomplete and non-public; commercial venue mutations require active Venue membership instead of an invented Fan identity.

This is the first trust layer. It is deliberately simple: no social login in the MVP and no application-managed password table.

### 5.2 Football catalog and fixture synchronization

Huddle stores provider-independent records for sports, competitions, teams, and matches. The first adapter uses [football-data.org v4](https://www.football-data.org/documentation/quickstart). The free plan is suitable for a football-first course pilot, but its token and rate limit make local caching essential.

Provider IDs are integration details, not Huddle's public identity. A future NBA adapter can produce the same normalized competition/team/fixture shapes without changing events or discovery.

Required provider attribution appears in the footer and data-sources page. The scheduled adapter may retain the provider's HTTPS crest URL from its dedicated crest host. Product pages use that cached URL without a page-time provider API call, identify it as provider-supplied rather than Huddle-owned, and fall back to Huddle's text-initial mark whenever it is missing or cannot load.

### 5.3 Follows

A user can follow a sport, competition, team, or venue. Follows shape the discovery feed and are also an eligibility rule for a business venue's `team_followers` event. They do not let a private person publish to strangers and never grant private-address access.

The database prevents duplicate follows. Unfollowing changes future personalization but does not silently remove an already approved attendance record.

### 5.4 Friendships

Friendship is mutual. One user requests; the other accepts or declines. Only an accepted friendship grants visibility to a friends-only event. There is no friends-of-friends expansion because it would make privacy difficult to explain and enforce.

Blocking is immediate and does not require a report or moderator. It removes any friendship, prevents new friend requests and direct invitations, and hides future private events hosted by either person from the other. If the blocked relationship includes attendance at a future home event hosted by either person, attendance and future address access are revoked. A shared supporter-group membership is not automatically deleted; the affected user can also report the behavior or ask group admins to act. Huddle does not tell the blocked user who blocked them.

### 5.5 Groups

Groups are stronger community boundaries than friendships. A group may optionally identify with one team, but it may also represent a general/private social circle. Product-wide navigation therefore calls the complete domain **Groups**. A group may be:

- **discoverable** — eventually appears in search, but joining always needs an application and admin review;
- **unlisted** — does not appear in global search and is reached using a revocable invite link; the link still does not bypass admin approval.

A new discoverable group begins in `forming`. It enters global search as soon as its owner remains active and it has a clear description. Members, additional admins, rules, events, and an optional team association enrich the community but do not gate search or membership. During creation, Huddle shows similar optional team-linked groups to discourage duplicates without giving the platform a routine approval bottleneck. Groups carry no city, address, coordinate, locality mode, or geographic membership boundary.

Roles are `owner`, `admin`, and `member`. An event authored by a current owner/admin publishes atomically without self-review. An ordinary member may submit an event, but it remains pending until a current owner/admin whose user ID differs from the creator publishes or rejects it. Promoting the author after submission never permits self-approval or self-rejection. Admins may remove a member without banning them, or use the separate durable Ban action for a safety boundary. They may also invite one registered Fan directly; only that recipient can accept or decline. A reusable unlisted-group link remains a separate expiring, revocable application route. The owner may delete the live group through an audited archival transition that cancels future live group events and revokes usable invites without erasing membership or attendance history. Platform staff step in for reports and suspensions rather than operating every group.

### 5.6 Venue workspaces and profiles

A commonly eligible venue operator can self-serve activation with venue information and a truthful business-representation attestation. Under `VB01`, activation atomically creates a private Unverified venue draft, one active owner membership, its Venue workspace, and an inactive entitlement; it does not activate or publish a Fan identity. Owner/admin membership authorizes normal internal operations, while the entitlement separately controls public existence, discovery, and publishing. Only the exact owner may perform billing actions; admins retain operational actions but cannot invoke checkout or the billing portal. Venue follows allow active Fans to track future listings only while the venue is entitled to be public.

The active owner may close the live venue through an audited archive transition. Closing removes the venue and workspace from live product reads, cancels future live venue events, revokes usable invitations, and prevents new commercial mutations without erasing membership, attendance, moderation, or security history. Archival is distinct from platform suspension and never rewrites verification status.

Calendar and Events retrieve retained Venue history in server-filtered 20-row pages rather than loading a fixed oldest slice. They share the read-time event-history status projection, so elapsed published events appear as Completed consistently without rewriting stored lifecycle state. Strict current-Venue return links preserve the selected status/page through detail and editing.

The **Unverified** label is always visible in the course MVP. It must not imply that Huddle has checked ownership, licensing, safety, or accessibility. Polar Sandbox entitlement never changes that label and is not business verification.

### 5.7 Events and audiences

An event attaches to a real fixture when possible; fixture kickoff is inherited rather than re-entered. It has a host, place type, attendance mode, and exactly one audience policy. Reservation events also have a capacity and approval rule. The host type determines which audiences are even available:

| Host type | Allowed audiences | Meaning |
|---|---|---|
| Private person | `group` | Active, non-banned members may request; eligible signed-in Fans may preview a public-place event from an active discoverable group and apply before attending |
| Private person | `friends` | Only the host's accepted direct friends may see and request |
| Private person | `invite_only` | Only explicitly invited Huddle members may see and accept; a secure event-invite token may create that targeted invitation after an eligible account redeems it |
| Business venue | `public` | Everyone may see; open-door listings have no Huddle attendance state, while reservations accept eligible active Fans |
| Business venue | `team_followers` | Everyone may see; attendance requires an active Fan who follows the selected team unless directly invited |

This is a host rule, not a location rule. A private person using a café or other public place is still limited to group, friends, or invite-only. A discoverable group's public-place event can introduce an eligible signed-in Fan to that group, but it never becomes anonymous/public attendance and the Fan must join before requesting a place. A private host can never publish to all strangers or all followers of a team. Conversely, a business venue does not use private friendship/group audiences in the submitted MVP.

A public venue chooses `open_door` or `reservations` per event, with a reusable venue default. Open door means the venue is advertising that it will show the fixture: fans simply come along, Huddle does not reserve admission, and the product shows no capacity, RSVP, invitation, approval queue, or attendee history. Reservations keep the existing one-account-per-place model. Team-follower and all private events remain reservations.

An invite-only event's ordinary URL is not an access capability. A host may select registered people directly or create a high-entropy, expiring, revocable, usage-limited invite link. The link requires sign-in and eligibility, then creates a pending targeted invitation; the recipient still chooses Accept or Decline, and only acceptance reserves capacity. Huddle stores only the token digest and never logs or re-displays the plaintext after creation.

Fixtures are catalog data inside **Explore**, not a competing primary destination. Explore lets a visitor choose area, date/range, team, competition, or a specific fixture and then answers who is showing it nearby. Stable fixture object URLs remain for sharing and detail, while the `/matches` index redirects to Explore and preserves one navigation mental model.

### 5.8 Home-location safety

An exact home address and coordinate are stored separately from the public event row. Before approval, an eligible person can see only a safe coarse distance summary, not the address or coordinate. Friendship or group membership alone never reveals the address. Home events have a hard MVP capacity limit of 12 registered Huddle attendees; there are no unregistered guests or plus-ones.

For a normal home-event request, the host must approve attendance before a protected database function returns the exact location. A directly invited user is pre-approved when they accept the invitation. Leaving, host removal, blocking, event cancellation, account suspension, or a group ban that removes eligibility revokes future address reads. Access to a private location is logged, but Huddle clearly warns that it cannot make a person forget or delete an address already viewed.

After the first attendee approval, a host cannot change the event's host type, audience, place kind, or home address. A material change requires cancellation and creation of a new event so every attendee makes a fresh consent decision.

Account erasure first tombstones the direct host and then deletes that host's exact location. The database permits that one tombstoned-host deletion even when the cancelled event and approved-attendance history remain; it still rejects deleting or materially changing an ordinary non-erased home event's location.

### 5.9 Attendance and capacity

Reservation-mode venue events normally allow immediate Fan attendance, although their host can require approval. Private-person events require host approval unless the attendee was directly invited. A venue is never an attendee and never consumes capacity. The same human may attend only through a separately activated Fan identity, where one account still reserves exactly one place.

Pending requests do not consume capacity. Approval is one atomic database operation: lock the event, confirm permissions and eligibility, count approved attendees, check capacity, and update the record. This prevents two simultaneous approvals from taking the final seat. A host may remove an attendee; an attendee may leave at any time. Both transitions retain history and revoke private-location access. Cancellation retains all attendance records. Because `left` is retained history rather than current participation, an otherwise actionable event returns to Explore and general Ask results after leaving; requested, approved, declined, removed, and currently invited states remain outside acquisition results.

“RSVP” is the general response to an invitation or event. In Huddle, that response is represented explicitly as requested, approved, declined, left, or removed instead of being a vague counter. One account reserves exactly one place.

Open-door venue listings deliberately do not use that RSVP state machine. Database constraints require public venue hosting, null capacity, and no approval, while controlled functions reject invitation and attendance mutations. Discovery keeps these listings visible with explicit “no reservation” copy and never fabricates remaining places or a guest list.

### 5.10 Location-aware discovery

Fan onboarding stores no location. Explore first requests a browser coordinate and, when that is denied or unwanted, accepts a session-scoped confirmed Israel address from the OpenStreetMap-backed suggestion service. The same confirmed-address interaction is reused for public places, venues, and protected home meeting points. Only the selected origin coordinate reaches discovery, in a private no-store request body rather than the URL or profile. PostGIS filters and ranks eligible events across municipal borders without returning a protected home coordinate or address.

The feed combines location, future time, followed interests, audience eligibility, match, and event status. It also merges and deduplicates public listings from Venues managed by the current Fan account, so switching workspaces does not make the person's own published event disappear. Fixture details use the same visibility boundary to list the watch events attached to that match. Results use cursor pagination so a larger catalog does not require loading or re-counting every earlier row.

### 5.10.1 AI-assisted discovery

The active Fan Ask route presents a full-height chat-shaped one-shot search, not a persistent chatbot or nested popup. Repository-owned shadcn `MessageScroller`, `Message`, `Bubble`, `Marker`, `InputGroup`, and `Card` primitives provide the edge-to-edge conversation canvas, anchored response flow, status treatment, two-row docked composer, and separately bordered result tickets; each ticket keeps safe event facts in a phone-dense header/body/footer composition. The UI holds one current question and answer in local React state, a new question replaces the old exchange, and route unmount clears it. A Vercel Route Handler sends only the bounded sentence and current Israel date/time to Cloudflare Workers AI in JSON-schema mode. The provider returns text mentions and intent categories, never database IDs, coordinates, or authorized results. Huddle validates that response, applies deterministic Israel-calendar rules, resolves sports aliases against the locally synchronized catalog, and calls one Fan-only Supabase function through the ordinary request session. The 14-day range is only a date-free default; dates, weekdays, named months, and bounded explicit ranges are resolved locally, while unresolved date-like text asks for clarification.

General discovery requires the same 15 km session origin as Explore. Friend-host and current-group lookups may work nationally unless proximity was requested. When the sentence names a public Israel place, Huddle verifies that the extracted phrase came from the sentence, ignores any remembered origin, and resolves the first bounded Israel suggestion through its server-side Photon/OpenStreetMap adapter. That coordinate immediately reaches the existing discovery search; an unresolved place clarifies and a provider failure never broadens the query. The phrase stays out of client URLs, Huddle logs, tokens, caches, and tables. The database checks accepted friendship, active group membership, current event visibility, blocks, bans, suspension, capacity, venue facilities, and the current viewer's own event state before returning at most three rows. Exact home addresses and coordinates never enter this result shape. Cloudflare never receives the actor, friend/group lists, origin, attendance, events, results, or protected locations.

The model does not answer the user, call tools, access a vector store, or rank rows. Huddle produces the interpretation chips, match reasons, empty state, and Explore/Plan actions from validated application data. Missing location uses a short-lived actor-bound signed intent so adding the origin does not trigger a second inference. Invalid output, ambiguity, timeout, rate exhaustion, or provider failure fails closed without broadening the search.

### 5.11 Calendar export

An event page offers an RFC 5545 `.ics` download. It works with many calendar products and needs no Google account or OAuth integration. The export includes the exact home location only if the requesting user is the host or a currently authorized approved attendee; leaving, removal, blocking, banning, suspension, or cancellation removes it from future downloads.

### 5.12 Community rules, reports, and moderation

Every commonly eligible account accepts short, readable rules. They prohibit threats and planned fights; harassment, stalking, sexual misconduct, hate and discriminatory abuse; doxxing or sharing a home address; impersonation and venue fraud; scams, illegal goods, weapons, and dangerous activity; ban/block evasion; unapproved guests; and hidden commercial charges or affiliations. Team rivalry is never an excuse to threaten or target people.

Each event must honestly identify its host, location type, expected activity, costs, rules, and commercial affiliation. A named host or venue contact must be physically present. Application/request notes must not solicit sensitive information such as an address, phone number, financial data, health data, or full legal identity.

Users can block immediately and can report an event, group, venue, or profile before or after an event. Categories are immediate danger, harassment/stalking/sexual misconduct, hate/discrimination, privacy exposure, impersonation/fraud, dangerous or illegal activity, spam/scam, and other rule violation. Reporter identity is hidden from the reported person. Huddle is not an emergency service; imminent danger guidance points users to local emergency services.

Platform moderators use a private queue and proportional enforcement: content correction/removal, warning, feature restriction, temporary suspension, event cancellation or group/venue suspension, and permanent account ban for severe or repeated violations. Group administrators handle membership and group bans; they cannot resolve platform reports. Users receive a reason and may request an appeal/review.

Important decisions—attendance approval/removal, group approval, bans, moderation, appeals, and private-location reads—produce audit records without storing the exact address in the log.

### 5.13 Testing and delivery

The testing pyramid matches the risks:

- pgTAP verifies host/audience constraints, common safety and workspace gates, RLS, address revocation, roles, blocks, bans, capacity concurrency, and account-erasure cleanup/stale-session/concurrency boundaries;
- Vitest verifies domain rules, Zod schemas, provider normalization, calendar output, and account-erasure action ordering/failure behavior;
- React Testing Library verifies forms, permission-aware controls, accessible UI states, and the destructive account dialog;
- Playwright verifies complete user journeys in a browser;
- GitHub Actions runs formatting, linting, types, tests, a local Supabase reset, the production build, and end-to-end tests.

Vercel hosts Next.js. Supabase hosts Auth and PostgreSQL/PostGIS. SQL migrations and seed data must reproduce the local project before a change may be deployed.

### 5.14 Basic scale

The MVP is a modular monolith designed for tens or hundreds of active users, with a clear growth path:

- fixtures are synchronized once and served locally;
- spatial and B-tree indexes match discovery and authorization queries;
- every large list is paginated;
- Server Components avoid unnecessary client waterfalls;
- database functions combine complex reads and atomic transitions;
- stable public catalog data may use short Next.js cache windows;
- provider failures do not take down user-facing pages.

If measurement later justifies it, add Redis for shared rate limits/cache, a queue for notifications and provider jobs, read replicas, dedicated search, paid hosting tiers, and a separate service only for a proven workload. These are growth steps, not launch dependencies.

---

## 6. Course technologies used deliberately

| Concern | Selected tool | Why it belongs in Huddle |
|---|---|---|
| Full-stack web | Next.js App Router + React | Required framework-compatible frontend and backend in one deployable app |
| Language | Strict TypeScript | Shared types and safer refactoring across UI, server, and provider adapters |
| UI | Tailwind CSS + repository-owned shadcn/Radix components | Branded reusable controls plus accessible primitives whose source stays in the repository |
| Server state | TanStack Query, narrowly | Interactive discovery pagination and attendance mutations benefit from cache/invalidation |
| Local UI state | React state | Forms and dialogs do not justify another global-state dependency |
| Validation | Zod | Untrusted form, URL, environment, and provider data need runtime checking |
| Database | Supabase PostgreSQL | Required managed relational database and a natural fit for connected social data |
| Authorization | Supabase RLS | Enforces row access at the data boundary as well as in application code |
| Geography | PostGIS | Indexed nearby-event and nearby-venue queries |
| Auth | Supabase Auth SSR | Verified email/password and secure cookie sessions without storing passwords ourselves |
| Tests | Vitest, RTL, Playwright, pgTAP | Covers domain code, components, browser journeys, and database security |
| CI/deploy | GitHub Actions + Vercel + Supabase | Matches the course's quality and deployment requirements |

The lectures also teach Express, Prisma, Redis, Zustand, Socket.IO, queues, payments, AI, and microservices. Learning a tool does not mean adding it where the product has no current need.

---

## 7. Decisions to keep the MVP understandable

| Not used initially | Reason | Add only when… |
|---|---|---|
| Separate Express server | Next.js already supplies Server Components, Actions, and Route Handlers; a second runtime adds deployment and auth complexity | A measured workload needs an independently deployed service |
| Prisma | Supabase SQL migrations, RLS policies, PostGIS functions, and generated DB types are clearer when PostgreSQL remains visible | The team later accepts the abstraction cost for a proven ORM benefit |
| Redis | Indexed PostgreSQL, local fixture caching, and Next.js caching are enough for course scale | Shared rate limiting, high read load, distributed cache, or queues are measured needs |
| Zustand | Form/dialog state is local, and server state belongs in TanStack Query | Multiple distant client components truly share complex client-only state |
| Cloudflare Kumo | It would introduce a second Base UI design system and semantic-token layer beside Huddle's approved Radix and brand-token architecture | A separately approved redesign deliberately replaces the current component system |
| Socket.IO/WebSockets | No chat, live scores, or realtime collaboration is in the MVP | A real realtime feature is accepted into scope |
| Real payments/Stripe | Real payment processing remains deferred and must not be simulated insecurely | A separately approved production-payment review covers law, tax, refunds, merchant-of-record, support, and security |
| AI agents, RAG, and generated recommendations | The accepted AI seam only extracts bounded intent; authorization and ranking stay deterministic | A separately approved use case proves it needs private context or generative output safely |
| Microservices | A modular monolith is simpler to test, deploy, and explain | Scale or ownership boundaries justify operational separation |

---

## 8. Implementation path

Each phase should finish with working tests and updated documentation before the next phase begins.

### Phase 1 — Foundation and database

- Scaffold Next.js with strict TypeScript, Tailwind, linting, and formatting.
- Start local Supabase and create migrations, seed strategy, PostGIS, RLS defaults, and generated types.
- Establish feature folders, environment validation, CI, and error/result conventions.

**Exit:** a clean build, reproducible database reset, initial RLS tests, and CI.

### Phase 2 — Authentication and onboarding

- Implement email/password signup, verification, non-enumerating password recovery, sign-in/out, SSR sessions, immediate current-password-confirmed account erasure, common safety eligibility, optional Fan activation without a saved location, self-serve Venue activation with a confirmed public address, and protected actions.
- Add safe public profile projection, account blocks, and authorization tests.

**Exit:** a verified user can complete common safety setup and activate either workspace; anonymous, ineligible, and workspace-unauthorized users are correctly limited.

### Phase 3 — Sports-data synchronization

- Implement the provider contract and football-data.org adapter.
- Add protected scheduled sync, normalization, upserts, stale status, saved fixtures for tests, and attribution.
- Add sport, competition, and team follows.

**Exit:** seeded/synchronized football fixtures are browsable without a live provider request.

### Phase 4 — Friendships and groups

- Add mutual friendship transitions and transactional block effects.
- Add groups, applications, invites, roles, bans, discovery threshold, similar-group suggestions, and event-review permission foundations.

**Exit:** privacy and group-role browser flows pass end to end.

### Phase 5 — Events, venues, and discovery

- Add self-serve Unverified private Venue drafts, active owner/admin memberships, inactive entitlement/defaults, and Fan follows; `VB01` separately activates public presence/publishing by verified Sandbox webhook.
- Add event creation, fixture attachment, private-versus-business audience constraints, venue-as-non-attendee enforcement, 12-person home cap, protected home locations, atomic owner/admin-authored group publication, different-reviewer enforcement for ordinary-member submissions, and PostGIS discovery.

**Exit:** each audience sees exactly the permitted event summaries; private addresses remain hidden.

### Phase 6 — Attendance and calendar export

- Implement direct invitations, request/approve/decline/leave/host-removal flows, one-account-per-seat capacity, address revocation, attendee views, cancellation history, and `.ics` files.

**Exit:** concurrency, private-location, and calendar tests pass.

### Phase 7 — Security, testing, deployment, and submission

- Complete community-guideline, report/moderation/appeal flows, audit coverage, headers/origin checks, abuse limits, accessibility, failure states, and the full test matrix.
- Deploy preview and production environments to Vercel/Supabase.
- Finish local setup, product, test, scale, and security material using evidence from the running system.

**Exit:** CI is green, production is reachable, migrations are reproducible, and the team can explain every important decision.

---

## 9. Requirement checklist

This table maps the official brief to the planned evidence. “Specified” means covered by these plans; it does not mean implemented yet.

| Official expectation | Planned Huddle evidence | Current planning status |
|---|---|---|
| Real product and business value | Problem, personas, free fan experience, future venue customer | Specified here |
| Product specification | MVP boundaries, capabilities, and core user journeys | Specified here and in implementation spec |
| Software architecture | system diagram, components, data flow, permissions, services | Specified here |
| Detailed technical plan | folders, pages, schema, interfaces, state, validation, errors, UX | Specified in implementation spec |
| Next.js + TypeScript | App Router modular monolith | Selected |
| Supabase database/auth | PostgreSQL, Auth, RLS, PostGIS, migrations | Selected |
| Vercel deployment | one Next.js deployment plus managed Supabase | Selected |
| Test specification | database, unit, component, and end-to-end acceptance matrix | Specified in implementation spec |
| Implemented meaningful tests | CI test suites and critical user flows | Required during implementation |
| Basic scale document | indexes, pagination, caching, provider sync, limits, growth path | Specified in both documents |
| Basic security document | authentication, authorization, RLS, input validation, secrets, residual risk | Specified in both documents |
| Public URL and GitHub link | production Vercel URL and repository | Required at submission |
| Local instructions and environment variables | reproducible Supabase reset and planned command/env contract | Specified in implementation spec; finalize after scaffolding |
| Presentation | no longer required by the course as of 5 September 2026 | Retired as an acceptance gate |

---

## 10. Reading the detailed design

This document explains the vision and boundaries. The companion [Huddle implementation specification](./HUDDLE-IMPLEMENTATION-SPEC.md) defines the pages, folders, data model, invariants, RLS rules, interfaces, synchronization behavior, tests, delivery gates, and traceability needed to implement it without reopening the major architecture decisions.

## 11. Reference links

- [Huddle README](../README.md)
- Local-only course roadmap (`course-roadmap/ROADMAP.md`; not published)
- Local-only official project brief (`course-roadmap/project instructions.pdf`; not published)
- [football-data.org quickstart](https://www.football-data.org/documentation/quickstart)
- [football-data.org pricing](https://www.football-data.org/pricing)
- [football-data.org coverage](https://www.football-data.org/coverage)
- [football-data.org registration and terms](https://www.football-data.org/client/register)
- [Supabase server-side Auth](https://supabase.com/docs/guides/auth/server-side)
- [Supabase Row Level Security](https://supabase.com/docs/guides/database/postgres/row-level-security)
- [Supabase PostGIS](https://supabase.com/docs/guides/database/extensions/postgis)
- [Supabase scheduled functions](https://supabase.com/docs/guides/functions/schedule-functions)
- [OWASP Authorization Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Authorization_Cheat_Sheet.html)
- [eSafety Safety by Design: user empowerment](https://www.esafety.gov.au/industry/safety-by-design/foundations/empowering-users-to-stay-safe-online)
- [Meetup group and event safety policies](https://help.meetup.com/hc/en-us/articles/360002897712-Meetup-groups-and-events-policies)
- [Meetup reporting](https://help.meetup.com/hc/en-us/articles/39257846459789-Reporting-a-Meetup-group-or-event)
- [Meetup removal and banning](https://help.meetup.com/hc/en-us/articles/39256750778637-Remove-or-ban-a-member)
- [Discord reporting and reporter privacy](https://discord.com/safety/360044103651-reporting-abusive-behavior-to-discord)
- [RFC 5545: iCalendar](https://datatracker.ietf.org/doc/html/rfc5545)

External plan and pricing facts should be rechecked before provider registration or production launch; they were selected for the August 2026 planning baseline.
