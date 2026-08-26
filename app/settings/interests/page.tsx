import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";

import { EmptyState } from "@/components/states/empty-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ProfileAccessState } from "@/features/profiles/components/profile-access-state";
import { TeamInitials } from "@/features/sports/components/team-initials";
import { getInterestCatalog } from "@/features/subscriptions/catalog";
import { FollowControl } from "@/features/subscriptions/components/follow-control";
import {
  getInterestViewer,
  subscriptionKey,
  type InterestViewerState,
} from "@/features/subscriptions/viewer";

export const metadata: Metadata = {
  title: "Your sports interests — Huddle",
};

function AccessState({ state }: Readonly<{ state: Exclude<InterestViewerState, "eligible"> }>) {
  if (state === "anonymous") {
    return (
      <ProfileAccessState
        actionHref="/auth/sign-in"
        actionLabel="Sign in"
        description="Fixtures are public, but follows belong to a verified Huddle account."
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

function InterestCard({
  title,
  description,
  marker,
  control,
}: Readonly<{
  title: string;
  description: string;
  marker: ReactNode;
  control: ReactNode;
}>) {
  return (
    <Card size="sm">
      <CardContent className="flex h-full flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-center gap-3">
          {marker}
          <div className="min-w-0">
            <p className="truncate font-semibold text-linen">{title}</p>
            <p className="mt-1 text-xs text-muted-dark">{description}</p>
          </div>
        </div>
        {control}
      </CardContent>
    </Card>
  );
}

export default async function InterestSettingsPage() {
  const viewer = await getInterestViewer();
  if (viewer.state !== "eligible") return <AccessState state={viewer.state} />;

  const catalog = await getInterestCatalog();
  const followed = new Set(viewer.followedKeys);

  return (
    <section className="py-12 sm:py-16">
      <div className="flex flex-wrap items-end justify-between gap-6">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-court">
            Your match day
          </p>
          <h1 className="mt-4 text-4xl font-semibold tracking-[-0.05em] text-linen sm:text-6xl">
            Follow what matters.
          </h1>
          <p className="mt-5 max-w-2xl text-lg leading-8 text-muted-dark">
            Choose sports, competitions, and teams. These follows will shape discovery without
            changing who can see or join an event.
          </p>
        </div>
        <Button asChild variant="outline">
          <Link href="/matches">Browse fixtures</Link>
        </Button>
      </div>

      <div className="mt-12 space-y-12">
        <section aria-labelledby="sports-heading">
          <CardHeader className="px-0">
            <CardTitle>
              <h2 id="sports-heading">Sports</h2>
            </CardTitle>
            <p className="text-sm text-muted-dark">The submitted MVP is football-first.</p>
          </CardHeader>
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            {catalog.sports.map((sport) => (
              <InterestCard
                control={
                  <FollowControl
                    initiallyFollowing={followed.has(subscriptionKey("sport", sport.id))}
                    kind="sport"
                    targetId={sport.id}
                    targetName={sport.name}
                  />
                }
                description="Sport"
                key={sport.id}
                marker={<Badge>{sport.name.slice(0, 1).toUpperCase()}</Badge>}
                title={sport.name}
              />
            ))}
          </div>
        </section>

        <section aria-labelledby="competitions-heading">
          <CardHeader className="px-0">
            <CardTitle>
              <h2 id="competitions-heading">Competitions</h2>
            </CardTitle>
            <p className="text-sm text-muted-dark">Available from the last good local catalog.</p>
          </CardHeader>
          {catalog.competitions.length === 0 ? (
            <EmptyState
              description="Run the protected sports import to populate supported competitions."
              headingLevel="h3"
              title="No competitions are available yet."
            />
          ) : (
            <div className="mt-4 grid gap-4 md:grid-cols-2">
              {catalog.competitions.map((competition) => (
                <InterestCard
                  control={
                    <FollowControl
                      initiallyFollowing={followed.has(
                        subscriptionKey("competition", competition.id),
                      )}
                      kind="competition"
                      targetId={competition.id}
                      targetName={competition.name}
                    />
                  }
                  description="Competition"
                  key={competition.id}
                  marker={<Badge variant="outline">{competition.code ?? "Cup"}</Badge>}
                  title={competition.name}
                />
              ))}
            </div>
          )}
        </section>

        <section aria-labelledby="teams-heading">
          <CardHeader className="px-0">
            <CardTitle>
              <h2 id="teams-heading">Teams</h2>
            </CardTitle>
            <p className="text-sm text-muted-dark">Text initials replace provider crest URLs.</p>
          </CardHeader>
          {catalog.teams.length === 0 ? (
            <EmptyState
              description="Run the protected sports import to populate supported teams."
              headingLevel="h3"
              title="No teams are available yet."
            />
          ) : (
            <div className="mt-4 grid gap-4 md:grid-cols-2">
              {catalog.teams.map((team) => (
                <InterestCard
                  control={
                    <FollowControl
                      initiallyFollowing={followed.has(subscriptionKey("team", team.id))}
                      kind="team"
                      targetId={team.id}
                      targetName={team.shortName ?? team.name}
                    />
                  }
                  description="Team"
                  key={team.id}
                  marker={<TeamInitials name={team.name} tla={team.tla} />}
                  title={team.shortName ?? team.name}
                />
              ))}
            </div>
          )}
        </section>
      </div>
    </section>
  );
}
