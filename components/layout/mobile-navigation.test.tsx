// @vitest-environment jsdom

import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { WorkspaceShellContext } from "@/features/workspaces/types";

import { MobileNavigation } from "./mobile-navigation";

const mocks = vi.hoisted(() => ({ pathname: "/" }));
vi.mock("next/navigation", () => ({ usePathname: () => mocks.pathname }));

describe("MobileNavigation", () => {
  it("exposes exactly the five approved Fan destinations", () => {
    mocks.pathname = "/people";
    const fanContext: WorkspaceShellContext = {
      active: {
        kind: "fan",
        id: "e4000000-0000-4000-8000-000000000101",
        slug: "fan_one",
        label: "Fan One",
        role: "fan",
      },
      available: [],
      isModerator: false,
    };

    render(<MobileNavigation assistedDiscoveryEnabled context={fanContext} />);

    const navigation = screen.getByRole("navigation", { name: "Fan mobile navigation" });
    expect(
      within(navigation)
        .getAllByRole("link")
        .map((link) => link.textContent),
    ).toEqual(["Home", "Explore", "Ask", "My Huddle", "People"]);
    expect(within(navigation).getByRole("link", { name: "Ask" })).toHaveAttribute("href", "/ask");
    expect(within(navigation).getByRole("link", { name: "People" })).toHaveAttribute(
      "aria-current",
      "page",
    );
  });

  it("exposes exactly the four approved Venue destinations", () => {
    mocks.pathname = "/venues/match-corner/workspace/settings";
    const venueContext: WorkspaceShellContext = {
      active: {
        kind: "venue",
        id: "e4000000-0000-4000-8000-000000000102",
        slug: "match-corner",
        label: "Match Corner",
        role: "admin",
      },
      available: [],
      isModerator: false,
    };

    render(<MobileNavigation assistedDiscoveryEnabled context={venueContext} />);

    const navigation = screen.getByRole("navigation", { name: "Venue mobile navigation" });
    expect(
      within(navigation)
        .getAllByRole("link")
        .map((link) => link.textContent),
    ).toEqual(["Today", "Calendar", "Events", "Venue"]);
    expect(within(navigation).getByRole("link", { name: "Venue" })).toHaveAttribute(
      "aria-current",
      "page",
    );
  });

  it("does not invent private navigation without an active workspace", () => {
    render(
      <MobileNavigation
        assistedDiscoveryEnabled
        context={{ active: null, available: [], isModerator: false }}
      />,
    );

    expect(screen.queryByRole("navigation")).not.toBeInTheDocument();
  });

  it("omits Ask when assisted discovery is disabled", () => {
    const fanContext: WorkspaceShellContext = {
      active: {
        kind: "fan",
        id: "e4000000-0000-4000-8000-000000000101",
        slug: "fan_one",
        label: "Fan One",
        role: "fan",
      },
      available: [],
      isModerator: false,
    };

    render(<MobileNavigation assistedDiscoveryEnabled={false} context={fanContext} />);

    expect(screen.queryByRole("link", { name: "Ask" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Account" })).not.toBeInTheDocument();
  });
});
