// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { ContextBackLink, safeExploreReturnTo } from "./context-back-link";

describe("ContextBackLink", () => {
  it("preserves an allowlisted Explore search", () => {
    const returnTo = "/discover?city=haifa&from=2026-08-31";
    render(<ContextBackLink fallbackHref="/discover" returnTo={returnTo} />);

    expect(screen.getByRole("link", { name: "Back to Explore" })).toHaveAttribute("href", returnTo);
  });

  it.each([
    "https://attacker.example/discover",
    "//attacker.example/discover",
    "/account",
    "/discoverer",
  ])("rejects an unsafe return destination: %s", (returnTo) => {
    expect(safeExploreReturnTo(returnTo)).toBeNull();
  });
});
