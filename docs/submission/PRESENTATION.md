# Huddle presentation runbook

**Target:** 12 minutes, leaving up to 3 minutes for questions. Both partners explain
the whole product; speaking turns are not feature ownership.

| Time | Speaker | Content and proof |
|---:|---|---|
| 0:00–1:20 | Guy | Problem, Israel pilot, fan/venue personas, future venue customer |
| 1:20–3:20 | Ohad | Sign in, follow Arsenal, browse fixture and eligible event |
| 3:20–5:10 | Guy | Request attendance; host approves; protected address appears; calendar downloads |
| 5:10–6:10 | Ohad | Free Fan/group/private-hosting versus per-venue Sandbox entitlement: hidden Unverified venue draft, owner-only Billing, and the visible no-real-money banner; payment is not business verification |
| 6:10–7:40 | Guy | Architecture diagram: browser → Next.js boundary → Supabase Auth/RPC/RLS; scheduled provider cache |
| 7:40–9:00 | Ohad | Data model: events/audiences, one attendance row/account, separate private location, atomic capacity |
| 9:00–10:40 | Guy | Tests/security: one pgTAP denial, one race, local aggregate acceptance (48 pgTAP files / 2,423 assertions and 37 browser tests), CI and hosted inspection still pending, confidential reports/appeals |
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
- If VB01 is demonstrated after separate Task 11 authorization, use only the live
  Sandbox route and say plainly that no real money is charged, billing is owner-only,
  Fans never see billing state, and the venue remains Unverified. Do not show a Polar
  dashboard, token, webhook secret, provider identifier, checkout URL, card data, or
  claim that hosted acceptance passed before its evidence exists.
- Both partners run the full script once. Record duration and date here only after the
  rehearsal: `Guy: pending`; `Ohad: pending`.
