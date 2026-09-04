import "server-only";

import { unstable_cache } from "next/cache";

import { SPORTS_CATALOG_REVALIDATE_SECONDS, sportsCatalogCacheTag } from "@/features/sports/cache";
import { getPublicEnvironment } from "@/lib/env/public";
import { DomainError } from "@/lib/errors";
import { createAnonymousServerClient } from "@/lib/supabase/anonymous";
import { deriveFixtureFreshness, type FixtureFreshness } from "@/features/sports/freshness";

export type DiscoveryCatalog = Readonly<{
  competitions: readonly Readonly<{ id: string; name: string; code: string | null }>[];
  teams: readonly Readonly<{ id: string; name: string; shortName: string | null }>[];
}>;

async function loadDiscoveryCatalog(): Promise<DiscoveryCatalog> {
  const supabase = createAnonymousServerClient();
  const [competitionsResult, teamsResult] = await Promise.all([
    supabase
      .from("competitions")
      .select("id, name, code")
      .eq("active", true)
      .order("name")
      .limit(100),
    supabase
      .from("teams")
      .select("id, name, short_name")
      .eq("active", true)
      .order("name")
      .limit(250),
  ]);
  const error = competitionsResult.error ?? teamsResult.error;
  if (error !== null) throw new DomainError("INTERNAL_ERROR", { cause: error });

  return {
    competitions: (competitionsResult.data ?? []).map((competition) => ({
      id: competition.id,
      name: competition.name,
      code: competition.code,
    })),
    teams: (teamsResult.data ?? []).map((team) => ({
      id: team.id,
      name: team.name,
      shortName: team.short_name,
    })),
  };
}

const catalogEnvironment = getPublicEnvironment();
const getCachedDiscoveryCatalog = unstable_cache(
  loadDiscoveryCatalog,
  ["discovery-sports-catalog-v1", catalogEnvironment.NEXT_PUBLIC_SUPABASE_URL],
  {
    revalidate: SPORTS_CATALOG_REVALIDATE_SECONDS,
    tags: [sportsCatalogCacheTag(catalogEnvironment.NEXT_PUBLIC_SUPABASE_URL)],
  },
);

export async function getDiscoveryCatalog(): Promise<DiscoveryCatalog> {
  return getCachedDiscoveryCatalog();
}

export async function getDiscoveryFreshness(): Promise<FixtureFreshness> {
  const supabase = createAnonymousServerClient();
  const { data, error } = await supabase.rpc("get_public_provider_freshness", {
    input_provider: "football-data",
  });
  return deriveFixtureFreshness(
    error === null ? (data.at(0)?.updated_at ?? null) : null,
    error === null ? (data.at(0)?.coverage_through ?? null) : null,
  );
}
