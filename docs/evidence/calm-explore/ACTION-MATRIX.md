# Huddle action and flow matrix

**Run:** Calm Explore and CRUD completion
**Branch:** `codex/calm-explore-crud-audit`
**Baseline:** 147 Vitest files / 724 tests passed before implementation
**Status key:** `verified`

This is the verified coverage ledger for every user-visible product action. “Expected outcome” is the approved product contract; every row now names current automated evidence and was included in the bounded final journey/audit.

## Account and workspaces

| ID | Actor | Entry/control | Expected outcome and recovery | Automated evidence | Status |
| --- | --- | --- | --- | --- | --- |
| ACC-SIGN-UP | Anonymous | Sign up | Creates Auth identity, shows verification destination, preserves safe callback | `features/auth/actions.test.ts`, `tests/e2e/auth.spec.ts` | verified |
| ACC-VERIFY | Email holder | Verification link | Establishes session and routes incomplete user to workspace onboarding | `app/auth/verify/callback/route.test.ts`, `tests/e2e/auth.spec.ts` | verified |
| ACC-SIGN-IN | Registered user | Sign in | Establishes session and returns to valid workspace | `features/auth/actions.test.ts`, `tests/e2e/auth.spec.ts` | verified |
| ACC-SIGN-OUT | Signed-in user | Account → Sign out | Ends session and returns to public Home | `features/auth/actions.test.ts`, `tests/e2e/auth.spec.ts` | verified |
| ACC-COMMON | Verified user | Common eligibility | Records adult/rules eligibility once with field errors retained | `features/workspaces/actions.test.ts`, `tests/e2e/auth.spec.ts` | verified |
| ACC-FAN-ENABLE | Common-eligible user | Use Huddle as a fan | Creates/activates Fan workspace and routes Home | `features/profiles/actions.test.ts`, `tests/e2e/auth.spec.ts` | verified |
| ACC-VENUE-ENABLE | Common-eligible user | Set up a venue | Creates Unverified venue workspace and routes Venue Today | `features/workspaces/actions.test.ts`, `tests/e2e/ux-redesign.spec.ts` | verified |
| ACC-SWITCH | Multi-workspace user | Workspace switcher | Switches presentation and lands on selected authorized workspace | `features/workspaces/actions.test.ts`, `tests/e2e/ux-redesign.spec.ts` | verified |
| ACC-PROFILE-UPDATE | Fan | Account → Profile | Saves identity/city/bio and returns explicit confirmation | `features/profiles/actions.test.ts`, `app/settings/profile/page.test.tsx` | verified |
| ACC-INTERESTS | Fan | Account → Interests | Follow/unfollow sports catalog item; state survives refresh | `features/subscriptions/actions.test.ts`, `app/settings/interests/page.test.tsx` | verified |

## Explore and fixtures

| ID | Actor | Entry/control | Expected outcome and recovery | Automated evidence | Status |
| --- | --- | --- | --- | --- | --- |
| EXP-OPEN | Any | Primary Explore | Opens event search; navigation is current | `app/discover/page.test.tsx`, `components/layout/app-shell.test.tsx` | verified |
| EXP-GROUPS | Any | Explore → Groups | Opens discoverable groups while global Explore remains current | `app/groups/page.test.tsx`, `components/layout/app-shell.test.tsx` | verified |
| EXP-DATE | Any | From/To | Rejects inverted/out-of-horizon dates beside fields; reset works | `features/discovery/schemas.test.ts`, `app/discover/page.test.tsx` | verified |
| EXP-AREA | Any | City/distance/location | Applies one-shot coordinates without persistence; fallback remains usable | `features/discovery/components/discovery-feed.test.tsx`, pgTAP `200` | verified |
| EXP-TEAM | Any | Team filter | Narrows fixtures/listings and shows TeamMark | `app/discover/page.test.tsx`, `tests/e2e/calm-crud.spec.ts` | verified |
| EXP-FIXTURE | Any | Specific fixture search | Shows all eligible listings for that fixture and no duplicate fixture destination | `app/discover/page.test.tsx`, `tests/e2e/calm-crud.spec.ts` | verified |
| EXP-MAP | Any | List/Map | Keeps selection synchronized; maps only public coordinates | `features/discovery/components/discovery-map.test.tsx`, pgTAP `200` | verified |
| EXP-EVENT-OPEN | Any eligible viewer | Open event | Opens event with preserved Explore return query | `app/events/[eventId]/page.test.tsx`, `tests/e2e/calm-crud.spec.ts` | verified |
| EXP-RETURN | Any | Back to Explore | Returns to same area/date/team/fixture search | `app/events/[eventId]/page.test.tsx`, `tests/e2e/calm-crud.spec.ts` | verified |
| EXP-MATCH-INDEX | Any | Legacy `/matches` | Redirects to Explore | `app/matches/page.test.tsx` | verified |
| EXP-MATCH-DETAIL | Any | Stable fixture link | Shows fixture under Explore context and returns safely | `app/matches/[matchId]/page.test.tsx` | verified |
| EXP-EMPTY-HOST | Eligible Fan | Plan a huddle | Begins persisted event draft with selected fixture | `app/discover/page.test.tsx`, `tests/e2e/calm-crud.spec.ts` | verified |

