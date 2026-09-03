# Account Erasure Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an immediate, irreversible, current-password-confirmed account deletion flow that removes private/public identity data, closes live activity, preserves pseudonymous safety history, and soft-deletes the Supabase Auth identity.

**Architecture:** One authenticated security-definer RPC performs the idempotent product-data transition under an actor lock. A focused Server Action reauthenticates the current user, runs the RPC, then uses the existing server-only service-role client for Supabase Auth soft deletion and clears local state. A shadcn AlertDialog exposes the destructive flow in Account Security.

**Tech Stack:** Next.js App Router and Server Actions, strict TypeScript, Zod, React `useActionState`, repository-owned shadcn/Radix controls, Supabase Auth/PostgreSQL/RLS, pgTAP, Vitest/RTL, Playwright.

**Spec:** `docs/superpowers/specs/2026-09-03-account-erasure-design.md`

## Global Constraints

- Supabase Auth owns credentials; the service-role key stays server-only.
- The RPC derives the actor from `auth.uid()`, uses a fixed empty `search_path`, and accepts no user ID.
- Current password and exact `DELETE` confirmation are both required.
- The transition is immediate, irreversible, and idempotent; there is no grace period or email digest.
- Exact home locations, public identity, follows, friendships, blocks, drafts, and active access are removed.
- Attendance, membership, event authorship, moderation, appeal, and audit history remain only under a pseudonymous tombstone.
- Existing group/venue owner rows remain attached only to archived objects because ownership transfer is out of scope.
- Every exposed database object remains forced-RLS/deny-by-default.
- Do not commit, push, publish, migrate hosted databases, or deploy without a current user-authored instruction for that action.

---

### Task 1: Transactional product-data erasure

**Files:**
- Create: `supabase/migrations/20260903033000_account_erasure.sql`
- Create: `supabase/tests/database/280_account_erasure_test.sql`
- Create: `supabase/tests/database/281_account_erasure_concurrency_test.sql`
- Modify after reset: `types/database.generated.ts`

**Interfaces:**
- Produces: `public.prepare_account_erasure(input_confirmation text, audit_request_id uuid default null) returns boolean`
- Produces: nullable `public.profiles.deleted_at timestamptz`
- Updates: central eligibility gates, retained private-history RLS policies, direct follow
  serialization, and the two exact-home-location guards at the narrow tombstoned-host boundary.

- [x] **Step 1: Write pgTAP tests that describe the complete transition**

Seed an eligible actor who owns a group, venue, personal home event and draft; attends another event; has pending invitations, follows, friendships, blocks, and moderation history. Assert unauthenticated denial, wrong-confirmation denial, successful/idempotent preparation, public-identity clearing, owned-object archival, future-event cancellation, active-only invite revocation, attendance `left`, exact-location deletion with and without an approved attendee, application-message clearing across lifecycle states, active-membership removal, stale-JWT read and mutation denial, retained historical rows, retry cleanup, audit counts, unchanged live-host location guards, and forced RLS.

```sql
select throws_ok(
  $$ select public.prepare_account_erasure('DELETE', null) $$,
  'P0001', 'AUTH_REQUIRED',
  'anonymous callers cannot prepare account erasure'
);

select is(
  public.prepare_account_erasure('DELETE', 'e4000000-0000-4000-8000-000000000280'),
  true,
  'the signed-in actor prepares erasure'
);

select results_eq(
  $$ select handle, display_name, bio, fan_enabled_at, profile_completed_at,
            deleted_at is not null
     from public.profiles where id = 'e4000000-0000-4000-8000-000000000281' $$,
  $$ values (null::text, 'Deleted account'::text, null::text,
             null::timestamptz, null::timestamptz, true) $$,
  'the profile becomes a non-public tombstone'
);
```

- [x] **Step 2: Run the focused database test and verify red**

Run: `npm run db:start && supabase test db --local supabase/tests/database/280_account_erasure_test.sql`

Expected: failure because `deleted_at` and `prepare_account_erasure` do not exist.

- [x] **Step 3: Add the hardened migration**

Implement the transition in the committed migration; do not use an independent erasure-only
lock or return early from cleanup retries. The final database boundary must:

- call the canonical `private.serialize_actor_transaction()` lock used by same-actor
  mutations;
- rerun actor-scoped cleanup on every retry, while writing
  `account.erase.prepare` only for the first tombstone transition;
- serialize direct subscription and Venue-follow inserts/deletes with that same lock,
  rejecting same-actor inserts after tombstoning while leaving existing RLS authoritative
  for forged cross-actor rows;
- revoke only active invite tokens
  (`revoked_at is null`, future expiry, and remaining uses);
