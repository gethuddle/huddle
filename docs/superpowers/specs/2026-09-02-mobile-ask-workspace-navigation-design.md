# Mobile Ask Huddle and Workspace Navigation Design

**Date:** 2 September 2026
**Status:** Approved for implementation by the current user
**Scope:** Responsive application shell, Fan assisted-discovery presentation, named-place resolution, and deterministic date interpretation

## Outcome

Huddle will move assisted discovery off Fan Home and into a dedicated `/ask` destination. On mobile it will look and behave like a compact chat, while remaining a single-turn search: one question, one deterministic application response, and at most three authorization-filtered huddles. It will not retain history, send prior turns to Cloudflare, or preserve results after the user navigates away.

The same revision will make workspace navigation consistent on phones, fix the public-menu alignment, automatically resolve a named public search area, and ensure the default 14-day window is used only when the sentence contains no date intent.

## Product contract

### Workspace and account navigation

- Every signed-in active workspace shows the same `WorkspaceSwitcher` control at the top-right of the site header on mobile and desktop.
- The control identifies the active Fan or Venue workspace, lists all authorized workspaces, and retains `Account settings` as its final menu item.
- Account is removed from both mobile bottom-navigation variants.
- Fan mobile navigation contains five destinations in this order: `Home`, `Explore`, `Ask`, `My Huddle`, and `People`.
- The `Ask` destination is the emphasized center item and links to `/ask`.
- Venue mobile navigation contains four equal destinations: `Today`, `Calendar`, `Events`, and `Venue`.
- Fan desktop navigation also exposes the same route as `Ask Huddle`, because assisted discovery no longer appears on Home.
- Signed-out mobile navigation remains a three-item dropdown, but its trigger is anchored to the far right of the header rather than occupying the center grid track.
- Account and settings routes do not receive a selected bottom-navigation item; they remain reachable through the top-right workspace menu.

### Ask Huddle route

- `/ask` is available only when assisted discovery is enabled and the current session has an active Fan workspace.
- Fan Home no longer imports or renders the assisted-discovery form.
- The route is a full-height, edge-to-edge conversation canvas inside the application chrome at every breakpoint; it never adds a nested popup or page-card shell. Message content and the docked composer use a readable centered measure on larger screens.
- Repository-owned Radix-compatible shadcn `Message`, `Bubble`, and `MessageScroller` primitives provide the conversation layout. Existing Huddle `Marker`, block-end `InputGroup`, `Button`, `Card`, and brand tokens provide status, the two-row composer, and result presentation.
- The initial state contains a short assistant greeting and example prompts, with a docked composer.
- Submitting a sentence shows that sentence as the sole user message, then a polite pending marker, then the sole assistant response.
- A later submission replaces the prior exchange instead of appending history. Every request continues to use the existing `POST /api/assisted-discovery` contract and contains only the new sentence plus an optional session origin.
- Component state is local to the `/ask` page. It is not placed in a URL, cookie, local storage, session storage, database row, analytics payload, or server cache. Leaving `/ask` and returning starts empty.
- The API remains non-streaming and one-shot. Chat styling must not introduce the Vercel AI SDK, an agent, tools, RAG, or conversational context.
- Result replies render each match as a separate, clearly bordered, phone-dense `Card` ticket with header, body, and footer. Every ticket retains both crests, competition and kickoff, title, host, venue-verification state, group context, coarse location, attendance/capacity state, approval mode, match reasons, self-reported facilities, participation state, and `Open huddle` action.
- Clarification, unsupported, no-result, rate-limit, provider-outage, and location-needed responses appear as assistant messages and remain accessible through polite live-region announcements.

### Date interpretation

