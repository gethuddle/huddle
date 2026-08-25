// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { ProfileCommunityControl } from "./profile-community-control";

vi.mock("@/features/safety/components/block-control", () => ({
  BlockControl: ({ targetHandle }: Readonly<{ targetHandle: string }>) => (
    <button type="button">Block @{targetHandle}</button>
  ),
}));

describe("ProfileCommunityControl", () => {
  it.each([
    ["anonymous", "Sign in", "/auth/sign-in"],
    ["complete-profile", "Complete profile", "/settings/profile"],
    ["self", "Edit profile", "/settings/profile"],
  ] as const)("renders the %s permission state", (viewerState, action, href) => {
    render(
      <ProfileCommunityControl
        targetHandle="fan_two"
        viewerHasBlocked={false}
        viewerState={viewerState}
      />,
    );

    expect(screen.getByRole("link", { name: action })).toHaveAttribute("href", href);
  });

  it("renders a not-permitted outcome without an action", () => {
    render(
      <ProfileCommunityControl
        targetHandle="fan_two"
        viewerHasBlocked={false}
        viewerState="not-permitted"
      />,
    );

    expect(screen.getByText("Community controls are not permitted.")).toBeVisible();
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });

  it("renders a safety control only for an eligible other user", () => {
    render(
      <ProfileCommunityControl
        targetHandle="fan_two"
        viewerHasBlocked={false}
        viewerState="eligible"
      />,
    );

    expect(screen.getByRole("button", { name: "Block @fan_two" })).toBeVisible();
  });
});
