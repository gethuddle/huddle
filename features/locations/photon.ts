import "server-only";

import { DomainError } from "@/lib/errors";

import { photonSearchResponseSchema } from "./schemas";
import { normalizePublicAddressInput, type PublicGeocoder } from "./provider";
import type { AddressSuggestion } from "./types";

const PHOTON_ENDPOINT = "https://photon.komoot.io/api/";
const ISRAEL_BBOX = "34.2674,29.4534,35.895,33.3356";
const DEFAULT_TIMEOUT_MS = 5_000;

type FetchImplementation = (input: URL | RequestInfo, init?: RequestInit) => Promise<Response>;

type PhotonOptions = Readonly<{
  fetch?: FetchImplementation;
  timeoutMs?: number;
}>;

function suggestionLabel(properties: {
  name?: string;
  street?: string;
  housenumber?: string;
  city?: string;
  town?: string;
  district?: string;
  state?: string;
  country?: string;
}): string {
  const street = [properties.street, properties.housenumber].filter(Boolean).join(" ");
  const place = properties.name ?? street;
  return [
    ...new Set([place, properties.city ?? properties.town, properties.country].filter(Boolean)),
  ]
    .join(", ")
    .slice(0, 500);
}

export class PhotonPublicGeocoder implements PublicGeocoder {
  readonly #fetch: FetchImplementation;
  readonly #timeoutMs: number;

  constructor(options: PhotonOptions = {}) {
    this.#fetch = options.fetch ?? globalThis.fetch.bind(globalThis);
    this.#timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  }

  async search(query: string, city: string): Promise<readonly AddressSuggestion[]> {
    const normalized = normalizePublicAddressInput(query, city);
    const requestUrl = new URL(PHOTON_ENDPOINT);
    requestUrl.searchParams.set("q", `${normalized.query}, ${normalized.city}, Israel`);
    requestUrl.searchParams.set("limit", "5");
    requestUrl.searchParams.set("lang", "en");
    requestUrl.searchParams.set("bbox", ISRAEL_BBOX);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.#timeoutMs);

    try {
      const response = await this.#fetch(requestUrl, {
        method: "GET",
        headers: { Accept: "application/json" },
        redirect: "error",
        signal: controller.signal,
      });
      if (response.status === 429) throw new DomainError("RATE_LIMITED");
      if (!response.ok) throw new DomainError("UPSTREAM_UNAVAILABLE");

      const parsed = photonSearchResponseSchema.safeParse(await response.json());
      if (!parsed.success) throw new DomainError("UPSTREAM_UNAVAILABLE");

      return parsed.data.features
        .filter((feature) => feature.properties.countrycode?.toLowerCase() === "il")
        .map((feature) => {
          const [longitude, latitude] = feature.geometry.coordinates;
          const cityName =
            feature.properties.city ??
            feature.properties.town ??
            feature.properties.district ??
            feature.properties.state ??
            normalized.city;
          return {
            id: `${feature.properties.osm_type}:${feature.properties.osm_id}`,
            label: suggestionLabel(feature.properties),
            city: cityName,
            latitude,
            longitude,
          } satisfies AddressSuggestion;
        })
        .filter((suggestion) => suggestion.label.length > 0)
        .slice(0, 5);
    } catch (error) {
      if (error instanceof DomainError) throw error;
      throw new DomainError("UPSTREAM_UNAVAILABLE");
    } finally {
      clearTimeout(timeout);
    }
  }
}

export function createPhotonPublicGeocoder() {
  return new PhotonPublicGeocoder();
}