- The default range remains the current Israel calendar date through the following 14 days.
- That default is legal only when the sentence contains no explicit date, date range, named month, relative date, or weekday.
- Existing deterministic meanings remain unchanged for `today`, `tomorrow`, `this weekend`, `next week`, and `next <weekday>`.
- A bare or `this <weekday>` means the next occurrence including today; `next <weekday>` remains strictly future and resolves seven days ahead when today has that weekday.
- A single calendar date resolves to that exact day.
- A named month with an optional year resolves to the future-facing portion of that month. Without a year, Huddle chooses the next occurrence of that month; the current month is clamped to today.
- Explicit ranges remain future-facing and contain at most 31 calendar dates.
- Invalid, past, contradictory, too-wide, or recognizable-but-unresolved date language returns `clarification`. It must never silently become the 14-day default.
- Calendar math remains deterministic in `Asia/Jerusalem`; Cloudflare does not authorize or rank results.

### Named public locations

- Cloudflare may extract only the public place phrase explicitly present in the sentence; it still never receives or returns coordinates.
- A verified named-place phrase overrides any remembered session origin.
- Huddle resolves the phrase server-side through the existing bounded Photon/OpenStreetMap adapter and uses the provider's highest-ranked valid Israel result automatically.
- The selected coordinate is passed only to the existing authorized PostGIS search. It is not placed in the URL, continuation token, log, cache key, profile, or database row.
- The response may display the provider's public label so the Fan can see which area was used.
- Zero valid suggestions returns a location clarification. Geocoder failure returns the existing safe unavailable state. Neither case falls back to a remembered origin or broad national search.
- When no place was named and a location-dependent query has no session origin, the existing browser-location/manual-address continuation remains available.

## Architecture

### Shell

`SiteHeader` owns the shared top-right workspace switcher and passes feature availability into the Fan navigation model. `FanBottomNavigation` and `VenueMobileNavigation` remain small renderers over deterministic navigation arrays. Mobile header layout uses an explicit left/right flex arrangement; the desktop breakpoint retains centered primary navigation.

### Assisted discovery UI

`AssistedDiscovery` is split into reusable response presentation plus an `/ask` conversation client. The full result item remains one shared component so Home-era information cannot diverge from chat results. The page server component performs the active-Fan and feature-flag gate; the client component owns only the current draft, current submitted sentence, pending state, and current response.

### Date resolution

A focused local query-date parser recognizes English calendar signals and returns `resolved`, `absent`, or `invalid`. For an interpretation request, `resolveIntentDateRange` treats that parser's reading of the literal sentence as authoritative: a resolved range is used, invalid syntax clarifies, and only `absent` receives the 14-day default. Provider date fields remain a schema-compatible fallback for already-resolved internal inputs, not authority over what the Fan typed.

### Location resolution

The assisted-discovery service receives a dependency that resolves a verified public phrase to one safe public origin and label. Production wires it to the existing Photon adapter; tests inject deterministic results. The service performs this lookup before deciding whether a continuation is needed, so a named area can complete in the original request without a second model call or user click.

## Error handling and privacy

- Raw queries, named places, resolved labels, actor IDs, coordinates, model payloads, and event entities remain absent from logs.
- A named-place failure cannot reuse a stale origin.
- A date-like phrase that cannot be resolved cannot use the default range.
- Only the current sentence is sent to Cloudflare. UI messages are presentation state and are never provider context.
- Exact home locations remain excluded from assisted-discovery inputs and result cards.
- All route responses remain `private, no-store` and at most three results.

## Verification

- Unit tests cover absent-date defaulting, months, single dates, bare/next weekdays, past/invalid dates, 31-day enforcement, and failure to silently default.
- Service tests cover automatic named-location resolution, remembered-origin override, no-suggestion clarification, provider failure, and ordinary continuation when no place was named.
- Shell tests cover right-aligned public navigation, a top-right switcher for both workspace kinds, no bottom Account item, Fan five-item order, Venue four-item order, and current-route semantics.
- Component tests cover empty chat, pending state, full result content, replacement of a prior exchange, all response states, keyboard submission, live announcements, and state reset after remount.
- Page tests cover active-Fan/feature gating and removal from Home.
- Playwright covers mobile workspace switching, navigation shape, ephemeral Ask state, a month query, and an automatically resolved Jerusalem query.
- Existing unit, component, type, lint, formatting, build, database, and end-to-end gates remain required before publication.
