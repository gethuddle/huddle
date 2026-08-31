// @vitest-environment jsdom

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { DiscoveryFixturePicker } from "./discovery-fixture-picker";

describe("DiscoveryFixturePicker", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("searches fixtures, selects one, and clears broader match filters", async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            items: [
              {
                id: "52000000-0000-4000-8000-000000000402",
                label: "Arsenal FC vs Liverpool FC — Premier League",
                startsAt: "2026-09-05T14:00:00.000Z",
                sportSlug: "football",
                sportName: "Football",
                competitionName: "Premier League",
              },
            ],
            page: 1,
            hasMore: false,
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
    );
    vi.stubGlobal("fetch", fetchMock);

    render(
      <form>
        <select defaultValue="competition-id" id="discovery-competition">
          <option value="">All competitions</option>
          <option value="competition-id">Premier League</option>
        </select>
        <select defaultValue="team-id" id="discovery-team">
          <option value="">All teams</option>
          <option value="team-id">Arsenal</option>
        </select>
        <DiscoveryFixturePicker
          currentId={null}
          currentLabel={null}
          from="2026-09-01"
          to="2026-09-14"
        />
      </form>,
    );

    fireEvent.change(screen.getByRole("searchbox", { name: /specific fixture/i }), {
      target: { value: "Arsenal" },
    });
    fireEvent.click(screen.getByRole("button", { name: /find fixtures/i }));

    await screen.findByRole("button", { name: /Arsenal FC vs Liverpool FC/i });
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/matches/options?q=Arsenal&from=2026-09-01&to=2026-09-14",
      expect.objectContaining({ credentials: "same-origin" }),
    );

    fireEvent.click(screen.getByRole("button", { name: /Arsenal FC vs Liverpool FC/i }));

    expect(screen.getByDisplayValue("52000000-0000-4000-8000-000000000402")).toHaveAttribute(
      "name",
      "match",
    );
    expect(screen.getByLabelText("Selected fixture")).toHaveTextContent(
      "Arsenal FC vs Liverpool FC",
    );
    expect((document.querySelector("#discovery-team") as HTMLSelectElement).value).toBe("");
    expect((document.querySelector("#discovery-competition") as HTMLSelectElement).value).toBe("");

    fireEvent.click(screen.getByRole("button", { name: /clear fixture/i }));
    await waitFor(() =>
      expect(screen.queryByLabelText("Selected fixture")).not.toBeInTheDocument(),
    );
    expect(screen.getByDisplayValue("")).toHaveAttribute("name", "match");
  });

  it("explains a failed search without losing the query", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(null, { status: 503 })),
    );
    render(
      <DiscoveryFixturePicker
        currentId={null}
        currentLabel={null}
        from="2026-09-01"
        to="2026-09-14"
      />,
    );

    fireEvent.change(screen.getByRole("searchbox", { name: /specific fixture/i }), {
      target: { value: "Arsenal" },
    });
    fireEvent.click(screen.getByRole("button", { name: /find fixtures/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/could not search fixtures/i);
    expect(screen.getByRole("searchbox", { name: /specific fixture/i })).toHaveValue("Arsenal");
  });
});
