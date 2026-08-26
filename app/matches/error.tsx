"use client";

import { ErrorState } from "@/components/states/error-state";

type MatchesErrorProps = Readonly<{
  error: Error & { digest?: string };
  reset: () => void;
}>;

export default function MatchesError({ error, reset }: MatchesErrorProps) {
  return (
    <ErrorState
      description="The local fixture catalog could not be read. No external provider call was attempted from this page."
      onRetry={reset}
      reference={error.digest}
      title="We couldn’t load the fixtures."
    />
  );
}
