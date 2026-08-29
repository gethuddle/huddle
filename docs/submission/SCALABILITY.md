# Huddle scalability plan

**Snapshot date:** 2026-08-28. These are current vendor-plan limits, not measured
Huddle usage. The owners must record the final selected plans and dashboard usage
after deployment because quotas and terms can change.

## Expected pilot load and present design

The course pilot is a single-region English product for Israel. One Next.js modular
monolith serves pages/actions/routes; Supabase owns Auth and PostgreSQL/PostGIS.
Growing collections use bounded pages or signed cursors. Discovery uses PostGIS
distance filters and GiST/B-tree indexes. Match pages read a local normalized cache,
and one six-hour batch sync replaces per-page provider calls. Approved attendance is
counted from indexed rows under a transaction lock rather than a mutable counter.

## Current external limits

| Service | Current candidate allowance | Huddle implication |
|---|---|---|
| football-data.org Free | 12 competitions; delayed scores/schedules, fixtures and tables; 10 authenticated calls/minute | The `PL` and `CL` allowlist fits current free coverage. A bounded four-times-daily sync stays far below request-rate limits during normal operation. |
| Supabase Free | two active free projects across owner/admin memberships; 5 GB egress, 500 MB database per project, 50,000 MAU, 1 GB Storage, 500,000 Edge Function calls | Huddle does not use Storage or Edge Functions in the MVP, but database size, egress, and MAU need alerts. Preview and production still require distinct projects. |
| Vercel Hobby candidate | 1,000,000 function invocations, 4 active CPU-hours, 360 GB-hours memory, 100 GB transfer, 100 deployments/day | Suitable only if its personal/non-commercial and repository-integration terms fit. Current Vercel documentation says a Hobby team cannot connect a repository owned by a GitHub organization, so the owners must select an eligible team plan or a reviewed alternative before deployment. |

Sources: [football-data.org pricing](https://www.football-data.org/pricing),
[free competition coverage](https://www.football-data.org/coverage),
[provider throttling policy](https://docs.football-data.org/general/v4/policies.html),
[Supabase billing quotas](https://supabase.com/docs/guides/platform/billing-on-supabase),
[Vercel Hobby usage](https://vercel.com/docs/plans/hobby), and
[Vercel limits](https://vercel.com/docs/limits).

## Likely bottlenecks and response

1. **Database/catalog growth:** monitor database bytes and match/event counts; retain
   referenced matches, prune only unreferenced stale catalog rows through a reviewed
   job, then move to a paid database before read-only limits.
2. **Discovery query load:** inspect slow-query plans; preserve filter-aligned indexes,
   signed cursor pagination, bounded radii/windows, and safe response caching. Add a
   read replica only after measured read pressure.
3. **Provider quota/outage:** keep the competition/window allowlist bounded, honor
   provider retry metadata, and serve the last good catalog with a stale indicator.
4. **Serverless duration:** keep provider sync batched and observable. If its measured
   duration approaches the selected Vercel function limit, split bounded competition
   batches or move only that independently scaling job—not the whole application.
5. **Abuse and moderation load:** current database cooldowns fit the pilot. Add edge
   rate limiting and staffed operational ownership only when measured abuse requires it.

The first scale review occurs at 70% of any selected-plan quota or when p95 discovery
latency exceeds the agreed production target for two consecutive observations.
