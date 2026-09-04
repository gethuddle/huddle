// @vitest-environment jsdom

import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  selectWorkspaceAction: vi.fn(),
  unstableRethrow: vi.fn(),
}));
vi.mock("@/features/workspaces/actions", () => ({
  selectWorkspaceAction: mocks.selectWorkspaceAction,
}));
vi.mock("next/navigation", () => ({
  unstable_rethrow: mocks.unstableRethrow,
}));

import { WorkspaceSwitcher } from "./workspace-switcher";

const fanId = "e4000000-0000-4000-8000-000000000101";
const venueId = "e4000000-0000-4000-8000-000000000102";

describe("WorkspaceSwitcher", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.selectWorkspaceAction.mockResolvedValue({
      ok: false,
      error: { code: "UPSTREAM_UNAVAILABLE", message: "Try again." },
    });
  });

  it("registers workspace options as menu items and selects one with roving keyboard focus", async () => {
    const user = userEvent.setup();
    render(
      <WorkspaceSwitcher
        align="start"
        active={{ kind: "fan", id: fanId, slug: "fan_one", label: "Fan One", role: "fan" }}
        available={[
          { kind: "fan", id: fanId, slug: "fan_one", label: "Fan One", role: "fan" },
          {
            kind: "venue",
            id: venueId,
            slug: "match-corner",
            label: "Match Corner",
            role: "owner",
          },
        ]}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Switch workspace" }));
    const menu = await screen.findByRole("menu");
    expect(menu).toHaveAttribute("data-align", "start");
    expect(menu).toHaveAttribute("aria-label", "Workspace switcher");
    const items = within(menu).getAllByRole("menuitem");
    expect(items).toHaveLength(3);
    expect(items[0]).toHaveTextContent("Fan One");
    expect(items[1]).toHaveTextContent("Match Corner");
    expect(items[2]).toHaveTextContent("Account settings");
    expect(items[2]).toHaveAttribute("href", "/account");

    await user.keyboard("{ArrowDown}");
    expect(items[0]).toHaveFocus();
    await user.keyboard("{ArrowDown}");
    expect(items[1]).toHaveFocus();
    await user.keyboard("{Enter}");

    await waitFor(() => expect(mocks.selectWorkspaceAction).toHaveBeenCalledOnce());
    const submission = mocks.selectWorkspaceAction.mock.calls[0]?.[1];
    expect(submission).toBeInstanceOf(FormData);
    expect((submission as FormData).get("kind")).toBe("venue");
    expect((submission as FormData).get("id")).toBe(venueId);
  });

  it("keeps long Venue identity text out of the compact mobile header", () => {
    render(
      <WorkspaceSwitcher
        active={{
          kind: "venue",
          id: venueId,
          slug: "match-corner",
          label: "A Very Long Venue Name",
          role: "owner",
        }}
        appearance="venue"
        available={[
          {
            kind: "venue",
            id: venueId,
            slug: "match-corner",
            label: "A Very Long Venue Name",
            role: "owner",
          },
        ]}
      />,
    );

    expect(
      screen.getByRole("button", { name: "Switch workspace" }).querySelector(".text-left"),
    ).toHaveClass("hidden", "sm:block");
  });

  it("shows a visible retryable message when workspace action transport fails", async () => {
    const user = userEvent.setup();
    const transportError = new Error("network failed");
    mocks.selectWorkspaceAction.mockRejectedValueOnce(transportError);
    render(
      <WorkspaceSwitcher
        active={{ kind: "fan", id: fanId, slug: "fan_one", label: "Fan One", role: "fan" }}
        available={[
          { kind: "fan", id: fanId, slug: "fan_one", label: "Fan One", role: "fan" },
          {
            kind: "venue",
            id: venueId,
            slug: "match-corner",
            label: "Match Corner",
            role: "owner",
          },
        ]}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Switch workspace" }));
    await user.click(await screen.findByRole("menuitem", { name: /Match Corner/ }));

    expect(mocks.unstableRethrow).toHaveBeenCalledWith(transportError);
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "We could not switch workspaces. Please try again.",
    );
  });
});