## Events and attendance

| ID | Actor | Entry/control | Expected outcome and recovery | Automated evidence | Status |
| --- | --- | --- | --- | --- | --- |
| EVT-DRAFT | Fan | Plan a huddle | Saves each step; back/refresh restore draft; discard explicitly removes it | `features/events/actions.test.ts`, `tests/e2e/auth.spec.ts` | verified |
| EVT-CREATE | Fan | Review and publish/submit | Creates allowed audience event and redirects to saved object | `features/events/actions.test.ts`, `tests/e2e/auth.spec.ts` | verified |
| EVT-VENUE-CREATE | Venue operator | Plan selected fixtures | Inherits kickoff and creates selected open-door/reservation events | `features/venues/workspace/components/fixture-planner.test.tsx`, pgTAP `190` | verified |
| EVT-READ | Eligible viewer | Event link | Shows one role-aware status/action and no protected data leakage | `app/events/[eventId]/page.test.tsx`, pgTAP event tests | verified |
| EVT-SHARE | Eligible viewer | Copy event link | Copies navigation URL only; explains that it grants no eligibility | `app/events/[eventId]/page.test.tsx` | verified |
| EVT-INVITE-PERSON | Event manager | Invite people | Search/select without exact handle; recipient sees Home/My Huddle task | `features/attendance/components/event-invitation-picker.test.tsx`, `tests/e2e/calm-crud.spec.ts` | verified |
| EVT-INVITE-LINK-CREATE | Invite-only host | Create invite link | Creates one-time-visible expiring/revocable/limited token link | pgTAP `210`, `event-invite-link-control.test.tsx` | verified |
| EVT-INVITE-LINK-REDEEM | Eligible Fan | Secure event invite link | Requires sign-in, creates invitation only, reveals no private address | pgTAP `210`, `app/join/event/[token]/page.test.tsx` | verified |
| EVT-INVITE-LINK-REVOKE | Host | Revoke link | Stops future redemption without deleting invitations/history | pgTAP `210`, `event-invite-link-control.test.tsx` | verified |
| EVT-INVITE-ACCEPT | Invitee | Accept | Atomically reserves one place and updates all current-state surfaces | `features/attendance/actions.test.ts`, `tests/e2e/calm-crud.spec.ts` | verified |
| EVT-INVITE-DECLINE | Invitee | Decline | Removes active task and event from current lists | `features/attendance/actions.test.ts`, `tests/e2e/calm-crud.spec.ts` | verified |
| EVT-INVITE-REVOKE | Manager | Revoke pending invite | Removes recipient task; retains audit history | `features/attendance/actions.test.ts`, pgTAP invitation tests | verified |
| EVT-JOIN | Eligible Fan | Join | Atomically joins non-approval reservation if capacity remains | `features/attendance/actions.test.ts`, `tests/e2e/auth.spec.ts` | verified |
| EVT-REQUEST | Eligible Fan | Ask to join | Creates one pending request and shows Waiting for host | `features/attendance/actions.test.ts`, `tests/e2e/auth.spec.ts` | verified |
| EVT-REQUEST-APPROVE | Manager | Approve request | Atomically reserves place and exposes protected location only if authorized | `features/attendance/actions.test.ts`, pgTAP attendance tests | verified |
| EVT-REQUEST-REJECT | Manager | Decline request | Closes request and removes active task | `features/attendance/actions.test.ts`, `tests/e2e/calm-crud.spec.ts` | verified |
| EVT-LEAVE | Attendee | Leave event | Revokes future location/calendar access and removes active listing | `features/attendance/actions.test.ts`, `tests/e2e/auth.spec.ts` | verified |
| EVT-REMOVE | Manager | Remove attendee | Revokes access; history remains manager-only/secondary | `features/attendance/actions.test.ts`, `tests/e2e/auth.spec.ts` | verified |
| EVT-CANCEL | Host/operator | Cancel event | Confirms, cancels future event, closes active tasks, retains history | `features/attendance/actions.test.ts`, `tests/e2e/calm-crud.spec.ts` | verified |
| EVT-CALENDAR | Authorized attendee | Add to calendar | Returns safe ICS; exact location only while authorized | `app/api/events/[eventId]/calendar.ics/route.test.ts`, `tests/e2e/auth.spec.ts` | verified |
| EVT-REPORT | Eligible viewer | Report | Submits confidential report without revealing it to subject/group admin | `features/moderation/actions.test.ts`, `tests/e2e/auth.spec.ts` | verified |

