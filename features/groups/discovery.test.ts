import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ createClient: vi.fn() }));

vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.createClient }));

import { getGroupDiscoveryProgress } from "./discovery";

describe("getGroupDiscoveryProgress", () => {
  const rpc = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.createClient.mockResolvedValue({ rpc });
  });

  it("maps every current gate fact without exposing member rows", async () => {
    rpc.mockResolvedValue({
      data: [
        {
          active_member_count: 4,
          active_moderator_count: 2,
          owner_is_active: true,
          has_description: true,
          has_published_rule: false,
          has_future_event: true,
          gate_satisfied: false,
          lifecycle: "forming",
        },
      ],
      error: null,
    });

    await expect(
      getGroupDiscoveryProgress("52000000-0000-4000-8000-000000000201"),
    ).resolves.toEqual({
      activeMemberCount: 4,
      activeModeratorCount: 2,
      ownerIsActive: true,
      hasDescription: true,
      hasPublishedRule: false,
      hasFutureEvent: true,
      gateSatisfied: false,
      lifecycle: "forming",
    });
    expect(rpc).toHaveBeenCalledWith("evaluate_group_discoverability", {
      input_group_id: "52000000-0000-4000-8000-000000000201",
    });
  });
});
