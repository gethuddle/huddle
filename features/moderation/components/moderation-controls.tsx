"use client";

import { startTransition, useActionState, useRef, useState } from "react";

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
import { Label } from "@/components/ui/label";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import {
  applyModerationAction,
  assignReportAction,
  dismissReportAction,
  reviewModerationAppealAction,
  reverseModerationAction,
} from "@/features/moderation/actions";
import { ModerationActionFeedback } from "@/features/moderation/components/action-feedback";
import type { ModerationActionKind, ModerationTargetType } from "@/features/moderation/schemas";

const commonActions = ["content_correction"] as const;
const destructiveActions = new Set<ModerationActionKind>([
  "feature_restriction",
  "temporary_suspension",
  "permanent_account_ban",
  "group_suspension",
  "venue_suspension",
  "event_cancellation",
]);
const actionsByTarget: Readonly<Record<ModerationTargetType, readonly ModerationActionKind[]>> = {
  profile: [
    ...commonActions,
    "warning",
    "feature_restriction",
    "temporary_suspension",
    "permanent_account_ban",
  ],
  group: [...commonActions, "group_suspension"],
  venue: [...commonActions, "venue_suspension"],
  event: [...commonActions, "event_cancellation"],
};

function FieldError({ id, message }: Readonly<{ id: string; message?: string }>) {
  return message === undefined ? null : (
    <p className="mt-2 text-sm text-sand" id={id}>
      {message}
    </p>
  );
}

export function ReportAssignmentControl({ reportId }: Readonly<{ reportId: string }>) {
  const [state, action, pending] = useActionState(assignReportAction, null);
  return (
    <div className="space-y-3">
      <form action={action}>
        <input name="reportId" type="hidden" value={reportId} />
        <Button disabled={pending} size="sm" type="submit">
          {pending ? "Assigning…" : "Assign to me"}
        </Button>
      </form>
      <ModerationActionFeedback state={state} />
    </div>
  );
}

export function ReportDecisionControls({
  reportId,
  targetType,
}: Readonly<{ reportId: string; targetType: ModerationTargetType }>) {
  const [actionState, action, actionPending] = useActionState(applyModerationAction, null);
  const [dismissState, dismiss, dismissPending] = useActionState(dismissReportAction, null);
  const [selectedAction, setSelectedAction] = useState<ModerationActionKind>(
    actionsByTarget[targetType][0],
  );
  const [confirmingAction, setConfirmingAction] = useState(false);
  const actionFormRef = useRef<HTMLFormElement>(null);
  const actionErrors = actionState?.ok === false ? actionState.error.fields : undefined;
  const dismissErrors = dismissState?.ok === false ? dismissState.error.fields : undefined;
  const timed =
    selectedAction === "feature_restriction" || selectedAction === "temporary_suspension";
  const destructive = destructiveActions.has(selectedAction);
  const selectedActionLabel = selectedAction.replaceAll("_", " ");
  const actionFormId = `moderation-action-form-${reportId}`;

  function confirmDestructiveAction() {
    if (actionFormRef.current === null) return;
    const formData = new FormData(actionFormRef.current);

    startTransition(() => {
      action(formData);
      setConfirmingAction(false);
    });
  }

  return (
    <div className="grid gap-5 xl:grid-cols-2">
      <form
        action={action}
        className="space-y-4 rounded-xl border border-border p-4"
        id={actionFormId}
        noValidate
        ref={actionFormRef}
      >
        <input name="reportId" type="hidden" value={reportId} />
        <div>
          <Label htmlFor={`moderation-action-${reportId}`}>Proportional action</Label>
          <NativeSelect
            aria-describedby={`moderation-action-error-${reportId}`}
            aria-invalid={actionErrors?.action === undefined ? undefined : true}
            className="mt-2"
            id={`moderation-action-${reportId}`}
            name="action"
            onChange={(event) => setSelectedAction(event.target.value as ModerationActionKind)}
            value={selectedAction}
          >
            {actionsByTarget[targetType].map((item) => (
              <NativeSelectOption key={item} value={item}>
                {item.replaceAll("_", " ")}
              </NativeSelectOption>
            ))}
          </NativeSelect>
          <FieldError
            id={`moderation-action-error-${reportId}`}
            message={actionErrors?.action?.[0]}
          />
        </div>
        {timed ? (
          <div>
            <Label htmlFor={`moderation-duration-${reportId}`}>Duration</Label>
            <NativeSelect
              aria-describedby={`moderation-duration-error-${reportId}`}
              aria-invalid={actionErrors?.durationHours === undefined ? undefined : true}
              className="mt-2"
              defaultValue="24"
              id={`moderation-duration-${reportId}`}
              name="durationHours"
            >
              <NativeSelectOption value="24">24 hours</NativeSelectOption>
              <NativeSelectOption value="72">3 days</NativeSelectOption>
              <NativeSelectOption value="168">7 days</NativeSelectOption>
              <NativeSelectOption value="720">30 days</NativeSelectOption>
            </NativeSelect>
            <FieldError
              id={`moderation-duration-error-${reportId}`}
              message={actionErrors?.durationHours?.[0]}
            />
          </div>
        ) : null}
        <div>
          <Label htmlFor={`moderation-reason-${reportId}`}>Decision reason</Label>
          <Textarea
            aria-describedby={`moderation-reason-error-${reportId}`}
            aria-invalid={actionErrors?.reason === undefined ? undefined : true}
            className="mt-2 min-h-28"
            id={`moderation-reason-${reportId}`}
            maxLength={1000}
            minLength={10}
            name="reason"
            required
          />
          <FieldError
            id={`moderation-reason-error-${reportId}`}
            message={actionErrors?.reason?.[0]}
          />
        </div>
        <ModerationActionFeedback state={actionState} />
        {destructive ? (
          <AlertDialog onOpenChange={setConfirmingAction} open={confirmingAction}>
            <AlertDialogTrigger asChild>
              <Button disabled={actionPending} type="button" variant="destructive">
                {actionPending ? "Applying…" : `Review ${selectedActionLabel}`}
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Apply {selectedActionLabel}?</AlertDialogTitle>
                <AlertDialogDescription>
                  This action takes effect immediately and may revoke access, suspend a community,
                  or cancel an event. Review the selected action, duration, and reason before
                  confirming.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <Button
                  disabled={actionPending}
                  onClick={confirmDestructiveAction}
                  type="button"
                  variant="destructive"
                >
                  {actionPending ? "Applying…" : `Confirm ${selectedActionLabel}`}
                </Button>
                <AlertDialogCancel type="button">Cancel</AlertDialogCancel>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        ) : (
          <Button disabled={actionPending} type="submit" variant="destructive">
            {actionPending ? "Applying…" : "Apply and audit action"}
          </Button>
        )}
      </form>

      <form action={dismiss} className="space-y-4 rounded-xl border border-border p-4" noValidate>
        <input name="reportId" type="hidden" value={reportId} />
        <div>
          <Label htmlFor={`dismiss-reason-${reportId}`}>Reason to close without action</Label>
          <Textarea
            aria-describedby={`dismiss-reason-error-${reportId}`}
            aria-invalid={dismissErrors?.reason === undefined ? undefined : true}
            className="mt-2 min-h-28"
            id={`dismiss-reason-${reportId}`}
            maxLength={2000}
            minLength={10}
            name="reason"
            required
          />
          <FieldError
            id={`dismiss-reason-error-${reportId}`}
            message={dismissErrors?.reason?.[0]}
          />
        </div>
        <ModerationActionFeedback state={dismissState} />
        <Button disabled={dismissPending} type="submit" variant="outline">
          {dismissPending ? "Closing…" : "Close without enforcement"}
        </Button>
      </form>
    </div>
  );
}

