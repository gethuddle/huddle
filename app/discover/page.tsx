import type { Metadata } from "next";

import { ErrorState } from "@/components/states/error-state";
import {
  getDiscoveryCatalog,
  getDiscoveryFreshness,
  getViewerCitySlug,
} from "@/features/discovery/catalog";
import { DiscoveryFeed } from "@/features/discovery/components/discovery-feed";
import { DiscoveryFiltersForm } from "@/features/discovery/components/discovery-filters";
import { getDiscoveryPage } from "@/features/discovery/query";
import { parseDiscoveryFilters } from "@/features/discovery/schemas";
import { ProviderFreshness } from "@/features/sports/components/provider-freshness";

export const metadata: Metadata = {
  title: "Discover watch events — Huddle",
  description: "Find eligible future sports watch events near an Israel city.",
};

type DiscoverPageProps = Readonly<{
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}>;

export default async function DiscoverPage({ searchParams }: DiscoverPageProps) {
  const [rawSearchParams, catalog, viewerCitySlug, freshness] = await Promise.all([
    searchParams,
    getDiscoveryCatalog(),
    getViewerCitySlug(),
    getDiscoveryFreshness(),
  ]);
  const defaultCitySlug = viewerCitySlug ?? catalog.cities.at(0)?.slug;
  if (defaultCitySlug === undefined) {
    return (
      <ErrorState
        description="Huddle has no active Israel city fallbacks right now. The event catalog is safe, but discovery needs a city before it can calculate nearby results."
        title="Discovery is temporarily unavailable."
      />
    );
  }

  const filters = parseDiscoveryFilters({
    ...rawSearchParams,
    city: rawSearchParams.city ?? defaultCitySlug,
  });
  const initialPage = await getDiscoveryPage(filters);

  return (
    <section className="py-12 sm:py-16">
      <div className="grid gap-8 lg:grid-cols-[1fr_24rem] lg:items-end">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-court">
            Nearby, eligible, future
          </p>
          <h1 className="mt-4 max-w-4xl text-4xl font-semibold tracking-[-0.05em] text-linen sm:text-6xl">
            Find the room where the match comes alive.
          </h1>
          <p className="mt-5 max-w-2xl text-lg leading-8 text-muted-dark">
            Browse future watch events by city, date, distance, competition, or team. Signed-in
            supporters also see private events they are currently eligible to discover.
          </p>
        </div>
        <ProviderFreshness freshness={freshness} />
      </div>

      <div className="mt-10">
        <DiscoveryFiltersForm catalog={catalog} filters={filters} />
      </div>
      <DiscoveryFeed filters={filters} initialPage={initialPage} />
    </section>
  );
}
