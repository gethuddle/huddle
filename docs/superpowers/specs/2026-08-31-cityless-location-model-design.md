# Cityless Location Model and Global Groups

**Status:** Approved on 2026-08-31; implementation and acceptance evidence in progress
**Branch:** `codex/cityless-location-model`
**Baseline:** merged PR #43 at `5585f00f73dfc09064a3e49be1dfbeed5b7d4183`

## 1. Purpose

Huddle currently mixes two incompatible models:

- real coordinates for map and distance search; and
- a required city catalog used by profiles, events, venues, groups, URLs, validation, and fallback copy.

The city catalog adds repeated choices without accurately representing distance. It also makes global groups look artificially local and forces people in small or adjacent cities into the wrong discovery boundary.

This change makes coordinates and confirmed addresses the only location model for events and venues. Profiles and groups have no location. A city name may appear naturally inside a geocoder-provided formatted address, but Huddle never asks for, stores, filters by, or displays a separate selected city.

The change also completes the football-data crest delivery already introduced by PR #43 so a hosted environment receives provider crests after its migration and sports synchronization run.

## 2. Approved product contract

### 2.1 Profiles

- Fan onboarding and profile settings do not ask for a city or location.
- Profile completion requires display name, unique handle, adult attestation, and acceptance of the current community rules. It does not require `city_id`.
- Public profiles and people suggestions do not display or rank by city.
- Huddle does not persist a user's default location. Explore asks for a session origin when location-aware results are needed.

### 2.2 Explore origins

- Explore first requests the browser's current coordinates.
- If permission is denied, unavailable, or unwanted, the user can type any city, neighborhood, landmark, or full address in Israel and choose a suggestion.
- The selected origin exists only in browser session state and a private `POST` body. Precise origin coordinates do not enter the URL, profile, analytics, or application logs.
- The URL may retain non-sensitive filters such as dates, competition, team, fixture, radius, and pagination state. It has no `city` parameter.
- Search results use PostGIS distance from the selected origin across municipal borders.
- The arbitrary 45-day limit is removed. A valid start/end range may span the locally synchronized fixture catalog, subject only to bounded query and pagination safeguards.

### 2.3 Event and venue locations

- A venue has one confirmed public formatted address and coordinate. Venue onboarding and settings accept either an autocomplete suggestion or current browser location followed by address confirmation.
- A venue event inherits its venue location; its creator never chooses city or re-enters the address.
- A private-person event at a public place uses the same autocomplete/current-location control and stores its public formatted address and coordinate on the event.
- A home event uses the same autocomplete/current-location interaction, but the confirmed address and exact coordinate are written only to `event_private_locations` through the controlled event transaction.
- Exact home details remain unreadable directly. Existing audited authorization, revocation, block, suspension, cancellation, group-ban, and approved-attendance rules remain unchanged.
- Before approval, an eligible home-event viewer may receive server-derived coarse proximity context but never the address or coordinate. Distance sorting occurs inside the database and does not return the protected point.
- Event cards and detail pages show a public formatted address when public, protected-location guidance when private, and distance context when Explore has an origin. They do not show a standalone city label.

### 2.4 Geocoder behavior

- `AddressSearch` becomes a city-independent reusable combobox with keyboard navigation, loading, empty, retry, and attribution states.
- Requests contain `query` and `purpose` (`origin`, `public_address`, or `private_home`), never a separately selected city.
- Photon/OpenStreetMap receives the typed query constrained to Israel.
- Public venue/place results may use the bounded database cache already present in Huddle.
- Origin and private-home searches are no-store paths. The rate limiter records only actor/window/count metadata; it stores no query, result, address, or coordinate.
- Route responses are private/no-store. Safe logs contain request ID, purpose, status, duration, and item count only.
- Selecting a suggestion is required before a typed address is accepted. Editing the text invalidates the prior coordinate.

The user explicitly approved sending typed home-address searches to Photon. That approval changes the previous product decision that prohibited home text from entering the geocoder; it does not change Huddle's rule that exact saved home details exist only in `event_private_locations`.

### 2.5 Groups

