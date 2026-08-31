import type { PublicFriendshipDto } from "@/features/profiles/dto";
import type { ActionResult } from "@/lib/errors";

export type FriendshipActionData = Readonly<{
  message: string;
  intent: "request" | "accept" | "cancel" | "decline" | "remove";
  targetHandle: string;
  friendship: PublicFriendshipDto | null;
}>;

export type FriendshipActionState = ActionResult<FriendshipActionData> | null;

export const INITIAL_FRIENDSHIP_ACTION_STATE: FriendshipActionState = null;
