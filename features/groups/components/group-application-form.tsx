"use client";

import { useActionState } from "react";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { submitGroupApplicationAction } from "@/features/groups/membership-actions";
import { GroupActionFeedback } from "@/features/groups/components/action-feedback";
import { INITIAL_GROUP_MEMBERSHIP_ACTION_STATE } from "@/features/groups/state";

export function GroupApplicationForm({
  groupId,
  groupSlug,
}: Readonly<{ groupId: string; groupSlug: string }>) {
  const [state, formAction, pending] = useActionState(
    submitGroupApplicationAction,
    INITIAL_GROUP_MEMBERSHIP_ACTION_STATE,
  );

  if (state?.ok === true) return <GroupActionFeedback state={state} />;

  return (
    <form action={formAction} className="space-y-4" noValidate>
      <input name="groupId" type="hidden" value={groupId} />
      <input name="groupSlug" type="hidden" value={groupSlug} />
      <div>
        <Label className="text-foreground" htmlFor="group-application-message">
          Note to the administrators{" "}
          <span className="font-normal text-muted-foreground">(optional)</span>
        </Label>
        <Textarea
          aria-describedby="group-application-message-help group-application-message-error"
          aria-invalid={state?.ok === false && state.error.fields?.message ? true : undefined}
          className="mt-2 resize-y"
          id="group-application-message"
          maxLength={1000}
          name="message"
          placeholder="Introduce yourself and your connection to the group."
        />
        <span
          className="mt-2 block text-xs text-muted-foreground"
          id="group-application-message-help"
        >
          Only this group&apos;s active owner and admins can read this note. Do not include a home
          address, phone number, financial or health information, sexual orientation, or full legal
          identity.
        </span>
        {state?.ok === false && state.error.fields?.message ? (
          <span className="mt-2 block text-sm text-sand" id="group-application-message-error">
            {state.error.fields.message[0]}
          </span>
        ) : null}
      </div>
      <GroupActionFeedback state={state} />
      <Button disabled={pending} type="submit">
        {pending ? "Sending…" : "Apply to join"}
      </Button>
    </form>
  );
}
