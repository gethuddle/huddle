// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import DiscoverPage from "./page";

const mocks = vi.hoisted(() => ({
  getDiscoveryCatalog: vi.fn(),
  getDiscoveryFreshness: vi.fn(),
  getDiscoveryPage: vi.fn(),
  getViewerCitySlug: vi.fn(),
}));

vi.mock("@/features/discovery/catalog", () => ({
  getDiscoveryCatalog: mocks.getDiscoveryCatalog,
  getDiscoveryFreshness: mocks.getDiscoveryFreshness,
  getViewerCitySlug: mocks.getViewerCitySlug,
}));

vi.mock("@/features/discovery/query", () => ({
  getDiscoveryPage: mocks.getDiscoveryPage,
}));

describe("DiscoverPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getDiscoveryCatalog.mockResolvedValue({
      cities: [],
      competitions: [],
      teams: [],
    });
    mocks.getDiscoveryFreshness.mockResolvedValue({
      ageSeconds: null,
      lastSucceededAt: null,
      status: "unknown",
    });
    mocks.getViewerCitySlug.mockResolvedValue(null);
  });

  it("renders a controlled catalog state instead of throwing when no city exists", async () => {
    render(await DiscoverPage({ searchParams: Promise.resolve({}) }));

    expect(
      screen.getByRole("heading", { name: "Discovery is temporarily unavailable." }),
    ).toBeVisible();
    expect(screen.getByRole("alert")).toHaveTextContent("no active Israel city fallbacks");
    expect(mocks.getDiscoveryPage).not.toHaveBeenCalled();
  });
});
