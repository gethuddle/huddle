// @vitest-environment jsdom

import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { AppShell } from "./app-shell";

describe("AppShell", () => {
  it("provides navigation, main-content access, and a truthful footer placeholder", () => {
    render(
      <AppShell>
        <h1>Page content</h1>
      </AppShell>,
    );

    expect(screen.getByRole("link", { name: "Skip to content" })).toHaveAttribute(
      "href",
      "#main-content",
    );
    expect(
      within(screen.getByRole("navigation", { name: "Primary navigation" })).getByRole("link", {
        name: "Home",
      }),
    ).toHaveAttribute("href", "/");
    expect(
      within(screen.getByRole("main")).getByRole("heading", { name: "Page content" }),
    ).toBeVisible();
    expect(
      screen.getByText("Sports-data attribution will appear here when synchronization begins."),
    ).toBeVisible();
  });
});
