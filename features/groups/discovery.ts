import "server-only";

import { z } from "zod";

import { DomainError, domainErrorFromDatabase } from "@/lib/errors";
import { createClient } from "@/lib/supabase/server";

const groupDiscoveryProgressRowSchema = z
  .object({
    active_member_count: z.number().int().nonnegative(),
    active_moderator_count: z.number().int().nonnegative(),
    owner_is_active: z.boolean(),
    has_description: z.boolean(),
    has_published_rule: z.boolean(),
    has_future_event: z.boolean(),
    gate_satisfied: z.boolean(),
    lifecycle: z.enum(["forming", "active", "suspended", "archived"]),
  })
  .strict();

export type GroupDiscoveryProgress = Readonly<{
  activeMemberCount: number;
  activeModeratorCount: number;
  ownerIsActive: boolean;
  hasDescription: boolean;
  hasPublishedRule: boolean;
  hasFutureEvent: boolean;
  gateSatisfied: boolean;
  lifecycle: "forming" | "active" | "suspended" | "archived";
}>;

export async function getGroupDiscoveryProgress(groupId: string): Promise<GroupDiscoveryProgress> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("evaluate_group_discoverability", {
    input_group_id: groupId,
  });
  if (error !== null) throw domainErrorFromDatabase(error);

  const row = data.at(0);
  if (row === undefined) throw new DomainError("INTERNAL_ERROR");

  let parsed: z.infer<typeof groupDiscoveryProgressRowSchema>;
  try {
    parsed = groupDiscoveryProgressRowSchema.parse(row);
  } catch (cause) {
    throw new DomainError("INTERNAL_ERROR", { cause });
  }

  return {
    activeMemberCount: parsed.active_member_count,
    activeModeratorCount: parsed.active_moderator_count,
    ownerIsActive: parsed.owner_is_active,
    hasDescription: parsed.has_description,
    hasPublishedRule: parsed.has_published_rule,
    hasFutureEvent: parsed.has_future_event,
    gateSatisfied: parsed.gate_satisfied,
    lifecycle: parsed.lifecycle,
  };
}
