import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

import { DomainError, domainErrorFromDatabase } from "@/lib/errors";
import type { Database } from "@/types/database.generated";

const teamVisualRowSchema = z
  .object({
    name: z.string().min(1),
    tla: z.string().nullable(),
    crest_url: z.url().nullable(),
  })
  .strict();

export type TeamVisual = Readonly<{ tla: string | null; crestUrl: string | null }>;
type TeamVisualClient = Pick<SupabaseClient<Database>, "from">;

export async function loadTeamVisualsByName(
  client: TeamVisualClient,
  names: readonly string[],
): Promise<ReadonlyMap<string, TeamVisual>> {
  const uniqueNames = [...new Set(names.filter((name) => name.trim().length > 0))];
  if (uniqueNames.length === 0) return new Map();

  const { data, error } = await client
    .from("teams")
    .select("name, tla, crest_url")
    .in("name", uniqueNames)
    .eq("active", true);
  if (error !== null) throw domainErrorFromDatabase(error);

  try {
    return new Map(
      z
        .array(teamVisualRowSchema)
        .parse(data)
        .map((row) => [row.name, { tla: row.tla, crestUrl: row.crest_url } satisfies TeamVisual]),
    );
  } catch (cause) {
    throw new DomainError("INTERNAL_ERROR", { cause });
  }
}
