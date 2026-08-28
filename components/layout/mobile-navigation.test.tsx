// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { MobileNavigation } from "./mobile-navigation";

describe("MobileNavigation", () => {
  it("exposes safety and moderation to a signed-in moderator", async () => {
    const user = userEvent.setup();
    render(<MobileNavigation isModerator isSignedIn />);

    const trigger = screen.getByRole("button", { name: "Menu" });
    await user.click(trigger);

    expect(screen.getByRole("menu", { name: "Menu" })).toBeVisible();
    expect(screen.getByRole("menuitem", { name: "Safety" })).toHaveAttribute("href", "/reports");
    expect(screen.getByRole("menuitem", { name: "Moderation" })).toHaveAttribute(
      "href",
      "/moderation",
    );

    await user.keyboard("{Escape}");
    expect(screen.queryByRole("menu", { name: "Menu" })).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });

  it("does not expose private navigation to an anonymous visitor", async () => {
    const user = userEvent.setup();
    render(<MobileNavigation isModerator={false} isSignedIn={false} />);

    await user.click(screen.getByRole("button", { name: "Menu" }));

    expect(screen.getByRole("menuitem", { name: "Fixtures" })).toBeVisible();
    expect(screen.queryByRole("menuitem", { name: "Safety" })).not.toBeInTheDocument();
    expect(screen.queryByRole("menuitem", { name: "Moderation" })).not.toBeInTheDocument();
  });
});
