import type { ActionError, ActionResult } from "@/lib/errors";

export type VenueFormValues = Readonly<{
  venueId: string;
  name: string;
  slug: string;
  addressText: string;
  longitude: string;
  latitude: string;
  description: string;
  screenCount: string;
  statedCapacity: string;
}>;

export type VenueMutationData = Readonly<{
  message: string;
  venue: Readonly<{
    id: string;
    slug: string;
    verificationStatus: "unverified" | "verified" | "suspended";
  }>;
}>;

export type VenueMutationState =
  | Readonly<{ ok: true; data: VenueMutationData }>
  | Readonly<{
      ok: false;
      error: ActionError;
      values: VenueFormValues;
      attempt: number;
    }>
  | null;

export const INITIAL_VENUE_MUTATION_STATE: VenueMutationState = null;

export type VenueFollowActionData = Readonly<{
  message: string;
  intent: "follow" | "unfollow";
}>;

export type VenueFollowActionState = ActionResult<VenueFollowActionData> | null;
export const INITIAL_VENUE_FOLLOW_ACTION_STATE: VenueFollowActionState = null;
