"use client";

import { useActionState, useEffect } from "react";

import { signOutAction } from "@/features/auth/actions";
import { INITIAL_AUTH_ACTION_STATE } from "@/features/auth/state";

export function SignOutButton() {
  const [state, formAction, pending] = useActionState(signOutAction, INITIAL_AUTH_ACTION_STATE);

  useEffect(() => {
    if (state?.ok === true && state.data.redirectTo !== null) {
      // Replacing the document clears private client caches as well as UI state.
      window.location.replace(state.data.redirectTo);
    }
  }, [state]);

  return (
    <form action={formAction}>
      <button
        className="rounded-xl border border-border-strong px-3 py-2 text-xs font-semibold text-muted-dark transition hover:border-court/50 hover:text-linen disabled:cursor-wait disabled:opacity-70"
        disabled={pending}
        type="submit"
      >
        {pending ? "Signing out…" : "Sign out"}
      </button>
      {state?.ok === false ? (
        <span className="ml-2 text-xs text-sand" role="alert">
          {state.error.message}
        </span>
      ) : null}
    </form>
  );
}
