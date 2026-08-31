import { z } from "zod";

export const venueFacilitySchema = z.enum([
  "wheelchair_accessible",
  "step_free_access",
  "accessible_toilet",
  "hearing_loop",
  "parking",
  "food",
  "drinks",
]);

const nullablePositiveInteger = (maximum: number) =>
  z.preprocess(
    (value) => (value === "" || value === null ? null : value),
    z.coerce.number().int().min(1).max(maximum).nullable(),
  );

export const venueSlugSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(3, "Use at least 3 characters.")
  .max(60, "Use 60 characters or fewer.")
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Use lowercase words separated by hyphens.");

export const venueRouteSlugSchema = venueSlugSchema;

export const venueFormSchema = z.object({
  venueId: z.preprocess((value) => (value === "" ? null : value), z.uuid().nullable()),
  name: z.string().trim().min(2, "Use at least 2 characters.").max(120),
  slug: venueSlugSchema,
  addressText: z.string().trim().min(3, "Enter the public address.").max(300),
  longitude: z.coerce.number().min(34, "Use a coordinate in Israel.").max(36),
  latitude: z.coerce.number().min(29, "Use a coordinate in Israel.").max(34),
  description: z.string().trim().min(10, "Use at least 10 characters.").max(2000),
  screenCount: nullablePositiveInteger(1000),
  statedCapacity: nullablePositiveInteger(100_000),
});

export const venueFollowSchema = z.object({
  venueId: z.uuid(),
  venueSlug: venueRouteSlugSchema,
  intent: z.enum(["follow", "unfollow"]),
});

export type VenueFormInput = z.infer<typeof venueFormSchema>;
