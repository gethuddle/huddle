import "server-only";

import type { AddressSuggestion } from "@/features/locations/types";
import type { ServerEnvironment } from "@/lib/env/schema";

import {
  ASSISTED_DISCOVERY_E2E_FAKE_ACCOUNT_ID,
  ASSISTED_DISCOVERY_E2E_FAKE_API_TOKEN,
} from "./interpreter-factory";
import type { AssistedDiscoveryOrigin } from "./contracts";

export type ResolvedNamedOrigin = Readonly<{
  origin: AssistedDiscoveryOrigin;
  label: string;
}>;

export type NamedOriginProvider = (place: string) => Promise<readonly AddressSuggestion[]>;

type NamedOriginResolverOptions = Readonly<{
  environment: ServerEnvironment["HUDDLE_ENVIRONMENT"];
  accountId: string;
  apiToken: string;
}>;

const LOCAL_E2E_ORIGINS = new Map<string, ResolvedNamedOrigin>([
  [
    "jerusalem",
    {
      origin: { lat: 31.778, lng: 35.225 },
      label: "Jerusalem, Israel",
    },
  ],
]);

export function createAssistedDiscoveryNamedOriginResolver(
  options: NamedOriginResolverOptions,
  provider: NamedOriginProvider,
) {
  const isLocalE2e =
    options.environment === "local" &&
    options.accountId === ASSISTED_DISCOVERY_E2E_FAKE_ACCOUNT_ID &&
    options.apiToken === ASSISTED_DISCOVERY_E2E_FAKE_API_TOKEN;

  return async (place: string): Promise<ResolvedNamedOrigin | null> => {
    const normalized = place.trim();
    if (normalized.length < 3) return null;
    if (isLocalE2e) {
      return LOCAL_E2E_ORIGINS.get(normalized.toLocaleLowerCase("en")) ?? null;
    }

    const [suggestion] = await provider(normalized);
    if (suggestion === undefined) return null;
    return {
      origin: { lat: suggestion.latitude, lng: suggestion.longitude },
      label: suggestion.label,
    };
  };
}
