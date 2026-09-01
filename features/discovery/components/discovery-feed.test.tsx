// @vitest-environment jsdom

import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { DiscoveryFilters } from "@/features/discovery/schemas";
import type { DiscoveryPage } from "@/features/discovery/types";

vi.mock("./discovery-map", () => ({
  DiscoveryMap: () => <div aria-label="Nearby places showing games">Map</div>,
}));

import { DiscoveryFeed } from "./discovery-feed";

const filters: DiscoveryFilters = {
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
        homeTeamTla: "ARS",
        homeTeamCrestUrl: "https://crests.football-data.org/57.png",
        awayTeamName: "Liverpool",
        awayTeamTla: "LIV",
        awayTeamCrestUrl: null,
      },
      startsAt: "2026-08-30T17:30:00Z",
      endsAt: "2026-08-30T20:30:00Z",
      placeKind: "venue",
      locationSummary: "1–5 km away",
      mapPoint: { placeName: "The Corner", latitude: 32.812, longitude: 34.998 },
      audience: "public",
      audienceGroupName: null,
      audienceTeamName: null,
      attendanceMode: "reservations",
      capacity: 40,
      approvedAttendeeCount: 12,
      remainingCapacity: 28,
      requiresApproval: false,
      matchesFollows: true,
    },
  ],
  nextCursor: null,
  locationMode: "browser",
  generatedAt: "2026-08-27T12:00:00Z",
  requiresPrivateCache: true,
};

afterEach(() => {
  vi.unstubAllGlobals();
  window.sessionStorage.clear();
  Reflect.deleteProperty(navigator, "permissions");
  Reflect.deleteProperty(navigator, "geolocation");
});

