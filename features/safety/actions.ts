"use server";

import { revalidatePath } from "next/cache";

import { requireActor } from "@/features/auth/actor";
import { blockPreferenceSchema } from "@/features/safety/schemas";
import type { BlockPreferenceActionState } from "@/features/safety/state";
import { actionFailure, actionSuccess, domainErrorFromDatabase } from "@/lib/errors";
import { getRequestId } from "@/lib/request-id/server";

export async function setBlockPreferenceAction(
  _previousState: BlockPreferenceActionState,
  formData: FormData,
): Promise<BlockPreferenceActionState> {
  const parsed = blockPreferenceSchema.safeParse({
    targetHandle: formData.get("targetHandle"),
    intent: formData.get("intent"),
  });

  if (!parsed.success) {
    return actionFailure(parsed.error);
  }

  try {
    const [{ supabase }, requestId] = await Promise.all([
      requireActor("community"),
      getRequestId(),
    ]);
    const functionName = parsed.data.intent === "block" ? "block_user" : "unblock_user";
    const { error } = await supabase.rpc(functionName, {
      target_handle: parsed.data.targetHandle,
      audit_request_id: requestId,
    });

    if (error !== null) {
      throw domainErrorFromDatabase(error);
    }

    revalidatePath(`/people/${parsed.data.targetHandle}`);
    revalidatePath("/settings/friends");

    return actionSuccess({
      message: "Safety preference updated.",
      intent: parsed.data.intent,
      targetHandle: parsed.data.targetHandle,
    });
  } catch (error) {
    return actionFailure(error);
  }
}
