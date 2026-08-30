// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getGroupDetail: vi.fn(),
  getGroupDiscoveryProgress: vi.fn(),
  getGroupOverviewAttention: vi.fn(),
  listPeopleHub: vi.fn(),
  listGroupEvents: vi.fn(),
  notFound: vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
}));

vi.mock("@/features/groups/detail", () => ({ getGroupDetail: mocks.getGroupDetail }));
vi.mock("@/features/events/queries", () => ({ listGroupEvents: mocks.listGroupEvents }));
vi.mock("@/features/groups/discovery", () => ({
  getGroupDiscoveryProgress: mocks.getGroupDiscoveryProgress,
}));
vi.mock("@/features/groups/management", () => ({
  getGroupOverviewAttention: mocks.getGroupOverviewAttention,
}));
vi.mock("@/features/people/search", () => ({ listPeopleHub: mocks.listPeopleHub }));
vi.mock("next/navigation", () => ({ notFound: mocks.notFound }));

import GroupPage from "./page";

const publicGroup = {
  id: "50000000-0000-4000-8000-000000000301",
  slug: "haifa-arsenal-supporters",
  name: "Haifa Arsenal Supporters",
  description: "Respectful match-going supporters.",
  visibility: "discoverable" as const,
  lifecycle: "active" as const,
  cityName: "Haifa",
  teamName: "Arsenal FC",
  ownerHandle: "group_owner",
  activeMemberCount: 4,
  viewerRole: null,
  viewerMembershipStatus: null,
  canViewMemberContent: false,
  canApply: false,
  memberPage: 1,
  memberPageCount: 1,
  members: [],
  rules: [],
};

describe("GroupPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.listGroupEvents.mockResolvedValue([]);
    mocks.getGroupOverviewAttention.mockResolvedValue({ applications: [], events: [] });
    mocks.getGroupDiscoveryProgress.mockResolvedValue({
      activeMemberCount: 1,
      activeModeratorCount: 1,
      ownerIsActive: true,
      hasDescription: true,
      hasPublishedRule: false,
      hasFutureEvent: false,
      gateSatisfied: false,
      lifecycle: "forming",
    });
    mocks.listPeopleHub.mockResolvedValue({ items: [] });
  });

  it("renders only the public safe summary to a nonmember", async () => {
    mocks.getGroupDetail.mockResolvedValue(publicGroup);

    render(await GroupPage({ params: Promise.resolve({ slug: publicGroup.slug }) }));

    expect(screen.getByRole("heading", { name: publicGroup.name })).toBeVisible();
    expect(screen.getByText("Open for applications")).toBeVisible();
    expect(screen.queryByRole("heading", { name: "Active members" })).not.toBeInTheDocument();
    expect(document.body).not.toHaveTextContent("private application");
  });

  it("shows the protected safe roster to an active owner", async () => {
    mocks.getGroupDetail.mockResolvedValue({
      ...publicGroup,
      lifecycle: "forming",
      viewerRole: "owner",
      canViewMemberContent: true,
      activeMemberCount: 1,
      members: [
        {
          handle: "group_owner",
          displayName: "Group Owner",
          role: "owner",
          memberSince: "2026-08-26T00:00:00Z",
        },
      ],
      rules: [
        {
          id: "50000000-0000-4000-8000-000000000401",
          position: 1,
          text: "Respect every supporter.",
          publishedAt: "2026-08-26T00:00:00Z",
        },
      ],
    });

    render(await GroupPage({ params: Promise.resolve({ slug: publicGroup.slug }) }));

    expect(screen.getByText("Your role: owner")).toBeVisible();
    expect(screen.getByRole("heading", { name: "Active members" })).toBeVisible();
    expect(screen.getByText("Group Owner")).toBeVisible();
    expect(screen.getByRole("link", { name: "Manage group" })).toHaveAttribute(
      "href",
      `/groups/${publicGroup.slug}/manage`,
    );
    expect(screen.getByRole("link", { name: "Create group event" })).toHaveAttribute(
      "href",
      `/events/new?group=${publicGroup.id}`,
    );
    expect(screen.getByRole("button", { name: "Share group" })).toBeVisible();
    expect(screen.getByText("Add one rule")).toBeVisible();
    expect(screen.queryByRole("link", { name: "Invite people" })).not.toBeInTheDocument();
    expect(screen.getByText("Respect every supporter.")).toBeVisible();
  });

  it("shows only non-empty actionable applications and event submissions", async () => {
    mocks.getGroupDetail.mockResolvedValue({
      ...publicGroup,
      viewerRole: "owner",
      canViewMemberContent: true,
    });
    mocks.getGroupOverviewAttention.mockResolvedValue({
      applications: [
        {
          userId: "50000000-0000-4000-8000-000000000201",
          handle: "applicant",
          displayName: "Applicant One",
          message: null,
          source: "discoverable",
          appliedAt: "2026-08-30T10:00:00Z",
        },
      ],
      events: [],
    });

    render(await GroupPage({ params: Promise.resolve({ slug: publicGroup.slug }) }));

    expect(screen.getByRole("heading", { name: "Applications to review" })).toBeVisible();
    expect(screen.getByText("Applicant One")).toBeVisible();
    expect(
      screen.queryByRole("heading", { name: "Event submissions to review" }),
    ).not.toBeInTheDocument();
  });

  it("offers a reviewed application to an eligible direct-link viewer", async () => {
    mocks.getGroupDetail.mockResolvedValue({
      ...publicGroup,
      lifecycle: "forming",
      canApply: true,
    });

    render(await GroupPage({ params: Promise.resolve({ slug: publicGroup.slug }) }));

    expect(screen.getByRole("heading", { name: "Apply to join" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Apply to join" })).toBeVisible();
    expect(screen.getByText("Setting up for group search")).toBeVisible();
  });

  it("lets an active admin both manage and leave the group", async () => {
    mocks.getGroupDetail.mockResolvedValue({
      ...publicGroup,
      viewerRole: "admin",
      viewerMembershipStatus: "active",
      canViewMemberContent: true,
    });

    render(await GroupPage({ params: Promise.resolve({ slug: publicGroup.slug }) }));

    expect(screen.getByRole("link", { name: "Manage group" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Leave group" })).toBeVisible();
  });

  it("uses the same not-found boundary for invalid or invisible slugs", async () => {
    await expect(GroupPage({ params: Promise.resolve({ slug: "private/group" }) })).rejects.toThrow(
      "NEXT_NOT_FOUND",
    );
    expect(mocks.getGroupDetail).not.toHaveBeenCalled();

    mocks.getGroupDetail.mockResolvedValue(null);
    await expect(
      GroupPage({ params: Promise.resolve({ slug: "unlisted-group" }) }),
    ).rejects.toThrow("NEXT_NOT_FOUND");
  });
});
