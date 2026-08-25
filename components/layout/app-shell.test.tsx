// @vitest-environment jsdom

import { render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { AppShell } from "./app-shell";

const mocks = vi.hoisted(() => ({
  getClaims: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ auth: { getClaims: mocks.getClaims } }),
}));

describe("AppShell", () => {
  beforeEach(() => {
    mocks.getClaims.mockResolvedValue({ data: null, error: null });
  });

  it("provides anonymous navigation, main-content access, and a truthful footer", async () => {
    render(await AppShell({ children: <h1>Page content</h1> }));

    expect(screen.getByRole("link", { name: "Skip to content" })).toHaveAttribute(
      "href",
      "#main-content",
    );
    expect(
      within(screen.getByRole("navigation", { name: "Primary navigation" })).getByRole("link", {
        name: "Home",
      }),
    ).toHaveAttribute("href", "/");
    expect(screen.getByRole("link", { name: "Sign in" })).toHaveAttribute("href", "/auth/sign-in");
    expect(screen.getByRole("link", { name: "Sign up" })).toHaveAttribute("href", "/auth/sign-up");
    expect(
      within(screen.getByRole("main")).getByRole("heading", { name: "Page content" }),
    ).toBeVisible();
    expect(
      screen.getByText("Sports-data attribution will appear here when synchronization begins."),
    ).toBeVisible();
  });

  it("offers sign-out only when the server has validated session claims", async () => {
    mocks.getClaims.mockResolvedValue({
      data: { claims: { sub: "user-id" } },
      error: null,
    });

    render(await AppShell({ children: <h1>Private session</h1> }));

    expect(screen.getByText("Signed in")).toBeVisible();
    expect(screen.getByRole("button", { name: "Sign out" })).toBeVisible();
    expect(screen.queryByRole("link", { name: "Sign up" })).not.toBeInTheDocument();
  });
});
