// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { GroupSearchFilters } from "./group-search-filters";

describe("GroupSearchFilters", () => {
  it("searches global communities without presenting city as an eligibility filter", () => {
    render(
      <GroupSearchFilters
        catalog={{
          cities: [{ id: "50000000-0000-4000-8000-000000000101", name: "Haifa", slug: "haifa" }],
          competitions: [],
          teams: [],
        }}
        filters={{ query: null, citySlug: null, teamId: null, cursor: null, limit: 20 }}
      />,
    );

    expect(screen.getByRole("searchbox", { name: "Group name" })).toBeVisible();
    expect(screen.queryByRole("combobox", { name: "City" })).not.toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Team" })).toBeVisible();
  });
});
