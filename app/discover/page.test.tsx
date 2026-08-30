// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
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
    expect(screen.getByRole("alert")).toHaveTextContent("no active city fallbacks");
    expect(mocks.getDiscoveryPage).not.toHaveBeenCalled();
  });

  it("opens one focused Where, When, and Match editor without duplicating the search", async () => {
    const user = userEvent.setup();
    mocks.getDiscoveryCatalog.mockResolvedValue({
      cities: [{ id: "52000000-0000-4000-8000-000000000401", slug: "haifa", name: "Haifa" }],
      competitions: [
        {
          id: "52000000-0000-4000-8000-000000000402",
          name: "Premier League",
          code: "PL",
        },
      ],
      teams: [
        {
          id: "52000000-0000-4000-8000-000000000403",
          name: "Arsenal",
          shortName: "Arsenal",
        },
      ],
    });
    mocks.getViewerCitySlug.mockResolvedValue("haifa");
    mocks.getDiscoveryPage.mockResolvedValue({
      items: [],
      nextCursor: null,
      locationMode: "city",
      generatedAt: "2026-08-30T12:00:00.000Z",
      requiresPrivateCache: true,
    });

    render(await DiscoverPage({ searchParams: Promise.resolve({ city: "haifa" }) }));

    expect(screen.getByRole("heading", { name: "Explore watch events" })).toBeVisible();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Change Explore search" }));
    expect(screen.getByRole("dialog", { name: "Change Explore search" })).toBeVisible();
    expect(screen.getByText("Where", { selector: "legend" })).toBeVisible();
    expect(screen.getByText("When", { selector: "legend" })).toBeVisible();
    expect(screen.getByText("Match", { selector: "legend" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Show events" })).toBeVisible();
    expect(screen.getByRole("link", { name: "Clear" })).toBeVisible();

    expect(screen.queryByLabelText("Possible acquisition audiences")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Public venue/i })).not.toBeInTheDocument();
    expect(screen.queryByText(/Catalog current|Cached fixture catalog/i)).not.toBeInTheDocument();
  });
});
