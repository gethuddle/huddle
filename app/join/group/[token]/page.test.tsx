// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getGroupInvitePreview: vi.fn(),
}));

vi.mock("@/features/groups/invites", () => ({
  getGroupInvitePreview: mocks.getGroupInvitePreview,
}));

import GroupInvitePage from "./page";

const token = "A".repeat(43);

describe("GroupInvitePage", () => {
  beforeEach(() => vi.clearAllMocks());

  it("uses one generic unavailable state without exposing the cause", async () => {
    mocks.getGroupInvitePreview.mockResolvedValue({ state: "unavailable" });

    render(await GroupInvitePage({ params: Promise.resolve({ token }) }));

    expect(screen.getByRole("heading", { name: "This invitation cannot be used." })).toBeVisible();
    expect(screen.getByText(/invalid, expired, revoked, exhausted/)).toBeVisible();
    expect(document.body).not.toHaveTextContent(token);
  });

  it("makes clear that a valid invite still creates only a reviewed application", async () => {
    mocks.getGroupInvitePreview.mockResolvedValue({
      state: "available",
      group: {
        id: "52000000-0000-4000-8000-000000000201",
        slug: "unlisted-group",
        name: "Unlisted Group",
      },
      membershipStatus: null,
    });

    render(await GroupInvitePage({ params: Promise.resolve({ token }) }));

    expect(screen.getByRole("heading", { name: "Unlisted Group" })).toBeVisible();
    expect(screen.getByText("Administrator review required")).toBeVisible();
    expect(screen.getByRole("button", { name: "Request to join" })).toBeVisible();
    expect(screen.getByText(/never bypasses administrator review/)).toBeVisible();
  });

  it("does not consume another use for an already active member", async () => {
    mocks.getGroupInvitePreview.mockResolvedValue({
      state: "available",
      group: {
        id: "52000000-0000-4000-8000-000000000201",
        slug: "unlisted-group",
        name: "Unlisted Group",
      },
      membershipStatus: "active",
    });

    render(await GroupInvitePage({ params: Promise.resolve({ token }) }));

    expect(
      screen.getByRole("heading", { name: "You are already an active member." }),
    ).toBeVisible();
    expect(screen.getByRole("link", { name: "Open group" })).toHaveAttribute(
      "href",
      "/groups/unlisted-group",
    );
    expect(screen.queryByRole("button", { name: "Request to join" })).not.toBeInTheDocument();
  });
});
