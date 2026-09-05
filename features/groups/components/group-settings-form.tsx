"use client";

import { useActionState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { GroupActionFeedback } from "@/features/groups/components/action-feedback";
import { updateGroupDescriptionAction } from "@/features/groups/membership-actions";
import { INITIAL_GROUP_MEMBERSHIP_ACTION_STATE } from "@/features/groups/state";

export function GroupSettingsForm({
  description,
  groupId,
  groupSlug,
  visibility,
}: Readonly<{
  description: string | null;
  groupId: string;
  groupSlug: string;
  visibility: "discoverable" | "unlisted";
}>) {
  const [state, formAction, pending] = useActionState(
    updateGroupDescriptionAction,
    INITIAL_GROUP_MEMBERSHIP_ACTION_STATE,
  );
  return (
    <div className="grid gap-7 lg:grid-cols-[minmax(0,1fr)_18rem]">
      <form action={formAction} className="space-y-3">
        <input name="groupId" type="hidden" value={groupId} />
        <input name="groupSlug" type="hidden" value={groupSlug} />
        <Label htmlFor="group-settings-description">Short description</Label>
        <Textarea
          defaultValue={description ?? ""}
          id="group-settings-description"
          maxLength={2000}
          name="description"
        />
        <Button disabled={pending} type="submit">
          {pending ? "Saving…" : "Save description"}
        </Button>
        <GroupActionFeedback state={state} />
      </form>
      <div className="rounded-xl border border-border p-4">
        <Badge variant="outline">
          {visibility === "discoverable" ? "Discoverable" : "Unlisted"}
        </Badge>
        <p className="mt-3 text-sm leading-6 text-muted-foreground">
          {visibility === "discoverable"
            ? "People can find the group and apply while it has an active owner and a description. Every application is reviewed."
            : "The group stays out of search. Owners and admins share controlled invitation links."}
        </p>
      </div>
    </div>
  );
}
