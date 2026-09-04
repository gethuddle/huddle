import "server-only";

import { DomainError } from "@/lib/errors";
import { createAnonymousServerClient } from "@/lib/supabase/anonymous";

export type InterestCatalog = Readonly<{
  sports: readonly Readonly<{ id: string; name: string; slug: string }>[];
  competitions: readonly Readonly<{
    id: string;
    name: string;
    code: string | null;
    sportId: string;
  }>[];
  teams: readonly Readonly<{
    id: string;
    name: string;
    shortName: string | null;
    tla: string | null;
    crestUrl: string | null;
    sportId: string;
  }>[];
}>;

export async function getInterestCatalog(teamSearch = ""): Promise<InterestCatalog> {
  const supabase = createAnonymousServerClient();
  const normalizedTeamSearch = teamSearch.trim();
  let teamQuery = supabase
    .from("teams")
    .select("id, name, short_name, tla, crest_url, sport_id")
    .eq("active", true);
  if (normalizedTeamSearch.length > 0) {
    const pattern = escapeLikePattern(normalizedTeamSearch);
    teamQuery = teamQuery.or(
      [`name.ilike.${pattern}`, `short_name.ilike.${pattern}`, `tla.ilike.${pattern}`].join(","),
    );
  }
  const [sportResult, competitionResult, teamResult] = await Promise.all([
    supabase.from("sports").select("id, name, slug").eq("active", true).order("name").limit(20),
    supabase
      .from("competitions")
      .select("id, name, code, sport_id")
      .eq("active", true)
      .order("name")
      .limit(100),
    teamQuery.order("name").limit(100),
  ]);

  const error = sportResult.error ?? competitionResult.error ?? teamResult.error;
  if (error !== null) throw new DomainError("INTERNAL_ERROR", { cause: error });

  return {
    sports: sportResult.data ?? [],
    competitions: (competitionResult.data ?? []).map((competition) => ({
      id: competition.id,
      name: competition.name,
      code: competition.code,
      sportId: competition.sport_id,
    })),
    teams: (teamResult.data ?? []).map((team) => ({
      id: team.id,
      name: team.name,
      shortName: team.short_name,
      tla: team.tla,
      crestUrl: team.crest_url,
      sportId: team.sport_id,
    })),
  };
}

function escapeLikePattern(value: string) {
  const escaped = value
    .replaceAll("\\", "\\\\")
    .replaceAll("%", "\\%")
    .replaceAll("_", "\\_")
    .replaceAll('"', '\\"');
  return `"%${escaped}%"`;
}
