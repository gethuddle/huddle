# Calm Explore final UX audit

**Date:** 2026-08-31
**Branch:** `codex/calm-explore-crud-audit`
**Environment:** optimized local Next.js build, reset local Supabase, deterministic sports data
**Outcome:** no unresolved Critical or Important UX finding and no F01–F40 recurrence after one bounded correction pass

## Audit lens

The audit used an anonymous visitor, a new Fan, a second Fan, and a Fan/Venue account. The complete two-account journey ran at 1280×800, 768×1024, and 375×812. A separate anonymous layout regression ran at the reported 1364×1440 viewport. The action matrix inventories 89 account, Explore, event, group, Venue, friendship, safety, and moderation outcomes.

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

### UX-A02 — global groups reached a stale city parser

The final two-account replay created a deliberately city-free global group. Creation, direct invitation, removal, reapplication, and approval worked, but opening the current-group directory could reach a compatibility parser that still required `city_name` to be a string. A new fan would see the generic “Something went wrong” screen even though the group itself was valid.

The correction makes that response boundary explicitly nullable and adds a focused regression proving that My Huddle accepts a global group without inventing a city. The complete group lifecycle then passed from creation through public search, private sharing, event review, membership changes, and archive behavior.

**Status:** resolved; focused query test and browser journey passed, followed by the complete acceptance gate.

## Final integration re-audit

**Personas:** a time-poor first-time Fan, a second Fan receiving invitations, and a returning Fan who also operates a Venue.

| Check | Result |
| --- | --- |
| New-user orientation | Home presents one next step; Explore, My Huddle, People, and Account use task language and remain stable across viewports. |
| Location search | Browser permission is reused only when already granted; city/address suggestions are debounced, keyboard-selectable, and keep precise coordinates out of the URL. |
| Group workflow | Create is always reachable; city is optional; direct invitations name their destination; reusable links are secondary; Remove and Ban have distinct outcomes. |
| Event workflow | Draft state survives navigation/refresh, missing fields are identified together, and the first invalid field receives focus without a phantom map marker. |
| Venue workflow | Workspace switching lands on Venue Today, address selection confirms inline, batch planning inherits fixture dates, and open-door events omit reservation controls. |
| Returning-user awareness | Home exposes actionable invitations/applications; My Huddle retains current events, groups, and saved interests without removed-history residue. |
| Responsive/visual | The same two-account journey passed at 1280×800, 768×1024, and 375×812 with no horizontal overflow or browser console/page errors. |
| Recovery | Address retry, form validation, draft reload, wrong-route recovery, Explore return context, and controlled destructive confirmations all completed. |

**Scenario synthesis:** a new Fan can verify, set up, explore, connect, create or join a group, and plan a huddle without developer terminology. A Venue operator can switch workspaces, confirm an address, plan multiple fixture-backed events, and return to the Fan workspace without being stranded on a Fan route. The same tasks are faster on day two because current work lives in Home/My Huddle and Venue Calendar rather than requiring reconstruction from object URLs.

**Unexpected network/browser failures:** 0. The acceptance journey deliberately exercised one invalid address response and one unauthorized calendar request to verify recovery and denial; both produced their expected controlled UI/HTTP outcomes.

## Final findings

- **Critical:** 0 open
- **Important:** 0 open
- **F01–F40 recurrences:** 0
- **Broken action outcomes in the 89-row matrix:** 0 after the complete gate
- **Browser console/runtime failures in the two-account journey:** 0
- **Horizontal-overflow failures:** 0

## Non-blocking polish

- Scheduled football-data synchronization retains only allowlisted HTTPS crest URLs. Product pages show those provider-supplied crests with attribution and immediately fall back to the accessible Huddle TLA/initial mark if an image is absent or fails.
- Helium's Responsive-mode outer canvas can still look like page whitespace when zoomed below 100%. The saved browser screenshot records the actual application viewport without tool chrome.
- The workspace picker intentionally overlays nearby account cards while open. It remains fully reachable at 375 px and closes with Escape, but a future polish pass could prefer an upward mobile sheet if the workspace list grows substantially.

## Evidence

- `npm run test:acceptance`: 153 Vitest files / 778 tests, 39 pgTAP files / 1656 assertions, production build, security audit, diff hygiene, and 28 Playwright scenarios.
- Responsive evidence: [1280](../ux-redesign/desktop-1280.png), [768](../ux-redesign/tablet-768.png), [375](../ux-redesign/mobile-375.png), and [1364×1440](sign-in-1364x1440.png).
- Complete control/outcome map: [ACTION-MATRIX.md](ACTION-MATRIX.md).
