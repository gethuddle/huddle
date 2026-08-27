// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ updateGroupDescriptionAction: vi.fn() }));

vi.mock("@/features/groups/membership-actions", () => ({
  updateGroupDescriptionAction: mocks.updateGroupDescriptionAction,
}));

import { GroupDiscoveryProgress } from "./group-discovery-progress";

describe("GroupDiscoveryProgress", () => {
  it("explains each unmet forming gate with current counts", () => {
    render(
      <GroupDiscoveryProgress
        description={null}
        groupId="52000000-0000-4000-8000-000000000201"
        groupSlug="haifa-group"
        progress={{
          activeMemberCount: 4,
          activeModeratorCount: 1,
          ownerIsActive: true,
          hasDescription: false,
          hasPublishedRule: false,
          hasFutureEvent: false,
          gateSatisfied: false,
          lifecycle: "forming",
        }}
        visibility="discoverable"
      />,
    );

    expect(screen.getByText("Still forming")).toBeVisible();
    expect(screen.getByText("4 of 5 eligible active members")).toBeVisible();
    expect(screen.getByText(/1 of 2 active owner\/admin roles/)).toBeVisible();
    expect(screen.getByRole("textbox", { name: "Group description" })).toHaveValue("");
    expect(screen.getByRole("button", { name: "Save description" })).toBeVisible();
  });

  it("states that an unlisted group remains outside search", () => {
    render(
      <GroupDiscoveryProgress
        description="Private group"
        groupId="52000000-0000-4000-8000-000000000201"
        groupSlug="private-group"
        progress={{
          activeMemberCount: 5,
          activeModeratorCount: 2,
          ownerIsActive: true,
          hasDescription: true,
          hasPublishedRule: true,
          hasFutureEvent: true,
          gateSatisfied: true,
          lifecycle: "active",
        }}
        visibility="unlisted"
      />,
    );

    expect(screen.getByText("Unlisted by choice")).toBeVisible();
    expect(screen.getByText(/Unlisted groups never appear in search/)).toBeVisible();
  });
});
