// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ updateGroupDescriptionAction: vi.fn() }));

vi.mock("@/features/groups/membership-actions", () => ({
  updateGroupDescriptionAction: mocks.updateGroupDescriptionAction,
}));

import { GroupSettingsForm } from "./group-settings-form";

describe("GroupSettingsForm", () => {
  it("keeps editable overview copy and truthful visibility state in one settings surface", () => {
    render(
      <GroupSettingsForm
        description="A respectful local group."
        groupId="52000000-0000-4000-8000-000000000201"
        groupSlug="haifa-group"
        visibility="discoverable"
      />,
    );

    expect(screen.getByRole("textbox", { name: "Short description" })).toHaveValue(
      "A respectful local group.",
    );
    expect(screen.getByText("Discoverable")).toBeVisible();
    expect(screen.getByText(/People can find the group and apply/i)).toBeVisible();
    expect(document.body).not.toHaveTextContent(/lifecycle|synchronized/i);
  });
});
