import type { Metadata } from "next";

import { ErrorState } from "@/components/states/error-state";
import { getDiscoveryCatalog, getViewerCitySlug } from "@/features/discovery/catalog";
import { DiscoveryFilterError } from "@/features/discovery/components/discovery-filter-error";
import { DiscoveryFeed } from "@/features/discovery/components/discovery-feed";
import { DiscoveryFiltersForm } from "@/features/discovery/components/discovery-filters";
import { ExploreTabs } from "@/features/discovery/components/explore-tabs";
import { getDiscoveryPage } from "@/features/discovery/query";
import { parseDiscoveryFiltersResult } from "@/features/discovery/schemas";
import { getFixtureById } from "@/features/sports/browse";

export const metadata: Metadata = {
  title: "Explore watch events — Huddle",
  description: "Find a new sports watch event near you.",
};

type DiscoverPageProps = Readonly<{
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}>;

export default async function DiscoverPage({ searchParams }: DiscoverPageProps) {
  const [rawSearchParams, catalog, viewerCitySlug] = await Promise.all([
    searchParams,
    getDiscoveryCatalog(),
    getViewerCitySlug(),
  ]);
  const defaultCitySlug = viewerCitySlug ?? catalog.cities.at(0)?.slug;
  if (defaultCitySlug === undefined) {
    return (
      <ErrorState
        description="Huddle has no active city fallbacks right now. The event catalog is safe, but discovery needs a city before it can calculate nearby results."
        title="Discovery is temporarily unavailable."
      />
    );
  }

  const parsedFilters = parseDiscoveryFiltersResult({
    ...rawSearchParams,
    city: rawSearchParams.city ?? defaultCitySlug,
  });
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
        <DiscoveryFilterError
          errors={parsedFilters.fieldErrors}
          resetHref={`/discover?city=${encodeURIComponent(parsedFilters.values.citySlug || defaultCitySlug)}`}
        />
      </section>
    );
  }

  const filters = parsedFilters.filters;
  const [initialPage, selectedFixture] = await Promise.all([
    getDiscoveryPage(filters),
    filters.matchId === null ? Promise.resolve(null) : getFixtureById(filters.matchId),
  ]);
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
        initialPage={initialPage}
        originCityName={
          catalog.cities.find((city) => city.slug === filters.citySlug)?.name ?? filters.citySlug
        }
      />
    </section>
  );
}
