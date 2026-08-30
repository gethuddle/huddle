import "server-only";

import { z } from "zod";

import { requireActor } from "@/features/auth/actor";
import { DomainError, domainErrorFromDatabase } from "@/lib/errors";
import {
  boundedPage,
  collectionHasOverflow,
  collectionOffset,
  collectionPageCount,
  collectionVisibleTotal,
  COLLECTION_PAGE_SIZE,
  MAX_COLLECTION_PAGE,
  collectionPageInput,
} from "@/lib/pagination";

export const PEOPLE_PAGE_SIZE = COLLECTION_PAGE_SIZE;
export const peopleBuckets = ["suggested", "search", "accepted", "incoming", "sent"] as const;
export type PeopleBucket = (typeof peopleBuckets)[number];

export const peopleSearchQuerySchema = z
  .object({
    q: z
      .string()
      .trim()
      .transform((value) => value.replace(/^@/, ""))
      .pipe(z.string().min(2).max(50)),
    page: z
      .preprocess((value) => {
        const input = collectionPageInput(value);
        if (input.wasAboveWindow) return input.page;
        const numeric = Number(value);
        return Number.isSafeInteger(numeric) && numeric <= MAX_COLLECTION_PAGE ? value : 1;
      }, z.coerce.number().int().positive())
      .default(1),
  })
  .strict();

const peopleHubRowSchema = z
  .object({
    profile_id: z.uuid(),
    handle: z.string(),
    display_name: z.string(),
    city_name: z.string(),
    reason: z.string().nullable(),
    friendship_id: z.uuid().nullable(),
    friendship_status: z.enum(["pending", "accepted"]).nullable(),
    friendship_direction: z.enum(["incoming", "sent", "accepted"]).nullable(),
    relationship_created_at: z.iso.datetime({ offset: true }).nullable(),
    total_count: z.number().int().nonnegative(),
  })
  .strict();

export type PeopleHubItem = Readonly<{
  id: string;
  handle: string;
  displayName: string;
  cityName: string;
  reason: string | null;
  friendship: Readonly<{
    id: string;
    status: "pending" | "accepted";
    direction: "incoming" | "outgoing" | "accepted";
  }> | null;
}>;

export type PeopleSearchItem = PeopleHubItem;
export type PeopleHubPage = Readonly<{
  items: readonly PeopleHubItem[];
  page: number;
  pageCount: number;
  totalCount: number;
  hasMoreBeyondWindow: boolean;
}>;

function normalizePeopleQuery(bucket: PeopleBucket, query: unknown): string {
  if (bucket === "search") {
    const result = z
      .string()
      .trim()
      .transform((value) => value.replace(/^@/, ""))
      .pipe(z.string().min(2).max(50))
      .safeParse(query);
    if (!result.success) throw new DomainError("VALIDATION_FAILED", { cause: result.error });
    return result.data;
  }

  if (query !== undefined && query !== null && (typeof query !== "string" || query.trim() !== "")) {
    throw new DomainError("VALIDATION_FAILED");
  }
  return "";
}

function parsePeopleRows(value: unknown): z.infer<typeof peopleHubRowSchema>[] {
  try {
    return z.array(peopleHubRowSchema).parse(value);
  } catch (cause) {
    throw new DomainError("INTERNAL_ERROR", { cause });
  }
}

function toPeopleHubPage(
  rows: readonly z.infer<typeof peopleHubRowSchema>[],
  page: number,
): PeopleHubPage {
  const totalCount = rows.at(0)?.total_count ?? 0;
  return {
    page,
    totalCount: collectionVisibleTotal(totalCount),
    pageCount: collectionPageCount(totalCount),
    hasMoreBeyondWindow: collectionHasOverflow(totalCount),
    items: rows.map((row) => ({
      id: row.profile_id,
      handle: row.handle,
      displayName: row.display_name,
      cityName: row.city_name,
      reason: row.reason,
      friendship:
        row.friendship_id === null ||
        row.friendship_status === null ||
        row.friendship_direction === null
          ? null
          : {
              id: row.friendship_id,
              status: row.friendship_status,
              direction:
                row.friendship_direction === "sent" ? "outgoing" : row.friendship_direction,
            },
    })),
  };
}

export async function listPeopleHub(
  bucket: PeopleBucket,
  query = "",
  page = 1,
): Promise<PeopleHubPage> {
  const bucketResult = z.enum(peopleBuckets).safeParse(bucket);
  if (!bucketResult.success) {
    throw new DomainError("VALIDATION_FAILED", { cause: bucketResult.error });
  }
  const normalizedQuery = normalizePeopleQuery(bucketResult.data, query);
  const requestedPage = boundedPage(page);
  const { supabase } = await requireActor("fan");
  const requestPage = async (targetPage: number) => {
    const { data, error } = await supabase.rpc("list_people_hub", {
      input_query: normalizedQuery,
      input_bucket: bucketResult.data,
      input_limit: PEOPLE_PAGE_SIZE,
      input_offset: collectionOffset(targetPage),
    });
    if (error !== null) throw domainErrorFromDatabase(error);
    return parsePeopleRows(data);
  };

  const initialRows = await requestPage(requestedPage);
  if (requestedPage === 1 || initialRows.length > 0) {
    return toPeopleHubPage(initialRows, requestedPage);
  }

  const firstRows = await requestPage(1);
  const finalPage = collectionPageCount(firstRows.at(0)?.total_count ?? 0);
  return toPeopleHubPage(finalPage === 1 ? firstRows : await requestPage(finalPage), finalPage);
}

export async function searchPeople(query: string, page: number): Promise<PeopleHubPage> {
  return listPeopleHub("search", query, page);
}
