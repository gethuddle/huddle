import { createHash } from "node:crypto";

import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getRequestId: vi.fn(),
  requireActor: vi.fn(),
  revalidatePath: vi.fn(),
  redirect: vi.fn(() => {
    throw new Error("NEXT_REDIRECT");
  }),
}));

vi.mock("@/features/auth/actor", () => ({ requireActor: mocks.requireActor }));
vi.mock("@/lib/request-id/server", () => ({ getRequestId: mocks.getRequestId }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));

import {
  archiveGroupAction,
  banGroupMemberAction,
  consumeGroupInviteAction,
  createGroupInviteAction,
  createGroupRuleAction,
  leaveGroupAction,
  reviewGroupApplicationAction,
  reviewGroupEventAction,
  submitGroupApplicationAction,
  updateGroupDescriptionAction,
} from "./membership-actions";

const requestId = "10000000-0000-4000-8000-000000000099";
const groupId = "52000000-0000-4000-8000-000000000201";
const userId = "52000000-0000-4000-8000-000000000202";
const groupSlug = "haifa-matchday-group";

function groupForm() {
  const formData = new FormData();
  formData.set("groupId", groupId);
  formData.set("groupSlug", groupSlug);
  return formData;
}

describe("B06 group membership actions", () => {
  const rpc = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getRequestId.mockResolvedValue(requestId);
    mocks.requireActor.mockResolvedValue({ supabase: { rpc } });
    rpc.mockResolvedValue({ data: [], error: null });
  });

  it("validates an application before actor or database access", async () => {
    const formData = groupForm();
    formData.set("message", "x".repeat(1001));

    const result = await submitGroupApplicationAction(null, formData);

    expect(result).toMatchObject({ ok: false, error: { code: "VALIDATION_FAILED" } });
    expect(mocks.requireActor).not.toHaveBeenCalled();
    expect(rpc).not.toHaveBeenCalled();
  });

  it("submits a discoverable application only through the reviewed pending RPC", async () => {
    const formData = groupForm();
    formData.set("message", " I would like to join. ");

    const result = await submitGroupApplicationAction(null, formData);

    expect(mocks.requireActor).toHaveBeenCalledWith("fan");
    expect(rpc).toHaveBeenCalledWith("apply_to_group", {
      input_group_id: groupId,
      input_message: "I would like to join.",
      audit_request_id: requestId,
    });
    expect(result).toEqual({
      ok: true,
      data: { message: "Application sent for administrator review." },
    });
    expect(mocks.revalidatePath).toHaveBeenCalledWith(`/groups/${groupSlug}/manage`);
  });

  it("reviews a pending application through an explicit approve or reject decision", async () => {
    const formData = groupForm();
    formData.set("userId", userId);
    formData.set("decision", "approve");

    const result = await reviewGroupApplicationAction(null, formData);

    expect(rpc).toHaveBeenCalledWith("review_group_membership", {
      input_group_id: groupId,
      input_user_id: userId,
      input_decision: "approve",
      audit_request_id: requestId,
    });
    expect(result).toMatchObject({ ok: true, data: { message: "Application approved." } });
  });

  it("publishes a pending group event only through an explicit administrator decision", async () => {
    const formData = groupForm();
    formData.set("eventId", "52000000-0000-4000-8000-000000000203");
    formData.set("decision", "approve");

    const result = await reviewGroupEventAction(null, formData);

    expect(rpc).toHaveBeenCalledWith("publish_group_event", {
      input_event_id: "52000000-0000-4000-8000-000000000203",
      input_decision: "approve",
      audit_request_id: requestId,
    });
    expect(result).toMatchObject({
      ok: true,
      data: { message: "Group event approved and published." },
    });
    expect(mocks.revalidatePath).toHaveBeenCalledWith(
      "/events/52000000-0000-4000-8000-000000000203",
    );
  });

  it("uses the authenticated gate for a retained-history leave", async () => {
    const result = await leaveGroupAction(null, groupForm());

    expect(mocks.requireActor).toHaveBeenCalledWith("authenticated");
    expect(rpc).toHaveBeenCalledWith("leave_group", {
      input_group_id: groupId,
      audit_request_id: requestId,
    });
    expect(result).toMatchObject({
      ok: true,
      data: { message: expect.stringContaining("retained") },
    });
  });

  it("returns invite plaintext once while sending only its digest to persistence", async () => {
    const formData = groupForm();
    formData.set("durationDays", "7");
    formData.set("maxUses", "4");

    const result = await createGroupInviteAction(null, formData);

    expect(result?.ok).toBe(true);
    if (result?.ok !== true || result.data.invitePath === undefined) {
      throw new Error("Expected a one-time invitation path");
    }
    const token = result.data.invitePath.replace("/join/group/", "");
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);

    const call = rpc.mock.calls.find(([name]) => name === "create_group_invite");
    expect(call).toBeDefined();
    const args = call?.[1] as Record<string, unknown>;
    expect(args.input_token_hash).toBe(createHash("sha256").update(token).digest("hex"));
    expect(JSON.stringify(args)).not.toContain(token);
    expect(args).toMatchObject({
      input_group_id: groupId,
      input_max_uses: 4,
      audit_request_id: requestId,
    });
  });

  it("consumes an invitation into a pending application without client-selected group identity", async () => {
    const token = "A".repeat(43);
    const formData = new FormData();
    formData.set("token", token);
    formData.set("message", "Invited supporter");
    rpc.mockResolvedValue({
      data: [{ group_id: groupId, slug: groupSlug, status: "pending" }],
      error: null,
    });

    const result = await consumeGroupInviteAction(null, formData);

    expect(rpc).toHaveBeenCalledWith("consume_group_invite", {
      input_token: token,
      input_message: "Invited supporter",
      audit_request_id: requestId,
    });
    expect(result).toMatchObject({
      ok: true,
      data: { message: "Application sent for administrator review." },
    });
  });

  it("passes ban reasons and rule publication through validated administrator RPCs", async () => {
    const banForm = groupForm();
    banForm.set("userId", userId);
    banForm.set("reason", "Repeated abusive conduct");
    const ruleForm = groupForm();
    ruleForm.set("text", "Respect every attendee.");
    ruleForm.set("published", "on");

    await banGroupMemberAction(null, banForm);
    await createGroupRuleAction(null, ruleForm);

    expect(rpc).toHaveBeenCalledWith("ban_group_member", {
      input_group_id: groupId,
      input_user_id: userId,
      input_reason: "Repeated abusive conduct",
      audit_request_id: requestId,
    });
    expect(rpc).toHaveBeenCalledWith("create_group_rule", {
      input_group_id: groupId,
      input_text: "Respect every attendee.",
      input_publish: true,
      audit_request_id: requestId,
    });
  });

  it("updates a bounded description through the audited group RPC and refreshes search", async () => {
    const formData = groupForm();
    formData.set("description", "  North stand supporters in Haifa.  ");

    const result = await updateGroupDescriptionAction(null, formData);

    expect(rpc).toHaveBeenCalledWith("update_group_description", {
      input_group_id: groupId,
      input_description: "North stand supporters in Haifa.",
      audit_request_id: requestId,
    });
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/groups");
    expect(result).toMatchObject({
      ok: true,
      data: { message: expect.stringContaining("discovery status") },
    });
  });

  it("archives an owned group through the audited RPC and returns to My Huddle", async () => {
    await expect(archiveGroupAction(null, groupForm())).rejects.toThrow("NEXT_REDIRECT");

    expect(mocks.requireActor).toHaveBeenCalledWith("fan");
    expect(rpc).toHaveBeenCalledWith("archive_group", {
      input_group_id: groupId,
      audit_request_id: requestId,
    });
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/groups");
    expect(mocks.redirect).toHaveBeenCalledWith("/dashboard?groupBucket=owner");
  });
});
