import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { MyHuddleOverview } from "@/features/dashboard/components/my-huddle-overview";
import { getMyHuddleOverview } from "@/features/dashboard/queries";
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
  const supabase = await createClient();
  const { data: claimsData } = await supabase.auth.getClaims();
  const viewerId = typeof claimsData?.claims.sub === "string" ? claimsData.claims.sub : null;
  let displayName: string | null = null;
  let overview: Awaited<ReturnType<typeof getMyHuddleOverview>> | null = null;

  if (viewerId !== null) {
    const profileResult = await supabase
      .from("profiles")
      .select("display_name")
      .eq("id", viewerId)
      .maybeSingle();
    displayName = profileResult.error === null ? (profileResult.data?.display_name ?? null) : null;

    try {
      overview = await getMyHuddleOverview();
    } catch (error) {
      if (!(error instanceof DomainError) || error.code === "INTERNAL_ERROR") throw error;
    }
  }

  if (overview !== null) {
    return (
      <>
        <section className="grid gap-8 py-14 lg:grid-cols-[1fr_22rem] lg:py-20">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-court">
              Welcome back{displayName === null ? "" : `, ${displayName}`}
            </p>
            <h1 className="mt-4 max-w-4xl text-5xl font-semibold leading-[0.98] tracking-[-0.055em] sm:text-7xl">
              Your next match day starts here.
            </h1>
            <p className="mt-7 max-w-2xl text-lg leading-8 text-muted-dark">
              Continue an event or group you already started, respond to an invitation, or find
              something new nearby.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Button asChild size="lg">
                <Link href="/dashboard">Open My Huddle</Link>
              </Button>
              <Button asChild size="lg" variant="outline">
                <Link href="/discover">Discover events</Link>
              </Button>
            </div>
          </div>

          <Card className="self-start rounded-[2rem]">
            <CardHeader>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-court">
                Your activity
              </p>
              <h2 className="mt-2 text-2xl font-semibold text-linen">Nothing gets lost.</h2>
            </CardHeader>
            <CardContent>
              <dl className="grid grid-cols-2 gap-5">
                <div>
                  <dt className="text-sm text-muted-dark">Events</dt>
                  <dd className="mt-1 text-3xl font-semibold text-linen">
                    {overview.events.at(0)?.total_count ?? 0}
                  </dd>
                </div>
                <div>
                  <dt className="text-sm text-muted-dark">Groups</dt>
                  <dd className="mt-1 text-3xl font-semibold text-linen">
                    {overview.groups.at(0)?.total_count ?? 0}
                  </dd>
                </div>
              </dl>
              <Button asChild className="mt-6 w-full" variant="outline">
                <Link href="/people">Find people</Link>
              </Button>
            </CardContent>
          </Card>
        </section>

        <section className="border-t border-border-dark py-12">
          <MyHuddleOverview compact events={overview.events} groups={overview.groups} />
        </section>
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
