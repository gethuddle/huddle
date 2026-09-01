import "server-only";

import { z } from "zod";

import { CURRENT_COMMUNITY_RULES_VERSION } from "@/content/community-rules";
import { actorGateCode, type ActorFacts } from "@/features/auth/actor";
import type { FriendshipBucket } from "@/features/friendships/schemas";
import { DomainError, domainErrorFromDatabase } from "@/lib/errors";
import { createClient } from "@/lib/supabase/server";

export const FRIENDSHIP_PAGE_SIZE = 20;

const friendshipListRowSchema = z
  .object({
    friendship_id: z.uuid(),
    status: z.enum(["pending", "accepted"]),
    direction: z.enum(["incoming", "outgoing", "accepted"]),
    other_handle: z.string(),
    other_display_name: z.string(),
    requested_at: z.string(),
    responded_at: z.string().nullable(),
    total_count: z.number().int().nonnegative(),
  })
  .strict();

export type FriendshipListItem = Readonly<{
  id: string;
  status: "pending" | "accepted";
  direction: "incoming" | "outgoing" | "accepted";
  handle: string;
  displayName: string;
  requestedAt: string;
  respondedAt: string | null;
}>;

export type FriendshipSettingsResult =
  | Readonly<{ state: "anonymous" }>
  | Readonly<{ state: "complete-profile" }>
  | Readonly<{ state: "not-permitted" }>
  | Readonly<{
      state: "eligible";
      items: readonly FriendshipListItem[];
      totalCount: number;
      pageCount: number;
    }>;

export async function getFriendshipSettings(
  bucket: FriendshipBucket,
  page: number,
): Promise<FriendshipSettingsResult> {
  const supabase = await createClient();
  const { data: authData } = await supabase.auth.getUser();
  const user = authData.user;
  if (user === null) return { state: "anonymous" };

  const profileResult = await supabase
    .from("profiles")
    .select(
      "handle, display_name, adult_attested_at, rules_version, rules_accepted_at, profile_completed_at, fan_enabled_at, suspended_at, suspension_expires_at, community_restricted_at, community_restricted_until",
    )
    .eq("id", user.id)
    .maybeSingle();

  if (profileResult.error !== null) {
    throw new DomainError("INTERNAL_ERROR", { cause: profileResult.error });
  }

  const profile = profileResult.data;
  if (profile === null) return { state: "complete-profile" };

  const facts: ActorFacts = {
    authenticated: true,
    emailVerified: user.email_confirmed_at !== undefined && user.email_confirmed_at !== null,
    profileExists: true,
    adultAttested: profile.adult_attested_at !== null,
    rulesCurrent:
      profile.rules_version === CURRENT_COMMUNITY_RULES_VERSION &&
      profile.rules_accepted_at !== null,
    profileComplete:
      profile.profile_completed_at !== null &&
      profile.handle !== null &&
      profile.display_name !== null,
    fanEnabled: profile.fan_enabled_at !== null,
    suspended: profile.suspended_at !== null,
    restricted:
      profile.community_restricted_at !== null && profile.community_restricted_at !== undefined,
  };
  const gate = actorGateCode(facts, "fan");
  if (gate !== null) {
    return {
      state:
        gate === "ACCOUNT_SUSPENDED" || gate === "ACCOUNT_RESTRICTED"
          ? "not-permitted"
          : "complete-profile",
    };
  }

  const { data, error } = await supabase.rpc("list_friendships", {
    input_bucket: bucket,
    input_offset: (page - 1) * FRIENDSHIP_PAGE_SIZE,
    input_limit: FRIENDSHIP_PAGE_SIZE,
  });
  if (error !== null) throw domainErrorFromDatabase(error);

  let rows;
  try {
    rows = z.array(friendshipListRowSchema).parse(data);
  } catch (cause) {
    throw new DomainError("INTERNAL_ERROR", { cause });
  }

  const totalCount = rows.at(0)?.total_count ?? 0;
  return {
    state: "eligible",
    totalCount,
    pageCount: Math.max(1, Math.ceil(totalCount / FRIENDSHIP_PAGE_SIZE)),
    items: rows.map((row) => ({
      id: row.friendship_id,
      status: row.status,
      direction: row.direction,
      handle: row.other_handle,
      displayName: row.other_display_name,
      requestedAt: row.requested_at,
      respondedAt: row.responded_at,
    })),
  };
}
