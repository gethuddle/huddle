import { z } from "zod";

import { profileHandleSchema } from "@/features/profiles/schemas";
import { boundedPageSchema } from "@/lib/pagination";

const eventId = z.uuid("Choose a valid event.");
const invitationId = z.uuid("Choose a valid invitation.");
const attendanceId = z.uuid("Choose a valid attendance record.");
const inviteTokenId = z.uuid("Choose a valid invite link.");

export const eventParticipationSchema = z.object({ eventId });

export const invitationCreationSchema = z.object({
  eventId,
  inviteeHandle: profileHandleSchema,
});

export const invitationBatchSchema = z
  .object({
    eventId,
    inviteeIds: z.array(z.uuid()).min(1).max(50),
  })
  .strict()
  .refine((value) => new Set(value.inviteeIds).size === value.inviteeIds.length, {
    path: ["inviteeIds"],
    message: "Choose each person once.",
  });

export const invitationResponseSchema = z.object({
  eventId,
  invitationId,
  decision: z.enum(["accept", "decline"]),
});

export const invitationRevocationSchema = z.object({ eventId, invitationId });

export const eventInviteLinkCreationSchema = z.object({
  eventId,
  durationDays: z.coerce.number().int().min(1).max(30),
  maxUses: z.coerce.number().int().min(1).max(100),
});

export const eventInviteLinkRevocationSchema = z.object({ eventId, inviteTokenId });

export const eventInviteLinkRedemptionSchema = z.object({
  token: z.string().regex(/^[A-Za-z0-9_-]{43}$/u, "Use a valid event invitation link."),
});

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

export const eventPageSchema = boundedPageSchema;
