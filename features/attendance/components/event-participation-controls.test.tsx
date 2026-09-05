// @vitest-environment jsdom

import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  leaveEventAction: vi.fn(),
  requestOrJoinEventAction: vi.fn(),
  respondToEventInvitationAction: vi.fn(),
  push: vi.fn(),
  refresh: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mocks.push, refresh: mocks.refresh }),
}));
vi.mock("@/features/attendance/actions", () => mocks);

import { EventParticipationControls } from "./event-participation-controls";

const baseProps = {
  eventId: "90000000-0000-4000-8000-000000000401",
  eventStatus: "published" as const,
  hostKind: "person" as const,
  requiresApproval: true,
  remainingCapacity: 2,
  viewerIsAuthenticated: true,
  viewerInvitationId: null,
  viewerInvitationStatus: null,
  viewerAttendanceId: null,
  viewerAttendanceStatus: null,
  canManage: false,
};

describe("EventParticipationControls", () => {
  beforeEach(() => vi.clearAllMocks());

  it("shows a safe transport error without claiming attendance and allows retry", async () => {
    mocks.requestOrJoinEventAction.mockRejectedValueOnce(new Error("private diagnostic"));
    render(<EventParticipationControls {...baseProps} />);
    await userEvent.click(screen.getByRole("button", { name: "Request to attend" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/couldn't confirm/i);
    expect(document.body).not.toHaveTextContent("private diagnostic");
    expect(screen.getByRole("button", { name: "Request to attend" })).toBeEnabled();
    expect(mocks.refresh).not.toHaveBeenCalled();
  });

  it("shows a failed leave inside the still-open dialog", async () => {
    mocks.leaveEventAction.mockRejectedValueOnce(new Error("private diagnostic"));
    render(
      <EventParticipationControls
        {...baseProps}
        viewerAttendanceId="attendance"
        viewerAttendanceStatus="approved"
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: "Leave event" }));
    await userEvent.click(screen.getByRole("button", { name: "Confirm leave" }));
    expect(await within(screen.getByRole("alertdialog")).findByRole("alert")).toHaveTextContent(
      /couldn't confirm/i,
    );
    expect(screen.getByRole("button", { name: "Confirm leave" })).toBeEnabled();
    expect(mocks.refresh).not.toHaveBeenCalled();
  });

  it("submits one-account attendance without optimistically claiming a seat", async () => {
    let resolveAction: ((value: { ok: true; data: { message: string } }) => void) | undefined;
    mocks.requestOrJoinEventAction.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveAction = resolve;
        }),
    );
    const user = userEvent.setup();
    render(<EventParticipationControls {...baseProps} />);

    expect(screen.queryByLabelText(/guest|plus-one/i)).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Request to attend" }));
    expect(screen.getByRole("button", { name: "Saving…" })).toBeDisabled();
    expect(screen.queryByText(/place is confirmed/i)).not.toBeInTheDocument();

    resolveAction?.({ ok: true, data: { message: "Your request was sent to the event host." } });
    expect(await screen.findByRole("status")).toHaveTextContent("request was sent");
    expect(mocks.refresh).toHaveBeenCalledOnce();
    const formData = mocks.requestOrJoinEventAction.mock.calls[0]?.[0] as FormData;
    expect(formData.get("eventId")).toBe(baseProps.eventId);
  });

  it("allows a pending request at current capacity but blocks an immediate over-capacity join", () => {
    const { rerender } = render(
      <EventParticipationControls {...baseProps} remainingCapacity={0} />,
    );

    expect(screen.getByRole("button", { name: "Request to attend" })).toBeEnabled();

    rerender(
      <EventParticipationControls
        {...baseProps}
        hostKind="venue"
        remainingCapacity={0}
        requiresApproval={false}
      />,
    );
    expect(screen.getByRole("button", { name: "Event full" })).toBeDisabled();
  });

  it("lets only the current pending invite drive accept or decline actions", async () => {
    mocks.respondToEventInvitationAction.mockResolvedValue({
      ok: true,
      data: { message: "Invitation accepted and your place is confirmed." },
    });
    const user = userEvent.setup();
    render(
      <EventParticipationControls
        {...baseProps}
        viewerInvitationId="90000000-0000-4000-8000-000000000501"
        viewerInvitationStatus="pending"
      />,
    );

    await user.click(screen.getByRole("button", { name: "Accept invitation" }));
    await waitFor(() => expect(mocks.respondToEventInvitationAction).toHaveBeenCalledOnce());
    const formData = mocks.respondToEventInvitationAction.mock.calls[0]?.[0] as FormData;
    expect(formData.get("invitationId")).toBe("90000000-0000-4000-8000-000000000501");
    expect(formData.get("decision")).toBe("accept");
  });

  it("returns a declined invitee to My Huddle with a durable confirmation", async () => {
    mocks.respondToEventInvitationAction.mockResolvedValue({
      ok: true,
      data: { message: "Invitation declined." },
    });
    const user = userEvent.setup();
    render(
      <EventParticipationControls
        {...baseProps}
        viewerInvitationId="90000000-0000-4000-8000-000000000501"
        viewerInvitationStatus="pending"
      />,
    );

    await user.click(screen.getByRole("button", { name: "Decline" }));

    await waitFor(() =>
      expect(mocks.push).toHaveBeenCalledWith("/dashboard?notice=invitation-declined"),
    );
    expect(mocks.refresh).not.toHaveBeenCalled();
  });

  it("uses the accessible confirmation dialog and explains retained history before leaving", async () => {
    mocks.leaveEventAction.mockResolvedValue({
      ok: true,
      data: { message: "You left the event. Your attendance history was retained." },
    });
    const user = userEvent.setup();
    render(
      <EventParticipationControls
        {...baseProps}
        viewerAttendanceId="90000000-0000-4000-8000-000000000601"
        viewerAttendanceStatus="approved"
      />,
    );

    await user.click(screen.getByRole("button", { name: "Leave event" }));
    const dialog = screen.getByRole("alertdialog");
    expect(dialog).toHaveTextContent("attendance row remains");
    expect(within(dialog).getByRole("button", { name: "Stay" })).toHaveFocus();
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Leave event" }));
    await user.click(
      within(screen.getByRole("alertdialog")).getByRole("button", { name: "Confirm leave" }),
    );
    await waitFor(() => expect(mocks.leaveEventAction).toHaveBeenCalledOnce());
  });
});

