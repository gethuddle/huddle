// @vitest-environment jsdom

import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  cancelEventAction: vi.fn(),
  createEventInvitationAction: vi.fn(),
  removeAttendeeAction: vi.fn(),
  reviewAttendanceAction: vi.fn(),
  revokeEventInvitationAction: vi.fn(),
  refresh: vi.fn(),
}));

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: mocks.refresh }) }));
vi.mock("@/features/attendance/actions", () => mocks);

import { EventManagementControls } from "./event-management-controls";

const eventId = "90000000-0000-4000-8000-000000000401";

describe("EventManagementControls", () => {
  beforeEach(() => vi.clearAllMocks());

  it("shows minimized factual context and submits a transactional approval", async () => {
    mocks.reviewAttendanceAction.mockResolvedValue({
      ok: true,
      data: { message: "Request approved." },
    });
    const user = userEvent.setup();
    render(
      <EventManagementControls
        attendance={[
          {
            attendance_id: "90000000-0000-4000-8000-000000000601",
            user_id: "90000000-0000-4000-8000-000000000102",
            requester_handle: "supporter",
            requester_display_name: "Supporter One",
            requester_city_name: "Haifa",
            status: "requested",
            source: "self_request",
            requested_at: "2026-08-28T12:00:00Z",
            removal_reason: null,
            verified_account: true,
            account_age_days: 40,
            mutual_friend_count: 2,
            shared_active_group_count: 1,
            follows_sport: true,
            follows_competition: false,
            follows_home_team: true,
            follows_away_team: false,
            follows_audience_team: false,
            total_count: 1,
          },
        ]}
        eventId={eventId}
        eventStatus="published"
        invitations={[]}
      />,
    );

    expect(screen.getByText(/not a score/i)).toBeInTheDocument();
    expect(screen.getByText("40 days")).toBeInTheDocument();
    expect(document.body.textContent).not.toContain("@example.com");
    expect(screen.queryByLabelText(/guest|plus-one/i)).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Approve" }));
    await waitFor(() => expect(mocks.reviewAttendanceAction).toHaveBeenCalledOnce());
    const formData = mocks.reviewAttendanceAction.mock.calls[0]?.[0] as FormData;
    expect(formData.get("attendanceId")).toBe("90000000-0000-4000-8000-000000000601");
    expect(formData.get("decision")).toBe("approve");
  });

  it("creates an invitation by handle without any guest-count input", async () => {
    mocks.createEventInvitationAction.mockResolvedValue({
      ok: true,
      data: { message: "Invitation sent to @supporter." },
    });
    const user = userEvent.setup();
    render(
      <EventManagementControls
        attendance={[]}
        eventId={eventId}
        eventStatus="published"
        invitations={[]}
      />,
    );

    await user.type(screen.getByLabelText("Huddle handle"), "supporter");
    await user.click(screen.getByRole("button", { name: "Send invitation" }));
    await waitFor(() => expect(mocks.createEventInvitationAction).toHaveBeenCalledOnce());
    const formData = mocks.createEventInvitationAction.mock.calls[0]?.[0] as FormData;
    expect(formData.get("inviteeHandle")).toBe("supporter");
    expect(formData.has("guestCount")).toBe(false);
  });
});
