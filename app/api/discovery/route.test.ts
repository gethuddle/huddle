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
  personalized: false,
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
    { locationMode: "browser", personalized: false },
    { locationMode: "city", personalized: true },
  ])("never shared-caches browser or personalized results: %o", async (privacy) => {
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
});
