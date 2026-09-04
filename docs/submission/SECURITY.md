# Huddle security summary

Huddle treats the browser as untrusted. Supabase Auth owns passwords and sessions;
server actions and route handlers validate input with Zod; database functions derive
the actor from `auth.uid()` and enforce ownership, audience, eligibility, blocks,
capacity, moderation state, and transition rules. Every exposed application table has
forced RLS and a deny-by-default pgTAP inventory.

The highest-risk data—home addresses, invitation digests, reports, moderation data,
attendance detail, and audit events—has no direct client read path. A private address
is stored separately, returned only through a current authorization check, audited
without the address, and recalculated after leave/removal/block/suspension/cancel.
Provider, service-role, sync, and cursor secrets are server-only and checked by the
repository security audit.

`VB01` Polar credentials are also server-only. A signed raw-body webhook and
transactional entitlement checks, rather than a checkout return or browser state,
control commercial visibility. Only the exact venue owner can begin checkout or open
the portal; an admin's operational membership does not grant billing. Preview/local/CI
force provider-network denial, while a later explicitly authorized live Sandbox demo is
limited to `huddle.co.il`. The separate runbook records secret rotation, endpoint
disable/reconciliation, and account-erasure retry boundaries without storing values.

The full control inventory, route/action table, response headers, secret rotation,
incident paths, and honest residual risks are recorded in
[`B11-SECURITY-CHECKLIST.md`](../B11-SECURITY-CHECKLIST.md),
[`B11-RUNBOOKS.md`](../operations/B11-RUNBOOKS.md), and
[`POLAR-SANDBOX-BILLING.md`](../operations/POLAR-SANDBOX-BILLING.md). Production acceptance must still
verify HTTPS/HSTS, Auth redirects, secret absence from browser bundles/network/logs,
invalid sync-secret denial, and hosted private-address denial before this document is
marked complete.

The isolated VB01 aggregate gate passed the local secret/artifact audit with Polar
transport denied. That is not a hosted inspection, PR/main CI result, live Sandbox
walkthrough, or B13 acceptance result; those checks remain pending.
