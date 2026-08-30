// @vitest-environment jsdom

import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ planVenueEventsAction: vi.fn() }));

vi.mock("@/features/venues/workspace/actions", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/features/venues/workspace/actions")>();
  return { ...actual, planVenueEventsAction: mocks.planVenueEventsAction };
});

import { FixturePlanner } from "./fixture-planner";

const matchOne = "e3000000-0000-4000-8000-000000000101";
const matchTwo = "e3000000-0000-4000-8000-000000000102";
const spaceId = "e3000000-0000-4000-8000-000000000201";
const catalog = {
  matches: [
    {
      id: matchOne,
      label: "Arsenal vs Chelsea — Premier League",
      startsAt: "2026-09-12T17:00:00Z",
    },
    {
      id: matchTwo,
      label: "Liverpool vs Everton — Premier League",
      startsAt: "2026-09-12T18:00:00Z",
    },
  ],
  teams: [],
} as const;
const venue = {
  id: "e3000000-0000-4000-8000-000000000301",
  slug: "match-corner",
  name: "Match Corner",
  addressText: "12 Stadium Street, Haifa",
  houseInformation: "Order at the bar before kick-off.",
  defaultRequiresApproval: true,
  defaultAttendanceMode: "reservations" as const,
  spaces: [{ id: spaceId, name: "Main screen", capacity: 80, active: true }],
} as const;

describe("FixturePlanner", () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(() => vi.unstubAllGlobals());

  it("selects multiple fixtures and rejects overlapping use of one area inline", async () => {
    const user = userEvent.setup();
    render(<FixturePlanner catalog={catalog} initialMatchId={matchOne} venue={venue} />);

    expect(
      screen.queryByRole("combobox", { name: /Viewing area for Arsenal/ }),
    ).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Any date" }));
    await user.click(screen.getByRole("button", { name: /Liverpool vs Everton/ }));

    expect(screen.getByRole("alert")).toHaveTextContent(/overlap in the same viewing area/i);
    expect(screen.getByRole("button", { name: "Review events" })).toBeDisabled();
  });

  it("reviews inherited defaults and sends only bounded optional overrides", async () => {
    const user = userEvent.setup();
    render(<FixturePlanner catalog={catalog} initialMatchId={matchOne} venue={venue} />);

    await user.click(screen.getByRole("button", { name: "Review events" }));

    expect(screen.getByText("12 Stadium Street, Haifa")).toBeVisible();
    expect(screen.getByText("Order at the bar before kick-off.")).toBeVisible();
    expect(screen.getByText(/80 registered accounts/)).toBeVisible();
    expect(screen.getAllByText(/Staff approval required/)).not.toHaveLength(0);
    expect(screen.queryByLabelText(/latitude|longitude/i)).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Save batch as drafts" }));
    expect(mocks.planVenueEventsAction).toHaveBeenCalledWith({
      intent: "draft",
      venueId: venue.id,
      venueSlug: venue.slug,
      items: [
        {
          matchId: matchOne,
          venueSpaceId: spaceId,
          attendanceMode: "reservations",
          title: null,
          description: null,
          capacity: null,
          requiresApproval: null,
        },
      ],
    });
  });

  it("retains a remotely searched fixture so it can receive an area and publish", async () => {
    const remoteMatch = {
      id: "e3000000-0000-4000-8000-000000000999",
      label: "Late Horizon FC vs Final Round FC — Premier League",
      startsAt: "2027-05-30T17:00:00Z",
    };
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ items: [remoteMatch], page: 1, hasMore: false }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
      ),
    );
    mocks.planVenueEventsAction.mockResolvedValue({
      ok: true,
      data: { eventIds: [remoteMatch.id], message: "Published 1 event." },
    });
    const user = userEvent.setup();
    render(<FixturePlanner catalog={{ ...catalog, matchesHasMore: true }} venue={venue} />);

    await user.type(screen.getByRole("searchbox", { name: "Search fixtures" }), "Late Horizon");
    await user.click(await screen.findByRole("button", { name: new RegExp(remoteMatch.label) }));

    expect(screen.getByRole("button", { name: "Review events" })).toBeEnabled();
    await user.click(screen.getByRole("button", { name: "Review events" }));
    expect(screen.getByRole("heading", { name: remoteMatch.label })).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Publish batch" }));

    await waitFor(() =>
      expect(mocks.planVenueEventsAction).toHaveBeenCalledWith({
        intent: "publish",
        venueId: venue.id,
        venueSlug: venue.slug,
        items: [
          {
            matchId: remoteMatch.id,
            venueSpaceId: spaceId,
            attendanceMode: "reservations",
            title: null,
            description: null,
            capacity: null,
            requiresApproval: null,
          },
        ],
      }),
    );
  });

  it("plans an open-door public listing without capacity, approval, or invitation controls", async () => {
    const user = userEvent.setup();
    const openDoorVenue = {
      ...venue,
      defaultAttendanceMode: "open_door" as const,
      spaces: [{ id: spaceId, name: "Main screen", capacity: null, active: true }],
    };
    render(<FixturePlanner catalog={catalog} initialMatchId={matchOne} venue={openDoorVenue} />);

    expect(screen.queryByLabelText(/Capacity/)).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Review events" }));
    expect(screen.getAllByText(/Open door.*no RSVP/i)[0]).toBeVisible();
    expect(screen.queryByLabelText("Lower capacity (optional)")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Joining policy")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Publish batch" }));

    await waitFor(() =>
      expect(mocks.planVenueEventsAction).toHaveBeenCalledWith({
        intent: "publish",
        venueId: openDoorVenue.id,
        venueSlug: openDoorVenue.slug,
        items: [
          {
            matchId: matchOne,
            venueSpaceId: spaceId,
            attendanceMode: "open_door",
            title: null,
            description: null,
            capacity: null,
            requiresApproval: null,
          },
        ],
      }),
    );
  });
});
