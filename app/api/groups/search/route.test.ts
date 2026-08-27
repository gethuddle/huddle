import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { GET } from "./route";

const mocks = vi.hoisted(() => ({ getGroupSearchPage: vi.fn() }));

vi.mock("@/features/groups/search", () => ({
  getGroupSearchPage: mocks.getGroupSearchPage,
}));

describe("GET /api/groups/search", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getGroupSearchPage.mockResolvedValue({
      items: [],
      nextCursor: null,
      requiresPrivateCache: false,
    });
  });

  it("returns only the public DTO and short-caches anonymous search", async () => {
    const response = await GET(
      new NextRequest("https://huddle.test/api/groups/search?q=supporters&city=haifa"),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toContain("s-maxage=60");
    expect(body).toMatchObject({ items: [], nextCursor: null });
    expect(body).not.toHaveProperty("requiresPrivateCache");
  });

  it("uses private no-store caching when viewer blocks and bans can affect results", async () => {
    mocks.getGroupSearchPage.mockResolvedValue({
      items: [],
      nextCursor: null,
      requiresPrivateCache: true,
    });
    const response = await GET(new NextRequest("https://huddle.test/api/groups/search"));

    expect(response.headers.get("cache-control")).toContain("no-store");
  });

  it("rejects unknown parameters before invoking the query", async () => {
    const response = await GET(
      new NextRequest("https://huddle.test/api/groups/search?includeUnlisted=true"),
    );

    expect(response.status).toBe(400);
    expect(mocks.getGroupSearchPage).not.toHaveBeenCalled();
  });
});
