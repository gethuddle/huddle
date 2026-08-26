import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";

const journey = [
  {
    number: "01",
    title: "Follow",
    description: "Choose the football teams and competitions that matter to you.",
  },
  {
    number: "02",
    title: "Discover",
    description: "Find eligible watch events connected to a fixture and an Israel city.",
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

export default function Home() {
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
              <Link href="/settings/interests">Choose interests</Link>
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
              Secure accounts, adult onboarding, safe public profiles, blocking, the local sports
              catalog, fixture browsing, and personal follows are now connected.
            </p>
            <dl className="mt-8 grid grid-cols-2 gap-5 border-t border-border-strong pt-7 text-sm">
              <div>
                <dt className="text-muted-dark">Provider calls</dt>
                <dd className="mt-1 font-semibold">Server sync only</dd>
              </div>
              <div>
                <dt className="text-muted-dark">Display time</dt>
                <dd className="mt-1 font-semibold">Jerusalem</dd>
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
