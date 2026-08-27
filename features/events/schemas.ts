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
