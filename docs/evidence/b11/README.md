# B11 evidence

These screenshots are generated from deterministic local users and report text
by the B11 Playwright journey. They contain no hosted account, real report,
provider token, session value, or private home address.

- `independent-appeal-review-desktop.png` — the separate moderator sees a
  labelled appeal outcome form and the confidential report remains in the
  platform-only workspace.
- `independent-appeal-review-mobile.png` — the same review remains readable and
  operable at a 390 × 844 phone viewport without horizontal page overflow. The
  journey opens the phone menu, confirms Safety and Moderation are reachable,
  closes it with Escape, and verifies focus returns to the Menu trigger before
  capturing the clean page state.

The journey also proves that the reported group owner receives the same
non-enumerating not-found result for `/moderation`, cannot see the reporter or
report details, and can submit and later read their own bounded appeal outcome.
