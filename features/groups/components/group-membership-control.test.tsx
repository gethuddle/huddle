// @vitest-environment jsdom

import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ leaveGroupAction: vi.fn() }));

vi.mock("@/features/groups/membership-actions", () => mocks);

import { GroupMembershipControl } from "./group-membership-control";

describe("GroupMembershipControl", () => {
  beforeEach(() => vi.clearAllMocks());

  it("explains retained history and submits leave only after confirmation", async () => {
    mocks.leaveGroupAction.mockResolvedValue({
      ok: true,
      data: { message: "You left the group. Your membership history was retained." },
    });
    const user = userEvent.setup();
    render(
      <GroupMembershipControl
        groupId="52000000-0000-4000-8000-000000000201"
        groupSlug="haifa-group"
      />,
    );

    await user.click(screen.getByRole("button", { name: "Leave group" }));
    expect(screen.getByRole("alertdialog")).toHaveTextContent("membership history remain retained");
    expect(mocks.leaveGroupAction).not.toHaveBeenCalled();

    await user.click(
      within(screen.getByRole("alertdialog")).getByRole("button", { name: "Leave group" }),
    );

    await waitFor(() => expect(mocks.leaveGroupAction).toHaveBeenCalledOnce());
    const formData = mocks.leaveGroupAction.mock.calls[0]?.[1] as FormData;
    expect(formData.get("groupSlug")).toBe("haifa-group");
    expect(await screen.findByRole("status")).toHaveTextContent("history was retained");
  });
});
