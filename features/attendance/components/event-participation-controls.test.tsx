// @vitest-environment jsdom

import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  leaveEventAction: vi.fn(),
  requestOrJoinEventAction: vi.fn(),
  respondToEventInvitationAction: vi.fn(),
  refresh: vi.fn(),
}));

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: mocks.refresh }) }));
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
