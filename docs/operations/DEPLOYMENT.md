# Preview and production deployment

This runbook prepares deployment; it is not authorization to create, link, migrate,
or mutate a hosted project. Both owners must explicitly approve those actions and
identify the exact Vercel and Supabase targets first.

## Environment isolation

| Environment | Supabase | Vercel | Guard |
|---|---|---|---|
| Local | repository-managed Docker stack | local Next.js | `HUDDLE_ENVIRONMENT=local` |
| Preview | dedicated non-production project | Preview variables only | `HUDDLE_ENVIRONMENT=preview`; must not use production URL/project |
| Production | dedicated production project | Production variables only | `HUDDLE_ENVIRONMENT=production`; HTTPS required |

`next.config.ts` parses every required variable before a build starts. A hosted URL
must be HTTPS, and Vercel's `VERCEL_ENV` must agree with `HUDDLE_ENVIRONMENT`.
Automatically exposed Vercel system variables supply the stable Preview branch hostname;
the build validates that it is a `vercel.app` hostname, derives the HTTPS
`NEXT_PUBLIC_APP_URL`, and injects that same public origin into the client build. The
validated system hostname is authoritative even if a stale manual Preview URL is
accidentally configured. Local and Production continue to require an explicit
`NEXT_PUBLIC_APP_URL`.

Every required Preview value must target the project-wide `Preview` environment. Do not
attach `NEXT_PUBLIC_APP_URL`, Supabase credentials, or enabled feature credentials to an
individual Git branch: branch-specific values override generic Preview values and make
the next pull request non-reproducible. Safe key-name templates are in
`.env.preview.example` and `.env.production.example`. Values belong only in
Vercel/Supabase managed secret stores.

## One-time hosted setup order

1. Confirm the final Vercel plan/team can connect the `gethuddle/huddle` GitHub
   organization repository. Current Vercel documentation says Hobby teams cannot;
   do not improvise around this boundary.
2. Identify separate preview and production Supabase project refs and URLs. Confirm
   both owners have the intended access and that no local CLI is accidentally linked.
3. From a clean reviewed commit, prove `npm run test:acceptance` locally and green CI.
4. Review the migration list. Apply all committed migrations to preview, verify parity,
   then apply the same ordered set to production **before** deploying code that uses it.
   Never hand-edit production schema or use `db reset` against a hosted project.
5. Configure the Supabase Auth site URL and allowed redirects for each environment.
   The non-production Supabase project may use Vercel's documented
   `https://*-<team-or-account-slug>.vercel.app/**` Preview wildcard; Production uses
   exact paths for its own HTTPS origin, including `/auth/verify/confirm` and
   `/auth/reset-password/confirm`, and never a Preview wildcard. Production custom SMTP
   uses the verified Resend `auth.huddle.co.il` sending domain. The confirmation, recovery,
   and password-changed templates under `supabase/templates/` are complete replacement
   documents: never paste them below existing dashboard content. With explicit hosted
   authorization, run `npm run auth:config:apply`; then use `npm run auth:config:check`
   with both `AUTH_CONFIG_TARGET` (`preview` or `production`) and the exact
   `AUTH_CONFIG_SITE_URL` exported. Production accepts only `https://huddle.co.il`;
   Preview accepts only one HTTPS `vercel.app` origin. The script also binds each target
   to its reviewed, checked-in public Supabase project reference, preventing either
   project from silently receiving the other environment's Auth configuration. The check
   proves the exact templates, site URL/allowlist, 15-character minimum, 100-email/hour
   project cap, the 24-hour email-nonce reauthentication control, and password-changed
   notification match.
   The 100/hour value removes Supabase's lower custom-SMTP default but does not bypass the
   shared Resend account's daily/monthly allowance or Supabase's per-address cooldowns. The
   Management API does not expose Supabase's separate **Require current password when
   updating** switch: enable that switch in **Authentication → Sign In / Providers →
   Email** in Studio, then independently verify it remains enabled. Do not enable
   Supabase's built-in CAPTCHA; Huddle verifies Turnstile in its Vercel Server Actions.
   Neither configuration command prints template bodies or secrets. Preview redirects
   must not point to production and production redirects must not contain wildcard
   preview hosts. Disable provider click tracking for Auth mail.

   ```bash
   AUTH_CONFIG_TARGET=production \
   AUTH_CONFIG_SITE_URL=https://huddle.co.il \
   SUPABASE_PROJECT_REF=the-reviewed-production-ref \
   SUPABASE_ACCESS_TOKEN=the-managed-access-token \
   npm run auth:config:check
   ```
   The HTML displays `public/brand/huddle-email-icon.png`. The inbox sender avatar is
   separate from email HTML and SMTP: Gmail requires a Google profile using the exact
   sender address, while cross-provider display requires later BIMI/DMARC certificate
   work. Do not claim the PNG alone controls the sender icon.
