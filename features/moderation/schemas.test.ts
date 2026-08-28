import { describe, expect, it } from "vitest";

import {
  moderationActionSchema,
  moderationAppealReviewSchema,
  moderationAppealSchema,
  moderationTargetTypes,
  reportCategories,
  reportSubmissionSchema,
} from "./schemas";

const targetId = "b1100000-0000-4000-8000-000000000101";

describe("moderation schemas", () => {
  it.each(reportCategories)("accepts the locked %s report category", (category) => {
    expect(
      reportSubmissionSchema.safeParse({
        targetType: "event",
        targetId,
        targetHandle: "",
        category,
        details: "A bounded factual account of what happened.",
      }).success,
    ).toBe(true);
  });

  it.each(moderationTargetTypes)("requires a valid identifier for a %s target", (targetType) => {
    const result = reportSubmissionSchema.safeParse({
      targetType,
      targetId: targetType === "profile" ? "" : targetId,
      targetHandle: targetType === "profile" ? "fan_one" : "",
      category: "other",
      details: "A bounded factual account of what happened.",
    });

    expect(result.success).toBe(true);
  });

  it("rejects short report details and malformed targets", () => {
    expect(
      reportSubmissionSchema.safeParse({
        targetType: "event",
        targetId: "not-a-uuid",
        targetHandle: "",
        category: "other",
        details: "short",
      }).success,
    ).toBe(false);
  });

  it("rejects crafted forms that supply more than one target representation", () => {
    expect(
      reportSubmissionSchema.safeParse({
        targetType: "profile",
        targetId,
        targetHandle: "fan_one",
        category: "other",
        details: "A bounded factual account of what happened.",
      }).success,
    ).toBe(false);
    expect(
      reportSubmissionSchema.safeParse({
        targetType: "event",
        targetId,
        targetHandle: "fan_one",
        category: "other",
        details: "A bounded factual account of what happened.",
      }).success,
    ).toBe(false);
  });

  it("requires a bounded duration only for timed enforcement", () => {
    expect(
      moderationActionSchema.safeParse({
        reportId: targetId,
        action: "temporary_suspension",
        reason: "A proportionate and documented reason.",
        durationHours: "24",
      }).success,
    ).toBe(true);
    expect(
      moderationActionSchema.safeParse({
        reportId: targetId,
        action: "temporary_suspension",
        reason: "A proportionate and documented reason.",
        durationHours: "",
      }).success,
    ).toBe(false);
    expect(
      moderationActionSchema.safeParse({
        reportId: targetId,
        action: "warning",
        reason: "A proportionate and documented reason.",
        durationHours: "24",
      }).success,
    ).toBe(false);
  });

  it("bounds appeal reasons and review decisions", () => {
    expect(
      moderationAppealSchema.safeParse({
        moderationActionId: targetId,
        reason: "Please independently review this moderation decision.",
      }).success,
    ).toBe(true);
    expect(
      moderationAppealReviewSchema.safeParse({
        appealId: targetId,
        decision: "delete",
        reason: "A review outcome with enough context.",
      }).success,
    ).toBe(false);
  });
});
