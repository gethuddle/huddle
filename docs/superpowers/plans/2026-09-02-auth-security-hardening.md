# Authentication Security Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close Huddle's password-reset authorization hole and deliver a consistent, non-enumerating, scanner-safe authentication and email experience.

**Architecture:** Supabase continues to own identity, password storage, one-time email credentials, and sessions. Huddle adds explicit POST confirmation, a short-lived HMAC recovery grant bound to the verified Supabase session, isolated auth chrome, direct Turnstile Siteverify checks, current-password reauthentication for ordinary changes, and repository-owned complete email templates.

**Tech Stack:** Next.js 16 App Router, React 19, strict TypeScript, Supabase Auth/SSR, Zod, repository-owned shadcn components, Cloudflare Turnstile, Vitest/RTL, Playwright, Mailpit.

**Spec:** `docs/superpowers/specs/2026-09-02-auth-security-hardening-design.md`

## Global Constraints

- Registration and recovery responses remain generic and non-enumerating.
- Supabase Auth remains the only password/session authority; never use service-role account lookup for browser copy.
- New and replacement passwords are 15–72 characters; sign-in continues accepting existing non-empty credentials up to 72 characters.
- Auth credentials, passwords, Turnstile tokens, actor IDs, emails, and Auth cookies are never logged.
- Auth confirmation happens only after an explicit same-origin POST; GET is passive and no-store.
- Turnstile is disabled in local/CI unless explicitly configured, and enabled mode fails closed.
- Production Turnstile hostname validation is exactly `huddle.co.il`; local hostnames never enter the production allowlist.
- Use repository-owned shadcn controls and brand assets; do not add another form/state library.
- No Git commit, push, pull request, or hosted mutation occurs without the repository's required current-user authorization. This plan therefore leaves changes uncommitted until publication is requested.

---

### Task 1: Security primitives and environment contract

**Files:**
- Create: `features/auth/recovery-grant.ts`
- Create: `features/auth/recovery-grant.test.ts`
- Create: `features/auth/turnstile.ts`
- Create: `features/auth/turnstile.test.ts`
- Modify: `features/auth/schemas.ts`
- Modify: `features/auth/schemas.test.ts`
- Modify: `lib/env/schema.ts`
- Modify: `lib/env/schema.test.ts`
- Modify: `lib/env/public.ts`
- Modify: `lib/env/server.ts`
- Modify: `.env.example`
- Modify: `.env.preview.example`
- Modify: `.env.production.example`

**Interfaces:**
- Produces: `issueRecoveryGrant({ userId, sessionId }, secret, now?)`, `verifyRecoveryGrant(token, { userId, sessionId }, secret, now?)`, `RECOVERY_GRANT_COOKIE_NAME`, `recoveryGrantCookieOptions(environment)`.
- Produces: `verifyTurnstile(formData, expectedAction, environment, requestHeaders?)` where action is `signup | login | password_reset`.
- Produces: `signInSchema`, `signUpSchema`, `passwordUpdateSchema`, and `knownPasswordUpdateSchema` with separate legacy sign-in/new-password rules.

- [x] **Step 1: Write failing schema, recovery-grant, Turnstile, and environment tests**

Cover 15/72 password boundaries, legacy eight-character sign-in, grant round-trip/tamper/expiry/actor/session binding/no secret fields, Siteverify success/action/hostname/token-length/timeout/non-JSON failures, and conditional environment variables.

- [x] **Step 2: Run the focused tests and confirm red state**

Run: `npm test -- features/auth/schemas.test.ts features/auth/recovery-grant.test.ts features/auth/turnstile.test.ts lib/env/schema.test.ts`

Expected: failures for missing exports and the old eight-character new-password policy.

- [x] **Step 3: Implement strict primitives**

The grant payload is:

```ts
{
  version: 1,
  purpose: "password_recovery",
  userId: string,
  sessionId: string,
  issuedAt: number,
  expiresAt: number,
}
```

Sign `base64url(JSON)` with HMAC-SHA256 and compare signatures with `timingSafeEqual`. Give the cookie a five-minute maximum age, `HttpOnly`, `SameSite=Lax`, path `/`, and `Secure` outside local.

