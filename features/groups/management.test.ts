import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
  getGroupDetail: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.createClient }));
vi.mock("@/features/groups/detail", () => ({ getGroupDetail: mocks.getGroupDetail }));

import { getGroupManagement, getGroupOverviewAttention, getGroupSettings } from "./management";

const group = {
  id: "52000000-0000-4000-8000-000000000201",
  slug: "haifa-group",
  name: "Haifa Group",
  description: null,
  visibility: "unlisted" as const,
  lifecycle: "active" as const,
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

  it("maps the bounded group-event review queue without private location data", async () => {
    rpc.mockResolvedValue({
      data: [
        {
          event_id: "52000000-0000-4000-8000-000000000203",
          title: "North London watch",
          status: "pending_group_review",
          submitter_handle: "member",
          submitter_display_name: "Member",
          audience: "invite_only",
          audience_group_name: null,
          place_kind: "home",
          home_team_name: "Arsenal FC",
          away_team_name: "Chelsea FC",
          competition_name: "Premier League",
          starts_at: "2026-09-01T17:00:00Z",
          submitted_at: "2026-08-27T00:00:00Z",
          can_review: true,
          can_withdraw: false,
          total_count: 1,
        },
      ],
      error: null,
    });

    const result = await getGroupManagement(group.slug, "events", 1);

    expect(rpc).toHaveBeenCalledWith("list_group_event_submissions", {
      input_group_id: group.id,
      input_offset: 0,
      input_limit: 20,
    });
    expect(result).toMatchObject({
      section: "events",
      items: [
        {
          status: "pending_group_review",
          audience: "invite_only",
          placeKind: "home",
          match: { homeTeamName: "Arsenal FC", awayTeamName: "Chelsea FC" },
        },
      ],
    });
    expect(JSON.stringify(result)).not.toContain("address");
    expect(JSON.stringify(result)).not.toContain("longitude");
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

  it("returns only current actionable applications and event submissions for the overview", async () => {
    rpc.mockImplementation(async (name: string) => {
      if (name === "list_group_applications") {
        return {
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
        };
      }
      return {
        data: [
          {
            event_id: "52000000-0000-4000-8000-000000000203",
            title: "Pending watch",
            status: "pending_group_review",
            submitter_handle: "member",
            submitter_display_name: "Member",
            audience: "invite_only",
            audience_group_name: null,
            place_kind: "home",
            home_team_name: "Arsenal FC",
            away_team_name: "Chelsea FC",
            competition_name: "Premier League",
            starts_at: "2026-09-01T17:00:00Z",
            submitted_at: "2026-08-27T00:00:00Z",
            can_review: true,
            can_withdraw: false,
            total_count: 1,
          },
          {
            event_id: "52000000-0000-4000-8000-000000000204",
            title: "Already published",
            status: "published",
            submitter_handle: "owner",
            submitter_display_name: "Owner",
            audience: "group",
            audience_group_name: "Haifa Group",
            place_kind: "public_place",
            home_team_name: "Arsenal FC",
            away_team_name: "Chelsea FC",
            competition_name: "Premier League",
            starts_at: "2026-09-02T17:00:00Z",
            submitted_at: "2026-08-27T00:00:00Z",
            can_review: false,
            can_withdraw: false,
            total_count: 2,
          },
        ],
        error: null,
      };
    });

    const attention = await getGroupOverviewAttention(group);

    expect(attention.applications).toHaveLength(1);
    expect(attention.events).toMatchObject([{ title: "Pending watch" }]);
    expect(JSON.stringify(attention)).not.toContain("Already published");
  });

  it("loads members, rules, and explicit bans into one authorized settings projection", async () => {
    rpc.mockImplementation(async (name: string) => {
      if (name === "list_group_admin_members") {
        return {
          data: [
            {
              user_id: "52000000-0000-4000-8000-000000000101",
              handle: "owner",
              display_name: "Owner",
              role: "owner",
              member_since: "2026-08-26T00:00:00Z",
              total_count: 1,
            },
          ],
          error: null,
        };
      }
      if (name === "list_group_rules") return { data: [], error: null };
      return { data: [], error: null };
    });

    const settings = await getGroupSettings(group.slug, 1, 1);

    expect(settings).toMatchObject({
      group,
      members: { page: 1, items: [{ handle: "owner" }] },
      rules: [],
      bans: { page: 1, items: [] },
      directInvitations: [],
    });
    expect(rpc.mock.calls.map(([name]) => name)).toEqual([
      "list_group_admin_members",
      "list_group_rules",
      "list_group_bans",
      "list_group_direct_invitations",
    ]);
  });
});
