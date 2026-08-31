import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { EmptyState } from "@/components/states/empty-state";
import { ContextBackLink, safeExploreReturnTo } from "@/components/navigation/context-back-link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { EventCard } from "@/features/events/components/event-card";
import { listMatchEvents } from "@/features/events/queries";
import { getFixtureById } from "@/features/sports/browse";
import { matchIdSchema } from "@/features/sports/browse-schemas";
import { ProviderFreshness } from "@/features/sports/components/provider-freshness";
import { TeamMark } from "@/features/sports/components/team-initials";
import type { TeamSummary } from "@/features/sports/dto";
import { formatIsraelKickoff } from "@/features/sports/time";
import { FollowControl } from "@/features/subscriptions/components/follow-control";
import { InterestAccessPrompt } from "@/features/subscriptions/components/interest-access-prompt";
import type { SubscriptionKind } from "@/features/subscriptions/schemas";
import { getInterestViewer, subscriptionKey } from "@/features/subscriptions/viewer";

export const metadata: Metadata = {
  title: "Match details — Huddle",
};

type MatchDetailPageProps = Readonly<{
  params: Promise<Readonly<{ matchId: string }>>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}>;

function Team({ team, side }: Readonly<{ team: TeamSummary; side: string }>) {
  return (
    <div className="flex min-w-0 flex-1 flex-col items-center text-center">
      <TeamMark
        className="size-16 text-sm"
        crestUrl={team.crestUrl}
        name={team.name}
        tla={team.tla}
      />
      <p className="mt-4 text-xl font-semibold text-foreground sm:text-2xl">
        {team.shortName ?? team.name}
      </p>
      <p className="mt-1 text-sm text-muted-foreground">{side}</p>
    </div>
  );
}

function FollowTarget({
  kind,
  id,
  name,
  followed,
}: Readonly<{
  kind: SubscriptionKind;
  id: string;
  name: string;
  followed: ReadonlySet<string>;
}>) {
  return (
    <div className="flex flex-col gap-3 rounded-xl border border-border bg-muted p-4 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <p className="font-semibold text-foreground">{name}</p>
        <p className="mt-1 text-xs capitalize text-muted-foreground">{kind}</p>
      </div>
      <FollowControl
        initiallyFollowing={followed.has(subscriptionKey(kind, id))}
        kind={kind}
        targetId={id}
        targetName={name}
      />
    </div>
  );
}

