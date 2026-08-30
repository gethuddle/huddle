// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ updateGroupDescriptionAction: vi.fn() }));

vi.mock("@/features/groups/membership-actions", () => ({
  updateGroupDescriptionAction: mocks.updateGroupDescriptionAction,
}));

import { GroupDiscoveryProgress } from "./group-discovery-progress";

describe("GroupDiscoveryProgress", () => {
  it("turns forming facts into ordered user actions without database jargon", () => {
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

    expect(screen.getByText("Invite 1 more member")).toBeVisible();
    expect(screen.getByText("Add 1 more admin")).toBeVisible();
    expect(screen.getByText("Add one rule")).toBeVisible();
    expect(screen.getByText("Publish one upcoming event")).toBeVisible();
    expect(screen.getAllByText("Incomplete").length).toBeGreaterThan(0);
    expect(document.body).not.toHaveTextContent(/lifecycle|synchronized|published rule/i);
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

    expect(screen.getByText("Sharing by invitation")).toBeVisible();
    expect(screen.getByText(/will not appear in search/i)).toBeVisible();
  });
});
