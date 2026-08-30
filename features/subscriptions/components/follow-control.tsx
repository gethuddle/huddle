"use client";

import { useActionState } from "react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { setSubscriptionPreferenceAction } from "@/features/subscriptions/actions";
import type { SubscriptionKind } from "@/features/subscriptions/schemas";
import { INITIAL_SUBSCRIPTION_ACTION_STATE } from "@/features/subscriptions/state";

type FollowControlProps = Readonly<{
  kind: SubscriptionKind;
  targetId: string;
  targetName: string;
  initiallyFollowing: boolean;
}>;

type FollowControlState = Readonly<{
  result: typeof INITIAL_SUBSCRIPTION_ACTION_STATE;
  isFollowing: boolean;
}>;

async function updateFollowControlState(
  previousState: FollowControlState,
  formData: FormData,
): Promise<FollowControlState> {
  const result = await setSubscriptionPreferenceAction(previousState.result, formData);

  return {
    result,
    isFollowing: result?.ok === true ? result.data.intent === "follow" : previousState.isFollowing,
  };
}

export function FollowControl({
  kind,
  targetId,
  targetName,
  initiallyFollowing,
}: FollowControlProps) {
  const [state, formAction, pending] = useActionState(updateFollowControlState, {
    result: INITIAL_SUBSCRIPTION_ACTION_STATE,
    isFollowing: initiallyFollowing,
  });
  const { isFollowing, result } = state;

  return (
    <div className="space-y-2">
      <form action={formAction}>
        <input name="kind" type="hidden" value={kind} />
        <input name="targetId" type="hidden" value={targetId} />
        <input name="intent" type="hidden" value={isFollowing ? "unfollow" : "follow"} />
        <Button
          aria-label={`${isFollowing ? "Unfollow" : "Follow"} ${targetName}`}
          aria-pressed={isFollowing}
          className="min-h-11 w-full rounded-full sm:w-auto"
          disabled={pending}
          type="submit"
          variant={isFollowing ? "outline" : "default"}
        >
          {pending ? "Updating…" : isFollowing ? "Following" : "Follow"}
        </Button>
      </form>
      {result === null ? null : (
        <Alert
          className={result.ok ? "border-court/30 bg-court/10 py-2" : "py-2"}
          role={result.ok ? "status" : "alert"}
          variant={result.ok ? "default" : "destructive"}
        >
          <AlertDescription className={result.ok ? "text-court-hover" : "text-sand"}>
            {result.ok ? result.data.message : result.error.message}
          </AlertDescription>
        </Alert>
      )}
    </div>
  );
}
