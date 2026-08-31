import type { FootballDataCompetition, FootballDataMatch } from "./football-data-schemas";
import type {
  NormalizedCompetition,
  NormalizedFixture,
  NormalizedMatchStatus,
  NormalizedTeam,
} from "./types";

export const FOOTBALL_DATA_PROVIDER = "football-data";

export function normalizeFootballDataStatus(
  status: FootballDataMatch["status"],
): NormalizedMatchStatus {
  switch (status) {
    case "SCHEDULED":
      return "scheduled";
    case "TIMED":
    case "IN_PLAY":
    case "PAUSED":
    case "EXTRA_TIME":
    case "PENALTY_SHOOTOUT":
      return "timed";
    case "SUSPENDED":
    case "POSTPONED":
      return "postponed";
    case "CANCELLED":
      return "cancelled";
    case "FINISHED":
    case "AWARDED":
      return "finished";
  }
}

export function normalizeFootballDataCompetition(
  competition: FootballDataCompetition,
): NormalizedCompetition {
  return {
    provider: FOOTBALL_DATA_PROVIDER,
    providerExternalId: String(competition.id),
    code: competition.code?.toUpperCase() ?? null,
    name: competition.name,
    countryName: competition.area?.name ?? null,
  };
}

function normalizeFootballDataTeam(team: FootballDataMatch["homeTeam"]): NormalizedTeam {
  return {
    provider: FOOTBALL_DATA_PROVIDER,
    providerExternalId: String(team.id),
    name: team.name,
    shortName: team.shortName ?? null,
    tla: team.tla?.toUpperCase() ?? null,
    countryName: team.area?.name ?? null,
    crestUrl: team.crest ?? null,
  };
}

export function normalizeFootballDataFixture(
  competition: FootballDataCompetition,
  match: FootballDataMatch,
): NormalizedFixture {
  return {
    provider: FOOTBALL_DATA_PROVIDER,
    providerExternalId: String(match.id),
    competition: normalizeFootballDataCompetition(competition),
    homeTeam: normalizeFootballDataTeam(match.homeTeam),
    awayTeam: normalizeFootballDataTeam(match.awayTeam),
    startsAt: new Date(match.utcDate).toISOString(),
    status: normalizeFootballDataStatus(match.status),
    matchday: match.matchday ?? null,
    stage: match.stage ?? null,
    seasonLabel: match.season?.startDate.slice(0, 4) ?? null,
  };
}
