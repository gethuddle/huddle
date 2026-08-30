import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getAuthorizedVenueWorkspaceBySlug: vi.fn(),
  notFound: vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
  redirect: vi.fn(() => {
    throw new Error("NEXT_REDIRECT");
  }),
}));

vi.mock("@/features/workspaces/queries", () => ({
  getAuthorizedVenueWorkspaceBySlug: mocks.getAuthorizedVenueWorkspaceBySlug,
}));
vi.mock("next/navigation", () => ({ notFound: mocks.notFound, redirect: mocks.redirect }));

import ManageVenuePage from "./page";

describe("legacy Venue management route", () => {
  beforeEach(() => vi.clearAllMocks());

  it("reauthorizes the slug before redirecting to the workspace settings surface", async () => {
    mocks.getAuthorizedVenueWorkspaceBySlug.mockResolvedValue({ slug: "match-corner" });

    await expect(
      ManageVenuePage({ params: Promise.resolve({ slug: "match-corner" }) }),
    ).rejects.toThrow("NEXT_REDIRECT");

    expect(mocks.getAuthorizedVenueWorkspaceBySlug).toHaveBeenCalledWith("match-corner");
    expect(mocks.redirect).toHaveBeenCalledWith("/venues/match-corner/workspace/settings");
  });

  it("uses the same privacy-safe not-found boundary for a missing active membership", async () => {
    mocks.getAuthorizedVenueWorkspaceBySlug.mockResolvedValue(null);

    await expect(
      ManageVenuePage({ params: Promise.resolve({ slug: "match-corner" }) }),
    ).rejects.toThrow("NEXT_NOT_FOUND");
    expect(mocks.redirect).not.toHaveBeenCalled();
  });
});
