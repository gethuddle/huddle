// @vitest-environment jsdom

import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { ShareLinkButton } from "./share-link-button";

describe("ShareLinkButton", () => {
  it("copies a clean page URL without temporary creation state", async () => {
    const user = userEvent.setup();
    const writeText = vi.fn(async () => undefined);
    Object.defineProperty(navigator, "share", { configurable: true, value: undefined });
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });
    window.history.replaceState(
      {},
      "",
      "/events/c1000000-0000-4000-8000-000000000101?created=1#attendance",
    );
    render(<ShareLinkButton label="Share event" title="Match night" />);

    await user.click(screen.getByRole("button", { name: "Share event" }));

    await waitFor(() =>
      expect(writeText).toHaveBeenCalledWith(
        `${window.location.origin}/events/c1000000-0000-4000-8000-000000000101`,
      ),
    );
    expect(screen.getByRole("button", { name: "Link copied" })).toBeVisible();
  });
});
