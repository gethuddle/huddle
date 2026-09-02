// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ hasValidRecoveryGrant: vi.fn() }));

vi.mock("@/features/auth/recovery-session", () => ({
  hasValidRecoveryGrant: mocks.hasValidRecoveryGrant,
}));
vi.mock("@/features/auth/actions", () => ({
  cancelRecoveryAction: vi.fn(),
  updatePasswordAction: vi.fn(),
}));

import ResetPasswordPage from "./page";

describe("reset-password page", () => {
  beforeEach(() => vi.clearAllMocks());

  it("renders the update form only with a session-bound recovery grant", async () => {
    mocks.hasValidRecoveryGrant.mockResolvedValue(true);

    render(await ResetPasswordPage());

    expect(screen.getByRole("heading", { name: "Choose a new password" })).toBeVisible();
    expect(screen.getByText("Use 15–72 characters.")).toBeVisible();
    expect(screen.getByRole("button", { name: "Cancel reset and sign in" })).toBeVisible();
  });

  it("fails closed for an ordinary signed-in session without a recovery grant", async () => {
    mocks.hasValidRecoveryGrant.mockResolvedValue(false);

    render(await ResetPasswordPage());

    expect(screen.getByRole("alert")).toHaveTextContent("reset session is no longer available");
    expect(screen.getByRole("link", { name: "Request another reset link" })).toHaveAttribute(
      "href",
      "/auth/forgot-password",
    );
    expect(screen.queryByLabelText("New password")).not.toBeInTheDocument();
  });
});
