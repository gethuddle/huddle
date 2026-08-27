// @vitest-environment jsdom

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { PrivateEventForm } from "./private-event-form";

const mocks = vi.hoisted(() => ({ savePrivateEventAction: vi.fn() }));

vi.mock("@/features/events/actions", () => ({
  savePrivateEventAction: mocks.savePrivateEventAction,
}));

const matchId = "60000000-0000-4000-8000-000000000101";
const groupId = "60000000-0000-4000-8000-000000000102";
const catalog = {
  cities: [{ id: "60000000-0000-4000-8000-000000000103", name: "Haifa" }],
  matches: [
    {
      id: matchId,
      label: "Arsenal FC vs Chelsea FC — Premier League",
      startsAt: "2026-09-01T17:00:00Z",
    },
  ],
  groups: [{ id: groupId, slug: "haifa-fans", name: "Haifa Fans", lifecycle: "active" }],
  acceptedFriendCount: 2,
} as const;

describe("PrivateEventForm", () => {
  beforeEach(() => vi.clearAllMocks());

  it("shows only private-person audiences and the protected home contract", () => {
    render(<PrivateEventForm catalog={catalog} initialMatchId={matchId} />);

    expect(screen.getByRole("radio", { name: /Invite only/ })).toBeChecked();
    expect(screen.getByRole("radio", { name: /Friends/ })).toBeVisible();
    expect(screen.getByRole("radio", { name: /Supporter group/ })).toBeVisible();
    expect(screen.queryByRole("radio", { name: /^Public$/i })).not.toBeInTheDocument();
    expect(screen.getByText(/Hard home maximum: 12 registered accounts/i)).toBeVisible();
    expect(screen.getByText(/No plus-ones/i)).toBeVisible();
    expect(screen.getByText(/saving this does not expose it/i)).toBeVisible();
  });

  it("switches between protected-home and public-place fields", async () => {
    const user = userEvent.setup();
    render(<PrivateEventForm catalog={catalog} />);

    expect(screen.getByRole("textbox", { name: "Exact home address" })).toBeVisible();
    await user.click(screen.getByRole("radio", { name: /Public place/ }));
    expect(screen.getByRole("textbox", { name: "Place name" })).toBeVisible();
    expect(screen.getByRole("textbox", { name: "Public address" })).toBeVisible();
    expect(screen.queryByRole("textbox", { name: "Exact home address" })).not.toBeInTheDocument();
  });

  it("submits a group event for review and links only to the safe summary", async () => {
    mocks.savePrivateEventAction.mockResolvedValue({
      ok: true,
      data: {
        message: "Event submitted to its organizing group for review.",
        event: {
          id: "60000000-0000-4000-8000-000000000104",
          status: "pending_group_review",
        },
      },
    });
    const user = userEvent.setup();
    render(<PrivateEventForm catalog={catalog} initialMatchId={matchId} />);

    await user.click(screen.getByRole("radio", { name: /Supporter group/ }));
    await user.selectOptions(screen.getByRole("combobox", { name: "Audience group" }), groupId);
    const submitButton = screen.getByRole("button", { name: "Submit for group review" });
    const form = submitButton.closest("form");
    expect(form).not.toBeNull();
    fireEvent.submit(form!);

    await waitFor(() => expect(mocks.savePrivateEventAction).toHaveBeenCalledOnce());
    expect(await screen.findByText(/submitted to its organizing group/i)).toBeVisible();
    expect(screen.getByRole("link", { name: "Open safe event summary" })).toHaveAttribute(
      "href",
      "/events/60000000-0000-4000-8000-000000000104",
    );
    expect(document.body.textContent).not.toContain("12 Private Street");
  });

  it("keeps the organizing group separate from an invite-only audience", async () => {
    mocks.savePrivateEventAction.mockResolvedValue({
      ok: true,
      data: {
        message: "Event submitted to its organizing group for review.",
        event: {
          id: "60000000-0000-4000-8000-000000000105",
          status: "pending_group_review",
        },
      },
    });
    const user = userEvent.setup();
    render(<PrivateEventForm catalog={catalog} initialMatchId={matchId} />);

    expect(screen.getByRole("radio", { name: /Invite only/ })).toBeChecked();
    expect(screen.queryByRole("combobox", { name: "Audience group" })).not.toBeInTheDocument();
    await user.selectOptions(
      screen.getByRole("combobox", { name: "Organizing group (optional)" }),
      groupId,
    );
    expect(screen.getByRole("button", { name: "Submit for group review" })).toBeVisible();
    expect(screen.getByText(/does not change who may see or attend/i)).toBeVisible();
  });
});
