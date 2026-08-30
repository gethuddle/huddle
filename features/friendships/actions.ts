"use server";

import { revalidatePath } from "next/cache";

import { requireActor } from "@/features/auth/actor";
import { friendshipMutationSchema } from "@/features/friendships/schemas";
import type { FriendshipActionState } from "@/features/friendships/state";
import { actionFailure, actionSuccess, domainErrorFromDatabase } from "@/lib/errors";
import { getRequestId } from "@/lib/request-id/server";

function mutationInput(formData: FormData) {
  return {
    targetHandle: formData.get("targetHandle"),
    intent: formData.get("intent"),
    friendshipId: formData.get("friendshipId"),
  };
}

export async function updateFriendshipAction(
  _previousState: FriendshipActionState,
  formData: FormData,
): Promise<FriendshipActionState> {
  const parsed = friendshipMutationSchema.safeParse(mutationInput(formData));
  if (!parsed.success) return actionFailure(parsed.error);

  try {
    const [{ supabase }, requestId] = await Promise.all([requireActor("fan"), getRequestId()]);

    if (parsed.data.intent === "request") {
      const { data, error } = await supabase.rpc("request_friendship_by_handle", {
        target_handle: parsed.data.targetHandle,
        audit_request_id: requestId,
      });
      if (error !== null) throw domainErrorFromDatabase(error);

      revalidateFriendshipViews(parsed.data.targetHandle);
      return actionSuccess({
        message: "Friend request sent.",
        intent: "request",
        targetHandle: parsed.data.targetHandle,
        friendship: { id: data, status: "pending", direction: "outgoing" },
      });
    }

    if (parsed.data.intent === "accept" || parsed.data.intent === "decline") {
      const { error } = await supabase.rpc("respond_to_friendship", {
        input_friendship_id: parsed.data.friendshipId,
        input_decision: parsed.data.intent,
        audit_request_id: requestId,
      });
      if (error !== null) throw domainErrorFromDatabase(error);

      revalidateFriendshipViews(parsed.data.targetHandle);
      return actionSuccess({
        message:
          parsed.data.intent === "accept" ? "Friend request accepted." : "Friend request declined.",
        intent: parsed.data.intent,
        targetHandle: parsed.data.targetHandle,
        friendship:
          parsed.data.intent === "accept"
            ? { id: parsed.data.friendshipId, status: "accepted", direction: "accepted" }
            : null,
      });
    }

    const { error } = await supabase.rpc("remove_friendship", {
      input_friendship_id: parsed.data.friendshipId,
      audit_request_id: requestId,
    });
    if (error !== null) throw domainErrorFromDatabase(error);

    revalidateFriendshipViews(parsed.data.targetHandle);
    return actionSuccess({
      message: "Friendship removed.",
      intent: "remove",
      targetHandle: parsed.data.targetHandle,
      friendship: null,
    });
  } catch (error) {
    return actionFailure(error);
  }
}

function revalidateFriendshipViews(targetHandle: string) {
  revalidatePath("/people");
  revalidatePath("/settings/friends");
  revalidatePath(`/people/${targetHandle}`);
}
