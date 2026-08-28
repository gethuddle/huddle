"use client";

import { useActionState } from "react";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { submitModerationAppealAction } from "@/features/moderation/actions";
import { ModerationActionFeedback } from "@/features/moderation/components/action-feedback";

export function AppealControl({ moderationActionId }: Readonly<{ moderationActionId: string }>) {
  const [state, action, pending] = useActionState(submitModerationAppealAction, null);
  const fieldId = `appeal-reason-${moderationActionId}`;
  const errorId = `${fieldId}-error`;
  const reasonError = state?.ok === false ? state.error.fields?.reason?.[0] : undefined;

  if (state?.ok === true) return <ModerationActionFeedback state={state} />;

  return (
    <details className="mt-5 rounded-xl border border-border p-4">
      <summary className="cursor-pointer text-sm font-semibold text-linen">
        Appeal this action
      </summary>
      <form action={action} className="mt-4 space-y-4" noValidate>
        <input name="moderationActionId" type="hidden" value={moderationActionId} />
        <div>
          <Label htmlFor={fieldId}>Why should this decision be reviewed?</Label>
          <Textarea
            aria-describedby={`${fieldId}-help ${errorId}`}
            aria-invalid={reasonError === undefined ? undefined : true}
            className="mt-2 min-h-28"
            id={fieldId}
            maxLength={2000}
            minLength={20}
            name="reason"
            required
          />
          {reasonError === undefined ? null : (
            <p className="mt-2 text-sm text-sand" id={errorId}>
              {reasonError}
            </p>
          )}
          <p className="mt-2 text-xs leading-5 text-muted-dark" id={`${fieldId}-help`}>
            A different moderator reviews the appeal where practical. One active appeal is allowed
            for each action.
          </p>
        </div>
        <ModerationActionFeedback state={state} />
        <Button disabled={pending} type="submit" variant="outline">
          {pending ? "Submitting…" : "Submit appeal"}
        </Button>
      </form>
    </details>
  );
}
