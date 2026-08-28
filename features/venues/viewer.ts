import "server-only";

import { CURRENT_COMMUNITY_RULES_VERSION } from "@/content/community-rules";
import { actorGateCode, type ActorFacts } from "@/features/auth/actor";
import { DomainError } from "@/lib/errors";
import { createClient } from "@/lib/supabase/server";

export type VenueCreationViewerState =
  "anonymous" | "eligible" | "complete-profile" | "not-permitted";

export async function getVenueCreationViewerState(): Promise<VenueCreationViewerState> {
  const supabase = await createClient();
  const { data: authData } = await supabase.auth.getUser();
  const user = authData.user;
  if (user === null) return "anonymous";

  const profileResult = await supabase
    .from("profiles")
    .select(
      "handle, display_name, city_id, adult_attested_at, rules_version, rules_accepted_at, profile_completed_at, suspended_at, suspension_expires_at, community_restricted_at, community_restricted_until",
    )
    .eq("id", user.id)
    .maybeSingle();
  if (profileResult.error !== null) {
    throw new DomainError("INTERNAL_ERROR", { cause: profileResult.error });
  }
  const profile = profileResult.data;
  if (profile === null) return "complete-profile";

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
    suspended: profile.suspended_at !== null,
    restricted:
      profile.community_restricted_at !== null && profile.community_restricted_at !== undefined,
  };
  const gate = actorGateCode(facts, "community");
  if (gate === null) return "eligible";
  return gate === "ACCOUNT_SUSPENDED" || gate === "ACCOUNT_RESTRICTED"
    ? "not-permitted"
    : "complete-profile";
}
