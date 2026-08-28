import { describe, expect, it, vi } from "vitest";

import competitionsSuccess from "@/tests/fixtures/football-data/competitions-success.json";
import matchesChanged from "@/tests/fixtures/football-data/matches-changed.json";
import matchesEmpty from "@/tests/fixtures/football-data/matches-empty.json";
import matchesInvalid from "@/tests/fixtures/football-data/matches-invalid.json";
import matchesSuccess from "@/tests/fixtures/football-data/matches-success.json";
import rateLimit from "@/tests/fixtures/football-data/rate-limit.json";

import { ProviderAdapterError } from "./errors";
import { FootballDataProvider } from "./football-data";
import { normalizeFootballDataStatus } from "./normalizers";

function jsonResponse(
  payload: unknown,
  options: Readonly<{ headers?: HeadersInit; status?: number }> = {},
) {
  return new Response(JSON.stringify(payload), {
    headers: { "content-type": "application/json", ...options.headers },
    status: options.status ?? 200,
  });
}

function expectProviderError(category: ProviderAdapterError["category"]) {
  return (error: unknown) => {
    expect(error).toBeInstanceOf(ProviderAdapterError);
    expect(error).toMatchObject({ category });
    expect(String(error)).not.toContain("test-provider-token");
    return true;
  };
}

