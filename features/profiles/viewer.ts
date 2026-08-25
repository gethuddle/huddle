import { actorGateCode, type ActorFacts } from "@/features/auth/actor";

export type PublicProfileViewerState =
  "anonymous" | "complete-profile" | "eligible" | "not-permitted" | "self";

type ResolvePublicProfileViewerStateInput = Readonly<{
  facts: ActorFacts | null;
  viewerHandle: string | null;
  targetHandle: string;
}>;

export function resolvePublicProfileViewerState({
  facts,
  viewerHandle,
  targetHandle,
}: ResolvePublicProfileViewerStateInput): PublicProfileViewerState {
  if (facts === null || !facts.authenticated) return "anonymous";
  if (viewerHandle === targetHandle) return "self";

  const gateCode = actorGateCode(facts, "community");
  if (gateCode === null) return "eligible";
  if (gateCode === "ACCOUNT_SUSPENDED") return "not-permitted";
  return "complete-profile";
}
