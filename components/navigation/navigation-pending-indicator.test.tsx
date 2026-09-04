// @vitest-environment jsdom

import { render } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ pending: false }));

vi.mock("next/link", () => ({
  useLinkStatus: () => ({ pending: mocks.pending }),
}));

import { NavigationPendingIndicator } from "./navigation-pending-indicator";

describe("NavigationPendingIndicator", () => {
  beforeEach(() => {
    mocks.pending = false;
  });

  it("shows immediate visual progress only while its parent link is pending", () => {
    const { container, rerender } = render(<NavigationPendingIndicator />);
    const indicator = container.querySelector("[data-pending]");

    expect(indicator).not.toBeNull();
    if (indicator === null) throw new Error("Expected the navigation pending indicator.");
    expect(indicator).toHaveAttribute("data-pending", "false");
    expect(indicator.firstElementChild).not.toHaveClass("animate-spin");

    mocks.pending = true;
    rerender(<NavigationPendingIndicator />);

    expect(indicator).toHaveAttribute("data-pending", "true");
    expect(indicator.firstElementChild).toHaveClass("animate-spin");
  });
});
