import type { ActionResult } from "@/lib/errors";

export type AuthActionData = Readonly<{
  message: string;
  redirectTo: string | null;
}>;

export type AuthActionState = ActionResult<AuthActionData> | null;

export const INITIAL_AUTH_ACTION_STATE: AuthActionState = null;
