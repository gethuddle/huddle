# ⚽ Huddle

**Find your people for every match.**

Huddle is a social app that connects sports fans around the games they love — turning solo fandom into shared, in-person experiences through **watch parties** and **local events**, hosted by fellow fans and by venues like sports bars.

> A two-person final project for the **Full-Stack & AI** course.

---

## The problem

Being a sports fan can be surprisingly lonely. If you love a team — or worse, a *niche* sport that few people around you follow — it's hard to share the excitement. The big moments happen, and you have no one to celebrate (or suffer) with. Unless you already have a friend group or a community built around that team, your fandom stays stuck in a group chat or, more often, by yourself on the couch.

The energy of sport is collective. Watching with others is the whole point. But there's no easy way to answer a simple question:

> **"Who, near me, is watching *this* match — and where can I join them?"**

## What Huddle does

Huddle makes that question answerable. You tell it what you care about, and it surfaces the people and places watching the same thing.

1. **Subscribe** to your favorite sports, tournaments, leagues, and teams.
2. **Discover** a personalized feed of upcoming matches and the **events & watch parties** built around them — near you, matched to your interests.
3. **Join** an event hosted by another fan or a local venue, or **host your own**.

Two kinds of hosts make the map come alive:

- **Fans** can arrange watch parties at home and open them up for others to join.
- **Businesses** (sports bars, cafés, clubs) can advertise exactly what they're showing — which match, on how many screens, and which side of the rivalry they're catering to.

## Who it's for

| Persona | What they want | How Huddle helps |
|---------|----------------|-------------------|
| 🧣 **The dedicated fan** | To watch the big game surrounded by people who care as much as they do | Finds nearby watch parties and bars showing *their* team's match |
| 🏑 **The niche enthusiast** | Community around a sport few people locally follow (handball, cricket, NFL abroad, esports…) | Connects the scattered few who *do* follow it into real meetups |
| 🏠 **The host** | To gather friends — and fill empty seats on the couch — for a match | Creates a home watch party and invites the wider community |
| 🍻 **The venue / sports bar** | To fill the room on match nights and reach the right fans | Publishes its fixtures, screens, and target crowd; gets discovered by nearby fans |

## Core features

### For everyone

- **Interest subscriptions** — follow sports, tournaments, leagues, and specific teams. Your feed is built from these.
- **Personalized discovery feed** — upcoming fixtures plus the events/watch parties tied to them, filtered by what you follow and where you are.
- **Location-aware search** — "what's on near me tonight?" Browse parties and venues by distance and match.
- **RSVP & attendance** — join an event, see who else is going, get reminders before kickoff.
- **Profiles** — your teams, your history, the events you've hosted and attended.

### For fan-hosts

- **Create a watch party** — pick the match, set a place (home or public), capacity, and whether it's open or invite-only.
- **Manage guests** — approve joiners, share details, post updates.

### For venues / businesses

- **Venue profile** — location, vibe, number of screens, capacity.
- **Fixture listings** — "We're showing **El Clásico** this Sunday." If a venue has only one screen, it declares which match (and even which side) it's catering to — e.g. a **Real Madrid** night vs. a **Barcelona** night.
- **Reach the right fans** — appear in the feeds of people who subscribe to that team or competition.

## How it works — two scenarios

**🍻 El Clásico at a bar.** A sports bar has one screen and decides to show *Real Madrid vs. Barcelona*. They post it on Huddle as a Real Madrid–leaning watch party. Every nearby user subscribed to La Liga, Real Madrid, or El Clásico sees it in their feed and can RSVP. The bar fills up with the right crowd; fans find their people.

**🏐 A niche sport at home.** Maya is one of the few handball fans in her city. The European Championship semifinal is on, and no bar is showing it. She creates a home watch party on Huddle. The handful of other local handball followers — who'd never have found each other otherwise — get notified, join, and a tiny community is born.

## MVP scope (for the final project)

A focused first version that demonstrates the full stack end to end:

- **Auth & profiles** — sign up / log in, set your favorite sports & teams.
- **Subscriptions** — follow sports / tournaments / teams.
- **Events** — fans and venues can create events tied to a match, with time, place, and capacity.
- **Discovery feed** — personalized, location-aware list of upcoming events.
- **RSVP** — join/leave an event and see the attendee count.
- **Core entities:** `User`, `Sport`, `Tournament`, `Team`, `Venue`, `Event`, `Subscription`, `RSVP`.

## Future ideas (post-MVP)

- 💬 In-app chat per event and live match-day threads.
- 🔔 Push/email/SMS reminders before kickoff.
- 🤖 **AI-powered discovery** — smart recommendations ("watch parties you'll love near you"), natural-language event creation ("Arsenal game Sunday at my place"), and automatic moderation of user-posted content.
- ⭐ Ratings & reviews for venues and hosts; trust/reputation.
- 🎟️ Ticketed or paid events for venues (premium match nights).
- 🗺️ Map view of everything happening tonight.
- 📅 Live fixtures pulled from a sports data API, so events attach to real matches automatically.

## Tech stack (planned)

Built on the stack taught in the course:

- **Frontend:** Next.js (App Router) + React + TypeScript + Tailwind CSS / Radix UI
- **State & data:** TanStack Query (server state) · Zustand (client state) · Zod (validation)
- **Backend:** Node.js + Express (with a realtime service) · REST API
- **Database:** PostgreSQL **+ PostGIS** (geo "near me") via Prisma · Redis (sessions, caching, realtime)
- **Realtime:** Socket.IO for live attendee counts & event chat
- **Auth:** session- or JWT-based, with OAuth 2.0 social login and bcrypt
- **AI:** Anthropic SDK (Claude) for recommendations & moderation
- **Infra:** Docker · GitHub Actions (CI/CD) · Vercel + managed Postgres (Supabase / Neon) · Sentry + PostHog

## Status

🚧 Early planning. Product vision defined; implementation not yet started. Course study roadmap and full stack rationale are kept in local working notes.
