import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ requireActor: vi.fn() }));

vi.mock("@/features/auth/actor", () => ({ requireActor: mocks.requireActor }));

import { DomainError } from "@/lib/errors";

import { getGroupInvitePreview } from "./invites";

const token = "A".repeat(43);

describe("getGroupInvitePreview", () => {
  const rpc = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireActor.mockResolvedValue({ supabase: { rpc } });
  });

  it("rejects malformed tokens before actor or database access", async () => {
    await expect(getGroupInvitePreview("not-a-token")).resolves.toEqual({
      state: "unavailable",
    });
    expect(mocks.requireActor).not.toHaveBeenCalled();
  });

  it("maps account gates to non-leaking page states", async () => {
    mocks.requireActor.mockRejectedValueOnce(new DomainError("AUTH_REQUIRED"));
    await expect(getGroupInvitePreview(token)).resolves.toEqual({ state: "anonymous" });

    mocks.requireActor.mockRejectedValueOnce(new DomainError("PROFILE_INCOMPLETE"));
    await expect(getGroupInvitePreview(token)).resolves.toEqual({ state: "complete-profile" });

    mocks.requireActor.mockRejectedValueOnce(new DomainError("ACCOUNT_SUSPENDED"));
    await expect(getGroupInvitePreview(token)).resolves.toEqual({ state: "not-permitted" });
  });

  it("collapses invalid, expired, blocked, and banned database outcomes", async () => {
    for (const code of [
      "INVITE_INVALID",
      "INVITE_EXPIRED",
      "BLOCKED_RELATIONSHIP",
      "GROUP_BANNED",
    ]) {
      rpc.mockResolvedValueOnce({ data: null, error: { message: code } });
      await expect(getGroupInvitePreview(token)).resolves.toEqual({ state: "unavailable" });
    }
  });

  it("maps the minimum valid preview without token metadata", async () => {
    rpc.mockResolvedValue({
      data: [
        {
          group_id: "52000000-0000-4000-8000-000000000201",
          slug: "unlisted-group",
          name: "Unlisted Group",
          viewer_membership_status: null,
        },
      ],
      error: null,
    });

    const result = await getGroupInvitePreview(token);

    expect(mocks.requireActor).toHaveBeenCalledWith("fan");
    expect(result).toEqual({
      state: "available",
      group: {
        id: "52000000-0000-4000-8000-000000000201",
        slug: "unlisted-group",
        name: "Unlisted Group",
      },
      membershipStatus: null,
    });
    expect(JSON.stringify(result)).not.toContain(token);
  });
});
