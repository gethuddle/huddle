"use server";

import { revalidatePath } from "next/cache";

import { requireActor } from "@/features/auth/actor";
import {
  moderationActionSchema,
  moderationAppealReviewSchema,
  moderationAppealSchema,
  moderationReversalSchema,
  reportAssignmentSchema,
  reportDismissalSchema,
  reportSubmissionSchema,
} from "@/features/moderation/schemas";
import type { ModerationActionState } from "@/features/moderation/state";
import { actionFailure, actionSuccess, domainErrorFromDatabase, toActionError } from "@/lib/errors";
import { safeLog } from "@/lib/observability/server";
import { getRequestId } from "@/lib/request-id/server";

function field(formData: FormData, name: string) {
  return formData.get(name);
}

function refreshModerationViews() {
  revalidatePath("/reports");
  revalidatePath("/moderation");
  revalidatePath("/discover");
  revalidatePath("/groups");
  revalidatePath("/venues");
  revalidatePath("/events");
}

async function context(requirement: "community" | "safety") {
  return Promise.all([requireActor(requirement), getRequestId()]);
}

async function loggedActionFailure(action: string, error: unknown): Promise<ModerationActionState> {
  const safeError = toActionError(error);
  let requestId: string | undefined;
  try {
    requestId = await getRequestId();
  } catch {
    // Logging must never replace the original safe action result.
  }
  safeLog(safeError.code === "INTERNAL_ERROR" ? "error" : "warn", "action.failed", {
    requestId,
    action,
    outcome: safeError.code === "INTERNAL_ERROR" ? "failed" : "denied",
    code: safeError.code,
  });
  return { ok: false, error: safeError };
}

export async function submitReportAction(
  _previous: ModerationActionState | null,
  formData: FormData,
): Promise<ModerationActionState> {
  const parsed = reportSubmissionSchema.safeParse({
    targetType: field(formData, "targetType"),
    targetId: field(formData, "targetId"),
    targetHandle: field(formData, "targetHandle"),
    category: field(formData, "category"),
    details: field(formData, "details"),
  });
  if (!parsed.success) return actionFailure(parsed.error);

  try {
    const [{ supabase }, requestId] = await context("safety");
    const { error } =
      parsed.data.targetType === "profile"
        ? await supabase.rpc("submit_profile_report", {
            input_handle: parsed.data.targetHandle,
            input_category: parsed.data.category,
            input_details: parsed.data.details,
            audit_request_id: requestId,
          })
        : await supabase.rpc("submit_report", {
            input_target_type: parsed.data.targetType,
            input_target_id: parsed.data.targetId,
            input_category: parsed.data.category,
            input_details: parsed.data.details,
            audit_request_id: requestId,
          });
    if (error !== null) throw domainErrorFromDatabase(error);
    revalidatePath("/reports");
    return actionSuccess({ message: "Report received. Its details remain confidential." });
  } catch (error) {
    return loggedActionFailure("moderation.report.submit", error);
  }
}

export async function assignReportAction(
  _previous: ModerationActionState | null,
  formData: FormData,
): Promise<ModerationActionState> {
  const parsed = reportAssignmentSchema.safeParse({ reportId: field(formData, "reportId") });
  if (!parsed.success) return actionFailure(parsed.error);
  try {
    const [{ supabase }, requestId] = await context("community");
    const { error } = await supabase.rpc("assign_report", {
      input_report_id: parsed.data.reportId,
      audit_request_id: requestId,
    });
    if (error !== null) throw domainErrorFromDatabase(error);
    refreshModerationViews();
    return actionSuccess({ message: "Report assigned to you." });
  } catch (error) {
    return loggedActionFailure("moderation.report.assign", error);
  }
}

export async function dismissReportAction(
  _previous: ModerationActionState | null,
  formData: FormData,
): Promise<ModerationActionState> {
  const parsed = reportDismissalSchema.safeParse({
    reportId: field(formData, "reportId"),
    reason: field(formData, "reason"),
  });
  if (!parsed.success) return actionFailure(parsed.error);
  try {
    const [{ supabase }, requestId] = await context("community");
    const { error } = await supabase.rpc("dismiss_report", {
      input_report_id: parsed.data.reportId,
      input_reason: parsed.data.reason,
      audit_request_id: requestId,
    });
    if (error !== null) throw domainErrorFromDatabase(error);
    refreshModerationViews();
    return actionSuccess({ message: "Report closed without enforcement." });
  } catch (error) {
    return loggedActionFailure("moderation.report.dismiss", error);
  }
}

