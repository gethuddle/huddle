// @vitest-environment jsdom

import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { FriendshipControl } from "./friendship-control";

const mocks = vi.hoisted(() => ({ updateFriendshipAction: vi.fn() }));

vi.mock("@/features/friendships/actions", () => ({
  updateFriendshipAction: mocks.updateFriendshipAction,
}));

const friendshipId = "50000000-0000-4000-8000-000000000101";

describe("FriendshipControl", () => {
  beforeEach(() => vi.clearAllMocks());

  it("sends a request and moves to the outgoing state without a reload", async () => {
    mocks.updateFriendshipAction.mockResolvedValue({
      ok: true,
      data: {
        message: "Friend request sent.",
        intent: "request",
        targetHandle: "fan_two",
        friendship: { id: friendshipId, status: "pending", direction: "outgoing" },
      },
    });
    const user = userEvent.setup();
    render(<FriendshipControl initialFriendship={null} targetHandle="fan_two" />);

    const addButton = screen.getByRole("button", { name: "Add friend" });
    expect(addButton).toHaveClass("min-h-11");
    await user.click(addButton);

    await waitFor(() => expect(mocks.updateFriendshipAction).toHaveBeenCalledOnce());
    expect(await screen.findByText("Request sent")).toBeVisible();
    expect(screen.getByRole("button", { name: "Cancel request" })).toBeVisible();
  });

  it("lets only the incoming recipient accept or decline", async () => {
    mocks.updateFriendshipAction.mockResolvedValue({
      ok: true,
      data: {
        message: "Friend request accepted.",
        intent: "accept",
        targetHandle: "fan_two",
        friendship: { id: friendshipId, status: "accepted", direction: "accepted" },
      },
    });
    const user = userEvent.setup();
    render(
      <FriendshipControl
        initialFriendship={{ id: friendshipId, status: "pending", direction: "incoming" }}
        targetHandle="fan_two"
      />,
    );

    expect(screen.getByRole("button", { name: "Accept" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Decline" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Accept" })).toHaveClass("min-h-11");
    expect(screen.getByRole("button", { name: "Decline" })).toHaveClass("min-h-11");
    await user.click(screen.getByRole("button", { name: "Accept" }));

    expect(await screen.findByText("Friends")).toBeVisible();
    expect(screen.getByRole("button", { name: "Remove friend" })).toBeVisible();
  });

  it("does not offer a request while the viewer's own block is active", () => {
    render(
      <FriendshipControl disabledByOwnBlock initialFriendship={null} targetHandle="fan_two" />,
    );

    expect(screen.getByText("Direct interaction is paused.")).toBeVisible();
    expect(screen.queryByRole("button", { name: "Add friend" })).not.toBeInTheDocument();
    expect(screen.queryByText(/blocked you/i)).not.toBeInTheDocument();
  });

  it("explains friends-only visibility loss before removing a friend", async () => {
    mocks.updateFriendshipAction.mockResolvedValue({
      ok: true,
      data: {
        message: "Friend removed.",
        intent: "remove",
        targetHandle: "fan_two",
        friendship: null,
      },
    });
    const user = userEvent.setup();
    render(
      <FriendshipControl
        initialFriendship={{ id: friendshipId, status: "accepted", direction: "accepted" }}
        targetHandle="fan_two"
      />,
    );

    await user.click(screen.getByRole("button", { name: "Remove friend" }));
    expect(screen.getByRole("alertdialog")).toHaveTextContent(
      "You will immediately lose access to each other’s friends-only events",
    );
    expect(mocks.updateFriendshipAction).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "Keep friend" }));
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Remove friend" })).toHaveFocus();

    await user.click(screen.getByRole("button", { name: "Remove friend" }));
    await user.click(screen.getByRole("button", { name: "Confirm removal" }));
    await waitFor(() => expect(mocks.updateFriendshipAction).toHaveBeenCalledOnce());
  });
});
