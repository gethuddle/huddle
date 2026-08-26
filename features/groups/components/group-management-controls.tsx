"use client";

import { startTransition, useActionState, useState, type FormEvent } from "react";

import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import { GroupActionFeedback } from "@/features/groups/components/action-feedback";
import {
  banGroupMemberAction,
  changeGroupRoleAction,
  createGroupInviteAction,
  createGroupRuleAction,
  reorderGroupRulesAction,
  reviewGroupApplicationAction,
  revokeGroupInviteAction,
  unbanGroupMemberAction,
  updateGroupRuleAction,
} from "@/features/groups/membership-actions";
import { INITIAL_GROUP_MEMBERSHIP_ACTION_STATE } from "@/features/groups/state";

type GroupIdentity = Readonly<{ groupId: string; groupSlug: string }>;

function GroupFields({ groupId, groupSlug }: GroupIdentity) {
  return (
    <>
      <input name="groupId" type="hidden" value={groupId} />
      <input name="groupSlug" type="hidden" value={groupSlug} />
    </>
  );
}

export function ApplicationReviewControl({
  groupId,
  groupSlug,
  userId,
}: GroupIdentity & Readonly<{ userId: string }>) {
  const [state, formAction, pending] = useActionState(
    reviewGroupApplicationAction,
    INITIAL_GROUP_MEMBERSHIP_ACTION_STATE,
  );

  return (
    <div className="space-y-3">
      <form action={formAction} className="flex flex-wrap gap-2">
        <GroupFields groupId={groupId} groupSlug={groupSlug} />
        <input name="userId" type="hidden" value={userId} />
        <Button disabled={pending} name="decision" size="sm" type="submit" value="approve">
          {pending ? "Updating…" : "Approve"}
        </Button>
        <Button
          disabled={pending}
          name="decision"
          size="sm"
          type="submit"
          value="reject"
          variant="outline"
        >
          Reject
        </Button>
      </form>
      <GroupActionFeedback state={state} />
    </div>
  );
}

export function BanMemberControl({
  groupId,
  groupSlug,
  targetLabel,
  userId,
}: GroupIdentity & Readonly<{ targetLabel: string; userId: string }>) {
  const [state, formAction, pending] = useActionState(
    banGroupMemberAction,
    INITIAL_GROUP_MEMBERSHIP_ACTION_STATE,
  );
  const [confirmingBan, setConfirmingBan] = useState(false);
  const fieldId = `ban-reason-${userId}`;

  function submitBan(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    startTransition(() => {
      formAction(formData);
      setConfirmingBan(false);
    });
  }

  return (
    <div className="space-y-3">
      <AlertDialog onOpenChange={setConfirmingBan} open={confirmingBan}>
        <AlertDialogTrigger asChild>
          <Button disabled={pending} size="sm" type="button" variant="destructive">
            Ban
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Ban {targetLabel}?</AlertDialogTitle>
            <AlertDialogDescription>
              This immediately removes protected group access and prevents invitations or a new
              application until an administrator revokes the ban.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <form onSubmit={submitBan}>
            <GroupFields groupId={groupId} groupSlug={groupSlug} />
            <input name="userId" type="hidden" value={userId} />
            <div className="mt-5 text-left">
              <Label htmlFor={fieldId}>Internal reason</Label>
              <Textarea
                className="mt-2 resize-y"
                id={fieldId}
                maxLength={500}
                minLength={3}
                name="reason"
                placeholder="Reason visible to group administrators"
                required
              />
            </div>
            <AlertDialogFooter className="mt-5">
              <Button disabled={pending} type="submit" variant="destructive">
                {pending ? "Banning…" : "Confirm ban"}
              </Button>
              <AlertDialogCancel type="button">Cancel</AlertDialogCancel>
            </AlertDialogFooter>
          </form>
        </AlertDialogContent>
      </AlertDialog>
      <GroupActionFeedback state={state} />
    </div>
  );
}