## Groups

| ID | Actor | Entry/control | Expected outcome and recovery | Automated evidence | Status |
| --- | --- | --- | --- | --- | --- |
| GRP-SEARCH | Any | Explore → Groups filters | Finds discoverable general/team groups; unlisted stay absent | `features/groups/search.test.ts`, `app/groups/page.test.tsx` | verified |
| GRP-CREATE | Fan | Create group | Optional team; discoverable or unlisted; redirects saved group | `features/groups/actions.test.ts`, `group-create-form.test.tsx` | verified |
| GRP-READ | Authorized viewer | Open group | Shows overview, upcoming events, and one role-aware action | `app/groups/[slug]/page.test.tsx` | verified |
| GRP-UPDATE | Owner/admin | Group settings | Saves description/visibility/rules with explicit confirmation | group action/component tests | verified |
| GRP-DELETE | Owner | Delete group | Audited archive; cancels future events/revokes invite links/retains history | pgTAP `205`, `group-management-controls.test.tsx` | verified |
| GRP-APPLY | Fan | Apply | Creates pending application once | `group-membership-control.test.tsx`, pgTAP group tests | verified |
| GRP-APPLICATION-APPROVE | Different owner/admin | Approve | Activates membership and removes task | `membership-actions.test.ts`, `tests/e2e/calm-crud.spec.ts` | verified |
| GRP-APPLICATION-REJECT | Different owner/admin | Reject | Closes application and removes task | `membership-actions.test.ts`, `tests/e2e/calm-crud.spec.ts` | verified |
| GRP-INVITE-LINK-CREATE | Owner/admin | Create group invite link | Shows plaintext once; metadata remains; expiry/use limit enforced | `membership-actions.test.ts`, pgTAP group tests | verified |
| GRP-INVITE-LINK-REDEEM | Fan | Group invite link | Starts application; never bypasses review | `app/join/group/[token]/page.test.tsx`, pgTAP group tests | verified |
| GRP-INVITE-LINK-REVOKE | Owner/admin | Revoke | Stops new use; retains prior applications | `membership-actions.test.ts`, pgTAP group tests | verified |
| GRP-LEAVE | Member/admin | Leave group | Removes active membership; owner cannot leave without ownership resolution | `membership-actions.test.ts`, pgTAP group tests | verified |
| GRP-ROLE | Owner | Change role | Changes admin/member role without violating owner invariant | `membership-actions.test.ts`, pgTAP group tests | verified |
| GRP-BAN | Owner/admin | Ban | Removes content/event eligibility and blocks reapplication | `membership-actions.test.ts`, `tests/e2e/auth.spec.ts` | verified |
| GRP-UNBAN | Owner/admin | Revoke ban | Allows fresh application; does not restore membership | `membership-actions.test.ts`, pgTAP group tests | verified |
| GRP-EVENT-SUBMIT | Member | Submit event | Creates pending review task for a different admin | `features/events/actions.test.ts`, `tests/e2e/auth.spec.ts` | verified |
| GRP-EVENT-WITHDRAW | Submitter | Withdraw submission | Cancels own pending submission without pretending to review it | `group-management-controls.test.tsx`, `tests/e2e/calm-crud.spec.ts` | verified |
| GRP-EVENT-APPROVE | Different owner/admin | Approve and publish | Publishes; submitter never gets self-review controls | `membership-actions.test.ts`, pgTAP group-event tests | verified |
| GRP-EVENT-REJECT | Different owner/admin | Reject | Cancels; submitter never gets self-review controls | `membership-actions.test.ts`, pgTAP group-event tests | verified |

## Venues

