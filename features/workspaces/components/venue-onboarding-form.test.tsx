// @vitest-environment jsdom

import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ activateVenueOnboardingAction: vi.fn() }));
vi.mock("@/features/workspaces/actions", () => ({
  activateVenueOnboardingAction: mocks.activateVenueOnboardingAction,
}));

import { VenueOnboardingForm } from "./venue-onboarding-form";

describe("VenueOnboardingForm", () => {
  beforeEach(() => {
    window.sessionStorage.clear();
    mocks.activateVenueOnboardingAction.mockResolvedValue({
      ok: false,
      error: { code: "INTERNAL_ERROR", message: "Try again." },
    });
  });
  afterEach(() => {
    window.sessionStorage.clear();
    vi.unstubAllGlobals();
  });

  it("composes address search without nested forms or raw coordinate controls", async () => {
    const { container } = render(<VenueOnboardingForm ownerId="account-a" />);

    expect(screen.getByRole("combobox", { name: "Public address" })).toBeVisible();
    expect(screen.queryByRole("combobox", { name: "City" })).not.toBeInTheDocument();
    expect(container.querySelector("form form")).toBeNull();
    expect(container.querySelector('[name="latitude"]')).toBeNull();
    expect(container.querySelector('[name="longitude"]')).toBeNull();
    expect(screen.queryByText(/latitude|longitude/i)).not.toBeInTheDocument();
    expect(screen.getByText(/next.*demo plan/i)).toBeInTheDocument();
  });

  it("submits only the confirmed structured address selected from search", async () => {
    const suggestion = {
      id: "osm-101",
      label: "10 Herzl Street, Haifa, Israel",
      latitude: 32.815,
      longitude: 34.989,
    };
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(
        async () =>
          new Response(JSON.stringify({ suggestions: [suggestion] }), {
            status: 200,
            headers: { "content-type": "application/json" },
          }),
      ),
    );
    const user = userEvent.setup();
    render(<VenueOnboardingForm ownerId="account-a" />);

    await user.type(screen.getByRole("textbox", { name: "Venue name" }), "Match Corner");
    await user.type(screen.getByRole("textbox", { name: "Venue URL" }), "match-corner");
    await user.type(screen.getByRole("combobox", { name: "Public address" }), "10 Herzl Street");
    await user.click(await screen.findByRole("option", { name: suggestion.label }));
    await user.type(
      screen.getByRole("textbox", { name: "Public description" }),
      "A welcoming match-day venue.",
    );
    await user.type(screen.getByRole("spinbutton", { name: "Capacity" }), "80");
    await user.click(
      screen.getByRole("checkbox", { name: /authorized to manage its Huddle listing/i }),
    );
    await user.click(screen.getByRole("button", { name: "Create venue account" }));

    await waitFor(() => expect(mocks.activateVenueOnboardingAction).toHaveBeenCalledOnce());
    expect(mocks.activateVenueOnboardingAction).toHaveBeenCalledWith({
      name: "Match Corner",
      slug: "match-corner",
      address: suggestion,
      description: "A welcoming match-day venue.",
      mainSpaceName: "Main screen",
      mainSpaceCapacity: 80,
      defaultAttendanceMode: "reservations",
      facilities: [],
      houseInformation: "",
      defaultRequiresApproval: false,
      representationAttested: true,
    });
  });

  it("disables creation after address edits or a new search until reconfirmed", async () => {
    const suggestion = {
      id: "osm-101",
      label: "10 Herzl Street, Haifa, Israel",
      latitude: 32.815,
      longitude: 34.989,
    };
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(
        async () =>
          new Response(JSON.stringify({ suggestions: [suggestion] }), {
            status: 200,
            headers: { "content-type": "application/json" },
          }),
      ),
    );
    const user = userEvent.setup();
    render(<VenueOnboardingForm ownerId="account-a" />);

    const input = screen.getByRole("combobox", { name: "Public address" });
    await user.type(input, "10 Herzl Street");
    await user.click(await screen.findByRole("option", { name: suggestion.label }));
    expect(screen.getByRole("button", { name: "Create venue account" })).toBeEnabled();

    await user.type(input, " edited");
    expect(screen.getByRole("button", { name: "Create venue account" })).toBeDisabled();
    expect(screen.queryByText("Confirmed public address")).not.toBeInTheDocument();

    await user.clear(input);
    await user.type(input, "10 Herzl Street");
    expect(screen.getByRole("button", { name: "Create venue account" })).toBeDisabled();
    await user.click(await screen.findByRole("option", { name: suggestion.label }));
    expect(screen.getByRole("button", { name: "Create venue account" })).toBeEnabled();
  });

  it("restores every unfinished Venue field and its confirmed address after a refresh remount", async () => {
    const suggestion = {
      id: "osm-101",
      label: "10 Herzl Street, Haifa, Israel",
      latitude: 32.815,
      longitude: 34.989,
    };
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ suggestions: [suggestion] }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
      ),
    );
    const props = { ownerId: "account-a" };
    const user = userEvent.setup();
    const first = render(<VenueOnboardingForm {...props} />);

    await user.type(screen.getByRole("textbox", { name: "Venue name" }), "Match House");
    await user.type(screen.getByRole("textbox", { name: "Venue URL" }), "match-house");
    await user.type(screen.getByRole("combobox", { name: "Public address" }), "10 Herzl Street");
    await user.click(await screen.findByRole("option", { name: suggestion.label }));
    await user.type(
      screen.getByRole("textbox", { name: "Public description" }),
      "A welcoming public match venue.",
    );
    await user.click(screen.getByRole("radio", { name: /Open door/i }));
    await user.click(screen.getByRole("checkbox", { name: "Food" }));
    await user.type(
      screen.getByRole("textbox", { name: "House information (optional)" }),
      "Order at the bar.",
    );
    first.unmount();

    render(<VenueOnboardingForm {...props} />);
    expect(screen.getByRole("textbox", { name: "Venue name" })).toHaveValue("Match House");
    expect(screen.getByRole("textbox", { name: "Venue URL" })).toHaveValue("match-house");
    expect(await screen.findByText("Confirmed public address")).toBeVisible();
    expect(screen.getByText(suggestion.label)).toBeVisible();
    expect(screen.getByRole("textbox", { name: "Public description" })).toHaveValue(
      "A welcoming public match venue.",
    );
    expect(screen.getByRole("radio", { name: /Open door/i })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: "Food" })).toBeChecked();
    expect(screen.getByRole("textbox", { name: "House information (optional)" })).toHaveValue(
      "Order at the bar.",
    );
  });
});
