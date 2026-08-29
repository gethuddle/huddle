# Usability remediation evidence

These screenshots are generated from the deterministic local Playwright journeys with
`HUDDLE_CAPTURE_UX_EVIDENCE=1`. They demonstrate the signed-in people directory and the
My Huddle continuation surface without using hosted accounts or production data.
Collision-safe account and record identifiers remain random in the database, but the capture
step replaces only their already-asserted visible labels with fixed evidence text before taking
the screenshot. Re-running the focused evidence command therefore produces the same pixels
without weakening the product assertions.

- `people-search-desktop.png` — safe member search by display name with a direct profile action.
- `my-huddle-desktop.png` — hosted events remain findable after creation with direct open/manage actions.
