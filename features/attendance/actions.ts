"use server";

import { revalidatePath } from "next/cache";

import {
  attendanceLeaveSchema,
  attendanceReviewSchema,
  attendeeRemovalSchema,
  eventCancellationSchema,
  eventParticipationSchema,
  invitationCreationSchema,
  invitationResponseSchema,
  invitationRevocationSchema,
} from "@/features/attendance/schemas";
import type { AttendanceActionState } from "@/features/attendance/state";
import { requireActor } from "@/features/auth/actor";
import { actionFailure, actionSuccess, domainErrorFromDatabase } from "@/lib/errors";
import { getRequestId } from "@/lib/request-id/server";

function field(formData: FormData, name: string): FormDataEntryValue | null {
  return formData.get(name);
}

function refreshEvent(eventId: string) {
  revalidatePath("/events");
  revalidatePath(`/events/${eventId}`);
  revalidatePath(`/events/${eventId}/manage`);
  revalidatePath("/discover");
}

async function mutationContext(requirement: "community" | "onboarding" = "community") {
  return Promise.all([requireActor(requirement), getRequestId()]);
}

export async function requestOrJoinEventAction(formData: FormData): Promise<AttendanceActionState> {
  const parsed = eventParticipationSchema.safeParse({ eventId: field(formData, "eventId") });
  if (!parsed.success) return actionFailure(parsed.error);

  try {
    const [{ supabase }, requestId] = await mutationContext();
    const { data, error } = await supabase.rpc("request_or_join_event", {
      input_event_id: parsed.data.eventId,
      audit_request_id: requestId,
    });
    if (error !== null) throw domainErrorFromDatabase(error);
    const status = data.at(0)?.status;
    refreshEvent(parsed.data.eventId);
    return actionSuccess({
      message:
        status === "approved"
          ? "Your place is confirmed."
          : "Your request was sent to the event host.",
    });
  } catch (error) {
    return actionFailure(error);
  }
}

export async function respondToEventInvitationAction(
  formData: FormData,
): Promise<AttendanceActionState> {
  const parsed = invitationResponseSchema.safeParse({
    eventId: field(formData, "eventId"),
    invitationId: field(formData, "invitationId"),
    decision: field(formData, "decision"),
  });
  if (!parsed.success) return actionFailure(parsed.error);

  try {
    const [{ supabase }, requestId] = await mutationContext();
    const { error } = await supabase.rpc("respond_to_event_invitation", {
      input_invitation_id: parsed.data.invitationId,
      input_decision: parsed.data.decision,
      audit_request_id: requestId,
    });
    if (error !== null) throw domainErrorFromDatabase(error);
    refreshEvent(parsed.data.eventId);
    return actionSuccess({
      message:
        parsed.data.decision === "accept"
          ? "Invitation accepted and your place is confirmed."
          : "Invitation declined.",
    });
  } catch (error) {
    return actionFailure(error);
  }
}

export async function leaveEventAction(formData: FormData): Promise<AttendanceActionState> {
  const parsed = attendanceLeaveSchema.safeParse({
    eventId: field(formData, "eventId"),
    attendanceId: field(formData, "attendanceId"),
  });
  if (!parsed.success) return actionFailure(parsed.error);

  try {
    const [{ supabase }, requestId] = await mutationContext("onboarding");
    const { error } = await supabase.rpc("leave_event", {
      input_attendance_id: parsed.data.attendanceId,
      audit_request_id: requestId,
    });
    if (error !== null) throw domainErrorFromDatabase(error);
    refreshEvent(parsed.data.eventId);
    return actionSuccess({
      message: "You left the event. Your attendance history was retained.",
    });
  } catch (error) {
    return actionFailure(error);
  }
}

