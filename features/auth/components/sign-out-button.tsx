"use client";

import { LogOut } from "lucide-react";
import { useActionState } from "react";

import { Button } from "@/components/ui/button";
import { signOutAction } from "@/features/auth/actions";
import { INITIAL_AUTH_ACTION_STATE } from "@/features/auth/state";

export function SignOutButton({ className }: Readonly<{ className?: string }>) {
  const [state, formAction, pending] = useActionState(signOutAction, INITIAL_AUTH_ACTION_STATE);

  return (
    <form action={formAction}>
      <Button className={className} disabled={pending} type="submit" variant="outline">
        <LogOut aria-hidden="true" />
        <span>{pending ? "Signing out…" : "Sign out"}</span>
      </Button>
      {state?.ok === false ? (
        <span className="ml-2 text-xs text-sand" role="alert">
          {state.error.message}
        </span>
      ) : null}
    </form>
  );
}
