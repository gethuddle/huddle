"use client";

import Link from "next/link";
import { useActionState } from "react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { redeemEventInviteLinkAction } from "@/features/attendance/actions";
import type { EventInviteLinkActionState } from "@/features/attendance/state";

const INITIAL_STATE: EventInviteLinkActionState = null;

export function EventInviteRedemptionForm({ token }: Readonly<{ token: string }>) {
  const [state, formAction, pending] = useActionState(redeemEventInviteLinkAction, INITIAL_STATE);

  if (state?.ok === true && state.data.eventId !== undefined) {
    return (
      <div className="space-y-5">
        <p className="text-sm leading-6 text-muted-foreground" role="status">
          {state.data.message}
        </p>
        <Button asChild>
          <Link href={`/events/${state.data.eventId}?returnTo=/dashboard`}>Open invitation</Link>
        </Button>
      </div>
    );
  }

  return (
    <form action={formAction} className="space-y-5">
      <input name="token" type="hidden" value={token} />
      <p className="text-sm leading-6 text-muted-foreground">
        Continue to add this invitation to your Huddle account. This does not accept it or reserve a
        place; you will review the event first.
      </p>
      {state?.ok === false ? (
        <Alert role="alert" variant="destructive">
          <AlertDescription>{state.error.message}</AlertDescription>
        </Alert>
      ) : null}
      <Button disabled={pending} type="submit">
        {pending ? "Checking invitation…" : "Continue to invitation"}
      </Button>
    </form>
  );
}
