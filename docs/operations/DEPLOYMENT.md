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
   exact paths for its own HTTPS origin, including `/auth/verify/callback` and
   `/auth/reset-password/callback`, and never a Preview wildcard. Copy the repository
   confirmation and recovery templates from `supabase/templates/` into the hosted Auth
   email-template settings only when the hosted project permits customization; the local
   file paths are not uploaded automatically. Newer Free projects using Supabase's
   default email provider cannot customize templates. Keep the default templates in that
   configuration—their confirmation URL honors Huddle's explicit redirect—and upload the
   repository templates only after configuring custom SMTP or an eligible plan. The
   default provider is suitable only for team-authorized course-demo addresses and its
   small email limit; public delivery requires custom SMTP. Preview redirects must not
   point to production and production redirects must not contain wildcard preview hosts.
6. Enable Vercel's automatically exposed system environment variables. Configure every
   required and conditionally enabled name from the matching example at the project-wide
   Preview or Production scope. Use different service-role, sync, cursor, and signing
   secrets per environment. Confirm the scope inventory with `vercel env ls preview` and
   `vercel env ls production`; this command reports names/scopes without revealing values.
7. Deploy preview and run anonymous/signed-in smoke checks without production data.
   Then deploy the exact accepted commit to production.
8. Run `npm run test:production:session`. It creates Auth sessions and may update
   sign-in metadata but performs no product-domain mutation. Only after preparing dedicated accounts
   and a fresh eligible test event, explicitly authorize `npm run test:production`.
9. Inspect client JavaScript, HTML, network responses, Vercel logs, and Supabase logs
   for forbidden secrets/private data. Record only safe request/run IDs and outcomes.
10. Configure scheduled sync from [`configure-sports-sync.sql`](../../supabase/production/configure-sports-sync.sql),
    then follow [`PRODUCTION-ACCEPTANCE.md`](./PRODUCTION-ACCEPTANCE.md).

The production Auth smoke must include a dedicated test account: request a reset,
open the received link on the production origin, replace the password, confirm the
recovery session returns to sign in, and sign in with the new password. Do not record
the email link, token, code, password, or Auth cookies as evidence.

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
[Supabase default SMTP limits](https://supabase.com/docs/guides/auth/auth-smtp), and
[Supabase Free template restrictions](https://supabase.com/changelog/46599-changes-to-email-template-customisation-on-free-tier).
