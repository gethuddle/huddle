# B04 fixture-browser visual acceptance

These screenshots were captured from the B04 development build against the
repository-managed local Supabase stack. The catalog contains deterministic
Arsenal and Chelsea test data only; no production account, hosted data, token,
session value, or live-provider payload appears in the images.

- [Desktop fixture browser at 1280 by 900](./fixtures-desktop.jpg)
- [Mobile fixture filters at 390 by 844](./fixtures-mobile.jpg)
- [Mobile fixture result at 390 by 844](./fixtures-mobile-results.jpg)

The desktop and mobile passes confirmed readable filters, a stable freshness
indicator, a responsive match card, text-initial team marks, visible
football-data.org attribution, and keyboard-addressable links and form fields.
The B04 Playwright journey separately records every fixture-page request and
fails if any normal page request reaches `football-data.org`; it also proves the
cached fixture survives a recorded provider failure.
