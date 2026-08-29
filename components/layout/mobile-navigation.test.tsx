// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { MobileNavigation } from "./mobile-navigation";

describe("MobileNavigation", () => {
  it("exposes safety and moderation to a signed-in moderator", async () => {
    const user = userEvent.setup();
    render(<MobileNavigation isModerator isProfileComplete isSignedIn />);

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
    render(<MobileNavigation isModerator={false} isProfileComplete={false} isSignedIn={false} />);

    await user.click(screen.getByRole("button", { name: "Menu" }));

    expect(screen.getByRole("menuitem", { name: "Fixtures" })).toBeVisible();
    expect(screen.getByRole("menuitem", { name: "Sign in" })).toHaveAttribute(
      "href",
      "/auth/sign-in",
    );
    expect(screen.getByRole("menuitem", { name: "Sign up" })).toHaveAttribute(
      "href",
      "/auth/sign-up",
    );
    expect(screen.queryByRole("menuitem", { name: "Safety" })).not.toBeInTheDocument();
    expect(screen.queryByRole("menuitem", { name: "Moderation" })).not.toBeInTheDocument();
  });

  it("directs an incomplete signed-in account only to setup", async () => {
    const user = userEvent.setup();
    render(<MobileNavigation isModerator={false} isProfileComplete={false} isSignedIn />);

    await user.click(screen.getByRole("button", { name: "Menu" }));

    expect(screen.getByRole("menuitem", { name: "Finish setup" })).toHaveAttribute(
      "href",
      "/settings/profile",
    );
    expect(screen.queryByRole("menuitem", { name: "My events" })).not.toBeInTheDocument();
    expect(screen.queryByRole("menuitem", { name: "Host event" })).not.toBeInTheDocument();
  });
});
