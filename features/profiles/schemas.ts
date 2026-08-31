import { z } from "zod";

import { CURRENT_COMMUNITY_RULES_VERSION } from "@/content/community-rules";

const checkedSchema = z.preprocess(
  (value) => value === true || value === "true" || value === "on",
  z.literal(true, { error: "This confirmation is required." }),
);

export const profileHandleSchema = z
  .string()
  .trim()
  .transform((value) => value.toLowerCase())
  .pipe(
    z
      .string()
      .min(3, "Use at least 3 characters.")
      .max(30, "Use 30 characters or fewer.")
      .regex(/^[a-z0-9_]+$/, "Use lowercase letters, numbers, and underscores only."),
  );

export const fanWorkspaceInputSchema = z.object({
  handle: profileHandleSchema,
  displayName: z
    .string()
    .trim()
    .min(2, "Use at least 2 characters.")
    .max(60, "Use 60 characters or fewer."),
  bio: z.string().trim().max(500, "Use 500 characters or fewer."),
  adultAttested: checkedSchema,
  rulesAccepted: checkedSchema,
  rulesVersion: z.coerce
    .number()
    .int()
    .refine((value) => value === CURRENT_COMMUNITY_RULES_VERSION, {
      message: "Refresh and accept the current community rules.",
    }),
});

export const profileInputSchema = fanWorkspaceInputSchema;
export const publicProfileHandleSchema = profileHandleSchema;

export type ProfileInput = z.infer<typeof fanWorkspaceInputSchema>;
