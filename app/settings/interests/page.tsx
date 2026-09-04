import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";

import { EmptyState } from "@/components/states/empty-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ProfileAccessState } from "@/features/profiles/components/profile-access-state";
import { TeamInitials } from "@/features/sports/components/team-initials";
import { getInterestCatalog } from "@/features/subscriptions/catalog";
import { FollowControl } from "@/features/subscriptions/components/follow-control";
import type { SubscriptionKind } from "@/features/subscriptions/schemas";
import {
  getInterestViewer,
  subscriptionKey,
  type InterestViewerState,
} from "@/features/subscriptions/viewer";

export const metadata: Metadata = {
  title: "Your sports interests — Huddle",
};

type InterestSettingsPageProps = Readonly<{
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}>;

type InterestItem = Readonly<{
  id: string;
  kind: SubscriptionKind;
  title: string;
  searchText: string;
  description: string;
  marker: ReactNode;
}>;

function AccessState({ state }: Readonly<{ state: Exclude<InterestViewerState, "eligible"> }>) {
  if (state === "anonymous") {
    return (
      <ProfileAccessState
        actionHref="/auth/sign-in"
        actionLabel="Sign in"
        description="Fixtures are public, but your followed teams belong to your signed-in account."
        eyebrow="Sign in required"
        title="Sign in to manage your interests."
      />
    );
  }

  if (state === "complete-profile") {
    return (
      <ProfileAccessState
        actionHref="/settings/profile"
        actionLabel="Complete profile"
        description="Verify your email, confirm you are 18+, accept the current rules, and finish your profile first."
        eyebrow="Profile required"
        title="Finish joining before you follow."
      />
    );
  }

  return (
    <ProfileAccessState
      description="This account cannot change community state."
      eyebrow="Not permitted"
      title="Interest settings are unavailable."
      warning
    />
  );
}

function InterestCard({ item, followed }: Readonly<{ item: InterestItem; followed: boolean }>) {
  return (
    <Card size="sm">
      <CardContent className="flex h-full flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-center gap-3">
          {item.marker}
          <div className="min-w-0">
            <p className="truncate font-semibold text-foreground">{item.title}</p>
            <p className="mt-1 text-sm text-muted-foreground">{item.description}</p>
          </div>
        </div>
        <FollowControl
          initiallyFollowing={followed}
          kind={item.kind}
          targetId={item.id}
          targetName={item.title}
        />
      </CardContent>
    </Card>
  );
}

function InterestSection({
  description,
  followed,
  items,
  title,
}: Readonly<{
  description: string;
  followed: ReadonlySet<string>;
  items: readonly InterestItem[];
  title: string;
}>) {
  if (items.length === 0) return null;
  const headingId = `interest-${title.toLowerCase().replaceAll(" ", "-")}`;

  return (
    <section aria-labelledby={headingId}>
      <h2 className="text-2xl font-semibold tracking-[-0.03em] text-foreground" id={headingId}>
        {title}
      </h2>
      <p className="mt-2 text-base text-muted-foreground">{description}</p>
      <div className="mt-5 grid gap-4 md:grid-cols-2">
        {items.map((item) => (
          <InterestCard
            followed={followed.has(subscriptionKey(item.kind, item.id))}
            item={item}
            key={subscriptionKey(item.kind, item.id)}
          />
        ))}
      </div>
    </section>
  );
}

function firstValue(value: string | string[] | undefined): string {
  return Array.isArray(value) ? (value.at(0) ?? "") : (value ?? "");
}

