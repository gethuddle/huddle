import type { Metadata } from "next";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const metadata: Metadata = {
  title: "Data sources — Huddle",
};

export default function DataSourcesPage() {
  return (
    <section className="mx-auto w-full max-w-4xl py-12 sm:py-20">
      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-court">Transparency</p>
      <h1 className="mt-4 text-4xl font-semibold tracking-[-0.05em] text-linen sm:text-6xl">
        Where fixture data comes from.
      </h1>
      <p className="mt-5 max-w-2xl text-lg leading-8 text-muted-dark">
        Fixture information is refreshed regularly. If an update is delayed, Huddle keeps the most
        recent available fixture list.
      </p>

      <div className="mt-10 grid gap-5 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>
              <h2>Football fixtures</h2>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 leading-7 text-muted-dark">
            <p>
              Football competition, team, and fixture data is supplied by{" "}
              <a
                className="font-semibold text-linen underline underline-offset-4"
                href="https://www.football-data.org/"
                rel="noreferrer"
                target="_blank"
              >
                football-data.org
              </a>
              .
            </p>
            <p>
              Huddle shows the competition, teams, kickoff, and status details needed to browse and
              plan a gathering.
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>
              <h2>Freshness and availability</h2>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 leading-7 text-muted-dark">
            <p>
              Fixture pages show when information was updated and how far the available schedule
              currently reaches.
            </p>
            <p>
              Delayed updates and a short schedule are explained separately, so a recent update is
              never presented as proof that later fixtures are already available.
            </p>
          </CardContent>
        </Card>
      </div>
    </section>
  );
}
