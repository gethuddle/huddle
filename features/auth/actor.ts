import "server-only";

import { CURRENT_COMMUNITY_RULES_VERSION } from "@/content/community-rules";
import { DomainError, type DomainErrorCode } from "@/lib/errors";
import { createClient } from "@/lib/supabase/server";
import type { Tables } from "@/types/database.generated";

export type ActorRequirement = "onboarding" | "community" | "safety";

export type ActorFacts = Readonly<{
  authenticated: boolean;
  emailVerified: boolean;
  profileExists: boolean;
  adultAttested: boolean;
  rulesCurrent: boolean;
  profileComplete: boolean;
  suspended: boolean;
  restricted: boolean;
}>;

export function actorGateCode(
  facts: ActorFacts,
  requirement: ActorRequirement,
): DomainErrorCode | null {
  if (!facts.authenticated) return "AUTH_REQUIRED";
  if (!facts.emailVerified) return "EMAIL_NOT_VERIFIED";
  if (!facts.profileExists) return "PROFILE_INCOMPLETE";
  if (requirement === "safety") return null;
  if (facts.suspended) return "ACCOUNT_SUSPENDED";

  if (requirement === "community") {
    if (!facts.adultAttested) return "ADULT_ATTESTATION_REQUIRED";
    if (!facts.rulesCurrent) return "RULES_ACCEPTANCE_REQUIRED";
    if (!facts.profileComplete) return "PROFILE_INCOMPLETE";
  }

  if (requirement === "community" && facts.restricted) return "ACCOUNT_RESTRICTED";

  return null;
}

type ActorProfile = Pick<
  Tables<"profiles">,
  | "id"
  | "handle"
  | "display_name"
  | "city_id"
  | "adult_attested_at"
  | "rules_version"
  | "rules_accepted_at"
  | "profile_completed_at"
  | "suspended_at"
  | "suspension_expires_at"
  | "community_restricted_at"
  | "community_restricted_until"
>;

type ServerClient = Awaited<ReturnType<typeof createClient>>;
type ServerClientFactory = () => Promise<ServerClient>;

export type ActorContext = Readonly<{
  supabase: ServerClient;
  user: NonNullable<Awaited<ReturnType<ServerClient["auth"]["getUser"]>>["data"]["user"]>;
  profile: ActorProfile;
}>;

export async function requireActor(
  requirement: ActorRequirement,
  clientFactory: ServerClientFactory = createClient,
): Promise<ActorContext> {
  const supabase = await clientFactory();
  const { data: authData } = await supabase.auth.getUser();
  const user = authData.user;

  if (user === null) {
    throw new DomainError("AUTH_REQUIRED");
  }

  const { data: profile, error } = await supabase
    .from("profiles")
    .select(
      "id, handle, display_name, city_id, adult_attested_at, rules_version, rules_accepted_at, profile_completed_at, suspended_at, suspension_expires_at, community_restricted_at, community_restricted_until",
    )
    .eq("id", user.id)
    .maybeSingle();

  if (error !== null) {
    throw new DomainError("INTERNAL_ERROR", { cause: error });
  }

  const facts: ActorFacts = {
    authenticated: true,
    emailVerified: user.email_confirmed_at !== undefined && user.email_confirmed_at !== null,
    profileExists: profile !== null,
    adultAttested: profile?.adult_attested_at !== null && profile?.adult_attested_at !== undefined,
    rulesCurrent:
      profile?.rules_version === CURRENT_COMMUNITY_RULES_VERSION &&
      profile.rules_accepted_at !== null,
    profileComplete:
      profile?.profile_completed_at !== null &&
      profile?.profile_completed_at !== undefined &&
      profile.handle !== null &&
      profile.display_name !== null &&
      profile.city_id !== null,
    suspended: profile?.suspended_at !== null && profile?.suspended_at !== undefined,
    restricted:
      profile?.community_restricted_at !== null && profile?.community_restricted_at !== undefined,
  };
  const failureCode = actorGateCode(facts, requirement);

  if (failureCode !== null) {
    throw new DomainError(failureCode);
  }

  if (profile === null) {
    throw new DomainError("PROFILE_INCOMPLETE");
  }

  return { supabase, user, profile };
}
