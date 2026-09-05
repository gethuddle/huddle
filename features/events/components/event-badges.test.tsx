// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { expect, it } from "vitest";
import { EventBadges } from "./event-badges";

it.each(["cancelled", "completed", "published"] as const)(
  "preserves %s counts and suppresses closed-event acquisition promises",
  (eventStatus) => {
    const props = {
      audience: "public" as const,
      audienceTeamName: null,
      placeKind: "venue" as const,
      capacity: 12,
      approvedAttendeeCount: 2,
      requiresApproval: false,
      eventStatus,
    };
    const { rerender } = render(<EventBadges {...props} attendanceMode="reservations" />);
    expect(screen.getByLabelText("Event facts")).toHaveTextContent("2 of 12 going");
    if (eventStatus === "published")
      expect(screen.getByLabelText("Event facts")).toHaveTextContent("Join instantly");
    else
      expect(screen.getByLabelText("Event facts")).not.toHaveTextContent(
        /Join instantly|Request to join/,
      );
    rerender(
      <EventBadges
        {...props}
        attendanceMode="open_door"
        capacity={null}
        approvedAttendeeCount={0}
      />,
    );
    if (eventStatus === "published")
      expect(screen.getByLabelText("Event facts")).toHaveTextContent("Just come along");
    else expect(screen.getByLabelText("Event facts")).not.toHaveTextContent("Just come along");
  },
);

it("replaces instant acquisition at full capacity while keeping approval requests possible", () => {
  const props = {
    audience: "public" as const,
    audienceTeamName: null,
    placeKind: "venue" as const,
    capacity: 2,
    approvedAttendeeCount: 2,
    requiresApproval: false,
    eventStatus: "published" as const,
    attendanceMode: "reservations" as const,
  };
  const { rerender } = render(<EventBadges {...props} />);
  expect(screen.getByLabelText("Event facts")).toHaveTextContent("Event full");
  expect(screen.getByLabelText("Event facts")).not.toHaveTextContent("Join instantly");
  rerender(<EventBadges {...props} requiresApproval />);
  expect(screen.getByLabelText("Event facts")).toHaveTextContent("Request to join");
});