export function MemberRoleControl({
  currentRole,
  groupId,
  groupSlug,
  userId,
}: GroupIdentity & Readonly<{ currentRole: "admin" | "member"; userId: string }>) {
  const [state, formAction, pending] = useActionState(
    changeGroupRoleAction,
    INITIAL_GROUP_MEMBERSHIP_ACTION_STATE,
  );

  return (
    <div className="space-y-3">
      <form action={formAction} className="flex min-w-64 flex-wrap items-end gap-2">
        <GroupFields groupId={groupId} groupSlug={groupSlug} />
        <input name="userId" type="hidden" value={userId} />
        <div className="grow">
          <Label className="sr-only" htmlFor={`role-${userId}`}>
            Member role
          </Label>
          <NativeSelect defaultValue={currentRole} id={`role-${userId}`} name="role" size="sm">
            <NativeSelectOption value="member">Member</NativeSelectOption>
            <NativeSelectOption value="admin">Admin</NativeSelectOption>
          </NativeSelect>
        </div>
        <Button disabled={pending} size="sm" type="submit" variant="outline">
          {pending ? "Saving…" : "Save role"}
        </Button>
      </form>
      <GroupActionFeedback state={state} />
    </div>
  );
}

export function InviteCreateControl({ groupId, groupSlug }: GroupIdentity) {
  const [state, formAction, pending] = useActionState(
    createGroupInviteAction,
    INITIAL_GROUP_MEMBERSHIP_ACTION_STATE,
  );

  return (
    <form action={formAction} className="space-y-4" noValidate>
      <GroupFields groupId={groupId} groupSlug={groupSlug} />
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <Label htmlFor="invite-duration">Expires after</Label>
          <NativeSelect className="mt-2" defaultValue="7" id="invite-duration" name="durationDays">
            <NativeSelectOption value="1">1 day</NativeSelectOption>
            <NativeSelectOption value="7">7 days</NativeSelectOption>
            <NativeSelectOption value="30">30 days</NativeSelectOption>
          </NativeSelect>
        </div>
        <div>
          <Label htmlFor="invite-max-uses">Maximum uses</Label>
          <Input
            className="mt-2"
            defaultValue={10}
            id="invite-max-uses"
            max={100}
            min={1}
            name="maxUses"
            required
            type="number"
          />
        </div>
      </div>
      <p className="text-xs leading-5 text-muted-dark">
        The secret link appears once. Huddle stores only its SHA-256 digest and non-secret usage
        metadata.
      </p>
      <Button disabled={pending} type="submit">
        {pending ? "Creating…" : "Create invitation"}
      </Button>
      <GroupActionFeedback state={state} />
    </form>
  );
}

export function InviteRevocationControl({
  groupId,
  groupSlug,
  inviteId,
}: GroupIdentity & Readonly<{ inviteId: string }>) {
  const [state, formAction, pending] = useActionState(
    revokeGroupInviteAction,
    INITIAL_GROUP_MEMBERSHIP_ACTION_STATE,
  );
  const [confirmingRevoke, setConfirmingRevoke] = useState(false);

  function submitRevocation(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    startTransition(() => {
      formAction(formData);
      setConfirmingRevoke(false);
    });
  }

  return (
    <div className="space-y-3">
      <AlertDialog onOpenChange={setConfirmingRevoke} open={confirmingRevoke}>
        <AlertDialogTrigger asChild>
          <Button disabled={pending} size="sm" type="button" variant="outline">
            Revoke
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent size="sm">
          <AlertDialogHeader>
            <AlertDialogTitle>Revoke this invitation?</AlertDialogTitle>
            <AlertDialogDescription>
              The link will stop working immediately. Existing pending applications remain for
              administrator review, and the invitation record is retained.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <form onSubmit={submitRevocation}>
            <GroupFields groupId={groupId} groupSlug={groupSlug} />
            <input name="inviteId" type="hidden" value={inviteId} />
            <AlertDialogFooter>
              <Button disabled={pending} type="submit" variant="destructive">
                {pending ? "Revoking…" : "Revoke"}
              </Button>
              <AlertDialogCancel type="button">Keep active</AlertDialogCancel>
            </AlertDialogFooter>
          </form>
        </AlertDialogContent>
      </AlertDialog>
      <GroupActionFeedback state={state} />
    </div>
  );
}

