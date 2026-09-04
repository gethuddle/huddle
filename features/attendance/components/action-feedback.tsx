"use client";

import { Alert, AlertDescription } from "@/components/ui/alert";
import type { AttendanceActionState } from "@/features/attendance/state";

export function AttendanceActionFeedback({
  state,
  error,
}: Readonly<{ state: AttendanceActionState | undefined; error?: unknown }>) {
  if (error != null) {
    return (
      <Alert role="alert" variant="destructive">
        <AlertDescription>
          We couldn&apos;t confirm this change. Check the current event state before trying again.
        </AlertDescription>
      </Alert>
    );
  }
  if (state === undefined) return null;
  return (
    <Alert
      className={state.ok ? "border-court/30 bg-court/10" : undefined}
      role={state.ok ? "status" : "alert"}
      variant={state.ok ? "default" : "destructive"}
    >
      <AlertDescription className={state.ok ? "text-forest-hover" : "text-sand"}>
        {state.ok ? state.data.message : state.error.message}
      </AlertDescription>
    </Alert>
  );
}
