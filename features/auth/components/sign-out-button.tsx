"use client";

import { useActionState, useEffect } from "react";

import { Button } from "@/components/ui/button";
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
      <Button disabled={pending} size="sm" type="submit" variant="outline">
        {pending ? "Signing out…" : "Sign out"}
      </Button>
      {state?.ok === false ? (
        <span className="ml-2 text-xs text-sand" role="alert">
          {state.error.message}
        </span>
      ) : null}
    </form>
  );
}
