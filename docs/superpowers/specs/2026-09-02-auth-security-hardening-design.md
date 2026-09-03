# Authentication Security Hardening Design

**Approved:** 2 September 2026

## Goal

Make Huddle account creation, verification, sign-in, password recovery, and password change predictable and secure without revealing whether an email address is registered. Replace the malformed hosted email presentation, isolate every authentication surface from signed-in workspace navigation, add abuse protection, and close the current reset-password authorization gap.

## Confirmed defects

1. `updatePasswordAction` accepts any authenticated Supabase session. A normally signed-in user can visit `/auth/reset-password` and change that account's password without a recovery grant or current password.
2. Verification and recovery credentials are consumed by `GET` callbacks. Link scanners and email prefetchers can therefore use a one-time credential before the person deliberately continues.
3. Recovery verification reuses ambient browser cookies. Opening a recovery link while another account is signed in silently replaces that browser session and renders the reset form inside the ordinary signed-in shell.
4. `/auth/*` routes render the Fan/Venue navigation and footer, and signed-in people can open sign-in, sign-up, and forgot-password forms.
5. Hosted Supabase templates contain a default template followed by the repository template, producing the duplicated email shown in production.
6. The password-changed security notification is disabled. Turnstile is absent. The production Auth redirect allowlist contains wildcard preview hosts even though preview must use a separate Supabase project.
7. Sign-up completion stays in the password-bearing form, the expired-verification action says “Create an account,” and there is no ordinary Account Security password-change flow.

## Preserved behavior

- Registration and recovery responses remain generic. Huddle must not query Auth with a service-role key to tell a browser that an account exists.
- An exact, already-confirmed email receives no new confirmation email from Supabase. An unconfirmed address may receive a resend. Provider-specific aliases such as Gmail `+tag` addresses remain distinct identities; Huddle does not canonicalize them.
- Supabase Auth continues to own passwords and sessions. Huddle stores no password hashes.
- Safe internal `next` redirects, server-side identity checks, cookie-based SSR, and generic credential errors remain intact.

## Authentication surfaces

Every path below `/auth` is an isolated security surface with a compact Huddle brand header, centered content, no workspace switcher, no Fan/Venue navigation, and no ordinary site footer. The shared root shell may still load session state, but ordinary navigation is not rendered on an auth path.

- Signed-in visits to `/auth/sign-in` and `/auth/sign-up` redirect to `/`.
- Signed-in visits to `/auth/forgot-password` remain on the isolated recovery surface with a clear account-switch warning. `/account/security` links there when the person does not know the current password.
- `/auth/reset-password` renders a form only when both the Supabase session and Huddle recovery grant are valid and bound to one another.
- `/account/security` is the signed-in destination for changing a known password.

## Registration and verification

`signUpAction` validates a new password, verifies Turnstile when enabled, calls Supabase `signUp`, and returns the same public result for new, existing, throttled, and temporarily unavailable identities. A successful public result hard-navigates to `/auth/verify` so password fields leave browser memory.

The check-inbox page explicitly offers Sign in and Forgot password without claiming whether an account was created. Exact duplicate-registration behavior is covered against local Supabase and Mailpit.

The confirmation email links to `/auth/verify/confirm#token_hash=...&type=email`. URL fragments are not sent in the HTTP request or Referer. The client reads the bounded fragment and renders a real `POST` form. Merely opening or prefetching the page performs no Auth mutation. Pressing Continue posts the credential to a same-origin, no-store handler, deliberately signs out any ambient local session, verifies the token with Supabase, establishes the verified identity's session, clears stale workspace state, and redirects to onboarding or its existing workspace.

Legacy callback URLs remain passive, no-store endpoints, but they do not forward query credentials into a redirect. They return the same expired-link state without contacting Supabase Auth; this trades compatibility with already-sent short-lived legacy emails for keeping credentials out of response locations and logs.

## Password recovery

The recovery email links to `/auth/reset-password/confirm#token_hash=...&type=recovery`. The passive confirmation page explains that continuing will switch the current browser account when an ambient session exists. It never discloses the target email.

Only an explicit `POST` may:

1. locally sign out the ambient session;
2. verify the one-time recovery credential with Supabase;
3. bind the resulting user and Supabase session ID into a five-minute HMAC-signed grant;
4. set that grant in an `HttpOnly`, `Secure` in hosted environments, `SameSite=Lax`, path-scoped cookie; and
5. redirect to `/auth/reset-password` with no credential in the URL.

The grant contains version, purpose, user ID, Supabase session ID, issued-at time, and expiry. It contains no email, password, token hash, or provider access token. Validation uses a separate `AUTH_RECOVERY_TOKEN_SECRET`, constant-time signature comparison, strict schema validation, actor/session binding, and expiry.

The Proxy treats an active grant as a mandatory recovery state: every non-auth request redirects back to `/auth/reset-password`. This prevents the full Supabase recovery session from being used as an ordinary Huddle session before the password is replaced. Invalid or stale grants are cleared.

`updatePasswordAction` requires both a valid Supabase user/session and a matching recovery grant before calling `updateUser`. Success clears the recovery and workspace cookies, signs out globally, and redirects to normal sign-in. Invalid, expired, already-used, and unverifiable credentials share one public state.

