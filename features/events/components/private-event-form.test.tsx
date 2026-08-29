// @vitest-environment jsdom

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { PrivateEventForm } from "./private-event-form";

const mocks = vi.hoisted(() => ({ replace: vi.fn(), savePrivateEventAction: vi.fn() }));

vi.mock("@/features/events/actions", () => ({
  savePrivateEventAction: mocks.savePrivateEventAction,
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: mocks.replace }) }));

const matchId = "60000000-0000-4000-8000-000000000101";
const groupId = "60000000-0000-4000-8000-000000000102";
const catalog = {
  cities: [{ id: "60000000-0000-4000-8000-000000000103", name: "Haifa" }],
  matches: [
    {
      id: matchId,
      label: "Arsenal FC vs Chelsea FC — Premier League",
      startsAt: "2026-09-01T17:00:00Z",
    },
  ],
  groups: [{ id: groupId, slug: "haifa-fans", name: "Haifa Fans", lifecycle: "active" }],
  acceptedFriendCount: 2,
} as const;

describe("PrivateEventForm", () => {
  beforeEach(() => vi.clearAllMocks());

  it("shows only private-person audiences and the protected home contract", () => {
    render(<PrivateEventForm catalog={catalog} initialMatchId={matchId} />);

    expect(screen.getByRole("radio", { name: /Invite only/ })).toBeChecked();
    expect(screen.getByRole("radio", { name: /Friends/ })).toBeVisible();
    expect(screen.getByRole("radio", { name: /Supporter group/ })).toBeVisible();
    expect(screen.queryByRole("radio", { name: /^Public$/i })).not.toBeInTheDocument();
    expect(screen.getByText(/at most 12 people/i)).toBeVisible();
    expect(screen.getByText(/Everyone needs their own Huddle account/i)).toBeVisible();
    expect(screen.getByText(/exact home address is protected/i)).toBeVisible();
  });

  it("switches between protected-home and public-place fields", async () => {
    const user = userEvent.setup();
    render(<PrivateEventForm catalog={catalog} />);

    expect(screen.getByRole("textbox", { name: "Exact home address" })).toBeVisible();
    await user.click(screen.getByRole("radio", { name: /Public place/ }));
    expect(screen.getByRole("textbox", { name: "Place name" })).toBeVisible();
    expect(screen.getByRole("textbox", { name: "Public address" })).toBeVisible();
    expect(screen.queryByRole("textbox", { name: "Exact home address" })).not.toBeInTheDocument();
  });

  it("can fill the location pin from explicit browser permission", async () => {
    Object.defineProperty(navigator, "geolocation", {
      configurable: true,
      value: {
        getCurrentPosition: vi.fn((success: PositionCallback) =>
          success({ coords: { latitude: 32.81234, longitude: 34.99876 } } as GeolocationPosition),
        ),
      },
    });
    const user = userEvent.setup();
    render(<PrivateEventForm catalog={catalog} />);

    await user.click(screen.getByRole("button", { name: "Use my current location" }));

    expect(screen.getByRole("spinbutton", { name: "Longitude" })).toHaveValue(34.99876);
    expect(screen.getByRole("spinbutton", { name: "Latitude" })).toHaveValue(32.81234);
    expect(screen.getByText(/Location pin added/i)).toBeVisible();
  });

  it("submits a group event for review and redirects to the created event", async () => {
    mocks.savePrivateEventAction.mockResolvedValue({
      ok: true,
      data: {
        message: "Event submitted to its organizing group for review.",
        event: {
          id: "60000000-0000-4000-8000-000000000104",
          status: "pending_group_review",
        },
      },
    });
    const user = userEvent.setup();
    render(<PrivateEventForm catalog={catalog} initialMatchId={matchId} />);

    await user.click(screen.getByRole("radio", { name: /Supporter group/ }));
    await user.selectOptions(screen.getByRole("combobox", { name: "Audience group" }), groupId);
    const submitButton = screen.getByRole("button", { name: "Submit for group review" });
    const form = submitButton.closest("form");
    expect(form).not.toBeNull();
    fireEvent.submit(form!);

    await waitFor(() => expect(mocks.savePrivateEventAction).toHaveBeenCalledOnce());
    expect(await screen.findByText(/submitted to its organizing group/i)).toBeVisible();
    expect(screen.getByRole("link", { name: "Open event" })).toHaveAttribute(
      "href",
      "/events/60000000-0000-4000-8000-000000000104",
    );
    await waitFor(() =>
      expect(mocks.replace).toHaveBeenCalledWith(
        "/events/60000000-0000-4000-8000-000000000104?created=1",
      ),
    );
    expect(document.body.textContent).not.toContain("12 Private Street");
  });

  it("keeps the organizing group separate from an invite-only audience", async () => {
    mocks.savePrivateEventAction.mockResolvedValue({
      ok: true,
      data: {
        message: "Event submitted to its organizing group for review.",
        event: {
          id: "60000000-0000-4000-8000-000000000105",
          status: "pending_group_review",
        },
      },
    });
    const user = userEvent.setup();
    render(<PrivateEventForm catalog={catalog} initialMatchId={matchId} />);

    expect(screen.getByRole("radio", { name: /Invite only/ })).toBeChecked();
    expect(screen.queryByRole("combobox", { name: "Audience group" })).not.toBeInTheDocument();
    await user.selectOptions(
      screen.getByRole("combobox", { name: "Organizing group (optional)" }),
      groupId,
    );
    expect(screen.getByRole("button", { name: "Submit for group review" })).toBeVisible();
    expect(screen.getByText(/admins will review the event/i)).toBeVisible();
  });
});
