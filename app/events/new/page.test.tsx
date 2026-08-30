import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getAuthorizedVenueWorkspaceBySlug: vi.fn(),
  getVenueCreationViewerState: vi.fn(),
  notFound: vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
  redirect: vi.fn(() => {
    throw new Error("NEXT_REDIRECT");
  }),
}));

vi.mock("@/features/venues/viewer", () => ({
  getVenueCreationViewerState: mocks.getVenueCreationViewerState,
}));
vi.mock("@/features/workspaces/queries", () => ({
  getAuthorizedVenueWorkspaceBySlug: mocks.getAuthorizedVenueWorkspaceBySlug,
}));
vi.mock("next/navigation", () => ({ notFound: mocks.notFound, redirect: mocks.redirect }));

import NewEventPage from "./page";

describe("legacy Venue event entry", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getVenueCreationViewerState.mockResolvedValue("allowed");
  });

  it("reauthorizes the Venue workspace and keeps a valid optional fixture preselection", async () => {
    const matchId = "e7000000-0000-4000-8000-000000000101";
    mocks.getAuthorizedVenueWorkspaceBySlug.mockResolvedValue({ slug: "match-corner" });

    await expect(
      NewEventPage({
        searchParams: Promise.resolve({ venue: "match-corner", matchId }),
      }),
    ).rejects.toThrow("NEXT_REDIRECT");

    expect(mocks.getAuthorizedVenueWorkspaceBySlug).toHaveBeenCalledWith("match-corner");
    expect(mocks.redirect).toHaveBeenCalledWith(
      `/venues/match-corner/workspace/plan?matchId=${matchId}`,
    );
  });

  it("does not redirect a guessed Venue slug without active membership", async () => {
    mocks.getAuthorizedVenueWorkspaceBySlug.mockResolvedValue(null);

    await expect(
      NewEventPage({ searchParams: Promise.resolve({ venue: "match-corner" }) }),
    ).rejects.toThrow("NEXT_NOT_FOUND");
    expect(mocks.redirect).not.toHaveBeenCalled();
  });
});
