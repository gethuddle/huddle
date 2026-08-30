"use client";

import { ErrorState } from "@/components/states/error-state";

type MatchesErrorProps = Readonly<{
  error: Error & { digest?: string };
  reset: () => void;
}>;

export default function MatchesError({ error, reset }: MatchesErrorProps) {
  return (
    <ErrorState
      description="Fixtures could not be loaded right now. Try again in a moment."
      onRetry={reset}
      reference={error.digest}
      title="We couldn’t load the fixtures."
    />
  );
}
