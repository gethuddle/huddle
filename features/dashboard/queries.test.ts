import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
  getUser: vi.fn(),
  maybeSingle: vi.fn(),
  requireActor: vi.fn(),
  rpc: vi.fn(),
}));

vi.mock("@/features/auth/actor", () => ({ requireActor: mocks.requireActor }));
vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.createClient }));

import { getFanHome, getMyHuddleOverview, listMyGroupsForViewer } from "./queries";

const eventId = "c5000000-0000-4000-8000-000000000501";
const groupId = "c5000000-0000-4000-8000-000000000301";
const teamId = "c5000000-0000-4000-8000-000000000202";

const eventRow = {
  event_id: eventId,
  title: "Next huddle",
  home_team_name: "Current Home FC",
  away_team_name: "Current Away FC",
  competition_name: "Current State League",
  starts_at: "2026-09-06T18:00:00Z",
  city_name: "Haifa",
  place_kind: "public_place",
  audience: "group",
  status: "published",
  bucket: "upcoming",
  relationship_label: "You are going",
  can_manage: false,
  total_count: 1,
};

const groupRow = {
  group_id: groupId,
  slug: "current-active-group",
  name: "Current Active Group",
  description: "A useful active group.",
  visibility: "unlisted",
  lifecycle: "active",
  city_name: "Haifa",
  team_name: "Current Home FC",
  member_role: "owner",
  membership_status: "active",
  active_member_count: 4,
  can_manage: true,
  total_count: 1,
};

const savedRow = {
  item_id: teamId,
  kind: "team",
  label: "Current Home FC",
  detail: "England",
  href: `/matches?team=${teamId}`,
  created_at: "2026-08-30T06:00:00Z",
  total_count: 1,
};

const groupInvitationRow = {
  invitation_id: "c5000000-0000-4000-8000-000000000401",
  group_id: groupId,
  group_slug: "current-active-group",
  group_name: "Current Active Group",
  inviter_handle: "group_owner",
  invited_at: "2026-08-31T15:00:00Z",
};

