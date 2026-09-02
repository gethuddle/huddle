// @vitest-environment jsdom

import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ usePathname: () => "/dashboard" }));

import { FanBottomNavigation, fanDestinationIsCurrent } from "./fan-bottom-navigation";

describe("FanBottomNavigation", () => {
  it("treats event, group, and fixture discovery as one Explore route family", () => {
    expect(fanDestinationIsCurrent("/discover", "/discover")).toBe(true);
    expect(fanDestinationIsCurrent("/groups", "/discover")).toBe(true);
    expect(fanDestinationIsCurrent("/matches/fixture-id", "/discover")).toBe(true);
    expect(fanDestinationIsCurrent("/dashboard", "/discover")).toBe(false);
  });

  it("contains exactly the five approved destinations with current-route semantics", () => {
    render(<FanBottomNavigation assistedDiscoveryEnabled />);

    const navigation = screen.getByRole("navigation", { name: "Fan mobile navigation" });
    const links = within(navigation).getAllByRole("link");
    expect(links.map((link) => link.textContent)).toEqual([
      "Home",
      "Explore",
      "Ask",
      "My Huddle",
      "People",
    ]);
    expect(within(navigation).getByRole("link", { name: "My Huddle" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(
      within(navigation)
        .getByRole("link", { name: "Ask" })
        .querySelector('[data-slot="ask-navigation-mark"]'),
    ).toHaveClass("bg-primary");
    expect(within(navigation).queryByText(/create venue/i)).not.toBeInTheDocument();
  });
});
