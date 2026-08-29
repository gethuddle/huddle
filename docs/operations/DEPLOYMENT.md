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
Safe key-name templates are in `.env.preview.example` and `.env.production.example`.
Values belong only in Vercel/Supabase managed secret stores.

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
5. Configure Supabase Auth site URL, allowed redirects, and Huddle confirmation email
   template for each environment's own HTTPS origin. Preview redirects must not point
   to production and production redirects must not contain wildcard preview hosts.
6. Configure all eight environment names from the matching example. Use different
   service-role, sync, cursor, and provider secrets per environment.
7. Deploy preview and run anonymous/signed-in smoke checks without production data.
   Then deploy the exact accepted commit to production.
8. Run `npm run test:production:session`. It creates Auth sessions and may update
   sign-in metadata but performs no product-domain mutation. Only after preparing dedicated accounts
   and a fresh eligible test event, explicitly authorize `npm run test:production`.
9. Inspect client JavaScript, HTML, network responses, Vercel logs, and Supabase logs
   for forbidden secrets/private data. Record only safe request/run IDs and outcomes.
10. Configure scheduled sync from [`configure-sports-sync.sql`](../../supabase/production/configure-sports-sync.sql),
    then follow [`PRODUCTION-ACCEPTANCE.md`](./PRODUCTION-ACCEPTANCE.md).

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
and [Supabase Auth redirect URLs](https://supabase.com/docs/guides/auth/redirect-urls).
