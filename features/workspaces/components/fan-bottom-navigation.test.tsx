// @vitest-environment jsdom

import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ usePathname: () => "/dashboard" }));

import { FanBottomNavigation } from "./fan-bottom-navigation";

describe("FanBottomNavigation", () => {
  it("contains exactly the five approved destinations with current-route semantics", () => {
    render(<FanBottomNavigation />);

    const navigation = screen.getByRole("navigation", { name: "Fan mobile navigation" });
    const links = within(navigation).getAllByRole("link");
    expect(links.map((link) => link.textContent)).toEqual([
      "Home",
      "Explore",
      "My Huddle",
      "People",
      "Account",
    ]);
    expect(within(navigation).getByRole("link", { name: "My Huddle" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(within(navigation).queryByText(/create venue/i)).not.toBeInTheDocument();
  });
});
