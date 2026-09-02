// @vitest-environment jsdom

import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { AppShellState } from "@/features/workspaces/types";

import { AppShell } from "./app-shell";

const mocks = vi.hoisted(() => ({
  getAppShellState: vi.fn(),
  pathname: "/",
  router: { refresh: vi.fn(), replace: vi.fn() },
}));

vi.mock("next/navigation", () => ({
  usePathname: () => mocks.pathname,
  useRouter: () => mocks.router,
}));
vi.mock("@/features/workspaces/queries", () => ({
  getAppShellState: mocks.getAppShellState,
}));
vi.mock("@/lib/env/server", () => ({
  getServerEnvironment: () => ({ ASSISTED_DISCOVERY_ENABLED: true }),
}));

const anonymousState: AppShellState = {
  isSignedIn: false,
  workspace: { active: null, available: [], isModerator: false },
};

describe("AppShell", () => {
  beforeEach(() => {
    vi.clearAllMocks();
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
    expect(
      screen.getByRole("link", { name: "Huddle home" }).parentElement?.parentElement,
    ).toHaveClass("flex", "justify-between", "lg:grid");
    const navigation = screen.getByRole("navigation", { name: "Public navigation" });
    const publicExplore = within(navigation).getByRole("link", { name: "Explore" });
    expect(publicExplore).toHaveAttribute("href", "/discover");
    expect(publicExplore).toHaveAttribute("data-variant", "secondary");
    expect(publicExplore).toHaveClass("rounded-full", "border-border", "bg-secondary");
    await user.click(screen.getByRole("button", { name: "Open public navigation" }));
    const mobileNavigation = await screen.findByRole("menu");
    const mobileLinks = within(mobileNavigation).getAllByRole("menuitem");
    expect(mobileLinks).toHaveLength(3);
    expect(within(mobileNavigation).getByRole("menuitem", { name: "Explore" })).toHaveAttribute(
      "href",
      "/discover",
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

  it("uses the supplied Fan shell with Ask centered and one workspace menu at the edge", async () => {
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
    ).toEqual(["Home", "Explore", "Ask Huddle", "My Huddle", "People"]);
    expect(within(navigation).getByRole("link", { name: "My Huddle" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(within(navigation).getByRole("link", { name: "My Huddle" })).toHaveClass("text-forest");
    expect(within(navigation).getByRole("link", { name: "My Huddle" })).not.toHaveClass("bg-court");
    expect(screen.getByRole("button", { name: "Switch workspace" })).toBeVisible();
    expect(screen.queryByRole("link", { name: "Create venue" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Host event" })).not.toBeInTheDocument();
  });

  it("gives Ask the full shell viewport and removes the ordinary page footer", async () => {
    mocks.pathname = "/ask";
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

    render(await AppShell({ children: <section>Ask conversation</section> }));

    expect(screen.getByRole("main")).toHaveAttribute("data-shell-mode", "immersive");
    expect(screen.getByRole("main")).toHaveClass("max-w-none", "overflow-hidden", "px-0");
    expect(screen.queryByRole("contentinfo")).not.toBeInTheDocument();
  });

  it("isolates auth pages from signed-in workspace navigation and the ordinary footer", async () => {
    mocks.pathname = "/auth/reset-password";
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

    render(await AppShell({ children: <h1>Reset password</h1> }));

    expect(screen.getByRole("main")).toHaveAttribute("data-shell-mode", "auth");
    expect(screen.getByRole("banner")).toHaveTextContent("Huddle");
    expect(screen.queryByRole("navigation", { name: "Fan navigation" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Switch workspace" })).not.toBeInTheDocument();
    expect(screen.queryByRole("contentinfo")).not.toBeInTheDocument();
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
    ).toEqual(["Today", "Calendar", "Events", "Venue"]);
    expect(within(navigation).getByRole("link", { name: "Calendar" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(within(navigation).getByRole("link", { name: "Calendar" })).toHaveClass("text-forest");
    expect(within(navigation).getByRole("link", { name: "Calendar" })).not.toHaveClass(
      "bg-border-dark",
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
