import { z } from "zod";

const optionalUuid = z.preprocess(
  (value) => (value === "" || value == null ? null : value),
  z.uuid().nullable(),
);

const optionalText = (maximum: number) =>
  z.preprocess(
    (value) => (value === "" || value === null ? null : value),
    z.string().trim().min(1).max(maximum).nullable(),
  );

const optionalCoordinate = z.preprocess(
  (value) => (value === "" || value === null ? null : value),
  z.coerce.number().nullable(),
);

export const eventRouteIdSchema = z.uuid();

const eventDraftValueShape = {
  matchId: z.uuid(),
  title: z.string().trim().min(3).max(120),
  description: z.string().trim().min(10).max(2000),
  expectedActivity: z.string().trim().min(3).max(500),
  costDescription: z.string().trim().min(2).max(300),
  eventRules: z.string().trim().min(3).max(1000),
  commercialAffiliation: z.string().trim().min(2).max(300),
  hostPresenceConfirmed: z.boolean(),
  cityId: z.uuid(),
  placeKind: z.enum(["home", "public_place"]),
  publicPlaceName: z.string().trim().min(1).max(120),
  publicAddressText: z.string().trim().min(1).max(300),
  publicLongitude: z.number().min(34).max(36),
  publicLatitude: z.number().min(29).max(34),
  audience: z.enum(["group", "friends", "invite_only"]),
  audienceGroupId: z.uuid(),
  capacity: z.number().int().min(1).max(1000),
};

export const eventDraftValuesSchema = z.object(eventDraftValueShape).partial().strict();

export const eventDraftPatchSchema = z
  .object({
    matchId: eventDraftValueShape.matchId.nullable().optional(),
    title: eventDraftValueShape.title.nullable().optional(),
    description: eventDraftValueShape.description.nullable().optional(),
    expectedActivity: eventDraftValueShape.expectedActivity.nullable().optional(),
    costDescription: eventDraftValueShape.costDescription.nullable().optional(),
    eventRules: eventDraftValueShape.eventRules.nullable().optional(),
    commercialAffiliation: eventDraftValueShape.commercialAffiliation.nullable().optional(),
    hostPresenceConfirmed: eventDraftValueShape.hostPresenceConfirmed.nullable().optional(),
    cityId: eventDraftValueShape.cityId.nullable().optional(),
    placeKind: eventDraftValueShape.placeKind.nullable().optional(),
    publicPlaceName: eventDraftValueShape.publicPlaceName.nullable().optional(),
    publicAddressText: eventDraftValueShape.publicAddressText.nullable().optional(),
    publicLongitude: eventDraftValueShape.publicLongitude.nullable().optional(),
    publicLatitude: eventDraftValueShape.publicLatitude.nullable().optional(),
    audience: eventDraftValueShape.audience.nullable().optional(),
    audienceGroupId: eventDraftValueShape.audienceGroupId.nullable().optional(),
    capacity: eventDraftValueShape.capacity.nullable().optional(),
  })
  .strict();

export const eventDraftProtectedLocationSchema = z
  .object({
    addressText: z.string().trim().min(5).max(300),
    directionsText: z.string().trim().min(1).max(500).nullable(),
    longitude: z.number().min(34).max(36),
    latitude: z.number().min(29).max(34),
  })
  .strict();

const eventDraftPrivateMutationSchema = z.discriminatedUnion("mode", [
  z.object({ mode: z.literal("preserve") }).strict(),
  z.object({ mode: z.literal("clear") }).strict(),
  z
    .object({
      mode: z.literal("replace"),
      value: eventDraftProtectedLocationSchema,
    })
    .strict(),
]);

export const eventDraftSaveInputSchema = z
  .object({
    id: z.uuid().nullable(),
    step: z.union([z.literal(1), z.literal(2), z.literal(3)]),
    values: eventDraftPatchSchema,
    organizingGroupId: z.uuid().nullable(),
    privateLocation: eventDraftPrivateMutationSchema,
  })
  .strict();

export const eventDraftIdInputSchema = z.object({ draftId: z.uuid() }).strict();

export type EventDraftValues = z.infer<typeof eventDraftValuesSchema>;
export type EventDraftPatch = z.infer<typeof eventDraftPatchSchema>;
export type EventDraftProtectedLocation = z.infer<typeof eventDraftProtectedLocationSchema>;
export type EventDraftSaveInput = z.infer<typeof eventDraftSaveInputSchema>;

