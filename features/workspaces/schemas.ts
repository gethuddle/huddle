import { z } from "zod";

import { CURRENT_COMMUNITY_RULES_VERSION } from "@/content/community-rules";
import { addressSuggestionSchema } from "@/features/locations/schemas";
import { venueWorkspaceActivationBaseSchema } from "@/features/venues/workspace/schemas";

const checkedSchema = z.preprocess(
  (value) => value === true || value === "true" || value === "on",
  z.literal(true, { error: "This confirmation is required." }),
);

const routeSlugSchema = z
  .string()
  .min(1)
  .max(120)
  .regex(/^[a-z0-9][a-z0-9_-]*$/);

export const workspaceRowSchema = z
  .object({
    workspace_kind: z.enum(["fan", "venue"]),
    workspace_id: z.uuid(),
    slug: routeSlugSchema.nullable(),
    name: z.string().trim().min(1).max(120),
    role: z.enum(["fan", "owner", "admin"]),
  })
  .strict()
  .superRefine((row, context) => {
    if (row.workspace_kind === "fan" && row.role !== "fan") {
      context.addIssue({ code: "custom", path: ["role"], message: "Invalid Fan role." });
    }
    if (row.workspace_kind === "venue" && row.role === "fan") {
      context.addIssue({ code: "custom", path: ["role"], message: "Invalid Venue role." });
    }
    if (row.workspace_kind === "venue" && row.slug === null) {
      context.addIssue({ code: "custom", path: ["slug"], message: "Venue URL is missing." });
    }
  });

export const workspaceRowsSchema = z.array(workspaceRowSchema).max(100);

export const workspaceSelectionSchema = z
  .object({ kind: z.enum(["fan", "venue"]), id: z.uuid() })
  .strict();

export const commonOnboardingInputSchema = z
  .object({
    adultAttested: checkedSchema,
    rulesAccepted: checkedSchema,
    rulesVersion: z.coerce
      .number()
      .int()
      .refine((version) => version === CURRENT_COMMUNITY_RULES_VERSION, {
        message: "Refresh and accept the current community rules.",
      }),
  })
  .strict();

const commonOnboardingRowSchema = z
  .object({
    adult_attested_at: z.string().datetime({ offset: true }),
    rules_version: z.number().int(),
    rules_accepted_at: z.string().datetime({ offset: true }),
  })
  .strict();

export const commonOnboardingRowsSchema = z.array(commonOnboardingRowSchema).max(1);

export const venueOnboardingSubmissionSchema = venueWorkspaceActivationBaseSchema
  .omit({
    slug: true,
    addressText: true,
    longitude: true,
    latitude: true,
    adultAttested: true,
    rulesAccepted: true,
    rulesVersion: true,
  })
  .extend({ address: addressSuggestionSchema })
  .strict()
  .superRefine((value, context) => {
    if (value.defaultAttendanceMode === "reservations" && value.mainSpaceCapacity === null) {
      context.addIssue({
        code: "custom",
        path: ["mainSpaceCapacity"],
        message: "Add a capacity for reservation events.",
      });
    }
    if (
      value.defaultAttendanceMode === "open_door" &&
      (value.mainSpaceCapacity !== null || value.defaultRequiresApproval)
    ) {
      context.addIssue({
        code: "custom",
        path: ["defaultAttendanceMode"],
        message: "Open-door events do not use capacity or approval.",
      });
    }
  });

export function parseWorkspaceCookie(raw: string | null | undefined) {
  if (raw === undefined || raw === null || raw.length > 80) return null;
  const separator = raw.indexOf(":");
  if (separator < 1 || raw.indexOf(":", separator + 1) !== -1) return null;

  const parsed = workspaceSelectionSchema.safeParse({
    kind: raw.slice(0, separator),
    id: raw.slice(separator + 1),
  });
  return parsed.success ? parsed.data : null;
}

export type CommonOnboardingInput = z.infer<typeof commonOnboardingInputSchema>;
export type VenueOnboardingSubmission = z.infer<typeof venueOnboardingSubmissionSchema>;
