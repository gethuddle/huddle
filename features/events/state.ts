import type { ActionError } from "@/lib/errors";

export type PrivateEventFormValues = Readonly<{
  eventId: string;
  matchId: string;
  title: string;
  description: string;
  expectedActivity: string;
  costDescription: string;
  eventRules: string;
  commercialAffiliation: string;
  hostPresenceConfirmed: boolean;
  cityId: string;
  placeKind: string;
  publicPlaceName: string;
  publicAddressText: string;
  publicLongitude: string;
  publicLatitude: string;
  privateAddressText: string;
  privateDirections: string;
  privateLongitude: string;
  privateLatitude: string;
  audience: string;
  audienceGroupId: string;
  capacity: string;
}>;

export type PrivateEventMutationState =
  | Readonly<{
      ok: true;
      data: Readonly<{
        message: string;
        event: Readonly<{
          id: string;
          status: "draft" | "pending_group_review" | "published";
        }>;
      }>;
    }>
  | Readonly<{
      ok: false;
      error: ActionError;
      values: PrivateEventFormValues;
      attempt: number;
    }>
  | null;

export const INITIAL_PRIVATE_EVENT_MUTATION_STATE: PrivateEventMutationState = null;
