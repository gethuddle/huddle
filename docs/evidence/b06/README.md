# B06 group membership and administration visual acceptance

These screenshots were captured from the B06 production build against the
repository-managed local Supabase stack. Every account, group, application,
and invitation is synthetic local evidence; no production account, hosted
data, token, session value, email address, or private location appears in the
images.

- [Desktop pending discoverable application](./application-pending-desktop.jpg)
- [Desktop administrator application queue](./application-review-desktop.jpg)
- [Mobile unlisted invitation application](./invite-application-mobile.jpg)

The discoverable-group views confirm that a direct-link applicant receives a
safe forming-group summary and remains pending until an administrator reviews
the application. The mobile invitation view confirms that possession of the
secret URL identifies an unlisted group but does not bypass administrator
approval. The B06 Playwright journey separately proves approval, owner-only
promotion, rule publication, invitation creation and revocation, and continued
membership after the consumed invitation is revoked.
