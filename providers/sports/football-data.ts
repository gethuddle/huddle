import "server-only";

import { z } from "zod";

import { ProviderAdapterError } from "./errors";
import {
  footballDataCompetitionsResponseSchema,
  footballDataMatchesResponseSchema,
} from "./football-data-schemas";
import {
  FOOTBALL_DATA_PROVIDER,
  normalizeFootballDataCompetition,
  normalizeFootballDataFixture,
} from "./normalizers";
import type {
  DateRange,
  NormalizedCompetition,
  NormalizedFixture,
  ProviderRequestMetadata,
  SportsProvider,
} from "./types";

const FOOTBALL_DATA_BASE_URL = "https://api.football-data.org/v4";
const dateRangeSchema = z
  .object({ from: z.iso.date(), to: z.iso.date() })
  .refine(({ from, to }) => from <= to, { message: "Date range must be ordered." });

type FootballDataProviderOptions = Readonly<{
  fetch?: typeof fetch;
  maxRetries?: number;
  random?: () => number;
  sleep?: (milliseconds: number) => Promise<void>;
  timeoutMs?: number;
}>;

function addUtcDays(date: string, days: number): string {
  const value = new Date(`${date}T00:00:00.000Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

function retryDelayMilliseconds(response: Response, random: () => number): number {
  const rawSeconds =
    response.headers.get("retry-after") ?? response.headers.get("x-requestcounter-reset") ?? "1";
  const seconds = Number(rawSeconds);
  const boundedSeconds = Number.isFinite(seconds) ? Math.min(Math.max(seconds, 0), 60) : 1;

  return Math.round(boundedSeconds * 1000 + random() * 250);
}

function errorForResponse(response: Response): ProviderAdapterError {
  if (response.status === 401 || response.status === 403) {
    return new ProviderAdapterError("AUTH", { status: response.status });
  }

  if (response.status === 429) {
    return new ProviderAdapterError("RATE_LIMIT", {
      retryable: true,
      status: response.status,
    });
  }

  if (response.status >= 500) {
    return new ProviderAdapterError("UPSTREAM_5XX", {
      retryable: true,
      status: response.status,
    });
  }

  return new ProviderAdapterError("UPSTREAM_4XX", { status: response.status });
}

function quotaRemainingFromHeaders(headers: Headers): number | null {
  const raw = headers.get("x-requestsavailable") ?? headers.get("x-requests-available-minute");
  if (raw === null || !/^\d+$/.test(raw)) return null;
  const value = Number(raw);
  return Number.isSafeInteger(value) ? value : null;
}

export class FootballDataProvider implements SportsProvider {
  readonly name = FOOTBALL_DATA_PROVIDER;

  private readonly fetchImplementation: typeof fetch;
  private readonly maxRetries: number;
  private readonly random: () => number;
  private readonly sleep: (milliseconds: number) => Promise<void>;
  private readonly timeoutMs: number;
  private quotaRemaining: number | null = null;
  private requestCount = 0;
  private retryCount = 0;

  constructor(
    private readonly token: string,
    options: FootballDataProviderOptions = {},
  ) {
    if (token.trim().length === 0) {
      throw new ProviderAdapterError("AUTH");
    }

    this.fetchImplementation = options.fetch ?? fetch;
    this.maxRetries = Math.max(0, Math.min(options.maxRetries ?? 1, 2));
    this.random = options.random ?? Math.random;
    this.sleep =
      options.sleep ??
      ((milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)));
    this.timeoutMs = Math.max(100, Math.min(options.timeoutMs ?? 8_000, 30_000));
  }

  getRequestMetadata(): ProviderRequestMetadata {
    return {
      quotaRemaining: this.quotaRemaining,
      requestCount: this.requestCount,
      retryCount: this.retryCount,
    };
  }

  async listCompetitions(): Promise<NormalizedCompetition[]> {
    const response = await this.request("/competitions", footballDataCompetitionsResponseSchema);
    return response.competitions.map(normalizeFootballDataCompetition);
  }

  async listFixtures(
    dateRange: DateRange,
    competitionExternalIds: string[],
  ): Promise<NormalizedFixture[]> {
    const range = dateRangeSchema.safeParse(dateRange);
    if (!range.success) {
      throw new ProviderAdapterError("INVALID_RESPONSE", { cause: range.error });
    }

    const fixtures: NormalizedFixture[] = [];
    const exclusiveDateTo = addUtcDays(range.data.to, 1);

    for (const externalId of competitionExternalIds) {
      if (!/^\d+$/.test(externalId)) {
        throw new ProviderAdapterError("INVALID_RESPONSE");
      }

      const query = new URLSearchParams({
        dateFrom: range.data.from,
        dateTo: exclusiveDateTo,
      });
      const response = await this.request(
        `/competitions/${encodeURIComponent(externalId)}/matches?${query.toString()}`,
        footballDataMatchesResponseSchema,
      );

      fixtures.push(
        ...response.matches.map((match) =>
          normalizeFootballDataFixture(response.competition, match),
        ),
      );
    }

    return fixtures;
  }

  private async request<T>(path: string, schema: z.ZodType<T>): Promise<T> {
    for (let attempt = 0; attempt <= this.maxRetries; attempt += 1) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

      try {
        this.requestCount += 1;
        const response = await this.fetchImplementation(`${FOOTBALL_DATA_BASE_URL}${path}`, {
          cache: "no-store",
          headers: { "X-Auth-Token": this.token },
          signal: controller.signal,
        });
        const observedQuota = quotaRemainingFromHeaders(response.headers);
        if (observedQuota !== null) this.quotaRemaining = observedQuota;

        if (!response.ok) {
          const providerError = errorForResponse(response);
          if (providerError.retryable && attempt < this.maxRetries) {
            this.retryCount += 1;
            await this.sleep(retryDelayMilliseconds(response, this.random));
            continue;
          }
          throw providerError;
        }

        let payload: unknown;
        try {
          payload = await response.json();
        } catch (error) {
          throw new ProviderAdapterError("INVALID_RESPONSE", { cause: error });
        }

        const parsed = schema.safeParse(payload);
        if (!parsed.success) {
          throw new ProviderAdapterError("INVALID_RESPONSE", { cause: parsed.error });
        }

        return parsed.data;
      } catch (error) {
        if (error instanceof ProviderAdapterError) {
          throw error;
        }

        if (controller.signal.aborted) {
          if (attempt < this.maxRetries) {
            this.retryCount += 1;
            await this.sleep(Math.round(250 + this.random() * 250));
            continue;
          }
          throw new ProviderAdapterError("TIMEOUT", { cause: error });
        }

        if (attempt < this.maxRetries) {
          this.retryCount += 1;
          await this.sleep(Math.round(250 + this.random() * 250));
          continue;
        }

        throw new ProviderAdapterError("UNKNOWN", { cause: error });
      } finally {
        clearTimeout(timeout);
      }
    }

    throw new ProviderAdapterError("UNKNOWN");
  }
}
