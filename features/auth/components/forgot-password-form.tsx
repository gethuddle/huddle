"use client";

import { useActionState, useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { requestPasswordResetAction } from "@/features/auth/actions";
import { FieldError, FormFeedback } from "@/features/auth/components/form-feedback";
import { INITIAL_AUTH_ACTION_STATE } from "@/features/auth/state";
import { TurnstileWidget } from "@/features/auth/components/turnstile-widget";

export function ForgotPasswordForm({ turnstileSiteKey }: Readonly<{ turnstileSiteKey?: string }>) {
  const [state, formAction, pending] = useActionState(
    requestPasswordResetAction,
    INITIAL_AUTH_ACTION_STATE,
  );
  const fieldErrors = state?.ok === false ? state.error.fields : undefined;
  const [turnstileReady, setTurnstileReady] = useState(turnstileSiteKey === undefined);

  useEffect(() => {
    if (state === null) return;
    if (state.ok && state.data.redirectTo !== null) window.location.replace(state.data.redirectTo);
  }, [state]);

  return (
    <form action={formAction} className="space-y-5" noValidate>
      <div>
        <Label className="text-foreground" htmlFor="password-reset-email">
          Email address
        </Label>
        <Input
          aria-describedby="password-reset-email-error"
          aria-invalid={fieldErrors?.email === undefined ? undefined : true}
          autoComplete="email"
          className="mt-2"
          id="password-reset-email"
          inputMode="email"
          name="email"
          placeholder="you@example.com"
          required
          type="email"
        />
        <FieldError id="password-reset-email-error" messages={fieldErrors?.email} />
      </div>

      <FormFeedback state={state} />

      {turnstileSiteKey === undefined ? null : (
        <TurnstileWidget
          action="password_reset"
          onTokenChange={(token) => setTurnstileReady(token !== "")}
          resetKey={state}
          siteKey={turnstileSiteKey}
        />
      )}

      <Button className="w-full" disabled={pending || !turnstileReady} size="lg" type="submit">
        {pending ? "Sending reset link…" : "Send reset link"}
      </Button>
    </form>
  );
}
