import "server-only";

import { z } from "zod";

import { requireActor } from "@/features/auth/actor";
import { DomainError, domainErrorFromDatabase } from "@/lib/errors";

export const PEOPLE_PAGE_SIZE = 20;

export const peopleSearchQuerySchema = z
  .object({
    q: z
      .string()
      .trim()
      .transform((value) => value.replace(/^@/, ""))
      .pipe(z.string().min(2).max(50)),
    page: z.coerce.number().int().positive().default(1),
  })
  .strict();

const peopleSearchRowSchema = z
  .object({
    handle: z.string(),
    display_name: z.string(),
    city_name: z.string(),
    friendship_id: z.uuid().nullable(),
    friendship_status: z.enum(["pending", "accepted"]).nullable(),
    friendship_direction: z.enum(["incoming", "outgoing", "accepted"]).nullable(),
    total_count: z.number().int().nonnegative(),
  })
  .strict();

export type PeopleSearchItem = Readonly<{
  handle: string;
  displayName: string;
  cityName: string;
  friendship: Readonly<{
    id: string;
    status: "pending" | "accepted";
    direction: "incoming" | "outgoing" | "accepted";
  }> | null;
}>;

export async function searchPeople(
  query: string,
  page: number,
): Promise<
  Readonly<{
    items: readonly PeopleSearchItem[];
    pageCount: number;
    totalCount: number;
  }>
> {
  const { supabase } = await requireActor("community");
  const { data, error } = await supabase.rpc("search_people", {
    input_query: query,
    input_limit: PEOPLE_PAGE_SIZE,
    input_offset: (page - 1) * PEOPLE_PAGE_SIZE,
  });
  if (error !== null) throw domainErrorFromDatabase(error);

  let rows: z.infer<typeof peopleSearchRowSchema>[];
  try {
    rows = z.array(peopleSearchRowSchema).parse(data);
  } catch (cause) {
    throw new DomainError("INTERNAL_ERROR", { cause });
  }

  const totalCount = rows.at(0)?.total_count ?? 0;
  return {
    totalCount,
    pageCount: Math.max(1, Math.ceil(totalCount / PEOPLE_PAGE_SIZE)),
    items: rows.map((row) => ({
      handle: row.handle,
      displayName: row.display_name,
      cityName: row.city_name,
      friendship:
        row.friendship_id === null ||
        row.friendship_status === null ||
        row.friendship_direction === null
          ? null
          : {
              id: row.friendship_id,
              status: row.friendship_status,
              direction: row.friendship_direction,
            },
    })),
  };
}
