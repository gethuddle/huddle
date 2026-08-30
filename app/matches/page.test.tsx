// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import MatchesPage from "./page";

const mocks = vi.hoisted(() => ({
  getFixtureBrowserData: vi.fn(),
  redirect: vi.fn(() => {
    throw new Error("NEXT_REDIRECT");
  }),
}));

vi.mock("@/features/sports/browse", () => ({
  getFixtureBrowserData: mocks.getFixtureBrowserData,
}));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));

const freshness = {
  status: "fresh" as const,
  coverageStatus: "short" as const,
  updatedAt: "2026-08-30T10:00:00Z",
  coverageThrough: "2026-10-12T18:00:00Z",
  updatedLabel: "2 hours ago",
  coverageLabel: "12 Oct",
};

describe("MatchesPage coverage recovery", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getFixtureBrowserData.mockResolvedValue({
      competitions: [],
      freshness,
      matches: [],
      teams: [],
      total: 0,
      totalPages: 1,
    });
  });

  it("explains that a requested date beyond observed coverage is not available yet", async () => {
    render(await MatchesPage({ searchParams: Promise.resolve({ date: "2026-10-13" }) }));

    expect(
      screen.getByRole("heading", { name: "Later fixtures are not yet available." }),
    ).toBeVisible();
    expect(screen.getByText(/currently has fixtures through 12 Oct/i)).toBeVisible();
    expect(screen.queryByText("No fixtures match these filters.")).not.toBeInTheDocument();
  });

  it("keeps an ordinary in-range no-result state distinct from incomplete coverage", async () => {
    render(await MatchesPage({ searchParams: Promise.resolve({ date: "2026-10-12" }) }));

    expect(screen.getByRole("heading", { name: "No fixtures match these filters." })).toBeVisible();
    expect(screen.getByText("Try another date, competition, or team.")).toBeVisible();
    expect(
      screen.queryByRole("heading", { name: "Later fixtures are not yet available." }),
    ).not.toBeInTheDocument();
  });

  it("redirects an over-high page to the real last page while preserving filters", async () => {
    mocks.getFixtureBrowserData.mockResolvedValue({
      competitions: [],
      freshness,
      matches: [],
      teams: [],
      total: 13,
      totalPages: 2,
    });
    const competitionId = "60000000-0000-4000-8000-000000000201";
    const teamId = "60000000-0000-4000-8000-000000000202";

    await expect(
      MatchesPage({
        searchParams: Promise.resolve({
          date: "2026-10-12",
          competition: competitionId,
          team: teamId,
          page: "5",
        }),
      }),
    ).rejects.toThrow("NEXT_REDIRECT");

    expect(mocks.redirect).toHaveBeenCalledWith(
      `/matches?date=2026-10-12&competition=${competitionId}&team=${teamId}&page=2`,
    );
  });
});
