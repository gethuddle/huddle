"use client";

import { useState, useTransition } from "react";
import { unstable_rethrow } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { startVenueCheckoutAction } from "../actions";
import type { VenueBillingPlanKey } from "../types";

export function VenuePlanPicker({
  venueId,
  pendingCheckout,
}: {
  venueId: string;
  pendingCheckout: boolean;
}) {
  const [plan, setPlan] = useState<VenueBillingPlanKey>("monthly");
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  return (
    <form
      className="space-y-5"
      onSubmit={(event) => {
        event.preventDefault();
        startTransition(async () => {
          setMessage(null);
          try {
            const result = await startVenueCheckoutAction({ venueId, plan });
            if (!result.ok) setMessage(result.error.message);
          } catch (error) {
            unstable_rethrow(error);
            setMessage("Checkout could not open. Please try again.");
          }
        });
      }}
    >
      <p className="text-sm leading-6 text-muted-foreground">
        Polar Sandbox demo. No real money will be charged. Your venue remains Unverified.
      </p>
      {pendingCheckout ? (
        <p className="text-sm text-muted-foreground">
          We will check your existing checkout. Its existing plan is kept until that checkout
          finishes.
        </p>
      ) : (
        <fieldset disabled={pending} className="grid gap-3 sm:grid-cols-2">
          <legend className="mb-3 font-semibold">Choose your demo plan</legend>
          {(
            [
              { key: "monthly", label: "Monthly — ₪15/month" },
              { key: "yearly", label: "Annual — ₪150/year" },
            ] as const
          ).map((option) => (
            <label
              key={option.key}
              className="flex cursor-pointer items-center gap-3 rounded-2xl border border-border p-4"
            >
              <input
                type="radio"
                name="plan"
                value={option.key}
                checked={plan === option.key}
                onChange={() => setPlan(option.key)}
                className="size-4 accent-court"
              />
              <span>{option.label}</span>
            </label>
          ))}
        </fieldset>
      )}
      {message ? (
        <Alert role="alert">
          <AlertDescription>{message}</AlertDescription>
        </Alert>
      ) : null}
      <Button type="submit" disabled={pending}>
        {pending
          ? "Checking checkout…"
          : pendingCheckout
            ? "Check checkout"
            : "Continue to demo checkout"}
      </Button>
    </form>
  );
}
