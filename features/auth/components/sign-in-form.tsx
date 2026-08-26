"use client";

import { useActionState, useEffect } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { signInAction } from "@/features/auth/actions";
import { FieldError, FormFeedback } from "@/features/auth/components/form-feedback";
import { INITIAL_AUTH_ACTION_STATE } from "@/features/auth/state";

export function SignInForm() {
  const [state, formAction, pending] = useActionState(signInAction, INITIAL_AUTH_ACTION_STATE);
  const fieldErrors = state?.ok === false ? state.error.fields : undefined;

  useEffect(() => {
    if (state?.ok === true && state.data.redirectTo !== null) {
      // A hard navigation discards any private in-memory browser/query state.
      window.location.replace(state.data.redirectTo);
    }
  }, [state]);

  return (
    <form action={formAction} className="space-y-5" noValidate>
      <div>
        <Label className="text-linen" htmlFor="sign-in-email">
          Email address
        </Label>
        <Input
          aria-describedby="sign-in-email-error"
          aria-invalid={fieldErrors?.email === undefined ? undefined : true}
          autoComplete="email"
          className="mt-2"
          id="sign-in-email"
          inputMode="email"
          name="email"
          placeholder="you@example.com"
          required
          type="email"
        />
        <FieldError id="sign-in-email-error" messages={fieldErrors?.email} />
      </div>

      <div>
        <Label className="text-linen" htmlFor="sign-in-password">
          Password
        </Label>
        <Input
          aria-describedby="sign-in-password-error"
          aria-invalid={fieldErrors?.password === undefined ? undefined : true}
          autoComplete="current-password"
          className="mt-2"
          id="sign-in-password"
          name="password"
          required
          type="password"
        />
        <FieldError id="sign-in-password-error" messages={fieldErrors?.password} />
      </div>

      <FormFeedback state={state} />

      <Button className="w-full" disabled={pending} size="lg" type="submit">
        {pending ? "Signing in…" : "Sign in"}
      </Button>
    </form>
  );
}