- Groups have no city, address, coordinate, radius, home area, locality label, or local-versus-global mode.
- Group creation asks for name, description, visibility, and optional team.
- A discoverable group becomes globally searchable immediately unless archived, suspended, or hidden by a block/ban boundary. The user-facing `forming` readiness concept and its event/member/moderator activation gate are removed.
- Unlisted groups remain reachable only through an authorized invitation/link or a safe direct URL when existing policy permits it.
- Global group search filters by name and optional team.
- Default ordering is active-member count descending, then normalized name ascending, then ID ascending. Pagination uses those same fields as its deterministic keyset cursor.
- Similar-group suggestions use normalized name and optional team, not location.
- Group cards, details, invitations, My Huddle, and people surfaces display no city.
- A group event has its own event location and audience rules. The group itself contributes no geographic information.

### 2.6 Team crests

- The protected football-data synchronization stores validated HTTPS crest URLs from the allowlisted provider host.
- Team marks render provider crests on fixture cards, event cards, filters, interest controls, and other shared team-mark surfaces.
- Initials remain an accessible fallback only when the provider has no crest or the image fails.
- Normal page requests never call football-data.org.
- Each hosted database must receive the crest migration and one protected sports synchronization run before existing teams show crests.

## 3. Database design

One ordered forward migration replaces the active city contract. It must be safe to run after the three PR #43 migrations.

### 3.1 Columns and catalog

- Remove `profiles.city_id` and its completion/index dependencies.
- Remove `groups.city_id` and all group-city indexes, joins, DTO fields, function parameters, and audit metadata.
- Remove `venues.city_id` and city indexes. Existing public address/location fields remain authoritative.
- Remove `events.city_id` and city indexes. Venue/public/private location domains remain authoritative.
- Drop the `cities` catalog only after every foreign key, view, function, trigger, test fixture, and generated type no longer references it.
- Preserve all profiles, groups, venues, events, attendance history, invitations, and audit records. Removing redundant city values must not delete a product object.

If a legacy venue/public event lacks a usable coordinate, it remains owner-visible but is excluded from distance discovery and receives a clear "Confirm address" recovery action. A home event continues to use its existing protected coordinate.

### 3.2 Controlled functions and projections

Recreate affected controlled functions with cityless signatures and least-privilege grants, including:

- profile completion and public-profile projections;
- group create/search/similarity/detail/dashboard functions;
- venue create/update/list/detail functions;
- event draft/create/update/detail/dashboard functions;
- Explore event/map discovery and cursor handling;
- address-search quota/cache claims; and
- any moderation or recommendation projection that currently emits city.

Overloaded legacy signatures are dropped after application callers move to the new contract. Client access remains through controlled functions and existing RLS boundaries; city removal does not create direct table-write paths.

### 3.3 Discovery semantics

- Public venue and public-place events calculate distance from their public point.
- Eligible home events calculate distance internally from `event_private_locations.location` without returning that point.
- Audience, block, suspension, event status, time, team-follow, group-membership, friendship, and invitation rules run before a row is returned.
- Creators are not excluded merely because they own the event.
- Results order by explicit match/interest relevance when applicable, distance, start time, and ID.
- Growing result sets remain cursor-paginated.

## 4. Application changes

### 4.1 Remove selectors and city copy

The active UI must contain no city `<select>`, city-required validation, city fallback instruction, home-area control, or city-only metadata. This includes:

- fan onboarding and profile settings;
- Explore summary, filter dialog, query state, cards, map, empty/error states;
- event place and review steps;
- group create/search/card/detail/suggestion/invitation flows;
- venue onboarding, legacy creation, workspace settings, and public page;
- My Huddle, people, friendships, attendance, home, and event history surfaces.

Formatted addresses may contain municipality names because they are human-readable addresses. Internal Israel timezone handling continues to use `Asia/Jerusalem` and is unrelated to location selection.

### 4.2 Shared controls and state

