"use client";

import { Alert, AlertDescription } from "@/components/ui/alert";
import type { ModerationActionState } from "@/features/moderation/state";

export function ModerationActionFeedback({
  state,
}: Readonly<{ state: ModerationActionState | null }>) {
  if (state === null) return null;
  return state.ok ? (
    <Alert className="border-court/30 bg-court/10 text-forest-hover" role="status">
      <AlertDescription className="text-forest-hover">{state.data.message}</AlertDescription>
    </Alert>
  ) : (
    <Alert variant="destructive">
      <AlertDescription className="text-sand">{state.error.message}</AlertDescription>
    </Alert>
  );
}
