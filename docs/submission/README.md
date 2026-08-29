# Huddle final-submission index

This directory is the concise hand-in index. The repository's existing normative
documents remain the full source of truth; these links identify the exact artifact
used for each course requirement and whether hosted evidence still remains.

| Required artifact | Submission source | State |
|---|---|---|
| Public application URL | [huddle-navy-five.vercel.app](https://huddle-navy-five.vercel.app) | Candidate baseline reachable; accepted B12 SHA and production acceptance pending |
| GitHub repository | [gethuddle/huddle](https://github.com/gethuddle/huddle) | Ready |
| Product specification | [`HUDDLE-ARCHITECTURE.md`](../HUDDLE-ARCHITECTURE.md) §§1–3 and [`HUDDLE-IMPLEMENTATION-SPEC.md`](../HUDDLE-IMPLEMENTATION-SPEC.md) §§1–4 | Implemented; final hosted evidence pending |
| Technical plan | [`HUDDLE-ARCHITECTURE.md`](../HUDDLE-ARCHITECTURE.md) §§4–8 and [`HUDDLE-IMPLEMENTATION-SPEC.md`](../HUDDLE-IMPLEMENTATION-SPEC.md) §§5–13 | Implemented |
| Test plan and test code | [`TEST-PLAN.md`](./TEST-PLAN.md), `*.test.ts(x)`, `supabase/tests/database/`, and `tests/e2e/` | Local acceptance passed; PR/main CI pending |
| Basic scale document | [`SCALABILITY.md`](./SCALABILITY.md) | Pre-deployment snapshot recorded; hosted usage pending |
| Basic security document | [`SECURITY.md`](./SECURITY.md) and [`B11-SECURITY-CHECKLIST.md`](../B11-SECURITY-CHECKLIST.md) | Implemented; production inspection pending |
| Local setup | [Root README](../../README.md#local-application-setup) | Ready |
| Traceability | [`TRACEABILITY.md`](./TRACEABILITY.md) | Local evidence mapped; hosted evidence pending |
| 10–15 minute presentation | [`PRESENTATION.md`](./PRESENTATION.md) | Script ready; two-person timed rehearsal pending |

The application is not called production-ready until every pending hosted item in
[`PRODUCTION-ACCEPTANCE.md`](../operations/PRODUCTION-ACCEPTANCE.md) has concrete,
secret-safe evidence from the final URL and matching Supabase project.