describe("attendance repair regressions", () => {
  beforeEach(() => vi.resetAllMocks());

  it("does not send an anonymous viewer to sign in for a full instant event", () => {
    const props = {
      ...baseProps,
      hostKind: "venue" as const,
      viewerIsAuthenticated: false,
      remainingCapacity: 0,
    };
    const { rerender } = render(<EventParticipationControls {...props} requiresApproval={false} />);
    expect(screen.getByRole("button", { name: "Event full" })).toBeDisabled();
    expect(screen.queryByRole("link", { name: "Sign in to join" })).not.toBeInTheDocument();
    rerender(<EventParticipationControls {...props} requiresApproval />);
    expect(screen.getByRole("link", { name: "Sign in to join" })).toBeVisible();
  });

  it("guards same-tick and post-success acceptance until refreshed participation permits leaving", async () => {
    let finish!: (value: { ok: true; data: { message: string } }) => void;
    mocks.respondToEventInvitationAction.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    mocks.leaveEventAction.mockResolvedValue({ ok: true, data: { message: "Left event." } });
    const props = {
      ...baseProps,
      viewerInvitationId: "invitation",
      viewerInvitationStatus: "pending" as const,
    };
    const { rerender } = render(<EventParticipationControls {...props} />);
    const accept = screen.getByRole("button", { name: "Accept invitation" });
    act(() => {
      fireEvent.click(accept);
      fireEvent.click(accept);
    });
    await waitFor(() => expect(mocks.respondToEventInvitationAction).toHaveBeenCalledOnce());
    await act(async () => {
      finish({ ok: true, data: { message: "Accepted." } });
    });
    await screen.findByRole("status");
    fireEvent.click(accept);
    expect(mocks.respondToEventInvitationAction).toHaveBeenCalledOnce();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    rerender(<EventParticipationControls {...props} remainingCapacity={1} />);
    fireEvent.click(accept);
    expect(mocks.respondToEventInvitationAction).toHaveBeenCalledOnce();
    rerender(
      <EventParticipationControls
        {...props}
        viewerInvitationStatus="accepted"
        viewerAttendanceId="attendance"
        viewerAttendanceStatus="approved"
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: "Leave event" }));
    await userEvent.click(screen.getByRole("button", { name: "Confirm leave" }));
    await waitFor(() => expect(mocks.leaveEventAction).toHaveBeenCalledOnce());
    rerender(
      <EventParticipationControls
        {...props}
        viewerInvitationStatus="accepted"
        viewerAttendanceId="attendance"
        viewerAttendanceStatus="left"
      />,
    );
    expect(screen.getByRole("button", { name: "Request to attend" })).toBeEnabled();
  });

  it.each(["transport", "domain"])(
    "allows invitation retry after a %s failure",
    async (failure) => {
      if (failure === "transport")
        mocks.respondToEventInvitationAction.mockRejectedValueOnce(new Error("network"));
      else
        mocks.respondToEventInvitationAction.mockResolvedValueOnce({
          ok: false,
          error: { code: "EVENT_FULL", message: "Event full." },
        });
      mocks.respondToEventInvitationAction.mockResolvedValueOnce({
        ok: true,
        data: { message: "Accepted." },
      });
      render(
        <EventParticipationControls
          {...baseProps}
          viewerInvitationId="invitation"
          viewerInvitationStatus="pending"
        />,
      );
      await userEvent.click(screen.getByRole("button", { name: "Accept invitation" }));
      await screen.findByRole("alert");
      await userEvent.click(screen.getByRole("button", { name: "Accept invitation" }));
      expect(await screen.findByRole("status")).toHaveTextContent("Accepted.");
      expect(mocks.respondToEventInvitationAction).toHaveBeenCalledTimes(2);
    },
  );

  it("links a profile-incomplete RSVP rejection directly to Fan setup", async () => {
    mocks.requestOrJoinEventAction.mockResolvedValueOnce({
      ok: false,
      error: { code: "PROFILE_INCOMPLETE", message: "Complete your profile." },
    });
    render(<EventParticipationControls {...baseProps} />);
    await userEvent.click(screen.getByRole("button", { name: "Request to attend" }));
    expect(await screen.findByRole("link", { name: "Enable Fan workspace" })).toHaveAttribute(
      "href",
      "/onboarding/fan",
    );
    expect(mocks.refresh).not.toHaveBeenCalled();
  });
});

