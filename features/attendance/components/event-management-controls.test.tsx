// @vitest-environment jsdom

import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  cancelEventAction: vi.fn(),
  createEventInvitationAction: vi.fn(),
  createEventInviteLinkAction: vi.fn(),
  createEventInvitationsAction: vi.fn(),
  removeAttendeeAction: vi.fn(),
  reviewAttendanceAction: vi.fn(),
  revokeEventInvitationAction: vi.fn(),
  revokeEventInviteLinkAction: vi.fn(),
  refresh: vi.fn(),
}));

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: mocks.refresh }) }));
vi.mock("@/features/attendance/actions", () => mocks);

import { EventManagementControls } from "./event-management-controls";
import type { EventAttendance } from "@/features/attendance/queries";

const eventId = "90000000-0000-4000-8000-000000000401";
const attendee: EventAttendance = {
  attendance_id: "90000000-0000-4000-8000-000000000601",
  user_id: "90000000-0000-4000-8000-000000000102",
  requester_handle: "supporter",
  requester_display_name: "Supporter One",
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
  review_mode: "approve_or_decline",
  review_reason: null,
  can_approve: true,
  total_count: 1,
};

describe("EventManagementControls", () => {
  beforeEach(() => vi.clearAllMocks());

  it("retains deleted invitation and attendance history without profile links or actions", () => {
    render(
      <EventManagementControls
        attendance={[
          {
            ...attendee,
            requester_handle: null,
            requester_display_name: "Deleted account",
            status: "left",
            review_mode: "none",
            review_reason: null,
            can_approve: false,
          },
        ]}
        invitations={[
          {
            invitation_id: "90000000-0000-4000-8000-000000000701",
            invitee_id: attendee.user_id,
            invitee_handle: null,
            invitee_display_name: "Deleted account",
            status: "revoked",
            responded_at: "2026-09-04T12:00:00Z",
            created_at: "2026-08-28T12:00:00Z",
            total_count: 1,
          },
        ]}
        eventId={eventId}
        eventStatus="completed"
      />,
    );
    expect(screen.getAllByText("Deleted account")).toHaveLength(2);
    expect(screen.getByText("revoked")).toBeVisible();
    expect(screen.getByText("left")).toBeVisible();
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    expect(document.body).not.toHaveTextContent("@");
  });

  it("keeps the removal reason after rejection and closes only after successful retry", async () => {
    mocks.removeAttendeeAction
      .mockRejectedValueOnce(new Error("private diagnostic"))
      .mockResolvedValueOnce({ ok: true, data: { message: "Attendee removed." } });
    render(
      <EventManagementControls
        attendance={[{ ...attendee, status: "approved" }]}
        invitations={[]}
        eventId={eventId}
        eventStatus="published"
      />,
    );
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Remove attendee" }));
    await user.type(screen.getByLabelText("Reason (optional)"), "No longer attending");
    await user.click(screen.getByRole("button", { name: "Confirm removal" }));
    expect(await within(screen.getByRole("alertdialog")).findByRole("alert")).toHaveTextContent(
      /couldn't confirm/i,
    );
    expect(screen.getByLabelText("Reason (optional)")).toHaveValue("No longer attending");
    expect(mocks.refresh).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Confirm removal" }));
    await waitFor(() => expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument());
    const submitted = mocks.removeAttendeeAction.mock.calls[1]?.[0] as FormData;
    expect(submitted.get("reason")).toBe("No longer attending");
  });

  it("shows a rejected approval without announcing a reserved seat", async () => {
    mocks.reviewAttendanceAction.mockRejectedValueOnce(new Error("private diagnostic"));
    render(
      <EventManagementControls
        attendance={[attendee]}
        invitations={[]}
        eventId={eventId}
        eventStatus="published"
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: "Approve" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/couldn't confirm/i);
    expect(screen.getByRole("button", { name: "Approve" })).toBeEnabled();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    expect(mocks.refresh).not.toHaveBeenCalled();
  });

  it.each(["transport", "domain"])(
    "keeps cancellation reason and dialog after a %s failure",
    async (failure) => {
      if (failure === "transport")
        mocks.cancelEventAction.mockRejectedValueOnce(new Error("private diagnostic"));
      else
        mocks.cancelEventAction.mockResolvedValueOnce({
          ok: false,
          error: {
            code: "VALIDATION_FAILED",
            message: "Check the cancellation reason.",
          },
        });
      mocks.cancelEventAction.mockResolvedValueOnce({
        ok: true,
        data: { message: "Event cancelled." },
      });
      render(
        <EventManagementControls
          attendance={[]}
          invitations={[]}
          eventId={eventId}
          eventStatus="published"
        />,
      );
      const user = userEvent.setup();
      await user.click(screen.getByRole("button", { name: "Cancel event" }));
      await user.type(screen.getByLabelText("Cancellation reason"), "Venue unavailable");
      await user.click(screen.getByRole("button", { name: "Confirm cancellation" }));
      const dialog = screen.getByRole("alertdialog");
      expect(await within(dialog).findByRole("alert")).toHaveTextContent(
        failure === "transport" ? /couldn't confirm/i : /cancellation reason/i,
      );
      expect(screen.getByLabelText("Cancellation reason")).toHaveValue("Venue unavailable");
      expect(document.body).not.toHaveTextContent("private diagnostic");
      expect(mocks.refresh).not.toHaveBeenCalled();
      await user.click(screen.getByRole("button", { name: "Confirm cancellation" }));
      await waitFor(() => expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument());
      expect(mocks.refresh).toHaveBeenCalledOnce();
    },
  );

  it("does not close or submit cancellation twice while awaiting acknowledgement", async () => {
    let finish!: (value: { ok: true; data: { message: string } }) => void;
    mocks.cancelEventAction.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    render(
      <EventManagementControls
        attendance={[]}
        invitations={[]}
        eventId={eventId}
        eventStatus="published"
        attendanceMode="open_door"
      />,
    );
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Cancel event" }));
    await user.type(screen.getByLabelText("Cancellation reason"), "Venue unavailable");
    await user.click(screen.getByRole("button", { name: "Confirm cancellation" }));
    expect(screen.getByRole("button", { name: "Confirm cancellation" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Keep event" })).toBeDisabled();
    await user.keyboard("{Escape}");
    expect(screen.getByRole("alertdialog")).toBeVisible();
    expect(mocks.cancelEventAction).toHaveBeenCalledOnce();
    finish({ ok: true, data: { message: "Event cancelled." } });
    await waitFor(() => expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument());
  });

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
            review_mode: "approve_or_decline",
            review_reason: null,
            can_approve: true,
            total_count: 1,
          },
        ]}
        eventId={eventId}
        eventStatus="published"
        invitations={[]}
      />,
    );

    expect(screen.getAllByText(/not a score/i)).not.toHaveLength(0);
    expect(screen.queryByText(/^Verified$/)).not.toBeInTheDocument();
    expect(screen.getByText("40 days")).not.toBeVisible();
    await user.click(screen.getByText("Why this request is eligible"));
    expect(screen.getByText("40 days")).toBeVisible();
    expect(document.body.textContent).not.toContain("@example.com");
    expect(screen.queryByLabelText(/guest|plus-one/i)).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Approve" }));
    await waitFor(() => expect(mocks.reviewAttendanceAction).toHaveBeenCalledOnce());
    const formData = mocks.reviewAttendanceAction.mock.calls[0]?.[0] as FormData;
    expect(formData.get("attendanceId")).toBe("90000000-0000-4000-8000-000000000601");
    expect(formData.get("decision")).toBe("approve");
  });

  it("explains a decline-only request and never renders an impossible approval", async () => {
    mocks.reviewAttendanceAction.mockResolvedValue({
      ok: true,
      data: { message: "Request declined." },
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
            review_mode: "decline_only",
            review_reason: "The event is full. Only decline remains.",
            can_approve: false,
            total_count: 1,
          },
        ]}
        eventId={eventId}
        eventStatus="published"
        invitations={[]}
      />,
    );

    expect(screen.getByText("The event is full. Only decline remains.")).toBeVisible();
    expect(screen.queryByRole("button", { name: "Approve" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Decline" }));
    await waitFor(() => expect(mocks.reviewAttendanceAction).toHaveBeenCalledOnce());
    const formData = mocks.reviewAttendanceAction.mock.calls[0]?.[0] as FormData;
    expect(formData.get("decision")).toBe("decline");
  });

  it("selects an eligible person inline without any guest-count input", async () => {
    mocks.createEventInvitationsAction.mockResolvedValue({
      ok: true,
      data: { message: "Invitation sent to @supporter." },
    });
    const user = userEvent.setup();
    render(
      <EventManagementControls
        attendance={[]}
        candidates={[
          {
            id: "90000000-0000-4000-8000-000000000102",
            handle: "supporter",
            displayName: "Supporter One",
            context: "Friend · Haifa",
            eligible: true,
            ineligibilityReason: null,
          },
        ]}
        eventId={eventId}
        eventStatus="published"
        invitations={[]}
        remainingCapacity={1}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Invite people" }));
    await user.click(screen.getByRole("checkbox", { name: "Supporter One @supporter" }));
    await user.click(screen.getByRole("button", { name: "Invite 1 person" }));
    await waitFor(() => expect(mocks.createEventInvitationsAction).toHaveBeenCalledOnce());
    expect(mocks.createEventInvitationsAction).toHaveBeenCalledWith({
      eventId,
      inviteeIds: ["90000000-0000-4000-8000-000000000102"],
    });
    expect(screen.queryByLabelText(/guest|plus-one/i)).not.toBeInTheDocument();
  });

  it("distinguishes a share link from a direct Huddle invitation", () => {
    render(
      <EventManagementControls
        attendance={[]}
        eventAudience="invite_only"
        eventId={eventId}
        eventStatus="published"
        invitations={[]}
        inviteLinks={[]}
      />,
    );

    expect(screen.getByRole("heading", { name: "Share this private event" })).toBeVisible();
    expect(screen.getByText(/sent in any messaging app/i)).toBeVisible();
    expect(screen.getByRole("heading", { name: "Invite a specific person" })).toBeVisible();
    expect(screen.getByText(/appears in that person's Home/i)).toBeVisible();
  });
});
it("keeps cancellation but removes acquisition controls during grace", () => {
  render(
    <EventManagementControls
      attendance={[]}
      invitations={[]}
      eventId={eventId}
      eventStatus="published"
      remainingCapacity={10}
      canInvite={false}
      canOperate={true}
    />,
  );
  expect(screen.queryByRole("button", { name: "Invite people" })).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Cancel event" })).toBeEnabled();
});
it("retains attendance history with no operation buttons after expiry", () => {
  render(
    <EventManagementControls
      attendance={[]}
      invitations={[]}
      eventId={eventId}
      eventStatus="published"
      remainingCapacity={10}
      canInvite={false}
      canOperate={false}
    />,
  );
  expect(screen.queryByRole("button")).not.toBeInTheDocument();
  expect(screen.getByRole("heading", { name: "Attendance requests" })).toBeVisible();
});
