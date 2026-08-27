import "server-only";

import { DomainError } from "@/lib/errors";
import { createAnonymousServerClient } from "@/lib/supabase/anonymous";
import { createClient } from "@/lib/supabase/server";
import { deriveFixtureFreshness, type FixtureFreshness } from "@/features/sports/freshness";

export type DiscoveryCatalog = Readonly<{
  cities: readonly Readonly<{ id: string; slug: string; name: string }>[];
  competitions: readonly Readonly<{ id: string; name: string; code: string | null }>[];
  teams: readonly Readonly<{ id: string; name: string; shortName: string | null }>[];
}>;

export async function getDiscoveryCatalog(): Promise<DiscoveryCatalog> {
  const supabase = createAnonymousServerClient();
  const [citiesResult, competitionsResult, teamsResult] = await Promise.all([
    supabase
      .from("cities")
      .select("id, slug, name_en")
      .eq("active", true)
      .order("name_en")
      .limit(100),
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
  const error = citiesResult.error ?? competitionsResult.error ?? teamsResult.error;
  if (error !== null) throw new DomainError("INTERNAL_ERROR", { cause: error });

  return {
    cities: (citiesResult.data ?? []).map((city) => ({
      id: city.id,
      slug: String(city.slug),
      name: city.name_en,
    })),
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

export async function getViewerCitySlug(): Promise<string | null> {
  const supabase = await createClient();
  const { data: authData } = await supabase.auth.getUser();
  if (authData.user === null) return null;

  const profileResult = await supabase
    .from("profiles")
    .select("city_id")
    .eq("id", authData.user.id)
    .maybeSingle();
  if (profileResult.error !== null) {
    throw new DomainError("INTERNAL_ERROR", { cause: profileResult.error });
  }
  if (profileResult.data?.city_id === null || profileResult.data?.city_id === undefined)
    return null;

  const cityResult = await supabase
    .from("cities")
    .select("slug")
    .eq("id", profileResult.data.city_id)
    .eq("active", true)
    .maybeSingle();
  if (cityResult.error !== null)
    throw new DomainError("INTERNAL_ERROR", { cause: cityResult.error });
  return cityResult.data === null ? null : String(cityResult.data.slug);
}

export async function getDiscoveryFreshness(): Promise<FixtureFreshness> {
  const supabase = createAnonymousServerClient();
  const { data, error } = await supabase.rpc("get_public_provider_freshness", {
    input_provider: "football-data",
  });
  return deriveFixtureFreshness(error === null ? (data.at(0)?.last_succeeded_at ?? null) : null);
}
