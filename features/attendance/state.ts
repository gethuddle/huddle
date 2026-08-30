import type { ActionResult } from "@/lib/errors";

export type AttendanceActionState = ActionResult<Readonly<{ message: string }>>;

export type EventInvitationBatchActionState = ActionResult<
  Readonly<{
    message: string;
    invitedIds: readonly string[];
    rejectedIds: readonly string[];
  }>
>;
