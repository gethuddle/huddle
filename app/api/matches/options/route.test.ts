import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ searchFutureMatchOptions: vi.fn() }));

vi.mock("@/features/sports/fixture-options", () => ({
  searchFutureMatchOptions: mocks.searchFutureMatchOptions,
}));

import { GET } from "./route";

describe("GET /api/matches/options", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.searchFutureMatchOptions.mockResolvedValue({ items: [], page: 1, hasMore: false });
  });

  it("searches only the local catalog with bounded public inputs", async () => {
    const response = await GET(
      new NextRequest(
        "https://huddle.test/api/matches/options?q=Late%20Horizon&date=2027-05-30&sport=football&competition=Premier%20League&page=3",
      ),
    );

    expect(response.status).toBe(200);
    expect(mocks.searchFutureMatchOptions).toHaveBeenCalledWith({
      q: "Late Horizon",
      date: "2027-05-30",
      from: "",
      to: "",
      sport: "football",
      competition: "Premier League",
      page: 3,
    });
    expect(response.headers.get("cache-control")).toContain("s-maxage=60");
  });

  it("rejects unknown or filter-grammar parameters before database access", async () => {
    const response = await GET(
      new NextRequest("https://huddle.test/api/matches/options?q=team%2Cor%28secret%29&provider=1"),
    );

    expect(response.status).toBe(400);
    expect(mocks.searchFutureMatchOptions).not.toHaveBeenCalled();
  });
});
