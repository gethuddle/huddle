"use server";

import { createHash, randomBytes } from "node:crypto";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireActor } from "@/features/auth/actor";
import {
  groupApplicationReviewSchema,
  groupApplicationSchema,
  groupArchiveSchema,
  groupBanSchema,
  groupInviteConsumptionSchema,
  groupInviteCreationSchema,
  groupInviteRevocationSchema,
  groupLeaveSchema,
  groupRoleChangeSchema,
  groupRuleCreationSchema,
  groupRuleReorderSchema,
  groupRuleUpdateSchema,
  groupEventReviewSchema,
  groupEventWithdrawalSchema,
  groupDescriptionUpdateSchema,
  groupUnbanSchema,
} from "@/features/groups/schemas";
import type { GroupMembershipActionState } from "@/features/groups/state";
import { actionFailure, actionSuccess, domainErrorFromDatabase } from "@/lib/errors";
import { getRequestId } from "@/lib/request-id/server";

function groupInput(formData: FormData) {
  return {
    groupId: formData.get("groupId"),
    groupSlug: formData.get("groupSlug"),
  };
}

function refreshGroup(slug: string) {
  revalidatePath("/");
  revalidatePath("/dashboard");
  revalidatePath("/discover");
  revalidatePath("/events");
  revalidatePath("/groups");
  revalidatePath("/matches");
  revalidatePath(`/groups/${slug}`);
  revalidatePath(`/groups/${slug}/manage`);
}

export async function updateGroupDescriptionAction(
  _previousState: GroupMembershipActionState,
  formData: FormData,
): Promise<GroupMembershipActionState> {
  const parsed = groupDescriptionUpdateSchema.safeParse({
    ...groupInput(formData),
    description: formData.get("description"),
  });
  if (!parsed.success) return actionFailure(parsed.error);

  try {
    const [{ supabase }, requestId] = await Promise.all([requireActor("fan"), getRequestId()]);
    const { error } = await supabase.rpc("update_group_description", {
      input_group_id: parsed.data.groupId,
      input_description: parsed.data.description,
      audit_request_id: requestId,
    });
    if (error !== null) throw domainErrorFromDatabase(error);

    refreshGroup(parsed.data.groupSlug);
    return actionSuccess({ message: "Group description saved and discovery status refreshed." });
  } catch (error) {
    return actionFailure(error);
  }
}

export async function submitGroupApplicationAction(
  _previousState: GroupMembershipActionState,
  formData: FormData,
): Promise<GroupMembershipActionState> {
  const parsed = groupApplicationSchema.safeParse({
    ...groupInput(formData),
    message: formData.get("message"),
  });
  if (!parsed.success) return actionFailure(parsed.error);

  try {
    const [{ supabase }, requestId] = await Promise.all([requireActor("fan"), getRequestId()]);
    const { error } = await supabase.rpc("apply_to_group", {
      input_group_id: parsed.data.groupId,
      input_message: parsed.data.message,
      audit_request_id: requestId,
    });
    if (error !== null) throw domainErrorFromDatabase(error);

    refreshGroup(parsed.data.groupSlug);
    return actionSuccess({ message: "Application sent for administrator review." });
  } catch (error) {
    return actionFailure(error);
  }
}

export async function reviewGroupApplicationAction(
  _previousState: GroupMembershipActionState,
  formData: FormData,
): Promise<GroupMembershipActionState> {
  const parsed = groupApplicationReviewSchema.safeParse({
    ...groupInput(formData),
    userId: formData.get("userId"),
    decision: formData.get("decision"),
  });
  if (!parsed.success) return actionFailure(parsed.error);

  try {
    const [{ supabase }, requestId] = await Promise.all([requireActor("fan"), getRequestId()]);
    const { error } = await supabase.rpc("review_group_membership", {
      input_group_id: parsed.data.groupId,
      input_user_id: parsed.data.userId,
      input_decision: parsed.data.decision,
      audit_request_id: requestId,
    });
    if (error !== null) throw domainErrorFromDatabase(error);

    refreshGroup(parsed.data.groupSlug);
    return actionSuccess({
      message:
        parsed.data.decision === "approve" ? "Application approved." : "Application rejected.",
    });
  } catch (error) {
    return actionFailure(error);
  }
}

