"use client";

import { useActionState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { updatePasswordAction } from "@/features/auth/actions";
import { FieldError, FormFeedback } from "@/features/auth/components/form-feedback";
import { INITIAL_AUTH_ACTION_STATE } from "@/features/auth/state";

export function ResetPasswordForm() {
  const [state, formAction, pending] = useActionState(
    updatePasswordAction,
    INITIAL_AUTH_ACTION_STATE,
  );
  const fieldErrors = state?.ok === false ? state.error.fields : undefined;

  return (
    <form action={formAction} className="space-y-5" noValidate>
      <div>
        <Label className="text-foreground" htmlFor="new-password">
          New password
        </Label>
        <Input
          aria-describedby="new-password-help new-password-error"
          aria-invalid={fieldErrors?.password === undefined ? undefined : true}
          autoComplete="new-password"
          className="mt-2"
          id="new-password"
          name="password"
          required
          type="password"
        />
        <span className="mt-2 block text-xs text-muted-foreground" id="new-password-help">
          Use 15–72 characters.
        </span>
        <FieldError id="new-password-error" messages={fieldErrors?.password} />
      </div>

      <div>
        <Label className="text-foreground" htmlFor="confirm-new-password">
          Confirm new password
        </Label>
        <Input
          aria-describedby="confirm-new-password-error"
          aria-invalid={fieldErrors?.confirmPassword === undefined ? undefined : true}
          autoComplete="new-password"
          className="mt-2"
          id="confirm-new-password"
          name="confirmPassword"
          required
          type="password"
        />
        <FieldError id="confirm-new-password-error" messages={fieldErrors?.confirmPassword} />
      </div>

      <FormFeedback state={state} />

      <Button className="w-full" disabled={pending} size="lg" type="submit">
        {pending ? "Updating password…" : "Update password"}
      </Button>
    </form>
  );
}
