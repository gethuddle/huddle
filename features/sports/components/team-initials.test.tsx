// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
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
});