6. Enable Vercel's automatically exposed system environment variables. Configure every
   required and conditionally enabled name from the matching example at the project-wide
   Preview or Production scope. Use different service-role, sync, cursor, and signing
   secrets per environment. Confirm the scope inventory with `vercel env ls preview` and
   `vercel env ls production`; this command reports names/scopes without revealing values.
   `AUTH_RECOVERY_TOKEN_SECRET` must be a new environment-specific high-entropy value.
   When Auth Turnstile is enabled, also set `NEXT_PUBLIC_TURNSTILE_SITE_KEY`,
   `AUTH_TURNSTILE_ENABLED=true`, `TURNSTILE_SECRET`, and an exact production
   `TURNSTILE_HOSTNAMES=huddle.co.il`.
7. Deploy preview and run anonymous/signed-in smoke checks without production data.
   Then deploy the exact accepted commit to production.
8. Run `npm run test:production:session`. It creates Auth sessions and may update
   sign-in metadata but performs no product-domain mutation. Only after preparing dedicated accounts
   and a fresh eligible test event, explicitly authorize `npm run test:production`.
9. Inspect client JavaScript, HTML, network responses, Vercel logs, and Supabase logs
   for forbidden secrets/private data. Record only safe request/run IDs and outcomes.
10. Configure scheduled sync from [`configure-sports-sync.sql`](../../supabase/production/configure-sports-sync.sql),
    then follow [`PRODUCTION-ACCEPTANCE.md`](./PRODUCTION-ACCEPTANCE.md).

## VB01 Sandbox billing boundary

`VB01` requires a separate explicit authorization before any Polar, Supabase, Vercel,
GitHub, or production mutation. Its exact Sandbox-only inventory, six configuration
names, initial secret/migration/deploy/endpoint/scheduler order, recovery procedures,
and rotation limits are in
[`POLAR-SANDBOX-BILLING.md`](./POLAR-SANDBOX-BILLING.md). Initial deployment uses a
random temporary webhook secret and a blocked network guard. Create the Raw Polar
endpoint only after the final HTTPS route is reachable without a redirect, then
privately install its generated secret and redeploy while checkout stays blocked.
Verify unsigned rejection and a non-mutating signed application smoke before enabling
Sandbox checkout; distinguish this from the first real Polar delivery during checkout.
Only the authorized live
`huddle.co.il` Sandbox demo may enable provider calls; Preview/local/CI retain
synthetic configuration and `HUDDLE_AUTOMATION_BLOCK_POLAR_NETWORK=true`.

The production Auth smoke must include dedicated accounts: prove a duplicate signup sends
no second confirmation; prove GET/prefetch leaves a fresh link usable; explicitly Continue;
open recovery while another account is signed in; prove direct reset is denied; replace the
password; confirm the current session is always cleared and either prove the other sessions are revoked or
observe the honest unconfirmed-revocation warning; receive the password-changed notification; and
sign in with the new password. Do not record email links, tokens, codes, passwords,
Turnstile responses, actor IDs, or Auth cookies as evidence.

## Migration parity evidence

Record the accepted Git SHA, ordered migration filenames, hosted migration-history
output, generated-type drift result, deployment identifier, and timestamp. Evidence
must identify the project without publishing keys or database credentials.

## Rollback boundary

If a migration fails, stop deployment, preserve the database and exact error, fix it
with a reviewed forward migration, and rerun local reset/pgTAP/type drift. If the app
fails after a successful compatible migration, roll Vercel back to the last compatible
deployment while retaining the schema. Destructive database restore requires a
verified backup and separate explicit approval from both owners.

Sources: [Vercel limits](https://vercel.com/docs/limits),
[Supabase local/migration workflow](https://supabase.com/docs/guides/local-development/cli/getting-started),
[Supabase Auth redirect URLs](https://supabase.com/docs/guides/auth/redirect-urls),
[Supabase password security](https://supabase.com/docs/guides/auth/password-security),
[Supabase default SMTP limits](https://supabase.com/docs/guides/auth/auth-smtp), and
[Supabase Free template restrictions](https://supabase.com/changelog/46599-changes-to-email-template-customisation-on-free-tier).
