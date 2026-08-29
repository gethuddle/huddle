// @vitest-environment jsdom

import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { AppShell } from "./app-shell";

const mocks = vi.hoisted(() => ({
  getClaims: vi.fn(),
  profileMaybeSingle: vi.fn(),
  rpc: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { getClaims: mocks.getClaims },
    from: () => ({
      select: () => ({
        eq: () => ({ maybeSingle: mocks.profileMaybeSingle }),
      }),
    }),
    rpc: mocks.rpc,
  }),
}));

describe("AppShell", () => {
  beforeEach(() => {
    mocks.getClaims.mockResolvedValue({ data: null, error: null });
    mocks.profileMaybeSingle.mockResolvedValue({
      data: { profile_completed_at: "2026-08-25T00:00:00Z" },
      error: null,
    });
    mocks.rpc.mockResolvedValue({ data: false, error: null });
  });

  it("provides anonymous navigation, main-content access, and a truthful footer", async () => {
    render(await AppShell({ children: <h1>Page content</h1> }));

    expect(screen.getByRole("link", { name: "Skip to content" })).toHaveAttribute(
      "href",
      "#main-content",
    );
    expect(screen.getByRole("link", { name: "Huddle home" })).toHaveAttribute("href", "/");
    expect(
      within(screen.getByRole("navigation", { name: "Primary navigation" })).getByRole("link", {
        name: "Fixtures",
      }),
    ).toHaveAttribute("href", "/matches");
    expect(screen.getByRole("link", { name: "Discover" })).toHaveAttribute("href", "/discover");
    expect(screen.getByRole("link", { name: "Groups" })).toHaveAttribute("href", "/groups");
    expect(screen.getByRole("link", { name: "Sign in" })).toHaveAttribute("href", "/auth/sign-in");
    expect(screen.getByRole("link", { name: "Sign up" })).toHaveAttribute("href", "/auth/sign-up");
    expect(
      within(screen.getByRole("main")).getByRole("heading", { name: "Page content" }),
    ).toBeVisible();
    expect(screen.getByRole("link", { name: "football-data.org" })).toHaveAttribute(
      "href",
      "https://www.football-data.org/",
    );
    expect(screen.getByRole("link", { name: "Data sources" })).toHaveAttribute(
      "href",
      "/data-sources",
    );
  });

  it("offers sign-out only when the server has validated session claims", async () => {
    const user = userEvent.setup();
    mocks.getClaims.mockResolvedValue({
      data: { claims: { sub: "user-id" } },
      error: null,
    });

    render(await AppShell({ children: <h1>Private session</h1> }));

    expect(screen.getByRole("link", { name: "My Huddle" })).toHaveAttribute("href", "/dashboard");
    expect(screen.getByRole("link", { name: "Host event" })).toHaveAttribute("href", "/events/new");
    expect(screen.getByRole("button", { name: "Sign out" })).toBeVisible();
    expect(screen.queryByRole("link", { name: "Sign up" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Open account navigation" }));
    expect(screen.getByRole("menuitem", { name: "Profile" })).toHaveAttribute(
      "href",
      "/settings/profile",
    );
    expect(screen.getByRole("menuitem", { name: "Interests" })).toHaveAttribute(
      "href",
      "/settings/interests",
    );
    expect(screen.getByRole("menuitem", { name: "Safety" })).toHaveAttribute("href", "/reports");
  });

  it("keeps an incomplete account focused on finishing setup", async () => {
    mocks.getClaims.mockResolvedValue({
      data: { claims: { sub: "incomplete-user-id" } },
      error: null,
    });
    mocks.profileMaybeSingle.mockResolvedValue({
      data: { profile_completed_at: null },
      error: null,
    });

    render(await AppShell({ children: <h1>Onboarding</h1> }));

    expect(screen.getByRole("link", { name: "Finish setup" })).toHaveAttribute(
      "href",
      "/settings/profile",
    );
    expect(screen.queryByRole("link", { name: "My Huddle" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Host event" })).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Open account navigation" }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Sign out" })).toBeVisible();
  });

  it("shows the platform queue only to a server-verified moderator", async () => {
    const user = userEvent.setup();
    mocks.getClaims.mockResolvedValue({ data: { claims: { sub: "moderator-id" } }, error: null });
    mocks.rpc.mockResolvedValue({ data: true, error: null });

    render(await AppShell({ children: <h1>Moderator session</h1> }));

    await user.click(screen.getByRole("button", { name: "Open account navigation" }));
    expect(screen.getByRole("menuitem", { name: "Moderation" })).toHaveAttribute(
      "href",
      "/moderation",
    );
  });
});
