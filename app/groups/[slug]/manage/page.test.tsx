// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getGroupSettings: vi.fn(),
  notFound: vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
}));

vi.mock("@/features/groups/management", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/features/groups/management")>();
  return { ...actual, getGroupSettings: mocks.getGroupSettings };
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
  });

  it("limits an admin to banning ordinary members without role controls", async () => {
    mocks.getGroupSettings.mockResolvedValue({
      group: { ...group, viewerRole: "admin" },
      members: { page: 1, pageCount: 1, totalCount: 3, items: members },
      rules: [],
      bans: { page: 1, pageCount: 1, totalCount: 0, items: [] },
    });

    render(await GroupManagementPage(props()));

    expect(screen.queryByRole("button", { name: "Save role" })).not.toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "Ban" })).toHaveLength(1);
    expect(screen.getByText("Admin").closest(".rounded-xl")).not.toHaveTextContent("Ban");
  });
});
