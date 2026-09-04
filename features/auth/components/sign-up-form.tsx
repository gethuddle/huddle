"use client";

import { useActionState, useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { signUpAction } from "@/features/auth/actions";
import { FieldError, FormFeedback } from "@/features/auth/components/form-feedback";
import { INITIAL_AUTH_ACTION_STATE, type AuthActionState } from "@/features/auth/state";
import { TurnstileWidget } from "@/features/auth/components/turnstile-widget";

export function SignUpForm({ turnstileSiteKey }: Readonly<{ turnstileSiteKey?: string }>) {
  const [credentials, setCredentials] = useState({
    confirmPassword: "",
    email: "",
    password: "",
  });
  const [state, formAction, pending] = useActionState(
    async (previousState: AuthActionState, formData: FormData): Promise<AuthActionState> => {
      const nextState = await signUpAction(previousState, formData);
      if (nextState?.ok === true) setCredentials({ confirmPassword: "", email: "", password: "" });
      return nextState;
    },
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
        <Label className="text-foreground" htmlFor="sign-up-email">
          Email address
        </Label>
        <Input
          aria-describedby="sign-up-email-error"
          aria-invalid={fieldErrors?.email === undefined ? undefined : true}
          autoComplete="email"
          className="mt-2"
          id="sign-up-email"
          inputMode="email"
          name="email"
          onChange={(event) =>
            setCredentials((current) => ({ ...current, email: event.target.value }))
          }
          placeholder="you@example.com"
          required
          type="email"
          value={credentials.email}
        />
        <FieldError id="sign-up-email-error" messages={fieldErrors?.email} />
      </div>

      <div>
        <Label className="text-foreground" htmlFor="sign-up-password">
          Password
        </Label>
        <Input
          aria-describedby="sign-up-password-help sign-up-password-error"
          aria-invalid={fieldErrors?.password === undefined ? undefined : true}
          autoComplete="new-password"
          className="mt-2"
          id="sign-up-password"
          name="password"
          onChange={(event) =>
            setCredentials((current) => ({ ...current, password: event.target.value }))
          }
          required
          type="password"
          value={credentials.password}
        />
        <span className="mt-2 block text-xs text-muted-foreground" id="sign-up-password-help">
          Use 15–72 characters. A long passphrase works well.
        </span>
        <FieldError id="sign-up-password-error" messages={fieldErrors?.password} />
      </div>

      <div>
        <Label className="text-foreground" htmlFor="sign-up-confirm-password">
          Confirm password
        </Label>
        <Input
          aria-describedby="sign-up-confirm-password-error"
          aria-invalid={fieldErrors?.confirmPassword === undefined ? undefined : true}
          autoComplete="new-password"
          className="mt-2"
          id="sign-up-confirm-password"
          name="confirmPassword"
          onChange={(event) =>
            setCredentials((current) => ({ ...current, confirmPassword: event.target.value }))
          }
          required
          type="password"
          value={credentials.confirmPassword}
        />
        <FieldError id="sign-up-confirm-password-error" messages={fieldErrors?.confirmPassword} />
      </div>

      <FormFeedback state={state} />

      {turnstileSiteKey === undefined ? null : (
        <TurnstileWidget
          action="signup"
          onTokenChange={(token) => setTurnstileReady(token !== "")}
          resetKey={state}
          siteKey={turnstileSiteKey}
        />
      )}

      <Button className="w-full" disabled={pending || !turnstileReady} size="lg" type="submit">
        {pending ? "Creating account…" : "Create account"}
      </Button>
    </form>
  );
}
