# Huddle presentation runbook

**Target:** 12 minutes, leaving up to 3 minutes for questions. Both partners explain
the whole product; speaking turns are not feature ownership.

| Time | Speaker | Content and proof |
|---:|---|---|
| 0:00–1:20 | Guy | Problem, Israel pilot, fan/venue personas, future venue customer |
| 1:20–3:20 | Ohad | Sign in, follow Arsenal, browse fixture and eligible event |
| 3:20–5:10 | Guy | Request attendance; host approves; protected address appears; calendar downloads |
| 5:10–6:10 | Ohad | Group and unverified-venue paths; clearly distinguish deferred paid features |
| 6:10–7:40 | Guy | Architecture diagram: browser → Next.js boundary → Supabase Auth/RPC/RLS; scheduled provider cache |
| 7:40–9:00 | Ohad | Data model: events/audiences, one attendance row/account, separate private location, atomic capacity |
| 9:00–10:40 | Guy | Tests/security: one pgTAP denial, one race, 17 journeys, CI, confidential reports/appeals |
| 10:40–11:30 | Ohad | Scale: indexes/cursors/cache, vendor quotas, first bottlenecks |
| 11:30–12:00 | Both | Trade-offs and next steps: no fake NBA/live score/chat/payment/AI features |

## Rehearsal checklist

- Use dedicated deterministic demo accounts and a future fixture/event; never show a
  real home address, token, report narrative, session value, or production dashboard.
- Open the final URL, GitHub CI, architecture diagram, one denial test, and one race
  test in advance. Keep a screenshot fallback for every network-dependent screen.
- Rehearse the exact browser → action/route → RPC → RLS/constraint → safe response
  trace for attendance approval.
- Demonstrate address absence before approval and after revocation, one capacity race,
  and cached fixtures after provider failure.
- Both partners run the full script once. Record duration and date here only after the
  rehearsal: `Guy: pending`; `Ohad: pending`.
