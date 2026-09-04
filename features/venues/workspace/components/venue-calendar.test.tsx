// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { VenueCalendar } from "./venue-calendar";

const base = {
  id: "e2000000-0000-4000-8000-000000000101",
  title: "Derby night",
  status: "published" as const,
  startsAt: "2026-09-12T17:00:00Z",
  endsAt: "2026-09-12T20:00:00Z",
  venueSpace: { id: "e2000000-0000-4000-8000-000000000102", name: "Main screen" },
  attendanceMode: "reservations" as const,
  capacity: 80,
  approvedAttendeeCount: 12,
  requiresApproval: false,
};

describe("VenueCalendar", () => {
  it("opens saved drafts in the editor and preserves Calendar as the return destination", () => {
    render(<VenueCalendar slug="corner" events={[{ ...base, status: "draft" }]} />);
    expect(screen.getByRole("link", { name: /Derby night/ })).toHaveAttribute(
      "href",
      `/events/${base.id}/manage?returnTo=%2Fvenues%2Fcorner%2Fworkspace%2Fcalendar`,
    );
  });
  it("defaults to the accessible agenda and switches to Israel-date month groups", async () => {
    const user = userEvent.setup();
    render(
      <VenueCalendar
        events={[
          base,
          {
            ...base,
            id: "e2000000-0000-4000-8000-000000000103",
            title: "Sold-out late match",
            approvedAttendeeCount: 80,
          },
        ]}
      />,
    );

    expect(screen.getByRole("tab", { name: "Agenda" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("link", { name: /Derby night/ })).toBeVisible();
    expect(screen.getByRole("link", { name: /Sold-out late match/ })).toHaveTextContent("Full");

    await user.click(screen.getByRole("tab", { name: "Month" }));
    expect(screen.getByRole("tab", { name: "Month" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("heading", { name: "12 Sep 2026" })).toBeVisible();
  });

  it("filters Draft, Published, Full, Cancelled, and Completed on the same surface", async () => {
    const user = userEvent.setup();
    render(
      <VenueCalendar
        events={[
          base,
          {
            ...base,
            id: "e2000000-0000-4000-8000-000000000104",
            title: "Private draft",
            status: "draft",
          },
        ]}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Draft" }));
    expect(screen.getByRole("link", { name: /Private draft/ })).toBeVisible();
    expect(screen.queryByRole("link", { name: /Derby night/ })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Published" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Full" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Cancelled" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Completed" })).toBeVisible();
  });

  it("labels walk-in events without treating null capacity as sold out", () => {
    render(
      <VenueCalendar
        events={[
          { ...base, attendanceMode: "open_door", capacity: null, approvedAttendeeCount: 0 },
        ]}
      />,
    );

    expect(screen.getByRole("link", { name: /Derby night/ })).toHaveTextContent("Published");
    expect(screen.getByRole("link", { name: /Derby night/ })).toHaveTextContent("Open door");
    expect(screen.getByRole("link", { name: /Derby night/ })).not.toHaveTextContent("Full");
  });

  it("provides a focused event directory without duplicating calendar view controls", () => {
    render(<VenueCalendar events={[base]} surface="events" />);

    expect(screen.queryByRole("tablist", { name: "Calendar view" })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Derby night/ })).toBeVisible();
    expect(screen.getByRole("button", { name: "Published" })).toBeVisible();
  });
});
