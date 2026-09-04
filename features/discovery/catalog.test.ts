import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createAnonymousServerClient: vi.fn(),
  from: vi.fn(),
  unstableCache: vi.fn(),
}));

vi.mock("next/cache", () => ({
  unstable_cache: mocks.unstableCache,
}));

vi.mock("@/lib/supabase/anonymous", () => ({
  createAnonymousServerClient: mocks.createAnonymousServerClient,
}));

vi.mock("@/lib/env/public", () => ({
  getPublicEnvironment: () => ({
    NEXT_PUBLIC_SUPABASE_URL: "https://preview-project.supabase.co",
  }),
}));

function setCatalogResults(options: Readonly<{ competitionError?: Error }> = {}) {
  mocks.from.mockImplementation((table: string) => {
    const query = {
      select: () => query,
      eq: () => query,
      order: () => query,
      limit: () =>
        Promise.resolve(
          table === "competitions"
            ? {
                data: [
                  {
                    id: "10000000-0000-4000-8000-000000000101",
                    name: "Premier League",
                    code: "PL",
                  },
                ],
                error: options.competitionError ?? null,
              }
            : {
                data: [
                  {
                    id: "10000000-0000-4000-8000-000000000201",
                    name: "Arsenal FC",
                    short_name: "Arsenal",
                  },
                ],
                error: null,
              },
        ),
    };
    return query;
  });
  mocks.createAnonymousServerClient.mockReturnValue({ from: mocks.from });
}

describe("getDiscoveryCatalog", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    mocks.unstableCache.mockImplementation(
      (load: (...arguments_: unknown[]) => Promise<unknown>) => {
        let cached: Promise<unknown> | undefined;
        return (...arguments_: unknown[]) => {
          cached ??= load(...arguments_);
          return cached;
        };
      },
    );
    setCatalogResults();
  });

  it("reuses one mapped public catalog read for the six-hour sync interval", async () => {
    const { getDiscoveryCatalog } = await import("./catalog");

    const first = await getDiscoveryCatalog();
    const second = await getDiscoveryCatalog();

    expect(first).toEqual({
      competitions: [
        {
          id: "10000000-0000-4000-8000-000000000101",
          name: "Premier League",
          code: "PL",
        },
      ],
      teams: [
        {
          id: "10000000-0000-4000-8000-000000000201",
          name: "Arsenal FC",
          shortName: "Arsenal",
        },
      ],
    });
    expect(second).toEqual(first);
    expect(mocks.createAnonymousServerClient).toHaveBeenCalledOnce();
    expect(mocks.from).toHaveBeenCalledTimes(2);
    expect(mocks.unstableCache).toHaveBeenCalledWith(
      expect.any(Function),
      ["discovery-sports-catalog-v1", "https://preview-project.supabase.co"],
      { revalidate: 21_600, tags: ["sports-catalog:preview-project.supabase.co"] },
    );
  });

  it("preserves database failures instead of caching an incomplete catalog", async () => {
    setCatalogResults({ competitionError: new Error("catalog unavailable") });
    const { getDiscoveryCatalog } = await import("./catalog");

    await expect(getDiscoveryCatalog()).rejects.toMatchObject({ code: "INTERNAL_ERROR" });
  });
});
