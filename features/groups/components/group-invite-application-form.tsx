"use client";

import { useActionState } from "react";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { GroupActionFeedback } from "@/features/groups/components/action-feedback";
import { consumeGroupInviteAction } from "@/features/groups/membership-actions";
import { INITIAL_GROUP_MEMBERSHIP_ACTION_STATE } from "@/features/groups/state";

export function GroupInviteApplicationForm({ token }: Readonly<{ token: string }>) {
  const [state, formAction, pending] = useActionState(
    consumeGroupInviteAction,
    INITIAL_GROUP_MEMBERSHIP_ACTION_STATE,
  );

  if (state?.ok === true) return <GroupActionFeedback state={state} />;

  return (
    <form action={formAction} className="space-y-5" noValidate>
      <input name="token" type="hidden" value={token} />
      <div>
        <Label className="text-linen" htmlFor="invite-application-message">
          Note to the administrators <span className="font-normal text-muted-dark">(optional)</span>
        </Label>
        <Textarea
          aria-describedby="invite-application-help invite-application-error"
          aria-invalid={state?.ok === false && state.error.fields?.message ? true : undefined}
          className="mt-2 resize-y"
          id="invite-application-message"
          maxLength={1000}
          name="message"
          placeholder="Introduce yourself to the group administrators."
        />
        <span className="mt-2 block text-xs text-muted-dark" id="invite-application-help">
          Using an invitation submits a pending application. It never bypasses administrator review.
          Do not include a home address, phone number, financial or health information, sexual
          orientation, or full legal identity.
        </span>
        {state?.ok === false && state.error.fields?.message ? (
          <span className="mt-2 block text-sm text-sand" id="invite-application-error">
            {state.error.fields.message[0]}
          </span>
        ) : null}
      </div>
      <GroupActionFeedback state={state} />
      <Button disabled={pending} type="submit">
        {pending ? "Sending…" : "Request to join"}
      </Button>
    </form>
  );
}
