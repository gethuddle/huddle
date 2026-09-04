"use client";

import { useState, useTransition } from "react";
import { unstable_rethrow } from "next/navigation";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { openVenueBillingPortalAction } from "../actions";
import type { VenueBillingContext } from "../types";
import { billingDate } from "./billing-status-banner";
import { VenuePlanPicker } from "./venue-plan-picker";

export function VenueBillingPanel({
  context,
  venueId,
}: Readonly<{ context: VenueBillingContext; venueId: string }>) {
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  return (
    <Card>
      <CardHeader>
        <h2 className="text-xl font-semibold">Demo subscription</h2>
        <p className="text-sm text-muted-foreground">
          Polar Sandbox. No real money will be charged. Your venue remains Unverified.
        </p>
        <Badge variant="outline" className="w-fit">
          {context.isPublic ? "Venue is public" : "Venue is private"}
        </Badge>
      </CardHeader>
      <CardContent className="space-y-5">
        <p className="text-sm">Monthly — ₪15/month · Annual — ₪150/year</p>
        {context.interval ? (
          <p>Current plan: {context.interval === "month" ? "Monthly" : "Annual"}</p>
        ) : null}
        {context.paidThroughAt ? (
          <p className="text-sm text-muted-foreground">
            {context.state === "canceling" ? "Access ends" : "Paid through"}:{" "}
            {billingDate(context.paidThroughAt)} (Israel time)
          </p>
        ) : null}
        {!context.canManageBilling ? (
          <p className="text-muted-foreground">Only the venue owner can manage billing.</p>
        ) : context.canOpenPortal ? (
          <Button
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                setMessage(null);
                try {
                  const result = await openVenueBillingPortalAction({ venueId });
                  if (!result.ok) setMessage(result.error.message);
                } catch (error) {
                  unstable_rethrow(error);
                  setMessage("The billing portal could not open. Please try again.");
                }
              })
            }
          >
            {pending ? "Opening portal…" : "Open billing portal"}
          </Button>
        ) : context.canStartCheckout || context.checkoutPending ? (
          <VenuePlanPicker venueId={venueId} pendingCheckout={context.checkoutPending} />
        ) : (
          <p className="text-muted-foreground">
            We&apos;re confirming your demo subscription. Refresh Billing to check progress.
          </p>
        )}
        {message ? (
          <Alert role="alert">
            <AlertDescription>{message}</AlertDescription>
          </Alert>
        ) : null}
      </CardContent>
    </Card>
  );
}
