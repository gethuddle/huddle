// @vitest-environment jsdom

import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { FixtureCombobox } from "./fixture-combobox";

const lateMatchId = "60000000-0000-4000-8000-000000000999";

describe("Fixture picker local catalog search", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("can select a locally synced fixture beyond the 250th bootstrap row", async () => {
    const initialMatches = Array.from({ length: 250 }, (_, index) => ({
      id: `60000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
      label: `Early fixture ${index + 1} — Test League`,
      startsAt: "2026-09-01T17:00:00Z",
    }));
    const onValueChange = vi.fn();
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          items: [
            {
              id: lateMatchId,
              label: "Late Horizon FC vs Final Round FC — Test League",
              startsAt: "2027-05-30T17:00:00Z",
            },
          ],
          page: 1,
          hasMore: false,
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();

    render(
      <FixtureCombobox
        initialHasMore
        matches={initialMatches}
        onValueChange={onValueChange}
        value=""
      />,
    );

    expect(screen.getByLabelText("Fixture date")).toHaveAttribute("type", "date");
    expect(screen.queryByLabelText("Kickoff date")).not.toBeInTheDocument();
    expect(screen.queryByRole("combobox", { name: "Find a fixture" })).not.toBeInTheDocument();
    await user.type(screen.getByRole("searchbox", { name: "Search fixtures" }), "Late Horizon");
    await user.click(
      await screen.findByRole("button", {
        name: /Late Horizon FC vs Final Round FC — Test League/,
      }),
    );

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/api/matches/options?q=Late+Horizon"),
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
    expect(onValueChange).toHaveBeenCalledWith({
      id: lateMatchId,
      label: "Late Horizon FC vs Final Round FC — Test League",
      startsAt: "2027-05-30T17:00:00Z",
    });
  });

  it("pages through a broad local result without replacing the selected option", async () => {
    const selected = {
      id: lateMatchId,
      label: "Restored late fixture — Test League",
      startsAt: "2027-05-30T17:00:00Z",
    };
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          items: [
            {
              id: "60000000-0000-4000-8000-000000000998",
              label: "Another late fixture — Test League",
              startsAt: "2027-05-31T17:00:00Z",
            },
          ],
          page: 2,
          hasMore: false,
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();

    render(
      <FixtureCombobox
        initialHasMore
        matches={[selected]}
        onValueChange={vi.fn()}
        value={lateMatchId}
      />,
    );

    expect(screen.getByRole("button", { name: new RegExp(selected.label) })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await user.click(screen.getByRole("button", { name: "Show more fixtures" }));
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining("page=2"),
        expect.objectContaining({ signal: undefined }),
      ),
    );
    expect(screen.getByRole("button", { name: new RegExp(selected.label) })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  it("shows a bounded chronological list with useful filters instead of dumping the schedule into a dropdown", async () => {
    const user = userEvent.setup();
    const matches = Array.from({ length: 30 }, (_, index) => ({
      id: `60000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
      label: `Fixture ${index + 1} — Test League`,
      startsAt: `2026-09-${String(index + 1).padStart(2, "0")}T17:00:00Z`,
    }));
    render(<FixtureCombobox matches={matches} onValueChange={vi.fn()} value="" />);

    expect(screen.getByRole("button", { name: "Any date" })).toBeVisible();
    expect(screen.getByRole("button", { name: "This weekend" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Next 7 days" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByRole("combobox", { name: "Sport" })).toBeVisible();
    expect(screen.getByRole("combobox", { name: "Competition" })).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Any date" }));
    expect(screen.getByRole("button", { name: "Show more fixtures" })).toBeVisible();
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });

  it("searches the catalog by an explicit fixture date without changing kickoff metadata", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ items: [], page: 1, hasMore: false }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();

    render(
      <FixtureCombobox
        matches={[
          {
            id: lateMatchId,
            label: "Late Horizon FC vs Final Round FC — Test League",
            startsAt: "2027-05-30T17:00:00Z",
          },
        ]}
        onValueChange={vi.fn()}
        value=""
      />,
    );

    await user.type(screen.getByLabelText("Fixture date"), "2027-05-30");
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining("date=2027-05-30"),
        expect.objectContaining({ signal: expect.any(AbortSignal) }),
      ),
    );
    expect(screen.getByText(/Kickoff is fixed by the fixture/i)).toBeVisible();
  });
});
