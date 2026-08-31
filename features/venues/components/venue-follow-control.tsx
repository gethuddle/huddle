"use client";

import { useActionState } from "react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { setVenueFollowAction } from "@/features/venues/actions";
import { INITIAL_VENUE_FOLLOW_ACTION_STATE } from "@/features/venues/state";

type VenueFollowControlProps = Readonly<{
  venueId: string;
  venueSlug: string;
  venueName: string;
  initiallyFollowing: boolean;
}>;

type ControlState = Readonly<{
  result: typeof INITIAL_VENUE_FOLLOW_ACTION_STATE;
  following: boolean;
}>;

async function updateState(previous: ControlState, formData: FormData): Promise<ControlState> {
  const result = await setVenueFollowAction(previous.result, formData);
  return {
    result,
    following: result?.ok === true ? result.data.intent === "follow" : previous.following,
  };
}

export function VenueFollowControl({
  venueId,
  venueSlug,
  venueName,
  initiallyFollowing,
}: VenueFollowControlProps) {
  const [state, formAction, pending] = useActionState(updateState, {
    result: INITIAL_VENUE_FOLLOW_ACTION_STATE,
    following: initiallyFollowing,
  });

  return (
    <div className="space-y-2">
      <form action={formAction}>
        <input name="venueId" type="hidden" value={venueId} />
        <input name="venueSlug" type="hidden" value={venueSlug} />
        <input name="intent" type="hidden" value={state.following ? "unfollow" : "follow"} />
        <Button
          aria-label={`${state.following ? "Unfollow" : "Follow"} ${venueName}`}
          aria-pressed={state.following}
          disabled={pending}
          type="submit"
          variant={state.following ? "outline" : "default"}
        >
          {pending ? "Updating…" : state.following ? "Following" : "Follow venue"}
        </Button>
      </form>
      {state.result === null ? null : (
        <Alert
          className={state.result.ok ? "border-court/30 bg-court/10 py-2" : "py-2"}
          role={state.result.ok ? "status" : "alert"}
          variant={state.result.ok ? "default" : "destructive"}
        >
          <AlertDescription className={state.result.ok ? "text-forest-hover" : "text-sand"}>
            {state.result.ok ? state.result.data.message : state.result.error.message}
          </AlertDescription>
        </Alert>
      )}
    </div>
  );
}
