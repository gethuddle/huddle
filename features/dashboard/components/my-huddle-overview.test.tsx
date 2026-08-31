// @vitest-environment jsdom

import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import type { MyEvent, MyGroupRelationship, SavedItem } from "@/features/dashboard/queries";

import { MyHuddleOverview } from "./my-huddle-overview";

const event: MyEvent = {
  id: "c1000000-0000-4000-8000-000000000101",
  title: "North London watch",
  homeTeamName: "Arsenal FC",
  awayTeamName: "Chelsea FC",
  competitionName: "Premier League",
  startsAt: "2026-09-01T17:00:00Z",
  cityName: "Haifa",
  placeKind: "home",
  audience: "invite_only",
  status: "published",
  bucket: "hosting",
  relationshipLabel: "You are hosting",
  canManage: true,
  totalCount: 21,
};

const group: MyGroupRelationship = {
  id: "c1000000-0000-4000-8000-000000000102",
  slug: "quiet-unlisted-group",
  name: "Quiet unlisted group",
  description: "A private group that must remain easy for its owner to find.",
  visibility: "unlisted",
  lifecycle: "active",
  cityName: "Haifa",
  teamName: "Arsenal FC",
  role: "owner",
  membershipStatus: "active",
  activeMemberCount: 4,
  canManage: true,
  totalCount: 21,
};

const saved: SavedItem = {
  id: "c1000000-0000-4000-8000-000000000103",
  kind: "team",
  label: "Arsenal FC",
  detail: "England",
  href: "/discover?team=c1000000-0000-4000-8000-000000000103",
  createdAt: "2026-08-30T06:00:00Z",
  totalCount: 21,
};

describe("MyHuddleOverview", () => {
  it("keeps durable collections together with direct recovery actions", () => {
    render(
      <MyHuddleOverview
        eventBucket="hosting"
        events={[event]}
        groupBucket="owner"
        groups={[group]}
        saved={[saved]}
        savedBucket="all"
      />,
    );

    expect(screen.getByRole("link", { name: /Open event/ })).toHaveAttribute(
      "href",
      `/events/${event.id}`,
    );
    expect(screen.getByRole("link", { name: "Open group" })).toHaveAttribute(
      "href",
      "/groups/quiet-unlisted-group",
    );
    expect(screen.getByRole("link", { name: "Open Arsenal FC" })).toHaveAttribute(
      "href",
      saved.href,
    );
    expect(screen.getAllByRole("link", { name: "Manage" })).toHaveLength(2);
    expect(screen.getByRole("link", { name: "Find groups" })).toHaveAttribute("href", "/groups");
  });

  it("uses labeled filters rather than route-like tabs and keeps History off by default", () => {
    render(
      <MyHuddleOverview
        eventBucket="upcoming"
        events={[]}
        groupBucket="owner"
        groups={[]}
        saved={[]}
        savedBucket="all"
      />,
    );

    fireEvent.click(screen.getByText(/Filter My Huddle/i));
    expect(screen.getByRole("combobox", { name: "Show events" })).toHaveValue("upcoming");
    expect(screen.getByRole("combobox", { name: "Show groups" })).toHaveValue("owner");
    expect(screen.getByRole("combobox", { name: "Show saved items" })).toHaveValue("all");
    expect(screen.getByRole("button", { name: "Apply filters" })).toBeVisible();
    expect(screen.queryByText(/past activity/i)).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Plan a huddle" })).toHaveClass("min-h-11");
    expect(screen.getByRole("link", { name: "Explore events" })).toHaveClass("min-h-11");
    expect(screen.getByRole("link", { name: "Create a group" })).toHaveClass("min-h-11");
    expect(screen.getByRole("link", { name: "Find groups" })).toHaveClass("min-h-11");
    expect(screen.getByRole("link", { name: "Choose interests" })).toHaveClass("min-h-11");
  });

  it("paginates each collection without losing the selected filters", () => {
    render(
      <MyHuddleOverview
        eventBucket="hosting"
        events={[event]}
        groupBucket="owner"
        groups={[group]}
        saved={[saved]}
        savedBucket="team"
      />,
    );

    const nextLinks = screen.getAllByRole("link", { name: "Go to next page" });
    expect(nextLinks[0]).toHaveAttribute(
      "href",
      expect.stringContaining("eventBucket=hosting&eventsPage=2"),
    );
    expect(nextLinks[1]).toHaveAttribute(
      "href",
      expect.stringContaining("groupBucket=owner&groupsPage=2"),
    );
    expect(nextLinks[2]).toHaveAttribute(
      "href",
      expect.stringContaining("savedBucket=team&savedPage=2"),
    );
    nextLinks.forEach((link) => expect(link).toHaveClass("min-h-11"));
  });

  it("caps navigation and explains the bounded window at page 501", () => {
    render(
      <MyHuddleOverview
        eventBucket="hosting"
        eventPage={501}
        events={[{ ...event, totalCount: 10_021 }]}
        groupBucket="owner"
        groups={[]}
        saved={[]}
        savedBucket="all"
      />,
    );

    expect(screen.getByText("Page 501 of 501")).toBeVisible();
    expect(screen.getByText(/first 10,020 events/i)).toBeVisible();
    expect(screen.queryByRole("link", { name: "Go to next page" })).not.toBeInTheDocument();
  });
});