it("releases a successful invitation guard after an intervening authoritative state change", async () => {
  mocks.respondToEventInvitationAction
    .mockReset()
    .mockResolvedValue({ ok: true, data: { message: "Accepted." } });
  const props = {
    ...baseProps,
    viewerInvitationId: "reused-invitation",
    viewerInvitationStatus: "pending" as const,
  };
  const { rerender } = render(<EventParticipationControls {...props} />);
  await userEvent.click(screen.getByRole("button", { name: "Accept invitation" }));
  await screen.findByRole("status");
  rerender(<EventParticipationControls {...props} viewerInvitationStatus="revoked" />);
  rerender(<EventParticipationControls {...props} />);
  expect(screen.getByRole("button", { name: "Accept invitation" })).toBeEnabled();
  await userEvent.click(screen.getByRole("button", { name: "Accept invitation" }));
  await waitFor(() => expect(mocks.respondToEventInvitationAction).toHaveBeenCalledTimes(2));
});

it("reconciles authoritative props that arrive before the action response", async () => {
  let finish!: (value: { ok: true; data: { message: string } }) => void;
  mocks.respondToEventInvitationAction
    .mockReset()
    .mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    )
    .mockResolvedValueOnce({ ok: true, data: { message: "Accepted again." } });
  const props = {
    ...baseProps,
    viewerInvitationId: "reused-invitation",
    viewerInvitationStatus: "pending" as const,
  };
  const { rerender } = render(<EventParticipationControls {...props} />);
  await userEvent.click(screen.getByRole("button", { name: "Accept invitation" }));
  rerender(<EventParticipationControls {...props} viewerInvitationStatus="revoked" />);
  await act(async () => {
    finish({ ok: true, data: { message: "Accepted." } });
  });
  await waitFor(() => expect(mocks.respondToEventInvitationAction).toHaveBeenCalledOnce());
  rerender(<EventParticipationControls {...props} />);
  expect(screen.getByRole("button", { name: "Accept invitation" })).toBeEnabled();
  await userEvent.click(screen.getByRole("button", { name: "Accept invitation" }));
  await waitFor(() => expect(mocks.respondToEventInvitationAction).toHaveBeenCalledTimes(2));
});

