"use client";

import Link from "next/link";

import { fanRecovery } from "@/features/auth/fan-recovery";
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
        {!state.ok && state.error.code === "PROFILE_INCOMPLETE" ? (
          <Link
            className="mt-2 block font-semibold underline"
            href={fanRecovery(state.error.code).actionHref}
          >
            {fanRecovery(state.error.code).actionLabel}
          </Link>
        ) : null}
      </AlertDescription>
    </Alert>
  );
}