Turnstile posts URL-encoded `secret`, `response`, and the first trusted forwarded IP to `https://challenges.cloudflare.com/turnstile/v0/siteverify` with an eight-second timeout. Parse the response through a strict Zod schema and require `success`, action equality, and membership in the comma-separated hostname allowlist.

- [x] **Step 4: Run focused tests to green**

Run the Step 2 command and require exit 0.

- [x] **Step 5: Review the diff without committing**

Run: `git diff --check && git diff -- features/auth lib/env .env.example .env.preview.example .env.production.example`

### Task 2: Isolated auth chrome and signed-in route behavior

**Files:**
- Create: `components/layout/auth-header.tsx`
- Modify: `components/layout/app-shell.tsx`
- Modify: `components/layout/app-shell-frame.tsx`
- Modify: `components/layout/app-shell.test.tsx`
- Modify: `app/auth/sign-in/page.tsx`
- Modify: `app/auth/sign-in/page.test.tsx`
- Modify: `app/auth/sign-up/page.tsx`
- Create: `app/auth/sign-up/page.test.tsx`
- Modify: `app/auth/forgot-password/page.tsx`
- Modify: `app/auth/forgot-password/page.test.tsx`
- Modify: `app/auth/verify/page.tsx`
- Modify: `app/auth/verify/page.test.tsx`

**Interfaces:**
- Consumes: server-authenticated `getAppShellState()` and the existing `BrandMark`.
- Produces: auth paths with minimal brand chrome and deterministic signed-in redirects.

- [x] **Step 1: Add failing shell and page tests**

Assert auth routes omit `Home`, `Explore`, workspace switching, and the site footer; signed-in sign-in/sign-up redirect to `/`; signed-in forgot-password redirects to `/account/security`; expired verification offers Sign in and Request another email rather than “Create an account.”

- [x] **Step 2: Run focused tests and confirm failures**

Run: `npm test -- components/layout/app-shell.test.tsx app/auth/sign-in/page.test.tsx app/auth/sign-up/page.test.tsx app/auth/forgot-password/page.test.tsx app/auth/verify/page.test.tsx`

- [x] **Step 3: Implement path-aware chrome and redirects**

`AppShellFrame` uses `usePathname()` and treats `pathname.startsWith("/auth/")` as auth mode. It renders `AuthHeader` instead of the passed ordinary header, applies a bounded auth main width, and omits `SiteFooter`. Pages make server-side identity decisions before rendering forms.

- [x] **Step 4: Run focused tests to green and inspect accessible roles**

Run the Step 2 command and require exit 0.

- [x] **Step 5: Review the diff without committing**

Run: `git diff --check && git diff -- components/layout app/auth`

### Task 3: Turnstile-enabled registration, sign-in, and recovery request

**Files:**
- Create: `features/auth/components/turnstile-widget.tsx`
- Create: `features/auth/components/turnstile-widget.test.tsx`
- Modify: `features/auth/components/sign-up-form.tsx`
- Modify: `features/auth/components/sign-in-form.tsx`
- Modify: `features/auth/components/forgot-password-form.tsx`
- Modify: `features/auth/components/auth-forms.test.tsx`
- Modify: `features/auth/actions.ts`
- Modify: `features/auth/actions.test.ts`
- Modify: `features/auth/state.ts`

**Interfaces:**
- Consumes: `verifyTurnstile`, conditional site key, and actions `signup`, `login`, `password_reset`.
- Produces: hidden `cf-turnstile-response`, widget reset after every response, generic check-inbox redirects, and existing auth action contracts.

- [x] **Step 1: Add failing action and component tests**

Assert enabled submissions cannot reach Supabase without valid Turnstile; disabled local submissions remain deterministic; actions use the correct Turnstile action; successful signup navigates to `/auth/verify`; recovery navigates to `?status=sent`; a retained widget ID is reset after success and failure; exact Supabase duplicate errors remain absent from public state.

- [x] **Step 2: Run tests and confirm red state**

Run: `npm test -- features/auth/actions.test.ts features/auth/components/auth-forms.test.tsx features/auth/components/turnstile-widget.test.tsx`

- [x] **Step 3: Implement the widget and gates**

