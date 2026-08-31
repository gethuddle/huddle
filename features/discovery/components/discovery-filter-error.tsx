import Link from "next/link";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import type { DiscoveryFilterFieldErrors } from "@/features/discovery/schemas";

export function DiscoveryFilterError({
  errors,
  resetHref,
}: Readonly<{ errors: DiscoveryFilterFieldErrors; resetHref: string }>) {
  const messages = [...new Set(Object.values(errors))];

  return (
    <Alert className="mx-auto mt-5 max-w-4xl border-destructive/25 bg-destructive/5" role="alert">
      <AlertTitle>Check your search dates</AlertTitle>
      <AlertDescription>
        <ul className="mt-1 list-disc space-y-1 pl-5">
          {messages.map((message) => (
            <li key={message}>{message}</li>
          ))}
        </ul>
        <Button asChild className="mt-4" size="sm" variant="outline">
          <Link href={resetHref}>Reset dates</Link>
        </Button>
      </AlertDescription>
    </Alert>
  );
}
