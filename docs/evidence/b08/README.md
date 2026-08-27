# B08 venue/group events and safe visibility evidence

These screenshots were captured from the B08 production build against the repository-managed local
Supabase stack. Every account, group, venue, fixture, and event is synthetic local evidence; no
production account, hosted data, token, session value, email address, or exact private location
appears in the images.

- [Anonymous public venue-event detail](./anonymous-venue-event-desktop.png)
- [Organizing-group event review queue](./group-event-review-desktop.png)

The venue-event view proves that an anonymous visitor receives the safe public listing, explicit
commercial/cost context, immediate-join mode, and visible unverified-venue label. The group queue
proves that a member submission stays pending until an owner or administrator makes an explicit
decision, while the review projection contains fixture and audience facts but no protected home
address.

Automated acceptance covers venue ownership and suspension, venue audience/target rules,
independent organizing and audience groups, member/admin/ban matrices, approval audit evidence,
cancellation gate recalculation, non-enumerating private-event reads, safe attendance aggregates,
location-payload rejection, and both browser journeys.

The final local run passed 264 Vitest/component tests, 716 pgTAP assertions, the production build,
and all five Playwright journeys.
