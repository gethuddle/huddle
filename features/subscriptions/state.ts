import type { ActionResult } from "@/lib/errors";

import type { SubscriptionKind } from "./schemas";

export type SubscriptionActionData = Readonly<{
  message: string;
  intent: "follow" | "unfollow";
  kind: SubscriptionKind;
  targetId: string;
}>;

export type SubscriptionActionState = ActionResult<SubscriptionActionData> | null;

export const INITIAL_SUBSCRIPTION_ACTION_STATE: SubscriptionActionState = null;
