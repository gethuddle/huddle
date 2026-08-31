// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ updateVenueSettingsAction: vi.fn() }));

vi.mock("@/features/locations/components/address-search", () => ({
  AddressSearch: ({ onConfirm }: { onConfirm: (value: unknown) => void }) => (
    <button
      onClick={() =>
        onConfirm({
          id: "replacement",
          label: "14 New Street, Haifa",
          latitude: 32.81,
          longitude: 34.99,
        })
      }
      type="button"
    >
      Confirm replacement address
    </button>
  ),
}));
vi.mock("@/features/venues/workspace/actions", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/features/venues/workspace/actions")>();
  return { ...actual, updateVenueSettingsAction: mocks.updateVenueSettingsAction };
});

import { VenueSettingsForm } from "./venue-settings-form";

const venue = {
  id: "e4000000-0000-4000-8000-000000000101",
  slug: "match-corner",
  name: "Match Corner",
  addressText: "12 Stadium Street, Haifa",
  description: "A welcoming venue for watching the full match together.",
  facilities: ["food", "drinks"] as const,
  houseInformation: "Order at the bar before kick-off.",
  defaultAttendanceMode: "reservations" as const,
  defaultRequiresApproval: true,
};

describe("VenueSettingsForm", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.updateVenueSettingsAction.mockResolvedValue({
      ok: true,
      data: {
        message: "Venue profile and defaults updated.",
        venue: { id: venue.id, slug: venue.slug, verificationStatus: "unverified" },
      },
    });
  });

  it("reuses public-address search without rendering raw coordinate controls", async () => {
    const user = userEvent.setup();
    render(<VenueSettingsForm venue={venue} />);

    expect(screen.getByText("12 Stadium Street, Haifa")).toBeVisible();
    expect(screen.queryByRole("combobox", { name: "City" })).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/latitude|longitude/i)).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Change public address" }));
    await user.click(screen.getByRole("button", { name: "Confirm replacement address" }));
    await user.click(screen.getByRole("button", { name: "Save venue" }));

    expect(mocks.updateVenueSettingsAction).toHaveBeenCalledWith(
      expect.objectContaining({
        venueId: venue.id,
        address: expect.objectContaining({ label: "14 New Street, Haifa" }),
      }),
    );
  });
});
