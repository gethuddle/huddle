import { z } from "zod";

const publicMatchRowSchema = z
  .object({
    id: z.uuid(),
    sport_id: z.uuid(),
    sport_slug: z.string().min(1),
    competition_id: z.uuid(),
    competition_code: z.string().nullable(),
    competition_name: z.string().min(1),
    home_team_id: z.uuid(),
    home_team_name: z.string().min(1),
    home_team_short_name: z.string().nullable(),
    home_team_tla: z.string().nullable(),
    away_team_id: z.uuid(),
    away_team_name: z.string().min(1),
    away_team_short_name: z.string().nullable(),
    away_team_tla: z.string().nullable(),
    starts_at: z.iso.datetime({ offset: true }),
    status: z.enum(["scheduled", "timed", "postponed"]),
    matchday: z.number().int().positive().nullable(),
    stage: z.string().nullable(),
    season_label: z.string().nullable(),
    last_synced_at: z.iso.datetime({ offset: true }),
  })
  .strict();

export type TeamSummary = Readonly<{
  id: string;
  name: string;
  shortName: string | null;
  tla: string | null;
}>;

export type PublicMatchDto = Readonly<{
  id: string;
  sport: Readonly<{ id: string; slug: string }>;
  competition: Readonly<{ id: string; code: string | null; name: string }>;
  homeTeam: TeamSummary;
  awayTeam: TeamSummary;
  startsAt: string;
  status: "scheduled" | "timed" | "postponed";
  matchday: number | null;
  stage: string | null;
  seasonLabel: string | null;
  lastSyncedAt: string;
}>;

export function toPublicMatchDto(input: unknown): PublicMatchDto {
  const row = publicMatchRowSchema.parse(input);

  return {
    id: row.id,
    sport: { id: row.sport_id, slug: row.sport_slug },
    competition: {
      id: row.competition_id,
      code: row.competition_code,
      name: row.competition_name,
    },
    homeTeam: {
      id: row.home_team_id,
      name: row.home_team_name,
      shortName: row.home_team_short_name,
      tla: row.home_team_tla,
    },
    awayTeam: {
      id: row.away_team_id,
      name: row.away_team_name,
      shortName: row.away_team_short_name,
      tla: row.away_team_tla,
    },
    startsAt: row.starts_at,
    status: row.status,
    matchday: row.matchday,
    stage: row.stage,
    seasonLabel: row.season_label,
    lastSyncedAt: row.last_synced_at,
  };
}
