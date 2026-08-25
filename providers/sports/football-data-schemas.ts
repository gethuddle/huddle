import { z } from "zod";

const positiveProviderId = z.number().int().positive();
const boundedName = z.string().trim().min(1).max(120);
const providerDate = z.iso.date();

const areaSchema = z.object({
  name: z.string().trim().min(1).max(100),
});

export const footballDataCompetitionSchema = z.object({
  id: positiveProviderId,
  area: areaSchema.nullish(),
  name: boundedName,
  code: z.string().trim().min(2).max(20).nullish(),
});

export const footballDataCompetitionsResponseSchema = z.object({
  competitions: z.array(footballDataCompetitionSchema),
});

const footballDataTeamSchema = z.object({
  id: positiveProviderId,
  name: boundedName,
  shortName: z.string().trim().min(1).max(80).nullish(),
  tla: z.string().trim().min(2).max(5).nullish(),
  area: areaSchema.nullish(),
});

const footballDataSeasonSchema = z.object({
  startDate: providerDate,
  endDate: providerDate.optional(),
});

export const footballDataMatchStatusSchema = z.enum([
  "SCHEDULED",
  "TIMED",
  "IN_PLAY",
  "PAUSED",
  "EXTRA_TIME",
  "PENALTY_SHOOTOUT",
  "FINISHED",
  "SUSPENDED",
  "POSTPONED",
  "CANCELLED",
  "AWARDED",
]);

export const footballDataMatchSchema = z.object({
  id: positiveProviderId,
  utcDate: z.iso.datetime({ offset: true }),
  status: footballDataMatchStatusSchema,
  matchday: z.number().int().positive().nullish(),
  stage: z.string().trim().min(1).max(80).nullish(),
  season: footballDataSeasonSchema.nullish(),
  homeTeam: footballDataTeamSchema,
  awayTeam: footballDataTeamSchema,
});

export const footballDataMatchesResponseSchema = z.object({
  competition: footballDataCompetitionSchema,
  matches: z.array(footballDataMatchSchema),
});

export type FootballDataCompetition = z.infer<typeof footballDataCompetitionSchema>;
export type FootballDataMatch = z.infer<typeof footballDataMatchSchema>;
export type FootballDataMatchesResponse = z.infer<typeof footballDataMatchesResponseSchema>;
