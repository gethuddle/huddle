// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
  getUser: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.createClient }));

import ResetPasswordPage from "./page";

describe("reset-password page", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.createClient.mockResolvedValue({ auth: { getUser: mocks.getUser } });
  });

  it("renders the update form only for an authenticated recovery session", async () => {
    mocks.getUser.mockResolvedValue({
      data: { user: { id: "recovering-user" } },
      error: null,
    });

    render(await ResetPasswordPage());

    expect(screen.getByRole("heading", { name: "Choose a new password" })).toBeVisible();
    expect(screen.getByLabelText("New password")).toBeVisible();
    expect(screen.getByLabelText("Confirm new password")).toBeVisible();
  });

  it("fails closed to a fresh-link action without an authenticated session", async () => {
    mocks.getUser.mockResolvedValue({ data: { user: null }, error: null });

    render(await ResetPasswordPage());

    expect(screen.getByRole("alert")).toHaveTextContent("reset session is no longer available");
    expect(screen.getByRole("link", { name: "Request another reset link" })).toHaveAttribute(
      "href",
      "/auth/forgot-password",
    );
    expect(screen.queryByLabelText("New password")).not.toBeInTheDocument();
  });
});
