import type { Metadata } from "next";

import { ErrorState } from "@/components/states/error-state";
import { getDiscoveryCatalog, getViewerCitySlug } from "@/features/discovery/catalog";
import { DiscoveryFeed } from "@/features/discovery/components/discovery-feed";
import { DiscoveryFiltersForm } from "@/features/discovery/components/discovery-filters";
import { getDiscoveryPage } from "@/features/discovery/query";
import { parseDiscoveryFilters } from "@/features/discovery/schemas";

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

  const filters = parseDiscoveryFilters({
    ...rawSearchParams,
    city: rawSearchParams.city ?? defaultCitySlug,
  });
  const initialPage = await getDiscoveryPage(filters);

  return (
    <section className="py-6 sm:py-10">
      <h1 className="sr-only">Explore watch events</h1>
      <DiscoveryFiltersForm catalog={catalog} filters={filters} />
      <DiscoveryFeed filters={filters} initialPage={initialPage} />
    </section>
  );
}