Use the explicit Turnstile script API, stable per-form widget IDs, hidden form input, accessible “Checking you’re human” status, and reset callbacks. Preserve native Server Actions and all existing credential behavior after the gate.

- [x] **Step 4: Run the tests to green**

Run the Step 2 command and require exit 0.

- [x] **Step 5: Review browser/server separation**

Run: `npm run typecheck && npm run security:audit` and verify `TURNSTILE_SECRET` appears in no Client Component or generated public variable.

### Task 4: Passive email confirmation and scanner-safe POST consumption

**Files:**
- Create: `features/auth/components/auth-link-confirmation.tsx`
- Create: `features/auth/components/auth-link-confirmation.test.tsx`
- Create: `features/auth/link-consumption.ts`
- Create: `features/auth/link-consumption.test.ts`
- Create: `app/auth/verify/confirm/page.tsx`
- Create: `app/auth/verify/confirm/consume/route.ts`
- Create: `app/auth/verify/confirm/consume/route.test.ts`
- Create: `app/auth/reset-password/confirm/page.tsx`
- Create: `app/auth/reset-password/confirm/consume/route.ts`
- Create: `app/auth/reset-password/confirm/consume/route.test.ts`
- Modify: `app/auth/verify/callback/route.ts`
- Modify: `app/auth/verify/callback/route.test.ts`
- Modify: `app/auth/reset-password/callback/route.ts`
- Modify: `app/auth/reset-password/callback/route.test.ts`

**Interfaces:**
- Consumes: token/code schemas and recovery grant issuer.
- Produces: passive fragment reader, same-origin POST handlers, passive legacy expired-link endpoints, explicit ambient-session switch, target session, and no-store redirects.

- [x] **Step 1: Add failing route and UI tests**

Assert GET/prefetch never calls `verifyOtp` or `exchangeCodeForSession`; POST rejects cross-origin/malformed/oversized/ambiguous values; cross-account copy appears without target email; POST signs out ambient local state, verifies one credential, writes only provider cookies plus a recovery grant when appropriate, clears workspace state, and redirects without credential leakage.

- [x] **Step 2: Run the focused tests and confirm red state**

Run: `npm test -- features/auth/link-consumption.test.ts features/auth/components/auth-link-confirmation.test.tsx app/auth/verify/callback/route.test.ts app/auth/reset-password/callback/route.test.ts app/auth/verify/confirm/route.test.ts app/auth/reset-password/confirm/route.test.ts`

- [x] **Step 3: Implement passive pages, POST handlers, and legacy endpoints**

The fragment reader accepts exactly one `token_hash/type` pair or one PKCE `code`, caps each credential at 2048 characters, removes the fragment with `history.replaceState`, and renders a native POST. Route handlers validate `Origin` against `NEXT_PUBLIC_APP_URL`, require an exchanged PKCE code's redirect purpose to match its verification or recovery boundary, use private no-store headers, and keep invalid/expired/used failures indistinguishable.

- [x] **Step 4: Run focused tests to green**

Run the Step 2 command and require exit 0.

- [x] **Step 5: Inspect route outputs for secret leakage**

Run focused tests with verbose output and `rg -n "token_hash|secret-recovery|secret-code" .next 2>/dev/null` after the later build; credentials may appear only in source/test fixtures, never in a final redirect or log statement.

### Task 5: Recovery authorization and Account Security

**Files:**
- Modify: `lib/supabase/session.ts`
- Modify: `lib/supabase/session.test.ts`
- Modify: `features/auth/actions.ts`
- Modify: `features/auth/actions.test.ts`
- Modify: `app/auth/reset-password/page.tsx`
- Modify: `app/auth/reset-password/page.test.tsx`
- Modify: `features/auth/components/reset-password-form.tsx`
- Create: `features/auth/components/change-password-form.tsx`
- Modify: `features/auth/components/auth-forms.test.tsx`
- Create: `app/account/security/page.tsx`
- Create: `app/account/security/page.test.tsx`
- Modify: `app/account/page.tsx`
- Modify: `app/account/page.test.tsx`

**Interfaces:**
- Consumes: recovery grant verification, `getClaims()` session ID, known-password schema.
- Produces: mandatory recovery navigation, grant-protected reset action, `changePasswordAction`, and Account → Security destination.

