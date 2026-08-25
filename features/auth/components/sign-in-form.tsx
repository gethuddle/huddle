"use client";

import { useActionState, useEffect } from "react";

import { signInAction } from "@/features/auth/actions";
import {
  AUTH_INPUT_CLASS_NAME,
  AUTH_SUBMIT_CLASS_NAME,
  FieldError,
  FormFeedback,
} from "@/features/auth/components/form-feedback";
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
        <label className="text-sm font-semibold text-linen" htmlFor="sign-in-email">
          Email address
        </label>
        <input
          aria-describedby="sign-in-email-error"
          aria-invalid={fieldErrors?.email === undefined ? undefined : true}
          autoComplete="email"
          className={AUTH_INPUT_CLASS_NAME}
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
        <label className="text-sm font-semibold text-linen" htmlFor="sign-in-password">
          Password
        </label>
        <input
          aria-describedby="sign-in-password-error"
          aria-invalid={fieldErrors?.password === undefined ? undefined : true}
          autoComplete="current-password"
          className={AUTH_INPUT_CLASS_NAME}
          id="sign-in-password"
          name="password"
          required
          type="password"
        />
        <FieldError id="sign-in-password-error" messages={fieldErrors?.password} />
      </div>

      <FormFeedback state={state} />

      <button className={AUTH_SUBMIT_CLASS_NAME} disabled={pending} type="submit">
        {pending ? "Signing in…" : "Sign in"}
      </button>
    </form>
  );
}
