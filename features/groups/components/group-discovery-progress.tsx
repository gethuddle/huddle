"use client";

import { CircleCheck, CircleDashed } from "lucide-react";
import { useActionState } from "react";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { GroupActionFeedback } from "@/features/groups/components/action-feedback";
import type { GroupDiscoveryProgress as GroupDiscoveryProgressValue } from "@/features/groups/discovery";
import { updateGroupDescriptionAction } from "@/features/groups/membership-actions";
import { INITIAL_GROUP_MEMBERSHIP_ACTION_STATE } from "@/features/groups/state";

type GroupDiscoveryProgressProps = Readonly<{
  groupId: string;
  groupSlug: string;
  description: string | null;
  visibility: "discoverable" | "unlisted";
  progress: GroupDiscoveryProgressValue;
}>;

function GateFact({
  complete,
  label,
  detail,
}: Readonly<{ complete: boolean; label: string; detail: string }>) {
  const Icon = complete ? CircleCheck : CircleDashed;
  return (
    <li className="flex gap-3 py-3">
      <Icon
        aria-hidden="true"
        className={
          complete ? "mt-0.5 size-5 shrink-0 text-forest" : "mt-0.5 size-5 shrink-0 text-sand"
        }
      />
      <div>
        <p className="font-semibold text-foreground">{label}</p>
        <p className="mt-1 text-sm leading-6 text-muted-foreground">{detail}</p>
      </div>
    </li>
  );
}

export function GroupDiscoveryProgress({
  groupId,
  groupSlug,
  description,
  visibility,
  progress,
}: GroupDiscoveryProgressProps) {
  const [state, formAction, pending] = useActionState(
    updateGroupDescriptionAction,
    INITIAL_GROUP_MEMBERSHIP_ACTION_STATE,
  );

  return (
    <details
      className="mt-8 rounded-xl border border-border bg-card px-5 py-4"
      open={!progress.gateSatisfied}
    >
      <summary className="cursor-pointer font-semibold text-foreground">
        {progress.gateSatisfied
          ? "Search and setup details"
          : "Finish making this group searchable"}
      </summary>
      <div className="mt-5 border-t border-border pt-5">
        {visibility === "unlisted" ? (
          <p className="mb-5 max-w-3xl text-sm leading-6 text-muted-foreground">
            This group will not appear in search. These setup tasks still make it ready for the
            people you invite.
          </p>
        ) : null}
        <p className="mb-5 max-w-3xl text-sm leading-6 text-muted-foreground">
          Add a clear description and keep an active owner. Members, rules, and events are optional
          and never block search.
        </p>
        <ul className="grid divide-y divide-border md:grid-cols-2 md:divide-x md:divide-y-0">
          <GateFact
            complete={progress.hasDescription}
            detail="Tell people who the group is for."
            label={progress.hasDescription ? "Description added" : "Add a short description"}
          />
          <GateFact
            complete={progress.ownerIsActive}
            detail="The group owner remains the accountable contact for applications and safety."
            label={progress.ownerIsActive ? "Owner active" : "Owner unavailable"}
          />
        </ul>

        <form action={formAction} className="mt-6 space-y-3">
          <input name="groupId" type="hidden" value={groupId} />
          <input name="groupSlug" type="hidden" value={groupSlug} />
          <Label htmlFor="group-discovery-description">Group description</Label>
          <Textarea
            className="min-h-28 resize-y"
            defaultValue={description ?? ""}
            id="group-discovery-description"
            maxLength={2000}
            name="description"
            placeholder="What brings this group together?"
          />
          <div className="flex flex-wrap items-center gap-3">
            <Button disabled={pending} type="submit">
              {pending ? "Saving…" : "Save description"}
            </Button>
            <span className="text-xs text-muted-foreground">
              Plain text · up to 2,000 characters
            </span>
          </div>
          <GroupActionFeedback state={state} />
        </form>
      </div>
    </details>
  );
}
