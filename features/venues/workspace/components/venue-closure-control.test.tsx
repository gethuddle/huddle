// @vitest-environment jsdom

import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  archiveVenueAction: vi.fn(),
  refresh: vi.fn(),
  replace: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: mocks.refresh, replace: mocks.replace }),
}));
vi.mock("@/features/venues/workspace/actions", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/features/venues/workspace/actions")>();
  return { ...actual, archiveVenueAction: mocks.archiveVenueAction };
});

import { VenueClosureControl } from "./venue-closure-control";

describe("VenueClosureControl", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.archiveVenueAction.mockResolvedValue({
      ok: true,
      data: { message: "Venue closed." },
    });
  });

  it("requires the exact Venue name and keeps billing recovery reachable after closure", async () => {
    const user = userEvent.setup();
    render(
      <VenueClosureControl
        venueId="e4000000-0000-4000-8000-000000000101"
        venueName="Match Corner"
        venueSlug="match-corner"
      />,
    );

    await user.click(screen.getByRole("button", { name: "Close venue" }));
    expect(screen.getByText(/does not cancel your demo subscription/i)).toBeVisible();
    expect(screen.getByRole("link", { name: "Billing" })).toHaveAttribute(
      "href",
      "/venues/match-corner/workspace/billing",
    );
    expect(screen.getByText(/past event and attendance records/i)).toBeVisible();
    const confirm = screen.getByRole("button", { name: "Close venue permanently" });
    expect(confirm).toBeDisabled();
    await user.type(screen.getByLabelText("Venue name"), "Match Corner");
    expect(confirm).toBeEnabled();
    await user.click(confirm);

    await waitFor(() => expect(mocks.archiveVenueAction).toHaveBeenCalledOnce());
    expect(mocks.archiveVenueAction).toHaveBeenCalledWith(null, {
      venueId: "e4000000-0000-4000-8000-000000000101",
      venueName: "Match Corner",
      venueSlug: "match-corner",
      confirmation: "Match Corner",
    });
    expect(mocks.replace).toHaveBeenCalledWith("/venues/match-corner/billing");
  });
});
