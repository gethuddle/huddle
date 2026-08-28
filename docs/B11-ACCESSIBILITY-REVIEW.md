# B11 accessibility and responsive review

This review covers the local course-MVP presentation routes through B11. It
records the checks performed against repository-owned components and sanitized
Playwright users; it is not a formal WCAG conformance claim.

## Keyboard and accessible-name pass

- Every form control used by the authentication, onboarding, follow,
  friendship, group, venue, event, attendance, reporting, and moderation flows
  has a visible label or programmatic accessible name. Validation help and
  field errors are connected with `aria-describedby` where the control needs
  additional context.
- Server-action feedback uses text plus `alert` or `status` semantics. Pending
  buttons expose a textual busy state and disable repeat submission; status is
  never conveyed by badge color alone.
- Destructive block, leave, attendee-removal, event-cancellation, and
  moderation-enforcement confirmations use the repository-owned Radix
  AlertDialog primitive. Component tests cover deliberate confirmation,
  cancellation without mutation, focus entry, contained keyboard navigation,
  Escape cancellation, and focus restoration to the trigger.
- The phone navigation uses the repository-owned Radix DropdownMenu primitive.
  Its component and Playwright tests prove named menu items, Escape dismissal,
  and trigger-focus restoration. Safety remains reachable on a phone, and the
  Moderation entry is rendered only for a server-confirmed platform moderator.
- Pages retain one primary heading, named navigation landmarks, named sections,
  visible focus styles, and descriptive button/link text. The Testing Library
  role queries and Playwright role locators exercise the same names exposed in
  the browser accessibility tree.

## Responsive presentation coverage

The complete Playwright journeys exercise the public and authenticated product
loop at the desktop viewport. Milestone evidence adds phone checks at the
highest-risk layouts:

| Area | Desktop evidence | Phone evidence/check |
|---|---|---|
| Authentication and onboarding | `docs/evidence/b01/sign-up-desktop.png` | `docs/evidence/b01/sign-in-mobile.png` |
| Fixtures and follows | `docs/evidence/b04/fixtures-desktop.jpg` | `docs/evidence/b04/fixtures-mobile.jpg` and results evidence |
| Friendship and groups | B05/B06 desktop journeys | B05 group-owner and B06 invitation mobile evidence |
| Venues and event creation | B07/B08 desktop journeys | B07 private-event summary at phone width |
| Discovery | B09 anonymous and personalized desktop evidence | shared responsive cards/filter wrapping covered by component and journey layout |
| Attendance and protected location | B10 attendance/address desktop evidence | responsive shared cards, forms, dialogs, and header controls |
| Reports, moderation, and appeals | `docs/evidence/b11/independent-appeal-review-desktop.png` | `docs/evidence/b11/independent-appeal-review-mobile.png` at 390 x 844 |

The B11 journey additionally asserts that the phone moderation page has no
horizontal overflow, opens its navigation, exposes Safety and Moderation,
closes with Escape, and returns focus to the Menu trigger.

## Failure and boundary states

- Route-level loading states exist for authentication, fixtures, people,
  interests, groups, venues, events, reports, and moderation.
- Global and fixture-specific error boundaries provide a visible retry action;
  growing lists have explicit empty states and bounded pagination.
- Sports freshness distinguishes healthy, stale, failed, and never-synced data
  with text, timestamps, and safe retry guidance.
- Unauthorized moderation and protected-resource requests fail with the same
  non-enumerating not-found presentation used elsewhere.
- Attendance UI and journeys retain and label cancelled, left, removed,
  rejected, and approved history instead of deleting it.
- Restricted or suspended accounts lose community mutations and
  private-location access, while their report history and appeal path remain
  reachable.
- Jerusalem date helpers have regression coverage across spring and autumn DST
  transitions.

## Remaining acceptance boundary

The local role/name and keyboard pass does not replace a final VoiceOver smoke
test on the deployed URL. Production assistive-technology smoke testing, real
Vercel/Supabase checks, and final presentation rehearsal belong to B12.
