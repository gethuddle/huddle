import { z } from "zod";

import { formatIsraelDateValue, israelDayUtcBounds } from "@/features/sports/time";

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

export type DiscoveryFilterFieldErrors = Readonly<Record<string, string>>;

export type DiscoveryFiltersResult =
  | Readonly<{ ok: true; filters: DiscoveryFilters }>
  | Readonly<{
      ok: false;
      values: DiscoveryFilters;
      fieldErrors: DiscoveryFilterFieldErrors;
      error: z.ZodError;
    }>;

function parsedDiscoveryFilters(
  raw: z.infer<typeof rawDiscoveryFiltersSchema>,
  now: Date,
): DiscoveryFilters {
  const today = formatIsraelDateValue(now);
  const from = raw.from === undefined || raw.from === "" ? today : raw.from;
  const to = raw.to === undefined || raw.to === "" ? addUtcDays(from, 14) : raw.to;

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

function discoveryDateIssues(filters: DiscoveryFilters, now: Date) {
  const today = formatIsraelDateValue(now);
  const maximumFutureDate = addUtcDays(today, 45);
  const maximumWindowDate = addUtcDays(filters.from, 44);
  const maximumTo = maximumFutureDate < maximumWindowDate ? maximumFutureDate : maximumWindowDate;

  if (filters.from < today) {
    return [
      {
        code: "custom" as const,
        path: ["from"],
        message: "Choose today or a future date.",
      },
    ];
  }
  if (filters.from > maximumFutureDate) {
    return [
      {
        code: "custom" as const,
        path: ["from"],
        message: "Choose a date within the next 45 days.",
      },
    ];
  }
  if (filters.to < filters.from) {
    return [
      {
        code: "custom" as const,
        path: ["to"],
        message: "Choose an end date on or after the start date.",
      },
    ];
  }
  if (filters.to > maximumTo) {
    return [
      {
        code: "custom" as const,
        path: ["to"],
        message: "Choose a future date range of no more than 45 days.",
      },
    ];
  }
  return [];
}

function firstFieldErrors(error: z.ZodError): DiscoveryFilterFieldErrors {
  return Object.fromEntries(
    Object.entries(error.flatten().fieldErrors).flatMap(([field, messages]) => {
      const message = Array.isArray(messages) ? messages.at(0) : undefined;
      return message === undefined ? [] : [[field, message]];
    }),
  );
}

function recoveryValues(input: unknown, now: Date): DiscoveryFilters {
  const record =
    typeof input === "object" && input !== null ? (input as Record<string, unknown>) : {};
  const value = (key: string) => {
    const candidate = firstSearchParam(record[key]);
    return typeof candidate === "string" ? candidate : "";
  };
  const today = formatIsraelDateValue(now);
  const from = /^\d{4}-\d{2}-\d{2}$/.test(value("from")) ? value("from") : today;
  const radius = Number(value("radiusKm"));
  const radiusKm = DISCOVERY_RADIUS_OPTIONS.includes(
    radius as (typeof DISCOVERY_RADIUS_OPTIONS)[number],
  )
    ? (radius as (typeof DISCOVERY_RADIUS_OPTIONS)[number])
    : 15;

  return {
    citySlug: value("city").trim().toLowerCase(),
    lat: null,
    lng: null,
    radiusKm,
    from,
    to: /^\d{4}-\d{2}-\d{2}$/.test(value("to")) ? value("to") : addUtcDays(from, 14),
    teamId: null,
    competitionId: null,
    matchId: null,
    cursor: null,
    limit: DISCOVERY_PAGE_SIZE,
  };
}

export function parseDiscoveryFiltersResult(
  input: unknown,
  now = new Date(),
): DiscoveryFiltersResult {
  const rawResult = rawDiscoveryFiltersSchema.safeParse(input);
  if (!rawResult.success) {
    return {
      ok: false,
      values: recoveryValues(input, now),
      fieldErrors: firstFieldErrors(rawResult.error),
      error: rawResult.error,
    };
  }

  const filters = parsedDiscoveryFilters(rawResult.data, now);
  const dateIssues = discoveryDateIssues(filters, now);
  if (dateIssues.length > 0) {
    const error = new z.ZodError(dateIssues);
    return { ok: false, values: filters, fieldErrors: firstFieldErrors(error), error };
  }

  return { ok: true, filters };
}

export function parseDiscoveryFilters(input: unknown, now = new Date()): DiscoveryFilters {
  const result = parseDiscoveryFiltersResult(input, now);
  if (!result.ok) throw result.error;
  return result.filters;
}

export function discoveryUtcRange(filters: DiscoveryFilters): Readonly<{
  from: string;
  to: string;
}> {
  return {
    from: israelDayUtcBounds(filters.from).start,
    to: israelDayUtcBounds(filters.to).end,
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
