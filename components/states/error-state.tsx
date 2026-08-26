"use client";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type ErrorStateProps = Readonly<{
  title: string;
  description: string;
  onRetry?: () => void;
  reference?: string;
}>;

export function ErrorState({ title, description, onRetry, reference }: ErrorStateProps) {
  return (
    <Card
      aria-labelledby="error-state-title"
      className="mx-auto my-16 w-full max-w-2xl rounded-[2rem] border-sand/30 p-8 text-center sm:p-12"
      role="alert"
    >
      <CardHeader>
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-sand">
          Unable to continue
        </p>
        <CardTitle className="mt-3 text-3xl font-semibold tracking-[-0.04em] text-linen">
          <h1 id="error-state-title">{title}</h1>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <p className="mx-auto max-w-xl leading-7 text-muted-dark">{description}</p>
        {reference === undefined ? null : (
          <p className="mt-4 text-xs text-muted-dark">Reference: {reference}</p>
        )}
        {onRetry === undefined ? null : (
          <Button className="mt-7" onClick={onRetry} size="lg" type="button">
            Try again
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
