import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { DomainError } from "@/lib/errors";

import { GET } from "./route";

const mocks = vi.hoisted(() => ({ getDiscoveryPage: vi.fn() }));

vi.mock("@/features/discovery/query", () => ({
  getDiscoveryPage: mocks.getDiscoveryPage,
}));

function discoveryRequest(query: string) {
  return new NextRequest(`https://huddle.test/api/discovery?${query}`);
}

const emptyPage = {
  items: [],
  nextCursor: null,
  locationMode: "city" as const,
  generatedAt: "2026-08-27T20:00:00.000Z",
  requiresPrivateCache: false,
};

const legacyExpandedPage = {
  ...emptyPage,
  items: [
    {
      id: "52000000-0000-4000-8000-000000000401",
      title: "North stand watch",
      host: {
        kind: "venue" as const,
        displayName: "The Corner",
        venueSlug: "the-corner",
        verificationStatus: "unverified" as const,
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
      placeKind: "venue" as const,
      locationSummary: "1–5 km away",
      mapPoint: { placeName: "The Corner", latitude: 32.812, longitude: 34.998 },
      audience: "public" as const,
      audienceGroupName: null,
      audienceTeamName: null,
      attendanceMode: "reservations",
      capacity: 40,
      approvedAttendeeCount: 12,
      remainingCapacity: 28,
      requiresApproval: false,
      matchesFollows: true,
      viewerAttendanceStatus: "approved",
    },
  ],
};

describe("GET /api/discovery", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getDiscoveryPage.mockResolvedValue(emptyPage);
  });

  it("returns a short public cache only for anonymous city discovery", async () => {
    const response = await GET(discoveryRequest("city=haifa"));

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toContain("s-maxage=60");
    await expect(response.json()).resolves.toEqual({
      items: [],
      nextCursor: null,
      locationMode: "city",
      generatedAt: "2026-08-27T20:00:00.000Z",
    });
  });

  it.each([
    { locationMode: "browser", requiresPrivateCache: false },
    { locationMode: "city", requiresPrivateCache: true },
  ])("never shared-caches browser or private results: %o", async (privacy) => {
    mocks.getDiscoveryPage.mockResolvedValue({ ...emptyPage, ...privacy });
    const response = await GET(discoveryRequest("city=haifa&lat=32.8&lng=35"));

    expect(response.headers.get("cache-control")).toContain("no-store");
  });

  it("rejects malformed coordinates before querying the database", async () => {
    const response = await GET(discoveryRequest("city=haifa&lat=32.8"));

    expect(response.status).toBe(400);
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(mocks.getDiscoveryPage).not.toHaveBeenCalled();
  });

  it("maps cursor failures without returning cursor or database details", async () => {
    mocks.getDiscoveryPage.mockRejectedValue(
      new DomainError("VALIDATION_FAILED", { cause: new Error("private cursor internals") }),
    );
    const response = await GET(discoveryRequest("city=haifa&cursor=tampered"));
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(JSON.stringify(body)).not.toContain("private cursor internals");
    expect(JSON.stringify(body)).not.toContain("tampered");
  });

  it("serializes only the canonical acquisition DTO at the public route boundary", async () => {
    mocks.getDiscoveryPage.mockResolvedValue(legacyExpandedPage);

    const response = await GET(discoveryRequest("city=haifa"));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.items).toHaveLength(1);
    expect(JSON.stringify(body)).not.toContain("viewerAttendanceStatus");
  });
});
