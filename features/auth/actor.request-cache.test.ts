import { beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
  getUser: vi.fn(),
  maybeSingle: vi.fn(),
  rpc: vi.fn(),
}));

vi.mock("react", () => ({
  cache: <Arguments extends readonly unknown[], Result>(
    operation: (...arguments_: Arguments) => Result,
  ) => {
    const results = new Map<string, Result>();
    return (...arguments_: Arguments) => {
      const key = JSON.stringify(arguments_);
      if (!results.has(key)) results.set(key, operation(...arguments_));
      return results.get(key) as Result;
    };
  },
}));
vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.createClient }));

import { requireActor } from "./actor";

const fanId = "10000000-0000-4000-8000-000000000001";
const venueId = "20000000-0000-4000-8000-000000000001";
const profile = {
  id: fanId,
  handle: "fan_one",
  display_name: "Fan One",
  adult_attested_at: "2026-08-25T00:00:00Z",
  rules_version: 1,
  rules_accepted_at: "2026-08-25T00:00:00Z",
  profile_completed_at: "2026-08-25T00:00:00Z",
  fan_enabled_at: "2026-08-30T00:00:00Z",
  suspended_at: null,
  suspension_expires_at: null,
  community_restricted_at: null,
  community_restricted_until: null,
};

beforeEach(() => {
  vi.clearAllMocks();
});

it("resolves one Fan actor context for repeated reads in the same server render", async () => {
  mocks.getUser.mockResolvedValue({
    data: { user: { id: fanId, email_confirmed_at: "2026-08-25T00:00:00Z" } },
    error: null,
  });
  mocks.maybeSingle.mockResolvedValue({ data: profile, error: null });
  const client = {
    auth: { getUser: mocks.getUser },
    from: vi.fn(() => ({
      select: vi.fn(() => ({ eq: vi.fn(() => ({ maybeSingle: mocks.maybeSingle })) })),
    })),
    rpc: mocks.rpc,
  };
  mocks.createClient.mockResolvedValue(client);

  const actors = await Promise.all([
    requireActor("fan"),
    requireActor("fan"),
    requireActor("fan"),
    requireActor("fan"),
    requireActor("fan"),
  ]);

  expect(actors.every((actor) => actor === actors[0])).toBe(true);
  expect(mocks.createClient).toHaveBeenCalledOnce();
  expect(mocks.getUser).toHaveBeenCalledOnce();
  expect(mocks.maybeSingle).toHaveBeenCalledOnce();
});

it("uses a stable venue key while preserving the concrete membership check", async () => {
  mocks.getUser.mockResolvedValue({
    data: { user: { id: fanId, email_confirmed_at: "2026-08-25T00:00:00Z" } },
    error: null,
  });
  mocks.maybeSingle.mockResolvedValue({ data: profile, error: null });
  mocks.rpc.mockResolvedValue({
    data: [
      {
        workspace_kind: "venue",
        workspace_id: venueId,
        slug: "match-corner",
        name: "Match Corner",
        role: "owner",
      },
    ],
    error: null,
  });
  mocks.createClient.mockResolvedValue({
    auth: { getUser: mocks.getUser },
    from: vi.fn(() => ({
      select: vi.fn(() => ({ eq: vi.fn(() => ({ maybeSingle: mocks.maybeSingle })) })),
    })),
    rpc: mocks.rpc,
  });

  await Promise.all([
    requireActor({ venueId }),
    requireActor({ venueId }),
    requireActor({ venueId }),
  ]);

  expect(mocks.createClient).toHaveBeenCalledOnce();
  expect(mocks.rpc).toHaveBeenCalledOnce();
  expect(mocks.rpc).toHaveBeenCalledWith("list_my_workspaces");
});
