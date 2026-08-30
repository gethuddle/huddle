import { DomainError } from "@/lib/errors";

import { publicAddressCitySchema, publicAddressQuerySchema } from "./schemas";
import type { AddressSuggestion } from "./types";

export interface PublicGeocoder {
  search(query: string, city: string): Promise<readonly AddressSuggestion[]>;
}

export function normalizePublicAddressInput(query: string, city: string) {
  const parsedQuery = publicAddressQuerySchema.safeParse(query);
  const parsedCity = publicAddressCitySchema.safeParse(city);

  if (!parsedQuery.success || !parsedCity.success) {
    throw new DomainError("VALIDATION_FAILED");
  }

  return { query: parsedQuery.data, city: parsedCity.data } as const;
}

export async function searchPublicAddress(
  geocoder: PublicGeocoder,
  query: string,
  city: string,
): Promise<readonly AddressSuggestion[]> {
  const normalized = normalizePublicAddressInput(query, city);
  return geocoder.search(normalized.query, normalized.city);
}
