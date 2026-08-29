import "server-only";

import { z } from "zod";

import { requireActor } from "@/features/auth/actor";
import { DomainError, domainErrorFromDatabase } from "@/lib/errors";
import { createClient } from "@/lib/supabase/server";

const myGroupRowSchema = z
  .object({
    group_id: z.uuid(),
    slug: z.string(),
    name: z.string(),
    description: z.string().nullable(),
    visibility: z.enum(["discoverable", "unlisted"]),
    lifecycle: z.enum(["forming", "active", "suspended", "archived"]),
    city_name: z.string(),
    team_name: z.string().nullable(),
    member_role: z.enum(["owner", "admin", "member"]),
    membership_status: z.enum(["pending", "active", "rejected", "left", "banned"]),
    active_member_count: z.number().int().nonnegative(),
    can_manage: z.boolean(),
    total_count: z.number().int().nonnegative(),
  })
  .strict();

const myEventRowSchema = z
  .object({
    event_id: z.uuid(),
    title: z.string(),
    home_team_name: z.string(),
    away_team_name: z.string(),
    competition_name: z.string(),
    starts_at: z.string(),
    city_name: z.string(),
    place_kind: z.enum(["home", "venue", "public_place"]),
    audience: z.enum(["public", "team_followers", "group", "friends", "invite_only"]),
    status: z.enum(["draft", "pending_group_review", "published", "cancelled", "completed"]),
    involvement: z.enum(["hosting", "submitted", "invited", "requested", "attending", "history"]),
    invitation_status: z.enum(["pending", "accepted", "declined", "revoked"]).nullable(),
    attendance_status: z.enum(["requested", "approved", "declined", "left", "removed"]).nullable(),
    can_manage: z.boolean(),
    total_count: z.number().int().nonnegative(),
  })
  .strict();

export type MyGroup = z.infer<typeof myGroupRowSchema>;
export type MyHuddleEvent = z.infer<typeof myEventRowSchema>;

function parseRows<T>(schema: z.ZodType<T>, value: unknown): T[] {
  try {
    return z.array(schema).parse(value);
  } catch (cause) {
    throw new DomainError("INTERNAL_ERROR", { cause });
  }
}

export async function getMyHuddleOverview(
  pages: Readonly<{ eventPage?: number; groupPage?: number }> = {},
): Promise<
  Readonly<{
    events: readonly MyHuddleEvent[];
    groups: readonly MyGroup[];
  }>
> {
  const { supabase } = await requireActor("community");
  const eventPage = Math.max(pages.eventPage ?? 1, 1);
  const groupPage = Math.max(pages.groupPage ?? 1, 1);
  const [eventResult, groupResult] = await Promise.all([
    supabase.rpc("list_my_huddle_events", {
      input_limit: 20,
      input_offset: (eventPage - 1) * 20,
    }),
    supabase.rpc("list_my_groups", {
      input_limit: 20,
      input_offset: (groupPage - 1) * 20,
    }),
  ]);

  if (eventResult.error !== null) throw domainErrorFromDatabase(eventResult.error);
  if (groupResult.error !== null) throw domainErrorFromDatabase(groupResult.error);

  return {
    events: parseRows(myEventRowSchema, eventResult.data),
    groups: parseRows(myGroupRowSchema, groupResult.data),
  };
}

export async function listMyGroupsForViewer(limit = 6): Promise<readonly MyGroup[]> {
  const supabase = await createClient();
  const { data: authData } = await supabase.auth.getUser();
  if (authData.user === null) return [];

  const profileResult = await supabase
    .from("profiles")
    .select("profile_completed_at")
    .eq("id", authData.user.id)
    .maybeSingle();
  if (profileResult.error !== null) {
    throw new DomainError("INTERNAL_ERROR", { cause: profileResult.error });
  }
  if (profileResult.data?.profile_completed_at === null || profileResult.data === null) return [];

  const result = await supabase.rpc("list_my_groups", {
    input_limit: Math.min(Math.max(limit, 1), 20),
    input_offset: 0,
  });
  if (result.error !== null) {
    const error = domainErrorFromDatabase(result.error);
    if (error.code !== "INTERNAL_ERROR") return [];
    throw error;
  }
  return parseRows(myGroupRowSchema, result.data);
}