export async function reviewGroupEventAction(
  _previousState: GroupMembershipActionState,
  formData: FormData,
): Promise<GroupMembershipActionState> {
  const parsed = groupEventReviewSchema.safeParse({
    ...groupInput(formData),
    eventId: formData.get("eventId"),
    decision: formData.get("decision"),
  });
  if (!parsed.success) return actionFailure(parsed.error);

  try {
    const [{ supabase }, requestId] = await Promise.all([requireActor("fan"), getRequestId()]);
    const { error } = await supabase.rpc("publish_group_event", {
      input_event_id: parsed.data.eventId,
      input_decision: parsed.data.decision,
      audit_request_id: requestId,
    });
    if (error !== null) throw domainErrorFromDatabase(error);
  } catch (error) {
    return actionFailure(error);
  }

  refreshGroup(parsed.data.groupSlug);
  revalidatePath(`/events/${parsed.data.eventId}`);
  redirect(
    `/groups/${parsed.data.groupSlug}?notice=${
      parsed.data.decision === "approve" ? "event-approved" : "event-rejected"
    }`,
  );
}

export async function withdrawGroupEventAction(
  _previousState: GroupMembershipActionState,
  formData: FormData,
): Promise<GroupMembershipActionState> {
  const parsed = groupEventWithdrawalSchema.safeParse({
    ...groupInput(formData),
    eventId: formData.get("eventId"),
  });
  if (!parsed.success) return actionFailure(parsed.error);

  try {
    const [{ supabase }, requestId] = await Promise.all([
      requireActor("authenticated"),
      getRequestId(),
    ]);
    const { error } = await supabase.rpc("withdraw_group_event_submission", {
      input_event_id: parsed.data.eventId,
      audit_request_id: requestId,
    });
    if (error !== null) throw domainErrorFromDatabase(error);
  } catch (error) {
    return actionFailure(error);
  }

  refreshGroup(parsed.data.groupSlug);
  revalidatePath(`/events/${parsed.data.eventId}`);
  redirect(`/groups/${parsed.data.groupSlug}?notice=event-withdrawn`);
}

export async function leaveGroupAction(
  _previousState: GroupMembershipActionState,
  formData: FormData,
): Promise<GroupMembershipActionState> {
  const parsed = groupLeaveSchema.safeParse(groupInput(formData));
  if (!parsed.success) return actionFailure(parsed.error);

  try {
    const [{ supabase }, requestId] = await Promise.all([
      requireActor("authenticated"),
      getRequestId(),
    ]);
    const { error } = await supabase.rpc("leave_group", {
      input_group_id: parsed.data.groupId,
      audit_request_id: requestId,
    });
    if (error !== null) throw domainErrorFromDatabase(error);

    refreshGroup(parsed.data.groupSlug);
    return actionSuccess({ message: "You left the group. Your membership history was retained." });
  } catch (error) {
    return actionFailure(error);
  }
}

export async function archiveGroupAction(
  _previousState: GroupMembershipActionState,
  formData: FormData,
): Promise<GroupMembershipActionState> {
  const parsed = groupArchiveSchema.safeParse(groupInput(formData));
  if (!parsed.success) return actionFailure(parsed.error);

  try {
    const [{ supabase }, requestId] = await Promise.all([requireActor("fan"), getRequestId()]);
    const { error } = await supabase.rpc("archive_group", {
      input_group_id: parsed.data.groupId,
      audit_request_id: requestId,
    });
    if (error !== null) throw domainErrorFromDatabase(error);
  } catch (error) {
    return actionFailure(error);
  }

  refreshGroup(parsed.data.groupSlug);
  redirect("/dashboard?groupBucket=owner");
}

