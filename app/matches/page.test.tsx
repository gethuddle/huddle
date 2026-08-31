// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from "vitest";

import MatchesPage from "./page";

const mocks = vi.hoisted(() => ({
  redirect: vi.fn(() => {
    throw new Error("NEXT_REDIRECT");
  }),
}));

vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));

describe("MatchesPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("redirects the retired fixture index into the unified Explore experience", async () => {
    await expect(
      MatchesPage({ searchParams: Promise.resolve({ team: "legacy-filter" }) }),
    ).rejects.toThrow("NEXT_REDIRECT");

    expect(mocks.redirect).toHaveBeenCalledWith("/discover");
  });
});
