import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getVenueBySlug: vi.fn(),
  getVenueForManagement: vi.fn(),
  getVenueCreationViewerState: vi.fn(),
  listVenueEvents: vi.fn(),
  notFound: vi.fn(),
}));
vi.mock("next/navigation", () => ({ notFound: mocks.notFound }));
vi.mock("@/features/venues/queries", () => ({
  getVenueBySlug: mocks.getVenueBySlug,
  getVenueForManagement: mocks.getVenueForManagement,
}));
vi.mock("@/features/venues/viewer", () => ({
  getVenueCreationViewerState: mocks.getVenueCreationViewerState,
}));
vi.mock("@/features/events/queries", () => ({ listVenueEvents: mocks.listVenueEvents }));

import VenuePage from "./page";

describe("public Venue page boundary", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.notFound.mockImplementation(() => {
      throw new Error("NEXT_NOT_FOUND");
    });
    mocks.getVenueBySlug.mockResolvedValue(null);
    mocks.listVenueEvents.mockResolvedValue([]);
    mocks.getVenueForManagement.mockResolvedValue({ name: "Private venue draft" });
  });

  it.each(["anonymous", "eligible"])(
    "returns ordinary not-found for a hidden venue to an %s viewer",
    async (viewer) => {
      mocks.getVenueCreationViewerState.mockResolvedValue(viewer);
      await expect(
        VenuePage({ params: Promise.resolve({ slug: "hidden-venue" }) }),
      ).rejects.toThrow("NEXT_NOT_FOUND");
      expect(mocks.getVenueForManagement).not.toHaveBeenCalled();
    },
  );
});