export async function createGroupInviteAction(
  _previousState: GroupMembershipActionState,
  formData: FormData,
): Promise<GroupMembershipActionState> {
  const parsed = groupInviteCreationSchema.safeParse({
    ...groupInput(formData),
    durationDays: formData.get("durationDays"),
    maxUses: formData.get("maxUses"),
  });
  if (!parsed.success) return actionFailure(parsed.error);

  try {
    const [{ supabase }, requestId] = await Promise.all([requireActor("fan"), getRequestId()]);
    const token = randomBytes(32).toString("base64url");
    const tokenHash = createHash("sha256").update(token, "utf8").digest("hex");
    const expiresAt = new Date(Date.now() + parsed.data.durationDays * 86_400_000).toISOString();
    const { error } = await supabase.rpc("create_group_invite", {
      input_group_id: parsed.data.groupId,
      input_token_hash: tokenHash,
      input_expires_at: expiresAt,
      input_max_uses: parsed.data.maxUses,
      audit_request_id: requestId,
    });
    if (error !== null) throw domainErrorFromDatabase(error);

    refreshGroup(parsed.data.groupSlug);
    return actionSuccess({
      message: "Invitation created. Copy it now—Huddle cannot reveal it again.",
      invitePath: `/join/group/${token}`,
    });
  } catch (error) {
    return actionFailure(error);
  }
}

export async function consumeGroupInviteAction(
  _previousState: GroupMembershipActionState,
  formData: FormData,
): Promise<GroupMembershipActionState> {
  const parsed = groupInviteConsumptionSchema.safeParse({
    token: formData.get("token"),
    message: formData.get("message"),
  });
  if (!parsed.success) return actionFailure(parsed.error);

  try {
    const [{ supabase }, requestId] = await Promise.all([requireActor("fan"), getRequestId()]);
    const { data, error } = await supabase.rpc("consume_group_invite", {
      input_token: parsed.data.token,
      input_message: parsed.data.message,
      audit_request_id: requestId,
    });
    if (error !== null) throw domainErrorFromDatabase(error);

    const slug = data.at(0)?.slug;
    if (slug !== undefined) refreshGroup(slug);
    return actionSuccess({ message: "Application sent for administrator review." });
  } catch (error) {
    return actionFailure(error);
  }
}

export async function revokeGroupInviteAction(
  _previousState: GroupMembershipActionState,
  formData: FormData,
): Promise<GroupMembershipActionState> {
  const parsed = groupInviteRevocationSchema.safeParse({
    ...groupInput(formData),
    inviteId: formData.get("inviteId"),
  });
  if (!parsed.success) return actionFailure(parsed.error);

  try {
    const [{ supabase }, requestId] = await Promise.all([requireActor("fan"), getRequestId()]);
    const { error } = await supabase.rpc("revoke_group_invite", {
      input_invite_id: parsed.data.inviteId,
      audit_request_id: requestId,
    });
    if (error !== null) throw domainErrorFromDatabase(error);

    refreshGroup(parsed.data.groupSlug);
    return actionSuccess({ message: "Invitation revoked. Its history was retained." });
  } catch (error) {
    return actionFailure(error);
  }
}

export async function changeGroupRoleAction(
  _previousState: GroupMembershipActionState,
  formData: FormData,
): Promise<GroupMembershipActionState> {
  const parsed = groupRoleChangeSchema.safeParse({
    ...groupInput(formData),
    userId: formData.get("userId"),
    role: formData.get("role"),
  });
  if (!parsed.success) return actionFailure(parsed.error);

  try {
    const [{ supabase }, requestId] = await Promise.all([requireActor("fan"), getRequestId()]);
    const { error } = await supabase.rpc("change_group_member_role", {
      input_group_id: parsed.data.groupId,
      input_user_id: parsed.data.userId,
      input_role: parsed.data.role,
      audit_request_id: requestId,
    });
    if (error !== null) throw domainErrorFromDatabase(error);

    refreshGroup(parsed.data.groupSlug);
    return actionSuccess({
      message:
        parsed.data.role === "admin" ? "Member promoted to admin." : "Admin demoted to member.",
    });
  } catch (error) {
    return actionFailure(error);
  }
}

export async function banGroupMemberAction(
  _previousState: GroupMembershipActionState,
  formData: FormData,
): Promise<GroupMembershipActionState> {
  const parsed = groupBanSchema.safeParse({
    ...groupInput(formData),
    userId: formData.get("userId"),
    reason: formData.get("reason"),
  });
  if (!parsed.success) return actionFailure(parsed.error);

  try {
    const [{ supabase }, requestId] = await Promise.all([requireActor("fan"), getRequestId()]);
    const { error } = await supabase.rpc("ban_group_member", {
      input_group_id: parsed.data.groupId,
      input_user_id: parsed.data.userId,
      input_reason: parsed.data.reason,
      audit_request_id: requestId,
    });
    if (error !== null) throw domainErrorFromDatabase(error);

    refreshGroup(parsed.data.groupSlug);
    return actionSuccess({ message: "Member banned and protected access removed." });
  } catch (error) {
    return actionFailure(error);
  }
}