describe("listMyGroupsForViewer", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getUser.mockResolvedValue({ data: { user: { id: "viewer-id" } } });
    mocks.maybeSingle.mockResolvedValue({
      data: { profile_completed_at: "2026-08-29T12:00:00.000Z" },
      error: null,
    });
    mocks.createClient.mockResolvedValue({
      auth: { getUser: mocks.getUser },
      from: () => ({ select: () => ({ eq: () => ({ maybeSingle: mocks.maybeSingle }) }) }),
      rpc: mocks.rpc,
    });
    mocks.requireActor.mockResolvedValue({ supabase: { rpc: mocks.rpc } });
  });

  it("keeps public group discovery usable when account personalization is restricted", async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { message: "ACCOUNT_RESTRICTED" } });

    await expect(listMyGroupsForViewer()).resolves.toEqual([]);
  });

  it("does not hide an unexpected database failure", async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { message: "database unavailable" } });

    await expect(listMyGroupsForViewer()).rejects.toMatchObject({ code: "INTERNAL_ERROR" });
  });

  it("accepts a global group without inventing a city", async () => {
    mocks.rpc.mockResolvedValue({ data: [{ ...groupRow, city_name: null }], error: null });

    await expect(listMyGroupsForViewer()).resolves.toEqual([
      expect.objectContaining({ group_id: groupId, city_name: null }),
    ]);
  });

  it("loads only the selected current-state buckets for My Huddle", async () => {
    mocks.rpc.mockImplementation(async (name: string) => {
      if (name === "list_my_events") return { data: [eventRow], error: null };
      if (name === "list_my_group_relationships") return { data: [groupRow], error: null };
      if (name === "list_my_saved_items") return { data: [savedRow], error: null };
      if (name === "list_my_group_invitations") {
        return { data: [groupInvitationRow], error: null };
      }
      return { data: null, error: { message: "unexpected RPC" } };
    });

    await expect(
      getMyHuddleOverview({
        eventBucket: "upcoming",
        eventPage: 2,
        groupBucket: "owner",
        groupPage: 1,
        savedBucket: "all",
        savedPage: 1,
      }),
    ).resolves.toMatchObject({
      events: [{ id: eventId, bucket: "upcoming", relationshipLabel: "You are going" }],
      groups: [{ id: groupId, role: "owner" }],
      groupInvitations: [{ id: groupInvitationRow.invitation_id, groupId }],
      saved: [{ id: teamId, kind: "team", href: `/discover?team=${teamId}` }],
      pages: { events: 2, groups: 1, saved: 1 },
    });

    expect(mocks.rpc).toHaveBeenCalledWith("list_my_events", {
      input_bucket: "upcoming",
      input_limit: 20,
      input_offset: 20,
    });
    expect(mocks.rpc).toHaveBeenCalledWith("list_my_group_relationships", {
      input_bucket: "owner",
      input_limit: 20,
      input_offset: 0,
    });
    expect(mocks.rpc).toHaveBeenCalledWith("list_my_saved_items", {
      input_bucket: "all",
      input_limit: 20,
      input_offset: 0,
    });
  });

  it("bounds direct page inputs at the final RPC window before offset multiplication", async () => {
    mocks.rpc.mockResolvedValue({ data: [], error: null });

    await getMyHuddleOverview({
      eventPage: Number.MAX_SAFE_INTEGER,
      groupPage: Number.POSITIVE_INFINITY,
      savedPage: -10,
    });

    expect(mocks.rpc).toHaveBeenCalledWith(
      "list_my_events",
      expect.objectContaining({ input_offset: 10_000 }),
    );
    expect(mocks.rpc).toHaveBeenCalledWith(
      "list_my_group_relationships",
      expect.objectContaining({ input_offset: 0 }),
    );
    expect(mocks.rpc).toHaveBeenCalledWith(
      "list_my_saved_items",
      expect.objectContaining({ input_offset: 0 }),
    );
  });

  it.each([
    ["event", { eventBucket: null }],
    ["group", { groupBucket: "unknown" }],
    ["saved", { savedBucket: null }],
  ] as const)(
    "rejects a null or unknown %s bucket before database access",
    async (_label, options) => {
      await expect(getMyHuddleOverview(options as never)).rejects.toMatchObject({
        code: "VALIDATION_FAILED",
      });
      expect(mocks.requireActor).not.toHaveBeenCalled();
      expect(mocks.rpc).not.toHaveBeenCalled();
    },
  );

  it("canonicalizes an empty high collection page to its final populated page", async () => {
    mocks.rpc.mockImplementation(async (name: string, args: Record<string, unknown>) => {
      if (name === "list_my_events") {
        if (args.input_offset === 60) return { data: [], error: null };
        return { data: [{ ...eventRow, total_count: 21 }], error: null };
      }
      return { data: [], error: null };
    });

    await expect(getMyHuddleOverview({ eventPage: 4 })).resolves.toMatchObject({
      events: [{ id: eventId }],
      pages: { events: 2, groups: 1, saved: 1 },
    });
    expect(mocks.rpc).toHaveBeenCalledWith("list_my_events", {
      input_bucket: "upcoming",
      input_limit: 20,
      input_offset: 20,
    });
  });

  it("keeps page 501 data reachable when the true collection count exceeds the bounded window", async () => {
    mocks.rpc.mockImplementation(async (name: string, args: Record<string, unknown>) => {
      if (name === "list_my_events" && args.input_offset === 10_000) {
        return { data: [{ ...eventRow, total_count: 10_021 }], error: null };
      }
      return { data: [], error: null };
    });

    await expect(getMyHuddleOverview({ eventPage: 501 })).resolves.toMatchObject({
      events: [{ id: eventId }],
      pages: { events: 501 },
    });
    expect(mocks.rpc).toHaveBeenCalledWith("list_my_events", {
      input_bucket: "upcoming",
      input_limit: 20,
      input_offset: 10_000,
    });
  });

  it("builds Fan Home from next effective event, bounded attention, and one followed fixture", async () => {
    const fixtureRow = {
      id: "c5000000-0000-4000-8000-000000000204",
      sport_id: "00000000-0000-4000-8000-000000000020",
      sport_slug: "football",
      competition_id: "c5000000-0000-4000-8000-000000000201",
      competition_code: "CST",
      competition_name: "Current State League",
      home_team_id: teamId,
      home_team_name: "Current Home FC",
      home_team_short_name: "Current Home",
      home_team_tla: "CHF",
      away_team_id: "c5000000-0000-4000-8000-000000000203",
      away_team_name: "Current Away FC",
      away_team_short_name: "Current Away",
      away_team_tla: "CAF",
      home_team_crest_url: null,
      away_team_crest_url: null,
      starts_at: "2026-09-06T18:00:00Z",
      status: "timed",
      matchday: 1,
      stage: null,
      season_label: "2026",
      last_synced_at: "2026-08-30T05:00:00Z",
    };
    const fixtureQuery: Record<string, ReturnType<typeof vi.fn>> = {};
    fixtureQuery.select = vi.fn(() => fixtureQuery);
    fixtureQuery.eq = vi.fn(() => fixtureQuery);
    fixtureQuery.or = vi.fn(() => fixtureQuery);
    fixtureQuery.order = vi.fn(() => fixtureQuery);
    fixtureQuery.limit = vi.fn().mockResolvedValue({ data: [fixtureRow], error: null });
    const supabase = { rpc: mocks.rpc, from: vi.fn(() => fixtureQuery) };
    mocks.requireActor.mockResolvedValue({ supabase });
    mocks.rpc.mockImplementation(async (name: string, args: Record<string, unknown>) => {
      if (name === "list_my_events") {
        if (args.input_bucket === "upcoming") return { data: [eventRow], error: null };
        return {
          data: Array.from({ length: 50 }, (_, index) => ({
            ...eventRow,
            event_id: `c5000000-0000-4000-8000-${String(index + 599).padStart(12, "0")}`,
            title: `Unpublished draft ${index + 1}`,
            starts_at: "2026-09-01T18:00:00Z",
            status: "draft",
            bucket: "hosting",
            relationship_label: "Draft",
            can_manage: true,
          })),
          error: null,
        };
      }
      if (name === "list_attention_items") return { data: [], error: null };
      if (name === "list_my_saved_items") {
        if (args.input_bucket === "team") return { data: [savedRow], error: null };
        if (args.input_bucket === "competition") {
          return {
            data: [
              {
                ...savedRow,
                item_id: "c5000000-0000-4000-8000-000000000201",
                kind: "competition",
                label: "Current State League",
                href: "/matches?competition=c5000000-0000-4000-8000-000000000201",
              },
            ],
            error: null,
          };
        }
      }
      return { data: null, error: { message: "unexpected RPC" } };
    });

    await expect(getFanHome()).resolves.toMatchObject({
      nextEvent: { id: eventId },
      attention: [],
      suggestion: {
        id: fixtureRow.id,
        homeTeam: { name: "Current Home FC" },
        awayTeam: { name: "Current Away FC" },
      },
    });
    expect(supabase.from).toHaveBeenCalledWith("public_future_matches");
    expect(fixtureQuery.or).toHaveBeenCalledWith(
      `home_team_id.in.(${teamId}),away_team_id.in.(${teamId}),competition_id.in.(c5000000-0000-4000-8000-000000000201)`,
    );
    expect(mocks.rpc).toHaveBeenCalledWith("list_my_saved_items", {
      input_bucket: "team",
      input_limit: 50,
      input_offset: 0,
    });
    expect(mocks.rpc).toHaveBeenCalledWith("list_my_saved_items", {
      input_bucket: "competition",
      input_limit: 50,
      input_offset: 0,
    });
    expect(mocks.rpc).not.toHaveBeenCalledWith(
      "list_my_saved_items",
      expect.objectContaining({ input_bucket: "all" }),
    );
    expect(mocks.rpc).not.toHaveBeenCalledWith(
      "list_my_events",
      expect.objectContaining({ input_bucket: "hosting" }),
    );
  });
});