- clear `application_message` from every historical membership row for the actor;
- require `deleted_at is null` in the central actor/common/onboarding gates and in the
  retained private-table own-row read policies, leaving the sanitized own-profile
  tombstone as the only stale-JWT read;
- tombstone the direct host before deleting exact home locations, and narrow the two
  location-guard exceptions to deletion for a tombstoned direct host only;
- retain pseudonymous attendance, ownership, membership lifecycle, reports, moderation,
  appeals, and audit history while clearing identity, private relationship/follow data,
  drafts, exact locations, roles, and rate counters.

The two-session concurrency test belongs in
`supabase/tests/database/281_account_erasure_concurrency_test.sql`. It must prove that a
follow/subscription either commits before preparation and is removed, or runs after the
tombstone check and is denied; no residue may survive.

- [x] **Step 4: Reset, run focused pgTAP, lint SQL, and regenerate types**

Run:

```bash
npm run db:reset
supabase test db --local supabase/tests/database/280_account_erasure_test.sql
supabase test db --local supabase/tests/database/281_account_erasure_concurrency_test.sql
npm run db:lint
npm run db:types
npm run db:types:check
```

Expected: all commands exit 0 and generated types expose `deleted_at` plus the new RPC.

- [x] **Step 5: Review the migration for privacy and history invariants**

Confirm no email, password, raw invite token, address, or coordinates enter the audit record; every exact hosted-home location is deleted; reports/moderation/appeals/attendance history remain; an idempotent retry reconciles residue without a second audit transition; and direct follow races cannot leave post-erasure rows.

- [ ] **Step 6: Commit only after publication is explicitly authorized**

```bash
git add supabase/migrations/20260903033000_account_erasure.sql \
  supabase/tests/database/280_account_erasure_test.sql \
  supabase/tests/database/281_account_erasure_concurrency_test.sql \
  types/database.generated.ts
git commit -m "feat(account): add transactional account erasure"
```

### Task 2: Reauthenticated server action and retry boundary

**Files:**
- Create: `features/account-erasure/schema.ts`
- Create: `features/account-erasure/schema.test.ts`
- Create: `features/account-erasure/actions.ts`
- Create: `features/account-erasure/actions.test.ts`

**Interfaces:**
- Consumes: `prepare_account_erasure({ input_confirmation, audit_request_id })`
- Consumes: `createServiceRoleClient().auth.admin.deleteUser(userId, true)`
- Produces: `deleteAccountSchema`
- Produces: `deleteAccountAction(previousState, formData): Promise<AuthActionState>`

- [x] **Step 1: Write schema tests**

```ts
expect(deleteAccountSchema.parse({
  currentPassword: "current-password",
  confirmation: "DELETE",
})).toEqual({ currentPassword: "current-password", confirmation: "DELETE" });

expect(deleteAccountSchema.safeParse({
  currentPassword: "current-password",
  confirmation: "delete",
}).success).toBe(false);
```

Also assert empty and 73-character passwords fail and confirmation is bounded to 16 characters.

- [x] **Step 2: Run schema test and verify red**

Run: `npx vitest run features/account-erasure/schema.test.ts`

Expected: module-not-found failure.

- [x] **Step 3: Implement the bounded schema**

```ts
export const deleteAccountSchema = z.object({
  currentPassword: z.string().min(1, "Enter your current password.")
    .max(72, "Use 72 characters or fewer."),
  confirmation: z.string().max(16, "Type DELETE to confirm.")
    .refine((value) => value === "DELETE", {
      message: "Type DELETE exactly to confirm.",
    }),
});
```

- [x] **Step 4: Write action tests before implementation**

Mock the SSR client, service-role client, request ID, cookies, revalidation, and redirect. Assert ordering and boundaries:

```ts
expect(reauthenticate).toHaveBeenCalledWith({ email, password: "current-password" });
expect(rpc).toHaveBeenCalledWith("prepare_account_erasure", {
  input_confirmation: "DELETE",
  audit_request_id: requestId,
});
expect(adminDeleteUser).toHaveBeenCalledWith(userId, true);
```

Add cases for signed-out, wrong password, RPC failure, Auth deletion failure after successful preparation, exact provider-detail redaction, and success clearing recovery/workspace cookies before redirecting to `/auth/sign-in?account=deleted`.

- [x] **Step 5: Run action test and verify red**

Run: `npx vitest run features/account-erasure/actions.test.ts`

Expected: module-not-found or missing-export failure.

- [x] **Step 6: Implement the Server Action**

Implement this ordering exactly:

