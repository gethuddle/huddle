import "server-only";

import { DomainError } from "@/lib/errors";

import { nominatimSearchResponseSchema } from "./schemas";
import { normalizePublicAddressInput, type PublicGeocoder } from "./provider";
import type { AddressSuggestion } from "./types";

const NOMINATIM_ENDPOINT = "https://nominatim.openstreetmap.org/search";
const ISRAEL_VIEWBOX = "34.2674,33.3356,35.8950,29.4534";
const HUDDLE_USER_AGENT = "Huddle/0.1 (https://github.com/gethuddle/huddle; location-search)";
const DEFAULT_TIMEOUT_MS = 5_000;

type FetchImplementation = (input: URL | RequestInfo, init?: RequestInit) => Promise<Response>;

type NominatimOptions = Readonly<{
  fetch?: FetchImplementation;
  timeoutMs?: number;
}>;

export class NominatimPublicGeocoder implements PublicGeocoder {
  readonly #fetch: FetchImplementation;
  readonly #timeoutMs: number;

  constructor(options: NominatimOptions = {}) {
    this.#fetch = options.fetch ?? globalThis.fetch.bind(globalThis);
    this.#timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  }

  async search(query: string): Promise<readonly AddressSuggestion[]> {
    const normalized = normalizePublicAddressInput(query);
    const requestUrl = new URL(NOMINATIM_ENDPOINT);
    requestUrl.searchParams.set("q", `${normalized}, Israel`);
    requestUrl.searchParams.set("countrycodes", "il");
    requestUrl.searchParams.set("format", "jsonv2");
    requestUrl.searchParams.set("addressdetails", "1");
    requestUrl.searchParams.set("bounded", "1");
    requestUrl.searchParams.set("viewbox", ISRAEL_VIEWBOX);
    requestUrl.searchParams.set("limit", "5");

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.#timeoutMs);

    try {
      const response = await this.#fetch(requestUrl, {
        method: "GET",
        headers: {
          Accept: "application/json",
          "User-Agent": HUDDLE_USER_AGENT,
        },
        redirect: "error",
        signal: controller.signal,
      });

      if (response.status === 429) {
        throw new DomainError("RATE_LIMITED");
      }
      if (!response.ok) {
        throw new DomainError("UPSTREAM_UNAVAILABLE");
      }

      const parsed = nominatimSearchResponseSchema.safeParse(await response.json());
      if (!parsed.success) {
        throw new DomainError("UPSTREAM_UNAVAILABLE");
      }

      return parsed.data
        .filter((row) => row.address.country_code === "il")
        .slice(0, 5)
        .map((row) => ({
          id: String(row.place_id),
          label: row.display_name,
          latitude: row.lat,
          longitude: row.lon,
        }));
    } catch (error) {
      if (error instanceof DomainError) throw error;
      throw new DomainError("UPSTREAM_UNAVAILABLE");
    } finally {
      clearTimeout(timeout);
    }
  }
}

export function createNominatimPublicGeocoder() {
  return new NominatimPublicGeocoder();
}
