"use client";

import { LogOut } from "lucide-react";
import { useActionState, useEffect } from "react";

import { Button } from "@/components/ui/button";
import { signOutAction } from "@/features/auth/actions";
import { INITIAL_AUTH_ACTION_STATE } from "@/features/auth/state";
import { clearOnboardingSessionDrafts } from "@/features/onboarding/session-form-draft";
import { cn } from "@/lib/utils";

export function SignOutButton({ className }: Readonly<{ className?: string }>) {
  const [state, formAction, pending] = useActionState(signOutAction, INITIAL_AUTH_ACTION_STATE);

  useEffect(() => {
    if (state?.ok === true && state.data.redirectTo !== null) {
      clearOnboardingSessionDrafts();
      // Replacing the document clears in-memory private caches as well as UI state.
      window.location.replace(state.data.redirectTo);
    }
  }, [state]);

  return (
    <form action={formAction}>
      <Button
        className={cn("px-2.5 xl:px-3", className)}
        disabled={pending}
        size="sm"
        type="submit"
        variant="outline"
      >
        <LogOut aria-hidden="true" />
        <span className="sr-only xl:not-sr-only">{pending ? "Signing out…" : "Sign out"}</span>
      </Button>
      {state?.ok === false ? (
        <span className="ml-2 text-xs text-sand" role="alert">
          {state.error.message}
        </span>
      ) : null}
    </form>
  );
}