- [x] **Step 1: Add failing authorization and page tests**

Cover direct reset denial for ordinary sessions; user/session mismatch; expired grant; active grant redirecting app navigation back to reset; successful reset using no current password only with a recovery grant; current-password mismatch; global sign-out; grant/workspace clearing; and Account Security signed-out denial.

- [x] **Step 2: Run focused tests and confirm red state**

Run: `npm test -- lib/supabase/session.test.ts features/auth/actions.test.ts features/auth/components/auth-forms.test.tsx app/auth/reset-password/page.test.tsx app/account/security/page.test.tsx app/account/page.test.tsx`

- [x] **Step 3: Implement recovery and known-password actions**

Use `getClaims()` to obtain `sub` and `session_id`. `updatePasswordAction` refuses ordinary sessions even when `getUser()` succeeds. `changePasswordAction` reauthenticates with the current user's verified email, passes `current_password` to `updateUser`, and maps mismatch to one field-safe message. Both success paths request global sign-out, always clear local Supabase/recovery/workspace and namespaced browser state, revalidate the layout, and hard-redirect to sign in. A confirmed revocation uses `/auth/sign-in?password=changed`; an unconfirmed provider result adds `sessions=unconfirmed` and an honest warning without undoing the completed password update.

- [x] **Step 4: Implement Proxy recovery gate**

While a valid grant is present, allow only the reset/auth endpoints required to finish or cancel recovery. Redirect all ordinary Huddle requests to `/auth/reset-password`. An invalid or expired present grant clears local recovery state and redirects to `/auth/forgot-password?status=expired`.

- [x] **Step 5: Run focused tests to green and inspect cookies**

Run the Step 2 command and require exit 0. Assert cookie flags, requested global sign-out, mandatory local cleanup, and the unconfirmed-revocation path explicitly.

### Task 6: Complete branded email templates and drift-safe deployment

**Files:**
- Modify: `supabase/templates/confirmation.html`
- Modify: `supabase/templates/recovery.html`
- Create: `supabase/templates/password-changed.html`
- Modify: `supabase/templates/templates.test.ts`
- Modify: `supabase/config.toml`
- Create: `scripts/supabase-auth-config.mjs`
- Create: `scripts/supabase-auth-config.test.ts`
- Modify: `package.json`
- Create: `public/brand/huddle-email-icon.png`
- Modify: `docs/operations/DEPLOYMENT.md`
- Modify: `docs/operations/PRODUCTION-ACCEPTANCE.md`
- Modify: `supabase/README.md`
- Modify: `README.md`

**Interfaces:**
- Produces: full replacement confirmation/recovery/security emails, local Auth configuration, `npm run auth:config:check`, and an explicitly invoked hosted apply mode.

- [x] **Step 1: Add failing template and configuration tests**

Assert one doctype, one Huddle header, one primary CTA, no Supabase default prefix, fragment-based confirm URLs, safe fallback link, no external tracking, and password-changed copy with no CTA token. Test hosted payload construction as exact replacement strings and sanitize all CLI output.

- [x] **Step 2: Run focused tests and confirm red state**

Run: `npm test -- supabase/templates/templates.test.ts scripts/supabase-auth-config.test.ts`

- [x] **Step 3: Build the templates and deterministic config tool**

Use a light table layout, canonical `{{ .SiteURL }}/brand/huddle-email-icon.png`, accessible text, one action button, and a plain-link fallback. The config tool reads `SUPABASE_ACCESS_TOKEN` and project ref only in explicit apply/check mode, requires a named Preview/Production target with a matching HTTPS origin, never prints templates or secret-bearing responses, and patches the complete fields including the deliberate 100-email/hour project cap.

- [x] **Step 4: Generate and visually inspect the email icon**

Convert the approved app icon to a square PNG with transparent background and inspect it at original resolution. Do not alter the source SVG.

- [x] **Step 5: Run tests to green and render local Mailpit messages**

Run the Step 2 command, then start/reset local Supabase and inspect confirmation, recovery, and password-changed output in Mailpit at desktop and narrow widths.

### Task 7: End-to-end auth regressions and documentation truth

