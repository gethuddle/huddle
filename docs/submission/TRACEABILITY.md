# Huddle implementation traceability

| Course requirement | Actual repository evidence | Test/demo evidence | Current state |
|---|---|---|---|
| Problem, users, customer, business goal | Architecture §§1–3; root README | 90-second presentation opening | Ready |
| Product capabilities/processes | App routes and feature modules; implementation spec §§1–4 | 37 executed Playwright tests, including VB01 offline fixtures | Local acceptance passed; hosted/demo evidence pending |
| Components and data flow | Next.js app, server actions, narrow route handlers, Supabase functions | isolated production build, route, and join evidence | Local acceptance passed; hosted regression pending |
| Database/entities | 44 ordered migrations including six VB01 forward migrations and generated `Database` type | reset, 48 pgTAP files / 2,423 assertions, canonical type parity | Local acceptance passed; hosted parity pending |
| Permissions and users | forced RLS, security-definer functions, separate private locations | denial pgTAP and executed browser journeys | Local acceptance passed; hosted regression pending |
| External services/rationale | Supabase Auth/Postgres, Vercel, football-data adapter | fixture-only local acceptance with Polar network denial | Local acceptance passed; hosted proof pending |
| CRUD/business logic | domain actions plus transactional RPCs | component/action coverage and executed browser journeys | Local acceptance passed; hosted regression pending |
| State/error/UX | Server Components, local form/dialog state, bounded TanStack Query, safe domain errors | RTL, keyboard/empty-state baseline, and executed billing browser coverage | Local acceptance passed; B13 VoiceOver smoke pending |
| Location and global groups | Session-only browser/address origins, confirmed event/Venue points, protected home points, no profile/group city, global member-count group order | cityless acceptance, pgTAP, and browser evidence | Local acceptance passed; hosted Preview proof pending |
| Next.js and TypeScript | App Router, strict `tsconfig`, pinned lockfile | typecheck and isolated production build | Local acceptance passed; hosted build/deployment pending |
| Test specification/code | submission test plan and repository suites | 223 files / 1,308 tests plus one intentional skip; 80.42/71.87/83.53/84.62 coverage; 48 DB files / 2,423 assertions; 37 browser tests | Local acceptance passed; PR/main CI pending |
| Basic scale | submission scalability plan, indexes, cursors, cache | query/concurrency tests; quota snapshot | B13 dashboard usage pending |
| Basic security | security summary, B11 inventory/runbooks | secret audit, RLS/denial/race tests | B13 production inspection pending |
| Local reproduction | root README and safe environment examples | second-computer fresh clone | B13 partner rehearsal pending |
| Public deployment | [production URL](https://huddle.co.il), production/preview env validation, and deployment runbook | historical deployment/smoke reference | Current reachability and VB01/B13 hosted acceptance unrefreshed and pending |
| GitHub link | [gethuddle/huddle](https://github.com/gethuddle/huddle) | historical repository reference | Current `main` CI status unrefreshed and pending verification |
| Presentation | 10–15 minute run-of-show | timed two-person rehearsal | B13 rehearsal pending |

No pending hosted or rehearsal cell is represented as complete. B13 owns those
`D02`–`D04` obligations. Replace a pending cell with a date, exact
deployment/commit identifier, and secret-safe evidence only after the
corresponding check actually runs.
