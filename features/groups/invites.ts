import "server-only";

import { z } from "zod";

import { requireActor } from "@/features/auth/actor";
import { groupInviteTokenSchema } from "@/features/groups/schemas";
import { DomainError, domainErrorFromDatabase } from "@/lib/errors";

const invitePreviewRowSchema = z
  .object({
    group_id: z.uuid(),
    slug: z.string(),
    name: z.string(),
    viewer_membership_status: z
      .enum(["pending", "active", "rejected", "left", "banned"])
      .nullable(),
  })
  .strict();

export type GroupInvitePreviewResult =
  | Readonly<{ state: "anonymous" }>
  | Readonly<{ state: "complete-profile" }>
  | Readonly<{ state: "not-permitted" }>
  | Readonly<{ state: "unavailable" }>
  | Readonly<{
      state: "available";
      group: Readonly<{ id: string; slug: string; name: string }>;
      membershipStatus: "pending" | "active" | "rejected" | "left" | "banned" | null;
    }>;

const PROFILE_GATES = new Set([
  "EMAIL_NOT_VERIFIED",
  "ADULT_ATTESTATION_REQUIRED",
  "RULES_ACCEPTANCE_REQUIRED",
  "PROFILE_INCOMPLETE",
]);
const HIDDEN_INVITE_ERRORS = new Set([
  "NOT_FOUND",
  "NOT_ALLOWED",
  "BLOCKED_RELATIONSHIP",
  "GROUP_BANNED",
  "INVITE_INVALID",
  "INVITE_EXPIRED",
]);

export async function getGroupInvitePreview(token: string): Promise<GroupInvitePreviewResult> {
  const parsedToken = groupInviteTokenSchema.safeParse(token);
  if (!parsedToken.success) return { state: "unavailable" };

  try {
    const { supabase } = await requireActor("fan");
    const { data, error } = await supabase.rpc("get_group_invite_preview", {
      input_token: parsedToken.data,
    });
    if (error !== null) throw domainErrorFromDatabase(error);

    const raw = data.at(0);
    if (raw === undefined) return { state: "unavailable" };
    const row = invitePreviewRowSchema.parse(raw);
    return {
      state: "available",
      group: { id: row.group_id, slug: row.slug, name: row.name },
      membershipStatus: row.viewer_membership_status,
    };
  } catch (error) {
    if (error instanceof z.ZodError) {
      throw new DomainError("INTERNAL_ERROR", { cause: error });
    }
    if (!(error instanceof DomainError)) throw error;
    if (error.code === "AUTH_REQUIRED") return { state: "anonymous" };
    if (error.code === "ACCOUNT_SUSPENDED") return { state: "not-permitted" };
    if (PROFILE_GATES.has(error.code)) return { state: "complete-profile" };
    if (HIDDEN_INVITE_ERRORS.has(error.code)) return { state: "unavailable" };
    throw error;
  }
}
