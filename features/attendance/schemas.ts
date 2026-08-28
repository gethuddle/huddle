import { z } from "zod";

import { profileHandleSchema } from "@/features/profiles/schemas";

const eventId = z.uuid("Choose a valid event.");
const invitationId = z.uuid("Choose a valid invitation.");
const attendanceId = z.uuid("Choose a valid attendance record.");

export const eventParticipationSchema = z.object({ eventId });

export const invitationCreationSchema = z.object({
  eventId,
  inviteeHandle: profileHandleSchema,
});

export const invitationResponseSchema = z.object({
  eventId,
  invitationId,
  decision: z.enum(["accept", "decline"]),
});

export const invitationRevocationSchema = z.object({ eventId, invitationId });

export const attendanceReviewSchema = z.object({
  eventId,
  attendanceId,
  decision: z.enum(["approve", "decline"]),
});

export const attendanceLeaveSchema = z.object({ eventId, attendanceId });

export const attendeeRemovalSchema = z.object({
  eventId,
  attendanceId,
  reason: z.string().trim().max(500, "Use 500 characters or fewer."),
});

export const eventCancellationSchema = z.object({
  eventId,
  reason: z
    .string()
    .trim()
    .min(3, "Explain the cancellation in at least 3 characters.")
    .max(500, "Use 500 characters or fewer."),
});

export const eventPageSchema = z.coerce.number().int().min(1).catch(1);
