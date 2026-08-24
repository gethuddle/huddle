# Local Supabase contract

F03 keeps the complete local database foundation in Git. It does not connect to the shared Supabase organization or create a hosted project.

## Daily commands

```bash
npm run db:start
npm run db:reset
npm run test:db
npm run db:types
npm run db:types:check
npm run db:stop
```

`db:reset` is explicitly local and replays every migration followed by `seed.sql`. The first `db:start` downloads the pinned local images and therefore takes longer.

## Schema conventions

- Primary keys use `uuid primary key default gen_random_uuid()`.
- Stored dates use `timestamptz`; mutable tables use `created_at` and `updated_at`, both `not null default statement_timestamp()`.
- Mutable tables attach `private.set_updated_at()` with a `before update` row trigger.
- Public slugs and handles use `extensions.citext` and are normalized to lowercase at the validation boundary.
- Coordinates use `extensions.geography(Point, 4326)`.
- Every exposed table enables and forces RLS in the same migration that creates it, with explicit policies and pgTAP allowed/denied tests.
- Security-definer functions require an empty fixed `search_path`, schema-qualified objects, an `auth.uid()` check, minimum grants, and dedicated pgTAP coverage.

The product enum list is approved in the implementation specification but deliberately deferred. Each enum will be introduced by the first domain migration that consumes it so the type, owning table, constraints, RLS, and tests are reviewed together; F03 does not create unused schema objects.

The committed seed is intentionally empty until a domain table exists. Future fixtures must use stable UUIDs, be repeatable after a full reset, and require no hosted account, provider token, or network access.