- `AddressSearch` owns query text, suggestion loading, keyboard focus, selection, invalidation, retry, and attribution.
- A confirmed suggestion DTO contains provider result ID, formatted label, latitude, and longitude.
- `UseCurrentLocation` obtains browser coordinates and reverse-geocodes a human-readable label when a public label is needed.
- Explore's location origin is session-scoped and shared by map/list/filter controls without introducing another state library.
- Event and venue forms submit a confirmed location object, never untrusted free text plus unrelated coordinates.

### 4.3 Error and recovery states

- Geolocation denial opens the manual address path and does not block browsing non-location content.
- Provider unavailability preserves the current confirmed selection and offers retry.
- No suggestions explains how to broaden or correct the typed place.
- A stale or edited address cannot submit until reconfirmed.
- Legacy records without coordinates remain manageable and link directly to address confirmation.
- Explore date errors identify invalid ordering or unavailable catalog coverage without referring to a hard-coded 45-day rule.

## 5. Documentation reconciliation

This approved decision deliberately supersedes current references to:

- a required pilot city in profile completion;
- city fallback after geolocation denial;
- group city/home-area fields and city-aware duplicate suggestions;
- city-level home-event discovery copy;
- city parameters in event/group discovery;
- the prohibition on sending home search text to the geocoder; and
- the original initials-only crest decision.

The implementation must update `HUDDLE-IMPLEMENTATION-SPEC.md`, `HUDDLE-ARCHITECTURE.md`, `HUDDLE-STEP-BY-STEP-BUILD-SPEC.md`, `README.md`, test plans, traceability/evidence inventories, and `.env.example`/provider notes where applicable. Historical accepted evidence stays labeled historical rather than rewritten as if older behavior never existed.

## 6. Test and acceptance contract

### 6.1 Unit and component tests

- Profile completion succeeds without city and renders no city control.
- Address autocomplete works without city, supports keyboard selection, and invalidates edited selections.
- Origin, public-address, and private-home purposes follow their cache/no-store contracts.
- Event and venue forms submit confirmed coordinates and reject unmatched text.
- Group create/search/card flows contain no geography and use member-count ordering.
- Team crests render with alt text and fall back to initials.
- Explore accepts catalog-spanning date ranges and preserves deterministic filters.

### 6.2 Database and RLS tests

- No active public function requires or returns city.
- Profile completion and protected actions work without `city_id`.
- Group search is global, immediately includes valid discoverable groups, and keyset-paginates by active-member count/name/ID.
- Public and eligible private events rank by distance without exposing a private point/address.
- Unauthorized private-location reads remain denied before and after every revocation trigger.
- Address-search quota functions persist no origin/private-home query or result.
- Legacy objects survive the migration.
- Crest URL constraints and sync upserts remain provider-independent and server-only.

### 6.3 Browser journeys

At desktop, tablet, and mobile widths:

1. complete a new fan account without city;
2. deny geolocation, choose an address suggestion, and receive distance-ranked Explore results;
3. change origin and filters, including a date range longer than 45 days;
4. create public and home events without a city selector;
5. verify protected home details remain absent until authorization;
6. onboard/update a venue by confirmed address and inherit it in a venue event;
7. create and find a public group globally, ordered by member count;
8. verify an unlisted group remains outside global search;
9. see team crests with a deterministic fallback fixture; and
10. confirm no active page exposes a city selector or standalone group-city label.

### 6.4 Final gates

- focused tests pass during implementation;
- local Supabase reset, schema lint, generated database types, and all pgTAP tests pass;
- formatting, ESLint, strict TypeScript, build, security audit, and diff hygiene pass;
- the complete acceptance suite passes once after integration;
- a self-audit maps every item above to code and current test evidence;
- the pull request contains no secrets, private locations, debug artifacts, unrelated changes, or false hosted claims; and
- Vercel Preview reaches `SUCCESS` at the exact pushed head before handoff.

## 7. Delivery boundary

This branch may add the migration, application changes, tests, generated types, and documentation and may be committed, pushed, and published as one pull request because the user explicitly authorized publication. It does not authorize merging the writer's own PR or mutating production Supabase. Any preview-database mutation needed for runtime preview review requires a separately identified preview target and must not touch production.