export default async function InterestSettingsPage({ searchParams }: InterestSettingsPageProps) {
  const viewer = await getInterestViewer();
  if (viewer.state !== "eligible") return <AccessState state={viewer.state} />;

  const rawFilters = await searchParams;
  const query = firstValue(rawFilters.q).trim().slice(0, 80);
  const normalizedQuery = query.toLocaleLowerCase("en");
  const catalog = await getInterestCatalog(query);
  const followedOnly = firstValue(rawFilters.followed) === "on";
  const followed = new Set(viewer.followedKeys);
  const items: InterestItem[] = [
    ...catalog.sports.map((sport) => ({
      id: sport.id,
      kind: "sport" as const,
      title: sport.name,
      searchText: `${sport.name} ${sport.slug}`.toLocaleLowerCase("en"),
      description: "Sport",
      marker: <Badge variant="outline">{sport.name.slice(0, 1).toUpperCase()}</Badge>,
    })),
    ...catalog.competitions.map((competition) => ({
      id: competition.id,
      kind: "competition" as const,
      title: competition.name,
      searchText: `${competition.name} ${competition.code ?? ""}`.toLocaleLowerCase("en"),
      description: "Competition",
      marker: <Badge variant="outline">{competition.code ?? "Cup"}</Badge>,
    })),
    ...catalog.teams.map((team) => ({
      id: team.id,
      kind: "team" as const,
      title: team.shortName ?? team.name,
      searchText: `${team.name} ${team.shortName ?? ""} ${team.tla ?? ""}`.toLocaleLowerCase("en"),
      description: "Team",
      marker: <TeamInitials crestUrl={team.crestUrl} name={team.name} tla={team.tla} />,
    })),
  ];
  const matchingItems = items.filter(
    (item) =>
      (normalizedQuery.length === 0 || item.searchText.includes(normalizedQuery)) &&
      (!followedOnly || followed.has(subscriptionKey(item.kind, item.id))),
  );
  const followedItems = matchingItems.filter((item) =>
    followed.has(subscriptionKey(item.kind, item.id)),
  );
  const popularItems = matchingItems.filter(
    (item) => item.kind !== "team" && !followed.has(subscriptionKey(item.kind, item.id)),
  );
  const suggestedTeams = matchingItems.filter(
    (item) => item.kind === "team" && !followed.has(subscriptionKey(item.kind, item.id)),
  );

  return (
    <section className="py-12 sm:py-16">
      <div className="flex flex-wrap items-end justify-between gap-6">
        <div>
          <p className="text-sm font-medium text-forest">Interests</p>
          <h1 className="mt-3 text-4xl font-semibold tracking-[-0.04em] text-foreground sm:text-4xl">
            Follow what matters.
          </h1>
          <p className="mt-4 max-w-2xl text-lg leading-8 text-muted-foreground">
            Shape fixture discovery around the sports, competitions, and teams you care about.
            Follows never reveal private events or addresses.
          </p>
        </div>
        <Button asChild variant="outline">
          <Link href="/discover">Explore watch options</Link>
        </Button>
      </div>

      <form
        action="/settings/interests"
        className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center"
        role="search"
      >
        <label className="sr-only" htmlFor="interest-search">
          Search interests
        </label>
        <Input
          className="rounded-full"
          defaultValue={query}
          id="interest-search"
          name="q"
          placeholder="Search teams and competitions"
          type="search"
        />
        <label className="inline-flex min-h-11 shrink-0 cursor-pointer items-center gap-2 rounded-full border border-input px-4 text-sm font-semibold text-foreground">
          <input defaultChecked={followedOnly} name="followed" type="checkbox" />
          Followed only
        </label>
        <Button className="rounded-full" type="submit">
          Apply
        </Button>
        {query.length === 0 && !followedOnly ? null : (
          <Button asChild className="rounded-full" variant="ghost">
            <Link href="/settings/interests">Clear</Link>
          </Button>
        )}
      </form>

      {matchingItems.length === 0 ? (
        <EmptyState
          action={
            <Button asChild variant="outline">
              <Link href="/settings/interests">Clear search</Link>
            </Button>
          }
          description={
            followedOnly
              ? "Try all interests or search for something else to follow."
              : "Try a team, competition, or broader search."
          }
          headingLevel="h2"
          title={followedOnly ? "No followed interests match." : "No interests match."}
        />
      ) : (
        <div className="mt-12 space-y-12">
          <InterestSection
            description="Your current choices, together in one place."
            followed={followed}
            items={followedItems}
            title="Followed"
          />
          {followedOnly ? null : (
            <>
              <InterestSection
                description="Broad starting points for shaping fixture discovery."
                followed={followed}
                items={popularItems}
                title="Popular"
              />
              <InterestSection
                description="More teams you can add to your match-day view."
                followed={followed}
                items={suggestedTeams}
                title="Suggested teams"
              />
            </>
          )}
        </div>
      )}
    </section>
  );
}
