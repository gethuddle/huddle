"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import {
  CHECKOUT_CONFIRMATION_POLL_INTERVAL_MS,
  CHECKOUT_CONFIRMATION_POLL_TIMEOUT_MS,
} from "../constants";

export function CheckoutConfirmation({ billingHref }: { billingHref: string }) {
  const router = useRouter();
  const [waitingEnded, setWaitingEnded] = useState(false);
  const [started] = useState(() => Date.now());
  useEffect(() => {
    if (waitingEnded) return;
    const timer = setInterval(() => {
      if (Date.now() - started >= CHECKOUT_CONFIRMATION_POLL_TIMEOUT_MS) {
        clearInterval(timer);
        setWaitingEnded(true);
      } else router.refresh();
    }, CHECKOUT_CONFIRMATION_POLL_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [router, started, waitingEnded]);
  return (
    <div className="space-y-4">
      <p role="status" className="text-muted-foreground">
        {waitingEnded
          ? "We’re still confirming your demo subscription. You can return to Billing and check again."
          : "This may take a moment. This page will check for confirmation automatically."}
      </p>
      <Link className="font-medium text-forest underline underline-offset-4" href={billingHref}>
        Return to Billing
      </Link>
    </div>
  );
}
