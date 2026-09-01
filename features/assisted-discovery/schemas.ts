import { z } from "zod";

import { venueFacilitySchema } from "@/features/venues/schemas";

export const temporalIntentSchema = z.enum([
  "unspecified",
  "today",
  "tomorrow",
  "this_weekend",
  "next_week",
  "explicit_range",
]);

export const relationshipIntentSchema = z.enum(["any", "friend_host", "my_groups"]);
export const hostKindIntentSchema = z.enum(["any", "venue", "person"]);
export const proximityIntentSchema = z.enum(["none", "nearby"]);
export const unsupportedReasonSchema = z.enum([
  "named_person_or_group",
  "live_scores",
  "tickets_or_payments",
  "event_creation",
  "outside_scope",
]);

export const intentDraftSchema = z
  .object({
    support: z.enum(["supported", "unsupported"]),
    unsupportedReason: unsupportedReasonSchema.nullable(),
    temporal: temporalIntentSchema,
    explicitStartDate: z.iso.date().nullable(),
    explicitEndDate: z.iso.date().nullable(),
    teamMentions: z.array(z.string().trim().min(1).max(80)).max(2),
    competitionMention: z.string().trim().min(1).max(100).nullable(),
    relationship: relationshipIntentSchema,
    hostKind: hostKindIntentSchema,
    proximity: proximityIntentSchema,
    requiredFacilities: z.array(venueFacilitySchema).max(7),
  })
  .strict()
  .superRefine((value, context) => {
    if (new Set(value.requiredFacilities).size !== value.requiredFacilities.length) {
      context.addIssue({
        code: "custom",
        path: ["requiredFacilities"],
        message: "Facilities must be unique",
      });
    }
    const usesExplicitRange = value.temporal === "explicit_range";
    if (usesExplicitRange !== (value.explicitStartDate !== null)) {
      context.addIssue({
        code: "custom",
        path: ["explicitStartDate"],
        message: "Explicit dates are required only for an explicit range",
      });
    }
    if (usesExplicitRange !== (value.explicitEndDate !== null)) {
      context.addIssue({
        code: "custom",
        path: ["explicitEndDate"],
        message: "Explicit dates are required only for an explicit range",
      });
    }
    if ((value.support === "unsupported") !== (value.unsupportedReason !== null)) {
      context.addIssue({
        code: "custom",
        path: ["unsupportedReason"],
        message: "Unsupported intent requires one bounded reason",
      });
    }
  });

export const resolvedAssistedDiscoveryIntentSchema = z
  .object({
    version: z.literal(1),
    fromDate: z.iso.date(),
    toDate: z.iso.date(),
    teamIds: z.array(z.uuid()).max(2),
    teamNames: z.array(z.string().trim().min(1).max(120)).max(2),
    competitionId: z.uuid().nullable(),
    competitionName: z.string().trim().min(1).max(120).nullable(),
    relationship: relationshipIntentSchema,
    hostKind: hostKindIntentSchema,
    proximity: proximityIntentSchema,
    requiredFacilities: z.array(venueFacilitySchema).max(7),
    requiresOrigin: z.boolean(),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.teamIds.length !== value.teamNames.length) {
      context.addIssue({
        code: "custom",
        path: ["teamNames"],
        message: "Resolved team identifiers and labels must stay aligned",
      });
    }
    if ((value.competitionId === null) !== (value.competitionName === null)) {
      context.addIssue({
        code: "custom",
        path: ["competitionName"],
        message: "Resolved competition identifier and label must stay aligned",
      });
    }
  });

export type IntentDraft = z.infer<typeof intentDraftSchema>;
export type ResolvedAssistedDiscoveryIntent = z.infer<typeof resolvedAssistedDiscoveryIntentSchema>;
export type VenueFacility = z.infer<typeof venueFacilitySchema>;
