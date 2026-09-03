# B11 security checklist

This is the implementation inventory for the course MVP as of B11. It records
enforcement boundaries and residual risks; it is not a claim that the pilot has
production security staffing.

## Exposed database boundary

- Every `public` application table has RLS enabled and forced. The B11 pgTAP
  inventory fails if any exposed table loses either flag.
- Confidential tables (`reports`, `moderation_actions`, `moderation_appeals`,
  audit events, invitations, attendance, private locations, invite tokens) deny
  direct client reads. Narrow security-definer functions return only the fields
  authorized for the current actor.
- All mutations derive the actor from `auth.uid()` and recheck current email,
  rules, adult attestation, profile completion, restriction, suspension,
  ownership, blocking, group-ban, event, and attendance state as applicable.
- Friend requests, group applications and invite creation, event creation, and
  ordinary reports use durable database cooldowns under transaction locks.
  Immediate-danger reports bypass the report-volume gate so safety help remains
  reachable.
- Report targets, moderation targets, action state, appeal state, lengths,
  foreign keys, and one-active-appeal uniqueness are database invariants with
  direct denial tests.

## Server Action inventory

Next.js keeps its default same-origin Server Action check; B11 does not configure
an origin bypass. Action bodies are limited to 256 KB. Every action below parses
untrusted form values with a bounded Zod schema before its database RPC. The RPC
derives the actor again rather than trusting hidden inputs.

| Domain file | Mutations covered | Actor boundary |
|---|---|---|
| `features/auth/actions.ts` | sign up, sign in, password-recovery request/update, known-password change, cancel recovery, sign out | Supabase Auth; bounded credentials; generic public responses; optional action-bound Turnstile; session-bound recovery grant or current-password reauthentication; requested global sign-out plus mandatory local cleanup and an honest unconfirmed-revocation state after replacement |
| `features/profiles/actions.ts` | profile completion/update | onboarding actor plus profile RPC |
| `features/safety/actions.ts` | block/unblock | current actor plus canonical-pair lock |
| `features/friendships/actions.ts` | request/respond/remove | complete community actor plus pair/cooldown checks |
| `features/groups/actions.ts` | create group | complete community actor plus similarity checkpoint |
| `features/groups/membership-actions.ts` | applications, reviews, invites, roles, bans, rules, event review | complete actor plus server-side group role hierarchy |
| `features/subscriptions/actions.ts` | sport/competition/team follows | complete community actor and exactly-one-target RPC |
| `features/venues/actions.ts` | venue create/update/follow | complete community actor plus owner/eligibility RPC |
| `features/events/actions.ts` | private and venue event save | complete community actor plus host/audience transaction |
| `features/attendance/actions.ts` | invitations, request/join, review, leave/remove, cancel | current actor plus event lock, audience and capacity checks |
| `features/moderation/actions.ts` | report, assign/dismiss, enforcement, reversal, appeal/review | safety actor for report/appeal; platform role for moderation |

## Route Handler inventory

| Route | Method and input | Authorization/cache boundary |
|---|---|---|
| `/api/discovery` | read-only `GET`; bounded Zod query | personalized/browser-location responses are `no-store`; uncertain auth fails closed |
| `/api/assisted-discovery` | read-only `POST`; max 4 KB JSON and 400-character sentence | active Fan only; `no-store`; Cloudflare sees sentence/time only; Huddle resolves a named public place through its bounded server-side OpenStreetMap adapter and never sends the coordinate to Cloudflare; database re-authorizes every result |
| `/api/groups/search` | read-only `GET`; bounded Zod query | member-dependent results are `no-store` |
| `/api/events/[eventId]/calendar.ics` | read-only `GET`; UUID route input | public venue calendar may cache; private output is authorized, audited and `no-store` |
| `/api/internal/sports-sync` | `POST`; max 4 KB JSON plus Zod | constant-time server secret check, service role only after authorization, always `no-store` |
| `/auth/verify/confirm` + `/consume` | passive `GET` page; explicit same-origin `POST`; exactly one bounded email token hash or purpose-matched signup PKCE code | fragment stripped before POST; ambient local session switched; cross-purpose code rejected and cleaned up; provider credential omitted from destination; `no-store` |
| `/auth/reset-password/confirm` + `/consume` | passive `GET` page; explicit same-origin `POST`; exactly one bounded recovery token hash or purpose-matched recovery PKCE code | fragment stripped before POST; cross-purpose code rejected and cleaned up; verified Supabase user/session bound to a five-minute HMAC grant; `no-store` |
| Legacy `/auth/*/callback` | read-only `GET` | never contacts Supabase Auth or consumes a one-time credential; redirects to one expired-link state with `no-store` |

Normal page requests never call the sports provider. GET handlers do not mutate
product state; the private-location calendar helper may write only its required
address-free security audit record.

## Browser and hosting controls

- CSP restricts default, object, base, form, frame, connection, image, font, and
  script/style sources. Turnstile's script, frame, and connection origin is explicit;
  development alone permits `unsafe-eval` for Next tooling.
- `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, strict referrer
  policy, a minimal permissions policy, and same-origin opener policy apply to
  every route.
- HSTS and `upgrade-insecure-requests` apply only in production, where HTTPS is
  expected.
- Redirects must be relative and match the repository-owned internal prefix
  allowlist; absolute, protocol-relative, control-character, and backslash forms
  fail closed.
- Structured logs accept only request/run identifiers, route/action names,
  outcome/code/status, duration/count/age/quota metrics. They do not accept user
  text, tokens, cookies, report details, or addresses.
- Discovery and calendar/search/sync routes log bounded duration and outcome.
- Assisted discovery logs only fixed route/outcome/provider-failure fields, duration, and result count. It never logs the sentence, named-place phrase, entity names, actor, origin, model payload, or result identifiers; the continuation token also excludes the phrase and origin.
  Fixture reads log the age/status of the last successful catalog import. Sports
  sync logs request/retry counts and the provider's numeric remaining-quota
  response header when present; the durable sync row also retains run outcome.
- B11 report, enforcement, reversal, and appeal failures log only a request ID,
  fixed action name, and mapped public error code. Repeated denied sync requests
  also leave address-free database audit evidence.
- `npm run security:audit` compares non-placeholder local secret values against
  tracked and untracked repository files, Git history, build output, coverage,
  and Playwright artifacts without printing the values.

## Honest residual risks

- Email verification is not identity verification; adult attestation is not age
  verification.
- An unverified venue profile may be false until a real verification process is
  funded and operated.
- A host or approved attendee can copy a home address after seeing it. Revoking
  later access cannot erase prior knowledge.
- Users can misstate location, profile, report, and event information.
- Database cooldowns are suitable for the course pilot but are weaker than a
  distributed edge abuse-control service.
- Conditional Turnstile reduces automated credential-form abuse but does not replace
  Supabase throttles, non-enumerating copy, monitoring, or recovery-session binding.
- There is no automated toxicity or media analysis and no staffed 24/7 emergency
  response. Immediate danger belongs with local emergency services first.
- Static CSP uses `unsafe-inline` for current Next.js compatibility. A nonce-based
  policy is a future hardening task.
- Sports-provider availability, correctness, quota behavior, and terms remain
  external dependencies; the last good catalog is retained on sync failure.
- Cloudflare intent extraction is an external dependency. Invalid output, timeout,
  or free-quota exhaustion disables only the assisted search and returns ordinary
  Explore/Plan actions; it never broadens results or bypasses database authorization.
- Timed restrictions and account suspensions have a review deadline but remain
  enforced until a moderator records an audited reversal. The two-owner course
  MVP has no unattended scheduler that silently changes moderation state.
