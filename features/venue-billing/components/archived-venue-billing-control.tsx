"use client";

import { useState, useTransition } from "react";
import { unstable_rethrow } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { openArchivedVenueBillingPortalAction } from "../actions";

export function ArchivedVenueBillingControl({ slug }: { slug: string }) {
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  return (
    <div className="space-y-4">
      <Button
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            setMessage(null);
            try {
              const result = await openArchivedVenueBillingPortalAction({ slug });
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
      {message ? (
        <Alert role="alert">
          <AlertDescription>{message}</AlertDescription>
        </Alert>
      ) : null}
    </div>
  );
}
