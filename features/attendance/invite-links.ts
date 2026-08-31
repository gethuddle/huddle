import "server-only";

import { z } from "zod";

import { requireActor } from "@/features/auth/actor";
import { eventInviteLinkRedemptionSchema } from "@/features/attendance/schemas";
import { DomainError } from "@/lib/errors";

export type EventInviteEntryState =
  | Readonly<{ state: "anonymous"; token: string }>
  | Readonly<{ state: "complete-profile" }>
  | Readonly<{ state: "not-permitted" }>
  | Readonly<{ state: "unavailable" }>
  | Readonly<{ state: "ready"; token: string }>;

const PROFILE_GATES = new Set([
  "EMAIL_NOT_VERIFIED",
  "ADULT_ATTESTATION_REQUIRED",
  "RULES_ACCEPTANCE_REQUIRED",
  "PROFILE_INCOMPLETE",
]);

export async function getEventInviteEntryState(token: string): Promise<EventInviteEntryState> {
  const parsed = eventInviteLinkRedemptionSchema.safeParse({ token });
  if (!parsed.success) return { state: "unavailable" };

  try {
    await requireActor("fan");
    return { state: "ready", token: parsed.data.token };
  } catch (error) {
    if (error instanceof z.ZodError) throw new DomainError("INTERNAL_ERROR", { cause: error });
    if (!(error instanceof DomainError)) throw error;
    if (error.code === "AUTH_REQUIRED") return { state: "anonymous", token: parsed.data.token };
    if (error.code === "ACCOUNT_SUSPENDED" || error.code === "ACCOUNT_RESTRICTED") {
      return { state: "not-permitted" };
    }
    if (PROFILE_GATES.has(error.code)) return { state: "complete-profile" };
    throw error;
  }
}
