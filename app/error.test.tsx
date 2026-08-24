// @vitest-environment jsdom

import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import AppError from "./error";

describe("application error boundary", () => {
  it("shows only a safe digest and resets without exposing the thrown message", () => {
    const reset = vi.fn();
    const unsafeMessage = "SQL policy name and service-role-key must stay private";
    const error = Object.assign(new Error(unsafeMessage), { digest: "safe-digest" });

    render(<AppError error={error} reset={reset} />);

    expect(screen.getByText("Reference: safe-digest")).toBeVisible();
    expect(screen.queryByText(unsafeMessage)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(reset).toHaveBeenCalledOnce();
  });
});
