import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getVenueCatalog: vi.fn(),
  getVenueCreationViewerState: vi.fn(),
  redirect: vi.fn(),
}));

vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("@/features/venues/catalog", () => ({ getVenueCatalog: mocks.getVenueCatalog }));
vi.mock("@/features/venues/viewer", () => ({
  getVenueCreationViewerState: mocks.getVenueCreationViewerState,
}));

import NewVenuePage from "./page";

describe("NewVenuePage", () => {
  it("routes the legacy creation URL into the two-phase Venue onboarding", async () => {
    mocks.getVenueCreationViewerState.mockResolvedValue("allowed");
    mocks.getVenueCatalog.mockResolvedValue({ cities: [] });

    await NewVenuePage();

    expect(mocks.redirect).toHaveBeenCalledWith("/onboarding/venue");
  });
});
