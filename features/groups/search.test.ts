import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ createClient: vi.fn(), getUser: vi.fn(), rpc: vi.fn() }));

vi.mock("@/lib/env/server", () => ({
  getServerEnvironment: () => ({
    DISCOVERY_CURSOR_SECRET: "group-search-test-cursor-secret-value",
  }),
}));
vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.createClient }));

import { decodeGroupCursor } from "@/features/discovery/cursor";
import { parseGroupSearchFilters } from "@/features/groups/search-schemas";

import { getGroupSearchPage } from "./search";

describe("getGroupSearchPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getUser.mockResolvedValue({ data: { user: null }, error: null });
    mocks.createClient.mockResolvedValue({ auth: { getUser: mocks.getUser }, rpc: mocks.rpc });
  });

  it("uses the global member-count, normalized-name, and id keyset", async () => {
    mocks.rpc.mockResolvedValue({
      data: [
        {
          group_id: "50000000-0000-4000-8000-000000000301",
          slug: "arsenal-supporters",
          name: "Arsenal Supporters",
          description: "Supporters from anywhere.",
          team_name: "Arsenal FC",
          active_member_count: 42,
          cursor_member_count: 42,
          cursor_name: "arsenal supporters",
          has_more: true,
        },
      ],
      error: null,
    });

    const result = await getGroupSearchPage(parseGroupSearchFilters({}));

    expect(mocks.rpc).toHaveBeenCalledWith("search_groups", {
      input_query: undefined,
      input_team_id: undefined,
      input_after_member_count: undefined,
      input_after_name: undefined,
      input_after_id: undefined,
      input_limit: 20,
    });
    const decoded = decodeGroupCursor(result.nextCursor!, "group-search-test-cursor-secret-value");
    expect(decoded).toMatchObject({ memberCount: 42, name: "arsenal supporters" });
    expect(JSON.stringify(result)).not.toContain("city");
  });
});
