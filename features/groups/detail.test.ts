import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ createClient: vi.fn() }));

vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.createClient }));

import { getGroupDetail } from "./detail";

const groupRow = {
  group_id: "52000000-0000-4000-8000-000000000201",
  slug: "haifa-group",
  name: "Haifa Group",
  description: "A supporter group.",
  visibility: "discoverable",
  lifecycle: "active",
  city_name: "Haifa",
  team_name: null,
  owner_handle: "group_owner",
  active_member_count: 45,
  viewer_role: "member",
  viewer_membership_status: "active",
  can_view_member_content: true,
  can_apply: false,
};

describe("getGroupDetail", () => {
  const rpc = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.createClient.mockResolvedValue({ rpc });
  });

  it("maps safe roster and published-rule projections and clamps crafted roster pages", async () => {
    rpc.mockImplementation(async (name: string) => {
      if (name === "get_group_by_slug") return { data: [groupRow], error: null };
      if (name === "list_safe_group_members") {
        return {
          data: [
            {
              handle: "fan_45",
              display_name: "Fan 45",
              role: "member",
              member_since: "2026-08-27T00:00:00Z",
              total_count: 45,
            },
          ],
          error: null,
        };
      }
      return {
        data: [
          {
            rule_id: "52000000-0000-4000-8000-000000000401",
            rule_position: 1,
            rule_text: "Respect every supporter.",
            published_at: "2026-08-27T00:00:00Z",
            total_count: 1,
          },
        ],
        error: null,
      };
    });

    const result = await getGroupDetail(groupRow.slug, 999);

    expect(rpc).toHaveBeenCalledWith("list_safe_group_members", {
      input_group_id: groupRow.group_id,
      input_offset: 40,
      input_limit: 20,
    });
    expect(result).toMatchObject({
      id: groupRow.group_id,
      memberPage: 3,
      memberPageCount: 3,
      members: [{ handle: "fan_45" }],
      rules: [{ text: "Respect every supporter." }],
    });
  });

  it("uses one not-found result without querying protected child projections", async () => {
    rpc.mockResolvedValue({ data: [], error: null });

    await expect(getGroupDetail("hidden-group")).resolves.toBeNull();

    expect(rpc).toHaveBeenCalledOnce();
    expect(rpc).toHaveBeenCalledWith("get_group_by_slug", { lookup_slug: "hidden-group" });
  });
});
