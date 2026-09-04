// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { VenueEventForm } from "./venue-event-form";

const matchId = "60000000-0000-4000-8000-000000000101";
const venue = {
  id: "60000000-0000-4000-8000-000000000103",
  slug: "match-corner",
  name: "Match Corner",
  addressText: "12 Public Street, Haifa",
  statedCapacity: 80,
  verificationStatus: "unverified" as const,
};
const catalog = {
  matches: [
    {
      id: matchId,
      label: "Arsenal FC vs Chelsea FC — Premier League",
      startsAt: "2026-09-01T17:00:00Z",
    },
  ],
  teams: [],
} as const;

describe("VenueEventForm compatibility", () => {
  it("retires the repetitive single-event form in favor of the batch planner", () => {
    render(
      <VenueEventForm
        canPrepareDrafts={true}
        catalog={catalog}
        initialMatchId={matchId}
        venue={venue}
      />,
    );

    expect(screen.getByRole("link", { name: "Continue to planner" })).toHaveAttribute(
      "href",
      `/venues/match-corner/workspace/plan?matchId=${matchId}`,
    );
    expect(screen.queryByLabelText("Event title")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Publish venue event" })).not.toBeInTheDocument();
  });
});
it("routes expired creation to Billing instead of the planner", () => {
  render(<VenueEventForm venue={venue} catalog={catalog} canPrepareDrafts={false} />);
  expect(screen.queryByRole("link", { name: "Continue to planner" })).not.toBeInTheDocument();
  expect(screen.getByRole("link", { name: /Billing/ })).toHaveAttribute(
    "href",
    "/venues/match-corner/workspace/billing",
  );
});
