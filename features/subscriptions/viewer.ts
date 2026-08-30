import "server-only";

import { CURRENT_COMMUNITY_RULES_VERSION } from "@/content/community-rules";
import { actorGateCode, type ActorFacts } from "@/features/auth/actor";
import { DomainError } from "@/lib/errors";
import { createClient } from "@/lib/supabase/server";

import type { SubscriptionKind } from "./schemas";

export type InterestViewerState = "anonymous" | "eligible" | "complete-profile" | "not-permitted";

export type InterestViewer = Readonly<{
  state: InterestViewerState;
  followedKeys: readonly string[];
}>;

export function subscriptionKey(kind: SubscriptionKind, targetId: string): string {
  return `${kind}:${targetId}`;
}

export async function getInterestViewer(): Promise<InterestViewer> {
  const supabase = await createClient();
  const { data: authData } = await supabase.auth.getUser();
  const user = authData.user;
  if (user === null) return { state: "anonymous", followedKeys: [] };

  const profileResult = await supabase
    .from("profiles")
    .select(
      "handle, display_name, city_id, adult_attested_at, rules_version, rules_accepted_at, profile_completed_at, fan_enabled_at, suspended_at, suspension_expires_at, community_restricted_at, community_restricted_until",
    )
    .eq("id", user.id)
    .maybeSingle();

  if (profileResult.error !== null) {
    throw new DomainError("INTERNAL_ERROR", { cause: profileResult.error });
  }
  if (profileResult.data === null) {
    return { state: "complete-profile", followedKeys: [] };
  }

  const profile = profileResult.data;
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
      profile.display_name !== null &&
      profile.city_id !== null,
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
      followedKeys: [],
    };
  }

  const subscriptionResult = await supabase
    .from("subscriptions")
    .select("kind, sport_id, competition_id, team_id")
    .eq("user_id", user.id)
    .limit(500);

  if (subscriptionResult.error !== null) {
    throw new DomainError("INTERNAL_ERROR", { cause: subscriptionResult.error });
  }

  return {
    state: "eligible",
    followedKeys: subscriptionResult.data.flatMap((subscription) => {
      const targetId =
        subscription.kind === "sport"
          ? subscription.sport_id
          : subscription.kind === "competition"
            ? subscription.competition_id
            : subscription.team_id;
      return targetId === null ? [] : [subscriptionKey(subscription.kind, targetId)];
    }),
  };
}
