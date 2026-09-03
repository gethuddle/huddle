// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import VerifyPage from "./page";

describe("verification result page", () => {
  it("does not trust a forged successful verification query", async () => {
    render(await VerifyPage({ searchParams: Promise.resolve({ status: "success" }) }));

    expect(screen.getByRole("heading", { name: "Verify your email." })).toBeVisible();
    expect(screen.queryByText(/secure session is active/i)).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Go to sign in" })).toHaveAttribute(
      "href",
      "/auth/sign-in",
    );
  });

  it("renders a safe expired state for invalid status input", async () => {
    render(await VerifyPage({ searchParams: Promise.resolve({ status: "expired" }) }));

    expect(screen.getByRole("alert")).toHaveTextContent(
      "invalid, expired, or has already been used",
    );
    expect(screen.getByRole("link", { name: "Request another email" })).toHaveAttribute(
      "href",
      "/auth/sign-up",
    );
    expect(screen.getByRole("link", { name: "Sign in" })).toHaveAttribute("href", "/auth/sign-in");
  });

  it("defaults unknown query values to inbox instructions", async () => {
    render(await VerifyPage({ searchParams: Promise.resolve({ status: "unexpected" }) }));

    expect(screen.getByRole("heading", { name: "Verify your email." })).toBeVisible();
    expect(screen.getByRole("status")).toHaveTextContent(
      "If that address can receive Huddle mail, a verification link is on its way.",
    );
  });
});
