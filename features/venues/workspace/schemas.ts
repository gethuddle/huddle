import { z } from "zod";

import { CURRENT_COMMUNITY_RULES_VERSION } from "@/content/community-rules";
import { addressSuggestionSchema } from "@/features/locations/schemas";
import { venueFacilitySchema, venueSlugSchema } from "@/features/venues/schemas";

const checkedSchema = z.preprocess(
  (value) => value === true || value === "true" || value === "on",
  z.literal(true, { error: "This confirmation is required." }),
);

const checkboxSchema = z.preprocess(
  (value) => value === true || value === "true" || value === "on",
  z.boolean(),
);

const optionalUuid = z.preprocess(
  (value) => (value === "" || value === null || value === undefined ? null : value),
  z.uuid().nullable(),
);

const optionalPositiveCapacity = z.preprocess(
  (value) => (value === "" || value === null || value === undefined ? null : value),
  z.coerce.number().int().min(1).max(100_000).nullable(),
);

const facilitiesSchema = z
  .array(venueFacilitySchema)
  .max(7)
  .refine((values) => new Set(values).size === values.length, {
    message: "Choose each facility once.",
  });

const sharedVenueFields = {
  name: z.string().trim().min(2, "Use at least 2 characters.").max(120),
  slug: venueSlugSchema,
  cityId: z.uuid("Choose a city."),
  addressText: z.string().trim().min(3, "Enter the public address.").max(300),
  longitude: z.coerce.number().min(34, "Use a coordinate in Israel.").max(36),
  latitude: z.coerce.number().min(29, "Use a coordinate in Israel.").max(34),
  description: z.string().trim().min(10, "Use at least 10 characters.").max(2000),
  facilities: facilitiesSchema,
  houseInformation: z.string().trim().max(1000, "Use 1,000 characters or fewer."),
  defaultAttendanceMode: z.enum(["open_door", "reservations"]),
  defaultRequiresApproval: checkboxSchema,
};

export const venueWorkspaceActivationBaseSchema = z
  .object({
    ...sharedVenueFields,
    mainSpaceName: z.string().trim().min(1, "Name the initial area.").max(120),
    mainSpaceCapacity: optionalPositiveCapacity,
    adultAttested: checkedSchema,
    representationAttested: checkedSchema,
    rulesAccepted: checkedSchema,
    rulesVersion: z.coerce
      .number()
      .int()
      .refine((value) => value === CURRENT_COMMUNITY_RULES_VERSION, {
        message: "Refresh and accept the current community rules.",
      }),
  })
  .strict();

export const venueWorkspaceActivationSchema = venueWorkspaceActivationBaseSchema.superRefine(
  (value, context) => {
    if (value.defaultAttendanceMode === "reservations" && value.mainSpaceCapacity === null) {
      context.addIssue({
        code: "custom",
        path: ["mainSpaceCapacity"],
        message: "Add a capacity for reservation events.",
      });
    }
    if (value.defaultAttendanceMode === "open_door" && value.mainSpaceCapacity !== null) {
      context.addIssue({
        code: "custom",
        path: ["mainSpaceCapacity"],
        message: "Open-door areas do not use a capacity.",
      });
    }
    if (value.defaultAttendanceMode === "open_door" && value.defaultRequiresApproval) {
      context.addIssue({
        code: "custom",
        path: ["defaultRequiresApproval"],
        message: "Open-door events do not use approval.",
      });
    }
  },
);

export const venueWorkspaceUpdateSchema = z
  .object({ venueId: z.uuid(), ...sharedVenueFields })
  .strict();

export const venueSpaceInputSchema = z
  .object({
    venueId: z.uuid(),
    spaceId: optionalUuid,
    name: z.string().trim().min(1, "Name the area.").max(120),
    capacity: optionalPositiveCapacity,
    active: checkboxSchema,
    sortOrder: z.coerce.number().int().min(0).max(1000),
  })
  .strict();

const nullableOverride = (schema: z.ZodString) =>
  z.preprocess((value) => (value === "" || value === undefined ? null : value), schema.nullable());

export const venuePlanItemSchema = z
  .object({
    matchId: z.uuid(),
    venueSpaceId: z.uuid(),
    attendanceMode: z.enum(["open_door", "reservations"]),
    title: nullableOverride(z.string().trim().min(3).max(120)).default(null),
    description: nullableOverride(z.string().trim().min(10).max(2000)).default(null),
    capacity: optionalPositiveCapacity.default(null),
    requiresApproval: z.boolean().nullable().default(null),
  })
  .strict()
  .superRefine((value, context) => {
    if (
      value.attendanceMode === "open_door" &&
      (value.capacity !== null || value.requiresApproval === true)
    ) {
      context.addIssue({
        code: "custom",
        path: ["attendanceMode"],
        message: "Open-door events do not use capacity or approval.",
      });
    }
  });

export const venuePlanSchema = z
  .object({
    venueId: z.uuid(),
    venueSlug: venueSlugSchema,
    intent: z.enum(["draft", "publish"]),
    items: z.array(venuePlanItemSchema).min(1).max(20),
  })
  .strict()
  .refine((value) => new Set(value.items.map((item) => item.matchId)).size === value.items.length, {
    message: "Choose each fixture once.",
    path: ["items"],
  });

export const venueSettingsInputSchema = z
  .object({
    venueId: z.uuid(),
    name: sharedVenueFields.name,
    slug: sharedVenueFields.slug,
    cityId: sharedVenueFields.cityId,
    description: sharedVenueFields.description,
    facilities: facilitiesSchema,
    houseInformation: sharedVenueFields.houseInformation,
    defaultAttendanceMode: z.enum(["open_door", "reservations"]),
    defaultRequiresApproval: z.boolean(),
    address: addressSuggestionSchema.nullable(),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.defaultAttendanceMode === "open_door" && value.defaultRequiresApproval) {
      context.addIssue({
        code: "custom",
        path: ["defaultRequiresApproval"],
        message: "Open-door events do not use approval.",
      });
    }
  });

export type VenueWorkspaceActivationInput = z.infer<typeof venueWorkspaceActivationSchema>;
export type VenueWorkspaceUpdateInput = z.infer<typeof venueWorkspaceUpdateSchema>;
export type VenueSpaceInput = z.infer<typeof venueSpaceInputSchema>;
export type VenuePlanInput = z.infer<typeof venuePlanSchema>;
export type VenueSettingsInput = z.infer<typeof venueSettingsInputSchema>;
