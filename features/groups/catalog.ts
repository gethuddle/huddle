import "server-only";

import { DomainError } from "@/lib/errors";
import { createAnonymousServerClient } from "@/lib/supabase/anonymous";

export type GroupCreationCatalog = Readonly<{
  teams: readonly Readonly<{ id: string; name: string; shortName: string | null }>[];
}>;

export async function getGroupCreationCatalog(): Promise<GroupCreationCatalog> {
  const supabase = createAnonymousServerClient();
  const teamsResult = await supabase
    .from("teams")
    .select("id, name, short_name")
    .eq("active", true)
    .order("name")
    .limit(250);

  const error = teamsResult.error;
  if (error !== null) throw new DomainError("INTERNAL_ERROR", { cause: error });

  return {
    teams: (teamsResult.data ?? []).map((team) => ({
      id: team.id,
      name: team.name,
      shortName: team.short_name,
    })),
  };
}
