// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import DiscoverPage from "./page";

const mocks = vi.hoisted(() => ({
  getDiscoveryCatalog: vi.fn(),
  getDiscoveryFreshness: vi.fn(),
  getFixtureById: vi.fn(),
}));

vi.mock("@/features/discovery/catalog", () => ({
  getDiscoveryCatalog: mocks.getDiscoveryCatalog,
  getDiscoveryFreshness: mocks.getDiscoveryFreshness,
}));

vi.mock("@/features/sports/browse", () => ({
  getFixtureById: mocks.getFixtureById,
}));

describe("DiscoverPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getDiscoveryCatalog.mockResolvedValue({
      competitions: [],
      teams: [],
    });
    mocks.getDiscoveryFreshness.mockResolvedValue({
      ageSeconds: null,
      lastSucceededAt: null,
      status: "unknown",
    });
    mocks.getFixtureById.mockResolvedValue({ match: null, freshness: null });
  });

  it("renders location-first discovery without requiring a city catalog", async () => {
    render(await DiscoverPage({ searchParams: Promise.resolve({}) }));

    expect(screen.getByRole("heading", { name: "Explore watch events" })).toBeVisible();
    expect(screen.queryByRole("combobox", { name: "City" })).not.toBeInTheDocument();
    expect(screen.getByText("Choose where to explore")).toBeVisible();
  });

  it("opens one focused Where, When, and Match editor without duplicating the search", async () => {
    const user = userEvent.setup();
    mocks.getDiscoveryCatalog.mockResolvedValue({
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
    render(await DiscoverPage({ searchParams: Promise.resolve({}) }));

    expect(screen.getByRole("heading", { name: "Explore watch events" })).toBeVisible();
    expect(screen.getByRole("link", { name: "Groups" })).toHaveAttribute("href", "/groups");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Change Explore search" }));
    expect(screen.getByRole("dialog", { name: "Change Explore search" })).toBeVisible();
    expect(screen.getByText("Distance", { selector: "legend" })).toBeVisible();
    expect(screen.getByText("When", { selector: "legend" })).toBeVisible();
    expect(screen.getByText("Match", { selector: "legend" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Show events" })).toBeVisible();
    expect(screen.getByRole("link", { name: "Clear" })).toBeVisible();
    expect(screen.queryByRole("combobox", { name: "City" })).not.toBeInTheDocument();

    expect(screen.queryByLabelText("Possible acquisition audiences")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Public venue/i })).not.toBeInTheDocument();
    expect(screen.queryByText(/Catalog current|Cached fixture catalog/i)).not.toBeInTheDocument();
  });

  it("keeps invalid dates editable and does not run discovery with a broken range", async () => {
    mocks.getDiscoveryCatalog.mockResolvedValue({
      competitions: [],
      teams: [],
    });

    render(
      await DiscoverPage({
        searchParams: Promise.resolve({
          from: "2026-09-14",
          to: "2026-08-31",
        }),
      }),
    );

    expect(screen.getByRole("alert")).toHaveTextContent(
      "Choose an end date on or after the start date.",
    );
  });

  it("stops an inverted date range in the filter dialog before navigation", async () => {
    const user = userEvent.setup();
    mocks.getDiscoveryCatalog.mockResolvedValue({
      competitions: [],
      teams: [],
    });
    render(await DiscoverPage({ searchParams: Promise.resolve({}) }));

    await user.click(screen.getByRole("button", { name: "Change Explore search" }));
    const from = screen.getByLabelText("From");
    const to = screen.getByLabelText("To");
    await user.clear(from);
    await user.type(from, "2026-09-14");
    await user.clear(to);
    await user.type(to, "2026-08-31");
    await user.click(screen.getByRole("button", { name: "Show events" }));

    expect(to).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByText("Choose an end date on or after the start date.")).toBeVisible();
  });

  it("keeps the chosen fixture name visible after the Explore query reloads", async () => {
    const user = userEvent.setup();
    const matchId = "52000000-0000-4000-8000-000000000404";
    mocks.getDiscoveryCatalog.mockResolvedValue({
      competitions: [],
      teams: [],
    });
    mocks.getFixtureById.mockResolvedValue({
      match: {
        id: matchId,
        homeTeam: { name: "Arsenal FC", shortName: "Arsenal" },
        awayTeam: { name: "Chelsea FC", shortName: "Chelsea" },
        competition: { name: "Premier League" },
      },
      freshness: null,
    });

    render(
      await DiscoverPage({
        searchParams: Promise.resolve({ match: matchId }),
      }),
    );

    await user.click(screen.getByRole("button", { name: "Change Explore search" }));
    expect(screen.getByLabelText("Selected fixture")).toHaveTextContent(
      "Arsenal vs Chelsea — Premier League",
    );
  });
});
