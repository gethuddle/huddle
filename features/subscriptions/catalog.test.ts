import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createAnonymousServerClient: vi.fn(),
  ilike: vi.fn(),
  or: vi.fn(),
}));

vi.mock("@/lib/supabase/anonymous", () => ({
  createAnonymousServerClient: mocks.createAnonymousServerClient,
}));

import { getInterestCatalog } from "./catalog";

describe("getInterestCatalog", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.createAnonymousServerClient.mockReturnValue({
      from(table: string) {
        const query = {
          select: () => query,
          eq: () => query,
          ilike: (...args: unknown[]) => {
            mocks.ilike(table, ...args);
            return query;
          },
          or: (...args: unknown[]) => {
            mocks.or(table, ...args);
            return query;
          },
          order: () => query,
          limit: () =>
            Promise.resolve({
              data:
                table === "teams"
                  ? [
                      {
                        id: "10000000-0000-4000-8000-000000000101",
                        name: "Late Horizon FC",
                        short_name: "Horizon",
                        tla: "LHF",
                        crest_url: null,
                        sport_id: "10000000-0000-4000-8000-000000000001",
                      },
                    ]
                  : [],
              error: null,
            }),
        };
        return query;
      },
    });
  });

  it.each([
    ["Late Horizon", "%Late Horizon%"],
    ["MUN", "%MUN%"],
    ["PSG", "%PSG%"],
    ["LHF", "%LHF%"],
  ])(
    "searches full, short, and three-letter team names server-side for %s",
    async (search, pattern) => {
      const catalog = await getInterestCatalog(search);

      expect(mocks.or).toHaveBeenCalledWith(
        "teams",
        `name.ilike.\"${pattern}\",short_name.ilike.\"${pattern}\",tla.ilike.\"${pattern}\"`,
      );
      expect(catalog.teams).toMatchObject([{ name: "Late Horizon FC", shortName: "Horizon" }]);
    },
  );

  it("escapes wildcard and PostgREST syntax characters before building the multi-column search", async () => {
    await getInterestCatalog('MUN%_"),tla.eq.injected');

    expect(mocks.or).toHaveBeenCalledWith(
      "teams",
      'name.ilike."%MUN\\%\\_\\\"),tla.eq.injected%",short_name.ilike."%MUN\\%\\_\\\"),tla.eq.injected%",tla.ilike."%MUN\\%\\_\\\"),tla.eq.injected%"',
    );
  });
});
