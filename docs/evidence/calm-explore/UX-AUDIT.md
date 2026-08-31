# Calm Explore final UX audit

**Date:** 2026-08-31
**Branch:** `codex/calm-explore-crud-audit`
**Environment:** optimized local Next.js build, reset local Supabase, deterministic sports data
**Outcome:** no unresolved Critical or Important UX finding and no F01–F40 recurrence after one bounded correction pass

## Audit lens

The audit used an anonymous visitor, a new Fan, a second Fan, and a Fan/Venue account. The complete two-account journey ran at 1280×800, 768×1024, and 375×812. A separate anonymous layout regression ran at the reported 1364×1440 viewport. The action matrix inventories 86 account, Explore, event, group, Venue, friendship, safety, and moderation outcomes.

The review applied:

- [Nielsen Norman Group's usability heuristics](https://www.nngroup.com/articles/ten-usability-heuristics/): visible state, real-world language, user control, consistency, recognition over recall, error recovery, and aesthetic restraint;
- [progressive disclosure](https://www.nngroup.com/articles/progressive-disclosure/): common actions remain visible while history, setup metadata, and specialist controls are secondary;
- [GOV.UK validation recovery](https://design-system.service.gov.uk/patterns/validation/): keep entered values and place actionable errors beside the problem;
- [WCAG 2.2 target-size guidance](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html): Huddle keeps its stricter 44 px product target for primary controls.

## What was exercised

| Journey | Representative interaction cost | Result and emotional check |
| --- | ---: | --- |
| First account → Fan | Sign up, verify, choose Fan, complete one profile form | Lands in a named workspace with a clear Home next step; no second sign-in or empty city selector. |
| Explore → exact fixture → event → back | Open search, query, select fixture, show events, open, back | One Explore model retains area/date/team/fixture context; no detour through the removed fixture index. |
| Explore resilience | Change valid and invalid dates, retry, clear, list/map | Invalid input stays in the editor with a correction; retry changes state; private coordinates never enter output. |
| Friend lifecycle | Add/cancel; add/decline; add/accept/remove | Every pending/current state names the next action and disappears after completion. No exact-handle memory is required. |
| Invite-only event | Create, invite by search, create/redeem/revoke secure link, accept/decline | The UI explains where an invitation appears and that a copied event URL does not grant access. Protected address remains hidden until authorized. |
| Group lifecycle | Search/create/apply/approve/reject; member submit/withdraw; different admin review; leave/archive | Groups may be general or team-linked. The submitter cannot self-review, and pending work lives on Home and the object. |
| Venue lifecycle | Create via address search, edit defaults/areas, batch-plan fixtures, publish open-door/reservation events, close | Venue is a dedicated workspace. Open-door events contain no fake capacity, RSVP, invitation, or approval controls. Closure is confirmed and recoverable as retained audit history, not a hard delete. |
| Event attendance | Join/request/approve/reject/leave/remove/cancel/calendar/report | One role-aware action is primary. Completed or removed relationships leave current views without exposing retained internal history. |
| Responsive shell | Desktop, tablet, mobile, and 1364×1440 tall desktop | Header/footer fill the viewport, content is centred, no horizontal overflow occurs, and mobile destinations remain fixed and reachable. |

## Bounded correction pass

### UX-A01 — perceived narrow canvas and dark elevation

The reported Helium screenshot was reproduced at 1364×1440. Runtime measurements showed a 1364 px header/footer, a centred 1280 px content container with equal 42 px gutters, and a centred 576 px auth card. The dark outer canvas and 74% indicator belong to Helium's Responsive-mode chrome, not the page.

One real visual issue remained: ordinary cards and buttons still inherited ink-coloured shadows. The correction removes elevation from ordinary bordered surfaces and primary buttons. Floating menus, dialogs, search, and docked mobile navigation now use pale sage semantic shadow tokens. A dedicated 1364×1440 Playwright assertion and [screenshot](sign-in-1364x1440.png) protect width, centring, overflow, and dark-shadow regressions.

**Status:** resolved; focused RED reproduced the ink shadow, then GREEN passed.

## Final findings

- **Critical:** 0 open
- **Important:** 0 open
- **F01–F40 recurrences:** 0
- **Broken action outcomes in the 86-row matrix:** 0 after the complete gate
- **Browser console/runtime failures in the two-account journey:** 0
- **Horizontal-overflow failures:** 0

## Non-blocking polish

- Team identity uses repository-owned TLA/initial marks rather than provider crest files. This gives every fixture a consistent visual anchor without introducing unlicensed third-party assets; an approved licensed crest pack can replace the mark component later.
- Helium's Responsive-mode outer canvas can still look like page whitespace when zoomed below 100%. The saved browser screenshot records the actual application viewport without tool chrome.

## Evidence

- `npm run test:acceptance`: 151 Vitest files / 757 tests, 36 pgTAP files / 1624 assertions, production build, security audit, diff hygiene, and 28 Playwright scenarios.
- Responsive evidence: [1280](../ux-redesign/desktop-1280.png), [768](../ux-redesign/tablet-768.png), [375](../ux-redesign/mobile-375.png), and [1364×1440](sign-in-1364x1440.png).
- Complete control/outcome map: [ACTION-MATRIX.md](ACTION-MATRIX.md).
