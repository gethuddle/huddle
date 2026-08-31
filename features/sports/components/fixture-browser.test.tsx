// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import type { PublicMatchDto } from "@/features/sports/dto";

import { FixtureFilters } from "./fixture-filters";
import { MatchCard } from "./match-card";
import { ProviderFreshness } from "./provider-freshness";
import { teamInitials } from "./team-initials";

const match: PublicMatchDto = {
  id: "10000000-0000-4000-8000-000000000001",
  sport: { id: "10000000-0000-4000-8000-000000000002", slug: "football" },
  competition: {
    id: "10000000-0000-4000-8000-000000000003",
    code: "PL",
    name: "Premier League",
  },
  homeTeam: {
    id: "10000000-0000-4000-8000-000000000004",
    name: "Arsenal FC",
    shortName: "Arsenal",
    tla: "ARS",
    crestUrl: null,
  },
  awayTeam: {
    id: "10000000-0000-4000-8000-000000000005",
    name: "Chelsea FC",
    shortName: "Chelsea",
    tla: "CHE",
    crestUrl: null,
  },
  startsAt: "2026-08-26T17:30:00Z",
  status: "timed",
  matchday: 2,
  stage: "REGULAR_SEASON",
  seasonLabel: "2026",
  lastSyncedAt: "2026-08-26T10:00:00Z",
};

describe("fixture browser components", () => {
  it("renders a provider-neutral match card in Israel time", () => {
    render(<MatchCard match={match} />);

    expect(screen.getByText("Arsenal")).toBeVisible();
    expect(screen.getByText("Chelsea")).toBeVisible();
    expect(screen.getByText(/20:30/)).toBeVisible();
    expect(screen.getByRole("link", { name: "View Arsenal FC versus Chelsea FC" })).toHaveAttribute(
      "href",
      `/matches/${match.id}`,
    );
    expect(screen.getByRole("img", { name: "Arsenal FC" })).toHaveTextContent("ARS");
    expect(screen.getByRole("img", { name: "Chelsea FC" })).toHaveTextContent("CHE");
  });

  it("renders labelled shareable filters with their selected values", () => {
    render(
      <FixtureFilters
        competitions={[{ id: match.competition.id, name: "Premier League", code: "PL" }]}
        filters={{
          date: "2026-08-26",
          competitionId: match.competition.id,
          teamId: match.homeTeam.id,
          page: 1,
        }}
        teams={[
          {
            id: match.homeTeam.id,
            name: match.homeTeam.name,
            shortName: match.homeTeam.shortName,
            tla: match.homeTeam.tla,
          },
        ]}
      />,
    );

    expect(screen.getByLabelText("Israel date")).toHaveValue("2026-08-26");
    expect(screen.getByRole("combobox", { name: "Competition" })).toHaveValue(match.competition.id);
    expect(screen.getByRole("combobox", { name: "Team" })).toHaveValue(match.homeTeam.id);
    expect(screen.getByRole("button", { name: "Apply filters" })).toBeVisible();
  });

  it("separates stale updates from short coverage without a completeness claim", () => {
    const { rerender } = render(
      <ProviderFreshness
        freshness={{
          status: "stale",
          coverageStatus: "short",
          updatedAt: "2026-08-25T10:00:00Z",
          coverageThrough: "2026-10-12T18:00:00Z",
          updatedLabel: "1 day ago",
          coverageLabel: "12 Oct",
        }}
      />,
    );

    expect(screen.getByRole("status")).toHaveTextContent("Updated 1 day ago");
    expect(screen.getByRole("status")).toHaveTextContent("Fixtures available through 12 Oct");
    expect(screen.getByRole("status")).toHaveTextContent("Updates are delayed");
    expect(screen.getByRole("status")).toHaveTextContent("Later fixtures are not yet available");
    expect(screen.getByRole("status")).not.toHaveTextContent("Catalog current");

    rerender(
      <ProviderFreshness
        freshness={{
          status: "unknown",
          coverageStatus: "unknown",
          updatedAt: null,
          coverageThrough: null,
          updatedLabel: "Not available yet",
          coverageLabel: "Not available yet",
        }}
      />,
    );
    expect(screen.getByRole("status")).toHaveTextContent("Updated Not available yet");
    expect(screen.getByRole("status")).toHaveTextContent(
      "Fixtures available through Not available yet",
    );
  });

  it("uses provider-neutral initials when no TLA exists", () => {
    expect(teamInitials("Manchester United FC", null)).toBe("MU");
    expect(teamInitials("Arsenal FC", "ars")).toBe("ARS");
  });
});