export function UnbanMemberControl({
  groupId,
  groupSlug,
  userId,
}: GroupIdentity & Readonly<{ userId: string }>) {
  const [state, formAction, pending] = useActionState(
    unbanGroupMemberAction,
    INITIAL_GROUP_MEMBERSHIP_ACTION_STATE,
  );

  return (
    <div className="space-y-3">
      <form action={formAction}>
        <GroupFields groupId={groupId} groupSlug={groupSlug} />
        <input name="userId" type="hidden" value={userId} />
        <Button disabled={pending} size="sm" type="submit" variant="outline">
          {pending ? "Updating…" : "Revoke ban"}
        </Button>
      </form>
      <GroupActionFeedback state={state} />
    </div>
  );
}

export function RuleCreateControl({ groupId, groupSlug }: GroupIdentity) {
  const [state, formAction, pending] = useActionState(
    createGroupRuleAction,
    INITIAL_GROUP_MEMBERSHIP_ACTION_STATE,
  );

  return (
    <form action={formAction} className="space-y-4" noValidate>
      <GroupFields groupId={groupId} groupSlug={groupSlug} />
      <div>
        <Label htmlFor="new-group-rule">New plain-text rule</Label>
        <Textarea
          className="mt-2 resize-y"
          id="new-group-rule"
          maxLength={500}
          name="text"
          placeholder="Treat every attendee and venue worker with respect."
          required
        />
      </div>
      <div className="flex items-center gap-3">
        <Checkbox id="new-group-rule-published" name="published" />
        <Label htmlFor="new-group-rule-published">Publish immediately</Label>
      </div>
      <Button disabled={pending} type="submit">
        {pending ? "Adding…" : "Add rule"}
      </Button>
      <GroupActionFeedback state={state} />
    </form>
  );
}

export function RuleEditControl({
  groupId,
  groupSlug,
  published,
  ruleId,
  text,
}: GroupIdentity & Readonly<{ published: boolean; ruleId: string; text: string }>) {
  const [state, formAction, pending] = useActionState(
    updateGroupRuleAction,
    INITIAL_GROUP_MEMBERSHIP_ACTION_STATE,
  );

  return (
    <form action={formAction} className="space-y-3" noValidate>
      <GroupFields groupId={groupId} groupSlug={groupSlug} />
      <input name="ruleId" type="hidden" value={ruleId} />
      <Label className="sr-only" htmlFor={`rule-text-${ruleId}`}>
        Rule text
      </Label>
      <Textarea
        defaultValue={text}
        id={`rule-text-${ruleId}`}
        maxLength={500}
        name="text"
        required
      />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Checkbox defaultChecked={published} id={`rule-published-${ruleId}`} name="published" />
          <Label htmlFor={`rule-published-${ruleId}`}>Published</Label>
        </div>
        <Button disabled={pending} size="sm" type="submit" variant="outline">
          {pending ? "Saving…" : "Save rule"}
        </Button>
      </div>
      <GroupActionFeedback state={state} />
    </form>
  );
}

export function RuleOrderButton({
  direction,
  groupId,
  groupSlug,
  orderedRuleIds,
  ruleIndex,
}: GroupIdentity &
  Readonly<{
    direction: "up" | "down";
    orderedRuleIds: readonly string[];
    ruleIndex: number;
  }>) {
  const [state, formAction, pending] = useActionState(
    reorderGroupRulesAction,
    INITIAL_GROUP_MEMBERSHIP_ACTION_STATE,
  );
  const nextIds = [...orderedRuleIds];
  const otherIndex = direction === "up" ? ruleIndex - 1 : ruleIndex + 1;
  [nextIds[ruleIndex], nextIds[otherIndex]] = [nextIds[otherIndex], nextIds[ruleIndex]];

  return (
    <div className="space-y-2">
      <form action={formAction}>
        <GroupFields groupId={groupId} groupSlug={groupSlug} />
        {nextIds.map((id) => (
          <input key={id} name="ruleId" type="hidden" value={id} />
        ))}
        <Button disabled={pending} size="xs" type="submit" variant="ghost">
          {pending ? "Moving…" : direction === "up" ? "Move up" : "Move down"}
        </Button>
      </form>
      <GroupActionFeedback state={state} />
    </div>
  );
}
