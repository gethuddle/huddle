import type { Metadata } from "next";
import Link from "next/link";

import { EmptyState } from "@/components/states/empty-state";
import { Button } from "@/components/ui/button";
import { getFixtureBrowserData } from "@/features/sports/browse";
import { parseFixtureFilters } from "@/features/sports/browse-schemas";
import { FixtureFilters } from "@/features/sports/components/fixture-filters";
import { FixturePagination } from "@/features/sports/components/fixture-pagination";
import { MatchCard } from "@/features/sports/components/match-card";
import { ProviderFreshness } from "@/features/sports/components/provider-freshness";

export const metadata: Metadata = {
  title: "Football fixtures — Huddle",
  description: "Browse locally cached football fixtures in Israel time.",
};

type MatchesPageProps = Readonly<{
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}>;

export default async function MatchesPage({ searchParams }: MatchesPageProps) {
  const filters = parseFixtureFilters(await searchParams);
  const data = await getFixtureBrowserData(filters);

  return (
    <section className="py-12 sm:py-16">
      <div className="grid gap-8 lg:grid-cols-[1fr_24rem] lg:items-end">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-court">
            Football first
          </p>
          <h1 className="mt-4 max-w-4xl text-4xl font-semibold tracking-[-0.05em] text-linen sm:text-6xl">
            Find the fixture. Then find your huddle.
          </h1>
          <p className="mt-5 max-w-2xl text-lg leading-8 text-muted-dark">
            Browse every fixture currently in Huddle by Israel date, competition, or team.
          </p>
        </div>
        <ProviderFreshness freshness={data.freshness} />
      </div>

      <div className="mt-10">
        <FixtureFilters competitions={data.competitions} filters={filters} teams={data.teams} />
      </div>

      <div className="mt-10 flex items-end justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-dark">
            Upcoming fixtures
          </p>
          <h2 className="mt-2 text-2xl font-semibold tracking-[-0.035em] text-linen">
            {data.total} {data.total === 1 ? "match" : "matches"}
          </h2>
        </div>
        <Button asChild variant="ghost">
          <Link href="/settings/interests">Manage follows</Link>
        </Button>
      </div>

      {data.matches.length === 0 ? (
        <EmptyState
          action={
            <Button asChild>
              <Link href="/matches">Clear filters</Link>
            </Button>
          }
          description="Try another Israel date, competition, or team."
          headingLevel="h3"
          title={
            data.total === 0 ? "No fixtures match these filters." : "No fixtures on this page."
          }
        />
      ) : (
        <div className="mt-6 grid gap-5 md:grid-cols-2 xl:grid-cols-3">
          {data.matches.map((match) => (
            <MatchCard key={match.id} match={match} />
          ))}
        </div>
      )}

      <FixturePagination filters={filters} totalPages={data.totalPages} />

      <p className="mt-12 border-t border-border-dark pt-6 text-sm text-muted-dark">
        Football data supplied by{" "}
        <a
          className="font-semibold text-linen underline decoration-border-strong underline-offset-4 hover:text-court"
          href="https://www.football-data.org/"
          rel="noreferrer"
          target="_blank"
        >
          football-data.org
        </a>
        . Read our{" "}
        <Link className="text-linen underline underline-offset-4" href="/data-sources">
          data source notes
        </Link>
        .
      </p>
    </section>
  );
}
