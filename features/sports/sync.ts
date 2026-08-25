import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { domainErrorFromDatabase, DomainError } from "@/lib/errors";
import { FootballDataProvider } from "@/providers/sports/football-data";
import { ProviderAdapterError } from "@/providers/sports/errors";
import type {
  NormalizedCompetition,
  NormalizedFixture,
  NormalizedTeam,
  ProviderRequestMetadata,
  SportsProvider,
} from "@/providers/sports/types";
import type { Database, Json } from "@/types/database.generated";

import { SPORTS_COMPETITION_ALLOWLIST } from "./config";
import type { SportsSyncReason } from "./schemas";

export type SportsSyncDatabaseClient = Pick<SupabaseClient<Database>, "rpc">;

export interface InstrumentedSportsProvider extends SportsProvider {
  getRequestMetadata(): ProviderRequestMetadata;
}

export function createFootballDataSyncProvider(token: string): InstrumentedSportsProvider {
  return new FootballDataProvider(token);
}

type SportsSyncLogger = Readonly<{
  error: (event: string, details: Readonly<Record<string, unknown>>) => void;
  info: (event: string, details: Readonly<Record<string, unknown>>) => void;
}>;

const defaultLogger: SportsSyncLogger = {
  error(event, details) {
    console.error(event, details);
  },
  info(event, details) {
    console.info(event, details);
  },
};

export type SportsSyncWindow = Readonly<{ from: string; to: string }>;

export type SportsSyncSummary = Readonly<{
  competitionsChanged: number;
  durationMs: number;
  matchesChanged: number;
  requestCount: number;
  retryCount: number;
  teamsChanged: number;
}>;

export type SportsSyncResult = Readonly<{
  runId: string;
  summary: SportsSyncSummary;
}>;

function shiftUtcDate(date: Date, days: number): string {
  const shifted = new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() + days),
  );
  return shifted.toISOString().slice(0, 10);
}

export function getSportsSyncWindow(now: Date = new Date()): SportsSyncWindow {
  return { from: shiftUtcDate(now, -1), to: shiftUtcDate(now, 45) };
}

function selectAllowedCompetitions(
  competitions: NormalizedCompetition[],
  providerName: string,
): NormalizedCompetition[] {
  const allowlist = new Set<string>(SPORTS_COMPETITION_ALLOWLIST);
  const selected = competitions.filter(
    (competition) => competition.code !== null && allowlist.has(competition.code),
  );
  const identities = new Set<string>();

  for (const competition of selected) {
    if (competition.provider !== providerName || identities.has(competition.providerExternalId)) {
      throw new ProviderAdapterError("INVALID_RESPONSE");
    }
    identities.add(competition.providerExternalId);
  }

  return selected;
}

function setUnique<T>(map: Map<string, T>, identity: string, value: T): void {
  const existing = map.get(identity);
  if (existing !== undefined && JSON.stringify(existing) !== JSON.stringify(value)) {
    throw new ProviderAdapterError("INVALID_RESPONSE");
  }
  map.set(identity, value);
}

function setUniqueTeam(map: Map<string, NormalizedTeam>, team: NormalizedTeam): void {
  const existing = map.get(team.providerExternalId);
  if (existing === undefined) {
    map.set(team.providerExternalId, team);
    return;
  }

  if (
    existing.provider !== team.provider ||
    existing.name !== team.name ||
    (existing.shortName !== null &&
      team.shortName !== null &&
      existing.shortName !== team.shortName) ||
    (existing.tla !== null && team.tla !== null && existing.tla !== team.tla) ||
    (existing.countryName !== null &&
      team.countryName !== null &&
      existing.countryName !== team.countryName)
  ) {
    throw new ProviderAdapterError("INVALID_RESPONSE");
  }

  map.set(team.providerExternalId, {
    ...existing,
    shortName: existing.shortName ?? team.shortName,
    tla: existing.tla ?? team.tla,
    countryName: existing.countryName ?? team.countryName,
  });
}

