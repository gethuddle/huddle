// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getGroupManagement: vi.fn(),
  getGroupSettings: vi.fn(),
  notFound: vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
}));

vi.mock("@/features/groups/management", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/features/groups/management")>();
  return {
    ...actual,
    getGroupManagement: mocks.getGroupManagement,
    getGroupSettings: mocks.getGroupSettings,
  };
});
vi.mock("next/navigation", () => ({ notFound: mocks.notFound }));

import GroupManagementPage from "./page";

const group = {
  id: "52000000-0000-4000-8000-000000000201",
  slug: "haifa-group",
  name: "Haifa Group",
  description: "A group",
  visibility: "discoverable" as const,
  lifecycle: "active" as const,
  teamName: null,
  ownerHandle: "owner",
  activeMemberCount: 3,
  viewerRole: "owner" as const,
  viewerMembershipStatus: "active" as const,
  canViewMemberContent: true,
  canApply: false,
  memberPage: 1,
  memberPageCount: 1,
  members: [],
  rules: [],
};

const members = [
  {
    userId: "52000000-0000-4000-8000-000000000101",
    handle: "owner",
    displayName: "Owner",
    role: "owner" as const,
    memberSince: "2026-08-26T00:00:00Z",
  },
  {
    userId: "52000000-0000-4000-8000-000000000102",
    handle: "admin",
    displayName: "Admin",
    role: "admin" as const,
    memberSince: "2026-08-26T00:00:00Z",
  },
  {
    userId: "52000000-0000-4000-8000-000000000103",
    handle: "member",
    displayName: "Member",
    role: "member" as const,
    memberSince: "2026-08-26T00:00:00Z",
  },
];

function props() {
  return {
    params: Promise.resolve({ slug: group.slug }),
    searchParams: Promise.resolve({}),
  };
}

