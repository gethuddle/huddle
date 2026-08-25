// @vitest-environment jsdom

import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { BlockControl } from "./block-control";

const mocks = vi.hoisted(() => ({ setBlockPreferenceAction: vi.fn() }));

vi.mock("@/features/safety/actions", () => ({
  setBlockPreferenceAction: mocks.setBlockPreferenceAction,
}));

describe("BlockControl", () => {
  beforeEach(() => vi.clearAllMocks());

  it("requires a deliberate confirmation and explains that the block stays private", async () => {
    const user = userEvent.setup();
    render(<BlockControl initiallyBlocked={false} targetHandle="fan_two" />);

    await user.click(screen.getByRole("button", { name: "Block @fan_two" }));

    expect(screen.getByRole("alertdialog")).toHaveTextContent("They will not be notified");
    expect(screen.getByRole("button", { name: "Confirm block" })).toBeVisible();

    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
  });

  it("moves to the unblock state after the generic successful result", async () => {
    mocks.setBlockPreferenceAction
      .mockResolvedValueOnce({
        ok: true,
        data: {
          message: "Safety preference updated.",
          intent: "block",
          targetHandle: "fan_two",
        },
      })
      .mockResolvedValueOnce({
        ok: true,
        data: {
          message: "Safety preference updated.",
          intent: "unblock",
          targetHandle: "fan_two",
        },
      });
    const user = userEvent.setup();
    render(<BlockControl initiallyBlocked={false} targetHandle="fan_two" />);

    await user.click(screen.getByRole("button", { name: "Block @fan_two" }));
    await user.click(screen.getByRole("button", { name: "Confirm block" }));

    await waitFor(() => expect(mocks.setBlockPreferenceAction).toHaveBeenCalledOnce());
    expect(await screen.findByRole("button", { name: "Unblock @fan_two" })).toBeVisible();
    expect(screen.getByRole("status")).toHaveTextContent("Safety preference updated.");

    await user.click(screen.getByRole("button", { name: "Unblock @fan_two" }));
    expect(await screen.findByRole("button", { name: "Block @fan_two" })).toBeVisible();
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
  });

  it("offers only the caller's outgoing unblock control when already blocked", () => {
    render(<BlockControl initiallyBlocked targetHandle="fan_two" />);

    expect(screen.getByRole("button", { name: "Unblock @fan_two" })).toBeVisible();
    expect(screen.queryByText(/blocked you/i)).not.toBeInTheDocument();
  });
});
