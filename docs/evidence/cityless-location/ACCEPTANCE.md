# Cityless location acceptance

This evidence maps the approved cityless-location contract to the implementation and its current local verification. Hosted Supabase and production are outside this branch run; the only hosted requirement before handoff is an exact-head Vercel Preview build.

## Acceptance map

| Contract | Implementation | Current evidence |
|---|---|---|
| Fan profiles require no city or saved location | cityless `complete_profile`, profile DTO/actions/forms, common/Fan actor gates | profile schema/action/component tests; pgTAP `010`, `165`, `260`; three-viewport journey |
| Explore uses current location or a confirmed address | session-only origin state, `POST /api/locations/search`, private discovery body, PostGIS origin query | location route/provider/component tests; discovery route/query tests; pgTAP `160`, `200`, `230`, `260`; three-viewport denied-location journey |
| Explore accepts catalog-spanning ranges | UI validation rejects only invalid ordering; database window ends at the active synchronized season boundary | discovery schema tests; pgTAP `260`; three-viewport 60-day journey |
| Venues and public places use confirmed addresses and coordinates | shared `AddressSearch`, venue onboarding/settings, event place step and controlled RPCs | venue/event action/component tests; pgTAP `060`, `120`, `130`, `160`, `260`; three-viewport journey |
| Home addresses use the same confirmation interaction but remain protected | `private_home` no-store geocoding plus `event_private_locations` authorization/audit boundary | location/event tests; pgTAP `060`, `090`, `100`, `150`, `260`; two-account journey verifies revocation |
| Groups have no geography and public search is global | cityless group DTO/actions/forms/RPCs; active-member-count/name/ID cursor order | group schema/action/search tests; pgTAP `040`, `080`, `230`, `250`, `260`; three-viewport group lifecycle |
| Unlisted groups stay outside global search | existing visibility/RLS boundary retained after city removal | pgTAP `040`, `050`, `080`, `260`; Playwright unlisted invite journey |
| Creators are not filtered out of otherwise eligible Explore results | cityless discovery projections include creator/manager rows while retaining audience and distance rules | discovery query tests; pgTAP `145`, `190`, `210`, `260`; two-workspace Explore journey |
| Provider crests render throughout the product with initials fallback | synchronized allowlisted `crest_url`, batched local team visuals, shared `TeamMark` | sync/DTO/team-mark/query tests; pgTAP `030`; three-viewport official-crest and fallback assertions |
| No active UI exposes a city control | profile, Explore, event, group, venue, people, dashboard, and history contracts are cityless | runtime source scan plus three-viewport assertions across onboarding, Explore, group/event creation, and venue onboarding/settings |

## Focused browser evidence

The deterministic two-account Fan/Venue journey passed at:

- desktop: 1280×800;
- tablet: 768×1024; and
- mobile: 375×812.

Each run creates and cleans its own users, fixtures, group, protected home event, venue, viewing areas, and venue events. It checks denied geolocation with an autocompleted origin, a 60-day date range, city-control absence, protected-location revocation, global group membership, inherited venue addresses, visible managed-Venue events, official provider artwork, deterministic initials fallback, navigation, overflow, and browser-console failures.

## Self-audit notes

- Active application source contains no city selector, city parameter, city DTO field, or standalone group-city label. The remaining `city` keys are optional upstream Photon/OpenStreetMap response fields used only to compose a human-readable formatted address.
- Normal page requests read crest URLs only from the local Supabase catalog. They never call football-data.org.
- Precise Explore origins remain in session storage and private request bodies, not URLs or profiles.
- Exact home coordinates remain in the protected location table and are never returned by discovery.
- Historical city references remain only where explicitly labelled as superseded project evidence.

The complete acceptance command and exact-head Vercel result are recorded in the pull request only after they run successfully.
