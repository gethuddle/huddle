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
  blocked = false,
}: Readonly<{ complete: boolean; label: string; detail: string; blocked?: boolean }>) {
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
        <div className="flex flex-wrap items-center gap-2">
          <p className="font-semibold text-linen">{label}</p>
          <Badge variant={complete ? "default" : "secondary"}>
            {complete ? "Completed" : blocked ? "Cannot start yet" : "Incomplete"}
          </Badge>
        </div>
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
      ? "Sharing by invitation"
      : progress.gateSatisfied
        ? "Ready for search"
        : "Keep setting up";

  return (
    <Card className="mt-10 border-court/25 bg-court/5">
      <CardHeader className="gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-court">
            Appear in search after
          </p>
          <CardTitle className="mt-2 text-2xl text-linen">A short setup list</CardTitle>
        </div>
        <Badge variant={progress.gateSatisfied ? "default" : "secondary"}>{statusLabel}</Badge>
      </CardHeader>
      <CardContent>
        {visibility === "unlisted" ? (
          <p className="mb-5 max-w-3xl text-sm leading-6 text-muted-dark">
            This group will not appear in search. These setup tasks still make it ready for invited
            supporters.
          </p>
        ) : null}
        <ul className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          <GateFact
            complete={progress.activeMemberCount >= 5}
            detail={`${progress.activeMemberCount} of 5 active members are here.`}
            label={
              progress.activeMemberCount >= 5
                ? "Member goal reached"
                : `Invite ${5 - progress.activeMemberCount} more member${5 - progress.activeMemberCount === 1 ? "" : "s"}`
            }
          />
          <GateFact
            complete={progress.activeModeratorCount >= 2 && progress.ownerIsActive}
            detail={
              progress.ownerIsActive
                ? `${progress.activeModeratorCount} of 2 owner/admin roles are active.`
                : "The owner must be active before the group can appear in search."
            }
            label={
              !progress.ownerIsActive
                ? "Restore the owner"
                : progress.activeModeratorCount >= 2
                  ? "Admin goal reached"
                  : `Add ${2 - progress.activeModeratorCount} more admin${2 - progress.activeModeratorCount === 1 ? "" : "s"}`
            }
          />
          <GateFact
            complete={progress.hasDescription}
            detail="Tell supporters who the group is for."
            label={progress.hasDescription ? "Description added" : "Add a short description"}
          />
          <GateFact
            complete={progress.hasPublishedRule}
            detail="One visible rule sets a clear expectation."
            label={progress.hasPublishedRule ? "Rule added" : "Add one rule"}
          />
          <GateFact
            complete={progress.hasFutureEvent}
            blocked={!progress.hasPublishedRule}
            detail="An owner/admin event publishes directly; a member submission needs another reviewer."
            label={
              progress.hasFutureEvent ? "Upcoming event published" : "Publish one upcoming event"
            }
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
