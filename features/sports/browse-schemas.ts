import { z } from "zod";

function firstSearchParam(value: unknown): unknown {
  return Array.isArray(value) ? value.at(0) : value;
}

const optionalDate = z.preprocess(
  firstSearchParam,
  z
    .union([z.literal(""), z.iso.date()])
    .optional()
    .catch(undefined),
);
const optionalUuid = z.preprocess(
  firstSearchParam,
  z
    .union([z.literal(""), z.uuid()])
    .optional()
    .catch(undefined),
);
const pageNumber = z.preprocess(
  firstSearchParam,
  z.coerce.number().int().min(1).max(10_000).catch(1),
);

export const fixtureFiltersSchema = z
  .object({
    date: optionalDate,
    competition: optionalUuid,
    team: optionalUuid,
    page: pageNumber.default(1),
  })
  .transform((value) => ({
    date: value.date === "" ? undefined : value.date,
    competitionId: value.competition === "" ? undefined : value.competition,
    teamId: value.team === "" ? undefined : value.team,
    page: value.page,
  }));

export const matchIdSchema = z.uuid();

export type FixtureFilters = z.infer<typeof fixtureFiltersSchema>;

export function parseFixtureFilters(input: unknown): FixtureFilters {
  return fixtureFiltersSchema.parse(input);
}
