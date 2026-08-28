import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getRequestId: vi.fn(),
  requireActor: vi.fn(),
  revalidatePath: vi.fn(),
  safeLog: vi.fn(),
}));

vi.mock("@/features/auth/actor", () => ({ requireActor: mocks.requireActor }));
vi.mock("@/lib/request-id/server", () => ({ getRequestId: mocks.getRequestId }));
vi.mock("@/lib/observability/server", () => ({ safeLog: mocks.safeLog }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));

import {
  applyModerationAction,
  reviewModerationAppealAction,
  reverseModerationAction,
  submitModerationAppealAction,
  submitReportAction,
} from "./actions";
import { DomainError } from "@/lib/errors";

const targetId = "b1100000-0000-4000-8000-000000000101";
const requestId = "b1100000-0000-4000-8000-000000000999";

function reportForm(targetType: "profile" | "event") {
  const form = new FormData();
  form.set("targetType", targetType);
  form.set("targetId", targetType === "event" ? targetId : "");
  form.set("targetHandle", targetType === "profile" ? "fan_one" : "");
  form.set("category", "other");
  form.set("details", "A bounded factual account of what happened.");
  return form;
}

describe("moderation actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getRequestId.mockResolvedValue(requestId);
  });

  it("validates reports before actor or database access", async () => {
    const form = reportForm("event");
    form.set("details", "short");

    const result = await submitReportAction(null, form);

    expect(result).toMatchObject({ ok: false, error: { code: "VALIDATION_FAILED" } });
    expect(mocks.requireActor).not.toHaveBeenCalled();
  });

  it("uses the safe profile wrapper and leaves reporting available to safety actors", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: [{ report_id: targetId }], error: null });
    mocks.requireActor.mockResolvedValue({ supabase: { rpc } });

    const result = await submitReportAction(null, reportForm("profile"));

    expect(mocks.requireActor).toHaveBeenCalledWith("safety");
    expect(rpc).toHaveBeenCalledWith("submit_profile_report", {
      input_handle: "fan_one",
      input_category: "other",
      input_details: "A bounded factual account of what happened.",
      audit_request_id: requestId,
    });
    expect(result).toMatchObject({
      ok: true,
      data: { message: expect.stringContaining("confidential") },
    });
  });

  it("sends typed non-profile targets through the generic reporting RPC", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: [{ report_id: targetId }], error: null });
    mocks.requireActor.mockResolvedValue({ supabase: { rpc } });

    await submitReportAction(null, reportForm("event"));

    expect(rpc).toHaveBeenCalledWith("submit_report", {
      input_target_type: "event",
      input_target_id: targetId,
      input_category: "other",
      input_details: "A bounded factual account of what happened.",
      audit_request_id: requestId,
    });
  });

  it("logs a safe authorization signal when a report mutation is denied", async () => {
    mocks.requireActor.mockRejectedValue(
      new DomainError("NOT_ALLOWED", { cause: new Error("private raw failure") }),
    );

    const result = await submitReportAction(null, reportForm("event"));

    expect(result).toMatchObject({ ok: false, error: { code: "NOT_ALLOWED" } });
    expect(mocks.safeLog).toHaveBeenCalledWith("warn", "action.failed", {
      requestId,
      action: "moderation.report.submit",
      outcome: "denied",
      code: "NOT_ALLOWED",
    });
    expect(JSON.stringify(mocks.safeLog.mock.calls)).not.toContain("private raw failure");
  });

  it("requires a platform-eligible actor before applying enforcement", async () => {
    const rpc = vi
      .fn()
      .mockResolvedValue({ data: [{ moderation_action_id: targetId }], error: null });
    mocks.requireActor.mockResolvedValue({ supabase: { rpc } });
    const form = new FormData();
    form.set("reportId", targetId);
    form.set("action", "temporary_suspension");
    form.set("reason", "A proportionate and documented reason.");
    form.set("durationHours", "24");

    const result = await applyModerationAction(null, form);

    expect(mocks.requireActor).toHaveBeenCalledWith("community");
    expect(rpc).toHaveBeenCalledWith("apply_moderation_action", {
      input_report_id: targetId,
      input_action: "temporary_suspension",
      input_reason: "A proportionate and documented reason.",
      input_duration_hours: 24,
      audit_request_id: requestId,
    });
    expect(result.ok).toBe(true);
  });

  it("keeps appeal submission available to the affected safety actor", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: [{ appeal_id: targetId }], error: null });
    mocks.requireActor.mockResolvedValue({ supabase: { rpc } });
    const form = new FormData();
    form.set("moderationActionId", targetId);
    form.set("reason", "Please independently review this moderation decision.");

    const result = await submitModerationAppealAction(null, form);

    expect(mocks.requireActor).toHaveBeenCalledWith("safety");
    expect(result.ok).toBe(true);
  });

  it("sends a bounded direct reversal through the platform moderation gate", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: true, error: null });
    mocks.requireActor.mockResolvedValue({ supabase: { rpc } });
    const form = new FormData();
    form.set("moderationActionId", targetId);
    form.set("reason", "The review deadline has passed and access should be restored.");

    const result = await reverseModerationAction(null, form);

    expect(mocks.requireActor).toHaveBeenCalledWith("community");
    expect(rpc).toHaveBeenCalledWith("reverse_moderation_action", {
      input_action_id: targetId,
      input_reason: "The review deadline has passed and access should be restored.",
      audit_request_id: requestId,
    });
    expect(result.ok).toBe(true);
  });

  it("validates the moderator appeal outcome before database access", async () => {
    const form = new FormData();
    form.set("appealId", targetId);
    form.set("decision", "delete");
    form.set("reason", "A review outcome with enough context.");

    const result = await reviewModerationAppealAction(null, form);

    expect(result).toMatchObject({ ok: false, error: { code: "VALIDATION_FAILED" } });
    expect(mocks.requireActor).not.toHaveBeenCalled();
  });
});
