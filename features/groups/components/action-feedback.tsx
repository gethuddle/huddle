"use client";

import { useState } from "react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { GroupMembershipActionState } from "@/features/groups/state";

export function GroupActionFeedback({ state }: Readonly<{ state: GroupMembershipActionState }>) {
  const [copiedUrl, setCopiedUrl] = useState<string | null>(null);
  if (state === null) return null;

  const inviteUrl =
    state.ok && state.data.invitePath !== undefined && typeof window !== "undefined"
      ? new URL(state.data.invitePath, window.location.origin).toString()
      : null;

  return (
    <Alert
      className={state.ok ? "border-court/30 bg-court/10" : undefined}
      role={state.ok ? "status" : "alert"}
      variant={state.ok ? "default" : "destructive"}
    >
      <AlertDescription className={state.ok ? "text-forest-hover" : "text-sand"}>
        {state.ok ? state.data.message : state.error.message}
      </AlertDescription>
      {inviteUrl === null ? null : (
        <div className="mt-4 flex flex-col gap-2 sm:flex-row">
          <Input aria-label="New invitation URL" readOnly value={inviteUrl} />
          <Button
            onClick={async () => {
              await navigator.clipboard.writeText(inviteUrl);
              setCopiedUrl(inviteUrl);
            }}
            type="button"
            variant="outline"
          >
            {copiedUrl === inviteUrl ? "Copied" : "Copy"}
          </Button>
        </div>
      )}
    </Alert>
  );
}