export async function unbanGroupMemberAction(
  _previousState: GroupMembershipActionState,
  formData: FormData,
): Promise<GroupMembershipActionState> {
  const parsed = groupUnbanSchema.safeParse({
    ...groupInput(formData),
    userId: formData.get("userId"),
  });
  if (!parsed.success) return actionFailure(parsed.error);

  try {
    const [{ supabase }, requestId] = await Promise.all([requireActor("fan"), getRequestId()]);
    const { error } = await supabase.rpc("unban_group_member", {
      input_group_id: parsed.data.groupId,
      input_user_id: parsed.data.userId,
      audit_request_id: requestId,
    });
    if (error !== null) throw domainErrorFromDatabase(error);

    refreshGroup(parsed.data.groupSlug);
    return actionSuccess({
      message: "Ban revoked. The former member must submit a new application.",
    });
  } catch (error) {
    return actionFailure(error);
  }
}

export async function createGroupRuleAction(
  _previousState: GroupMembershipActionState,
  formData: FormData,
): Promise<GroupMembershipActionState> {
  const parsed = groupRuleCreationSchema.safeParse({
    ...groupInput(formData),
    text: formData.get("text"),
    published: formData.get("published") === "on",
  });
  if (!parsed.success) return actionFailure(parsed.error);

  try {
    const [{ supabase }, requestId] = await Promise.all([requireActor("fan"), getRequestId()]);
    const { error } = await supabase.rpc("create_group_rule", {
      input_group_id: parsed.data.groupId,
      input_text: parsed.data.text,
      input_publish: parsed.data.published,
      audit_request_id: requestId,
    });
    if (error !== null) throw domainErrorFromDatabase(error);

    refreshGroup(parsed.data.groupSlug);
    return actionSuccess({
      message: parsed.data.published ? "Published rule added." : "Draft rule added.",
    });
  } catch (error) {
    return actionFailure(error);
  }
}

export async function updateGroupRuleAction(
  _previousState: GroupMembershipActionState,
  formData: FormData,
): Promise<GroupMembershipActionState> {
  const parsed = groupRuleUpdateSchema.safeParse({
    ...groupInput(formData),
    ruleId: formData.get("ruleId"),
    text: formData.get("text"),
    published: formData.get("published") === "on",
  });
  if (!parsed.success) return actionFailure(parsed.error);

  try {
    const [{ supabase }, requestId] = await Promise.all([requireActor("fan"), getRequestId()]);
    const { error } = await supabase.rpc("update_group_rule", {
      input_rule_id: parsed.data.ruleId,
      input_text: parsed.data.text,
      input_published: parsed.data.published,
      audit_request_id: requestId,
    });
    if (error !== null) throw domainErrorFromDatabase(error);

    refreshGroup(parsed.data.groupSlug);
    return actionSuccess({ message: "Rule updated." });
  } catch (error) {
    return actionFailure(error);
  }
}

export async function reorderGroupRulesAction(
  _previousState: GroupMembershipActionState,
  formData: FormData,
): Promise<GroupMembershipActionState> {
  const parsed = groupRuleReorderSchema.safeParse({
    ...groupInput(formData),
    ruleIds: formData.getAll("ruleId"),
  });
  if (!parsed.success) return actionFailure(parsed.error);

  try {
    const [{ supabase }, requestId] = await Promise.all([requireActor("fan"), getRequestId()]);
    const { error } = await supabase.rpc("reorder_group_rules", {
      input_group_id: parsed.data.groupId,
      input_rule_ids: parsed.data.ruleIds,
      audit_request_id: requestId,
    });
    if (error !== null) throw domainErrorFromDatabase(error);

    refreshGroup(parsed.data.groupSlug);
    return actionSuccess({ message: "Rule order updated." });
  } catch (error) {
    return actionFailure(error);
  }
}
