"use client";

import { useActionState } from "react";

import { signUpAction } from "@/features/auth/actions";
import {
  AUTH_INPUT_CLASS_NAME,
  AUTH_SUBMIT_CLASS_NAME,
  FieldError,
  FormFeedback,
} from "@/features/auth/components/form-feedback";
import { INITIAL_AUTH_ACTION_STATE } from "@/features/auth/state";

export function SignUpForm() {
  const [state, formAction, pending] = useActionState(signUpAction, INITIAL_AUTH_ACTION_STATE);
  const fieldErrors = state?.ok === false ? state.error.fields : undefined;

  return (
    <form action={formAction} className="space-y-5" noValidate>
      <div>
        <label className="text-sm font-semibold text-linen" htmlFor="sign-up-email">
          Email address
        </label>
        <input
          aria-describedby="sign-up-email-error"
          aria-invalid={fieldErrors?.email === undefined ? undefined : true}
          autoComplete="email"
          className={AUTH_INPUT_CLASS_NAME}
          id="sign-up-email"
          inputMode="email"
          name="email"
          placeholder="you@example.com"
          required
          type="email"
        />
        <FieldError id="sign-up-email-error" messages={fieldErrors?.email} />
      </div>

      <div>
        <label className="text-sm font-semibold text-linen" htmlFor="sign-up-password">
          Password
        </label>
        <input
          aria-describedby="sign-up-password-help sign-up-password-error"
          aria-invalid={fieldErrors?.password === undefined ? undefined : true}
          autoComplete="new-password"
          className={AUTH_INPUT_CLASS_NAME}
          id="sign-up-password"
          name="password"
          required
          type="password"
        />
        <span className="mt-2 block text-xs text-muted-dark" id="sign-up-password-help">
          Use 8–72 characters.
        </span>
        <FieldError id="sign-up-password-error" messages={fieldErrors?.password} />
      </div>

      <div>
        <label className="text-sm font-semibold text-linen" htmlFor="sign-up-confirm-password">
          Confirm password
        </label>
        <input
          aria-describedby="sign-up-confirm-password-error"
          aria-invalid={fieldErrors?.confirmPassword === undefined ? undefined : true}
          autoComplete="new-password"
          className={AUTH_INPUT_CLASS_NAME}
          id="sign-up-confirm-password"
          name="confirmPassword"
          required
          type="password"
        />
        <FieldError id="sign-up-confirm-password-error" messages={fieldErrors?.confirmPassword} />
      </div>

      <FormFeedback state={state} />

      <button className={AUTH_SUBMIT_CLASS_NAME} disabled={pending} type="submit">
        {pending ? "Creating account…" : "Create account"}
      </button>
    </form>
  );
}
