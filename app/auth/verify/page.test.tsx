// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import VerifyPage from "./page";

describe("verification result page", () => {
  it("renders the successful local verification state", async () => {
    render(await VerifyPage({ searchParams: Promise.resolve({ status: "success" }) }));

    expect(screen.getByRole("heading", { name: "You’re in." })).toBeVisible();
    expect(screen.getByRole("link", { name: "Complete your profile" })).toHaveAttribute(
      "href",
      "/settings/profile",
    );
  });

  it("renders a safe expired state for invalid status input", async () => {
    render(await VerifyPage({ searchParams: Promise.resolve({ status: "expired" }) }));

    expect(screen.getByRole("alert")).toHaveTextContent(
      "invalid, expired, or has already been used",
    );
    expect(screen.getByRole("link", { name: "Create an account" })).toHaveAttribute(
      "href",
      "/auth/sign-up",
    );
  });

  it("defaults unknown query values to inbox instructions", async () => {
    render(await VerifyPage({ searchParams: Promise.resolve({ status: "unexpected" }) }));

    expect(screen.getByRole("heading", { name: "Verify your email." })).toBeVisible();
  });
});
