import { z } from "zod";

const boundedText = (minimum: number, maximum: number) =>
  z.string().trim().min(minimum).max(maximum);

export const publicAddressQuerySchema = boundedText(3, 160);
export const publicAddressCitySchema = boundedText(2, 80);
export const publicLocationKindSchema = z.enum(["venue", "public_place"]);

export const publicAddressSearchRequestSchema = z
  .object({
    query: publicAddressQuerySchema,
    city: publicAddressCitySchema,
    locationKind: publicLocationKindSchema,
  })
  .strict();

export const addressSuggestionSchema = z
  .object({
    id: z.string().min(1).max(80),
    label: z.string().min(1).max(500),
    city: z.string().min(1).max(120),
    latitude: z.number().finite().min(29.3).max(33.5),
    longitude: z.number().finite().min(34.2).max(35.9),
  })
  .strict();

export const addressSuggestionsSchema = z.array(addressSuggestionSchema).max(5);

const providerCoordinate = (minimum: number, maximum: number) =>
  z
    .string()
    .regex(/^-?\d{1,3}(?:\.\d+)?$/)
    .transform(Number)
    .pipe(z.number().finite().min(minimum).max(maximum));

export const nominatimSearchResponseSchema = z
  .array(
    z
      .object({
        place_id: z.union([z.number().int().nonnegative(), z.string().min(1).max(80)]),
        display_name: z.string().min(1).max(500),
        lat: providerCoordinate(29.3, 33.5),
        lon: providerCoordinate(34.2, 35.9),
        address: z
          .object({
            city: z.string().min(1).max(120).optional(),
            town: z.string().min(1).max(120).optional(),
            village: z.string().min(1).max(120).optional(),
            municipality: z.string().min(1).max(120).optional(),
            country_code: z.string().length(2).toLowerCase(),
          })
          .passthrough(),
      })
      .passthrough(),
  )
  .max(50);

const photonPropertiesSchema = z
  .object({
    osm_type: z.string().trim().min(1).max(20),
    osm_id: z.union([z.number().int().nonnegative(), z.string().min(1).max(80)]),
    name: z.string().trim().min(1).max(300).optional(),
    street: z.string().trim().min(1).max(300).optional(),
    housenumber: z.string().trim().min(1).max(40).optional(),
    city: z.string().trim().min(1).max(120).optional(),
    town: z.string().trim().min(1).max(120).optional(),
    district: z.string().trim().min(1).max(120).optional(),
    state: z.string().trim().min(1).max(120).optional(),
    country: z.string().trim().min(1).max(120).optional(),
    countrycode: z.string().trim().length(2).optional(),
  })
  .passthrough();

export const photonSearchResponseSchema = z
  .object({
    type: z.literal("FeatureCollection"),
    features: z
      .array(
        z
          .object({
            type: z.literal("Feature"),
            geometry: z.object({
              type: z.literal("Point"),
              coordinates: z.tuple([
                z.number().finite().min(34.2).max(35.9),
                z.number().finite().min(29.3).max(33.5),
              ]),
            }),
            properties: photonPropertiesSchema,
          })
          .passthrough(),
      )
      .max(50),
  })
  .passthrough();

export type PublicAddressSearchRequest = z.infer<typeof publicAddressSearchRequestSchema>;
