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
        <div className="flex flex-wrap items-center gap-2">
          <p className="font-semibold text-linen">{label}</p>
          <Badge variant={complete ? "default" : "secondary"}>
            {complete ? "Completed" : "Incomplete"}
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
      ? "Invitation only"
      : progress.gateSatisfied
        ? "Visible in search"
        : "Description needed";

  return (
    <Card className="mt-10 border-court/25 bg-court/5">
      <CardHeader className="gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-court">
            Search visibility
          </p>
          <CardTitle className="mt-2 text-2xl text-linen">
            Help supporters find this group
          </CardTitle>
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
        <p className="mb-5 max-w-3xl text-sm leading-6 text-muted-dark">
          Add a clear description and keep an active owner. Members, rules, and events are optional
          and never block search.
        </p>
        <ul className="grid gap-3 md:grid-cols-2">
          <GateFact
            complete={progress.hasDescription}
            detail="Tell supporters who the group is for."
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
