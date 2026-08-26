// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getGroupDetail: vi.fn(),
  notFound: vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
}));

vi.mock("@/features/groups/detail", () => ({ getGroupDetail: mocks.getGroupDetail }));
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
  canViewMemberContent: false,
  members: [],
};

describe("GroupPage", () => {
  beforeEach(() => vi.clearAllMocks());

  it("renders only the public safe summary to a nonmember", async () => {
    mocks.getGroupDetail.mockResolvedValue(publicGroup);

    render(await GroupPage({ params: Promise.resolve({ slug: publicGroup.slug }) }));

    expect(screen.getByRole("heading", { name: publicGroup.name })).toBeVisible();
    expect(screen.getByText("Public group summary")).toBeVisible();
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
    });

    render(await GroupPage({ params: Promise.resolve({ slug: publicGroup.slug }) }));

    expect(screen.getByText("Your role: owner")).toBeVisible();
    expect(screen.getByRole("heading", { name: "Active members" })).toBeVisible();
    expect(screen.getByText("Group Owner")).toBeVisible();
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
