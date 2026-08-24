"use client";

import { ErrorState } from "@/components/states/error-state";

type AppErrorProps = Readonly<{
  error: Error & { digest?: string };
  reset: () => void;
}>;

export default function AppError({ error, reset }: AppErrorProps) {
  return (
    <ErrorState
      description="The request could not be completed. No changes were made."
      onRetry={reset}
      reference={error.digest}
      title="Something went wrong"
    />
  );
}
