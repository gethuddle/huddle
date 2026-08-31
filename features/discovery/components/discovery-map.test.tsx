// @vitest-environment jsdom

import { act, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { DiscoveryEvent } from "@/features/discovery/types";

import { DiscoveryMap, type DiscoveryMapFactory } from "./discovery-map";

function event(
  id: string,
  placeName: string,
  latitude: number,
  longitude: number,
  homeTeamName: string,
): DiscoveryEvent {
  return {
    id,
    title: `${homeTeamName} watch`,
    host: {
      kind: "venue",
      displayName: placeName,
      venueSlug: placeName.toLowerCase().replaceAll(" ", "-"),
      verificationStatus: "unverified",
    },
    match: {
      id: id.replace(/.$/u, "9"),
      competitionName: "Premier League",
      homeTeamName,
      homeTeamTla: null,
      homeTeamCrestUrl: null,
      awayTeamName: "Liverpool",
      awayTeamTla: "LIV",
      awayTeamCrestUrl: null,
    },
    startsAt: "2026-09-04T19:00:00Z",
    endsAt: "2026-09-04T22:00:00Z",
    placeKind: "venue",
    locationSummary: "1–5 km away",
    mapPoint: { placeName, latitude, longitude },
    audience: "public",
    audienceGroupName: null,
    audienceTeamName: null,
    attendanceMode: "open_door",
    capacity: null,
    approvedAttendeeCount: 0,
    remainingCapacity: null,
    requiresApproval: false,
    matchesFollows: false,
  };
}

describe("DiscoveryMap", () => {
  it("groups fixtures at one public place and lets a marker reveal what it is showing", async () => {
    const cornerOne = event(
      "a1000000-0000-4000-8000-000000000001",
      "The Corner",
      32.81,
      34.99,
      "Arsenal",
    );
    const cornerTwo = event(
      "a1000000-0000-4000-8000-000000000002",
      "The Corner",
      32.81,
      34.99,
      "Chelsea",
    );
    const harbor = event(
      "a1000000-0000-4000-8000-000000000003",
      "Harbor Screen",
      32.82,
      35.01,
      "Everton",
    );
    let chooseLocation: ((locationId: string) => void) | undefined;
    let harborLocationId = "";
    const selectLocation = vi.fn();
    const mapFactory: DiscoveryMapFactory = vi.fn(async (_container, options) => {
      chooseLocation = options.onLocationSelect;
      expect(options.locations).toHaveLength(2);
      expect(options.locations[0]?.events).toHaveLength(2);
      harborLocationId = options.locations[1]?.id ?? "";
      return { destroy: vi.fn(), selectLocation };
    });

    render(
      <DiscoveryMap
        events={[cornerOne, cornerTwo, harbor]}
        mapFactory={mapFactory}
        userLocation={{ lat: 32.805, lng: 34.995 }}
      />,
    );

    const mapSurface = screen.getByRole("application", {
      name: "Map of public places showing games",
    });
    expect(mapSurface).toHaveClass("h-full", "w-full");
    expect(mapSurface.parentElement).toHaveClass("absolute", "inset-0");
    expect(await screen.findByRole("heading", { name: "The Corner" })).toBeVisible();
    expect(screen.getByRole("link", { name: /Arsenal vs Liverpool/ })).toBeVisible();
    expect(screen.getByRole("link", { name: /Chelsea vs Liverpool/ })).toBeVisible();

    act(() => chooseLocation?.(harborLocationId));
    expect(await screen.findByRole("heading", { name: "Harbor Screen" })).toBeVisible();
    expect(screen.getByRole("link", { name: /Everton vs Liverpool/ })).toBeVisible();
    await waitFor(() => expect(selectLocation).toHaveBeenLastCalledWith(harborLocationId));
  });

  it("never invents a marker for home events or records without a public point", () => {
    const privateEvent = {
      ...event("a1000000-0000-4000-8000-000000000004", "Never mapped", 32.8, 35, "Leeds"),
      placeKind: "home" as const,
      mapPoint: null,
    };
    const mapFactory = vi.fn<DiscoveryMapFactory>();

    render(<DiscoveryMap events={[privateEvent]} mapFactory={mapFactory} userLocation={null} />);

    expect(screen.getByText(/No public Venue or public-place pins/i)).toBeVisible();
    expect(mapFactory).not.toHaveBeenCalled();
  });
});