function catalogPayload(competitions: NormalizedCompetition[], fixtures: NormalizedFixture[]) {
  const competitionIdentities = new Set(
    competitions.map((competition) => competition.providerExternalId),
  );
  const teams = new Map<string, NormalizedTeam>();
  const matches = new Map<string, NormalizedFixture>();
  const memberships = new Map<
    string,
    Readonly<{
      competition_external_id: string;
      season_label: string;
      team_external_id: string;
    }>
  >();

  for (const fixture of fixtures) {
    if (
      !competitionIdentities.has(fixture.competition.providerExternalId) ||
      fixture.homeTeam.providerExternalId === fixture.awayTeam.providerExternalId ||
      fixture.provider !== fixture.competition.provider ||
      fixture.provider !== fixture.homeTeam.provider ||
      fixture.provider !== fixture.awayTeam.provider
    ) {
      throw new ProviderAdapterError("INVALID_RESPONSE");
    }

    setUniqueTeam(teams, fixture.homeTeam);
    setUniqueTeam(teams, fixture.awayTeam);
    setUnique(matches, fixture.providerExternalId, fixture);

    if (fixture.seasonLabel !== null) {
      for (const team of [fixture.homeTeam, fixture.awayTeam]) {
        const membership = {
          competition_external_id: fixture.competition.providerExternalId,
          team_external_id: team.providerExternalId,
          season_label: fixture.seasonLabel,
        };
        memberships.set(
          `${membership.competition_external_id}:${membership.team_external_id}:${membership.season_label}`,
          membership,
        );
      }
    }
  }

  return {
    competitions: competitions.map((competition) => ({
      provider_external_id: competition.providerExternalId,
      code: competition.code,
      name: competition.name,
      country_name: competition.countryName,
    })) as Json,
    teams: [...teams.values()].map((team) => ({
      provider_external_id: team.providerExternalId,
      name: team.name,
      short_name: team.shortName,
      tla: team.tla,
      country_name: team.countryName,
    })) as Json,
    competitionTeams: [...memberships.values()] as Json,
    matches: [...matches.values()].map((fixture) => ({
      provider_external_id: fixture.providerExternalId,
      competition_external_id: fixture.competition.providerExternalId,
      home_team_external_id: fixture.homeTeam.providerExternalId,
      away_team_external_id: fixture.awayTeam.providerExternalId,
      starts_at: fixture.startsAt,
      status: fixture.status,
      matchday: fixture.matchday,
      stage: fixture.stage,
      season_label: fixture.seasonLabel,
    })) as Json,
  };
}

async function markRunFailed(
  database: SportsSyncDatabaseClient,
  runId: string,
  metadata: ProviderRequestMetadata,
  category: string,
  summary: string,
  logger: SportsSyncLogger,
): Promise<void> {
  try {
    const { error } = await database.rpc("fail_sports_sync", {
      input_run_id: runId,
      input_request_count: metadata.requestCount,
      input_retry_count: metadata.retryCount,
      input_error_code: category,
      input_error_summary: summary,
    });

    if (error !== null) {
      logger.error("sports_sync_failure_evidence_error", { runId });
    }
  } catch {
    logger.error("sports_sync_failure_evidence_error", { runId });
  }
}

export async function runSportsSync(
  options: Readonly<{
    database: SportsSyncDatabaseClient;
    logger?: SportsSyncLogger;
    now?: Date;
    provider: InstrumentedSportsProvider;
    reason: SportsSyncReason;
  }>,
): Promise<SportsSyncResult> {
  const { database, provider, reason } = options;
  const logger = options.logger ?? defaultLogger;
  const window = getSportsSyncWindow(options.now);
  const beginResult = await database.rpc("begin_sports_sync", {
    input_provider: provider.name,
    input_window_start: window.from,
    input_window_end: window.to,
    input_trigger_source: reason,
  });

  if (beginResult.error !== null) {
    throw domainErrorFromDatabase(beginResult.error);
  }

  const runId = beginResult.data;
  if (typeof runId !== "string") {
    throw new DomainError("INTERNAL_ERROR");
  }

  try {
    const accessibleCompetitions = await provider.listCompetitions();
    const competitions = selectAllowedCompetitions(accessibleCompetitions, provider.name);
    const fixtures = await provider.listFixtures(
      window,
      competitions.map((competition) => competition.providerExternalId),
    );
    const payload = catalogPayload(competitions, fixtures);
    const requestMetadata = provider.getRequestMetadata();
    const completeResult = await database.rpc("complete_sports_sync", {
      input_run_id: runId,
      input_sport_slug: "football",
      input_competitions: payload.competitions,
      input_teams: payload.teams,
      input_competition_teams: payload.competitionTeams,
      input_matches: payload.matches,
      input_request_count: requestMetadata.requestCount,
      input_retry_count: requestMetadata.retryCount,
    });

    if (completeResult.error !== null) {
      throw domainErrorFromDatabase(completeResult.error);
    }

    const completed = completeResult.data?.[0];
    if (completed === undefined) {
      throw new DomainError("INTERNAL_ERROR");
    }

    const summary: SportsSyncSummary = {
      competitionsChanged: completed.competitions_changed,
      teamsChanged: completed.teams_changed,
      matchesChanged: completed.matches_changed,
      durationMs: completed.duration_ms,
      requestCount: requestMetadata.requestCount,
      retryCount: requestMetadata.retryCount,
    };

    logger.info("sports_sync_completed", { runId, ...summary });
    return { runId, summary };
  } catch (error) {
    const metadata = provider.getRequestMetadata();
    const providerError = error instanceof ProviderAdapterError ? error : null;
    await markRunFailed(
      database,
      runId,
      metadata,
      providerError?.category ?? "UNKNOWN",
      providerError?.message ?? "Synchronization transaction failed safely.",
      logger,
    );
    logger.error("sports_sync_failed", {
      runId,
      category: providerError?.category ?? "UNKNOWN",
      requestCount: metadata.requestCount,
      retryCount: metadata.retryCount,
    });

    if (providerError !== null) {
      throw new DomainError("UPSTREAM_UNAVAILABLE", { cause: providerError });
    }
    throw error;
  }
}
