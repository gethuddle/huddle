import "server-only";

import { z } from "zod";

import { cursorFilterKey, decodeGroupCursor, encodeGroupCursor } from "@/features/discovery/cursor";
import {
  groupSearchFilterIdentity,
  type GroupSearchFilters,
} from "@/features/groups/search-schemas";
import { getServerEnvironment } from "@/lib/env/server";
import { DomainError, domainErrorFromDatabase } from "@/lib/errors";
import { createClient } from "@/lib/supabase/server";

const groupSearchRowSchema = z
  .object({
    group_id: z.uuid(),
    slug: z.string(),
    name: z.string(),
    description: z.string(),
    city_name: z.string(),
    team_name: z.string().nullable(),
    active_member_count: z.number().int().nonnegative(),
    cursor_name: z.string(),
    has_more: z.boolean(),
  })
  .strict();

export type GroupSearchItem = Readonly<{
  id: string;
  slug: string;
  name: string;
  description: string;
  cityName: string;
  teamName: string | null;
  activeMemberCount: number;
}>;

export type GroupSearchPage = Readonly<{
  items: readonly GroupSearchItem[];
  nextCursor: string | null;
  requiresPrivateCache: boolean;
}>;

export async function getGroupSearchPage(filters: GroupSearchFilters): Promise<GroupSearchPage> {
  const supabase = await createClient();
  const [cityResult, authResult] = await Promise.all([
    filters.citySlug === null
      ? Promise.resolve({ data: null, error: null })
      : supabase
          .from("cities")
          .select("id")
          .eq("slug", filters.citySlug)
          .eq("active", true)
          .maybeSingle(),
    supabase.auth.getUser(),
  ]);

  if (cityResult.error !== null)
    throw new DomainError("INTERNAL_ERROR", { cause: cityResult.error });
  if (filters.citySlug !== null && cityResult.data === null) {
    throw new DomainError("VALIDATION_FAILED");
  }

  const secret = getServerEnvironment().DISCOVERY_CURSOR_SECRET;
  const filterKey = cursorFilterKey(groupSearchFilterIdentity(filters));
  const decodedCursor = filters.cursor === null ? null : decodeGroupCursor(filters.cursor, secret);
  if (decodedCursor !== null && decodedCursor.filterKey !== filterKey) {
    throw new DomainError("VALIDATION_FAILED");
  }

  const { data, error } = await supabase.rpc("search_groups", {
    input_query: filters.query ?? undefined,
    input_city_id: cityResult.data?.id,
    input_team_id: filters.teamId ?? undefined,
    input_after_name: decodedCursor?.name,
    input_after_id: decodedCursor?.id,
    input_limit: filters.limit,
  });
  if (error !== null) throw domainErrorFromDatabase(error);

  let rows: z.infer<typeof groupSearchRowSchema>[];
  try {
    rows = z.array(groupSearchRowSchema).parse(data);
  } catch (cause) {
    throw new DomainError("INTERNAL_ERROR", { cause });
  }

  const last = rows.at(-1);
  const nextCursor =
    last?.has_more === true
      ? encodeGroupCursor({ filterKey, name: last.cursor_name, id: last.group_id }, secret)
      : null;

  // The request JWT can still personalize the RPC when getUser cannot confirm identity.
  // Treat that uncertainty as private so viewer-filtered results never enter shared cache.
  const requiresPrivateCache = authResult.error !== null || authResult.data.user !== null;

  return {
    items: rows.map((row) => ({
      id: row.group_id,
      slug: row.slug,
      name: row.name,
      description: row.description,
      cityName: row.city_name,
      teamName: row.team_name,
      activeMemberCount: row.active_member_count,
    })),
    nextCursor,
    requiresPrivateCache,
  };
}
