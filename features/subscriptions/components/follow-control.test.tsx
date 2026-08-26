// @vitest-environment jsdom

import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { FollowControl } from "./follow-control";

const mocks = vi.hoisted(() => ({ setSubscriptionPreferenceAction: vi.fn() }));

vi.mock("@/features/subscriptions/actions", () => ({
  setSubscriptionPreferenceAction: mocks.setSubscriptionPreferenceAction,
}));

describe("FollowControl", () => {
  beforeEach(() => vi.clearAllMocks());

  it("follows and unfollows without a reload", async () => {
    mocks.setSubscriptionPreferenceAction
      .mockResolvedValueOnce({
        ok: true,
        data: {
          message: "Follow added.",
          intent: "follow",
          kind: "team",
          targetId: "10000000-0000-4000-8000-000000000001",
        },
      })
      .mockResolvedValueOnce({
        ok: true,
        data: {
          message: "Follow removed.",
          intent: "unfollow",
          kind: "team",
          targetId: "10000000-0000-4000-8000-000000000001",
        },
      });
    const user = userEvent.setup();

    render(
      <FollowControl
        initiallyFollowing={false}
        kind="team"
        targetId="10000000-0000-4000-8000-000000000001"
        targetName="Arsenal"
      />,
    );

    await user.click(screen.getByRole("button", { name: "Follow Arsenal" }));
    await waitFor(() => expect(mocks.setSubscriptionPreferenceAction).toHaveBeenCalledOnce());
    expect(await screen.findByRole("button", { name: "Unfollow Arsenal" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByRole("status")).toHaveTextContent("Follow added.");

    await user.click(screen.getByRole("button", { name: "Unfollow Arsenal" }));
    expect(await screen.findByRole("button", { name: "Follow Arsenal" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
    expect(screen.getByRole("status")).toHaveTextContent("Follow removed.");
  });

  it("keeps the prior state and renders a safe action error", async () => {
    mocks.setSubscriptionPreferenceAction.mockResolvedValue({
      ok: false,
      error: { code: "INTERNAL_ERROR", message: "Something went wrong. Try again." },
    });
    const user = userEvent.setup();

    render(
      <FollowControl
        initiallyFollowing
        kind="competition"
        targetId="10000000-0000-4000-8000-000000000001"
        targetName="Premier League"
      />,
    );

    await user.click(screen.getByRole("button", { name: "Unfollow Premier League" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Something went wrong");
    expect(screen.getByRole("button", { name: "Unfollow Premier League" })).toBeVisible();
  });

  it("keeps a newly followed target selected when the next unfollow fails", async () => {
    mocks.setSubscriptionPreferenceAction
      .mockResolvedValueOnce({
        ok: true,
        data: {
          message: "Follow added.",
          intent: "follow",
          kind: "team",
          targetId: "10000000-0000-4000-8000-000000000001",
        },
      })
      .mockResolvedValueOnce({
        ok: false,
        error: { code: "INTERNAL_ERROR", message: "Something went wrong. Try again." },
      });
    const user = userEvent.setup();

    render(
      <FollowControl
        initiallyFollowing={false}
        kind="team"
        targetId="10000000-0000-4000-8000-000000000001"
        targetName="Arsenal"
      />,
    );

    await user.click(screen.getByRole("button", { name: "Follow Arsenal" }));
    await user.click(await screen.findByRole("button", { name: "Unfollow Arsenal" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Something went wrong");
    expect(screen.getByRole("button", { name: "Unfollow Arsenal" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  it("shows a pending state while the server action is unsettled", async () => {
    mocks.setSubscriptionPreferenceAction.mockImplementation(() => new Promise(() => undefined));
    const user = userEvent.setup();

    render(
      <FollowControl
        initiallyFollowing={false}
        kind="sport"
        targetId="10000000-0000-4000-8000-000000000001"
        targetName="Football"
      />,
    );

    await user.click(screen.getByRole("button", { name: "Follow Football" }));

    expect(screen.getByRole("button", { name: "Follow Football" })).toBeDisabled();
    expect(screen.getByText("Updating…")).toBeVisible();
  });
});
