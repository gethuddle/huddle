"use client";

import { useActionState } from "react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { updateFriendshipAction } from "@/features/friendships/actions";
import {
  INITIAL_FRIENDSHIP_ACTION_STATE,
  type FriendshipActionState,
} from "@/features/friendships/state";
import type { PublicFriendshipDto } from "@/features/profiles/dto";

type FriendshipControlProps = Readonly<{
  targetHandle: string;
  initialFriendship: PublicFriendshipDto | null;
  disabledByOwnBlock?: boolean;
}>;

type ControlState = Readonly<{
  result: FriendshipActionState;
  friendship: PublicFriendshipDto | null;
}>;

async function updateControlState(
  previousState: ControlState,
  formData: FormData,
): Promise<ControlState> {
  const result = await updateFriendshipAction(previousState.result, formData);
  return {
    result,
    friendship: result?.ok === true ? result.data.friendship : previousState.friendship,
  };
}

export function FriendshipControl({
  targetHandle,
  initialFriendship,
  disabledByOwnBlock = false,
}: FriendshipControlProps) {
  const [state, formAction, pending] = useActionState(updateControlState, {
    result: INITIAL_FRIENDSHIP_ACTION_STATE,
    friendship: initialFriendship,
  });

  if (disabledByOwnBlock) {
    return (
      <div className="space-y-2">
        <p className="font-semibold text-foreground">Direct interaction is paused.</p>
        <p className="text-sm leading-6 text-muted-foreground">
          Unblock this person before sending a friend request.
        </p>
      </div>
    );
  }

  const friendship = state.friendship;

  return (
    <div className="space-y-3">
      {friendship === null ? (
        <MutationForm
          action={formAction}
          intent="request"
          pending={pending}
          targetHandle={targetHandle}
        >
          Add friend
        </MutationForm>
      ) : null}

      {friendship?.status === "accepted" ? (
        <div className="space-y-3">
          <Badge variant="secondary">Friends</Badge>
          <FriendRemovalControl
            action={formAction}
            friendshipId={friendship.id}
            pending={pending}
            targetHandle={targetHandle}
          />
        </div>
      ) : null}

      {friendship?.direction === "outgoing" ? (
        <div className="space-y-3">
          <Badge variant="outline">Request sent</Badge>
          <MutationForm
            action={formAction}
            friendshipId={friendship.id}
            intent="cancel"
            pending={pending}
            targetHandle={targetHandle}
            variant="outline"
          >
            Cancel request
          </MutationForm>
        </div>
      ) : null}

      {friendship?.direction === "incoming" ? (
        <div className="space-y-3">
          <p className="font-semibold text-foreground">
            @{targetHandle} sent you a friend request.
          </p>
          <div className="flex flex-wrap gap-2">
            <MutationForm
              action={formAction}
              friendshipId={friendship.id}
              intent="accept"
              pending={pending}
              targetHandle={targetHandle}
            >
              Accept
            </MutationForm>
            <MutationForm
              action={formAction}
              friendshipId={friendship.id}
              intent="decline"
              pending={pending}
              targetHandle={targetHandle}
              variant="outline"
            >
              Decline
            </MutationForm>
          </div>
        </div>
      ) : null}

      <ActionFeedback state={state.result} />
    </div>
  );
}

function FriendRemovalControl({
  action,
  friendshipId,
  pending,
  targetHandle,
}: Readonly<{
  action: (payload: FormData) => void;
  friendshipId: string;
  pending: boolean;
  targetHandle: string;
}>) {
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button className="min-h-11" disabled={pending} type="button" variant="outline">
          Remove friend
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Remove @{targetHandle} from your friends?</AlertDialogTitle>
          <AlertDialogDescription>
            You will immediately lose access to each other’s friends-only events. Existing
            attendance history stays recorded, and either person can send a new request later.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <form action={action}>
          <input name="targetHandle" type="hidden" value={targetHandle} />
          <input name="intent" type="hidden" value="remove" />
          <input name="friendshipId" type="hidden" value={friendshipId} />
          <AlertDialogFooter>
            <AlertDialogCancel type="button">Keep friend</AlertDialogCancel>
            <Button disabled={pending} type="submit" variant="destructive">
              {pending ? "Removing…" : "Confirm removal"}
            </Button>
          </AlertDialogFooter>
        </form>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function MutationForm({
  action,
  children,
  friendshipId,
  intent,
  pending,
  targetHandle,
  variant = "default",
}: Readonly<{
  action: (payload: FormData) => void;
  children: string;
  friendshipId?: string;
  intent: "request" | "accept" | "cancel" | "decline" | "remove";
  pending: boolean;
  targetHandle: string;
  variant?: "default" | "outline";
}>) {
  return (
    <form action={action} className="inline-block">
      <input name="targetHandle" type="hidden" value={targetHandle} />
      <input name="intent" type="hidden" value={intent} />
      {friendshipId === undefined ? null : (
        <input name="friendshipId" type="hidden" value={friendshipId} />
      )}
      <Button className="min-h-11" disabled={pending} type="submit" variant={variant}>
        {pending ? "Updating…" : children}
      </Button>
    </form>
  );
}

function ActionFeedback({ state }: Readonly<{ state: FriendshipActionState }>) {
  if (state === null) return null;

  return (
    <Alert
      className={state.ok ? "border-court/30 bg-court/10" : undefined}
      role={state.ok ? "status" : "alert"}
      variant={state.ok ? "default" : "destructive"}
    >
      <AlertDescription className={state.ok ? "text-forest-hover" : "text-sand"}>
        {state.ok ? state.data.message : state.error.message}
      </AlertDescription>
    </Alert>
  );
}
