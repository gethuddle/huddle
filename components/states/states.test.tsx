// @vitest-environment jsdom

import { fireEvent, render, screen } from "@testing-library/react";
import Link from "next/link";
import { describe, expect, it, vi } from "vitest";

import { EmptyState } from "./empty-state";
import { ErrorState } from "./error-state";

describe("shared application states", () => {
  it("renders an empty state with an optional action", () => {
    render(
      <EmptyState
        action={<Link href="/">Return home</Link>}
        description="There are no results for this view."
        title="No events found"
      />,
    );

    expect(screen.getByRole("heading", { name: "No events found" })).toBeVisible();
    expect(screen.getByRole("link", { name: "Return home" })).toHaveAttribute("href", "/");
  });

  it("renders an alert and invokes its retry action", () => {
    const onRetry = vi.fn();

    render(
      <ErrorState
        description="The request could not be completed."
        onRetry={onRetry}
        reference="safe-request-reference"
        title="Something went wrong"
      />,
    );

    expect(screen.getByRole("alert")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(onRetry).toHaveBeenCalledOnce();
  });
});
