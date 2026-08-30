import Link from "next/link";
import { redirect } from "next/navigation";

import { AttentionList } from "@/features/attention/components/attention-list";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { getFanHome } from "@/features/dashboard/queries";
import { formatIsraelKickoff } from "@/features/sports/time";
import { getAppShellState } from "@/features/workspaces/queries";
import { workspaceLanding } from "@/features/workspaces/state";
import { DomainError } from "@/lib/errors";
import { createClient } from "@/lib/supabase/server";

const journey = [
  {
    number: "01",
    title: "Follow",
    description: "Choose the football teams and competitions that matter to you.",
  },
  {
    number: "02",
    title: "Discover",
    description: "Find eligible watch events connected to a fixture and a city in Israel.",
  },
  {
    number: "03",
    title: "Request or join",
    description: "Ask for a place or accept a direct invitation through a controlled flow.",
  },
  {
    number: "04",
    title: "Host and manage",
    description: "Create a gathering and manage attendance without exposing private details early.",
  },
] as const;

export default async function Home() {
  const state = await getAppShellState();
  const workspace = state.workspace;
  if (state.isSignedIn && workspace.active === null) {
    redirect("/onboarding");
  }
  if (workspace.active?.kind === "venue") {
    redirect(workspaceLanding(workspace.active));
  }

  const supabase = await createClient();
  const { data: claimsData } = await supabase.auth.getClaims();
  const viewerId = typeof claimsData?.claims.sub === "string" ? claimsData.claims.sub : null;
  let displayName: string | null = null;
  let fanHome: Awaited<ReturnType<typeof getFanHome>> | null = null;

  if (viewerId !== null) {
    const profileResult = await supabase
      .from("profiles")
      .select("display_name")
      .eq("id", viewerId)
      .maybeSingle();
    displayName = profileResult.error === null ? (profileResult.data?.display_name ?? null) : null;

    try {
      fanHome = await getFanHome();
    } catch (error) {
      if (!(error instanceof DomainError) || error.code === "INTERNAL_ERROR") throw error;
    }
  }

  if (workspace.active?.kind === "fan") {
    const nextEvent = fanHome?.nextEvent ?? null;
    const suggestion = fanHome?.suggestion ?? null;
    return (
      <>
        <section className="grid gap-8 py-12 lg:grid-cols-[1fr_auto] lg:items-end lg:py-16">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-court">
              Welcome back{displayName === null ? "" : `, ${displayName}`}
            </p>
            <h1 className="mt-4 max-w-4xl text-4xl font-semibold leading-[1.02] tracking-[-0.05em] sm:text-6xl">
              Ready for your next match day?
            </h1>
            <p className="mt-5 max-w-2xl text-lg leading-8 text-muted-dark">
              See the next plan, handle anything waiting, or start from a fixture you follow.
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Button asChild size="lg">
              <Link href="/matches">Explore fixtures</Link>
            </Button>
            <Button asChild size="lg" variant="outline">
              <Link href="/events/new">Plan a huddle</Link>
            </Button>
          </div>
        </section>

        <section aria-labelledby="next-event-heading" className="border-t border-border-dark py-10">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-court">Up next</p>
          {nextEvent === null ? (
            <Card className="mt-4 border-dashed" size="sm">
              <CardContent className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h2 className="text-xl font-semibold text-linen" id="next-event-heading">
                    No plan yet
                  </h2>
                  <p className="mt-2 text-sm leading-6 text-muted-dark">
                    Explore fixtures to find a watch event, or plan a huddle for people you know.
                  </p>
                </div>
                <Button asChild className="min-h-11 shrink-0" variant="outline">
                  <Link href="/dashboard">Open My Huddle</Link>
                </Button>
              </CardContent>
            </Card>
          ) : (
            <Card className="mt-4" size="sm">
              <CardContent className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-sm font-medium text-court">{nextEvent.relationshipLabel}</p>
                  <h2 className="mt-1 text-2xl font-semibold text-linen" id="next-event-heading">
                    {nextEvent.title}
                  </h2>
                  <p className="mt-2 text-sm text-muted-dark">
                    {nextEvent.homeTeamName} vs {nextEvent.awayTeamName} · {nextEvent.cityName}
                  </p>
                  <p className="mt-1 text-sm text-muted-dark">
                    {formatIsraelKickoff(nextEvent.startsAt)}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button asChild className="min-h-11">
                    <Link href={`/events/${nextEvent.id}`}>Open next event</Link>
                  </Button>
                  <Button asChild className="min-h-11" variant="outline">
                    <Link href="/dashboard">Open My Huddle</Link>
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}
        </section>

        <div className="grid gap-10 border-t border-border-dark py-10 lg:grid-cols-[1.1fr_0.9fr]">
          <AttentionList items={fanHome?.attention ?? []} />

          <section aria-labelledby="fixture-suggestion-heading">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-court">
              From your interests
            </p>
            <h2 className="mt-2 text-2xl font-semibold text-linen" id="fixture-suggestion-heading">
              One fixture to consider
            </h2>
            {suggestion === null ? (
              <Card className="mt-5 border-dashed" size="sm">
                <CardContent>
                  <p className="font-semibold text-linen">Make Home feel like yours.</p>
                  <p className="mt-2 text-sm leading-6 text-muted-dark">
                    Follow a team or competition and the next relevant local fixture will appear
                    here.
                  </p>
                  <Button asChild className="mt-4 min-h-11" size="sm" variant="outline">
                    <Link href="/settings/interests">Choose interests</Link>
                  </Button>
                </CardContent>
              </Card>
            ) : (
              <Card className="mt-5" size="sm">
                <CardHeader>
                  <p className="text-sm text-muted-dark">{suggestion.competition.name}</p>
                  <h3 className="mt-1 text-xl font-semibold text-linen">
                    {suggestion.homeTeam.name} vs {suggestion.awayTeam.name}
                  </h3>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-dark">
                    {formatIsraelKickoff(suggestion.startsAt)}
                  </p>
                  <Button asChild className="mt-4 min-h-11" size="sm" variant="outline">
                    <Link href={`/matches/${suggestion.id}`}>Open fixture</Link>
                  </Button>
                </CardContent>
              </Card>
            )}
          </section>
        </div>
      </>
    );
  }

  return (
    <>
      <section className="grid flex-1 items-center gap-14 py-20 lg:grid-cols-[1.3fr_0.7fr] lg:py-28">
        <div>
          <p className="mb-6 inline-flex items-center gap-2 rounded-full border border-border-dark bg-surface-deep px-4 py-2 text-sm font-medium text-muted-dark">
            <span aria-hidden="true" className="size-1.5 rounded-full bg-court" />
            Israel pilot · Football first
          </p>
          <h1 className="max-w-4xl text-5xl font-semibold leading-[0.98] tracking-[-0.055em] sm:text-7xl lg:text-[5.8rem]">
            Match day is better together.
          </h1>
          <p className="mt-8 max-w-2xl text-lg leading-8 text-muted-dark sm:text-xl">
            Follow the football teams and competitions that matter to you, then browse upcoming
            fixtures from Huddle’s local match catalog.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Button asChild size="lg">
              <Link href="/matches">Browse fixtures</Link>
            </Button>
            <Button asChild size="lg" variant="outline">
              <Link href={viewerId === null ? "/auth/sign-up" : "/settings/profile"}>
                {viewerId === null ? "Create your account" : "Finish account setup"}
              </Link>
            </Button>
          </div>
        </div>

        <Card className="rounded-[2rem]">
          <CardHeader className="px-8 sm:px-10">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-sand">
              What works now
            </p>
            <h2 className="mt-3 text-3xl font-semibold tracking-[-0.04em]">
              Start with the fixture.
            </h2>
          </CardHeader>
          <CardContent className="px-8 sm:px-10">
            <p className="leading-7 text-muted-dark">
              Pick a fixture, find a watch event nearby, and connect with people who follow the same
              teams. Private home details stay protected until attendance is approved.
            </p>
            <dl className="mt-8 grid grid-cols-2 gap-5 border-t border-border-strong pt-7 text-sm">
              <div>
                <dt className="text-muted-dark">Pilot area</dt>
                <dd className="mt-1 font-semibold">Israel</dd>
              </div>
              <div>
                <dt className="text-muted-dark">Match times</dt>
                <dd className="mt-1 font-semibold">Israel time</dd>
              </div>
            </dl>
          </CardContent>
        </Card>
      </section>

      <section aria-labelledby="journey-heading" className="border-t border-border-dark py-12">
        <h2 id="journey-heading" className="sr-only">
          The Huddle journey
        </h2>
        <ol className="grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
          {journey.map((step) => (
            <li key={step.number}>
              <Card className="h-full bg-surface-deep" size="sm">
                <CardContent>
                  <span className="text-xs font-bold tracking-[0.18em] text-court">
                    {step.number}
                  </span>
                  <h3 className="mt-3 text-lg font-semibold tracking-[-0.02em]">{step.title}</h3>
                  <p className="mt-2 text-sm leading-6 text-muted-dark">{step.description}</p>
                </CardContent>
              </Card>
            </li>
          ))}
        </ol>
      </section>
    </>
  );
}