export const venueEventFormSchema = z
  .object({
    eventId: optionalUuid,
    venueId: z.uuid(),
    venueSlug: z
      .string()
      .trim()
      .min(3)
      .max(60)
      .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
    matchId: z.uuid("Choose a synchronized future fixture."),
    title: z.string().trim().min(3, "Use at least 3 characters.").max(120),
    description: z.string().trim().min(10, "Use at least 10 characters.").max(2000),
    expectedActivity: z.string().trim().min(3, "Describe what will happen.").max(500),
    costDescription: z.string().trim().min(2, "State the cost, including free.").max(300),
    eventRules: z.string().trim().min(3, "Add at least one clear rule.").max(1000),
    commercialAffiliation: z.string().trim().min(2, "State the venue connection clearly.").max(300),
    hostPresenceConfirmed: z.boolean().refine(Boolean, "Confirm that a host will be present."),
    audience: z.enum(["public", "team_followers"]),
    audienceTeamId: optionalUuid,
    capacity: z.coerce.number().int().min(1).max(100_000),
    requiresApproval: z.boolean(),
    intent: z.enum(["draft", "publish"]),
  })
  .superRefine((value, context) => {
    if (value.audience === "team_followers" && value.audienceTeamId === null) {
      context.addIssue({
        code: "custom",
        path: ["audienceTeamId"],
        message: "Choose the team whose followers may attend.",
      });
    }
    if (value.audience === "public" && value.audienceTeamId !== null) {
      context.addIssue({
        code: "custom",
        path: ["audienceTeamId"],
        message: "A team target is used only for team-follower events.",
      });
    }
  });

export const privateEventFormSchema = z
  .object({
    eventId: optionalUuid,
    organizingGroupId: optionalUuid,
    matchId: z.uuid("Choose a synchronized future fixture."),
    title: z.string().trim().min(3, "Use at least 3 characters.").max(120),
    description: z.string().trim().min(10, "Use at least 10 characters.").max(2000),
    expectedActivity: z.string().trim().min(3, "Describe what will happen.").max(500),
    costDescription: z.string().trim().min(2, "State the cost, including free.").max(300),
    eventRules: z.string().trim().min(3, "Add at least one clear rule.").max(1000),
    commercialAffiliation: z
      .string()
      .trim()
      .min(2, "State any commercial connection, including none.")
      .max(300),
    hostPresenceConfirmed: z.boolean().refine(Boolean, "Confirm that the host will be present."),
    cityId: z.uuid("Choose the event city."),
    placeKind: z.enum(["home", "public_place"]),
    publicPlaceName: optionalText(120),
    publicAddressText: optionalText(300),
    publicLongitude: optionalCoordinate,
    publicLatitude: optionalCoordinate,
    privateAddressText: optionalText(300),
    privateDirections: optionalText(500),
    privateLongitude: optionalCoordinate,
    privateLatitude: optionalCoordinate,
    audience: z.enum(["group", "friends", "invite_only"]),
    audienceGroupId: optionalUuid,
    capacity: z.coerce.number().int().min(1).max(1000),
    intent: z.enum(["draft", "publish"]),
  })
  .superRefine((value, context) => {
    if (value.audience === "group" && value.audienceGroupId === null) {
      context.addIssue({
        code: "custom",
        path: ["audienceGroupId"],
        message: "Choose one of your active groups.",
      });
    }
    if (value.audience !== "group" && value.audienceGroupId !== null) {
      context.addIssue({
        code: "custom",
        path: ["audienceGroupId"],
        message: "A group may be selected only for a group event.",
      });
    }

    if (value.placeKind === "home") {
      if (value.capacity > 12) {
        context.addIssue({
          code: "custom",
          path: ["capacity"],
          message: "Home events have a hard maximum of 12 registered accounts.",
        });
      }
      if (value.privateAddressText === null) {
        context.addIssue({
          code: "custom",
          path: ["privateAddressText"],
          message: "Enter the home address.",
        });
      }
      if (
        value.privateLongitude === null ||
        value.privateLongitude < 34 ||
        value.privateLongitude > 36
      ) {
        context.addIssue({
          code: "custom",
          path: ["privateLongitude"],
          message: "Use a longitude in Israel.",
        });
      }
      if (
        value.privateLatitude === null ||
        value.privateLatitude < 29 ||
        value.privateLatitude > 34
      ) {
        context.addIssue({
          code: "custom",
          path: ["privateLatitude"],
          message: "Use a latitude in Israel.",
        });
      }
    } else {
      if (value.publicPlaceName === null) {
        context.addIssue({
          code: "custom",
          path: ["publicPlaceName"],
          message: "Enter the public place name.",
        });
      }
      if (value.publicAddressText === null) {
        context.addIssue({
          code: "custom",
          path: ["publicAddressText"],
          message: "Enter the public address.",
        });
      }
      if (
        value.publicLongitude === null ||
        value.publicLongitude < 34 ||
        value.publicLongitude > 36
      ) {
        context.addIssue({
          code: "custom",
          path: ["publicLongitude"],
          message: "Use a longitude in Israel.",
        });
      }
      if (value.publicLatitude === null || value.publicLatitude < 29 || value.publicLatitude > 34) {
        context.addIssue({
          code: "custom",
          path: ["publicLatitude"],
          message: "Use a latitude in Israel.",
        });
      }
    }
  });

export type PrivateEventInput = z.infer<typeof privateEventFormSchema>;
export type VenueEventInput = z.infer<typeof venueEventFormSchema>;