```ts
const parsed = deleteAccountSchema.safeParse({
  currentPassword: formData.get("currentPassword"),
  confirmation: formData.get("confirmation"),
});
if (!parsed.success) return actionFailure(parsed.error);

const supabase = await createClient();
const { data, error } = await supabase.auth.getUser();
if (error || !data.user?.email) return actionFailure(new DomainError("AUTH_REQUIRED"));

const reauth = await supabase.auth.signInWithPassword({
  email: data.user.email,
  password: parsed.data.currentPassword,
});
if (reauth.error || reauth.data.user?.id !== data.user.id) {
  return actionFailure(new DomainError("VALIDATION_FAILED", {
    fields: { currentPassword: ["Current password is incorrect."] },
  }));
}

const { error: preparationError } = await supabase.rpc("prepare_account_erasure", {
  input_confirmation: parsed.data.confirmation,
  audit_request_id: await getRequestId(),
});
if (preparationError) return actionFailure(domainErrorFromDatabase(preparationError));

const admin = createServiceRoleClient();
const { error: deletionError } = await admin.auth.admin.deleteUser(data.user.id, true);
if (deletionError) return actionFailure(new DomainError("UPSTREAM_UNAVAILABLE"));
```

Then clear `RECOVERY_GRANT_COOKIE_NAME` and `WORKSPACE_COOKIE_NAME`, `revalidatePath("/", "layout")`, and redirect. Never log the email, user ID, password, or provider error.

- [x] **Step 7: Run focused tests and typecheck**

Run:

```bash
npx vitest run features/account-erasure/schema.test.ts features/account-erasure/actions.test.ts
npm run typecheck
```

Expected: all commands exit 0.

- [ ] **Step 8: Commit only after publication is explicitly authorized**

```bash
git add features/account-erasure
git commit -m "feat(account): add reauthenticated deletion action"
```

### Task 3: Account Security danger zone and sign-out rendering

**Files:**
- Create: `features/account-erasure/components/delete-account-control.tsx`
- Create: `features/account-erasure/components/delete-account-control.test.tsx`
- Modify: `app/account/security/page.tsx`
- Modify: `app/account/security/page.test.tsx`
- Modify: `app/auth/sign-in/page.tsx`
- Modify: `app/auth/sign-in/page.test.tsx`
- Create: `features/auth/components/huddle-session-cleanup.tsx`
- Create: `features/auth/components/huddle-session-cleanup.test.tsx`
- Modify: `features/auth/components/sign-out-button.tsx`
- Create: `features/auth/components/sign-out-button.test.tsx`
- Create: `features/auth/huddle-session-storage.ts`
- Create: `features/auth/huddle-session-storage.test.ts`
- Create: `features/auth/session-cleanup-cookie.ts`
- Create: `features/auth/session-cleanup-actions.ts`
- Create: `features/auth/session-cleanup-actions.test.ts`
- Modify: `app/page.tsx`
- Modify: `app/page.test.tsx`
- Modify: `tests/e2e/auth.spec.ts`

**Interfaces:**
- Consumes: `deleteAccountAction` and `INITIAL_AUTH_ACTION_STATE`
- Produces: accessible shadcn `DeleteAccountControl`
- Produces: always-visible Account-page `SignOutButton` label

- [x] **Step 1: Write component/page regression tests**

Assert the Danger zone copy lists irreversible deletion, owned-object archival, future-event cancellation, and pseudonymous history retention. Open the AlertDialog and assert current-password and `DELETE` fields, Cancel, and destructive submit are keyboard-accessible. Assert field errors render through existing `FieldError`/`FormFeedback`. Assert `?account=deleted` renders a status alert on sign in.

For sign out, render the real component and assert the visible label is not decorated with `sr-only`:

```ts
const label = screen.getByText("Sign out");
expect(label).not.toHaveClass("sr-only");
expect(screen.getByRole("button", { name: "Sign out" })).toBeVisible();
```

- [x] **Step 2: Run focused component tests and verify red**

Run:

```bash
npx vitest run \
  features/account-erasure/components/delete-account-control.test.tsx \
  app/account/security/page.test.tsx app/auth/sign-in/page.test.tsx \
  features/auth/components/sign-out-button.test.tsx
```

Expected: missing component/status failures and the stale `sr-only` assertion failure.

- [x] **Step 3: Build the shadcn danger-zone dialog**

Use `AlertDialog`, `Button`, `Input`, `Label`, `FieldError`, and `FormFeedback`. Keep the destructive fields inside the dialog, prevent dismissal while the action is pending, constrain the dialog to the viewport with internal scrolling, and remount the form after an idle close so stale errors do not return. The explanatory card copy must say:

