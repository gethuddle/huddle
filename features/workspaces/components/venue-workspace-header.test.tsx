// @vitest-environment jsdom

import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  usePathname: () => "/venues/match-corner/workspace/calendar",
}));

import { VenueWorkspaceHeader } from "./venue-workspace-header";

describe("VenueWorkspaceHeader", () => {
  it("contains exactly five live destinations and no Fan tools", () => {
    render(<VenueWorkspaceHeader slug="match-corner" venueName="Match Corner" />);

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
    expect(screen.queryByText(/friends|groups|host event/i)).not.toBeInTheDocument();
  });
});
