import { z } from "zod";

import { boundedPageSchema } from "@/lib/pagination";

export const GROUP_SEARCH_PAGE_SIZE = 20;

function firstSearchParam(value: unknown): unknown {
  return Array.isArray(value) ? value.at(0) : value;
}

const optionalString = z.preprocess(firstSearchParam, z.string().trim().optional());
const optionalUuid = z.preprocess(firstSearchParam, z.union([z.literal(""), z.uuid()]).optional());

const groupSearchFiltersSchema = z
  .object({
    q: optionalString,
    team: optionalUuid,
    cursor: z.preprocess(firstSearchParam, z.string().trim().min(1).max(1024).optional()),
    page: z.preprocess(firstSearchParam, boundedPageSchema.optional()),
    limit: z.preprocess(
      firstSearchParam,
      z.coerce.number().int().min(1).max(50).default(GROUP_SEARCH_PAGE_SIZE),
    ),
  })
  .strict()
  .superRefine((value, context) => {
    const query = value.q ?? "";
    if (query.length === 1 || query.length > 80) {
      context.addIssue({
        code: "custom",
        path: ["q"],
        message: "Search with 2 to 80 characters.",
      });
    }
  });

export type GroupSearchFilters = Readonly<{
  query: string | null;
  teamId: string | null;
  cursor: string | null;
  limit: number;
}>;

export function parseGroupSearchFilters(input: unknown): GroupSearchFilters {
  const raw = groupSearchFiltersSchema.parse(input);
  return {
    query: raw.q === undefined || raw.q === "" ? null : raw.q,
    teamId: raw.team === undefined || raw.team === "" ? null : raw.team,
    cursor: raw.cursor ?? null,
    limit: raw.limit,
  };
}

export function groupSearchFilterIdentity(filters: GroupSearchFilters) {
  return {
    query: filters.query?.toLowerCase() ?? null,
    team: filters.teamId,
  };
}

export function groupSearchParams(
  filters: GroupSearchFilters,
  cursor: string | null = filters.cursor,
): URLSearchParams {
  const search = new URLSearchParams({ limit: String(filters.limit) });
  if (filters.query !== null) search.set("q", filters.query);
  if (filters.teamId !== null) search.set("team", filters.teamId);
  if (cursor !== null) search.set("cursor", cursor);
  return search;
}
