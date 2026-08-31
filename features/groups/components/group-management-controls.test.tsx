// @vitest-environment jsdom

import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  banGroupMemberAction: vi.fn(),
  changeGroupRoleAction: vi.fn(),
  createGroupInviteAction: vi.fn(),
  createGroupRuleAction: vi.fn(),
  reorderGroupRulesAction: vi.fn(),
  reviewGroupApplicationAction: vi.fn(),
  revokeGroupInviteAction: vi.fn(),
  reviewGroupEventAction: vi.fn(),
  unbanGroupMemberAction: vi.fn(),
  updateGroupRuleAction: vi.fn(),
  withdrawGroupEventAction: vi.fn(),
}));

vi.mock("@/features/groups/membership-actions", () => mocks);

import {
  BanMemberControl,
  EventReviewControl,
  InviteRevocationControl,
} from "./group-management-controls";

const group = {
  groupId: "52000000-0000-4000-8000-000000000201",
  groupSlug: "haifa-group",
};

describe("destructive group management confirmations", () => {
  beforeEach(() => vi.clearAllMocks());

  it("submits invitation revocation only after deliberate confirmation", async () => {
    mocks.revokeGroupInviteAction.mockResolvedValue({
      ok: true,
      data: { message: "Invitation revoked. Its history was retained." },
    });
    const user = userEvent.setup();
    render(<InviteRevocationControl {...group} inviteId="52000000-0000-4000-8000-000000000301" />);

    await user.click(screen.getByRole("button", { name: "Revoke" }));
    expect(screen.getByRole("alertdialog")).toHaveTextContent("stop working immediately");
    expect(mocks.revokeGroupInviteAction).not.toHaveBeenCalled();

    await user.click(
      within(screen.getByRole("alertdialog")).getByRole("button", { name: "Revoke" }),
    );

    await waitFor(() => expect(mocks.revokeGroupInviteAction).toHaveBeenCalledOnce());
    const formData = mocks.revokeGroupInviteAction.mock.calls[0]?.[1] as FormData;
    expect(formData.get("inviteId")).toBe("52000000-0000-4000-8000-000000000301");
    expect(await screen.findByRole("status")).toHaveTextContent("Invitation revoked");
  });

  it("requires a bounded internal reason before submitting a ban", async () => {
    mocks.banGroupMemberAction.mockResolvedValue({
      ok: true,
      data: { message: "Member banned and protected access removed." },
    });
    const user = userEvent.setup();
    render(
      <BanMemberControl
        {...group}
        targetLabel="@fan_two"
        userId="52000000-0000-4000-8000-000000000202"
      />,
    );

    await user.click(screen.getByRole("button", { name: "Ban" }));
    await user.type(screen.getByRole("textbox", { name: "Internal reason" }), "Repeated abuse");
    await user.click(screen.getByRole("button", { name: "Confirm ban" }));

    await waitFor(() => expect(mocks.banGroupMemberAction).toHaveBeenCalledOnce());
    const formData = mocks.banGroupMemberAction.mock.calls[0]?.[1] as FormData;
    expect(formData.get("reason")).toBe("Repeated abuse");
    expect(formData.get("userId")).toBe("52000000-0000-4000-8000-000000000202");
  });

  it("keeps group-event rejection behind an explicit alert-dialog confirmation", async () => {
    mocks.reviewGroupEventAction.mockResolvedValue({
      ok: true,
      data: { message: "Group event rejected and closed." },
    });
    const user = userEvent.setup();
    render(
      <EventReviewControl
        {...group}
        eventId="52000000-0000-4000-8000-000000000203"
        eventTitle="North London watch"
      />,
    );

    await user.click(screen.getByRole("button", { name: "Reject" }));
    expect(screen.getByRole("alertdialog")).toHaveTextContent("terminal cancelled state");
    expect(mocks.reviewGroupEventAction).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Reject event" }));

    await waitFor(() => expect(mocks.reviewGroupEventAction).toHaveBeenCalledOnce());
    const formData = mocks.reviewGroupEventAction.mock.calls[0]?.[1] as FormData;
    expect(formData.get("eventId")).toBe("52000000-0000-4000-8000-000000000203");
    expect(formData.get("decision")).toBe("reject");
  });

  it("shows withdrawal instead of forbidden self-review to the submitter", async () => {
    mocks.withdrawGroupEventAction.mockResolvedValue({
      ok: true,
      data: { message: "Event submission withdrawn." },
    });
    const user = userEvent.setup();
    render(
      <EventReviewControl
        {...group}
        canReview={false}
        canWithdraw
        eventId="52000000-0000-4000-8000-000000000203"
        eventTitle="North London watch"
      />,
    );

    expect(screen.getByText(/cannot review your own submission/i)).toBeVisible();
    expect(screen.queryByRole("button", { name: "Reject" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Withdraw submission" }));
    await user.click(screen.getByRole("button", { name: "Withdraw event" }));
    await waitFor(() => expect(mocks.withdrawGroupEventAction).toHaveBeenCalledOnce());
  });
});
