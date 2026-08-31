// @vitest-environment jsdom

import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ updateGroupDescriptionAction: vi.fn() }));

vi.mock("@/features/groups/membership-actions", () => ({
  updateGroupDescriptionAction: mocks.updateGroupDescriptionAction,
}));

import { GroupDiscoveryProgress } from "./group-discovery-progress";

describe("GroupDiscoveryProgress", () => {
  it("shows only the genuinely required search setup without artificial activity gates", () => {
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

    expect(screen.getByText("Add a short description")).toBeVisible();
    expect(screen.queryByText(/Invite 1 more member/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Add 1 more admin/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Add one rule/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Publish one upcoming event/i)).not.toBeInTheDocument();
    expect(screen.getByText(/Members, rules, and events are optional/i)).toBeVisible();
    expect(screen.getByText("Finish making this group searchable")).toBeVisible();
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

    fireEvent.click(screen.getByText("Search and setup details"));
    expect(screen.getByText(/will not appear in search/i)).toBeVisible();
  });
});
