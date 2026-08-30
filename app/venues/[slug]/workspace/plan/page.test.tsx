// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getAuthorizedVenueWorkspaceBySlug: vi.fn(),
  getVenueEventCatalog: vi.fn(),
  getVenueSettings: vi.fn(),
  notFound: vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
}));

vi.mock("@/features/workspaces/queries", () => ({
  getAuthorizedVenueWorkspaceBySlug: mocks.getAuthorizedVenueWorkspaceBySlug,
}));
vi.mock("@/features/events/catalog", () => ({ getVenueEventCatalog: mocks.getVenueEventCatalog }));
vi.mock("@/features/venues/workspace/queries", () => ({
  getVenueSettings: mocks.getVenueSettings,
}));
vi.mock("next/navigation", () => ({ notFound: mocks.notFound }));

import VenuePlanPage from "./page";

const venueId = "e6000000-0000-4000-8000-000000000101";
const matchId = "e6000000-0000-4000-8000-000000000102";

describe("VenuePlanPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getAuthorizedVenueWorkspaceBySlug.mockResolvedValue({
      id: venueId,
      slug: "match-corner",
    });
    mocks.getVenueSettings.mockResolvedValue({
      id: venueId,
      slug: "match-corner",
      name: "Match Corner",
      addressText: "12 Stadium Street, Haifa",
      houseInformation: "Order at the bar before kick-off.",
      defaultAttendanceMode: "reservations",
      defaultRequiresApproval: true,
      spaces: [
        {
          id: "e6000000-0000-4000-8000-000000000103",
          name: "Main screen",
          capacity: 80,
          active: true,
        },
      ],
    });
    mocks.getVenueEventCatalog.mockResolvedValue({
      matches: [
        {
          id: matchId,
          label: "Arsenal vs Chelsea — Premier League",
          startsAt: "2026-09-12T17:00:00Z",
        },
      ],
      teams: [],
    });
  });

  it("reauthorizes the workspace and carries a valid legacy fixture preselection", async () => {
    render(
      await VenuePlanPage({
        params: Promise.resolve({ slug: "match-corner" }),
        searchParams: Promise.resolve({ matchId }),
      }),
    );

    expect(mocks.getAuthorizedVenueWorkspaceBySlug).toHaveBeenCalledWith("match-corner");
    expect(mocks.getVenueSettings).toHaveBeenCalledWith(venueId);
    expect(mocks.getVenueEventCatalog).toHaveBeenCalledWith(matchId);
    expect(screen.getByRole("heading", { name: "Plan events" })).toBeVisible();
    expect(screen.getByText("Arsenal vs Chelsea — Premier League")).toBeVisible();
  });

  it("does not reveal whether a guessed Venue exists without active membership", async () => {
    mocks.getAuthorizedVenueWorkspaceBySlug.mockResolvedValue(null);

    await expect(
      VenuePlanPage({
        params: Promise.resolve({ slug: "match-corner" }),
        searchParams: Promise.resolve({}),
      }),
    ).rejects.toThrow("NEXT_NOT_FOUND");
    expect(mocks.getVenueSettings).not.toHaveBeenCalled();
  });
});
