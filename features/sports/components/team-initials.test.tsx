// @vitest-environment jsdom

import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { TeamInitials, teamInitials } from "./team-initials";

describe("TeamInitials", () => {
  it("renders a repository-owned accessible team mark from the supplied TLA", () => {
    render(<TeamInitials name="Arsenal FC" tla="ARS" />);

    expect(screen.getByLabelText("Arsenal FC")).toHaveTextContent("ARS");
  });

  it("derives useful initials without provider artwork", () => {
    expect(teamInitials("Ipswich Town FC", null)).toBe("IT");
    expect(teamInitials("AFC Bournemouth", null)).toBe("BOU");
  });

  it("renders a synchronized crest and falls back to initials when it cannot load", () => {
    const { rerender } = render(
      <TeamInitials
        crestUrl="https://crests.football-data.org/57.png"
        name="Arsenal FC"
        tla="ARS"
      />,
    );

    const crest = screen.getByRole("img", { name: "Arsenal FC" });
    expect(crest).toHaveAttribute("src", expect.stringContaining("crests.football-data.org"));
    fireEvent.error(crest);
    expect(screen.getByRole("img", { name: "Arsenal FC" })).toHaveTextContent("ARS");

    rerender(
      <TeamInitials
        crestUrl="https://crests.football-data.org/64.png"
        name="Liverpool FC"
        tla="LIV"
      />,
    );
    expect(screen.getByRole("img", { name: "Liverpool FC" })).toHaveAttribute(
      "src",
      expect.stringContaining("64.png"),
    );
  });
});
