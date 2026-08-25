# Local Supabase contract

F03 keeps the complete local database foundation in Git, B01 adds the local Auth email-verification path, and B02 adds identity/trust tables and controlled functions. None of these local commands connects to the shared Supabase organization or creates or mutates a hosted project.

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

## Local Auth verification

`supabase/config.toml` requires email confirmation and loads the tracked Huddle confirmation template. Local Auth sends that message only to Mailpit at `http://127.0.0.1:54324`; it never sends external email. The template carries a one-time token hash to the fixed `/auth/verify/callback` route, which validates the query, verifies the token with Supabase Auth, writes the SSR session cookies, applies private no-store headers, and redirects without carrying the token forward.

Use `npm run dev:local`, `npm run build:local`, and `npm run test:e2e` to inject the currently running local stack values without copying or printing them. Hosted redirect URLs and hosted email templates belong to the later environment/deployment milestone.

## Schema conventions

- Primary keys use `uuid primary key default gen_random_uuid()`.
- Stored dates use `timestamptz`; mutable tables use `created_at` and `updated_at`, both `not null default statement_timestamp()`.
- Mutable tables attach `private.set_updated_at()` with a `before update` row trigger.
- Public slugs and handles use `extensions.citext` and are normalized to lowercase at the validation boundary.
- Coordinates use `extensions.geography(Point, 4326)`.
- Every exposed table enables and forces RLS in the same migration that creates it, with explicit policies and pgTAP allowed/denied tests.
- Security-definer functions require an empty fixed `search_path`, schema-qualified objects, an `auth.uid()` check, minimum grants, and dedicated pgTAP coverage.

The product enum list is approved in the implementation specification but deliberately deferred. Each enum is introduced by the first domain migration that consumes it so the type, owning table, constraints, RLS, and tests are reviewed together.

The B02 seed contains reviewed Israel city fallbacks with stable UUIDs and representative PostGIS centers. Seeds must remain repeatable after a full reset and require no hosted account, provider token, or network access.

## B02 identity and trust boundary

- Supabase Auth owns email and password state. `public.profiles` owns Huddle profile, adult-attestation, current-rules, completion, and suspension state.
- The Auth trigger creates an empty profile. Only `complete_profile` may derive completion or update the user-controlled profile fields.
- Public people pages call `get_public_profile_by_handle`; they never select another person's profile row and receive only the reviewed safe DTO.
- Direct profile, role, block, and audit mutations are revoked. `block_user` and `unblock_user` apply the complete-actor gate, private block semantics, and minimal audit evidence.
- The current block transaction covers only domains that exist in B02. Later friendship and home-event migrations must extend the same function transactionally before those features ship.

## Reviewed local platform-admin bootstrap

Platform roles are never seeded and never accepted from signup/profile input. After a real Auth user exists and has a paired profile, a project owner may bootstrap the first local platform admin only through a reviewed SQL session:

```sql
begin;

-- Replace the placeholder with the exact Auth UUID selected and reviewed by
-- both partners. Stop if this query does not return exactly that one user.
select id, email, email_confirmed_at
from auth.users
where id = '00000000-0000-0000-0000-000000000000';

insert into public.platform_roles (profile_id, role)
select id, 'admin'::public.platform_role
from public.profiles
where id = '00000000-0000-0000-0000-000000000000'
returning profile_id, role;

commit;
```

This is a local/manual bootstrap pattern, not authorization to run it against hosted Supabase. A hosted role grant requires a separate current user instruction, an exact reviewed identity, and post-operation verification.