```text
Delete your Huddle account immediately. Your public profile and private data will be removed, owned groups and venues archived, and upcoming events you host cancelled. Pseudonymous attendance and safety history is retained. This cannot be undone.
```

The submit label is `Delete account permanently`; pending copy is `Deleting account…`.

- [x] **Step 4: Integrate Account Security and marker-backed deletion completion**

Place a separate destructive card after Password with heading `Delete account` and render `DeleteAccountControl`. Parse `account=deleted` exactly like the existing `password=changed` status; all other values remain ignored. The completed Server Action sets a short-lived host-only HttpOnly marker before redirect. Only that marker may mount the client cleanup boundary that removes every `huddle:*` session key while preserving unrelated tab storage; the query alone remains inert. Consume the marker only after the browser verifies that no Huddle key remains, so blocked storage can retry and successful cleanup cannot replay. Use the same marker-backed cleanup on the anonymous Home landing after sign-out and on isolated sign in after a password replacement.

- [x] **Step 5: Remove obsolete compact sign-out styling**

Change the component to use the normal outline-button padding and an always-visible label:

```tsx
<Button className={className} disabled={pending} type="submit" variant="outline">
  <LogOut aria-hidden="true" />
  <span>{pending ? "Signing out…" : "Sign out"}</span>
</Button>
```

- [x] **Step 6: Run focused tests, accessibility-sensitive component suite, and build**

Add a Playwright journey using the local Supabase helpers: seed and sign in a completed user, reject non-exact confirmation and a wrong current password, confirm the dialog with valid inputs, assert the isolated sign-in completion state and namespaced browser-state cleanup, assert the Auth user is soft-deleted and the profile is a tombstone, prove privileged history remains, and prove a second pre-existing session cannot directly read that private history or perform an authenticated mutation. The journey must not call a hosted project. Shared sign-out journeys also seed Huddle and unrelated tab keys to prove bounded cleanup.

Run:

```bash
npx vitest run \
  features/account-erasure/components/delete-account-control.test.tsx \
  app/account/security/page.test.tsx app/auth/sign-in/page.test.tsx \
  features/auth/components/sign-out-button.test.tsx
npm run typecheck
npm run build:local
npm run test:e2e -- --grep "account deletion removes identity"
```

Expected: all commands exit 0.

- [ ] **Step 7: Commit only after publication is explicitly authorized**

```bash
git add features/account-erasure/components app/account/security \
  app/auth/sign-in features/auth/components/sign-out-button.tsx \
  features/auth/components/sign-out-button.test.tsx tests/e2e/auth.spec.ts
git commit -m "feat(account): add deletion danger zone"
```

### Task 4: Contract documentation and complete verification

**Files:**
- Modify: `docs/HUDDLE-IMPLEMENTATION-SPEC.md`
- Modify: `docs/HUDDLE-ARCHITECTURE.md`
- Modify: `docs/HUDDLE-STEP-BY-STEP-BUILD-SPEC.md`
- Modify: `README.md`
- Modify: `docs/operations/PRODUCTION-ACCEPTANCE.md`

**Interfaces:**
- Documents: the exact implemented lifecycle, service-role exception, retained-data disclosure, and production acceptance evidence.

- [x] **Step 1: Update the authoritative contract**

Add `/account/security` account deletion to the route table and journeys. Record immediate pseudonymous soft deletion, current-password plus typed confirmation, exact data removal/retention, owned-object archival, stale-JWT gates, and the tightly authenticated server-only admin call. Remove “Account-erasure flow later.”

- [x] **Step 2: Update architecture, build checklist, README, and acceptance record**

Keep statements factual: code existence is not production migration evidence. Record the hosted Auth template replacement as dated operational evidence only because the guarded `--apply` and `--check` actually passed; leave fresh-email/browser acceptance unchecked until performed.

- [x] **Step 3: Run the complete quality gates**

Run:

```bash
npm test
npm run typecheck
npm run lint
npm run format:check
npm run db:reset
npm run db:lint
npm run test:db
npm run db:types:check
npm run build:local
npm run test:e2e
npm run test:acceptance
npm run security:audit
```

Expected: every command exits 0. If any gate fails, preserve the output and fix the smallest root cause before rerunning the failing gate and the full final set.

- [x] **Step 4: Review the complete diff**

Run `git diff --check`, inspect every changed file, and confirm no secrets, credentials, raw email addresses, private locations, generated artifacts, debug output, or unrelated changes are present.

- [ ] **Step 5: Commit only after publication is explicitly authorized**

```bash
git add docs README.md
git commit -m "docs(account): record account erasure lifecycle"
```
