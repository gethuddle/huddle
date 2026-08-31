# Huddle brand system

This document is the durable implementation contract for Huddle's visual language. It is based on the asset suite supplied by the project owner on 2026-08-24. The palette, typography, surface treatment, spacing direction, and accent discipline are approved. The exact website mark remains provisional and must stay easy to replace.

## Brand character

Huddle should feel energetic enough for match day and warm enough for a real gathering. Product interfaces are light-first: a warm neutral canvas, white focused surfaces, dark Ink text, restrained borders, rounded geometry, and a single vivid green emphasis within each task area. Ink remains available for the mark, text, and deliberate dark collateral rather than acting as the default application canvas.

## Tailwind palette

| Token | Value | Intended use |
|---|---:|---|
| `ink` | `#0B1210` | Primary text, mark, and ink on bright controls |
| `court` | `#2CE07B` | Mark, one primary CTA/positive state, and focus treatment |
| `court-hover` | `#6FF0A6` | Hover treatment for Court Green accents |
| `forest` | `#0F7A42` | Accessible green on Linen and other light surfaces |
| `linen` | `#F2EEE4` | Warm light collateral surface and dark-surface text |
| `sand` | `#C9B48F` | Optional warm accent and caution emphasis |
| `muted-dark` | `#8A948E` | Legacy dark-surface secondary text |
| `muted-light` | `#5C665F` | Product secondary text on light surfaces |
| `border-dark` | `#232B27` | Standard border on dark surfaces |
| `border-strong` | `#2A332E` | Stronger separation on dark surfaces |
| `surface-raised` | `#151D18` | Cards and raised dark surfaces |
| `surface-deep` | `#0E1512` | Nested or especially deep dark surfaces |

These names are exported from `app/globals.css` through Tailwind v4 `@theme`, so components use classes such as `bg-ink`, `text-linen`, `bg-court`, and `border-border-dark`. Do not reintroduce raw brand hex values in JSX.

The product also exposes semantic light roles from `app/globals.css`: Canvas `#F7F8F6`, Surface `#FFFFFF`, Raised subtle `#F0F3F0`, Border `#DDE3DE`, Ink foreground, and muted-light foreground. Application components use semantic utilities such as `bg-background`, `bg-card`, `bg-muted`, `text-foreground`, `text-muted-foreground`, and `border-border`; raw brand-name utilities are reserved for deliberate brand/art treatment.

Court Green is an accent, not a paragraph color. On light surfaces use Forest where green text is required. Status must never be communicated by color alone.

## Typography

- Family: Familjen Grotesk.
- Body: 400 or 500.
- Wordmark and headings: 600 with tight tracking, normally between `-0.02em` and `-0.04em`.
- Strong UI labels may use 600 or 700.
- Render the website wordmark as live text. Do not use a lockup SVG in application navigation.

The application loads Familjen Grotesk through `next/font`, which self-hosts the generated font assets and exposes the family to Tailwind's `font-sans` utility.

## Component-system integration

Huddle uses repository-owned shadcn components backed by Radix UI for generic interactive controls. shadcn is a source-code foundation, not Huddle's visual identity: generated components live under `components/ui/` and MUST be adapted to the tokens and rules in this document.

- Configure shadcn for the existing Tailwind v4 stylesheet and `@/` alias; do not replace `app/globals.css` wholesale.
- Keep the approved Ink, Linen, Court Green, Forest, surface, border, and muted tokens as the visual source of truth.
- Keep Familjen Grotesk, the light-first semantic surface hierarchy, rounded geometry, visible focus, and one-Court-Green-accent discipline.
- Use Radix-backed shadcn variants for interactive primitives so Huddle does not maintain parallel Radix and Base UI component families.
- Add only components required by the active milestone, then compose domain components such as `MatchCard` and `EventCard` from them.
- Migrate existing controls only when their behavior, accessibility coverage, and authorization outcomes remain intact.

## Mark and asset rules

The current provisional mark is the Aperture Huddle: six rounded capsules leaning into a shared open center.

- Keep one capsule-width of clear space around the mark.
- Minimum bare-mark size is 16 px; below 20 px prefer the favicon with its Ink plate.
- Use Court Green on dark surfaces, Forest or Ink on light surfaces, and Linen for monochrome dark usage.
- The header must consume the replaceable `BrandMark` component rather than embedding mark geometry in layout code.
- Use at most one Court Green element per component group.
- Treat lockup SVGs as collateral only because their text can depend on font availability.

Approved repository assets live under `public/brand/`. PNG exports and the standalone design showcase remain source material outside the repository until a specific delivery surface requires them.

Provider team crests remain outside the licensed asset set. Product team recognition uses a repository-owned live-text `TeamMark` derived from the team's TLA or name; it must expose the full team name to assistive technology and never rely on color alone.

## Product hierarchy rules

- Current navigation uses Forest text and a quiet underline/background, not a filled Court Green pill.
- One filled green action leads each visible task area; secondary actions are ghost, outline, text, menu, or disclosure controls.
- Use no more than three visible type levels on a page. Product page titles cap at 40px desktop and 32px mobile.
- Product headings and labels use sentence case. Uppercase eyebrow labels are collateral-only.
- Cards represent real objects or one focused task. Ordinary sections use whitespace and hairline dividers; do not nest card shells.
- Ordinary cards and buttons are shadow-free. Menus, dialogs, map callouts, search controls, and docked navigation use only the shared pale-sage semantic elevation tokens; never reintroduce stock black/Ink shadows.
- Status appears as one plain-language sentence. Internal lifecycle, synchronization, provider, and database terms never appear in ordinary product copy.
- Defer audit history, advanced options, and secondary metadata under one descriptive disclosure when they are not needed for the primary task.

## Product-interface boundary

The supplied website compositions are visual references, not implemented product behavior. Do not add navigation destinations, authentication actions, live-score labels, calls to action, or other controls until their real route and behavior exist. Every interface must continue to follow the accessibility, authorization, privacy, and truthful-state requirements in the implementation specification.
