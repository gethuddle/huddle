# Venue History Pagination Follow-up Implementation Plan

> **For agentic workers:** Execute inline in this isolated archive with strict TDD; no commits or shared-root changes.

**Goal:** Make every Venue Events/Calendar row reachable through bounded pages, filter before pagination, project elapsed published events as Completed, and preserve only approved venue return query state through event edit/detail.

**Architecture:** Add one owner/admin-authorized read RPC using the existing 20-row/10,000-offset collection convention and total counts. The two server pages own validated `page`/`status` URL state; the existing calendar component renders a server-filtered page and link-based filters. A strict return parser accepts only the current venue workspace/calendar/events route and canonical bounded query keys.

**Tech Stack:** PostgreSQL/Supabase migration and pgTAP, generated Supabase TypeScript, Next.js App Router, React, Zod, Vitest/RTL.

**Spec:** `docs/HUDDLE-IMPLEMENTATION-SPEC.md` §2.8 history retention and §12.2 bounded growing collections; reproduced evidence in `/private/tmp/huddle-production-audit.Hx52PV/venue-history-diagnosis.md`.

## Global Constraints

- Owner/admin authorization remains inside the security-definer RPC; pagination/filter/return state never authorizes.
- Use `private.event_history_status` at one statement timestamp; never rewrite stored lifecycle state.
- Filter before count/offset/limit. Page size20, existing maximum offset10,000; no raised fixed limit.
- Preserve billing visibility/operation rules, neutral history, RLS/policies, and attendee count derivation.
- Forward migration only; no shared stack reset/write, hosted action, dependency, Git mutation, or shared-root edit.

### Task 1: RED contracts

- [x] Add adapter tests for page13 offset240, status RPC input, total count, completed status validation.
- [x] Add component/page tests for link filters, page navigation, empty-filter state, oversized/stale page canonicalization.
- [x] Add return parser tests accepting canonical current-venue query state and rejecting arbitrary/repeated/cross-venue state.
- [x] Add pgTAP source/behavior cases for owner/admin, outsider denial, 251 rows, filter-before-page, and elapsed completion.
- [x] Run focused Vitest and record expected missing-interface failures.

### Task 2: GREEN database/adapter

- [x] Add `20260904165000_venue_history_pagination.sql` with `list_venue_calendar_page(input_venue_id,input_status,input_limit,input_offset)` returning existing fields plus `total_count`; revoke all then authenticated grant.
- [x] Reuse `private.assert_common_actor`, `private.actor_manages_venue`, `private.event_history_status`, aggregate approved attendance, deterministic newest-first `(starts_at,id)`, and bounded input.
- [x] Regenerate database types if an isolated disposable generation target is available; otherwise make the exact generated additive edit and report that generation parity remains root-owned.
- [x] Implement `listVenueCalendarPage(venueId,status,page)` with strict schema and existing pagination helpers.

### Task 3: GREEN routes/UI/return context

- [x] Add strict status/page parsing and canonical route builders.
- [x] Convert status buttons to links supplied by each page, keeping current visual selection and page reset on filter change.
- [x] Render shared Previous/Page/Next controls and truthful total copy on Events and Calendar.
- [x] Include the current canonical query in event links; accept it only through strict current-venue return parsing.
- [x] Run focused tests, scoped lint/typecheck/diff check and source review; package the isolated diff/report for root.
