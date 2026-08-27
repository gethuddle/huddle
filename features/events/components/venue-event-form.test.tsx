// @vitest-environment jsdom

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { VenueEventForm } from "./venue-event-form";

const mocks = vi.hoisted(() => ({ saveVenueEventAction: vi.fn() }));

vi.mock("@/features/events/actions", () => ({
  saveVenueEventAction: mocks.saveVenueEventAction,
}));

const matchId = "60000000-0000-4000-8000-000000000101";
const teamId = "60000000-0000-4000-8000-000000000102";
const venue = {
  id: "60000000-0000-4000-8000-000000000103",
  slug: "match-corner",
  name: "Match Corner",
  addressText: "12 Public Street, Haifa",
  statedCapacity: 80,
  verificationStatus: "unverified" as const,
};
const catalog = {
  matches: [
    {
      id: matchId,
      label: "Arsenal FC vs Chelsea FC — Premier League",
      startsAt: "2026-09-01T17:00:00Z",
    },
  ],
  teams: [{ id: teamId, name: "Arsenal FC" }],
} as const;

describe("VenueEventForm", () => {
  beforeEach(() => vi.clearAllMocks());

  it("offers only venue audiences and defaults to immediate approval", () => {
    render(<VenueEventForm catalog={catalog} initialMatchId={matchId} venue={venue} />);

    expect(screen.getByRole("radio", { name: /Public/ })).toBeChecked();
    expect(screen.getByRole("radio", { name: /Team followers/ })).toBeVisible();
    expect(screen.queryByRole("radio", { name: /Friends/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("radio", { name: /Invite only/ })).not.toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: /Require staff approval/ })).not.toBeChecked();
    expect(screen.getByText(/Unverified venue/i)).toBeVisible();
    expect(screen.getByText(/accepts no host ID, address, or coordinate override/i)).toBeVisible();
  });

  it("requires an explicit team selector only for team-follower events", async () => {
    const user = userEvent.setup();
    render(<VenueEventForm catalog={catalog} venue={venue} />);

    expect(screen.queryByRole("combobox", { name: "Follower team" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("radio", { name: /Team followers/ }));
    expect(screen.getByRole("combobox", { name: "Follower team" })).toBeRequired();
    await user.selectOptions(screen.getByRole("combobox", { name: "Follower team" }), teamId);
    expect(screen.getByRole("combobox", { name: "Follower team" })).toHaveValue(teamId);
  });

  it("returns only safe event and venue destinations after publication", async () => {
    mocks.saveVenueEventAction.mockResolvedValue({
      ok: true,
      data: {
        message: "Venue event published for safe public browsing.",
        event: {
          id: "60000000-0000-4000-8000-000000000104",
          status: "published",
        },
      },
    });
    render(<VenueEventForm catalog={catalog} initialMatchId={matchId} venue={venue} />);

    const form = screen.getByRole("button", { name: "Publish venue event" }).closest("form");
    expect(form).not.toBeNull();
    fireEvent.submit(form!);

    await waitFor(() => expect(mocks.saveVenueEventAction).toHaveBeenCalledOnce());
    expect(await screen.findByRole("link", { name: "Open event" })).toHaveAttribute(
      "href",
      "/events/60000000-0000-4000-8000-000000000104",
    );
    expect(screen.getByRole("link", { name: "Open venue listings" })).toHaveAttribute(
      "href",
      "/venues/match-corner",
    );
  });
});
