import type { Metadata } from "next";

import { getDiscoveryCatalog } from "@/features/discovery/catalog";
import { DiscoveryFilterError } from "@/features/discovery/components/discovery-filter-error";
import { DiscoveryFeed } from "@/features/discovery/components/discovery-feed";
import { DiscoveryFiltersForm } from "@/features/discovery/components/discovery-filters";
import { ExploreTabs } from "@/features/discovery/components/explore-tabs";
import { parseDiscoveryFiltersResult } from "@/features/discovery/schemas";
import { getFixtureById } from "@/features/sports/browse";
import { getDiscoveryViewerCacheScope } from "@/features/workspaces/queries";

export const metadata: Metadata = {
  title: "Explore watch events — Huddle",
  description: "Find a new sports watch event near you.",
};

type DiscoverPageProps = Readonly<{
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}>;

export default async function DiscoverPage({ searchParams }: DiscoverPageProps) {
  const [rawSearchParams, catalog, viewerCacheScope] = await Promise.all([
    searchParams,
    getDiscoveryCatalog(),
    getDiscoveryViewerCacheScope(),
  ]);

  const parsedFilters = parseDiscoveryFiltersResult(rawSearchParams);
  if (!parsedFilters.ok) {
    return (
      <section className="py-6 sm:py-10">
        <h1 className="sr-only">Explore watch events</h1>
        <ExploreTabs current="events" />
        <DiscoveryFiltersForm
          catalog={catalog}
          fieldErrors={parsedFilters.fieldErrors}
          filters={parsedFilters.values}
          key={`invalid:${parsedFilters.values.from}:${parsedFilters.values.to}:${parsedFilters.fieldErrors.from ?? ""}:${parsedFilters.fieldErrors.to ?? ""}`}
        />
        <DiscoveryFilterError errors={parsedFilters.fieldErrors} resetHref="/discover" />
      </section>
    );
  }

  const filters = parsedFilters.filters;
  const selectedFixture = filters.matchId === null ? null : await getFixtureById(filters.matchId);
  const selectedMatch = selectedFixture?.match ?? null;
  const currentFixtureLabel =
    selectedMatch === null
      ? null
      : `${selectedMatch.homeTeam.shortName ?? selectedMatch.homeTeam.name} vs ${selectedMatch.awayTeam.shortName ?? selectedMatch.awayTeam.name} — ${selectedMatch.competition.name}`;

  return (
    <section className="py-6 sm:py-10">
      <h1 className="sr-only">Explore watch events</h1>
      <ExploreTabs current="events" />
      <DiscoveryFiltersForm
        catalog={catalog}
        currentFixtureLabel={currentFixtureLabel}
        filters={filters}
        key={`valid:${filters.from}:${filters.to}`}
      />
      <DiscoveryFeed
        filters={filters}
        initialPage={{
          items: [],
          nextCursor: null,
          locationMode: "browser",
          generatedAt: new Date().toISOString(),
          requiresPrivateCache: true,
          viewerCacheScope,
        }}
      />
    </section>
  );
}