describe("FootballDataProvider", () => {
  it("normalizes accessible competitions and ignores provider-only presentation fields", async () => {
    const fetchImplementation = vi.fn(async () => jsonResponse(competitionsSuccess));
    const provider = new FootballDataProvider("test-provider-token", {
      fetch: fetchImplementation,
    });

    await expect(provider.listCompetitions()).resolves.toEqual([
      {
        provider: "football-data",
        providerExternalId: "2021",
        code: "PL",
        name: "Premier League",
        countryName: "England",
      },
      {
        provider: "football-data",
        providerExternalId: "2001",
        code: "CL",
        name: "UEFA Champions League",
        countryName: "Europe",
      },
    ]);

    expect(fetchImplementation).toHaveBeenCalledWith(
      "https://api.football-data.org/v4/competitions",
      expect.objectContaining({
        cache: "no-store",
        headers: { "X-Auth-Token": "test-provider-token" },
      }),
    );
    expect(JSON.stringify(await provider.listCompetitions())).not.toContain("crest-that-huddle");
  });

  it("normalizes identities, offsets, teams, and non-live statuses from the success fixture", async () => {
    const fetchImplementation = vi.fn(async () => jsonResponse(matchesSuccess));
    const provider = new FootballDataProvider("test-provider-token", {
      fetch: fetchImplementation,
    });

    const fixtures = await provider.listFixtures({ from: "2026-08-24", to: "2026-10-08" }, [
      "2021",
    ]);

    expect(fetchImplementation).toHaveBeenCalledWith(
      "https://api.football-data.org/v4/competitions/2021/matches?dateFrom=2026-08-24&dateTo=2026-10-09",
      expect.any(Object),
    );
    expect(fixtures).toHaveLength(2);
    expect(fixtures[0]).toMatchObject({
      provider: "football-data",
      providerExternalId: "5001",
      startsAt: "2026-08-29T16:30:00.000Z",
      status: "timed",
      seasonLabel: "2026",
      competition: { providerExternalId: "2021", code: "PL" },
      homeTeam: { providerExternalId: "57", tla: "ARS", countryName: "England" },
      awayTeam: { providerExternalId: "61", tla: "CHE", countryName: "England" },
    });
    expect(fixtures[1]).toMatchObject({
      providerExternalId: "5002",
      startsAt: "2026-09-05T12:00:00.000Z",
      status: "postponed",
    });
    expect(JSON.stringify(fixtures)).not.toContain("crest");
    expect(JSON.stringify(fixtures)).not.toContain("score");
  });

  it("accepts a valid empty fixture response", async () => {
    const provider = new FootballDataProvider("test-provider-token", {
      fetch: vi.fn(async () => jsonResponse(matchesEmpty)),
    });

    await expect(
      provider.listFixtures({ from: "2026-08-24", to: "2026-10-08" }, ["2001"]),
    ).resolves.toEqual([]);
  });

  it("normalizes the changed fixture under the same provider identity", async () => {
    const provider = new FootballDataProvider("test-provider-token", {
      fetch: vi.fn(async () => jsonResponse(matchesChanged)),
    });

    await expect(
      provider.listFixtures({ from: "2026-08-24", to: "2026-10-08" }, ["2021"]),
    ).resolves.toEqual([
      expect.objectContaining({
        providerExternalId: "5001",
        startsAt: "2026-08-30T18:00:00.000Z",
        status: "postponed",
        seasonLabel: null,
        competition: expect.objectContaining({ code: null, countryName: null }),
        awayTeam: expect.objectContaining({ shortName: null, tla: null }),
      }),
    ]);
  });

  it("rejects missing identity and invalid time fields visibly without returning raw payload", async () => {
    const provider = new FootballDataProvider("test-provider-token", {
      fetch: vi.fn(async () => jsonResponse(matchesInvalid)),
    });

    await expect(
      provider.listFixtures({ from: "2026-08-24", to: "2026-10-08" }, ["2021"]),
    ).rejects.toSatisfy(expectProviderError("INVALID_RESPONSE"));
  });

  it("uses the sanitized rate-limit fixture and performs one bounded metadata-visible retry", async () => {
    const sleep = vi.fn(async () => undefined);
    const fetchImplementation = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        jsonResponse(rateLimit, {
          headers: { "x-requestcounter-reset": "2" },
          status: 429,
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse(matchesEmpty, { headers: { "x-requestsavailable": "7" } }),
      );
    const provider = new FootballDataProvider("test-provider-token", {
      fetch: fetchImplementation,
      maxRetries: 1,
      random: () => 0,
      sleep,
    });

    await expect(
      provider.listFixtures({ from: "2026-08-24", to: "2026-10-08" }, ["2001"]),
    ).resolves.toEqual([]);
    expect(sleep).toHaveBeenCalledWith(2_000);
    expect(provider.getRequestMetadata()).toEqual({
      quotaRemaining: 7,
      requestCount: 2,
      retryCount: 1,
    });
  });

  it.each([
    [401, "AUTH"],
    [403, "AUTH"],
    [404, "UPSTREAM_4XX"],
    [429, "RATE_LIMIT"],
    [503, "UPSTREAM_5XX"],
  ] as const)("maps HTTP %i to the safe %s category", async (status, category) => {
    const provider = new FootballDataProvider("test-provider-token", {
      fetch: vi.fn(async () => jsonResponse({ hidden: "raw payload" }, { status })),
      maxRetries: 0,
    });

    await expect(provider.listCompetitions()).rejects.toSatisfy(expectProviderError(category));
  });

  it("classifies aborted requests as timeouts", async () => {
    const fetchImplementation = vi.fn<typeof fetch>(
      async (_input, init) =>
        await new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => reject(new Error("aborted secret")));
        }),
    );
    const provider = new FootballDataProvider("test-provider-token", {
      fetch: fetchImplementation,
      maxRetries: 0,
      timeoutMs: 100,
    });

    await expect(provider.listCompetitions()).rejects.toSatisfy(expectProviderError("TIMEOUT"));
  });

  it("classifies unknown transport failures without exposing their message", async () => {
    const provider = new FootballDataProvider("test-provider-token", {
      fetch: vi.fn(async () => {
        throw new Error("test-provider-token was in a socket error");
      }),
      maxRetries: 0,
    });

    await expect(provider.listCompetitions()).rejects.toSatisfy(expectProviderError("UNKNOWN"));
  });

  it("rejects invalid windows and provider IDs before a network request", async () => {
    const fetchImplementation = vi.fn<typeof fetch>();
    const provider = new FootballDataProvider("test-provider-token", {
      fetch: fetchImplementation,
    });

    await expect(
      provider.listFixtures({ from: "2026-10-08", to: "2026-08-24" }, ["2021"]),
    ).rejects.toSatisfy(expectProviderError("INVALID_RESPONSE"));
    await expect(
      provider.listFixtures({ from: "2026-08-24", to: "2026-10-08" }, ["not-an-id"]),
    ).rejects.toSatisfy(expectProviderError("INVALID_RESPONSE"));
    expect(fetchImplementation).not.toHaveBeenCalled();
  });

  it.each([
    ["SCHEDULED", "scheduled"],
    ["TIMED", "timed"],
    ["IN_PLAY", "timed"],
    ["PAUSED", "timed"],
    ["EXTRA_TIME", "timed"],
    ["PENALTY_SHOOTOUT", "timed"],
    ["SUSPENDED", "postponed"],
    ["POSTPONED", "postponed"],
    ["CANCELLED", "cancelled"],
    ["FINISHED", "finished"],
    ["AWARDED", "finished"],
  ] as const)("maps %s into Huddle status %s", (providerStatus, normalizedStatus) => {
    expect(normalizeFootballDataStatus(providerStatus)).toBe(normalizedStatus);
  });
});