describe("GroupManagementPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("does not expose the management route to a non-admin viewer", async () => {
    mocks.getGroupSettings.mockResolvedValue(null);

    await expect(GroupManagementPage(props())).rejects.toThrow("NEXT_NOT_FOUND");
  });

  it("lets the owner manage non-owner roles and bans", async () => {
    mocks.getGroupSettings.mockResolvedValue({
      group,
      members: { page: 1, pageCount: 1, totalCount: 3, items: members },
      rules: [],
      directInvitations: { page: 1, pageCount: 1, totalCount: 0, items: [] },
      bans: { page: 1, pageCount: 1, totalCount: 0, items: [] },
    });

    render(await GroupManagementPage(props()));

    expect(screen.getByRole("heading", { name: "Members" })).toBeVisible();
    expect(screen.getByRole("heading", { name: "Rules" })).toBeVisible();
    expect(screen.getByRole("heading", { name: "Visibility" })).toBeVisible();
    expect(screen.getByRole("link", { name: "Members" })).toHaveAttribute("href", "#members");
    expect(
      screen.queryByRole("navigation", { name: "Group administration sections" }),
    ).not.toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "Save role" })).toHaveLength(2);
    expect(screen.getAllByRole("button", { name: "Ban" })).toHaveLength(2);
    expect(screen.getByText("Owner").closest(".rounded-xl")).not.toHaveTextContent("Save role");
    expect(screen.getByRole("heading", { name: "Delete group" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Delete group" })).toBeVisible();
  });

  it("limits an admin to banning ordinary members without role controls", async () => {
    mocks.getGroupSettings.mockResolvedValue({
      group: { ...group, viewerRole: "admin" },
      members: { page: 1, pageCount: 1, totalCount: 3, items: members },
      rules: [],
      directInvitations: { page: 1, pageCount: 1, totalCount: 0, items: [] },
      bans: { page: 1, pageCount: 1, totalCount: 0, items: [] },
    });

    render(await GroupManagementPage(props()));

    expect(screen.queryByRole("button", { name: "Save role" })).not.toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "Ban" })).toHaveLength(1);
    expect(screen.getByText("Admin").closest(".rounded-xl")).not.toHaveTextContent("Ban");
    expect(screen.queryByRole("heading", { name: "Delete group" })).not.toBeInTheDocument();
  });

  it("keeps erased invitation and ban identities neutral, unlinked, and reachable on later pages", async () => {
    mocks.getGroupSettings.mockResolvedValue({
      group,
      members: { page: 1, pageCount: 1, totalCount: 3, items: members },
      rules: [],
      directInvitations: {
        page: 2,
        pageCount: 3,
        totalCount: 51,
        items: [
          {
            id: "52000000-0000-4000-8000-000000000301",
            inviteeId: "52000000-0000-4000-8000-000000000302",
            inviteeHandle: null,
            inviteeDisplayName: "Deleted account",
            inviterHandle: null,
            status: "revoked",
            createdAt: "2026-08-27T00:00:00Z",
            respondedAt: null,
            revokedAt: "2026-08-28T00:00:00Z",
          },
        ],
      },
      bans: {
        page: 1,
        pageCount: 1,
        totalCount: 1,
        items: [
          {
            userId: "52000000-0000-4000-8000-000000000303",
            handle: null,
            displayName: "Deleted account",
            reason: "Retained safety record.",
            bannedByHandle: null,
            bannedAt: "2026-08-27T00:00:00Z",
          },
        ],
      },
    });

    render(
      await GroupManagementPage({
        ...props(),
        searchParams: Promise.resolve({ invitationsPage: "2" }),
      }),
    );

    expect(screen.getAllByText("Account unavailable")).toHaveLength(2);
    expect(document.body).not.toHaveTextContent("@null");
    expect(screen.queryByRole("link", { name: "Account unavailable" })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Go to next page" })).toHaveAttribute(
      "href",
      `/groups/${group.slug}/manage?invitationsPage=3#invitations`,
    );
  });

  it("renders the 21st mixed-status event submission from the second real queue page", async () => {
    mocks.getGroupManagement.mockResolvedValue({
      group,
      section: "events",
      page: 2,
      pageCount: 2,
      totalCount: 21,
      items: [
        {
          id: "52000000-0000-4000-8000-000000000401",
          title: "Twenty-first submission",
          status: "published",
          submitterHandle: null,
          submitterDisplayName: "Deleted account",
          audience: "group",
          audienceGroupName: group.name,
          placeKind: "public_place",
          match: {
            homeTeamName: "Arsenal FC",
            awayTeamName: "Chelsea FC",
            competitionName: "Premier League",
          },
          startsAt: "2026-08-28T16:00:00Z",
          submittedAt: "2026-08-27T00:00:00Z",
          canReview: false,
          canWithdraw: false,
        },
      ],
    });

    render(
      await GroupManagementPage({
        ...props(),
        searchParams: Promise.resolve({ section: "events", page: "2" }),
      }),
    );

    expect(screen.getByRole("heading", { name: "Event submissions" })).toBeVisible();
    expect(screen.getByText("Twenty-first submission")).toBeVisible();
    expect(screen.getByText(/Account unavailable/)).toBeVisible();
    expect(screen.getByRole("link", { name: "Go to previous page" })).toHaveAttribute(
      "href",
      `/groups/${group.slug}/manage?section=events&page=1`,
    );
  });

  it("keeps direct invitations 41 through 51 reachable on the third 20-row page", async () => {
    mocks.getGroupSettings.mockResolvedValue({
      group,
      members: { page: 1, pageCount: 1, totalCount: 3, items: members },
      rules: [],
      directInvitations: {
        page: 3,
        pageCount: 3,
        totalCount: 51,
        items: Array.from({ length: 11 }, (_, index) => ({
          id: `52000000-0000-4000-8000-${String(index + 41).padStart(12, "0")}`,
          inviteeId: `52000000-0000-4000-8000-${String(index + 141).padStart(12, "0")}`,
          inviteeHandle: `invitee_${index + 41}`,
          inviteeDisplayName: `Invitee ${index + 41}`,
          inviterHandle: "owner",
          status: "revoked" as const,
          createdAt: "2026-08-27T00:00:00Z",
          respondedAt: null,
          revokedAt: "2026-08-28T00:00:00Z",
        })),
      },
      bans: { page: 1, pageCount: 1, totalCount: 0, items: [] },
    });

    render(
      await GroupManagementPage({
        ...props(),
        searchParams: Promise.resolve({ invitationsPage: "3" }),
      }),
    );

    expect(screen.getByText("Invitee 41 · @invitee_41")).toBeVisible();
    expect(screen.getByText("Invitee 51 · @invitee_51")).toBeVisible();
    expect(screen.getByText("3/3")).toBeVisible();
    expect(screen.getByRole("link", { name: "Go to previous page" })).toHaveAttribute(
      "href",
      `/groups/${group.slug}/manage?invitationsPage=2#invitations`,
    );
    expect(screen.queryByRole("link", { name: "Go to next page" })).not.toBeInTheDocument();
  });

  it("explains when the final direct-invitation page is bounded instead of linking into a repeat", async () => {
    mocks.getGroupSettings.mockResolvedValue({
      group,
      members: { page: 1, pageCount: 1, totalCount: 3, items: members },
      rules: [],
      directInvitations: {
        page: 501,
        pageCount: 501,
        totalCount: 10_021,
        hasOverflow: true,
        items: [
          {
            id: "52000000-0000-4000-8000-000000000501",
            inviteeId: "52000000-0000-4000-8000-000000000502",
            inviteeHandle: "last-visible-invitee",
            inviteeDisplayName: "Last visible invitee",
            inviterHandle: "owner",
            status: "pending" as const,
            createdAt: "2026-08-27T00:00:00Z",
            respondedAt: null,
            revokedAt: null,
          },
        ],
      },
      bans: { page: 1, pageCount: 1, totalCount: 0, items: [] },
    });

    render(
      await GroupManagementPage({
        ...props(),
        searchParams: Promise.resolve({ invitationsPage: "501" }),
      }),
    );

    expect(screen.getByText("501/501")).toBeVisible();
    expect(screen.getByText(/more invitations exist than can be shown/i)).toBeVisible();
    expect(screen.queryByRole("link", { name: "Go to next page" })).not.toBeInTheDocument();
  });
});
