"use client";

import { useActionState, useEffect, useState } from "react";

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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { deleteAccountAction } from "@/features/account-erasure/actions";
import { FieldError, FormFeedback } from "@/features/auth/components/form-feedback";
import { INITIAL_AUTH_ACTION_STATE } from "@/features/auth/state";

function DeleteAccountForm({
  onPendingChange,
}: Readonly<{ onPendingChange: (pending: boolean) => void }>) {
  const [state, formAction, pending] = useActionState(
    deleteAccountAction,
    INITIAL_AUTH_ACTION_STATE,
  );
  const fieldErrors = state?.ok === false ? state.error.fields : undefined;

  useEffect(() => {
    onPendingChange(pending);
  }, [onPendingChange, pending]);

  return (
    <form action={formAction} className="space-y-4" noValidate>
      <div>
        <Label className="text-foreground" htmlFor="delete-account-current-password">
          Current password
        </Label>
        <Input
          aria-describedby="delete-account-current-password-error"
          aria-invalid={fieldErrors?.currentPassword === undefined ? undefined : true}
          autoComplete="current-password"
          className="mt-2"
          disabled={pending}
          id="delete-account-current-password"
          name="currentPassword"
          required
          type="password"
        />
        <FieldError
          id="delete-account-current-password-error"
          messages={fieldErrors?.currentPassword}
        />
      </div>

      <div>
        <Label className="text-foreground" htmlFor="delete-account-confirmation">
          Type DELETE to confirm
        </Label>
        <Input
          aria-describedby="delete-account-confirmation-help delete-account-confirmation-error"
          aria-invalid={fieldErrors?.confirmation === undefined ? undefined : true}
          autoComplete="off"
          className="mt-2"
          disabled={pending}
          id="delete-account-confirmation"
          maxLength={16}
          name="confirmation"
          required
          spellCheck={false}
          type="text"
        />
        <span
          className="mt-2 block text-xs text-muted-foreground"
          id="delete-account-confirmation-help"
        >
          Enter the uppercase word DELETE.
        </span>
        <FieldError id="delete-account-confirmation-error" messages={fieldErrors?.confirmation} />
      </div>

      <FormFeedback state={state} />

      <AlertDialogFooter>
        <AlertDialogCancel disabled={pending} type="button">
          Cancel
        </AlertDialogCancel>
        <Button disabled={pending} type="submit" variant="destructive">
          {pending ? "Deleting account…" : "Delete account permanently"}
        </Button>
      </AlertDialogFooter>
    </form>
  );
}

export function DeleteAccountControl() {
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);

  function handleOpenChange(nextOpen: boolean) {
    if (!nextOpen && pending) return;
    setOpen(nextOpen);
  }

  return (
    <AlertDialog onOpenChange={handleOpenChange} open={open}>
      <AlertDialogTrigger asChild>
        <Button type="button" variant="destructive">
          Delete account
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent
        className="max-h-[calc(100dvh-2rem)] overflow-y-auto"
        onEscapeKeyDown={(event) => {
          if (pending) event.preventDefault();
        }}
      >
        <AlertDialogHeader>
          <AlertDialogTitle>Delete your Huddle account?</AlertDialogTitle>
          <AlertDialogDescription>
            This will sign you out everywhere, remove your public identity and private data, archive
            groups and venues you own, and cancel upcoming events you host. Pseudonymous attendance
            and safety history is retained. This cannot be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <DeleteAccountForm onPendingChange={setPending} />
      </AlertDialogContent>
    </AlertDialog>
  );
}
