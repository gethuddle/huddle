// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import ForgotPasswordPage from "./page";

describe("forgot-password page", () => {
  it("renders the public reset-request form and a route back to sign in", async () => {
    render(await ForgotPasswordPage({ searchParams: Promise.resolve({}) }));

    expect(screen.getByRole("heading", { name: "Reset your password" })).toBeVisible();
    expect(screen.getByRole("textbox", { name: "Email address" })).toBeVisible();
    expect(screen.getByRole("link", { name: "Back to sign in" })).toHaveAttribute(
      "href",
      "/auth/sign-in",
    );
  });

  it("shows one generic expired-link message for the controlled status", async () => {
    render(
      await ForgotPasswordPage({
        searchParams: Promise.resolve({ status: "expired" }),
      }),
    );

    expect(screen.getByRole("alert")).toHaveTextContent(
      "That reset link is invalid, expired, or has already been used.",
    );
  });

  it("does not render unknown status details", async () => {
    render(
      await ForgotPasswordPage({
        searchParams: Promise.resolve({ status: "provider-secret" }),
      }),
    );

    expect(screen.queryByText(/provider-secret/i)).not.toBeInTheDocument();
  });
});
