// @vitest-environment jsdom

import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";

import { clearDiscoveryQueryClient } from "@/features/discovery/query-client";
import type { DiscoveryFilters } from "@/features/discovery/schemas";
import type { DiscoveryPage } from "@/features/discovery/types";

import { DiscoveryFeed } from "./discovery-feed";

vi.mock("@/features/discovery/components/discovery-map", () => ({
  DiscoveryMap: () => <div>Map</div>,
}));

const filters: DiscoveryFilters = {
  lat: null,
  lng: null,
  radiusKm: 15,
  from: "2026-09-04",
  to: "2026-09-18",
  teamId: null,
  competitionId: null,
  matchId: null,
  cursor: null,
  limit: 20,
};

const initialPage: DiscoveryPage = {
  items: [],
  nextCursor: null,
  locationMode: "browser",
  generatedAt: "2026-09-04T12:00:00Z",
  requiresPrivateCache: true,
  viewerCacheScope: "fan:viewer-a",
};

const cachedPage: DiscoveryPage = {
  ...initialPage,
  items: [
    {
      id: "52000000-0000-4000-8000-000000000401",
      title: "Cached match night",
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
        homeTeamCrestUrl: null,
        awayTeamName: "Liverpool",
        awayTeamTla: "LIV",
        awayTeamCrestUrl: null,
      },
      startsAt: "2026-09-06T17:30:00Z",
      endsAt: "2026-09-06T20:30:00Z",
      placeKind: "venue",
      locationSummary: "1–5 km away",
      mapPoint: null,
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
};

afterEach(() => {
  clearDiscoveryQueryClient();
  vi.unstubAllGlobals();
  window.sessionStorage.clear();
});

it("shows the Explore cache immediately and revalidates when the route returns", async () => {
  window.sessionStorage.setItem(
    "huddle:discovery-origin",
    JSON.stringify({
      lat: 32.794,
      lng: 34.989,
      label: "Haifa",
      kind: "address",
    }),
  );
  let completeRefresh!: () => void;
  const refreshResponse = new Promise<{
    ok: boolean;
    json: () => Promise<DiscoveryPage>;
  }>((resolve) => {
    completeRefresh = () =>
      resolve({
        ok: true,
        json: async () => initialPage,
      });
  });
  const fetchMock = vi
    .fn()
    .mockResolvedValueOnce({
      ok: true,
      json: async () => ({ ...cachedPage, locationMode: "address" }),
    })
    .mockReturnValueOnce(refreshResponse);
  vi.stubGlobal("fetch", fetchMock);

  const { rerender } = render(<DiscoveryFeed filters={filters} initialPage={initialPage} />);
  await waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());
  expect(await screen.findByText("Cached match night")).toBeVisible();

  rerender(<p>Another Huddle tab</p>);
  expect(screen.getByText("Another Huddle tab")).toBeVisible();
  rerender(<DiscoveryFeed filters={filters} initialPage={initialPage} />);

  await waitFor(() => expect(screen.getByText("Near Haifa")).toBeVisible());
  await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
  expect(screen.getByText("Cached match night")).toBeVisible();

  completeRefresh();
  await waitFor(() => expect(screen.queryByText("Cached match night")).not.toBeInTheDocument());
});

it("never renders another account's cached Explore rows", async () => {
  window.sessionStorage.setItem(
    "huddle:discovery-origin",
    JSON.stringify({
      lat: 32.794,
      lng: 34.989,
      label: "Haifa",
      kind: "address",
    }),
  );
  const nextAccountResponse = Promise.withResolvers<{
    ok: boolean;
    json: () => Promise<DiscoveryPage>;
  }>();
  const fetchMock = vi
    .fn()
    .mockResolvedValueOnce({
      ok: true,
      json: async () => ({ ...cachedPage, locationMode: "address" }),
    })
    .mockReturnValueOnce(nextAccountResponse.promise);
  vi.stubGlobal("fetch", fetchMock);

  const { rerender } = render(<DiscoveryFeed filters={filters} initialPage={initialPage} />);
  expect(await screen.findByText("Cached match night")).toBeVisible();

  rerender(<p>Authentication transition</p>);
  rerender(
    <DiscoveryFeed
      filters={filters}
      initialPage={{ ...initialPage, viewerCacheScope: "fan:viewer-b" }}
    />,
  );

  await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
  expect(screen.queryByText("Cached match night")).not.toBeInTheDocument();

  nextAccountResponse.resolve({ ok: true, json: async () => initialPage });
});

it("keeps cached events visible when a background refresh fails", async () => {
  window.sessionStorage.setItem(
    "huddle:discovery-origin",
    JSON.stringify({
      lat: 32.794,
      lng: 34.989,
      label: "Haifa",
      kind: "address",
    }),
  );
  const fetchMock = vi
    .fn()
    .mockResolvedValueOnce({
      ok: true,
      json: async () => ({ ...cachedPage, locationMode: "address" }),
    })
    .mockRejectedValue(new Error("temporary network failure"));
  vi.stubGlobal("fetch", fetchMock);

  const { rerender } = render(<DiscoveryFeed filters={filters} initialPage={initialPage} />);
  expect(await screen.findByText("Cached match night")).toBeVisible();

  rerender(<p>Another Huddle tab</p>);
  rerender(<DiscoveryFeed filters={filters} initialPage={initialPage} />);

  await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3), { timeout: 3_000 });
  expect(screen.getByText("Cached match night")).toBeVisible();
  expect(screen.queryByText("Discovery could not load.")).not.toBeInTheDocument();
  expect(screen.getByText("Couldn’t refresh events. Showing recent results.")).toBeVisible();
});

it("does not reuse a cached page when the requested result limit changes", async () => {
  window.sessionStorage.setItem(
    "huddle:discovery-origin",
    JSON.stringify({
      lat: 32.794,
      lng: 34.989,
      label: "Haifa",
      kind: "address",
    }),
  );
  const changedLimitResponse = Promise.withResolvers<{
    ok: boolean;
    json: () => Promise<DiscoveryPage>;
  }>();
  const fetchMock = vi
    .fn()
    .mockResolvedValueOnce({
      ok: true,
      json: async () => ({ ...cachedPage, locationMode: "address" }),
    })
    .mockReturnValueOnce(changedLimitResponse.promise);
  vi.stubGlobal("fetch", fetchMock);

  const { rerender } = render(<DiscoveryFeed filters={filters} initialPage={initialPage} />);
  expect(await screen.findByText("Cached match night")).toBeVisible();

  rerender(<p>Another Huddle tab</p>);
  rerender(<DiscoveryFeed filters={{ ...filters, limit: 50 }} initialPage={initialPage} />);

  await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
  expect(screen.queryByText("Cached match night")).not.toBeInTheDocument();

  changedLimitResponse.resolve({ ok: true, json: async () => initialPage });
});
