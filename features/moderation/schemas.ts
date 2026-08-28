import { z } from "zod";

export const moderationTargetTypes = ["profile", "group", "venue", "event"] as const;
export const reportCategories = [
  "immediate_danger",
  "harassment_stalking_sexual_misconduct",
  "hate_discrimination",
  "privacy_exposure",
  "impersonation_fraud",
  "dangerous_illegal_activity",
  "spam_scam",
  "other",
] as const;
export const moderationActionKinds = [
  "content_correction",
  "warning",
  "feature_restriction",
  "temporary_suspension",
  "event_cancellation",
  "group_suspension",
  "venue_suspension",
  "permanent_account_ban",
] as const;

const boundedText = (minimum: number, maximum: number) =>
  z.string().trim().min(minimum).max(maximum);

export const reportSubmissionSchema = z
  .object({
    targetType: z.enum(moderationTargetTypes),
    targetId: z.string().trim(),
    targetHandle: z.string().trim(),
    category: z.enum(reportCategories),
    details: boundedText(20, 2000),
  })
  .superRefine((value, context) => {
    if (value.targetType === "profile") {
      if (!/^[a-z0-9_]{3,30}$/.test(value.targetHandle)) {
        context.addIssue({ code: "custom", path: ["targetHandle"], message: "Invalid profile." });
      }
      if (value.targetId !== "") {
        context.addIssue({
          code: "custom",
          path: ["targetId"],
          message: "Invalid profile target.",
        });
      }
    } else {
      if (!z.uuid().safeParse(value.targetId).success) {
        context.addIssue({ code: "custom", path: ["targetId"], message: "Invalid report target." });
      }
      if (value.targetHandle !== "") {
        context.addIssue({
          code: "custom",
          path: ["targetHandle"],
          message: "Invalid report target.",
        });
      }
    }
  });

export const reportAssignmentSchema = z.object({ reportId: z.uuid() });

export const reportDismissalSchema = reportAssignmentSchema.extend({
  reason: boundedText(10, 2000),
});

const durationSchema = z.preprocess(
  (value) => (value === "" || value === null ? undefined : value),
  z.coerce.number().int().min(1).max(720).optional(),
);

export const moderationActionSchema = z
  .object({
    reportId: z.uuid(),
    action: z.enum(moderationActionKinds),
    reason: boundedText(10, 1000),
    durationHours: durationSchema,
  })
  .superRefine((value, context) => {
    const isTimed =
      value.action === "feature_restriction" || value.action === "temporary_suspension";
    if (isTimed && value.durationHours === undefined) {
      context.addIssue({
        code: "custom",
        path: ["durationHours"],
        message: "Choose a duration for this action.",
      });
    }
    if (!isTimed && value.durationHours !== undefined) {
      context.addIssue({
        code: "custom",
        path: ["durationHours"],
        message: "This action does not accept a duration.",
      });
    }
  });

export const moderationReversalSchema = z.object({
  moderationActionId: z.uuid(),
  reason: boundedText(10, 1000),
});

export const moderationAppealSchema = z.object({
  moderationActionId: z.uuid(),
  reason: boundedText(20, 2000),
});

export const moderationAppealReviewSchema = z.object({
  appealId: z.uuid(),
  decision: z.enum(["uphold", "reverse"]),
  reason: boundedText(10, 2000),
});

export const moderationPageSchema = z.coerce.number().int().min(1).max(500).catch(1);

export const reportStatusFilterSchema = z
  .enum(["open", "reviewing", "resolved", "dismissed"])
  .nullable()
  .catch(null);

export const appealStatusFilterSchema = z
  .enum(["open", "reviewing", "upheld", "modified", "reversed"])
  .nullable()
  .catch(null);

export type ModerationTargetType = (typeof moderationTargetTypes)[number];
export type ReportCategory = (typeof reportCategories)[number];
export type ModerationActionKind = (typeof moderationActionKinds)[number];
