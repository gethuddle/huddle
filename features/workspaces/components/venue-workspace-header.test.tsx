// @vitest-environment jsdom

import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  usePathname: () => "/venues/match-corner/workspace/calendar",
}));

import {
  VenueWorkspaceHeader,
  VenueBillingNavigation,
  VenueMobileNavigation,
} from "./venue-workspace-header";

describe("VenueWorkspaceHeader", () => {
  it("keeps Billing secondary and venue-specific with four mobile destinations", () => {
    render(
      <>
        <VenueBillingNavigation slug="match-corner" />
        <VenueMobileNavigation slug="match-corner" />
      </>,
    );
    expect(screen.getByRole("link", { name: "Billing" })).toHaveAttribute(
      "href",
      "/venues/match-corner/workspace/billing",
    );
    expect(
      within(screen.getByRole("navigation", { name: "Venue mobile navigation" })).getAllByRole(
        "link",
      ),
    ).toHaveLength(4);
  });
  it("contains exactly four live destinations and no Fan or Account tools", () => {
    render(<VenueWorkspaceHeader slug="match-corner" venueName="Match Corner" />);

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
    expect(navigation.querySelector("[data-pending]")).not.toBeInTheDocument();
    expect(screen.queryByText(/friends|groups|host event/i)).not.toBeInTheDocument();
  });
});
