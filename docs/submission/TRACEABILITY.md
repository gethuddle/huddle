# Huddle implementation traceability

| Course requirement | Actual repository evidence | Test/demo evidence | Current state |
|---|---|---|---|
| Problem, users, customer, business goal | Architecture §§1–3; root README | 90-second presentation opening | Ready |
| Product capabilities/processes | App routes and feature modules; implementation spec §§1–4 | 35 Playwright scenarios covering contract journeys 01–19; core demo | 35/35 local scenarios pass |
| Components and data flow | Next.js app, server actions, narrow route handlers, Supabase functions | build, route tests, one traced join/approval | Ready locally |
| Database/entities | 38 ordered migrations and generated `Database` type | reset, 43 pgTAP files / 1,746 assertions, type-drift gate | Ready locally |
| Permissions and users | forced RLS, security-definer functions, separate private locations | denial pgTAP; Playwright 03/04/08/10/12–16 | Ready locally |
| External services/rationale | Supabase Auth/Postgres, Vercel, football-data adapter | fixture-only CI; protected sync tests | B13 hosted proof pending |
| CRUD/business logic | domain actions plus transactional RPCs | component/action tests and Playwright 05–16 | Ready locally |
| State/error/UX | Server Components, local form/dialog state, bounded TanStack Query, safe domain errors | RTL, keyboard dialogs, empty/error states | Ready locally; B13 VoiceOver smoke pending |
| Location and global groups | Session-only browser/address origins, confirmed event/Venue points, protected home points, no profile/group city, global member-count group order | [`cityless-location/ACCEPTANCE.md`](../evidence/cityless-location/ACCEPTANCE.md), pgTAP cityless contract, three-viewport two-account journey | Ready locally; hosted Preview proof pending |
| Next.js and TypeScript | App Router, strict `tsconfig`, pinned lockfile | typecheck and production build | Ready locally |
| Test specification/code | submission test plan and repository suites | 1,057 Vitest tests plus one skipped live-model test; 1,746 pgTAP assertions; 35 Playwright scenarios; `npm run test:acceptance` | Ready locally; required CI gates merge, with partner review optional |
| Basic scale | submission scalability plan, indexes, cursors, cache | query/concurrency tests; quota snapshot | B13 dashboard usage pending |
| Basic security | security summary, B11 inventory/runbooks | secret audit, RLS/denial/race tests | B13 production inspection pending |
| Local reproduction | root README and safe environment examples | second-computer fresh clone | B13 partner rehearsal pending |
| Public deployment | [production URL](https://huddle.co.il), production/preview env validation, and deployment runbook | production session/full smoke | Production reachable; B13 hosted acceptance pending |
| GitHub link | [gethuddle/huddle](https://github.com/gethuddle/huddle) | green `main` CI | Repository ready |
| Presentation | 10–15 minute run-of-show | timed two-person rehearsal | B13 rehearsal pending |

No pending hosted or rehearsal cell is represented as complete. B13 owns those
`D02`–`D04` obligations. Replace a pending cell with a date, exact
deployment/commit identifier, and secret-safe evidence only after the
corresponding check actually runs.
