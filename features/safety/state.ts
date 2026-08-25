import type { ActionResult } from "@/lib/errors";

export type BlockPreferenceActionData = Readonly<{
  message: string;
  intent: "block" | "unblock";
  targetHandle: string;
}>;

export type BlockPreferenceActionState = ActionResult<BlockPreferenceActionData> | null;

export const INITIAL_BLOCK_PREFERENCE_ACTION_STATE: BlockPreferenceActionState = null;
