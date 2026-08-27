import { z } from "zod";

import { formatJerusalemDateValue, jerusalemDayUtcBounds } from "@/features/sports/time";

export const DISCOVERY_RADIUS_OPTIONS = [5, 15, 30, 50] as const;
export const DISCOVERY_PAGE_SIZE = 20;

function firstSearchParam(value: unknown): unknown {
  return Array.isArray(value) ? value.at(0) : value;
}

function addUtcDays(dateValue: string, days: number): string {
  const [year, month, day] = dateValue.split("-").map(Number);
  const next = new Date(Date.UTC(year, month - 1, day + days));
  return [
    next.getUTCFullYear(),
    String(next.getUTCMonth() + 1).padStart(2, "0"),
    String(next.getUTCDate()).padStart(2, "0"),
  ].join("-");
}

const optionalCoordinate = z.preprocess(
  firstSearchParam,
  z.union([z.literal(""), z.coerce.number().finite()]).optional(),
);
const optionalUuid = z.preprocess(firstSearchParam, z.union([z.literal(""), z.uuid()]).optional());
const optionalDate = z.preprocess(
  firstSearchParam,
  z.union([z.literal(""), z.iso.date()]).optional(),
);

const rawDiscoveryFiltersSchema = z
  .object({
    city: z.preprocess(
      firstSearchParam,
      z
        .string()
        .trim()
        .toLowerCase()
        .min(2)
        .max(60)
        .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
    ),
    lat: optionalCoordinate,
    lng: optionalCoordinate,
    radiusKm: z.preprocess(
      firstSearchParam,
      z.coerce
        .number()
        .int()
        .refine((value): value is (typeof DISCOVERY_RADIUS_OPTIONS)[number] =>
          DISCOVERY_RADIUS_OPTIONS.includes(value as (typeof DISCOVERY_RADIUS_OPTIONS)[number]),
        )
        .default(15),
    ),
    from: optionalDate,
    to: optionalDate,
    team: optionalUuid,
    competition: optionalUuid,
    match: optionalUuid,
    cursor: z.preprocess(firstSearchParam, z.string().trim().min(1).max(1024).optional()),
    limit: z.preprocess(
      firstSearchParam,
      z.coerce.number().int().min(1).max(50).default(DISCOVERY_PAGE_SIZE),
    ),
  })
  .strict()
  .superRefine((value, context) => {
    if ((value.lat === undefined) !== (value.lng === undefined)) {
      context.addIssue({
        code: "custom",
        path: [value.lat === undefined ? "lat" : "lng"],
        message: "Latitude and longitude must be supplied together.",
      });
    }
    if (typeof value.lat === "number" && (value.lat < -90 || value.lat > 90)) {
      context.addIssue({ code: "custom", path: ["lat"], message: "Invalid latitude." });
    }
    if (typeof value.lng === "number" && (value.lng < -180 || value.lng > 180)) {
      context.addIssue({ code: "custom", path: ["lng"], message: "Invalid longitude." });
    }
  });

export type DiscoveryFilters = Readonly<{
  citySlug: string;
  lat: number | null;
  lng: number | null;
  radiusKm: (typeof DISCOVERY_RADIUS_OPTIONS)[number];
  from: string;
  to: string;
  teamId: string | null;
  competitionId: string | null;
  matchId: string | null;
  cursor: string | null;
  limit: number;
}>;

export function parseDiscoveryFilters(input: unknown, now = new Date()): DiscoveryFilters {
  const raw = rawDiscoveryFiltersSchema.parse(input);
  const today = formatJerusalemDateValue(now);
  const from = raw.from === undefined || raw.from === "" ? today : raw.from;
  const to = raw.to === undefined || raw.to === "" ? addUtcDays(from, 14) : raw.to;
  const maximumFutureDate = addUtcDays(today, 45);
  const maximumWindowDate = addUtcDays(from, 44);
  const maximumTo = maximumFutureDate < maximumWindowDate ? maximumFutureDate : maximumWindowDate;

  if (from < today || from > maximumTo || to < from || to > maximumTo) {
    throw new z.ZodError([
      {
        code: "custom",
        path: ["to"],
        message: "Choose a future date range of no more than 45 days.",
      },
    ]);
  }

  return {
    citySlug: raw.city,
    lat: raw.lat === undefined || raw.lat === "" ? null : raw.lat,
    lng: raw.lng === undefined || raw.lng === "" ? null : raw.lng,
    radiusKm: raw.radiusKm,
    from,
    to,
    teamId: raw.team === undefined || raw.team === "" ? null : raw.team,
    competitionId: raw.competition === undefined || raw.competition === "" ? null : raw.competition,
    matchId: raw.match === undefined || raw.match === "" ? null : raw.match,
    cursor: raw.cursor ?? null,
    limit: raw.limit,
  };
}

export function discoveryUtcRange(filters: DiscoveryFilters): Readonly<{
  from: string;
  to: string;
}> {
  return {
    from: jerusalemDayUtcBounds(filters.from).start,
    to: jerusalemDayUtcBounds(filters.to).end,
  };
}

export function discoveryFilterIdentity(filters: DiscoveryFilters) {
  return {
    city: filters.citySlug,
    lat: filters.lat,
    lng: filters.lng,
    radiusKm: filters.radiusKm,
    from: filters.from,
    to: filters.to,
    team: filters.teamId,
    competition: filters.competitionId,
    match: filters.matchId,
  };
}

export function discoverySearchParams(
  filters: DiscoveryFilters,
  cursor: string | null = filters.cursor,
): URLSearchParams {
  const search = new URLSearchParams({
    city: filters.citySlug,
    radiusKm: String(filters.radiusKm),
    from: filters.from,
    to: filters.to,
    limit: String(filters.limit),
  });
  if (filters.lat !== null && filters.lng !== null) {
    search.set("lat", String(filters.lat));
    search.set("lng", String(filters.lng));
  }
  if (filters.teamId !== null) search.set("team", filters.teamId);
  if (filters.competitionId !== null) search.set("competition", filters.competitionId);
  if (filters.matchId !== null) search.set("match", filters.matchId);
  if (cursor !== null) search.set("cursor", cursor);
  return search;
}
