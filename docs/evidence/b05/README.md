# B05 friendship and group-creation visual acceptance

These screenshots were captured from the B05 production build against the
repository-managed local Supabase stack. The two accounts and groups are
deterministic local evidence only; no production account, hosted data, token,
session value, private location, or live-provider payload appears in the images.

- [Desktop accepted direct friendship](./friendship-desktop.jpg)
- [Desktop similar discoverable-group review](./group-similarity-desktop.jpg)
- [Mobile owned forming group](./group-owner-mobile.jpg)

The desktop friendship pass confirms the mutual accepted state and private
safety boundary. The group passes confirm that creation is unavailable until
the explicit similarity review, forming groups are not presented as public
links, and the creator receives only the safe owner summary and roster fields.
The B05 Playwright journeys separately prove the two-user request/accept/block
transaction and atomic group-plus-owner creation from a reset local database.
