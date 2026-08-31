import { describe, expect, it, vi } from "vitest";

import { ProviderAdapterError } from "@/providers/sports/errors";
import type {
  NormalizedCompetition,
  NormalizedFixture,
  NormalizedTeam,
} from "@/providers/sports/types";

import {
  getSportsSyncWindow,
  runSportsSync,
  type InstrumentedSportsProvider,
  type SportsSyncDatabaseClient,
} from "./sync";

const pl: NormalizedCompetition = {
  provider: "football-data",
  providerExternalId: "2021",
  code: "PL",
  name: "Premier League",
  countryName: "England",
};

const cl: NormalizedCompetition = {
  provider: "football-data",
  providerExternalId: "2001",
  code: "CL",
  name: "UEFA Champions League",
  countryName: "Europe",
};

const ignoredCompetition: NormalizedCompetition = {
  provider: "football-data",
  providerExternalId: "2002",
  code: "BL1",
  name: "Bundesliga",
  countryName: "Germany",
};

const arsenal: NormalizedTeam = {
  provider: "football-data",
  providerExternalId: "57",
  name: "Arsenal FC",
  shortName: "Arsenal",
  tla: "ARS",
  countryName: "England",
  crestUrl: "https://crests.football-data.org/57.png",
};

const chelsea: NormalizedTeam = {
  provider: "football-data",
  providerExternalId: "61",
  name: "Chelsea FC",
  shortName: "Chelsea",
  tla: "CHE",
  countryName: "England",
  crestUrl: "https://crests.football-data.org/61.png",
};

const fixture: NormalizedFixture = {
  provider: "football-data",
  providerExternalId: "5001",
  competition: pl,
  homeTeam: arsenal,
  awayTeam: chelsea,
  startsAt: "2026-08-29T16:30:00.000Z",
  status: "timed",
  matchday: 2,
  stage: "REGULAR_SEASON",
  seasonLabel: "2026",
};

const octoberFixture: NormalizedFixture = {
  ...fixture,
  providerExternalId: "5003",
  startsAt: "2026-10-12T18:00:00.000Z",
  matchday: 8,
};

const mayFixture: NormalizedFixture = {
  ...fixture,
  providerExternalId: "5004",
  startsAt: "2027-05-24T18:00:00.000Z",
  matchday: 38,
};

function databaseFromRpc(rpc: ReturnType<typeof vi.fn>): SportsSyncDatabaseClient {
  return { rpc: rpc as unknown as SportsSyncDatabaseClient["rpc"] };
}

function providerFixture(overrides: Partial<InstrumentedSportsProvider> = {}) {
  return {
    name: "football-data",
    listCompetitions: vi.fn(async () => [pl, cl, ignoredCompetition]),
    listFixtures: vi.fn(async () => [fixture, octoberFixture, mayFixture]),
    getRequestMetadata: vi.fn(() => ({ quotaRemaining: 6, requestCount: 3, retryCount: 1 })),
    ...overrides,
  } satisfies InstrumentedSportsProvider;
}

function quietLogger() {
  return { error: vi.fn(), info: vi.fn() };
}

