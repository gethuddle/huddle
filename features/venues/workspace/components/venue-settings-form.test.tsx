// @vitest-environment jsdom

import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  updateVenueSettingsAction: vi.fn(),
  replace: vi.fn(),
  refresh: vi.fn(),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: mocks.replace, refresh: mocks.refresh }),
}));

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
  it("replaces the obsolete settings URL after renaming the venue slug", async () => {
    mocks.updateVenueSettingsAction.mockResolvedValue({
      ok: true,
      data: { message: "Saved", venue: { ...venue, slug: "new-corner" } },
    });
    render(<VenueSettingsForm venue={venue} canEdit />);
    await userEvent.click(screen.getByRole("button", { name: "Save venue" }));
    expect(mocks.replace).toHaveBeenCalledWith("/venues/new-corner/workspace/settings");
  });
  it("associates every invalid editable text field with its error and focuses the first", async () => {
    mocks.updateVenueSettingsAction.mockResolvedValue({
      ok: false,
      error: {
        code: "VALIDATION_FAILED",
        message: "Check the highlighted fields and try again.",
        fields: {
          name: ["Name needed"],
          slug: ["Invalid URL"],
          description: ["Description too short"],
          houseInformation: ["House information too long"],
        },
      },
    });
    render(<VenueSettingsForm venue={venue} canEdit />);
    await userEvent.click(screen.getByRole("button", { name: "Save venue" }));
    for (const [label, error] of [
      ["Venue name", "Name needed"],
      ["Huddle page address", "Invalid URL"],
      ["Public description", "Description too short"],
      ["House information", "House information too long"],
    ]) {
      expect(screen.getByLabelText(label)).toHaveAttribute("aria-invalid", "true");
      expect(screen.getByLabelText(label)).toHaveAccessibleDescription(error);
    }
    await waitFor(() => expect(screen.getByLabelText("Venue name")).toHaveFocus());
  });
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
    render(<VenueSettingsForm venue={venue} canEdit={true} />);

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
it("retains readable settings but cannot submit when editing is locked", () => {
  render(<VenueSettingsForm venue={venue} canEdit={false} />);
  expect(screen.getByDisplayValue("Match Corner")).toBeDisabled();
  expect(screen.getByRole("button", { name: "Save venue" })).toBeDisabled();
  expect(screen.getByRole("button", { name: "Change public address" })).toBeDisabled();
});
