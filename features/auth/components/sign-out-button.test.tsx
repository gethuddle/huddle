// @vitest-environment jsdom

import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { SignOutButton } from "./sign-out-button";

describe("SignOutButton", () => {
  it("renders its accessible label as visible text at every viewport", () => {
    render(<SignOutButton className="w-full" />);

    const button = screen.getByRole("button", { name: "Sign out" });
    const label = within(button).getByText("Sign out");

    expect(button).toBeVisible();
    expect(button).toHaveAttribute("data-variant", "outline");
    expect(button).toHaveClass("w-full");
    expect(label).not.toHaveClass("sr-only");
  });
});