describe("sports synchronization orchestration", () => {
  it("builds a yesterday-through-season-end UTC window", () => {
    expect(getSportsSyncWindow(new Date("2026-08-25T23:58:00-07:00"))).toEqual({
      from: "2026-08-25",
      to: "2027-05-31",
    });
  });

  it("keeps the current May as season end before June and rolls over after it", () => {
    expect(getSportsSyncWindow(new Date("2027-01-10T12:00:00Z"))).toEqual({
      from: "2027-01-09",
      to: "2027-05-31",
    });
    expect(getSportsSyncWindow(new Date("2027-06-01T12:00:00Z"))).toEqual({
      from: "2027-05-31",
      to: "2028-05-31",
    });
  });

  it("intersects accessible competitions, deduplicates catalog rows, and completes one batch", async () => {
    const rpc = vi.fn(async (name: string) => {
      if (name === "begin_sports_sync") {
        return { data: "40000000-0000-4000-8000-000000000001", error: null };
      }
      if (name === "complete_sports_sync") {
        return {
          data: [
            {
              competitions_changed: 2,
              teams_changed: 2,
              matches_changed: 3,
              duration_ms: 27,
            },
          ],
          error: null,
        };
      }
      return { data: undefined, error: null };
    });
    const provider = providerFixture();
    const logger = quietLogger();

    await expect(
      runSportsSync({
        database: databaseFromRpc(rpc),
        provider,
        reason: "manual",
        now: new Date("2026-08-25T12:00:00Z"),
        logger,
      }),
    ).resolves.toEqual({
      runId: "40000000-0000-4000-8000-000000000001",
      summary: {
        competitionsChanged: 2,
        teamsChanged: 2,
        matchesChanged: 3,
        quotaRemaining: 6,
        durationMs: 27,
        requestCount: 3,
        retryCount: 1,
      },
    });

    expect(provider.listFixtures).toHaveBeenCalledWith({ from: "2026-08-24", to: "2027-05-31" }, [
      "2021",
      "2001",
    ]);
    expect(rpc).toHaveBeenNthCalledWith(1, "begin_sports_sync", {
      input_provider: "football-data",
      input_window_start: "2026-08-24",
      input_window_end: "2027-05-31",
      input_trigger_source: "manual",
    });
    expect(rpc).toHaveBeenNthCalledWith(
      2,
      "complete_sports_sync",
      expect.objectContaining({
        input_competitions: [
          {
            provider_external_id: "2021",
            code: "PL",
            name: "Premier League",
            country_name: "England",
          },
          {
            provider_external_id: "2001",
            code: "CL",
            name: "UEFA Champions League",
            country_name: "Europe",
          },
        ],
        input_teams: [
          {
            provider_external_id: "57",
            name: "Arsenal FC",
            short_name: "Arsenal",
            tla: "ARS",
            country_name: "England",
            crest_url: "https://crests.football-data.org/57.png",
          },
          {
            provider_external_id: "61",
            name: "Chelsea FC",
            short_name: "Chelsea",
            tla: "CHE",
            country_name: "England",
            crest_url: "https://crests.football-data.org/61.png",
          },
        ],
        input_matches: [
          expect.objectContaining({
            provider_external_id: "5001",
            home_team_external_id: "57",
            away_team_external_id: "61",
          }),
          expect.objectContaining({
            provider_external_id: "5003",
            starts_at: "2026-10-12T18:00:00.000Z",
          }),
          expect.objectContaining({
            provider_external_id: "5004",
            starts_at: "2027-05-24T18:00:00.000Z",
          }),
        ],
      }),
    );
    expect(logger.info).toHaveBeenCalledWith(
      "sports_sync_completed",
      expect.objectContaining({ runId: "40000000-0000-4000-8000-000000000001" }),
    );
  });

  it("stops before provider work when the database reports an overlapping run", async () => {
    const rpc = vi.fn(async () => ({
      data: null,
      error: { message: "SYNC_ALREADY_RUNNING" },
    }));
    const provider = providerFixture();

    await expect(
      runSportsSync({
        database: databaseFromRpc(rpc),
        provider,
        reason: "scheduled",
        logger: quietLogger(),
      }),
    ).rejects.toMatchObject({ code: "SYNC_ALREADY_RUNNING" });
    expect(provider.listCompetitions).not.toHaveBeenCalled();
    expect(rpc).toHaveBeenCalledTimes(1);
  });

  it("records a safe provider failure after preserving the running-row evidence", async () => {
    const rpc = vi.fn(async (name: string) => {
      if (name === "begin_sports_sync") {
        return { data: "40000000-0000-4000-8000-000000000002", error: null };
      }
      return { data: undefined, error: null };
    });
    const provider = providerFixture({
      listCompetitions: vi.fn(async () => {
        throw new ProviderAdapterError("RATE_LIMIT");
      }),
      getRequestMetadata: vi.fn(() => ({ quotaRemaining: 0, requestCount: 1, retryCount: 0 })),
    });
    const logger = quietLogger();

    await expect(
      runSportsSync({
        database: databaseFromRpc(rpc),
        provider,
        reason: "retry",
        logger,
      }),
    ).rejects.toMatchObject({ code: "UPSTREAM_UNAVAILABLE" });
    expect(rpc).toHaveBeenNthCalledWith(2, "fail_sports_sync", {
      input_run_id: "40000000-0000-4000-8000-000000000002",
      input_request_count: 1,
      input_retry_count: 0,
      input_error_code: "RATE_LIMIT",
      input_error_summary: "Provider rate limit was reached.",
    });
    expect(JSON.stringify(rpc.mock.calls)).not.toContain("token");
    expect(logger.error).toHaveBeenCalledWith(
      "sports_sync_failed",
      expect.objectContaining({ category: "RATE_LIMIT" }),
    );
  });

  it("marks a transactional completion error failed without relabeling it as provider data", async () => {
    const rpc = vi.fn(async (name: string) => {
      if (name === "begin_sports_sync") {
        return { data: "40000000-0000-4000-8000-000000000003", error: null };
      }
      if (name === "complete_sports_sync") {
        return { data: null, error: { message: "database detail that stays private" } };
      }
      return { data: undefined, error: null };
    });

    await expect(
      runSportsSync({
        database: databaseFromRpc(rpc),
        provider: providerFixture(),
        reason: "scheduled",
        logger: quietLogger(),
      }),
    ).rejects.toMatchObject({ code: "INTERNAL_ERROR" });
    expect(rpc).toHaveBeenNthCalledWith(
      3,
      "fail_sports_sync",
      expect.objectContaining({
        input_error_code: "UNKNOWN",
        input_error_summary: "Synchronization transaction failed safely.",
      }),
    );
  });

  it("rejects a fixture outside the selected competition before database mutation", async () => {
    const rpc = vi.fn(async (name: string) =>
      name === "begin_sports_sync"
        ? { data: "40000000-0000-4000-8000-000000000004", error: null }
        : { data: undefined, error: null },
    );
    const provider = providerFixture({
      listFixtures: vi.fn(async () => [
        { ...fixture, competition: { ...ignoredCompetition, code: "OUT" } },
      ]),
    });

    await expect(
      runSportsSync({
        database: databaseFromRpc(rpc),
        provider,
        reason: "scheduled",
        logger: quietLogger(),
      }),
    ).rejects.toMatchObject({ code: "UPSTREAM_UNAVAILABLE" });
    expect(rpc).not.toHaveBeenCalledWith("complete_sports_sync", expect.anything());
    expect(rpc).toHaveBeenCalledWith(
      "fail_sports_sync",
      expect.objectContaining({ input_error_code: "INVALID_RESPONSE" }),
    );
  });
});
