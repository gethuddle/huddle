// @vitest-environment jsdom

import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { EventInvitationPicker } from "./event-invitation-picker";

const mocks = vi.hoisted(() => ({ createEventInvitationsAction: vi.fn(), refresh: vi.fn() }));

vi.mock("@/features/attendance/actions", () => ({
  createEventInvitationsAction: mocks.createEventInvitationsAction,
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: mocks.refresh }) }));

const eventId = "90000000-0000-4000-8000-000000000401";
const candidates = [
  {
    id: "90000000-0000-4000-8000-000000000101",
    handle: "maya_haifa",
    displayName: "Maya Haifa",
    context: "Friend",
    eligible: true,
    ineligibilityReason: null,
  },
  {
    id: "90000000-0000-4000-8000-000000000102",
    handle: "noam_group",
    displayName: "Noam Group",
    context: "Shared group",
    eligible: true,
    ineligibilityReason: null,
  },
  {
    id: "90000000-0000-4000-8000-000000000103",
    handle: "already_invited",
    displayName: "Already Invited",
    context: "Recent attendee",
    eligible: false,
    ineligibilityReason: "Already invited",
  },
] as const;

describe("EventInvitationPicker", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.createEventInvitationsAction.mockResolvedValue({
      ok: true,
      data: {
        message: "2 invitations sent.",
        invitedIds: candidates.slice(0, 2).map((item) => item.id),
        rejectedIds: [],
      },
    });
  });

  it("searches eligible people inline, explains exclusions, and bounds selection to open places", async () => {
    const user = userEvent.setup();
    render(
      <EventInvitationPicker candidates={candidates} eventId={eventId} remainingCapacity={1} />,
    );

    await user.click(screen.getByRole("button", { name: "Invite people" }));
    expect(screen.getByText("You can select 1 person for the remaining place.")).toBeVisible();
    expect(screen.getByText("Already invited")).toBeVisible();

    await user.type(screen.getByRole("searchbox", { name: "Search eligible people" }), "maya");
    const maya = screen.getByRole("checkbox", { name: /Maya Haifa/ });
    await user.click(maya);
    expect(screen.getByRole("button", { name: "Invite 1 person" })).toBeEnabled();

    await user.clear(screen.getByRole("searchbox", { name: "Search eligible people" }));
    expect(screen.getByRole("checkbox", { name: /Noam Group/ })).toBeDisabled();
  });

  it("submits selected user IDs once, awaits the authoritative result, and refreshes", async () => {
    const user = userEvent.setup();
    render(
      <EventInvitationPicker candidates={candidates} eventId={eventId} remainingCapacity={2} />,
    );
    await user.click(screen.getByRole("button", { name: "Invite people" }));
    await user.click(screen.getByRole("checkbox", { name: /Maya Haifa/ }));
    await user.click(screen.getByRole("checkbox", { name: /Noam Group/ }));
    await user.click(screen.getByRole("button", { name: "Invite 2 people" }));

    await waitFor(() =>
      expect(mocks.createEventInvitationsAction).toHaveBeenCalledWith({
        eventId,
        inviteeIds: [candidates[0].id, candidates[1].id],
      }),
    );
    expect(mocks.createEventInvitationsAction).toHaveBeenCalledOnce();
    expect(mocks.refresh).toHaveBeenCalledOnce();
    expect(
      screen.getByText(/They'll see it in Home and My Huddle and can accept or decline/i),
    ).toBeVisible();
  });
});