describe("attendance acknowledgement refresh", () => {
  beforeEach(() => vi.resetAllMocks());

  it.each([
    ["request", "requested", "Your request was sent to the event host."],
    ["join", "approved", "Your place is confirmed."],
    ["accept", "approved", "Invitation accepted and your place is confirmed."],
  ] as const)(
    "preserves %s acknowledgement through fast authoritative refresh and clears superseded feedback",
    async (intent, attendanceStatus, message) => {
      const props = {
        ...baseProps,
        hostKind: intent === "join" ? ("venue" as const) : ("person" as const),
        requiresApproval: intent !== "join",
        viewerInvitationId: intent === "accept" ? "invitation" : null,
        viewerInvitationStatus: intent === "accept" ? ("pending" as const) : null,
      };
      const action =
        intent === "accept" ? mocks.respondToEventInvitationAction : mocks.requestOrJoinEventAction;
      action.mockResolvedValue({ ok: true, data: { message } });
      const { rerender } = render(<EventParticipationControls {...props} />);
      await userEvent.click(
        screen.getByRole("button", {
          name:
            intent === "request"
              ? "Request to attend"
              : intent === "join"
                ? "Join event"
                : "Accept invitation",
        }),
      );
      await screen.findByRole("status");
      const refreshed = {
        ...props,
        viewerAttendanceId: "attendance",
        viewerAttendanceStatus: attendanceStatus,
        viewerInvitationStatus: intent === "accept" ? ("accepted" as const) : null,
      };
      rerender(<EventParticipationControls {...refreshed} />);
      expect(screen.getByRole("status")).toHaveTextContent(message);
      expect(
        screen.getByRole("button", {
          name: intent === "request" ? "Withdraw request" : "Leave event",
        }),
      ).toBeEnabled();
      rerender(<EventParticipationControls {...refreshed} remainingCapacity={0} />);
      expect(screen.getByRole("status")).toHaveTextContent(message);
      rerender(<EventParticipationControls {...refreshed} viewerAttendanceStatus="removed" />);
      expect(screen.queryByRole("status")).not.toBeInTheDocument();
      expect(screen.getByText("This attendance response is closed.")).toBeVisible();
    },
  );

  it("keeps fast-refresh success readable until the next attempted action replaces it", async () => {
    mocks.requestOrJoinEventAction.mockResolvedValue({
      ok: true,
      data: { message: "Your place is confirmed." },
    });
    mocks.leaveEventAction.mockRejectedValueOnce(new Error("network"));
    const props = { ...baseProps, hostKind: "venue" as const, requiresApproval: false };
    const { rerender } = render(<EventParticipationControls {...props} />);
    await userEvent.click(screen.getByRole("button", { name: "Join event" }));
    await screen.findByRole("status");
    rerender(
      <EventParticipationControls
        {...props}
        viewerAttendanceId="attendance"
        viewerAttendanceStatus="approved"
      />,
    );
    expect(screen.getByRole("status")).toHaveTextContent("Your place is confirmed.");
    await userEvent.click(screen.getByRole("button", { name: "Leave event" }));
    await userEvent.click(screen.getByRole("button", { name: "Confirm leave" }));
    expect(await within(screen.getByRole("alertdialog")).findByRole("alert")).toHaveTextContent(
      /couldn't confirm/i,
    );
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Confirm leave" })).toBeEnabled();
  });
});

it("permits a later invitation after preserving the first accepted-state acknowledgement", async () => {
  mocks.respondToEventInvitationAction
    .mockReset()
    .mockResolvedValue({ ok: true, data: { message: "Accepted." } });
  const props = {
    ...baseProps,
    viewerInvitationId: "invitation",
    viewerInvitationStatus: "pending" as const,
    viewerAttendanceId: "attendance",
    viewerAttendanceStatus: "left" as const,
  };
  const { rerender } = render(<EventParticipationControls {...props} />);
  await userEvent.click(screen.getByRole("button", { name: "Accept invitation" }));
  await screen.findByRole("status");
  rerender(
    <EventParticipationControls
      {...props}
      viewerInvitationStatus="accepted"
      viewerAttendanceStatus="approved"
    />,
  );
  expect(screen.getByRole("status")).toHaveTextContent("Accepted.");
  rerender(<EventParticipationControls {...props} />);
  await waitFor(() =>
    expect(screen.getByRole("button", { name: "Accept invitation" })).toBeEnabled(),
  );
  expect(screen.queryByRole("status")).not.toBeInTheDocument();
  await userEvent.click(screen.getByRole("button", { name: "Accept invitation" }));
  await waitFor(() => expect(mocks.respondToEventInvitationAction).toHaveBeenCalledTimes(2));
});
