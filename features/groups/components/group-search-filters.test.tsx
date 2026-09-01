// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { GroupSearchFilters } from "./group-search-filters";

describe("GroupSearchFilters", () => {
  it("searches global communities without presenting city as an eligibility filter", () => {
    render(
      <GroupSearchFilters
        catalog={{
          competitions: [],
          teams: [],
        }}
        filters={{ query: null, teamId: null, cursor: null, limit: 20 }}
      />,
    );

    expect(screen.getByRole("searchbox", { name: "Group name" })).toBeVisible();
    expect(screen.queryByRole("combobox", { name: "City" })).not.toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Team" })).toBeVisible();
  });
});
