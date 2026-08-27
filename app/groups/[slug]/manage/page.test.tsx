// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getGroupDiscoveryProgress: vi.fn(),
  getGroupManagement: vi.fn(),
  notFound: vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
}));

vi.mock("@/features/groups/discovery", () => ({
  getGroupDiscoveryProgress: mocks.getGroupDiscoveryProgress,
}));

vi.mock("@/features/groups/management", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/features/groups/management")>();
  return { ...actual, getGroupManagement: mocks.getGroupManagement };
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
  cityName: "Haifa",
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
    searchParams: Promise.resolve({ section: "members" }),
  };
}

describe("GroupManagementPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getGroupDiscoveryProgress.mockResolvedValue({
      activeMemberCount: 5,
      activeModeratorCount: 2,
      ownerIsActive: true,
      hasDescription: true,
      hasPublishedRule: true,
      hasFutureEvent: true,
      gateSatisfied: true,
      lifecycle: "active",
    });
  });

  it("does not expose the management route to a non-admin viewer", async () => {
    mocks.getGroupManagement.mockResolvedValue(null);

    await expect(GroupManagementPage(props())).rejects.toThrow("NEXT_NOT_FOUND");
  });

  it("lets the owner manage non-owner roles and bans", async () => {
    mocks.getGroupManagement.mockResolvedValue({
      group,
      section: "members",
      page: 1,
      pageCount: 1,
      totalCount: 3,
      items: members,
    });

    render(await GroupManagementPage(props()));

    expect(screen.getByText("Visible in group search")).toBeVisible();
    expect(screen.getAllByRole("button", { name: "Save role" })).toHaveLength(2);
    expect(screen.getAllByRole("button", { name: "Ban" })).toHaveLength(2);
    expect(screen.getByText("Owner").closest("[data-slot='card-content']")).not.toHaveTextContent(
      "Save role",
    );
  });

  it("limits an admin to banning ordinary members without role controls", async () => {
    mocks.getGroupManagement.mockResolvedValue({
      group: { ...group, viewerRole: "admin" },
      section: "members",
      page: 1,
      pageCount: 1,
      totalCount: 3,
      items: members,
    });

    render(await GroupManagementPage(props()));

    expect(screen.queryByRole("button", { name: "Save role" })).not.toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "Ban" })).toHaveLength(1);
    expect(screen.getByText("Admin").closest("[data-slot='card-content']")).not.toHaveTextContent(
      "Ban",
    );
  });
});
