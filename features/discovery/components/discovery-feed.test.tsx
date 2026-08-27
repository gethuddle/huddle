// @vitest-environment jsdom

import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { DiscoveryFilters } from "@/features/discovery/schemas";
import type { DiscoveryPage } from "@/features/discovery/types";

import { DiscoveryFeed } from "./discovery-feed";

const filters: DiscoveryFilters = {
  citySlug: "haifa",
  lat: null,
  lng: null,
  radiusKm: 15,
  from: "2026-08-27",
  to: "2026-09-10",
  teamId: null,
  competitionId: null,
  matchId: null,
  cursor: null,
  limit: 20,
};

const initialPage: DiscoveryPage = {
  items: [
    {
      id: "52000000-0000-4000-8000-000000000401",
      title: "North stand watch",
      host: {
        kind: "venue",
        displayName: "The Corner",
        venueSlug: "the-corner",
        verificationStatus: "unverified",
      },
      match: {
        id: "52000000-0000-4000-8000-000000000402",
        competitionName: "Premier League",
        homeTeamName: "Arsenal",
        awayTeamName: "Liverpool",
      },
      startsAt: "2026-08-30T17:30:00Z",
      endsAt: "2026-08-30T20:30:00Z",
      cityName: "Haifa",
      placeKind: "venue",
      locationSummary: "1–5 km away",
      audience: "public",
      audienceGroupName: null,
      audienceTeamName: null,
      capacity: 40,
      approvedAttendeeCount: 12,
      remainingCapacity: 28,
      requiresApproval: false,
      viewerAttendanceStatus: null,
      matchesFollows: true,
    },
  ],
  nextCursor: null,
  locationMode: "city",
  generatedAt: "2026-08-27T12:00:00Z",
  personalized: true,
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("DiscoveryFeed", () => {
  it("continues in city mode when browser location is denied", async () => {
    const getCurrentPosition = vi.fn((_success, error: PositionErrorCallback) =>
      error({ code: 1, message: "denied", PERMISSION_DENIED: 1 } as GeolocationPositionError),
    );
    Object.defineProperty(navigator, "geolocation", {
      configurable: true,
      value: { getCurrentPosition },
    });
    const user = userEvent.setup();

    render(<DiscoveryFeed filters={filters} initialPage={initialPage} />);
    await user.click(screen.getByRole("button", { name: "Use my location once" }));

    expect(getCurrentPosition).toHaveBeenCalledOnce();
    expect(await screen.findByRole("status")).toHaveTextContent(
      "Discovery is continuing from the selected city",
    );
    expect(screen.getByText("North stand watch")).toBeVisible();
  });

  it("uses a granted coordinate for one API query without adding it to page history", async () => {
    const getCurrentPosition = vi.fn((success: PositionCallback) =>
      success({ coords: { latitude: 32.794, longitude: 34.989 } } as GeolocationPosition),
    );
    Object.defineProperty(navigator, "geolocation", {
      configurable: true,
      value: { getCurrentPosition },
    });
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ ...initialPage, locationMode: "browser" }),
    });
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();

    render(<DiscoveryFeed filters={filters} initialPage={initialPage} />);
    await user.click(screen.getByRole("button", { name: "Use my location once" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());
    const requestUrl = String(fetchMock.mock.calls[0]?.[0]);
    expect(requestUrl).toContain("lat=32.794");
    expect(requestUrl).toContain("lng=34.989");
    expect(window.location.search).not.toContain("lat=");
    expect(screen.getByText("Using this browser location")).toBeVisible();
  });
});
