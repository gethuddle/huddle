import Link from "next/link";
import { Alert, AlertDescription } from "@/components/ui/alert";
import type { VenueBillingContext } from "../types";

export function billingDate(value: string | null) {
  if (!value || !Number.isFinite(Date.parse(value))) return "the displayed deadline";
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Jerusalem",
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

export function billingStatusMessage(context: VenueBillingContext): string | null {
  const deadline = billingDate(context.graceExpiresAt);
  switch (context.state) {
    case "active":
      return null;
    case "payment_required":
      return "Your venue is private. Choose a demo plan to publish it.";
    case "confirming":
      return "We're confirming your demo subscription. Your venue is still private.";
    case "past_due":
      return `Your venue and events are hidden. Update the demo payment method by ${deadline} to keep managing this workspace.`;
    case "provider_stale":
      return `We're confirming your demo subscription. Your venue and events are hidden for now. Check Billing by ${deadline}.`;
    case "legacy_grace":
      return `Your venue and events are now private. Choose a demo plan by ${deadline} to keep your existing schedule.`;
    case "canceling":
      return `Your demo subscription ends on ${billingDate(context.paidThroughAt)}. Events from that date onward are hidden and will be cancelled when access ends.`;
    case "expired":
      return context.canOpenPortal
        ? "This venue is private and editing is locked. Open Billing to recover the existing demo subscription."
        : "This venue is private and editing is locked. Choose a demo plan to continue.";
  }
}

export function BillingStatusBanner({
  context,
  slug,
}: Readonly<{ context: VenueBillingContext; slug: string }>) {
  const message = billingStatusMessage(context);
  if (!message) return null;
  return (
    <Alert className="mt-6" role="status">
      <AlertDescription>
        <p>{message}</p>
        <Link
          className="mt-2 inline-flex min-h-11 items-center font-semibold text-forest underline underline-offset-4"
          href={`/venues/${slug}/workspace/billing`}
        >
          Open Billing
        </Link>
      </AlertDescription>
    </Alert>
  );
}
