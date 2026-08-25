import type { ActionError } from "@/lib/errors";

export type ProfileActionData = Readonly<{
  message: string;
  redirectTo: string | null;
}>;

export type ProfileFormValues = Readonly<{
  handle: string;
  displayName: string;
  citySlug: string;
  bio: string;
  adultAttested: boolean;
  rulesAccepted: boolean;
}>;

export type ProfileActionState =
  | Readonly<{ ok: true; data: ProfileActionData }>
  | Readonly<{
      ok: false;
      error: ActionError;
      values: ProfileFormValues;
      attempt: number;
    }>
  | null;

export const INITIAL_PROFILE_ACTION_STATE: ProfileActionState = null;