export async function applyModerationAction(
  _previous: ModerationActionState | null,
  formData: FormData,
): Promise<ModerationActionState> {
  const parsed = moderationActionSchema.safeParse({
    reportId: field(formData, "reportId"),
    action: field(formData, "action"),
    reason: field(formData, "reason"),
    durationHours: field(formData, "durationHours"),
  });
  if (!parsed.success) return actionFailure(parsed.error);
  try {
    const [{ supabase }, requestId] = await context("community");
    const { error } = await supabase.rpc("apply_moderation_action", {
      input_report_id: parsed.data.reportId,
      input_action: parsed.data.action,
      input_reason: parsed.data.reason,
      input_duration_hours: parsed.data.durationHours,
      audit_request_id: requestId,
    });
    if (error !== null) throw domainErrorFromDatabase(error);
    refreshModerationViews();
    return actionSuccess({ message: "Moderation action applied and audited." });
  } catch (error) {
    return loggedActionFailure("moderation.action.apply", error);
  }
}

export async function reverseModerationAction(
  _previous: ModerationActionState | null,
  formData: FormData,
): Promise<ModerationActionState> {
  const parsed = moderationReversalSchema.safeParse({
    moderationActionId: field(formData, "moderationActionId"),
    reason: field(formData, "reason"),
  });
  if (!parsed.success) return actionFailure(parsed.error);
  try {
    const [{ supabase }, requestId] = await context("community");
    const { error } = await supabase.rpc("reverse_moderation_action", {
      input_action_id: parsed.data.moderationActionId,
      input_reason: parsed.data.reason,
      audit_request_id: requestId,
    });
    if (error !== null) throw domainErrorFromDatabase(error);
    refreshModerationViews();
    return actionSuccess({ message: "Action reversed with audit evidence." });
  } catch (error) {
    return loggedActionFailure("moderation.action.reverse", error);
  }
}

export async function submitModerationAppealAction(
  _previous: ModerationActionState | null,
  formData: FormData,
): Promise<ModerationActionState> {
  const parsed = moderationAppealSchema.safeParse({
    moderationActionId: field(formData, "moderationActionId"),
    reason: field(formData, "reason"),
  });
  if (!parsed.success) return actionFailure(parsed.error);
  try {
    const [{ supabase }, requestId] = await context("safety");
    const { error } = await supabase.rpc("submit_moderation_appeal", {
      input_action_id: parsed.data.moderationActionId,
      input_reason: parsed.data.reason,
      audit_request_id: requestId,
    });
    if (error !== null) throw domainErrorFromDatabase(error);
    revalidatePath("/reports");
    revalidatePath("/moderation");
    return actionSuccess({ message: "Appeal received for platform review." });
  } catch (error) {
    return loggedActionFailure("moderation.appeal.submit", error);
  }
}

export async function reviewModerationAppealAction(
  _previous: ModerationActionState | null,
  formData: FormData,
): Promise<ModerationActionState> {
  const parsed = moderationAppealReviewSchema.safeParse({
    appealId: field(formData, "appealId"),
    decision: field(formData, "decision"),
    reason: field(formData, "reason"),
  });
  if (!parsed.success) return actionFailure(parsed.error);
  try {
    const [{ supabase }, requestId] = await context("community");
    const { error } = await supabase.rpc("review_moderation_appeal", {
      input_appeal_id: parsed.data.appealId,
      input_decision: parsed.data.decision,
      input_outcome_reason: parsed.data.reason,
      audit_request_id: requestId,
    });
    if (error !== null) throw domainErrorFromDatabase(error);
    refreshModerationViews();
    return actionSuccess({ message: "Appeal outcome recorded." });
  } catch (error) {
    return loggedActionFailure("moderation.appeal.review", error);
  }
}
