"use client";

import { useActionState, useEffect, useState } from "react";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { signInAction } from "@/features/auth/actions";
import { FieldError, FormFeedback } from "@/features/auth/components/form-feedback";
import { INITIAL_AUTH_ACTION_STATE } from "@/features/auth/state";
import { TurnstileWidget } from "@/features/auth/components/turnstile-widget";

export function SignInForm({
  nextPath = null,
  turnstileSiteKey,
}: Readonly<{ nextPath?: string | null; turnstileSiteKey?: string }>) {
  const [state, formAction, pending] = useActionState(signInAction, INITIAL_AUTH_ACTION_STATE);
  const fieldErrors = state?.ok === false ? state.error.fields : undefined;
  const [turnstileReady, setTurnstileReady] = useState(turnstileSiteKey === undefined);

  useEffect(() => {
    if (state?.ok === true && state.data.redirectTo !== null) {
      // A hard navigation discards any private in-memory browser/query state.
      window.location.replace(state.data.redirectTo);
    }
  }, [state]);

  return (
    <form action={formAction} className="space-y-5" noValidate>
      {nextPath === null ? null : <input name="next" type="hidden" value={nextPath} />}
      <div>
        <Label className="text-foreground" htmlFor="sign-in-email">
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
        <div className="flex items-center justify-between gap-3">
          <Label className="text-foreground" htmlFor="sign-in-password">
            Password
          </Label>
          <Link
            className="text-sm font-semibold text-forest hover:text-forest-hover hover:underline"
            href="/auth/forgot-password"
          >
            Forgot password?
          </Link>
        </div>
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

      {turnstileSiteKey === undefined ? null : (
        <TurnstileWidget
          action="login"
          onTokenChange={(token) => setTurnstileReady(token !== "")}
          resetKey={state}
          siteKey={turnstileSiteKey}
        />
      )}

      <Button className="w-full" disabled={pending || !turnstileReady} size="lg" type="submit">
        {pending ? "Signing in…" : "Sign in"}
      </Button>
    </form>
  );
}