| ID | Actor | Entry/control | Expected outcome and recovery | Automated evidence | Status |
| --- | --- | --- | --- | --- | --- |
| VEN-READ | Any | Open venue | Shows public profile/events and truthful self-listed status | venue page tests, pgTAP venue projection tests | verified |
| VEN-UPDATE | Venue owner/admin | Venue settings | Saves public details/defaults/facilities with confirmation | `venue-settings-form.test.tsx`, `actions.test.ts` | verified |
| VEN-AREA-CREATE | Venue owner/admin | Add area | Creates reusable named active area; capacity optional | `venue-settings-form.test.tsx`, pgTAP venue tests | verified |
| VEN-AREA-UPDATE | Venue owner/admin | Edit area | Updates name/capacity without changing event history | workspace action tests, pgTAP venue tests | verified |
| VEN-AREA-DEACTIVATE | Venue owner/admin | Stop using area | Hides from new planning while referenced events remain readable | workspace action tests, pgTAP venue tests | verified |
| VEN-PLAN | Venue owner/admin | Plan events | Search/filter fixtures, select multiple, review and publish | `fixture-planner.test.tsx`, `tests/e2e/ux-redesign.spec.ts` | verified |
| VEN-OPEN-DOOR | Venue owner/admin | Publish open door | No capacity/invite/RSVP/guest-list controls anywhere | pgTAP `190`, `event-management-controls.test.tsx` | verified |
| VEN-RESERVATION | Venue owner/admin | Publish reservations | Valid capacity/approval controls and atomic attendance | pgTAP `190`, `tests/e2e/auth.spec.ts` | verified |
| VEN-FOLLOW | Fan | Follow venue | Adds/removes saved venue without creating attendance | `features/venues/actions.test.ts`, pgTAP venue tests | verified |
| VEN-CLOSE | Active owner | Close venue | Audited archive; future events/invites close; live workspace/public reads disappear | pgTAP `210`, `close-venue-control.test.tsx` | verified |

## Friendships and safety

| ID | Actor | Entry/control | Expected outcome and recovery | Automated evidence | Status |
| --- | --- | --- | --- | --- | --- |
| FRIEND-SEARCH | Fan | People search | Finds by name or handle; exact handle not required | `app/people/page.test.tsx`, people-search pgTAP | verified |
| FRIEND-REQUEST | Fan | Add friend | Creates one outgoing request and visible status | `friendship-control.test.tsx`, pgTAP friendship tests | verified |
| FRIEND-CANCEL | Requester | Cancel request | Removes pending relationship from both current queues | `friendship-control.test.tsx`, `tests/e2e/calm-crud.spec.ts` | verified |
| FRIEND-ACCEPT | Recipient | Accept | Creates accepted direct friendship and friends-event visibility | `friendship-control.test.tsx`, `tests/e2e/auth.spec.ts` | verified |
| FRIEND-DECLINE | Recipient | Decline | Removes incoming task; does not create friendship | `friendship-control.test.tsx`, `tests/e2e/calm-crud.spec.ts` | verified |
| FRIEND-REMOVE | Either friend | Remove friend | Removes future friends visibility without public residue | `friendship-control.test.tsx`, `tests/e2e/calm-crud.spec.ts` | verified |
| SAFETY-BLOCK | Fan | Block | Immediate/private; removes friendship/invites and protected eligibility | `features/safety/actions.test.ts`, `tests/e2e/auth.spec.ts` | verified |
| SAFETY-UNBLOCK | Blocker | Unblock | Ends block without restoring relationships | `features/safety/actions.test.ts`, `tests/e2e/auth.spec.ts` | verified |

## Moderation demonstration

| ID | Actor | Entry/control | Expected outcome and recovery | Automated evidence | Status |
| --- | --- | --- | --- | --- | --- |
| MOD-ASSIGN | Moderator | Assign report | Claims report without disclosure to subject | `features/moderation/actions.test.ts`, `tests/e2e/auth.spec.ts` | verified |
| MOD-DISMISS | Assigned moderator | Dismiss report | Records audited decision | moderation tests | verified |
| MOD-ACTION | Assigned moderator | Apply action | Applies bounded suspension/restriction with confirmation | moderation tests, `tests/e2e/auth.spec.ts` | verified |
| MOD-REVERSE | Moderator | Reverse action | Audited reversal restores only allowed state | moderation tests | verified |
| MOD-APPEAL | Affected user | Appeal | Creates confidential appeal once | moderation tests, `tests/e2e/auth.spec.ts` | verified |
| MOD-APPEAL-REVIEW | Different moderator | Review appeal | Enforces independent reviewer and audited outcome | moderation tests, `tests/e2e/auth.spec.ts` | verified |

## Final exit requirements

- All 86 rows are `verified` against the current complete acceptance output and bounded final journey/audit.
- Every control is reachable, truthful, role-aware, keyboard-operable, and at least 44px in the product convention.
- No ordinary workflow requires memorizing an `@handle`, copying raw coordinates, understanding internal lifecycle language, or guessing where an invitation went.
- No action loses its originating Explore context, repeats invalid input into a global error, or leaves a dead enabled button.
