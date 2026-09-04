// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import NotFound from "./not-found";

const mocks = vi.hoisted(() => ({ getAppShellState: vi.fn() }));
vi.mock("@/features/workspaces/queries", () => ({
  getAppShellState: mocks.getAppShellState,
}));

describe("not-found state", () => {
  beforeEach(() => vi.clearAllMocks());

  it("uses non-enumerating copy and signed-out recovery", async () => {
    mocks.getAppShellState.mockResolvedValue({
      isSignedIn: false,
      workspace: { active: null, available: [] },
    });
    render(await NotFound());

    expect(screen.getByRole("heading", { name: "This page isn’t available." })).toBeVisible();
    expect(screen.getByText(/may not be visible to you/i)).toBeVisible();
    expect(screen.getByRole("link", { name: "Sign in" })).toHaveAttribute("href", "/auth/sign-in");
    expect(screen.getByRole("link", { name: "Browse events" })).toHaveAttribute(
      "href",
      "/discover",
    );
  });

  it("offers only known local Fan recovery without revealing the missing object", async () => {
    mocks.getAppShellState.mockResolvedValue({
      isSignedIn: true,
      workspace: {
        active: {
          kind: "fan",
          id: "e4000000-0000-4000-8000-000000000101",
          slug: "fan_one",
          label: "Fan One",
          role: "fan",
        },
        available: [],
      },
    });
    render(await NotFound());

    expect(screen.getByRole("link", { name: "Open My Huddle" })).toHaveAttribute(
      "href",
      "/dashboard",
    );
    expect(screen.queryByText(/(event|group|venue) was deleted/i)).not.toBeInTheDocument();
  });
});
