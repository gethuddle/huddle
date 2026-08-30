// @vitest-environment jsdom

import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { AppShellState } from "@/features/workspaces/types";

import { AppShell } from "./app-shell";

const mocks = vi.hoisted(() => ({
  getAppShellState: vi.fn(),
  pathname: "/",
}));

vi.mock("next/navigation", () => ({ usePathname: () => mocks.pathname }));
vi.mock("@/features/workspaces/queries", () => ({
  getAppShellState: mocks.getAppShellState,
}));

const anonymousState: AppShellState = {
  isSignedIn: false,
  workspace: { active: null, available: [], isModerator: false },
};

describe("AppShell", () => {
  beforeEach(() => {
    mocks.pathname = "/";
    mocks.getAppShellState.mockResolvedValue(anonymousState);
  });

  it("keeps signed-out pages usable with concise desktop and mobile public navigation", async () => {
    const user = userEvent.setup();
    render(await AppShell({ children: <h1>Page content</h1> }));

    expect(screen.getByRole("link", { name: "Skip to content" })).toHaveAttribute(
      "href",
      "#main-content",
    );
    expect(screen.getByRole("link", { name: "Huddle home" })).toHaveAttribute("href", "/");
    const navigation = screen.getByRole("navigation", { name: "Public navigation" });
    expect(within(navigation).getByRole("link", { name: "Explore" })).toHaveAttribute(
      "href",
      "/discover",
    );
    expect(within(navigation).getByRole("link", { name: "Fixtures" })).toHaveAttribute(
      "href",
      "/matches",
    );
    await user.click(screen.getByRole("button", { name: "Open public navigation" }));
    const mobileNavigation = await screen.findByRole("menu");
    const mobileLinks = within(mobileNavigation).getAllByRole("menuitem");
    expect(mobileLinks).toHaveLength(4);
    expect(within(mobileNavigation).getByRole("menuitem", { name: "Explore" })).toHaveAttribute(
      "href",
      "/discover",
    );
    expect(within(mobileNavigation).getByRole("menuitem", { name: "Fixtures" })).toHaveAttribute(
      "href",
      "/matches",
    );
    expect(within(mobileNavigation).getByRole("menuitem", { name: "Sign up" })).toHaveAttribute(
      "href",
      "/auth/sign-up",
    );
    expect(within(mobileNavigation).getByRole("menuitem", { name: "Sign in" })).toHaveAttribute(
      "href",
      "/auth/sign-in",
    );
    await user.keyboard("{Escape}");
    expect(within(screen.getByRole("main")).getByText("Page content")).toBeVisible();
    expect(screen.getByRole("link", { name: "football-data.org" })).toHaveAttribute(
      "href",
      "https://www.football-data.org/",
    );
  });

  it("uses the supplied Fan shell with four centered destinations and identity at the edge", async () => {
    mocks.pathname = "/dashboard";
    const fan = {
      kind: "fan" as const,
      id: "e4000000-0000-4000-8000-000000000101",
      slug: "fan_one",
      label: "Fan One",
      role: "fan" as const,
    };
    mocks.getAppShellState.mockResolvedValue({
      isSignedIn: true,
      workspace: { active: fan, available: [fan], isModerator: false },
    } satisfies AppShellState);

    render(await AppShell({ children: <h1>Fan Home</h1> }));

    const navigation = screen.getByRole("navigation", { name: "Fan navigation" });
    expect(
      within(navigation)
        .getAllByRole("link")
        .map((link) => link.textContent),
    ).toEqual(["Home", "Explore", "My Huddle", "People"]);
    expect(within(navigation).getByRole("link", { name: "My Huddle" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(within(navigation).getByRole("link", { name: "My Huddle" })).toHaveClass(
      "rounded-full",
      "bg-court",
      "text-ink",
    );
    expect(screen.getByRole("button", { name: "Switch workspace" })).toBeVisible();
    expect(screen.queryByRole("link", { name: "Create venue" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Host event" })).not.toBeInTheDocument();
  });

  it("keeps a signed-in identity with no workspace focused on choosing setup", async () => {
    mocks.getAppShellState.mockResolvedValue({
      isSignedIn: true,
      workspace: { active: null, available: [], isModerator: false },
    } satisfies AppShellState);

    render(await AppShell({ children: <h1>Onboarding</h1> }));

    expect(screen.getByRole("link", { name: "Choose setup" })).toHaveAttribute(
      "href",
      "/onboarding",
    );
    expect(screen.queryByRole("navigation", { name: "Fan navigation" })).not.toBeInTheDocument();
    expect(screen.queryByRole("navigation", { name: "Venue navigation" })).not.toBeInTheDocument();
  });

  it("renders only authorized Venue workspace destinations on a Venue route", async () => {
    mocks.pathname = "/venues/match-corner/workspace/calendar";
    const venue = {
      kind: "venue" as const,
      id: "e4000000-0000-4000-8000-000000000102",
      slug: "match-corner",
      label: "Match Corner",
      role: "owner" as const,
    };
    mocks.getAppShellState.mockResolvedValue({
      isSignedIn: true,
      workspace: { active: venue, available: [venue], isModerator: false },
    } satisfies AppShellState);

    render(await AppShell({ children: <h1>Venue Calendar</h1> }));

    expect(screen.getByRole("link", { name: "Huddle home" })).toHaveAttribute(
      "href",
      "/venues/match-corner/workspace",
    );
    expect(screen.getByRole("link", { name: "Huddle home" })).toHaveTextContent("Huddle");
    const navigation = screen.getByRole("navigation", { name: "Venue navigation" });
    expect(
      within(navigation)
        .getAllByRole("link")
        .map((link) => link.textContent),
    ).toEqual(["Today", "Calendar", "Events", "Venue", "Account"]);
    expect(within(navigation).getByRole("link", { name: "Calendar" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(within(navigation).getByRole("link", { name: "Calendar" })).toHaveClass(
      "rounded-full",
      "bg-border-dark",
      "text-linen",
    );
    expect(screen.queryByRole("link", { name: "Plan events" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Switch workspace" })).toHaveTextContent(
      "Match Corner",
    );
  });

  it("uses an authorized route workspace for a Fan plus Venue account", async () => {
    mocks.pathname = "/venues/match-corner/workspace";
    const fan = {
      kind: "fan" as const,
      id: "e4000000-0000-4000-8000-000000000101",
      slug: "fan_one",
      label: "Fan One",
      role: "fan" as const,
    };
    const venue = {
      kind: "venue" as const,
      id: "e4000000-0000-4000-8000-000000000102",
      slug: "match-corner",
      label: "Match Corner",
      role: "owner" as const,
    };
    mocks.getAppShellState.mockResolvedValue({
      isSignedIn: true,
      workspace: { active: fan, available: [fan, venue], isModerator: false },
    } satisfies AppShellState);

    render(await AppShell({ children: <h1>Venue Today</h1> }));

    expect(screen.getByRole("navigation", { name: "Venue navigation" })).toBeVisible();
    expect(screen.queryByRole("navigation", { name: "Fan navigation" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Switch workspace" })).toBeVisible();
  });
});
