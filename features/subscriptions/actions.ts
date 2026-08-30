"use server";

import { revalidatePath } from "next/cache";

import { requireActor } from "@/features/auth/actor";
import { subscriptionPreferenceSchema } from "@/features/subscriptions/schemas";
import type { SubscriptionActionState } from "@/features/subscriptions/state";
import { actionFailure, actionSuccess, DomainError } from "@/lib/errors";
import type { TablesInsert } from "@/types/database.generated";

type DatabaseError = Readonly<{ code?: unknown }>;

function databaseCode(error: unknown): string | null {
  if (typeof error !== "object" || error === null) return null;
  const code = (error as DatabaseError).code;
  return typeof code === "string" ? code : null;
}

function targetColumn(kind: "sport" | "competition" | "team") {
  return `${kind}_id` as const;
}

function revalidateInterestViews() {
  revalidatePath("/settings/interests");
  revalidatePath("/matches", "layout");
}

export async function setSubscriptionPreferenceAction(
  _previousState: SubscriptionActionState,
  formData: FormData,
): Promise<SubscriptionActionState> {
  const parsed = subscriptionPreferenceSchema.safeParse({
    kind: formData.get("kind"),
    targetId: formData.get("targetId"),
    intent: formData.get("intent"),
  });

  if (!parsed.success) return actionFailure(parsed.error);

  try {
    const { supabase, user } = await requireActor("fan");
    const column = targetColumn(parsed.data.kind);

    if (parsed.data.intent === "follow") {
      const payload: TablesInsert<"subscriptions"> = {
        user_id: user.id,
        kind: parsed.data.kind,
        sport_id: null,
        competition_id: null,
        team_id: null,
        [column]: parsed.data.targetId,
      };
      const { error } = await supabase.from("subscriptions").insert(payload);

      if (error !== null && databaseCode(error) !== "23505") {
        const code = databaseCode(error);
        if (code === "23503") throw new DomainError("NOT_FOUND", { cause: error });
        if (code === "42501") throw new DomainError("NOT_ALLOWED", { cause: error });
        throw new DomainError("INTERNAL_ERROR", { cause: error });
      }

      revalidateInterestViews();
      return actionSuccess({
        message: error === null ? "Follow added." : "You already follow this.",
        intent: "follow",
        kind: parsed.data.kind,
        targetId: parsed.data.targetId,
      });
    }

    const { error } = await supabase
      .from("subscriptions")
      .delete()
      .match({
        user_id: user.id,
        kind: parsed.data.kind,
        [column]: parsed.data.targetId,
      });

    if (error !== null) {
      const code = databaseCode(error);
      if (code === "42501") throw new DomainError("NOT_ALLOWED", { cause: error });
      throw new DomainError("INTERNAL_ERROR", { cause: error });
    }

    revalidateInterestViews();
    return actionSuccess({
      message: "Follow removed.",
      intent: "unfollow",
      kind: parsed.data.kind,
      targetId: parsed.data.targetId,
    });
  } catch (error) {
    return actionFailure(error);
  }
}
