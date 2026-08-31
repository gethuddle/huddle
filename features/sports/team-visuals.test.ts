import { describe, expect, it, vi } from "vitest";

import { loadTeamVisualsByName } from "./team-visuals";

describe("loadTeamVisualsByName", () => {
  it("loads one canonical crest record for each requested team name", async () => {
    const query: Record<string, ReturnType<typeof vi.fn>> = {};
    query.select = vi.fn(() => query);
    query.in = vi.fn(() => query);
    query.eq = vi.fn().mockResolvedValue({
      data: [
        {
          name: "Arsenal FC",
          tla: "ARS",
          crest_url: "https://crests.football-data.org/57.png",
        },
        { name: "Fallback United", tla: null, crest_url: null },
      ],
      error: null,
    });
    const client = { from: vi.fn(() => query) };

    const visuals = await loadTeamVisualsByName(client as never, [
      "Arsenal FC",
      "Fallback United",
      "Arsenal FC",
    ]);

    expect(client.from).toHaveBeenCalledWith("teams");
    expect(query.in).toHaveBeenCalledWith("name", ["Arsenal FC", "Fallback United"]);
    expect(visuals.get("Arsenal FC")).toEqual({
      tla: "ARS",
      crestUrl: "https://crests.football-data.org/57.png",
    });
    expect(visuals.get("Fallback United")).toEqual({ tla: null, crestUrl: null });
  });

  it("does not query when there are no team names", async () => {
    const client = { from: vi.fn() };

    await expect(loadTeamVisualsByName(client as never, [])).resolves.toEqual(new Map());
    expect(client.from).not.toHaveBeenCalled();
  });
});
