import "server-only";

import { cache } from "react";

import { CURRENT_COMMUNITY_RULES_VERSION } from "@/content/community-rules";
import { DomainError, type DomainErrorCode } from "@/lib/errors";
import { createClient } from "@/lib/supabase/server";
import type { Tables } from "@/types/database.generated";

export type ActorRequirement = "authenticated" | "common" | "fan" | "safety" | { venueId: string };

export type ActorFacts = Readonly<{
  authenticated: boolean;
  emailVerified: boolean;
  profileExists: boolean;
  adultAttested: boolean;
  rulesCurrent: boolean;
  profileComplete: boolean;
  fanEnabled: boolean;
  suspended: boolean;
  restricted: boolean;
  venueAuthorized?: boolean;
}>;

export function actorGateCode(
  facts: ActorFacts,
  requirement: ActorRequirement,
): DomainErrorCode | null {
  const effectiveRequirement =
    (requirement as string) === "community"
      ? "fan"
      : (requirement as string) === "onboarding"
        ? "authenticated"
        : requirement;
  if (!facts.authenticated) return "AUTH_REQUIRED";
  if (effectiveRequirement === "authenticated") return null;
  if (!facts.emailVerified) return "EMAIL_NOT_VERIFIED";
  if (!facts.profileExists) return "PROFILE_INCOMPLETE";
  if (effectiveRequirement === "safety") return null;
  if (facts.suspended) return "ACCOUNT_SUSPENDED";
  if (!facts.adultAttested) return "ADULT_ATTESTATION_REQUIRED";
  if (!facts.rulesCurrent) return "RULES_ACCEPTANCE_REQUIRED";
  if (facts.restricted) return "ACCOUNT_RESTRICTED";
  if (effectiveRequirement === "fan" && (!facts.profileComplete || facts.fanEnabled !== true)) {
    return "PROFILE_INCOMPLETE";
  }
  if (typeof effectiveRequirement === "object" && !facts.venueAuthorized) return "NOT_ALLOWED";

  return null;
}

type ActorProfile = Pick<
  Tables<"profiles">,
  | "id"
  | "handle"
  | "display_name"
  | "adult_attested_at"
  | "rules_version"
  | "rules_accepted_at"
  | "profile_completed_at"
  | "fan_enabled_at"
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

async function resolveActor(
  requirement: ActorRequirement,
  clientFactory: ServerClientFactory,
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
      "id, handle, display_name, adult_attested_at, rules_version, rules_accepted_at, profile_completed_at, fan_enabled_at, suspended_at, suspension_expires_at, community_restricted_at, community_restricted_until",
    )
    .eq("id", user.id)
    .maybeSingle();

  if (error !== null) {
    throw new DomainError("INTERNAL_ERROR", { cause: error });
  }

  let facts: ActorFacts = {
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
      profile.display_name !== null,
    fanEnabled: profile?.fan_enabled_at !== null && profile?.fan_enabled_at !== undefined,
    suspended: profile?.suspended_at !== null && profile?.suspended_at !== undefined,
    restricted:
      profile?.community_restricted_at !== null && profile?.community_restricted_at !== undefined,
    venueAuthorized: false,
  };

  if (typeof requirement === "object") {
    const commonFailure = actorGateCode(facts, "common");
    if (commonFailure !== null) throw new DomainError(commonFailure);

    const { data: workspaces, error: workspaceError } = await supabase.rpc("list_my_workspaces");

    if (workspaceError !== null) {
      throw new DomainError("INTERNAL_ERROR", { cause: workspaceError });
    }
    facts = {
      ...facts,
      venueAuthorized: workspaces.some(
        (workspace) =>
          workspace.workspace_kind === "venue" && workspace.workspace_id === requirement.venueId,
      ),
    };
  }
  const failureCode = actorGateCode(facts, requirement);

  if (failureCode !== null) {
    throw new DomainError(failureCode);
  }

  if (profile === null) {
    throw new DomainError("PROFILE_INCOMPLETE");
  }

  return { supabase, user, profile };
}

function actorRequirementKey(requirement: ActorRequirement): string {
  return typeof requirement === "string" ? requirement : `venue:${requirement.venueId}`;
}

const resolveRequestActor = cache(async (requirementKey: string): Promise<ActorContext> => {
  const requirement: ActorRequirement = requirementKey.startsWith("venue:")
    ? { venueId: requirementKey.slice("venue:".length) }
    : (requirementKey as Exclude<ActorRequirement, { venueId: string }>);
  return resolveActor(requirement, createClient);
});

export function requireActor(
  requirement: ActorRequirement,
  clientFactory: ServerClientFactory = createClient,
): Promise<ActorContext> {
  // Injected factories are isolated unit-test/application boundaries and must
  // never share a context. Normal Server Component reads resolve once per
  // request, keyed by the actual capability being checked.
  if (clientFactory !== createClient) return resolveActor(requirement, clientFactory);
  return resolveRequestActor(actorRequirementKey(requirement));
}
