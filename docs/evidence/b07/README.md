# B07 venues and private-event foundations visual acceptance

These screenshots were captured from the B07 interface against the repository-managed local
Supabase stack. Every account, venue, fixture, and event is synthetic local evidence; no production
account, hosted data, token, session value, email address, or private location appears in the
images.

- [Desktop unverified venue profile](./unverified-venue-desktop.png)
- [Desktop private-event wizard](./private-event-wizard-desktop.png)
- [Mobile safe private-event summary](./private-event-summary-mobile.png)

The venue profile keeps the unverified state visible beside its public business details. The
private-event wizard shows fixture-first creation, restricted personal audiences, the registered-
account capacity boundary, host-presence confirmation, and the protected-home warning. The mobile
summary confirms that the ordinary event view contains only coarse location context and never the
exact home address or coordinate.

The complete B07 verification also passed 249 Vitest/component tests, 651 pgTAP assertions, and
five Playwright journeys. The B07 journey creates an unverified venue and a private home event,
then asserts that the exact address is absent from the action result, rendered summary, and page
HTML.