export default async function MatchDetailPage({ params, searchParams }: MatchDetailPageProps) {
  const parsedId = matchIdSchema.safeParse((await params).matchId);
  if (!parsedId.success) notFound();
  const rawReturnTo = (await searchParams).returnTo;
  const returnTo = safeExploreReturnTo(
    Array.isArray(rawReturnTo) ? rawReturnTo.at(0) : rawReturnTo,
  );

  const [data, viewer, events] = await Promise.all([
    getFixtureById(parsedId.data),
    getInterestViewer(),
    listMatchEvents(parsedId.data),
  ]);
  if (data.match === null) notFound();
  const match = data.match;
  const followed = new Set(viewer.followedKeys);

  return (
    <section className="py-12 sm:py-16">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <ContextBackLink fallbackHref="/discover" returnTo={returnTo} />
        <div className="w-full max-w-md">
          <ProviderFreshness freshness={data.freshness} />
        </div>
      </div>

      <Card className="mx-auto mt-8 max-w-4xl rounded-[2rem]">
        <CardHeader className="items-center text-center">
          <Badge variant="outline">{match.competition.code ?? match.competition.name}</Badge>
          <h1 className="mt-3 text-3xl font-semibold tracking-[-0.04em] text-foreground sm:text-4xl">
            {match.homeTeam.shortName ?? match.homeTeam.name} vs{" "}
            {match.awayTeam.shortName ?? match.awayTeam.name}
          </h1>
          <p className="mt-2 text-muted-foreground">{match.competition.name}</p>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-5 rounded-2xl border border-border bg-muted p-6 sm:gap-10 sm:p-10">
            <Team side="Home" team={match.homeTeam} />
            <span aria-hidden="true" className="text-sm font-bold text-muted-foreground">
              VS
            </span>
            <Team side="Away" team={match.awayTeam} />
          </div>
          <dl className="mt-6 grid gap-5 border-t border-border pt-6 sm:grid-cols-3">
            <div>
              <dt className="text-sm text-muted-foreground">Kickoff</dt>
              <dd className="mt-2 font-semibold text-foreground">
                {formatIsraelKickoff(match.startsAt)}
              </dd>
              <dd className="mt-1 text-xs text-muted-foreground">Israel time</dd>
            </div>
            <div>
              <dt className="text-sm text-muted-foreground">Status</dt>
              <dd className="mt-2 font-semibold capitalize text-foreground">
                {match.status === "timed" ? "Scheduled" : match.status}
              </dd>
            </div>
            <div>
              <dt className="text-sm text-muted-foreground">Match context</dt>
              <dd className="mt-2 font-semibold text-foreground">
                {match.matchday === null ? "Fixture" : `Matchday ${match.matchday}`}
              </dd>
              {match.seasonLabel === null ? null : (
                <dd className="mt-1 text-xs text-muted-foreground">Season {match.seasonLabel}</dd>
              )}
            </div>
          </dl>
        </CardContent>
      </Card>

      <Card className="mx-auto mt-8 max-w-4xl">
        <CardHeader>
          <h2 className="text-2xl font-semibold tracking-[-0.03em] text-foreground">
            Keep this fixture close.
          </h2>
          <p className="text-sm leading-6 text-muted-foreground">
            Follow the sport, competition, or either team. Following a sport or competition shapes
            discovery. Following a team may be required to join a team-follower venue event unless
            you are directly invited. No follow grants private-event visibility or address access.
          </p>
        </CardHeader>
        <CardContent>
          {viewer.state === "eligible" ? (
            <div className="grid gap-3 sm:grid-cols-2">
              <FollowTarget followed={followed} id={match.sport.id} kind="sport" name="Football" />
              <FollowTarget
                followed={followed}
                id={match.competition.id}
                kind="competition"
                name={match.competition.name}
              />
              <FollowTarget
                followed={followed}
                id={match.homeTeam.id}
                kind="team"
                name={match.homeTeam.shortName ?? match.homeTeam.name}
              />
              <FollowTarget
                followed={followed}
                id={match.awayTeam.id}
                kind="team"
                name={match.awayTeam.shortName ?? match.awayTeam.name}
              />
            </div>
          ) : (
            <InterestAccessPrompt state={viewer.state} />
          )}
        </CardContent>
      </Card>

      <div className="mx-auto mt-10 max-w-4xl">
        {events.length === 0 ? (
          <EmptyState
            action={
              <div className="flex flex-wrap justify-center gap-3">
                <Button asChild>
                  <Link href={"/events/new?matchId=" + match.id}>Plan a private huddle</Link>
                </Button>
                <Button asChild variant="outline">
                  <Link href="/settings/interests">Manage all follows</Link>
                </Button>
              </div>
            }
            description="Eligible Fans may create group, friends, or invite-only events. Venue operators publish public events from their Venue workspace."
            headingLevel="h2"
            title="No watch events for this fixture yet."
          />
        ) : (
          <section aria-labelledby="match-events-heading">
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div>
                <p className="text-sm font-medium text-forest">Nearby watch plans</p>
                <h2
                  className="mt-2 text-2xl font-semibold text-foreground"
                  id="match-events-heading"
                >
                  Watch this match with Huddle
                </h2>
              </div>
              <Button asChild variant="outline">
                <Link href={"/events/new?matchId=" + match.id}>Plan a private huddle</Link>
              </Button>
            </div>
            <div className="mt-5 grid gap-4 md:grid-cols-2">
              {events.map((event) => (
                <EventCard event={event} key={event.id} returnTo={returnTo} />
              ))}
            </div>
          </section>
        )}
      </div>
    </section>
  );
}
