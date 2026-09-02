// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import SignInPage from "./page";

describe("sign-in page", () => {
  it("offers the password-recovery flow next to the password field", async () => {
    render(await SignInPage({ searchParams: Promise.resolve({}) }));

    expect(screen.getByRole("link", { name: "Forgot password?" })).toHaveAttribute(
      "href",
      "/auth/forgot-password",
    );
  });

  it("shows a safe confirmation after a completed password reset", async () => {
    render(
      await SignInPage({
        searchParams: Promise.resolve({ reset: "success" }),
      }),
    );

    expect(screen.getByRole("status")).toHaveTextContent(
      "Password updated. Sign in with your new password.",
    );
  });

  it("ignores unknown reset status values", async () => {
    render(
      await SignInPage({
        searchParams: Promise.resolve({ reset: "private-provider-detail" }),
      }),
    );

    expect(screen.queryByText(/private-provider-detail/i)).not.toBeInTheDocument();
  });
});
