# Huddle implementation traceability

| Course requirement | Actual repository evidence | Test/demo evidence | Current state |
|---|---|---|---|
| Problem, users, customer, business goal | Architecture §§1–3; root README | 90-second presentation opening | Ready |
| Product capabilities/processes | App routes and feature modules; implementation spec §§1–4 | Playwright 01–17; core demo | 17/17 local journeys pass |
| Components and data flow | Next.js app, server actions, four route handlers, Supabase functions | build, route tests, one traced join/approval | Ready locally |
| Database/entities | 12 ordered migrations and generated `Database` type | reset, 18 pgTAP files, type-drift gate | Ready locally |
| Permissions and users | forced RLS, security-definer functions, separate private locations | denial pgTAP; Playwright 03/04/08/10/12–16 | Ready locally |
| External services/rationale | Supabase Auth/Postgres, Vercel, football-data adapter | fixture-only CI; protected sync tests | Hosted proof pending |
| CRUD/business logic | domain actions plus transactional RPCs | component/action tests and Playwright 05–16 | Ready locally |
| State/error/UX | Server Components, local form/dialog state, bounded TanStack Query, safe domain errors | RTL, keyboard dialogs, empty/error states | Ready locally; VoiceOver pending |
| Next.js and TypeScript | App Router, strict `tsconfig`, pinned lockfile | typecheck and production build | Ready locally |
| Test specification/code | submission test plan and repository suites | 403 Vitest tests; 975 pgTAP assertions; 17 Playwright journeys; `npm run test:acceptance` | Local B12 run passed; PR/main CI pending |
| Basic scale | submission scalability plan, indexes, cursors, cache | query/concurrency tests; quota snapshot | Dashboard usage pending |
| Basic security | security summary, B11 inventory/runbooks | secret audit, RLS/denial/race tests | Production inspection pending |
| Local reproduction | root README and safe environment examples | second-computer fresh clone | Partner rehearsal pending |
| Public deployment | [candidate Vercel URL](https://huddle-navy-five.vercel.app), production/preview env validation, and deployment runbook | production session/full smoke | Candidate baseline reachable; accepted B12 SHA and hosted evidence pending |
| GitHub link | [gethuddle/huddle](https://github.com/gethuddle/huddle) | green `main` CI | Repository ready |
| Presentation | 10–15 minute run-of-show | timed two-person rehearsal | Pending rehearsal |

No pending hosted or rehearsal cell is represented as complete. Replace it with a
date, exact deployment/commit identifier, and secret-safe evidence only after the
corresponding check actually runs.
