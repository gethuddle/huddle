# Account Erasure Design

**Approved:** 3 September 2026

## Goal

Give every signed-in Huddle account an immediate, irreversible self-service deletion flow while preserving only pseudonymous safety, attendance, ownership, and moderation history that the existing product contract requires.

## User experience

Account Security gains a visually separate Danger zone. Opening Delete account explains that the operation signs the person out everywhere, removes their public identity and private data, archives owned groups and venues, cancels future hosted events, and cannot be undone. It also explains that pseudonymous attendance and safety records remain so Huddle can preserve event and moderation history.

The confirmation dialog requires the current password and the exact word `DELETE`. Validation errors stay beside their fields. A successful operation clears local Huddle state and returns to the isolated sign-in page with a neutral “Account deleted” confirmation.

## Authorization and lifecycle

The browser never receives the Supabase service-role credential. A Server Action:

1. validates bounded input;
2. obtains the currently authenticated user from the normal SSR client;
3. reauthenticates that exact email/current-password pair;
4. after `VB01`, invokes `public.prepare_account_erasure_v2('DELETE', request_id)` as the authenticated user; its safe result says whether Polar cleanup is required and its transaction terminalizes each owned Venue/entitlement and closes any checkout attempt;
5. when that safe result requires cleanup, calls Polar's pinned Sandbox SDK to delete/anonymize the authenticated UUID external customer (`anonymize: true`; provider `404` is idempotent success), then completes the guarded local cleanup;
6. only after that cleanup succeeds, calls `auth.admin.deleteUser(user.id, true)` through the existing server-only service-role client;
7. clears recovery/workspace cookies, sets a short-lived host-only HttpOnly completion marker, and hard-redirects to sign in; the marker-gated landing component clears every namespaced Huddle tab-state value while preserving unrelated storage, then consumes the marker only after verified cleanup so a blocked storage API can retry and later anonymous state is not erased.

The database function derives the actor exclusively from `auth.uid()`, takes an actor-scoped advisory transaction lock, requires exact confirmation, and is idempotent. `VB01` preserves the existing V1 `public.prepare_account_erasure(text, uuid) returns boolean` contract: where Polar cleanup would be required, V1 raises `UPSTREAM_UNAVAILABLE` before commit so it cannot leave local erasure prepared while an external customer survives. The new V2 wrapper is the only billing-aware path allowed to commit bounded retryable cleanup state. If Auth deletion fails after V2 preparation/provider completion, the same signed-in user can repeat the action: preparation returns success without restoring any data, then the server retries Auth deletion.

Supabase soft deletion is deliberate. The Auth row remains as a non-reversible sanitized tombstone so existing foreign-key history remains valid, while sessions and identities are removed. Huddle never stores an email digest for ordinary self-deletion.

## Database transition

`profiles.deleted_at` is the canonical erasure marker. Preparation performs one transaction:

- cancel every future live event directly hosted by the actor or hosted through a group/venue they own;
- revoke pending event and group invitations involving the actor and revoke active invite tokens created by the actor or belonging to an owned group/venue event;
- move current requested/approved attendance to `left` and retain its history;
- delete event drafts and all exact home-location rows for events the actor hosted;
- archive owned groups and venues using their existing history-preserving outcome; for every owned Venue, acquire the ordered venue lock, cancel future venue events, close checkout generations, terminalize the entitlement, and retain only bounded provider-cleanup state;
- leave required owner memberships attached only to those archived objects, while ending/revoking every other active group or venue membership;
- delete follows, friendships, blocks, platform roles, and actor-scoped rate counters;
- clear handle, biography, Fan activation, attestation/rules completion, and other public identity state; replace the display name with `Deleted account`; and set `deleted_at`;
- write one safe `account.erase.prepare` security-audit event containing counts only.

Historical attendance, group membership, reports, moderation actions, appeals, event authorship, and audit rows keep the profile UUID but expose no email or former public identity. Owned groups/venues and future events are not transferred because Huddle has no ownership-transfer contract.

## Stale-session boundary

Supabase access JWTs can remain cryptographically valid until expiry after an Auth user is deleted. The migration therefore updates the central actor/common/Fan/safety/onboarding gates to reject `deleted_at is not null`. Deleted profiles retain only their already narrow own-row read policy, which returns the tombstone and no personal identity. Deleted accounts cannot reactivate themselves because direct profile writes remain revoked.

## Failure behavior

- Wrong current password and wrong typed confirmation are field-specific validation failures.
- Missing/changed sessions return the ordinary authentication-required result.
- Database, Polar, or Auth-provider failures return generic safe errors without exposing provider details. A transient required Polar cleanup failure from V2 leaves the profile non-public/ineligible and the local cleanup retryable, and MUST NOT delete Auth first; the Server Action maps it to `UPSTREAM_UNAVAILABLE`. The preserved V1 path raises that token before commit instead. The current application remains pre-`VB01` until this behavior is implemented.
- Database preparation is committed before Polar cleanup and Auth soft deletion. A failure leaves the profile non-public and ineligible while allowing a retry from the same still-authenticated session.
- Successful Auth deletion invalidates refresh sessions; the application also clears its own cookies and never renders the signed-in shell on the completion page.

## Late-checkout boundary

An external checkout accepted immediately before erasure may later emit a signed subscription or order event even though local attachment is rejected. If its exact retained attempt metadata belongs to the erased actor, it is recorded as cleanup-required, grants no entitlement, and invokes the same external-ID deletion outside database locks. The cleanup route resolves the actor from the local marker rather than a webhook external ID. A null external customer ID on `subscription.revoked` is accepted only to acknowledge completed anonymization when the organization, product, venue/attempt metadata, and erased marker all match; it never grants access or permits an archived venue to reappear. Ordinary venue archive never deletes or anonymizes a Polar customer.

## Verification

Coverage includes schema validation, current-password reauthentication, service-role ordering, provider failure/retry, cookie clearing, responsive dialog behavior, forced RLS, idempotency, stale-JWT mutation denial, owned-object archival, future-event cancellation, invitation/attendance transitions, exact-location removal, public-profile removal, and retained pseudonymous history.
