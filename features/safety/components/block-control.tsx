"use client";

import { startTransition, useActionState, useState, type FormEvent } from "react";

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
import { Button } from "@/components/ui/button";
import { setBlockPreferenceAction } from "@/features/safety/actions";
import {
  INITIAL_BLOCK_PREFERENCE_ACTION_STATE,
  type BlockPreferenceActionState,
} from "@/features/safety/state";

type BlockControlProps = Readonly<{
  targetHandle: string;
  initiallyBlocked: boolean;
}>;

export function BlockControl({ targetHandle, initiallyBlocked }: BlockControlProps) {
  const [state, formAction, pending] = useActionState(
    setBlockPreferenceAction,
    INITIAL_BLOCK_PREFERENCE_ACTION_STATE,
  );
  const [confirmingBlock, setConfirmingBlock] = useState(false);
  const isBlocked = state?.ok === true ? state.data.intent === "block" : initiallyBlocked;

  function submitBlock(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);

    startTransition(() => {
      formAction(formData);
      setConfirmingBlock(false);
    });
  }

  if (isBlocked) {
    return (
      <div className="space-y-3">
        <form action={formAction}>
          <input name="targetHandle" type="hidden" value={targetHandle} />
          <input name="intent" type="hidden" value="unblock" />
          <Button disabled={pending} type="submit" variant="outline">
            {pending ? "Updating…" : `Unblock @${targetHandle}`}
          </Button>
        </form>
        <ActionFeedback state={state} />
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <AlertDialog open={confirmingBlock} onOpenChange={setConfirmingBlock}>
        <AlertDialogTrigger asChild>
          <Button disabled={pending} type="button" variant="outline">
            {pending ? "Updating…" : `Block @${targetHandle}`}
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Block @{targetHandle}?</AlertDialogTitle>
            <AlertDialogDescription>
              They will not be notified. Future direct interactions between you will be unavailable.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <form onSubmit={submitBlock}>
            <input name="targetHandle" type="hidden" value={targetHandle} />
            <input name="intent" type="hidden" value="block" />
            <AlertDialogFooter>
              <Button disabled={pending} type="submit" variant="destructive">
                {pending ? "Updating…" : "Confirm block"}
              </Button>
              <AlertDialogCancel type="button">Cancel</AlertDialogCancel>
            </AlertDialogFooter>
          </form>
        </AlertDialogContent>
      </AlertDialog>
      <ActionFeedback state={state} />
    </div>
  );
}

function ActionFeedback({ state }: Readonly<{ state: BlockPreferenceActionState }>) {
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
