# B09 group and event discovery evidence

These screenshots are captured from the B09 production build against the repository-managed local
Supabase stack. Every account, group, fixture, venue, and event is synthetic local evidence; no
production account, hosted data, token, session value, email address, browser coordinate, or exact
private location appears in the images.

- [Completed group discovery gate](./group-discovery-gate-desktop.png)
- [Personalized eligible-event discovery](./personalized-discovery-desktop.png)
- [Anonymous public-event discovery](./anonymous-discovery-desktop.png)

The group journey proves that the same group is absent while forming and appears only after five
eligible active members, two active moderators including its owner, a description, a published
rule, and a reviewed future event are all present. Personalized discovery returns the eligible
group event without its protected home address. Anonymous discovery returns the public venue event
from city fallback without requesting a browser coordinate.

Representative local `EXPLAIN` inspection verified these access paths:

- `groups_active_discoverable_name_idx` for active-group keyset ordering;
- `events_public_location_gist_idx` for public-place radius candidates;
- `venues_location_gist_idx` followed by `events_host_venue_status_idx` for venue candidates; and
- `event_private_locations_location_gist_idx` followed by the event primary key for protected-home
  candidates.

The repository seed is intentionally tiny, so index-path inspection disables sequential scans only
for this representative `EXPLAIN`; runtime SQL still leaves PostgreSQL's planner defaults intact.
The discovery RPC itself returns the full safe card page in one database call, so rendering does not
add a per-card query.

Automated acceptance covers gate transitions, forming/unlisted leakage denial, personalized
block/ban removal, deterministic keyset pages, signed cursor tampering and filter binding, date and
radius bounds, interest ordering, all three spatial sources, location-permission denial and fallback,
anonymous and signed-in browser journeys, exact-location payload absence, and fail-closed private
caching when the authentication lookup is uncertain. Date-bound coverage proves the 45-day
Jerusalem window and current-day search remain valid across the autumn daylight-saving fallback,
while 46 calendar days remain rejected.

The final clean local run passed 303 Vitest/component tests, 781 pgTAP assertions, Huddle-owned
schema lint, generated-type drift, the production build, and all five Playwright journeys in 45.0
seconds.
