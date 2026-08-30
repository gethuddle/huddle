// @vitest-environment jsdom

import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ createGroupInviteAction: vi.fn() }));

vi.mock("@/features/groups/membership-actions", () => ({
  createGroupInviteAction: mocks.createGroupInviteAction,
}));

import { GroupShareDialog } from "./group-share-dialog";

const group = {
  groupId: "52000000-0000-4000-8000-000000000201",
  groupName: "Haifa Group",
  groupSlug: "haifa-group",
};

describe("GroupShareDialog", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText: vi.fn().mockResolvedValue(undefined) },
    });
  });

  it("copies and opens the supported application link for a discoverable group", async () => {
    const user = userEvent.setup();
    const writeText = vi.spyOn(navigator.clipboard, "writeText");
    render(<GroupShareDialog {...group} canManage visibility="discoverable" />);

    await user.click(screen.getByRole("button", { name: "Share group" }));
    expect(screen.getByRole("dialog", { name: "Share Haifa Group" })).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Copy application link" }));

    await waitFor(() =>
      expect(writeText).toHaveBeenCalledWith(
        expect.stringContaining("/groups/haifa-group#group-application-heading"),
      ),
    );
    expect(screen.getByRole("link", { name: "Open application page" })).toHaveAttribute(
      "href",
      "/groups/haifa-group#group-application-heading",
    );
  });

  it("keeps unlisted invitation creation and registered-supporter search in context", async () => {
    const user = userEvent.setup();
    render(
      <GroupShareDialog
        {...group}
        candidates={[
          {
            id: "52000000-0000-4000-8000-000000000101",
            handle: "supporter",
            displayName: "Supporter One",
            context: "Friend · Haifa",
          },
        ]}
        canManage
        visibility="unlisted"
      />,
    );

    await user.click(screen.getByRole("button", { name: "Share group" }));
    await user.type(
      screen.getByRole("searchbox", { name: "Find a registered supporter" }),
      "support",
    );

    expect(screen.getByText("Supporter One · @supporter")).toBeVisible();
    await user.click(screen.getByRole("radio", { name: /Supporter One/ }));
    expect(screen.getByText(/Link recipient: @supporter/)).toBeVisible();
    expect(screen.getByRole("button", { name: "Create invitation link" })).toBeVisible();
    expect(screen.queryByText(/unavailable/i)).not.toBeInTheDocument();
  });
});