describe("DiscoveryFeed", () => {
  it("asks for an address when browser location is denied", async () => {
    const getCurrentPosition = vi.fn((_success, error: PositionErrorCallback) =>
      error({ code: 1, message: "denied", PERMISSION_DENIED: 1 } as GeolocationPositionError),
    );
    Object.defineProperty(navigator, "geolocation", {
      configurable: true,
      value: { getCurrentPosition },
    });
    render(<DiscoveryFeed filters={filters} initialPage={initialPage} />);
    await waitFor(() => expect(getCurrentPosition).toHaveBeenCalledOnce());
    expect(await screen.findByRole("status")).toHaveTextContent("Search an address or area below");
    expect(screen.queryByText(/profile area/i)).not.toBeInTheDocument();
  });

  it("asks for an Israel origin when browser coordinates are outside the pilot", async () => {
    const getCurrentPosition = vi.fn((success: PositionCallback) =>
      success({ coords: { latitude: 40.71, longitude: -74 } } as GeolocationPosition),
    );
    Object.defineProperty(navigator, "geolocation", {
      configurable: true,
      value: { getCurrentPosition },
    });
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    render(<DiscoveryFeed filters={filters} initialPage={initialPage} />);

    expect(await screen.findByRole("status")).toHaveTextContent("Search an address or area below");
    expect(fetchMock).not.toHaveBeenCalled();
    expect(window.sessionStorage.getItem("huddle:discovery-origin")).toBeNull();
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
    render(<DiscoveryFeed filters={filters} initialPage={initialPage} />);

    await waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());
    expect(fetchMock.mock.calls[0]?.[0]).toBe("/api/discovery");
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({ method: "POST" });
    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).toMatchObject({
      lat: 32.794,
      lng: 34.989,
    });
    expect(window.location.search).not.toContain("lat=");
    expect(screen.getByText("Using this browser location")).toBeVisible();
    expect(screen.getByRole("button", { name: "Use my current location" })).toHaveClass("min-h-11");
  });

  it("uses browser location automatically on first visit", async () => {
    const getCurrentPosition = vi.fn((success: PositionCallback) =>
      success({ coords: { latitude: 32.794, longitude: 34.989 } } as GeolocationPosition),
    );
    Object.defineProperty(navigator, "geolocation", {
      configurable: true,
      value: { getCurrentPosition },
    });
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ ...initialPage, locationMode: "browser" }),
      }),
    );

    render(<DiscoveryFeed filters={filters} initialPage={initialPage} />);

    await waitFor(() => expect(getCurrentPosition).toHaveBeenCalledOnce());
    expect(await screen.findByText("Using this browser location")).toBeVisible();
  });

  it("restores an address origin from session storage without putting coordinates in the URL", async () => {
    window.sessionStorage.setItem(
      "huddle:discovery-origin",
      JSON.stringify({
        lat: 32.794,
        lng: 34.989,
        label: "12 Hanassi Boulevard, Haifa, Israel",
        kind: "address",
      }),
    );
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ ...initialPage, locationMode: "address" }),
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<DiscoveryFeed filters={filters} initialPage={initialPage} />);

    expect(await screen.findByText("Near 12 Hanassi Boulevard, Haifa, Israel")).toBeVisible();
    await waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());
    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).toMatchObject({
      lat: 32.794,
      lng: 34.989,
    });
    expect(window.location.search).not.toContain("lat=");
  });

  it("keeps retry at least 44px tall after a discovery failure", async () => {
    Object.defineProperty(navigator, "geolocation", {
      configurable: true,
      value: {
        getCurrentPosition: (success: PositionCallback) =>
          success({ coords: { latitude: 32.794, longitude: 34.989 } } as GeolocationPosition),
      },
    });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false }));
    render(<DiscoveryFeed filters={filters} initialPage={initialPage} />);

    expect(await screen.findByRole("button", { name: "Retry" }, { timeout: 4_000 })).toHaveClass(
      "min-h-11",
    );
  });

  it("keeps load more at least 44px tall when another acquisition page exists", () => {
    render(
      <DiscoveryFeed
        filters={filters}
        initialPage={{ ...initialPage, nextCursor: "signed-next-page" }}
      />,
    );

    expect(screen.getByRole("button", { name: "Load more events" })).toHaveClass("min-h-11");
  });

  it("renders each acquisition with one truthful status and one primary action", () => {
    const pageWithApprovalModes: DiscoveryPage = {
      ...initialPage,
      items: [
        initialPage.items[0]!,
        {
          ...initialPage.items[0]!,
          id: "52000000-0000-4000-8000-000000000404",
          title: "Friends living-room watch",
          host: {
            kind: "person",
            displayName: "Maya",
            venueSlug: null,
            verificationStatus: null,
          },
          audience: "friends",
          requiresApproval: true,
        },
      ],
    };

    render(<DiscoveryFeed filters={filters} initialPage={pageWithApprovalModes} />);

    expect(screen.getByText("Join instantly")).toBeVisible();
    expect(screen.getByText("Request to join")).toBeVisible();
    expect(screen.getAllByRole("link", { name: "Open event" })).toHaveLength(2);
    expect(screen.queryByText(/Your attendance:/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Matches your follows/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Israel time/i)).not.toBeInTheDocument();
    expect(screen.getAllByRole("heading", { name: "Arsenal vs Liverpool" })).toHaveLength(1);
    expect(screen.getByRole("region", { name: "Arsenal vs Liverpool" })).toBeVisible();
    expect(screen.getByRole("img", { name: "Arsenal" })).toBeVisible();
    expect(screen.getByRole("img", { name: "Liverpool" })).toBeVisible();
    for (const link of screen.getAllByRole("link", { name: "Open event" })) {
      expect(link.getAttribute("href")).toContain("returnTo=%2Fdiscover%3F");
    }
  });

  it("offers a first-class map on desktop and a clear mobile map action", async () => {
    const user = userEvent.setup();
    render(<DiscoveryFeed filters={filters} initialPage={initialPage} />);

    expect(screen.getByRole("button", { name: "Show map" })).toBeVisible();
    expect(screen.getByLabelText("Desktop discovery map")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Show map" }));
    expect(screen.getByRole("dialog", { name: "Map of nearby places" })).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Close map" }));
    expect(screen.queryByRole("dialog", { name: "Map of nearby places" })).not.toBeInTheDocument();
  });
});
