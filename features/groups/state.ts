import type { ActionError, ActionResult } from "@/lib/errors";

export type GroupCreationValues = Readonly<{
  name: string;
  slug: string;
  cityId: string;
  teamId: string | null;
  visibility: "discoverable" | "unlisted";
  description: string;
}>;

export type GroupCreationFormValues = Readonly<{
  name: string;
  slug: string;
  cityId: string;
  teamId: string;
  visibility: string;
  description: string;
}>;

export type SimilarGroup = Readonly<{
  id: string;
  slug: string;
  name: string;
  lifecycle: "forming" | "active";
  cityName: string;
  teamName: string | null;
}>;

export type GroupCreationActionData =
  | Readonly<{
      phase: "review";
      message: string;
      values: GroupCreationValues;
      suggestions: readonly SimilarGroup[];
    }>
  | Readonly<{
      phase: "created";
      message: string;
      visibility: "discoverable" | "unlisted";
      group: Readonly<{ id: string; slug: string; lifecycle: "forming" | "active" }>;
    }>;

export type GroupCreationActionState =
  | Readonly<{ ok: true; data: GroupCreationActionData }>
  | Readonly<{
      ok: false;
      error: ActionError;
      values: GroupCreationFormValues;
      attempt: number;
    }>
  | null;

export const INITIAL_GROUP_CREATION_ACTION_STATE: GroupCreationActionState = null;

export type GroupMembershipActionData = Readonly<{
  message: string;
  invitePath?: string;
}>;

export type GroupMembershipActionState = ActionResult<GroupMembershipActionData> | null;

export const INITIAL_GROUP_MEMBERSHIP_ACTION_STATE: GroupMembershipActionState = null;