## Known-password change

`/account/security` requires authentication. Its form collects current password, new password, and confirmation. The action reauthenticates the current user's email with the supplied current password, supplies `current_password` to Supabase's password update API, changes the password, revokes all sessions, clears workspace state, and returns to sign-in. Errors do not reveal provider detail.

Hosted Supabase also enables “Require current password when updating.” Supabase exempts provider-recognized recovery sessions from that requirement, providing defense in depth for direct password updates while preserving recovery. This is distinct from the 24-hour email-nonce reauthentication control exposed by the Management API, so the current-password switch is a separately verified Studio step rather than part of `auth:config:check`.

## Password policy

New and replacement passwords use 15–72 characters with no composition rule. Sign-in accepts existing non-empty credentials up to 72 characters so accounts created under the previous eight-character minimum are not rejected in Huddle before Supabase can authenticate them. Hosted and local Supabase minimum password length is aligned to 15. Existing weaker passwords remain usable until changed.

Leaked-password protection is a documented Pro-plan gap; Huddle does not transmit passwords to a separate breach-check provider.

## Turnstile

Turnstile protects sign-up, sign-in, and forgot-password submission with actions `signup`, `login`, and `password_reset`. It is conditional:

- `AUTH_TURNSTILE_ENABLED=false` requires no Turnstile values and keeps deterministic local/CI tests offline.
- Enabling it requires `NEXT_PUBLIC_TURNSTILE_SITE_KEY`, `TURNSTILE_SECRET`, and `TURNSTILE_HOSTNAMES`.
- Each client component retains its widget ID, supplies `cf-turnstile-response`, and resets the widget after every completed same-page action.
- Each Server Action calls Siteverify directly, fails closed on timeout/network/non-JSON/non-2xx responses, and requires `success`, the expected action, and an allowlisted hostname.
- Production hostnames contain `huddle.co.il` only. Local widget domains also include `localhost` and `127.0.0.1`, but production backend hostname validation never does.

No Worker is deployed and the Turnstile secret is never sent to Supabase or the browser.

## Email presentation and operations

Repository templates are the sole source for confirmation, recovery, and password-changed messages. They use a light, table-based, mobile-safe Huddle layout with one primary CTA, a plain fallback URL, concise security copy, and the repository brand asset served from the canonical site. The hosted deployment operation replaces the complete template string; it never appends.

Template tests reject a second doctype/default-template prefix, enforce exactly one primary action, validate the callback/fragment contract, and cover the security notification. A deployment/verification script requires an explicit Preview or Production target and matching HTTPS site origin, then compares normalized hosted configuration with repository sources without printing credentials or message content. It sets Supabase's project-wide email cap to 100/hour so the platform is not more restrictive than the selected shared SMTP allowance; Resend's account-wide daily/monthly quota and Supabase's per-address cooldowns still apply.

The in-message Huddle logo ships with the template. The mailbox sender avatar is not an SMTP/HTML property. The free Gmail-specific operational path is to create a Google account for the exact sender `no-reply@auth.huddle.co.il` and upload the Huddle application icon. Universal BIMI is deferred because Gmail requires a CMC/VMC and is not a free code-only change.

## Hosted configuration

After code and local gates pass:

- replace confirmation and recovery templates and enable the password-changed notification;
- deliberately set `rate_limit_email_sent` to 100/hour and monitor the shared Resend account allowance across its projects;
- apply the automatable 24-hour email-nonce reauthentication control and 15-character minimum, then separately enable and verify Studio's distinct current-password enforcement switch;
- keep Supabase's built-in CAPTCHA disabled because Huddle verifies Turnstile itself in Vercel;
- remove wildcard Vercel preview redirect URLs from the production Auth allowlist while retaining `https://huddle.co.il` and the exact production alias if still used;
- create a managed Turnstile widget for `huddle.co.il`, `localhost`, and `127.0.0.1`, then store its site key and secret in the correct Vercel environments;
- add a separate generated `AUTH_RECOVERY_TOKEN_SECRET` to Vercel Production and Preview;
- never print or commit any secret.

Hosted mutation is performed only after the repository implementation passes its relevant gates. Sender-avatar account creation remains a manual provider-account step because Google may require interactive identity and anti-abuse verification.

## Verification

- Unit tests: password schemas, grant signing/tamper/expiry/session binding, Turnstile success/failure/action/hostname/timeout, generic registration/recovery responses, current-password enforcement, and safe cookie clearing.
- Component/page tests: isolated auth chrome, signed-in redirects, passive confirmation, cross-account warning, loading/error states, direct reset denial, Account Security, keyboard use, and live regions.
- Route tests: GET never calls Supabase, POST consumes one bounded credential, no-store headers, ambient local sign-out, clean target session, grant issue, malformed/expired indistinguishability, and passive legacy-callback behavior.
- E2E: exact duplicate signup sends no new confirmation, verification requires Continue, scanner-style GET does not consume a token, signed-in same/different-account recovery, direct reset denial, current-password change, global sign-out, expired/reused links, and normal sign-in afterward.
- Existing typecheck, lint, format, build, Playwright, acceptance, and security audit remain required before publication.
