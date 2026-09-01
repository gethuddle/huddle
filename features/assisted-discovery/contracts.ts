import { z } from "zod";

import { venueFacilitySchema } from "@/features/venues/schemas";

import { unsupportedReasonSchema } from "./schemas";

export const assistedDiscoveryOriginSchema = z
  .object({
    lat: z.number().finite().min(29).max(34),
    lng: z.number().finite().min(34).max(36),
  })
  .strict();

export const assistedDiscoveryRequestSchema = z.discriminatedUnion("kind", [
  z
    .object({
      kind: z.literal("interpret"),
      query: z.string().trim().min(1).max(400),
      origin: assistedDiscoveryOriginSchema.optional(),
    })
    .strict(),
  z
    .object({
      kind: z.literal("continue"),
      token: z.string().trim().min(1).max(4096),
      origin: assistedDiscoveryOriginSchema,
    })
    .strict(),
]);

export const assistedDiscoveryResultCardSchema = z
  .object({
    id: z.uuid(),
    title: z.string().min(1).max(120),
    host: z
      .object({
        kind: z.enum(["person", "venue"]),
        displayName: z.string().min(1).max(120),
        venueSlug: z.string().nullable(),
        verificationStatus: z.enum(["unverified", "verified"]).nullable(),
      })
      .strict(),
    match: z
      .object({
        id: z.uuid(),
        competitionName: z.string().min(1).max(120),
        homeTeamName: z.string().min(1).max(120),
        awayTeamName: z.string().min(1).max(120),
      })
      .strict(),
    startsAt: z.string(),
    endsAt: z.string(),
    placeKind: z.enum(["home", "venue", "public_place"]),
    locationSummary: z.string().min(1).max(120),
    audience: z.enum(["public", "team_followers", "group", "friends", "invite_only"]),
    attendanceMode: z.enum(["reservations", "open_door"]),
    capacity: z.number().int().positive().nullable(),
    approvedAttendeeCount: z.number().int().nonnegative(),
    remainingCapacity: z.number().int().nonnegative().nullable(),
    requiresApproval: z.boolean(),
    viewerParticipationState: z
      .enum(["host", "requested", "approved", "declined", "left", "removed", "invited"])
      .nullable(),
    venueFacilities: z.array(venueFacilitySchema).max(7),
    matchedReasons: z.array(z.string().min(1).max(80)).max(9),
  })
  .strict();

const interpretationSchema = z.string().min(1).max(500);
const clarificationReasonSchema = z.enum([
  "invalid_date",
  "past_date",
  "date_range_too_wide",
  "unresolved_team",
  "ambiguous_team",
  "unresolved_competition",
  "ambiguous_competition",
]);

export const assistedDiscoveryResponseSchema = z.discriminatedUnion("status", [
  z
    .object({
      status: z.literal("results"),
      interpretation: interpretationSchema,
      results: z.array(assistedDiscoveryResultCardSchema).max(3),
    })
    .strict(),
  z
    .object({
      status: z.literal("needs_location"),
      interpretation: interpretationSchema,
      token: z.string().min(1).max(4096),
    })
    .strict(),
  z
    .object({
      status: z.literal("clarification"),
      interpretation: interpretationSchema,
      reason: clarificationReasonSchema,
    })
    .strict(),
  z
    .object({
      status: z.literal("unsupported"),
      interpretation: interpretationSchema,
      reason: unsupportedReasonSchema,
    })
    .strict(),
  z
    .object({
      status: z.literal("no_results"),
      interpretation: interpretationSchema,
      exploreHref: z.string().startsWith("/").max(2048),
      planHref: z.string().startsWith("/").max(2048).nullable(),
    })
    .strict(),
]);

export type AssistedDiscoveryRequest = z.infer<typeof assistedDiscoveryRequestSchema>;
export type AssistedDiscoveryOrigin = z.infer<typeof assistedDiscoveryOriginSchema>;
export type AssistedDiscoveryResultCard = z.infer<typeof assistedDiscoveryResultCardSchema>;
export type AssistedDiscoveryResponse = z.infer<typeof assistedDiscoveryResponseSchema>;
export type ClarificationReason = z.infer<typeof clarificationReasonSchema>;
