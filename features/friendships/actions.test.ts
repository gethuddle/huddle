import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getRequestId: vi.fn(),
  requireActor: vi.fn(),
  revalidatePath: vi.fn(),
}));

vi.mock("@/features/auth/actor", () => ({ requireActor: mocks.requireActor }));
vi.mock("@/lib/request-id/server", () => ({ getRequestId: mocks.getRequestId }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));

import { updateFriendshipAction } from "./actions";

const friendshipId = "50000000-0000-4000-8000-000000000101";

function friendshipForm(intent: string, includeId = true) {
  const formData = new FormData();
  formData.set("intent", intent);
  formData.set("targetHandle", "Fan_Two");
  if (includeId) formData.set("friendshipId", friendshipId);
  return formData;
}

describe("updateFriendshipAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getRequestId.mockResolvedValue("10000000-0000-4000-8000-000000000099");
  });

  it("rejects crafted transitions before actor or database access", async () => {
    const result = await updateFriendshipAction(null, friendshipForm("accept", false));

    expect(result).toMatchObject({ ok: false, error: { code: "VALIDATION_FAILED" } });
    expect(mocks.requireActor).not.toHaveBeenCalled();
  });

  it("sends a canonical request through the controlled handle RPC", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: friendshipId, error: null });
    mocks.requireActor.mockResolvedValue({ supabase: { rpc } });

    const result = await updateFriendshipAction(null, friendshipForm("request", false));

    expect(mocks.requireActor).toHaveBeenCalledWith("fan");
    expect(rpc).toHaveBeenCalledWith("request_friendship_by_handle", {
      target_handle: "fan_two",
      audit_request_id: "10000000-0000-4000-8000-000000000099",
    });
    expect(result).toMatchObject({
      ok: true,
      data: { friendship: { id: friendshipId, status: "pending", direction: "outgoing" } },
    });
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/people");
  });

  it.each(["accept", "decline"] as const)("uses the recipient-only %s response", async (intent) => {
    const rpc = vi
      .fn()
      .mockResolvedValue({ data: intent === "accept" ? "accepted" : "declined", error: null });
    mocks.requireActor.mockResolvedValue({ supabase: { rpc } });

    const result = await updateFriendshipAction(null, friendshipForm(intent));

    expect(rpc).toHaveBeenCalledWith("respond_to_friendship", {
      input_friendship_id: friendshipId,
      input_decision: intent,
      audit_request_id: "10000000-0000-4000-8000-000000000099",
    });
    expect(result).toMatchObject({ ok: true, data: { intent } });
  });

  it("maps reviewed database tokens without exposing SQL detail", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: null,
      error: { message: "BLOCKED_RELATIONSHIP", details: "private.user_blocks" },
    });
    mocks.requireActor.mockResolvedValue({ supabase: { rpc } });

    const result = await updateFriendshipAction(null, friendshipForm("request", false));

    expect(result).toEqual({
      ok: false,
      error: { code: "BLOCKED_RELATIONSHIP", message: "That interaction is not available." },
    });
    expect(JSON.stringify(result)).not.toContain("user_blocks");
  });
});