export async function createEventInvitationAction(
  formData: FormData,
): Promise<AttendanceActionState> {
  const parsed = invitationCreationSchema.safeParse({
    eventId: field(formData, "eventId"),
    inviteeHandle: field(formData, "inviteeHandle"),
  });
  if (!parsed.success) return actionFailure(parsed.error);

  try {
    const [{ supabase }, requestId] = await mutationContext();
    const { error } = await supabase.rpc("create_event_invitation", {
      input_event_id: parsed.data.eventId,
      input_invitee_handle: parsed.data.inviteeHandle,
      audit_request_id: requestId,
    });
    if (error !== null) throw domainErrorFromDatabase(error);
    refreshEvent(parsed.data.eventId);
    return actionSuccess({ message: `Invitation sent to @${parsed.data.inviteeHandle}.` });
  } catch (error) {
    return actionFailure(error);
  }
}

export async function revokeEventInvitationAction(
  formData: FormData,
): Promise<AttendanceActionState> {
  const parsed = invitationRevocationSchema.safeParse({
    eventId: field(formData, "eventId"),
    invitationId: field(formData, "invitationId"),
  });
  if (!parsed.success) return actionFailure(parsed.error);

  try {
    const [{ supabase }, requestId] = await mutationContext();
    const { error } = await supabase.rpc("revoke_event_invitation", {
      input_invitation_id: parsed.data.invitationId,
      audit_request_id: requestId,
    });
    if (error !== null) throw domainErrorFromDatabase(error);
    refreshEvent(parsed.data.eventId);
    return actionSuccess({ message: "Pending invitation revoked." });
  } catch (error) {
    return actionFailure(error);
  }
}

export async function reviewAttendanceAction(formData: FormData): Promise<AttendanceActionState> {
  const parsed = attendanceReviewSchema.safeParse({
    eventId: field(formData, "eventId"),
    attendanceId: field(formData, "attendanceId"),
    decision: field(formData, "decision"),
  });
  if (!parsed.success) return actionFailure(parsed.error);

  try {
    const [{ supabase }, requestId] = await mutationContext();
    const { error } = await supabase.rpc("review_attendance", {
      input_attendance_id: parsed.data.attendanceId,
      input_decision: parsed.data.decision,
      audit_request_id: requestId,
    });
    if (error !== null) throw domainErrorFromDatabase(error);
    refreshEvent(parsed.data.eventId);
    return actionSuccess({
      message: parsed.data.decision === "approve" ? "Request approved." : "Request declined.",
    });
  } catch (error) {
    return actionFailure(error);
  }
}

export async function removeAttendeeAction(formData: FormData): Promise<AttendanceActionState> {
  const parsed = attendeeRemovalSchema.safeParse({
    eventId: field(formData, "eventId"),
    attendanceId: field(formData, "attendanceId"),
    reason: field(formData, "reason"),
  });
  if (!parsed.success) return actionFailure(parsed.error);

  try {
    const [{ supabase }, requestId] = await mutationContext();
    const { error } = await supabase.rpc("remove_attendee", {
      input_attendance_id: parsed.data.attendanceId,
      input_reason: parsed.data.reason,
      audit_request_id: requestId,
    });
    if (error !== null) throw domainErrorFromDatabase(error);
    refreshEvent(parsed.data.eventId);
    return actionSuccess({ message: "Attendee removed. Their history was retained." });
  } catch (error) {
    return actionFailure(error);
  }
}

export async function cancelEventAction(formData: FormData): Promise<AttendanceActionState> {
  const parsed = eventCancellationSchema.safeParse({
    eventId: field(formData, "eventId"),
    reason: field(formData, "reason"),
  });
  if (!parsed.success) return actionFailure(parsed.error);

  try {
    const [{ supabase }, requestId] = await mutationContext();
    const { error } = await supabase.rpc("cancel_event", {
      input_event_id: parsed.data.eventId,
      input_reason: parsed.data.reason,
      audit_request_id: requestId,
    });
    if (error !== null) throw domainErrorFromDatabase(error);
    refreshEvent(parsed.data.eventId);
    return actionSuccess({ message: "Event cancelled. Participation history was retained." });
  } catch (error) {
    return actionFailure(error);
  }
}
