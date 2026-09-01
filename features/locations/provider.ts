import { DomainError } from "@/lib/errors";

import { publicAddressQuerySchema } from "./schemas";
import type { AddressSuggestion } from "./types";

export interface PublicGeocoder {
  search(query: string): Promise<readonly AddressSuggestion[]>;
}

export function normalizePublicAddressInput(query: string) {
  const parsedQuery = publicAddressQuerySchema.safeParse(query);

  if (!parsedQuery.success) {
    throw new DomainError("VALIDATION_FAILED");
  }

  return parsedQuery.data;
}

export async function searchPublicAddress(
  geocoder: PublicGeocoder,
  query: string,
): Promise<readonly AddressSuggestion[]> {
  const normalized = normalizePublicAddressInput(query);
  return geocoder.search(normalized);
}
