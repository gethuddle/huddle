// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import type { FixtureFilters } from "@/features/sports/browse-schemas";

import { FixturePagination } from "./fixture-pagination";

const filters: FixtureFilters = {
  competitionId: undefined,
  date: undefined,
  page: 1,
  teamId: undefined,
};

describe("FixturePagination", () => {
  it("shows every page in a five-page fixture catalog", () => {
    render(<FixturePagination filters={filters} totalPages={5} />);

    expect(screen.getByRole("link", { name: "Page 1, current page" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    for (const page of [2, 3, 4, 5]) {
      expect(screen.getByRole("link", { name: `Go to page ${page}` })).toHaveAttribute(
        "href",
        `/matches?page=${page}`,
      );
    }
    expect(screen.queryByText("More pages")).not.toBeInTheDocument();
  });

  it("marks omitted ranges and preserves filters in links", () => {
    render(
      <FixturePagination
        filters={{
          ...filters,
          competitionId: "10000000-0000-4000-8000-000000000003",
          page: 5,
        }}
        totalPages={10}
      />,
    );

    expect(screen.getAllByText("More pages")).toHaveLength(2);
    expect(screen.getByRole("link", { name: "Page 5, current page" })).toHaveAttribute(
      "href",
      "/matches?competition=10000000-0000-4000-8000-000000000003&page=5",
    );
    expect(screen.getByRole("link", { name: "Go to page 10" })).toHaveAttribute(
      "href",
      "/matches?competition=10000000-0000-4000-8000-000000000003&page=10",
    );
  });

  it("keeps boundary controls stable and disables only the unavailable direction", () => {
    const { rerender } = render(<FixturePagination filters={filters} totalPages={5} />);

    expect(screen.getByLabelText("Go to previous page")).toHaveAttribute("aria-disabled", "true");
    expect(screen.getByLabelText("Go to previous page")).not.toHaveAttribute("href");
    expect(screen.getByLabelText("Go to next page")).toHaveAttribute("href", "/matches?page=2");

    rerender(<FixturePagination filters={{ ...filters, page: 5 }} totalPages={5} />);

    expect(screen.getByLabelText("Go to previous page")).toHaveAttribute("href", "/matches?page=4");
    expect(screen.getByLabelText("Go to next page")).toHaveAttribute("aria-disabled", "true");
    expect(screen.getByLabelText("Go to next page")).not.toHaveAttribute("href");
  });
});
