# Huddle

**Find your people for every match.**

[Live app](https://huddle.co.il) · [Documentation](#documentation) · [![CI](https://github.com/gethuddle/huddle/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/gethuddle/huddle/actions/workflows/ci.yml)

Huddle helps football fans find people and places to watch a match together. Follow your teams, discover nearby watch events, join a group, or host a gathering. The app is built for an English-speaking audience in Israel.

## What you can do

- **Explore** upcoming fixtures and nearby watch events in a list or on a map.
- **Ask Huddle** for events in plain English, with results matched to your interests and access.
- **Connect** through friendships, supporter groups, invitations, and private gatherings.
- **Keep track** of requests, reservations, and hosted events in My Huddle, with calendar downloads.
- **Run a venue** in a separate workspace: plan events around fixtures, publish listings, and manage attendance.

Fan features are free. Venue subscriptions use **Polar Sandbox only**, with no real-money charges; venues stay private until their subscription is activated. A subscription does not change a venue's **Unverified** business status.

Participation is for verified accounts whose owners confirm they are 18 or older. Home gatherings are limited to 12 registered attendees, and their exact address is revealed only to the host and approved attendees while access remains authorized.

## Built with

Next.js, React, and TypeScript; Tailwind CSS and shadcn/Radix for the interface; Supabase Auth, PostgreSQL, and PostGIS for accounts, permissions, and location search. The app runs on Vercel.

Football fixtures come from scheduled football-data.org imports. Ordinary browsing reads the stored catalog. Ask Huddle uses Cloudflare Workers AI to interpret a question; Huddle's database decides which events the person may see.

## Run locally

You need a running Docker-compatible runtime and the pinned Node.js **24.19.0** / npm **11.17.0** toolchain. The example below uses [fnm](https://github.com/Schniz/fnm) with zsh; other version managers can use the version in `.node-version`.

```zsh
git clone https://github.com/gethuddle/huddle.git
cd huddle
eval "$(fnm env --shell zsh)"
fnm install
fnm use
npm ci
cp .env.example .env.local
npm run db:start
npm run db:reset
npm run dev:local
```

Open [localhost:3000](http://localhost:3000). Local verification emails arrive in [Mailpit](http://127.0.0.1:54324).

`db:reset` recreates the local database from migrations and seed data. The local setup needs no sports-provider, AI, or billing credentials. See the [database guide](./supabase/README.md) for commands and the [environment example](./.env.example) for optional integrations.

## Tests

```bash
npm run test:coverage    # Unit and component tests
npm run test:acceptance  # Complete repository acceptance suite
```

The acceptance suite runs formatting, lint, TypeScript, Vitest, pgTAP, the production build, Playwright browser journeys, and the security audit. It uses the local database and includes a database reset. GitHub Actions runs the same gates on pull requests and `main`.

[Release and audit evidence](./docs/evidence/README.md) records dated results and remaining production checks.

## Documentation

| Guide                                                                | Contents                                                        |
| -------------------------------------------------------------------- | --------------------------------------------------------------- |
| [Product and architecture](./docs/HUDDLE-ARCHITECTURE.md)            | User journeys, system structure, and design decisions           |
| [Implementation specification](./docs/HUDDLE-IMPLEMENTATION-SPEC.md) | Product rules, permissions, data model, and acceptance criteria |
| [Local database](./supabase/README.md)                               | Setup, migrations, seed data, and database tests                |
| [Deployment](./docs/operations/DEPLOYMENT.md)                        | Environments, deployment steps, and production smoke tests      |
| [Sandbox billing](./docs/operations/POLAR-SANDBOX-BILLING.md)        | Venue subscriptions and billing operations                      |
| [Brand system](./docs/HUDDLE-BRAND.md)                               | Visual tokens, typography, and shared assets                    |

Built by [Guy Azene](https://github.com/GuyAzene) and [Ohad Shoshani Levi](https://github.com/ohadsho) for the **Full-Stack & AI** course.