export function AppealReviewControl({ appealId }: Readonly<{ appealId: string }>) {
  const [state, action, pending] = useActionState(reviewModerationAppealAction, null);
  const fieldErrors = state?.ok === false ? state.error.fields : undefined;
  return (
    <form action={action} className="mt-5 grid gap-4 md:grid-cols-[12rem_1fr_auto]" noValidate>
      <input name="appealId" type="hidden" value={appealId} />
      <div>
        <Label htmlFor={`appeal-decision-${appealId}`}>Outcome</Label>
        <NativeSelect
          aria-describedby={`appeal-decision-error-${appealId}`}
          aria-invalid={fieldErrors?.decision === undefined ? undefined : true}
          className="mt-2"
          defaultValue="uphold"
          id={`appeal-decision-${appealId}`}
          name="decision"
        >
          <NativeSelectOption value="uphold">Uphold</NativeSelectOption>
          <NativeSelectOption value="reverse">Reverse action</NativeSelectOption>
        </NativeSelect>
        <FieldError id={`appeal-decision-error-${appealId}`} message={fieldErrors?.decision?.[0]} />
      </div>
      <div>
        <Label htmlFor={`appeal-outcome-${appealId}`}>Outcome reason</Label>
        <Textarea
          aria-describedby={`appeal-outcome-error-${appealId}`}
          aria-invalid={fieldErrors?.reason === undefined ? undefined : true}
          className="mt-2 min-h-24"
          id={`appeal-outcome-${appealId}`}
          maxLength={2000}
          minLength={10}
          name="reason"
          required
        />
        <FieldError id={`appeal-outcome-error-${appealId}`} message={fieldErrors?.reason?.[0]} />
      </div>
      <Button className="self-end" disabled={pending} type="submit">
        {pending ? "Saving…" : "Record outcome"}
      </Button>
      <div className="md:col-span-3">
        <ModerationActionFeedback state={state} />
      </div>
    </form>
  );
}

export function ModerationReversalControl({
  moderationActionId,
}: Readonly<{ moderationActionId: string }>) {
  const [state, action, pending] = useActionState(reverseModerationAction, null);
  const reasonError = state?.ok === false ? state.error.fields?.reason?.[0] : undefined;
  const reasonId = `reversal-reason-${moderationActionId}`;
  const errorId = `${reasonId}-error`;

  return (
    <details className="mt-5 rounded-xl border border-border p-4">
      <summary className="cursor-pointer text-sm font-semibold text-linen">
        Reverse with audit evidence
      </summary>
      <form action={action} className="mt-4 space-y-4" noValidate>
        <input name="moderationActionId" type="hidden" value={moderationActionId} />
        <div>
          <Label htmlFor={reasonId}>Reversal reason</Label>
          <Textarea
            aria-describedby={errorId}
            aria-invalid={reasonError === undefined ? undefined : true}
            className="mt-2 min-h-24"
            id={reasonId}
            maxLength={1000}
            minLength={10}
            name="reason"
            required
          />
          <FieldError id={errorId} message={reasonError} />
        </div>
        <ModerationActionFeedback state={state} />
        <Button disabled={pending} type="submit" variant="outline">
          {pending ? "Reversing…" : "Record reversal"}
        </Button>
      </form>
    </details>
  );
}
