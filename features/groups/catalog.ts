import "server-only";

import { DomainError } from "@/lib/errors";
import { createAnonymousServerClient } from "@/lib/supabase/anonymous";

export type GroupCreationCatalog = Readonly<{
  cities: readonly Readonly<{ id: string; name: string }>[];
  teams: readonly Readonly<{ id: string; name: string; shortName: string | null }>[];
}>;

export async function getGroupCreationCatalog(): Promise<GroupCreationCatalog> {
  const supabase = createAnonymousServerClient();
  const [citiesResult, teamsResult] = await Promise.all([
    supabase.from("cities").select("id, name_en").eq("active", true).order("name_en").limit(100),
    supabase
      .from("teams")
      .select("id, name, short_name")
      .eq("active", true)
      .order("name")
      .limit(250),
  ]);

  const error = citiesResult.error ?? teamsResult.error;
  if (error !== null) throw new DomainError("INTERNAL_ERROR", { cause: error });

  return {
    cities: (citiesResult.data ?? []).map((city) => ({ id: city.id, name: city.name_en })),
    teams: (teamsResult.data ?? []).map((team) => ({
      id: team.id,
      name: team.name,
      shortName: team.short_name,
    })),
  };
}