**Files:**
- Modify: `tests/e2e/auth.spec.ts`
- Modify: `docs/HUDDLE-IMPLEMENTATION-SPEC.md`
- Modify: `docs/HUDDLE-ARCHITECTURE.md`
- Modify: `docs/HUDDLE-STEP-BY-STEP-BUILD-SPEC.md`
- Modify: `docs/security/SECURITY-CHECKLIST.md` (or the repository's actual security checklist path found during implementation)
- Modify: `README.md`

**Interfaces:**
- Consumes: all prior auth behavior.
- Produces: user-level regression proof and truthful A01/B13 evidence.

- [x] **Step 1: Add failing Playwright journeys**

Add exact duplicate signup/no Mailpit delivery, passive verification GET, explicit Continue, signed-in different-account recovery warning and switch, direct reset denial, used/expired recovery, current-password mismatch/success, post-change global sign-out, and fresh sign-in. Use local Supabase/Mailpit only; Turnstile remains disabled in CI.

- [x] **Step 2: Run only the auth journeys and fix product defects**

Run: `node scripts/with-local-supabase-env.mjs playwright test tests/e2e/auth.spec.ts`

Expected: all auth journeys pass with no live external provider call.

- [x] **Step 3: Update normative and operational documentation**

Record POST-only email credential consumption, recovery grant/session binding, generic duplicate-signup behavior, Account Security, conditional Turnstile, password policy, complete template replacement, sender-avatar limitation, and hosted rollout requirements. Remove the stale README claim that custom SMTP/templates remain pending.

- [x] **Step 4: Run documentation and secret scans**

Run: `npm run format:check && npm run security:audit && git diff --check`.

### Task 8: Complete verification and guarded hosted rollout

**Files:**
- Modify only if a failed gate exposes a defect.
- Hosted targets: Cloudflare Turnstile widget, Vercel environment variables, Supabase Auth configuration/templates, Gmail sender profile.

**Interfaces:**
- Produces: local gate evidence and, only after explicit authorization for hosted mutation, production configuration evidence without secrets.

- [x] **Step 1: Run repository quality gates**

Run in order:

```bash
npm test
npm run typecheck
npm run lint
npm run format:check
npm run db:start
npm run db:reset
npm run db:lint
npm run test:db
npm run db:types:check
npm run build:local
npm run test:e2e
npm run security:audit
```

Read every exit code and retain exact assertion/journey counts.

- [x] **Step 2: Review complete diff and secret exposure**

Run: `git status --short`, `git diff --stat`, `git diff --check`, and targeted `rg` for credentials. Confirm there are no unrelated changes or live secret values.

- [ ] **Step 3: Probe/create the approved Turnstile widget**

Use the loaded `turnstile-spin` skill. Probe existing Cloudflare authorization, create one managed widget for `huddle.co.il`, `localhost`, and `127.0.0.1` only if the credential has `Account.Turnstile:Edit`, validate its secret without printing it, and store production values in Vercel's managed secret store. Exercise a fresh token once and verify replay rejection.

- [ ] **Step 4: Apply Supabase Auth configuration only after explicit hosted approval**

Exact-replace templates, enable password-changed notifications and the automatable 24-hour email-nonce reauthentication control, set minimum length 15, set the project-wide email cap to 100/hour, and remove wildcard preview redirects. Supply and verify the explicit Production target/origin, then run check mode afterward. Separately enable and verify Supabase Studio's distinct current-password switch, leave built-in CAPTCHA disabled, confirm the shared Resend allowance is not exhausted, and perform production signup/verification/recovery/change-password smoke tests using dedicated test identities.

- [ ] **Step 5: Complete the sender-avatar provider step**

Create or update the Google account for `no-reply@auth.huddle.co.il`, receive its verification through an explicitly configured safe route, upload `public/brand/huddle-email-icon.png`, and verify the avatar in a newly delivered Gmail message. If Google requires manual CAPTCHA/phone/account ownership interaction, stop at that prompt and hand the exact one-step action to the user; do not claim universal sender-icon support.

- [x] **Step 6: Leave the branch ready for publication without mutating GitHub**

Summarize verified gates, remaining provider-interactive steps, hosted changes actually made, and exact files. Wait for an explicit `$huddle-publish-pr` or equivalent publish instruction before commit, push, PR, or review request.
