"use client";

import { startTransition, useActionState, useState, type FormEvent } from "react";

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
import { GroupActionFeedback } from "@/features/groups/components/action-feedback";
import { leaveGroupAction } from "@/features/groups/membership-actions";
import { INITIAL_GROUP_MEMBERSHIP_ACTION_STATE } from "@/features/groups/state";

export function GroupMembershipControl({
  groupId,
  groupSlug,
}: Readonly<{ groupId: string; groupSlug: string }>) {
  const [state, formAction, pending] = useActionState(
    leaveGroupAction,
    INITIAL_GROUP_MEMBERSHIP_ACTION_STATE,
  );
  const [confirmingLeave, setConfirmingLeave] = useState(false);

  function submitLeave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    startTransition(() => {
      formAction(formData);
      setConfirmingLeave(false);
    });
  }

  return (
    <div className="space-y-3">
      <AlertDialog onOpenChange={setConfirmingLeave} open={confirmingLeave}>
        <AlertDialogTrigger asChild>
          <Button disabled={pending} type="button" variant="outline">
            Leave group
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Leave this group?</AlertDialogTitle>
            <AlertDialogDescription>
              You will immediately lose protected group access. Your attendance and membership
              history remain retained, and rejoining requires a fresh application.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <form onSubmit={submitLeave}>
            <input name="groupId" type="hidden" value={groupId} />
            <input name="groupSlug" type="hidden" value={groupSlug} />
            <AlertDialogFooter>
              <Button disabled={pending} type="submit" variant="destructive">
                {pending ? "Leaving…" : "Leave group"}
              </Button>
              <AlertDialogCancel type="button">Stay</AlertDialogCancel>
            </AlertDialogFooter>
          </form>
        </AlertDialogContent>
      </AlertDialog>
      <GroupActionFeedback state={state} />
    </div>
  );
}
