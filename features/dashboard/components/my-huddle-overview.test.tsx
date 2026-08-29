// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import type { MyGroup, MyHuddleEvent } from "@/features/dashboard/queries";

import { MyHuddleOverview } from "./my-huddle-overview";

const event: MyHuddleEvent = {
  event_id: "c1000000-0000-4000-8000-000000000101",
  title: "North London watch",
  home_team_name: "Arsenal FC",
  away_team_name: "Chelsea FC",
  competition_name: "Premier League",
  starts_at: "2026-09-01T17:00:00Z",
  city_name: "Haifa",
  place_kind: "home",
  audience: "invite_only",
  status: "published",
  involvement: "hosting",
  invitation_status: null,
  attendance_status: null,
  can_manage: true,
  total_count: 21,
};

const group: MyGroup = {
  group_id: "c1000000-0000-4000-8000-000000000102",
  slug: "quiet-unlisted-group",
  name: "Quiet unlisted group",
  description: "A private group that must remain easy for its owner to find.",
  visibility: "unlisted",
  lifecycle: "active",
  city_name: "Haifa",
  team_name: "Arsenal FC",
  member_role: "owner",
  membership_status: "active",
  active_member_count: 4,
  can_manage: true,
  total_count: 21,
};

describe("MyHuddleOverview", () => {
  it("keeps owned private things visible with direct open and manage actions", () => {
    render(<MyHuddleOverview events={[event]} groups={[group]} />);

    expect(screen.getByRole("link", { name: /Open event/ })).toHaveAttribute(
      "href",
      `/events/${event.event_id}`,
    );
    expect(screen.getByRole("link", { name: "Open group" })).toHaveAttribute(
      "href",
      "/groups/quiet-unlisted-group",
    );
    expect(screen.getByText("unlisted")).toBeVisible();
    expect(screen.getAllByRole("link", { name: "Manage" })).toHaveLength(2);
  });

  it("paginates growing event and group collections", () => {
    render(<MyHuddleOverview events={[event]} groups={[group]} />);

    const nextLinks = screen.getAllByRole("link", { name: "Go to next page" });
    expect(nextLinks[0]).toHaveAttribute("href", "?eventsPage=2&groupsPage=1#your-events-heading");
    expect(nextLinks[1]).toHaveAttribute("href", "?eventsPage=1&groupsPage=2#your-groups-heading");
  });
});
