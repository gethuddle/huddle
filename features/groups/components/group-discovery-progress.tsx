"use client";

import { CircleCheck, CircleDashed } from "lucide-react";
import { useActionState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
    <li className="flex gap-3 rounded-xl border border-border-dark bg-surface-deep p-4">
      <Icon
        aria-hidden="true"
        className={
          complete ? "mt-0.5 size-5 shrink-0 text-court" : "mt-0.5 size-5 shrink-0 text-sand"
        }
      />
      <div>
        <p className="font-semibold text-linen">{label}</p>
        <p className="mt-1 text-sm leading-6 text-muted-dark">{detail}</p>
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

  const statusLabel =
    visibility === "unlisted"
      ? "Unlisted by choice"
      : progress.gateSatisfied
        ? "Visible in group search"
        : "Still forming";

  return (
    <Card className="mt-10 border-court/25 bg-court/5">
      <CardHeader className="gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-court">
            Discovery readiness
          </p>
          <CardTitle className="mt-2 text-2xl text-linen">
            What makes this group searchable
          </CardTitle>
        </div>
        <Badge variant={progress.gateSatisfied ? "default" : "secondary"}>{statusLabel}</Badge>
      </CardHeader>
      <CardContent>
        {visibility === "unlisted" ? (
          <p className="mb-5 max-w-3xl text-sm leading-6 text-muted-dark">
            Unlisted groups never appear in search. The facts below are still useful if the group is
            changed to discoverable later.
          </p>
        ) : null}
        <ul className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          <GateFact
            complete={progress.activeMemberCount >= 5}
            detail={`${progress.activeMemberCount} of 5 eligible active members`}
            label="Five active members"
          />
          <GateFact
            complete={progress.activeModeratorCount >= 2 && progress.ownerIsActive}
            detail={`${progress.activeModeratorCount} of 2 active owner/admin roles; owner ${progress.ownerIsActive ? "active" : "not active"}`}
            label="Two moderators, including owner"
          />
          <GateFact
            complete={progress.hasDescription}
            detail="A plain-text description helps supporters understand the group."
            label="Group description"
          />
          <GateFact
            complete={progress.hasPublishedRule}
            detail="At least one rule must be published in the Rules section."
            label="Published rule"
          />
          <GateFact
            complete={progress.hasFutureEvent}
            detail="At least one reviewed, published future group event is required."
            label="Approved future event"
          />
          <GateFact
            complete={progress.lifecycle === "active"}
            detail={`Current lifecycle: ${progress.lifecycle}`}
            label="Lifecycle synchronized"
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
            placeholder="What brings this supporter group together?"
          />
          <div className="flex flex-wrap items-center gap-3">
            <Button disabled={pending} type="submit">
              {pending ? "Saving…" : "Save description"}
            </Button>
            <span className="text-xs text-muted-dark">Plain text · up to 2,000 characters</span>
          </div>
          <GroupActionFeedback state={state} />
        </form>
      </CardContent>
    </Card>
  );
}
