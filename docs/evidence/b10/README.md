# B10 invitations, attendance, and calendar evidence

These screenshots are captured from the B10 production build against the repository-managed local
Supabase stack. Every account, fixture, event, handle, and address is synthetic local evidence; no
production account, hosted data, token, session value, email address, or real private location
appears in the images.

- [Factual host attendance review](./attendance-review-desktop.png)
- [Authorized approved-attendee details](./approved-private-event-desktop.png)

The host view shows one registered-account request, its retained state, and bounded factual context
without an email address, private graph, reputation score, guest count, or optimistic seat claim.
The attendee view proves that an accepted direct invitation reserves exactly one place and that the
protected synthetic home address appears only after current authorization. The same browser journey
then removes that attendee, confirms the address disappears from both rendered source and calendar
output, approves a separate request, and proves leaving revokes that second attendee's later read.

Automated acceptance covers invitation creation, duplicate/self/block/suspension/start/full denial,
decline and revoke transitions, invite-only and team-follow override boundaries, pending versus
approved capacity, factual request context, retained leave/removal/cancellation history, relationship,
group-ban, suspension, block, and cancellation revocation, address-free audits, direct table denial,
anonymous public calendars, private no-store responses, RFC 5545 escaping and UTF-8 folding, and
deterministic two-connection races for both invitation acceptance and host approval.

Final local verification on 2026-08-28 passed 77 Vitest files with 322 tests, 16 pgTAP
files with 864 assertions, and all six Playwright journeys. Formatting, lint, strict
TypeScript, schema lint, generated-type drift, and the production build also passed.
