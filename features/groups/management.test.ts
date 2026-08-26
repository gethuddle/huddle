import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
  getGroupDetail: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.createClient }));
vi.mock("@/features/groups/detail", () => ({ getGroupDetail: mocks.getGroupDetail }));

import { getGroupManagement } from "./management";

const group = {
  id: "52000000-0000-4000-8000-000000000201",
  slug: "haifa-group",
  name: "Haifa Group",
  description: null,
  visibility: "unlisted" as const,
  lifecycle: "active" as const,
  cityName: "Haifa",
  teamName: null,
  ownerHandle: "owner",
  activeMemberCount: 2,
  viewerRole: "admin" as const,
  viewerMembershipStatus: "active" as const,
  canViewMemberContent: true,
  canApply: false,
  memberPage: 1,
  memberPageCount: 1,
  members: [],
  rules: [],
};

describe("getGroupManagement", () => {
  const rpc = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.createClient.mockResolvedValue({ rpc });
    mocks.getGroupDetail.mockResolvedValue(group);
  });

  it("returns no management projection to an ordinary member", async () => {
    mocks.getGroupDetail.mockResolvedValue({ ...group, viewerRole: "member" });

    await expect(getGroupManagement(group.slug, "applications", 1)).resolves.toBeNull();

    expect(mocks.createClient).not.toHaveBeenCalled();
  });

  it("maps and paginates the private application queue", async () => {
    rpc.mockResolvedValue({
      data: [
        {
          user_id: "52000000-0000-4000-8000-000000000202",
          handle: "applicant",
          display_name: "Applicant",
          application_message: "Please review me.",
          application_source: "invite",
          applied_at: "2026-08-27T00:00:00Z",
          total_count: 23,
        },
      ],
      error: null,
    });

    const result = await getGroupManagement(group.slug, "applications", 2);

    expect(rpc).toHaveBeenCalledWith("list_group_applications", {
      input_group_id: group.id,
      input_offset: 20,
      input_limit: 20,
    });
    expect(result).toMatchObject({
      section: "applications",
      page: 2,
      pageCount: 2,
      totalCount: 23,
      items: [{ source: "invite", message: "Please review me." }],
    });
  });

  it("returns only non-secret invitation metadata and server-derived status", async () => {
    rpc.mockResolvedValue({
      data: [
        {
          invite_id: "52000000-0000-4000-8000-000000000301",
          creator_handle: "owner",
          expires_at: "2026-08-28T00:00:00Z",
          max_uses: 5,
          use_count: 2,
          revoked_at: null,
          invite_status: "active",
          created_at: "2026-08-27T00:00:00Z",
          total_count: 1,
        },
      ],
      error: null,
    });

    const result = await getGroupManagement(group.slug, "invites", 1);

    expect(result).toMatchObject({
      section: "invites",
      items: [{ status: "active", useCount: 2, maxUses: 5 }],
    });
    expect(JSON.stringify(result)).not.toContain("token_hash");
  });

  it("clamps an empty crafted page back to the first available page", async () => {
    rpc.mockResolvedValueOnce({ data: [], error: null }).mockResolvedValueOnce({
      data: [
        {
          user_id: "52000000-0000-4000-8000-000000000202",
          handle: "applicant",
          display_name: "Applicant",
          application_message: null,
          application_source: "discoverable",
          applied_at: "2026-08-27T00:00:00Z",
          total_count: 1,
        },
      ],
      error: null,
    });

    const result = await getGroupManagement(group.slug, "applications", 9);

    expect(rpc).toHaveBeenNthCalledWith(1, "list_group_applications", {
      input_group_id: group.id,
      input_offset: 160,
      input_limit: 20,
    });
    expect(rpc).toHaveBeenNthCalledWith(2, "list_group_applications", {
      input_group_id: group.id,
      input_offset: 0,
      input_limit: 20,
    });
    expect(result).toMatchObject({ page: 1, pageCount: 1, totalCount: 1 });
  });
});
